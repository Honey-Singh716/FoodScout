import { recordFrontendRequest } from "./requestMetrics";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function requestResults(path, signal, onCacheMeta, token) {
  recordFrontendRequest("discovery");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Restaurant API failed (${response.status})`);
  onCacheMeta?.(payload.cache || null);
  const records = Array.isArray(payload) ? payload : payload.results;
  if (!Array.isArray(records)) throw new Error("Unexpected API response: results array missing.");
  return records.map(normalizeRestaurant).filter(Boolean);
}

export function getNearbyRestaurants({ lat, lng, radiusKm, type = "restaurant", cuisine = "", signal, onCacheMeta, token, publicPreview = false }) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radiusKm), type });
  if (cuisine) params.set("cuisine", cuisine);
  if (publicPreview) params.set("public_preview", "true");
  return requestResults(`/api/v1/restaurants/nearby?${params}`, signal, onCacheMeta, token);
}

export function searchRestaurantsByArea({ query, type = "restaurant", signal, onCacheMeta, token }) {
  const params = new URLSearchParams({ q: query, type });
  return requestResults(`/api/v1/restaurants/search?${params}`, signal, onCacheMeta, token);
}

async function authRequest(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Authentication failed.");
  return payload;
}

export function login(email, password) {
  return authRequest("/api/v1/auth/login", { email, password });
}

export function signup(name, email, password) {
  return authRequest("/api/v1/auth/signup", { name, email, password });
}

async function authenticatedRequest(path, token, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Authenticated request failed.");
  return payload;
}

export function getUserPreferences(token) {
  return authenticatedRequest("/api/v1/auth/preferences", token);
}

export function saveUserPreferences(token, cuisines) {
  return authenticatedRequest("/api/v1/auth/preferences", token, {
    method: "PUT",
    body: JSON.stringify({ cuisines, configured: true })
  });
}

export function getCurrentUser(token) {
  return authenticatedRequest("/api/v1/auth/me", token);
}

export function logoutSession(token) {
  return authenticatedRequest("/api/v1/auth/logout", token, { method: "POST" });
}

export function getUserProfile(token) {
  return authenticatedRequest("/api/v1/auth/profile", token);
}

export function saveUserProfile(token, profile) {
  return authenticatedRequest("/api/v1/auth/profile", token, {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function getFavorites(token) {
  return authenticatedRequest("/api/v1/auth/favorites", token);
}

export function addFavorite(token, placeId) {
  return authenticatedRequest("/api/v1/auth/favorites", token, {
    method: "POST",
    body: JSON.stringify({ place_id: placeId })
  });
}

export function removeFavorite(token, placeId) {
  return authenticatedRequest(`/api/v1/auth/favorites/${encodeURIComponent(placeId)}`, token, {
    method: "DELETE"
  });
}

export function recordUserActivity(token, eventType, placeId = null, metadata = {}) {
  return authenticatedRequest("/api/v1/auth/activity", token, {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, place_id: placeId, metadata })
  });
}

export async function getRestaurantDetails(placeId, signal, token) {
  recordFrontendRequest("details");
  const response = await fetch(`${API_BASE}/api/v1/restaurants/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
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
