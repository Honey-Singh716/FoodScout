from datetime import datetime

import re
from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    city_id: str = ""
    cell: str = ""
    last_fetched_at: datetime
    expires_at: datetime
    served_stale: bool = False


class RestaurantResultsResponse(BaseModel):
    results: list[RestaurantSummary] = Field(default_factory=list)
    provider: str
    cache: CacheMetadata | None = None


class AuthCredentials(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str):
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized


class AuthSignup(AuthCredentials):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str):
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Enter your name (at least 2 characters).")
        return normalized


class AuthUser(BaseModel):
    id: str
    name: str
    email: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


class UserPreferences(BaseModel):
    cuisines: list[str] = Field(default_factory=list, max_length=12)
    configured: bool = False


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


class UserProfile(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    avatar_url: str | None = Field(default=None, max_length=2048)


class FavoriteRequest(BaseModel):
    place_id: str = Field(min_length=8, max_length=256)


class FavoriteResponse(BaseModel):
    id: int
    place_id: str
    created_at: int


class UserActivityRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=64)
    place_id: str | None = Field(default=None, max_length=256)
    metadata: dict = Field(default_factory=dict)
