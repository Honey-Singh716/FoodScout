const STORAGE_KEY = "foodscout.device-location";
export const MAX_LOCATION_ACCURACY_METERS = 1000;

function isValidCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function validateDeviceLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const accuracy = Number(location?.accuracy);
  const lastUpdatedAt = Number(location?.lastUpdatedAt);

  if (
    !isValidCoordinate(lat, -90, 90) ||
    !isValidCoordinate(lng, -180, 180) ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > MAX_LOCATION_ACCURACY_METERS ||
    !Number.isFinite(lastUpdatedAt) ||
    lastUpdatedAt <= 0
  ) {
    return null;
  }

  return { lat, lng, accuracy, lastUpdatedAt };
}

export function loadSavedLocation() {
  try {
    return validateDeviceLocation(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function saveDeviceLocation(location) {
  const validated = validateDeviceLocation(location);
  if (!validated) return null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch {
    return null;
  }
  return validated;
}

export function formatLocationAge(lastUpdatedAt, now = Date.now()) {
  const ageMinutes = Math.max(0, Math.round((now - lastUpdatedAt) / 60000));
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}
