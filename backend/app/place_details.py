import os
import re
from datetime import timedelta
from typing import Any
from urllib.parse import quote_plus

from fastapi import HTTPException

from app import serpapi
from app.normalization import clean_text, http_url, number, photos, review_count
from app.restaurant_details_cache import RestaurantDetailsCache
from app.schemas import RestaurantDetails

PLACE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,256}$")
DATA_ID_RE = re.compile(r"^0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)$")
DATA_CID_RE = re.compile(r"^\d{10,}$")
_NOT_FOUND_MARKERS = (
    "hasn't returned any results",
    "has not returned any results",
    "google hasn't returned any results",
    "place not found",
)


try:
    DETAILS_CACHE_TTL_MINUTES = float(os.getenv("RESTAURANT_DETAILS_CACHE_TTL_MINUTES", "15"))
except ValueError:
    DETAILS_CACHE_TTL_MINUTES = 15
details_cache = RestaurantDetailsCache(ttl=timedelta(minutes=DETAILS_CACHE_TTL_MINUTES))
def reset_place_detail_state() -> None:
    details_cache.invalidate()


def provider_params_for_place(place_id: str) -> dict[str, str]:
    value = place_id.strip()
    data_match = DATA_ID_RE.fullmatch(value)
    if data_match:
        return {"data_cid": str(int(data_match.group(1), 16))}
    if DATA_CID_RE.fullmatch(value):
        return {"data_cid": value}
    if PLACE_ID_RE.fullmatch(value):
        return {"place_id": value}
    raise HTTPException(
        status_code=400,
        detail="Invalid place id. Restaurant details are unavailable for this id.",
    )


def _categories(place: dict[str, Any]) -> list[str]:
    raw = place.get("type")
    if raw is None:
        raw = place.get("types")
    if isinstance(raw, str):
        text = clean_text(raw, 80)
        return [text] if text else []
    if isinstance(raw, list):
        values = []
        for item in raw:
            text = clean_text(str(item), 80) if item is not None else None
            if text and text not in values:
                values.append(text)
        return values
    return []


def _opening_hours(raw: Any) -> list[dict[str, str]]:
    hours: list[dict[str, str]] = []

    def add(day: str, value: Any) -> None:
        text = clean_text(str(value), 120) if value is not None else None
        if not text:
            return
        label = day[:1].upper() + day[1:] if day else ""
        hours.append({"day": label, "hours": text})

    if isinstance(raw, dict):
        for day, value in raw.items():
            add(str(day), value)
        return hours
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict):
                for day, value in entry.items():
                    add(str(day), value)
            elif isinstance(entry, str):
                add("", entry)
    return hours


def _directions_url(place: dict[str, Any], name: str | None, address: str | None, lat: float | None, lng: float | None) -> str | None:
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
    label = ", ".join(part for part in (name, address) if part)
    if not label:
        return None
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(label)


def _phone(value: Any) -> str | None:
    text = clean_text(value, 40)
    if not text or text.startswith("http://") or text.startswith("https://"):
        return None
    return text


def normalize_place_details(requested_id: str, payload: dict[str, Any]) -> RestaurantDetails:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="SerpApi returned an invalid place response.")
    place = payload.get("place_results")
    if not isinstance(place, dict) or not place:
        raise HTTPException(status_code=404, detail="Place details are unavailable for this id.")

    point = place.get("gps_coordinates") if isinstance(place.get("gps_coordinates"), dict) else {}
    lat = number(point.get("latitude"))
    lng = number(point.get("longitude"))
    name = clean_text(place.get("title"), 200)
    address = clean_text(place.get("address"), 300)
    if not any((name, address, lat is not None, _phone(place.get("phone")), http_url(place.get("website")))):
        raise HTTPException(status_code=404, detail="Place details are unavailable for this id.")

    rating = number(place.get("rating"))
    if rating is not None and not 0 <= rating <= 5:
        rating = None

    normalized = {
        "id": requested_id,
        "name": name,
        "rating": rating,
        "review_count": review_count(place.get("reviews")),
        "address": address,
        "description": clean_text(place.get("description")),
        "category": _categories(place),
        "opening_hours": _opening_hours(place.get("hours")),
        "open_state": clean_text(place.get("open_state"), 120),
        "phone": _phone(place.get("phone")),
        "website": http_url(place.get("website")),
        "photos": photos(place),
        "lat": lat,
        "lng": lng,
        "directions_url": _directions_url(place, name, address, lat, lng),
        "source": "SerpApi Google Maps Place Results",
    }
    return RestaurantDetails.model_validate(normalized)


def _not_found(exc: HTTPException) -> bool:
    detail = str(exc.detail).lower()
    return exc.status_code == 502 and any(marker in detail for marker in _NOT_FOUND_MARKERS)


async def get_place_details(place_id: str) -> RestaurantDetails:
    requested_id = place_id.strip()
    params = provider_params_for_place(requested_id)
    return await details_cache.get_or_fetch(
        requested_id,
        lambda: _load_place_details(requested_id, params),
    )


async def _load_place_details(requested_id: str, params: dict[str, str]) -> RestaurantDetails:
    try:
        payload = await serpapi.serpapi_search(params, request_kind="details")
        normalized = normalize_place_details(requested_id, payload)
    except HTTPException as exc:
        if _not_found(exc):
            raise HTTPException(status_code=404, detail="Place details are unavailable for this id.") from exc
        raise
    return normalized
