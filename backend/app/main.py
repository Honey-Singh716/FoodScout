import os
from datetime import timedelta
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.place_details import get_place_details
from app.geography import area_cell, geo_cell, normalize_city
from app.normalization import normalize_discovery_result, normalize_discovery_results
from app.restaurant_cache import CacheKey, CacheEntry, RestaurantCache
from app.schemas import RestaurantDetails, RestaurantResultsResponse
from app.serpapi import API_KEY, get_serpapi_request_counts, serpapi_search

load_dotenv()

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="FoodScout API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

TYPE_QUERIES = {
    "restaurant": "restaurants",
    "cafe": "cafes",
    "bakery": "bakeries",
    "meal_takeaway": "takeaway restaurants",
    "all": "restaurants cafes bakeries",
}
INITIAL_SEARCH_COVERAGE_RADIUS_KM = float(os.getenv("INITIAL_SEARCH_COVERAGE_RADIUS_KM", "10"))
DEBUG_COUNTER_ENABLED = os.getenv("FOODSCOUT_DEBUG_COUNTER", "").lower() == "true"
try:
    DISCOVERY_CACHE_TTL_MINUTES = float(os.getenv("RESTAURANT_DISCOVERY_CACHE_TTL_MINUTES", "30"))
except ValueError:
    DISCOVERY_CACHE_TTL_MINUTES = 30
restaurant_cache = RestaurantCache(
    refresh_after=timedelta(minutes=DISCOVERY_CACHE_TTL_MINUTES),
    max_age=timedelta(minutes=DISCOVERY_CACHE_TTL_MINUTES),
)
# Kept as a compatibility alias for callers that used the old module-level helper.
normalize_result = normalize_discovery_result


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "provider": "serpapi", "key_configured": bool(API_KEY)}


@app.get("/api/v1/debug/serpapi-requests")
async def serpapi_request_count():
    if not DEBUG_COUNTER_ENABLED:
        raise HTTPException(status_code=404, detail="Debug counters are disabled.")
    counts = get_serpapi_request_counts()
    return {"outbound_serpapi_requests": sum(counts.values()), "by_kind": counts}


@app.get("/api/v1/debug/cache-metrics")
async def cache_metrics():
    if not DEBUG_COUNTER_ENABLED:
        raise HTTPException(status_code=404, detail="Debug counters are disabled.")
    return {
        "discovery": restaurant_cache.metrics(),
        "serpapi": get_serpapi_request_counts(),
    }


async def _get_nearby_cached(
    *,
    lat: float,
    lng: float,
    display_radius_km: float,
    place_type: str,
    cuisine: str = "",
    city: str | None = None,
) -> tuple[CacheEntry, bool]:
    query = " ".join(part for part in (TYPE_QUERIES[place_type], cuisine.strip()) if part)
    coverage_radius_km = max(INITIAL_SEARCH_COVERAGE_RADIUS_KM, display_radius_km)
    cell = geo_cell(lat, lng)
    city_id = normalize_city(city) if city else f"geo-{geo_cell(lat, lng, precision=1)}"
    key = CacheKey.create(
        lat, lng, coverage_radius_km, query, place_type,
        city_id=city_id, cell=cell, cuisine=cuisine,
    )
    reusable = restaurant_cache.find_reusable(
        lat=lat,
        lng=lng,
        display_radius_km=display_radius_km,
        query=query,
        category=place_type,
        city_id=city_id,
    )
    now = restaurant_cache.now()
    if reusable is not None and not reusable.is_refresh_eligible(now):
        restaurant_cache.record_request(hit=True)
        return reusable, False
    restaurant_cache.record_request(hit=False)

    async def load() -> list[dict[str, Any]]:
        payload = await serpapi_search({
            "type": "search",
            "q": query,
            "ll": f"@{lat},{lng},14z",
            "start": 0,
        })
        if not isinstance(payload.get("local_results"), list):
            raise HTTPException(status_code=502, detail="SerpApi returned an invalid discovery response.")
        return normalize_discovery_results(payload)

    return await restaurant_cache.fetch(
        key,
        load,
        center_lat=lat,
        center_lng=lng,
        coverage_radius_km=coverage_radius_km,
        query=query,
        category=place_type,
        stale_entry=reusable,
    )


