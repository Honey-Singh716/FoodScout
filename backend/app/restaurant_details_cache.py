import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from app.schemas import RestaurantDetails


UTC = timezone.utc
DEFAULT_TTL_HOURS = 24
DEFAULT_MAX_ITEMS = 500


def _utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class DetailsCacheEntry:
    place_id: str
    details: RestaurantDetails
    last_fetched_at: datetime
    expires_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at


class RestaurantDetailsCache:
    """Process-local details store with a replaceable async fetch boundary."""

    def __init__(
        self,
        ttl: timedelta | None = None,
        max_entries: int = DEFAULT_MAX_ITEMS,
        clock: Callable[[], datetime] = _utc_now,
    ):
        try:
            ttl_hours = float(os.getenv("RESTAURANT_DETAILS_CACHE_TTL_HOURS", str(DEFAULT_TTL_HOURS)))
        except ValueError:
            ttl_hours = DEFAULT_TTL_HOURS
        self.ttl = ttl or timedelta(hours=ttl_hours)
        self.max_entries = max_entries
        self._clock = clock
        self._entries: dict[str, DetailsCacheEntry] = {}
        self._inflight: dict[str, asyncio.Future[RestaurantDetails]] = {}
        self._lock: asyncio.Lock | None = None
        self._lock_loop: asyncio.AbstractEventLoop | None = None

    def now(self) -> datetime:
        return self._clock()

    def _get_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    def _purge_expired(self, now: datetime) -> None:
        expired = [place_id for place_id, entry in self._entries.items() if entry.is_expired(now)]
        for place_id in expired:
            del self._entries[place_id]

    def get(self, place_id: str) -> DetailsCacheEntry | None:
        entry = self._entries.get(place_id)
        if entry is None:
            return None
        if entry.is_expired(self._clock()):
            del self._entries[place_id]
            return None
        return entry

    def put(
        self,
        place_id: str,
        details: RestaurantDetails,
        fetched_at: datetime | None = None,
    ) -> DetailsCacheEntry:
        if not isinstance(details, RestaurantDetails):
            details = RestaurantDetails.model_validate(details)
        fetched = fetched_at or self._clock()
        entry = DetailsCacheEntry(
            place_id=place_id,
            details=details,
            last_fetched_at=fetched,
            expires_at=fetched + self.ttl,
        )
        self._entries[place_id] = entry
        self._purge_expired(fetched)
        while len(self._entries) > self.max_entries:
            oldest = min(self._entries, key=lambda key: self._entries[key].last_fetched_at)
            del self._entries[oldest]
        return entry

    def invalidate(self, place_id: str | None = None) -> int:
        if place_id is None:
            count = len(self._entries)
            self._entries.clear()
            return count
        return int(self._entries.pop(place_id, None) is not None)

    def size(self) -> int:
        self._purge_expired(self._clock())
        return len(self._entries)

    async def get_or_fetch(
        self,
        place_id: str,
        loader: Callable[[], Awaitable[RestaurantDetails]],
    ) -> RestaurantDetails:
        cached = self.get(place_id)
        if cached is not None:
            return cached.details

        loop = asyncio.get_running_loop()
        async with self._get_lock():
            future = self._inflight.get(place_id)
            if future is None:
                future = loop.create_future()
                self._inflight[place_id] = future
                leader = True
            else:
                leader = False

        if not leader:
            return await future

        try:
            details = await loader()
            validated = RestaurantDetails.model_validate(details)
            self.put(place_id, validated)
            future.set_result(validated)
            return validated
        except Exception as exc:
            future.set_exception(exc)
            future.exception()
            raise
        finally:
            self._inflight.pop(place_id, None)

