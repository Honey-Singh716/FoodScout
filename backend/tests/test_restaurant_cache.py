import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.main import nearby_restaurants, restaurant_cache
from app.restaurant_cache import CacheKey, RestaurantCache


UTC = timezone.utc


class RestaurantCacheTests(unittest.IsolatedAsyncioTestCase):
    def test_coverage_and_freshness_policy(self):
        current = [datetime(2026, 1, 1, tzinfo=UTC)]
        cache = RestaurantCache(clock=lambda: current[0])
        key = CacheKey.create(26.2, 73.0, 10, "restaurants", "restaurant")
        cache.put(
            key,
            [{"id": "one"}],
            center_lat=26.2,
            center_lng=73.0,
            coverage_radius_km=10,
            query="restaurants",
            category="restaurant",
        )

        self.assertIsNotNone(cache.find_reusable(
            lat=26.2, lng=73.0, display_radius_km=3,
            query="restaurants", category="restaurant",
        ))
        current[0] += timedelta(days=10)
        entry = cache.find_reusable(
            lat=26.2, lng=73.0, display_radius_km=3,
            query="restaurants", category="restaurant",
        )
        self.assertTrue(entry.is_refresh_eligible(current[0]))
        current[0] += timedelta(days=5)
        self.assertIsNone(cache.find_reusable(
            lat=26.2, lng=73.0, display_radius_km=3,
            query="restaurants", category="restaurant",
        ))

    def test_cache_is_bounded_and_can_invalidate_query(self):
        cache = RestaurantCache(max_entries=2)
        for index in range(3):
            key = CacheKey.create(26.2 + index, 73.0, 10, f"query-{index}", "restaurant")
            cache.put(
                key,
                [{"id": str(index)}],
                center_lat=26.2 + index,
                center_lng=73.0,
                coverage_radius_km=10,
                query=f"query-{index}",
                category="restaurant",
            )

        self.assertEqual(cache.size(), 2)
        self.assertEqual(cache.invalidate(query="query-1"), 1)
        self.assertEqual(cache.size(), 1)

    async def test_failed_refresh_returns_stale_without_advancing_timestamp(self):
        current = [datetime(2026, 1, 1, tzinfo=UTC)]
        cache = RestaurantCache(clock=lambda: current[0])
        key = CacheKey.create(26.2, 73.0, 10, "restaurants", "restaurant")
        original = cache.put(
            key,
            [{"id": "one"}],
            center_lat=26.2,
            center_lng=73.0,
            coverage_radius_km=10,
            query="restaurants",
            category="restaurant",
        )
        current[0] += timedelta(days=10)
        stale, served_stale = await cache.fetch(
            key,
            AsyncMock(side_effect=RuntimeError("provider unavailable")),
            center_lat=26.2,
            center_lng=73.0,
            coverage_radius_km=10,
            query="restaurants",
            category="restaurant",
            stale_entry=original,
        )

        self.assertTrue(served_stale)
        self.assertIs(stale, original)
        self.assertEqual(stale.last_fetched_at, original.last_fetched_at)

    async def test_identical_nearby_requests_share_one_provider_call(self):
        restaurant_cache.clear()
        payload = {"local_results": [{
            "place_id": "ChIJ12345678",
            "title": "Cafe",
            "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
        }]}
        search = AsyncMock(return_value=payload)
        with patch("app.main.serpapi_search", search):
            first, second = await asyncio.gather(
                nearby_restaurants(lat=26.2, lng=73.0, radius_km=3, place_type="restaurant"),
                nearby_restaurants(lat=26.2, lng=73.0, radius_km=3, place_type="restaurant"),
            )

        self.assertEqual(first["results"], second["results"])
        search.assert_awaited_once()

    async def test_movement_within_coverage_reuses_and_outside_fetches(self):
        restaurant_cache.clear()
        payload = {"local_results": [{
            "place_id": "ChIJ12345678",
            "title": "Cafe",
            "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
        }]}
        search = AsyncMock(return_value=payload)
        with patch("app.main.serpapi_search", search):
            await nearby_restaurants(lat=26.2, lng=73.0, radius_km=3, place_type="restaurant")
            await nearby_restaurants(lat=26.25, lng=73.0, radius_km=3, place_type="restaurant")
            await nearby_restaurants(lat=26.4, lng=73.0, radius_km=3, place_type="restaurant")

        self.assertEqual(search.await_count, 2)


if __name__ == "__main__":
    unittest.main()
