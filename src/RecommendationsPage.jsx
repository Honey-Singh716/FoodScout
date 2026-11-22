import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, LoaderCircle, MapPin, Search, Sparkles, Star, Utensils, X } from "lucide-react";
import MapView from "./components/MapView";
import RestaurantDetails from "./components/RestaurantDetails";
import {
  addFavorite,
  getFavorites,
  getNearbyRestaurants,
  getUserPreferences,
  getUserProfile,
  recordUserActivity,
  removeFavorite,
  saveUserPreferences
} from "./lib/api";
import { formatDistance } from "./lib/geo";
import { loadDiscoveryState } from "./lib/discoveryStorage";
import { loadSavedLocation } from "./lib/locationStorage";
import { rankRecommendations, recommendationCuisineOptions } from "./lib/recommendations";
import { useRestaurantDetails } from "./hooks/useRestaurantDetails";

const DEFAULT_LOCATION = { lat: 26.2866, lng: 73.03 };
const CUISINES = ["Indian", "Italian", "Chinese", "Cafe", "Dessert", "North Indian"];

function RecommendationCard({ restaurant, selected, favourite, onSelect, onFavourite }) {
  const distance = restaurant.distance == null ? "Distance unavailable" : formatDistance(restaurant.distance);
  return (
    <article className={`recommendation-card ${selected ? "selected" : ""}`}>
      <button type="button" className="recommendation-card-main" onClick={() => onSelect(restaurant)} aria-pressed={selected}>
        {restaurant.image_url
          ? <img src={restaurant.image_url} alt="" loading="lazy" />
          : <div className="recommendation-card-fallback"><Utensils size={26} /></div>}
        <div className="recommendation-card-content">
          <div className="recommendation-card-heading">
            <div><h3>{restaurant.name}</h3><p>{restaurant.cuisine?.join(" · ") || "Cuisine not listed"}</p></div>
            {restaurant.rating != null && <span className="recommendation-rating"><Star size={13} fill="currentColor" /> {restaurant.rating.toFixed(1)}</span>}
          </div>
          <div className="recommendation-card-meta">
            <span><MapPin size={13} /> {distance}</span>
            {restaurant.review_count > 0 && <span>{restaurant.review_count.toLocaleString()} reviews</span>}
            {restaurant.price_label || restaurant.price_level != null ? <span>{restaurant.price_label || "₹".repeat(Math.min(4, Math.max(1, restaurant.price_level)))}</span> : null}
          </div>
          {restaurant.recommendationReason && <span className="recommendation-reason">{restaurant.recommendationReason}</span>}
        </div>
      </button>
      <button type="button" className={`recommendation-favourite ${favourite ? "active" : ""}`} onClick={() => onFavourite(restaurant)} aria-label={favourite ? "Remove from favourites" : "Add to favourites"}><Heart size={15} fill={favourite ? "currentColor" : "none"} /></button>
      <button type="button" className="recommendation-details-button" onClick={() => onSelect(restaurant)}>Details <ArrowRight size={14} /></button>
    </article>
  );
}

function Onboarding({ options, selected, setSelected, onSave, onSkip, saving }) {
  const toggle = (cuisine) => setSelected((current) => current.includes(cuisine)
    ? current.filter((value) => value !== cuisine)
    : [...current, cuisine]);
  return (
    <section className="recommendation-onboarding">
      <div>
        <p className="recommendation-eyebrow">WELCOME TO FOODSCOUT ✨</p>
        <h2>Let&apos;s find your food <em>favourites.</em></h2>
        <p>Tell us what you enjoy and we&apos;ll make your first recommendations more relevant. You can change this anytime.</p>
      </div>
      <div className="onboarding-picker">
        <h3>Choose your cuisines</h3>
        <div className="onboarding-chips">
          {CUISINES.map((cuisine) => (
            <button type="button" key={cuisine} className={selected.includes(cuisine) ? "active" : ""} onClick={() => toggle(cuisine)}>{cuisine}</button>
          ))}
        </div>
        <div className="onboarding-actions">
          <button type="button" className="recommendation-primary" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save preferences"} <ArrowRight size={15} /></button>
          <button type="button" className="recommendation-secondary" onClick={onSkip} disabled={saving}>Skip for now</button>
        </div>
      </div>
    </section>
  );
}

