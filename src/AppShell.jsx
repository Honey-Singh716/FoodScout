import { useEffect, useState } from "react";
import App from "./App";
import LandingPage from "./LandingPage";
import RecommendationsPage from "./RecommendationsPage";
import { getCurrentUser, logoutSession } from "./lib/api";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "./lib/authStorage";
import StaticPage from "./StaticPage";

const VALID_PAGES = new Set(["discover", "recommendations", "offers", "about"]);

function readPage() {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return VALID_PAGES.has(hash) ? hash : "discover";
}

export default function AppShell() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [page, setPage] = useState(readPage);

  useEffect(() => {
    const handleHashChange = () => setPage(readPage());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const stored = loadAuthSession();
    if (!stored) {
      setCheckingSession(false);
      return undefined;
    }

    let active = true;
    getCurrentUser(stored.token)
      .then((user) => {
        if (!active) return;
        const restored = { token: stored.token, user };
        saveAuthSession(restored);
        setSession(restored);
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
        setSession(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => { active = false; };
  }, []);

  if (checkingSession) {
    return <main className="app-session-loading" aria-live="polite">Restoring your FoodScout session…</main>;
  }

  if (!session) {
    if (page === "offers" || page === "about") {
      return <StaticPage page={page} session={null} onNavigate={(nextPage) => {
        window.location.hash = nextPage;
      }} onLogin={() => {
        window.location.hash = "discover";
      }} />;
    }
    return <LandingPage onAuthenticated={(nextSession) => {
      saveAuthSession(nextSession);
      setSession(nextSession);
      setPage("recommendations");
    }} />;
  }

  const navigate = (nextPage) => {
    window.history.replaceState(null, "", `#${VALID_PAGES.has(nextPage) ? nextPage : "discover"}`);
    setPage(nextPage);
  };
  const logout = async () => {
    try {
      await logoutSession(session.token);
    } catch (error) {
      console.error("FoodScout logout request failed; clearing the local session.", error);
    } finally {
      clearAuthSession();
      setSession(null);
    }
  };
  if (page === "recommendations") {
    return <RecommendationsPage session={session} onNavigate={navigate} onLogout={logout} />;
  }
  if (page === "offers" || page === "about") {
    return <StaticPage page={page} session={session} onNavigate={navigate} onLogout={logout} />;
  }
  return <App user={session.user} token={session.token} onNavigate={navigate} onLogout={logout} />;
}