async def _get_area_cached(
    *,
    query: str,
    place_type: str,
    cuisine: str = "",
) -> tuple[CacheEntry, bool]:
    normalized_query = " ".join(query.strip().split())
    city_id = normalize_city(normalized_query)
    cell = area_cell(city_id)
    provider_query = " ".join(part for part in (TYPE_QUERIES[place_type], cuisine.strip()) if part)
    cache_query = " ".join(part for part in (normalized_query, cuisine.strip()) if part)
    reusable = restaurant_cache.find_latest(
        query=cache_query,
        category=place_type,
        city_id=city_id,
        cell=cell,
    )
    now = restaurant_cache.now()
    if reusable is not None and not reusable.is_refresh_eligible(now):
        restaurant_cache.record_request(hit=True)
        return reusable, False
    restaurant_cache.record_request(hit=False)

    coverage_radius_km = INITIAL_SEARCH_COVERAGE_RADIUS_KM
    center_lat = reusable.center_lat if reusable else 0
    center_lng = reusable.center_lng if reusable else 0
    key = CacheKey.create(
        0, 0, coverage_radius_km, cache_query, place_type,
        city_id=city_id, cell=cell, cuisine=cuisine,
    )

    async def load() -> list[dict[str, Any]]:
        payload = await serpapi_search({
            "type": "search",
            "q": f"{provider_query} in {normalized_query}",
            "start": 0,
        })
        if not isinstance(payload.get("local_results"), list):
            raise HTTPException(status_code=502, detail="SerpApi returned an invalid discovery response.")
        return normalize_discovery_results(payload)

    entry, served_stale = await restaurant_cache.fetch(
        key,
        load,
        center_lat=center_lat,
        center_lng=center_lng,
        coverage_radius_km=coverage_radius_km,
        query=cache_query,
        category=place_type,
        stale_entry=reusable,
    )
    if entry.results and (reusable is None or served_stale is False):
        first = entry.results[0]
        entry.center_lat = first["lat"]
        entry.center_lng = first["lng"]
    return entry, served_stale


@app.get("/api/v1/restaurants/nearby", response_model=RestaurantResultsResponse)
async def nearby_restaurants(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(3, ge=1, le=10),
    place_type: str = Query("restaurant", alias="type"),
    cuisine: str = Query("", max_length=80),
    city: str | None = Query(None, max_length=120),
):
    place_type_value = place_type if isinstance(place_type, str) else "restaurant"
    radius_value = radius_km if isinstance(radius_km, (int, float)) else 3
    if place_type_value not in TYPE_QUERIES:
        raise HTTPException(status_code=400, detail="Unsupported place type.")
    cuisine_value = cuisine if isinstance(cuisine, str) else ""
    city_value = city if isinstance(city, str) else None

    entry, served_stale = await _get_nearby_cached(
        lat=lat,
        lng=lng,
        display_radius_km=radius_value,
        place_type=place_type_value,
        cuisine=cuisine_value,
        city=city_value,
    )
    return {
        "results": entry.results,
        "provider": "serpapi",
        "cache": {**entry.metadata(), "served_stale": served_stale},
    }


@app.get("/api/v1/restaurants/search", response_model=RestaurantResultsResponse)
async def search_restaurants(
    q: str = Query(..., min_length=2, max_length=120),
    place_type: str = Query("restaurant", alias="type"),
    cuisine: str = Query("", max_length=80),
):
    place_type_value = place_type if isinstance(place_type, str) else "restaurant"
    if place_type_value not in TYPE_QUERIES:
        raise HTTPException(status_code=400, detail="Unsupported place type.")
    cuisine_value = cuisine if isinstance(cuisine, str) else ""
    entry, served_stale = await _get_area_cached(query=q, place_type=place_type_value, cuisine=cuisine_value)
    return {
        "results": entry.results,
        "provider": "serpapi",
        "cache": {**entry.metadata(), "served_stale": served_stale},
    }


@app.get("/api/v1/restaurants/{place_id}", response_model=RestaurantDetails)
async def restaurant_details(place_id: str):
    return await get_place_details(place_id)
