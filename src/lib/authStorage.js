const STORAGE_KEY = "foodscout.auth-session";

export function loadAuthSession() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const session = value ? JSON.parse(value) : null;
    return session?.token && session?.user ? session : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(session) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}
