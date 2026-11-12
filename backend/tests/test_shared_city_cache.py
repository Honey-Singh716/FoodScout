import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.main import nearby_restaurants, restaurant_cache, search_restaurants
from app.restaurant_cache import CacheKey, RestaurantCache


UTC = timezone.utc


class SharedCityCacheTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        restaurant_cache.clear()

    async def test_equivalent_city_searches_share_one_provider_request(self):
        payload = {"local_results": [{
            "place_id": "ChIJ12345678",
            "title": "Jodhpur Cafe",
            "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
        }]}
        provider = AsyncMock(return_value=payload)
        with patch("app.main.serpapi_search", provider):
            first = await search_restaurants(q="Sardarpura, Jodhpur")
            second = await search_restaurants(q=" sardarpura,   jodhpur ")

        self.assertEqual(first["results"], second["results"])
        provider.assert_awaited_once()
        self.assertEqual(restaurant_cache.metrics()["cache_hits"], 1)

    async def test_different_cities_do_not_share_area_results(self):
        provider = AsyncMock(side_effect=[
            {"local_results": [{
                "place_id": "jodhpur-place",
                "title": "Jodhpur Cafe",
                "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
            }]},
            {"local_results": [{
                "place_id": "delhi-place",
                "title": "Delhi Cafe",
                "gps_coordinates": {"latitude": 28.6, "longitude": 77.2},
            }]},
        ])
        with patch("app.main.serpapi_search", provider):
            jodhpur = await search_restaurants(q="Jodhpur")
            delhi = await search_restaurants(q="Delhi")

        self.assertEqual(jodhpur["results"][0]["id"], "jodhpur-place")
        self.assertEqual(delhi["results"][0]["id"], "delhi-place")
        self.assertEqual(provider.await_count, 2)

    async def test_concurrent_users_share_one_city_request(self):
        async def provider(_params):
            await asyncio.sleep(0)
            return {"local_results": [{
                "place_id": "jodhpur-place",
                "title": "Jodhpur Cafe",
                "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
            }]}

        with patch("app.main.serpapi_search", AsyncMock(side_effect=provider)) as search:
            await asyncio.gather(
                search_restaurants(q="Jodhpur"),
                search_restaurants(q="Jodhpur"),
            )

        search.assert_awaited_once()
        self.assertEqual(restaurant_cache.metrics()["deduplicated_requests"], 1)

    async def test_invalid_provider_response_is_not_cached(self):
        provider = AsyncMock(side_effect=HTTPException(status_code=502, detail="invalid"))
        with patch("app.main.serpapi_search", provider):
            with self.assertRaises(HTTPException):
                await nearby_restaurants(lat=26.2, lng=73.0)
            with self.assertRaises(HTTPException):
                await nearby_restaurants(lat=26.2, lng=73.0)

        self.assertEqual(provider.await_count, 2)
        self.assertEqual(restaurant_cache.size(), 0)
        self.assertEqual(restaurant_cache.metrics()["failed_upstream_requests"], 2)

    def test_radius_cuisine_and_cell_are_deterministic_key_dimensions(self):
        base = CacheKey.create(
            26.2, 73.0, 10, "restaurants", "restaurant",
            city_id="jodhpur", cell="26.20:73.00", cuisine="north indian",
        )
        different_radius = CacheKey.create(
            26.2, 73.0, 5, "restaurants", "restaurant",
            city_id="jodhpur", cell="26.20:73.00", cuisine="north indian",
        )
        different_cuisine = CacheKey.create(
            26.2, 73.0, 10, "restaurants", "restaurant",
            city_id="jodhpur", cell="26.20:73.00", cuisine="cafe",
        )
        different_cell = CacheKey.create(
            26.3, 73.0, 10, "restaurants", "restaurant",
            city_id="jodhpur", cell="26.30:73.00", cuisine="north indian",
        )

        self.assertNotEqual(base, different_radius)
        self.assertNotEqual(base, different_cuisine)
        self.assertNotEqual(base, different_cell)

    def test_shared_cache_ttl_expires_entries(self):
        current = [datetime(2026, 1, 1, tzinfo=UTC)]
        cache = RestaurantCache(
            refresh_after=timedelta(minutes=30),
            max_age=timedelta(minutes=30),
            clock=lambda: current[0],
        )
        key = CacheKey.create(
            26.2, 73.0, 10, "restaurants", "restaurant",
            city_id="jodhpur", cell="26.20:73.00",
        )
        cache.put(
            key,
            [{"id": "one"}],
            center_lat=26.2,
            center_lng=73.0,
            coverage_radius_km=10,
            query="restaurants",
            category="restaurant",
        )
        current[0] += timedelta(minutes=31)
        self.assertEqual(cache.size(), 0)


if __name__ == "__main__":
    unittest.main()