export default function RecommendationsPage({ session, onNavigate, onLogout }) {
  const saved = loadSavedLocation();
  const persisted = loadDiscoveryState();
  const location = persisted?.location || saved || DEFAULT_LOCATION;
  const [restaurants, setRestaurants] = useState(persisted?.results || []);
  const [preferences, setPreferences] = useState({ cuisines: [], configured: false });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("all");
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({ display_name: session.user.name, avatar_url: null });
  const [favourites, setFavourites] = useState(new Set());
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [showAllCuisines, setShowAllCuisines] = useState(false);
  const locationAvailable = Boolean(persisted?.location || saved);

  useEffect(() => {
    let active = true;
    getUserPreferences(session.token).then((value) => {
      if (active) {
        setPreferences(value);
        setSelectedCuisines(value.cuisines);
        setPreferencesLoaded(true);
      }
    }).catch((requestError) => {
      if (active) {
        setPreferencesLoaded(true);
        setError(requestError.message);
      }
    });
    return () => { active = false; };
  }, [session.token]);

  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(session.token), getFavorites(session.token)])
      .then(([profileValue, favoriteRows]) => {
        if (!active) return;
        setProfile(profileValue);
        setFavourites(new Set(favoriteRows.map((favorite) => favorite.place_id)));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, [session.token]);

  const loadNearby = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await getNearbyRestaurants({ lat: location.lat, lng: location.lng, radiusKm: 10, type: "restaurant", token: session.token });
      setRestaurants(results);
    } catch (requestError) {
      setError(requestError.message || "Recommendations could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurants.length) loadNearby();
    // Initial discovery uses the persisted or fallback location only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (cuisines) => {
    setSaving(true);
    try {
      const value = await saveUserPreferences(session.token, cuisines);
      setPreferences(value);
      setSelectedCuisines(value.cuisines);
      setPreferenceMessage(cuisines.length
        ? "Taste preferences saved."
        : "Preferences skipped. Recommendations use nearby and popular places.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const ranked = useMemo(() => rankRecommendations(restaurants, { location, cuisines: preferences.cuisines }), [restaurants, location, preferences.cuisines]);
  const availableCuisines = useMemo(() => recommendationCuisineOptions(restaurants), [restaurants]);
  const visible = useMemo(() => ranked.filter((restaurant) => {
    const text = `${restaurant.name} ${(restaurant.cuisine || []).join(" ")}`.toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase()))
      && (cuisine === "all" || restaurant.cuisine?.includes(cuisine));
  }), [cuisine, query, ranked]);
  const selected = visible.find((restaurant) => restaurant.id === selectedId);
  const mapRestaurants = visible.filter((restaurant) => Number.isFinite(Number(restaurant.lat)) && Number.isFinite(Number(restaurant.lng)));
  const { records, retry } = useRestaurantDetails(selected, selectedId, session.token);

  const selectRestaurant = (restaurant) => {
    setSelectedId(restaurant.id);
    recordUserActivity(session.token, "restaurant_selected", restaurant.id).catch((requestError) => {
      console.warn("Could not save restaurant activity.", requestError);
    });
  };

  const toggleFavourite = async (restaurant) => {
    const isFavourite = favourites.has(restaurant.id);
    try {
      if (isFavourite) {
        await removeFavorite(session.token, restaurant.id);
        setFavourites((current) => {
          const next = new Set(current);
          next.delete(restaurant.id);
          return next;
        });
      } else {
        await addFavorite(session.token, restaurant.id);
        setFavourites((current) => new Set(current).add(restaurant.id));
      }
      recordUserActivity(session.token, isFavourite ? "favorite_removed" : "favorite_added", restaurant.id).catch((requestError) => {
        console.warn("Could not save favourite activity.", requestError);
      });
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const profileText = preferences.cuisines.length
    ? preferences.cuisines.join(" · ")
    : "Nearby and popular picks — taste profile not set";
  const topRated = [...restaurants].filter((restaurant) => restaurant.rating != null).sort((a, b) => b.rating - a.rating)[0];
  const trending = [...restaurants].filter((restaurant) => restaurant.review_count > 0).sort((a, b) => b.review_count - a.review_count)[0];
  const similar = ranked.find((restaurant) => restaurant.recommendationReason === "Matches your cuisine preferences") || ranked[1];

  return (
    <main className="recommendations-page">
      <header className="recommendations-nav">
        <a className="landing-brand" href="#" aria-label="FoodScout home"><span className="landing-brand-mark"><Utensils size={19} /></span>food<span>scout</span></a>
        <nav>
          <button type="button" onClick={() => onNavigate("discover")}>Discover</button>
          <button type="button" className="active" onClick={() => onNavigate("recommendations")}>Recommendations</button>
        </nav>
        <div className="recommendations-nav-actions"><span><MapPin size={14} /> Jodhpur, RJ</span><button type="button" className="recommendations-avatar" onClick={onLogout} aria-label="Log out">{(profile.display_name || session.user.name || "FS").slice(0, 2).toUpperCase()}</button></div>
      </header>

      <section className="recommendations-header">
        <div>
          <p className="recommendation-eyebrow"><Sparkles size={14} /> CURATED FOR YOUR TASTE</p>
          <h1>Recommendations <em>for You.</em></h1>
          <p>{preferences.configured
            ? "Picks based on your saved cuisines, ratings, reviews and nearby distance."
            : "No taste profile yet. These picks use nearby places, ratings and review popularity."}</p>
        </div>
        <div className="food-profile"><strong>{profile.display_name || "Your Food Profile"}</strong><span>{profileText}</span><small>{preferences.cuisines.length} cuisines saved</small></div>
      </section>

      {!locationAvailable && (
        <p className="recommendation-location-note" role="status">Location not saved. Showing Jodhpur fallback results until you share or select a location.</p>
      )}

      {preferencesLoaded && !preferences.configured && (
        <Onboarding options={availableCuisines} selected={selectedCuisines} setSelected={setSelectedCuisines} saving={saving} onSave={() => save(selectedCuisines)} onSkip={() => save([])} />
      )}
      {preferenceMessage && <p className="recommendation-save-message" role="status">{preferenceMessage}</p>}

      <section className={`recommendation-map-shell view-${view}`}>
        <div className="recommendation-map">
          {loading && <div className="recommendation-loading"><LoaderCircle className="spin" size={22} /> Loading recommendations…</div>}
          {!loading && !restaurants.length && <div className="recommendation-empty"><Utensils size={24} /><strong>No restaurant data yet</strong><span>Load nearby places to create your recommendations.</span><button type="button" onClick={loadNearby}>Find nearby restaurants</button></div>}
          <MapView userLocation={location} restaurants={mapRestaurants} selectedId={selectedId} onSelect={setSelectedId} radiusKm={10} />
        </div>
        <div className="curated-panel">
          <div className="curated-header">
            <div><p className="recommendation-eyebrow">RECOMMENDED NEARBY</p><h2>Curated Nearby <span>{visible.length}</span></h2></div>
            <div className="view-toggle"><button type="button" className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map View</button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List View</button></div>
          </div>
          <div className="recommendation-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search curated spots..." aria-label="Search recommendations" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear recommendation search"><X size={14} /></button>}</div>
          <div className="recommendation-chips">
            <button type="button" className={cuisine === "all" ? "active" : ""} onClick={() => setCuisine("all")}>All</button>
            {[...new Set([...CUISINES, ...availableCuisines])].slice(0, showAllCuisines ? 12 : 5).map((item) => <button type="button" key={item} className={cuisine === item ? "active" : ""} onClick={() => setCuisine(item)}>{item}</button>)}
            {[...new Set([...CUISINES, ...availableCuisines])].length > 5 && (
              <button type="button" className="recommendation-more-cuisines" onClick={() => setShowAllCuisines((show) => !show)} aria-expanded={showAllCuisines}>
                {showAllCuisines ? "Fewer" : "More"}
              </button>
            )}
          </div>
          <div className={`recommendation-list ${view === "map" ? "recommendation-list-map" : ""}`}>
            {error && <p className="recommendation-error">{error}</p>}
            {!loading && restaurants.length > 0 && !visible.length && <div className="recommendation-empty small"><strong>No matching restaurants</strong><span>Try another cuisine or search.</span></div>}
            {visible.map((restaurant) => <RecommendationCard key={restaurant.id} restaurant={restaurant} selected={selectedId === restaurant.id} favourite={favourites.has(restaurant.id)} onSelect={selectRestaurant} onFavourite={toggleFavourite} />)}
          </div>
        </div>
        {selected && <RestaurantDetails restaurant={selected} record={records} onClose={() => setSelectedId(null)} onRetry={() => retry(selected.id)} />}
      </section>
      <section className="recommendation-highlights" aria-label="Recommendation categories">
        {[
          ["Top Rated Around You", topRated, "Highest rated restaurants nearby"],
          ["Trending This Week", trending, "Popular choices based on review volume"],
          ["Similar to Your Favourites", similar, "Matches your saved cuisine preferences"]
        ].map(([title, restaurant, subtitle]) => (
          <button type="button" className="recommendation-highlight" key={title} onClick={() => restaurant && selectRestaurant(restaurant)}>
            <Sparkles size={22} />
            <span><strong>{title}</strong><small>{restaurant ? `${subtitle} · ${restaurant.name}` : "More recommendations appear after discovery"}</small></span>
            <ArrowRight size={16} />
          </button>
        ))}
      </section>
    </main>
  );
}
