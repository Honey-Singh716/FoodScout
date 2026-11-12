import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from app.restaurant_details_cache import RestaurantDetailsCache
from app.schemas import RestaurantDetails


UTC = timezone.utc


def details(place_id: str) -> RestaurantDetails:
    return RestaurantDetails(id=place_id, name="Cafe", rating=4.2)


class RestaurantDetailsCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_first_and_repeated_requests_use_one_provider_call(self):
        provider = AsyncMock(return_value=details("place-one"))
        cache = RestaurantDetailsCache(ttl=timedelta(hours=24))

        first = await cache.get_or_fetch("place-one", provider)
        second = await cache.get_or_fetch("place-one", provider)

        self.assertEqual(first, second)
        provider.assert_awaited_once()

    async def test_different_places_have_independent_entries(self):
        provider = AsyncMock(side_effect=[details("place-one"), details("place-two")])
        cache = RestaurantDetailsCache()

        await cache.get_or_fetch("place-one", provider)
        await cache.get_or_fetch("place-two", provider)

        self.assertEqual(provider.await_count, 2)
        self.assertEqual(cache.size(), 2)

    async def test_expired_details_refresh_on_request(self):
        current = [datetime(2026, 1, 1, tzinfo=UTC)]
        provider = AsyncMock(side_effect=[details("place-one"), details("place-one")])
        cache = RestaurantDetailsCache(ttl=timedelta(hours=24), clock=lambda: current[0])

        await cache.get_or_fetch("place-one", provider)
        current[0] += timedelta(hours=24, seconds=1)
        await cache.get_or_fetch("place-one", provider)

        self.assertEqual(provider.await_count, 2)

    async def test_failed_refresh_does_not_update_timestamp(self):
        current = [datetime(2026, 1, 1, tzinfo=UTC)]
        cache = RestaurantDetailsCache(ttl=timedelta(hours=24), clock=lambda: current[0])
        await cache.get_or_fetch("place-one", AsyncMock(return_value=details("place-one")))
        original = cache._entries["place-one"].last_fetched_at
        current[0] += timedelta(hours=24, seconds=1)

        with self.assertRaises(RuntimeError):
            await cache.get_or_fetch("place-one", AsyncMock(side_effect=RuntimeError("provider down")))

        self.assertEqual(cache._entries, {})
        self.assertEqual(original, datetime(2026, 1, 1, tzinfo=UTC))

    async def test_concurrent_requests_are_deduplicated(self):
        async def load():
            await asyncio.sleep(0)
            return details("place-one")

        provider = AsyncMock(side_effect=load)
        cache = RestaurantDetailsCache()
        await asyncio.gather(
            cache.get_or_fetch("place-one", provider),
            cache.get_or_fetch("place-one", provider),
        )

        provider.assert_awaited_once()

    def test_cache_size_is_bounded(self):
        cache = RestaurantDetailsCache(max_entries=1)
        cache.put("place-one", details("place-one"))
        cache.put("place-two", details("place-two"))
        self.assertEqual(cache.size(), 1)


if __name__ == "__main__":
    unittest.main()
