import asyncio
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable


UTC = timezone.utc


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _distance_km(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lng1 = map(math.radians, first)
    lat2, lng2 = map(math.radians, second)
    d_lat = lat2 - lat1
    d_lng = lng2 - lng1
    value = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(min(1, value)))


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


@dataclass(frozen=True)
class CacheKey:
    center_lat: float
    center_lng: float
    coverage_radius_km: float
    query: str
    category: str
    city_id: str = ""
    cell: str = ""
    cuisine: str = ""

    @classmethod
    def create(
        cls,
        center_lat: float,
        center_lng: float,
        coverage_radius_km: float,
        query: str,
        category: str,
        city_id: str = "",
        cell: str = "",
        cuisine: str = "",
    ) -> "CacheKey":
        return cls(
            round(center_lat, 5),
            round(center_lng, 5),
            round(coverage_radius_km, 2),
            _normalize_text(query),
            _normalize_text(category),
            _normalize_text(city_id),
            _normalize_text(cell),
            _normalize_text(cuisine),
        )


@dataclass
class CacheEntry:
    key: CacheKey
    results: list[dict[str, Any]]
    center_lat: float
    center_lng: float
    coverage_radius_km: float
    query: str
    category: str
    last_fetched_at: datetime
    expires_at: datetime
    refresh_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    def is_refresh_eligible(self, now: datetime) -> bool:
        return now >= self.refresh_at

    def metadata(self, now: datetime | None = None) -> dict[str, Any]:
        current = now or _utc_now()
        if self.is_expired(current):
            status = "expired"
        elif self.is_refresh_eligible(current):
            status = "stale"
        else:
            status = "fresh"
        return {
            "status": status,
            "search_center": {"lat": self.center_lat, "lng": self.center_lng},
            "coverage_radius_km": self.coverage_radius_km,
            "query": self.query,
            "category": self.category,
            "city_id": self.key.city_id,
            "cell": self.key.cell,
            "last_fetched_at": self.last_fetched_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }


