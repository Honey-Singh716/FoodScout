const PLACE_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;
const DATA_ID_RE = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;
const DATA_CID_RE = /^\d{10,}$/;

export function isFetchablePlaceId(id) {
  return typeof id === "string" && (PLACE_ID_RE.test(id) || DATA_ID_RE.test(id) || DATA_CID_RE.test(id));
}

export function summarySatisfiesDetails(restaurant) {
  if (!restaurant) return false;
  const hours = Array.isArray(restaurant.opening_hours) && restaurant.opening_hours.length > 0;
  const photos = Array.isArray(restaurant.photos) && restaurant.photos.length > 0;
  const description = typeof restaurant.description === "string" && restaurant.description.trim() !== "";
  return hours && photos && description;
}

export function needsDetailsRequest(restaurant, record) {
  if (!restaurant || !isFetchablePlaceId(restaurant.id)) return false;
  if (record?.status === "ready" || record?.status === "loading" || record?.status === "unavailable") return false;
  if (summarySatisfiesDetails(restaurant)) return false;
  return true;
}

function text(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function httpUrl(value) {
  const trimmed = text(value);
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return null;
}

function directionsUrl(restaurant, details) {
  const lat = details?.lat ?? restaurant.lat;
  const lng = details?.lng ?? restaurant.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const address = details?.address || restaurant.address;
  if (typeof address === "string" && address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
  }
  return null;
}

export function presentRestaurant(summary, record) {
  const extra = record?.status === "ready" && record.data ? record.data : null;
  const loading = needsDetailsRequest(summary, record) || record?.status === "loading";
  const categories = extra?.category?.length
    ? extra.category
    : (Array.isArray(summary.cuisine) ? summary.cuisine.filter(Boolean) : []);
  const hours = extra?.opening_hours?.length
    ? extra.opening_hours
    : (Array.isArray(summary.opening_hours) ? summary.opening_hours : []);
  const photos = extra?.photos?.length
    ? extra.photos
    : (Array.isArray(summary.photos) && summary.photos.length
      ? summary.photos
      : (httpUrl(summary.image_url) ? [summary.image_url] : []));

  return {
    name: text(extra?.name) || text(summary.name),
    rating: extra ? extra.rating ?? null : (summary.rating ?? null),
    reviewCount: extra ? extra.review_count ?? null : (Number.isFinite(summary.review_count) ? summary.review_count : null),
    address: text(extra?.address) || text(summary.address),
    description: text(extra?.description) || text(summary.description),
    category: categories,
    openingHours: hours,
    openState: text(extra?.open_state) || text(summary.hours),
    phone: text(extra?.phone) || text(summary.phone),
    website: httpUrl(extra?.website) || httpUrl(summary.website),
    photos: photos.filter((url) => httpUrl(url)),
    directionsUrl: directionsUrl(summary, extra),
    loading
  };
}
