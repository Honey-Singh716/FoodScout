import { recordFrontendRequest } from "./requestMetrics";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function requestResults(path, signal, onCacheMeta) {
  recordFrontendRequest("discovery");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Restaurant API failed (${response.status})`);
  onCacheMeta?.(payload.cache || null);
  const records = Array.isArray(payload) ? payload : payload.results;
  if (!Array.isArray(records)) throw new Error("Unexpected API response: results array missing.");
  return records.map(normalizeRestaurant).filter(Boolean);
}

export function getNearbyRestaurants({ lat, lng, radiusKm, type = "restaurant", signal, onCacheMeta }) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radiusKm), type });
  return requestResults(`/api/v1/restaurants/nearby?${params}`, signal, onCacheMeta);
}

export function searchRestaurantsByArea({ query, type = "restaurant", signal, onCacheMeta }) {
  const params = new URLSearchParams({ q: query, type });
  return requestResults(`/api/v1/restaurants/search?${params}`, signal, onCacheMeta);
}

export async function getRestaurantDetails(placeId, signal) {
  recordFrontendRequest("details");
  const response = await fetch(`${API_BASE}/api/v1/restaurants/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      typeof payload.detail === "string" ? payload.detail : `Restaurant details failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Unexpected restaurant details response.");
  }
  return normalizeDetails(payload);
}

function normalizeRestaurant(item) {
  const lat = Number(item.lat ?? item.latitude ?? item.location?.lat);
  const lng = Number(item.lng ?? item.longitude ?? item.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(item.id ?? item.place_id ?? `${lat},${lng}`),
    name: item.name || "Unnamed restaurant",
    cuisine: Array.isArray(item.cuisine) ? item.cuisine : (item.cuisine ? [item.cuisine] : []),
    rating: item.rating == null ? null : Number(item.rating),
    review_count: Number(item.review_count ?? 0),
    price_level: item.price_level == null ? null : Number(item.price_level),
    price_label: typeof item.price_label === "string" ? item.price_label : null,
    address: item.address || "",
    lat,
    lng,
    open_now: item.open_now ?? null,
    image_url: item.image_url || null,
    maps_url: item.maps_url || null,
    phone: item.phone || null,
    website: item.website || null,
    hours: item.hours || null,
    opening_hours: Array.isArray(item.opening_hours) ? item.opening_hours : [],
    description: item.description || null,
    photos: Array.isArray(item.photos) ? item.photos : [],
  };
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDetails(item) {
  return {
    id: item.id == null ? null : String(item.id),
    name: item.name || null,
    rating: finiteOrNull(item.rating),
    review_count: finiteOrNull(item.review_count),
    address: item.address || null,
    description: item.description || null,
    category: Array.isArray(item.category) ? item.category.filter(Boolean) : [],
    opening_hours: Array.isArray(item.opening_hours) ? item.opening_hours.filter((entry) => entry && entry.hours) : [],
    open_state: item.open_state || null,
    phone: item.phone || null,
    website: item.website || null,
    photos: Array.isArray(item.photos) ? item.photos.filter(Boolean) : [],
    lat: finiteOrNull(item.lat),
    lng: finiteOrNull(item.lng),
    directions_url: item.directions_url || null
  };
}