class RestaurantCache:
    """Bounded, process-local cache that can be replaced by another store later."""

    def __init__(
        self,
        max_entries: int = 100,
        refresh_after: timedelta = timedelta(days=10),
        max_age: timedelta = timedelta(days=15),
        clock: Callable[[], datetime] = _utc_now,
    ):
        self.max_entries = max_entries
        self.refresh_after = refresh_after
        self.max_age = max_age
        self._clock = clock
        self._entries: dict[CacheKey, CacheEntry] = {}
        self._inflight: dict[CacheKey, asyncio.Future[CacheEntry]] = {}
        self._lock: asyncio.Lock | None = None
        self._lock_loop: asyncio.AbstractEventLoop | None = None
        self._metrics = {
            "total_requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "failed_upstream_requests": 0,
            "deduplicated_requests": 0,
        }

    def _get_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    def now(self) -> datetime:
        return self._clock()

    def record_request(self, hit: bool) -> None:
        self._metrics["total_requests"] += 1
        self._metrics["cache_hits" if hit else "cache_misses"] += 1

    def metrics(self) -> dict[str, Any]:
        total = self._metrics["total_requests"]
        return {
            **self._metrics,
            "cache_hit_percentage": round(self._metrics["cache_hits"] * 100 / total, 2) if total else 0,
        }

    def _purge_expired(self, now: datetime) -> None:
        expired = [key for key, entry in self._entries.items() if entry.is_expired(now)]
        for key in expired:
            del self._entries[key]

    @staticmethod
    def deduplicate(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for result in results:
            place_id = str(result.get("id") or "").strip()
            if not place_id or place_id in seen:
                continue
            seen.add(place_id)
            unique.append(result)
        return unique

    def put(
        self,
        key: CacheKey,
        results: list[dict[str, Any]],
        *,
        center_lat: float,
        center_lng: float,
        coverage_radius_km: float,
        query: str,
        category: str,
        city_id: str | None = None,
        cell: str | None = None,
        fetched_at: datetime | None = None,
    ) -> CacheEntry:
        fetched = fetched_at or self._clock()
        entry = CacheEntry(
            key=key,
            results=self.deduplicate(results),
            center_lat=center_lat,
            center_lng=center_lng,
            coverage_radius_km=coverage_radius_km,
            query=query,
            category=category,
            last_fetched_at=fetched,
            expires_at=fetched + self.max_age,
            refresh_at=fetched + self.refresh_after,
        )
        self._entries[key] = entry
        self._purge_expired(fetched)
        while len(self._entries) > self.max_entries:
            oldest_key = min(self._entries, key=lambda item: self._entries[item].last_fetched_at)
            del self._entries[oldest_key]
        return entry

    def find_reusable(
        self,
        *,
        lat: float,
        lng: float,
        display_radius_km: float,
        query: str,
        category: str,
        city_id: str | None = None,
        cell: str | None = None,
    ) -> CacheEntry | None:
        now = self._clock()
        self._purge_expired(now)
        normalized_query = _normalize_text(query)
        normalized_category = _normalize_text(category)
        candidates = [
            entry for entry in self._entries.values()
            if entry.query == normalized_query
            and entry.category == normalized_category
            and (city_id is None or entry.key.city_id == _normalize_text(city_id))
            and (cell is None or entry.key.cell == _normalize_text(cell))
            and _distance_km((lat, lng), (entry.center_lat, entry.center_lng)) + display_radius_km
            <= entry.coverage_radius_km
        ]
        return min(
            candidates,
            key=lambda entry: _distance_km((lat, lng), (entry.center_lat, entry.center_lng)),
            default=None,
        )

    def find_latest(
        self,
        *,
        query: str,
        category: str,
        city_id: str | None = None,
        cell: str | None = None,
    ) -> CacheEntry | None:
        now = self._clock()
        self._purge_expired(now)
        normalized_query = _normalize_text(query)
        normalized_category = _normalize_text(category)
        candidates = [
            entry for entry in self._entries.values()
            if entry.query == normalized_query and entry.category == normalized_category
            and (city_id is None or entry.key.city_id == _normalize_text(city_id))
            and (cell is None or entry.key.cell == _normalize_text(cell))
        ]
        return max(candidates, key=lambda entry: entry.last_fetched_at, default=None)

    def invalidate(self, *, query: str | None = None, category: str | None = None) -> int:
        normalized_query = _normalize_text(query) if query is not None else None
        normalized_category = _normalize_text(category) if category is not None else None
        keys = [
            key for key, entry in self._entries.items()
            if (normalized_query is None or entry.query == normalized_query)
            and (normalized_category is None or entry.category == normalized_category)
        ]
        for key in keys:
            del self._entries[key]
        return len(keys)

    def clear(self) -> None:
        self._entries.clear()

    def size(self) -> int:
        self._purge_expired(self._clock())
        return len(self._entries)

    async def fetch(
        self,
        key: CacheKey,
        loader: Callable[[], Awaitable[list[dict[str, Any]]]],
        *,
        center_lat: float,
        center_lng: float,
        coverage_radius_km: float,
        query: str,
        category: str,
        stale_entry: CacheEntry | None = None,
    ) -> tuple[CacheEntry, bool]:
        loop = asyncio.get_running_loop()
        async with self._get_lock():
            future = self._inflight.get(key)
            if future is None:
                future = loop.create_future()
                self._inflight[key] = future
                leader = True
            else:
                leader = False
                self._metrics["deduplicated_requests"] += 1

        if not leader:
            try:
                return await future, False
            except Exception:
                if stale_entry is not None and not stale_entry.is_expired(self._clock()):
                    return stale_entry, True
                raise

        try:
            results = await loader()
            entry = self.put(
                key,
                results,
                center_lat=center_lat,
                center_lng=center_lng,
                coverage_radius_km=coverage_radius_km,
                query=query,
                category=category,
            )
            future.set_result(entry)
            return entry, False
        except Exception as exc:
            self._metrics["failed_upstream_requests"] += 1
            future.set_exception(exc)
            future.exception()
            if stale_entry is not None and not stale_entry.is_expired(self._clock()):
                return stale_entry, True
            raise
        finally:
            self._inflight.pop(key, None)

