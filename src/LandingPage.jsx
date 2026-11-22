import { useState } from "react";
import { ArrowRight, MapPin, Search, Sparkles, Utensils } from "lucide-react";
import RestaurantHeroCarousel from "./components/RestaurantHeroCarousel";
import AuthPanel from "./components/AuthPanel";
import { getNearbyRestaurants } from "./lib/api";
import { loadSavedLocation, saveDeviceLocation, MAX_LOCATION_ACCURACY_METERS } from "./lib/locationStorage";
import { loadDiscoveryState, saveDiscoveryState } from "./lib/discoveryStorage";
import { login, signup } from "./lib/api";

const DEFAULT_LOCATION = { lat: 26.2866, lng: 73.03 };

export default function LandingPage({ onAuthenticated }) {
  const saved = loadSavedLocation();
  const persisted = loadDiscoveryState();
  const [location, setLocation] = useState(persisted?.location || saved || DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(saved ? "Your saved location" : (persisted?.location ? "Saved search area" : "Jodhpur"));
  const [restaurants, setRestaurants] = useState(persisted?.results || []);
  const [searchText, setSearchText] = useState("");
  const [cuisineShortcut, setCuisineShortcut] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");

  const loadNearby = async (cuisine = "") => {
    setLoading(true);
    setError("");
    try {
      const results = await getNearbyRestaurants({
        lat: location.lat,
        lng: location.lng,
        radiusKm: 3,
        type: "restaurant",
        cuisine,
        publicPreview: true
      });
      const term = searchText.trim().toLowerCase();
      const filtered = term
        ? results.filter((restaurant) => `${restaurant.name} ${(restaurant.cuisine || []).join(" ")}`.toLowerCase().includes(term))
        : results;
      setRestaurants(filtered);
      saveDiscoveryState({ results, location, cache: null, type: "restaurant", areaSearchActive: false });
    } catch (requestError) {
      setError(requestError.message || "Nearby restaurants could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const submitSearch = (event) => {
    event?.preventDefault();
    loadNearby(searchText.trim());
  };

  const chooseCuisine = (cuisine) => {
    setCuisineShortcut(cuisine);
    loadNearby(cuisine);
  };

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setError("Location services are unavailable in this browser. Showing saved or Jodhpur area results.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = saveDeviceLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          lastUpdatedAt: Date.now()
        });
        setLoading(false);
        if (!next) {
          setError(`Location accuracy must be better than ${MAX_LOCATION_ACCURACY_METERS} metres. The previous location was preserved.`);
          return;
        }
        setLocation(next);
        setLocationLabel("Your current location");
        loadNearby(cuisineShortcut);
      },
      (geoError) => {
        setLoading(false);
        setError(geoError.code === 1
          ? "Location permission was denied. You can still search the saved or Jodhpur area."
          : "Your location could not be obtained. Showing the current saved area.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
    );
  };

  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setAuthOpen(true);
    setError("");
  };

  const submitAuth = async ({ mode, name, email, password, confirmPassword }) => {
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    setError("");
    try {
      const session = mode === "signup"
        ? await signup(name, email, password)
        : await login(email, password);
      onAuthenticated(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const selectRestaurant = (restaurant) => {
    window.sessionStorage.setItem("foodscout.pending-selection", restaurant.id);
    openAuth("login");
  };

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#" aria-label="FoodScout home"><span className="landing-brand-mark"><Utensils size={19} /></span>food<span>scout</span></a>
        <nav>
          <a className="landing-nav-active" href="#discover">Discover</a>
          <button type="button" onClick={() => openAuth("login")}>Recommendations</button>
          <a href="#offers">Offers</a>
          <a href="#about">About</a>
        </nav>
        <div className="landing-actions">
          <button type="button" className="landing-location" onClick={refreshLocation}><MapPin size={15} /> {locationLabel}</button>
          <button type="button" className="landing-login" onClick={() => openAuth("login")}>Log in</button>
        </div>
      </header>

      <section className="landing-hero" id="discover">
        <div className="landing-copy">
          <p className="landing-eyebrow"><Sparkles size={14} /> SMART LOCAL FOOD DISCOVERY</p>
          <h1>Discover your next <em>craving.</em></h1>
          <p className="landing-description">Find great restaurants near you, explore cuisines, compare ratings, and keep every delicious discovery in one place.</p>
          <form className="landing-search" onSubmit={submitSearch}>
            <MapPin size={18} />
            <span>{locationLabel}</span>
            <span className="landing-search-divider" />
            <Search size={18} />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-label="Search restaurants or cuisine" placeholder="Search restaurants, cuisines..." />
            <button type="submit" disabled={loading} aria-label="Search nearby restaurants"><ArrowRight size={20} /></button>
          </form>
          <div className="landing-cuisine-row">
            {["Indian", "Chinese", "Cafe", "Italian"].map((item) => <button type="button" key={item} onClick={() => chooseCuisine(item)} className={cuisineShortcut === item ? "active" : ""}>{item}</button>)}
          </div>
          {!restaurants.length && <button className="landing-explore" type="button" onClick={loadNearby} disabled={loading}>{loading ? "Finding nearby places…" : "Explore nearby restaurants"} <ArrowRight size={16} /></button>}
          {error && <p className="landing-error" role="alert">{error}</p>}
        </div>
        <RestaurantHeroCarousel
          restaurants={restaurants}
          location={location}
          onSelect={selectRestaurant}
        />
      </section>

      <section className="landing-benefits" aria-label="FoodScout features">
        <div><Sparkles size={24} /><span><strong>Discover Nearby</strong><small>Top restaurants around you</small></span></div>
        <div><Utensils size={24} /><span><strong>Saved Preferences</strong><small>Personal picks after you set your taste</small></span></div>
        <div><MapPin size={24} /><span><strong>Explore Cuisines</strong><small>From local favourites to global flavors</small></span></div>
      </section>

      {authOpen && <AuthPanel mode={authMode} onClose={() => setAuthOpen(false)} onSubmit={submitAuth} loading={authLoading} error={error} />}
    </main>
  );
}
