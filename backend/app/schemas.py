from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OpeningHours(BaseModel):
    day: str = ""
    hours: str


class Coordinates(BaseModel):
    lat: float
    lng: float


class RestaurantSummary(BaseModel):
    id: str
    name: str
    cuisine: list[str] = Field(default_factory=list)
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int = Field(default=0, ge=0)
    price_level: int | None = Field(default=None, ge=1, le=4)
    price_label: str | None = None
    address: str = ""
    lat: float
    lng: float
    open_now: bool | None = None
    image_url: str | None = None
    maps_url: str | None = None
    phone: str | None = None
    website: str | None = None
    hours: str | None = None
    opening_hours: list[OpeningHours] = Field(default_factory=list)
    description: str | None = None
    photos: list[str] = Field(default_factory=list)
    source: str | None = None


class CacheMetadata(BaseModel):
    status: str
    search_center: Coordinates
    coverage_radius_km: float = Field(gt=0)
    query: str
    category: str
    last_fetched_at: datetime
    expires_at: datetime
    served_stale: bool = False


class RestaurantResultsResponse(BaseModel):
    results: list[RestaurantSummary] = Field(default_factory=list)
    provider: str
    cache: CacheMetadata | None = None


class RestaurantDetails(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str | None = None
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int | None = Field(default=None, ge=0)
    address: str | None = None
    description: str | None = None
    category: list[str] = Field(default_factory=list)
    opening_hours: list[OpeningHours] = Field(default_factory=list)
    open_state: str | None = None
    phone: str | None = None
    website: str | None = None
    photos: list[str] = Field(default_factory=list)
    lat: float | None = None
    lng: float | None = None
    directions_url: str | None = None
    source: str | None = None
