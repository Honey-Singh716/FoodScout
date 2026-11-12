const STORAGE_KEY = "foodscout.discovery-state";
const PREFERENCES_KEY = "foodscout.preferences";

function readJson(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadDiscoveryState() {
  const state = readJson(STORAGE_KEY);
  if (!state || !Array.isArray(state.results)) return null;
  return {
    results: state.results,
    location: state.location || null,
    cache: state.cache || null,
    type: typeof state.type === "string" ? state.type : "restaurant",
    areaSearchActive: Boolean(state.areaSearchActive),
    savedAt: Number(state.savedAt) || 0
  };
}

export function saveDiscoveryState(state) {
  return writeJson(STORAGE_KEY, {
    results: state.results,
    location: state.location,
    cache: state.cache,
    type: state.type,
    areaSearchActive: state.areaSearchActive,
    savedAt: Date.now()
  });
}

export function loadPreferences() {
  const preferences = readJson(PREFERENCES_KEY);
  if (!preferences || typeof preferences !== "object") return {};
  return preferences;
}

export function savePreferences(preferences) {
  return writeJson(PREFERENCES_KEY, preferences);
}
