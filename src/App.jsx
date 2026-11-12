import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LocateFixed, Search, SlidersHorizontal, Map as MapIcon, List,
  MapPin, Utensils, ChevronDown, AlertCircle, LoaderCircle, Locate,
  Navigation, X
} from "lucide-react";
import MapView from "./components/MapView";
import RestaurantCard from "./components/RestaurantCard";
import RestaurantDetails from "./components/RestaurantDetails";
import { getNearbyRestaurants, searchRestaurantsByArea } from "./lib/api";
import { distanceKm } from "./lib/geo";
import { useRestaurantDetails } from "./hooks/useRestaurantDetails";
import {
  formatLocationAge,
  loadSavedLocation,
  MAX_LOCATION_ACCURACY_METERS,
  saveDeviceLocation
} from "./lib/locationStorage";
import { loadDiscoveryState, loadPreferences, saveDiscoveryState, savePreferences } from "./lib/discoveryStorage";
import { recordBrowserGpsRequest } from "./lib/requestMetrics";

const DEFAULT_CENTER = { lat: 26.2866, lng: 73.0300 }; // Jodhpur fallback, not the user's exact location.
const GPS_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const MOVEMENT_THRESHOLD_KM = 0.1;

export default function App() {
  const [savedLocation] = useState(loadSavedLocation);
  const [savedDiscovery] = useState(loadDiscoveryState);
  const [preferences] = useState(loadPreferences);
  const restoredLocation = savedDiscovery?.location || savedLocation;
  const restoredDeviceLocation = savedLocation && restoredLocation
    && distanceKm(savedLocation, restoredLocation) <= MOVEMENT_THRESHOLD_KM
    ? savedLocation
    : null;
  const [location, setLocation] = useState(() => (
    restoredLocation
      ? { lat: restoredLocation.lat, lng: restoredLocation.lng }
      : DEFAULT_CENTER
  ));
  const [locationMeta, setLocationMeta] = useState(restoredDeviceLocation);
  const [locationLabel, setLocationLabel] = useState(() => (
    savedDiscovery?.areaSearchActive
      ? "Saved search location"
      : savedLocation ? "Saved device location" : "Jodhpur demo area"
  ));
  const [restaurants, setRestaurants] = useState(() => savedDiscovery?.results || []);
  const [radius, setRadius] = useState(() => Number(preferences.radius) || 3);
  const [query, setQuery] = useState(() => preferences.query || "");
  const [areaQuery, setAreaQuery] = useState(() => preferences.areaQuery || "");
  const [type, setType] = useState(() => preferences.type || savedDiscovery?.type || "restaurant");
  const [cuisineFilter, setCuisineFilter] = useState(() => preferences.cuisineFilter || "all");
  const [ratingFilter, setRatingFilter] = useState(() => preferences.ratingFilter || "all");
  const [priceFilter, setPriceFilter] = useState(() => preferences.priceFilter || "all");
  const [areaSearchActive, setAreaSearchActive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchingArea, setSearchingArea] = useState(false);
  const [error, setError] = useState("");
  const [cacheStatus, setCacheStatus] = useState(() => savedDiscovery?.cache || null);
  const [view, setView] = useState(() => (
    window.matchMedia("(max-width: 680px)").matches ? "list" : "split"
  ));
  const [discoveryGeneration, setDiscoveryGeneration] = useState(0);
  const visibleRef = useRef([]);
  const areaSearchControllerRef = useRef(null);
  const locationRequestRef = useRef(false);
  const initialDiscoveryRef = useRef(true);
  const lastDiscoveryContextRef = useRef(savedDiscovery ? {
    lat: savedDiscovery.location?.lat,
    lng: savedDiscovery.location?.lng,
    type: savedDiscovery.type
  } : null);

  useEffect(() => {
    savePreferences({ radius, query, areaQuery, type, cuisineFilter, ratingFilter, priceFilter });
  }, [radius, query, areaQuery, type, cuisineFilter, ratingFilter, priceFilter]);

  useEffect(() => {
    if (!restaurants.length || !location) return;
    saveDiscoveryState({ results: restaurants, location, cache: cacheStatus, type, areaSearchActive });
  }, [restaurants, location, cacheStatus, type, areaSearchActive]);

  const requestLocation = useCallback(() => {
    if (locationRequestRef.current) return;
    const currentSaved = loadSavedLocation();
    if (currentSaved && Date.now() - currentSaved.lastUpdatedAt < GPS_COOLDOWN_MS) {
      setLocation({ lat: currentSaved.lat, lng: currentSaved.lng });
      setLocationMeta(currentSaved);
      setAreaSearchActive(false);
      setLocationLabel("Saved device location");
      setError("Using your recently saved location. Fresh GPS is available after the 3-hour cooldown.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Your browser does not support location refresh. The existing location is being used.");
      return;
    }

    setLocating(true);
    locationRequestRef.current = true;
    setError("");
    recordBrowserGpsRequest();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = saveDeviceLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          lastUpdatedAt: Date.now()
        });
        if (!nextLocation) {
          setError(`Location accuracy is too low. The existing location is preserved (required: ${MAX_LOCATION_ACCURACY_METERS}m or better).`);
          setLocating(false);
          locationRequestRef.current = false;
          return;
        }
        const previous = currentSaved || locationMeta;
        const movement = previous
          ? distanceKm(previous, { lat: nextLocation.lat, lng: nextLocation.lng })
          : Infinity;
        setLocation({ lat: nextLocation.lat, lng: nextLocation.lng });
        setLocationMeta(nextLocation);
        setAreaSearchActive(false);
        setLocationLabel("Your current location");
        setLocating(false);
        locationRequestRef.current = false;
        if (movement <= MOVEMENT_THRESHOLD_KM) {
          setError("Location refreshed. Your existing restaurant results were reused.");
        } else {
          setDiscoveryGeneration((generation) => generation + 1);
        }
      },
      (geoError) => {
        setLocating(false);
        locationRequestRef.current = false;
        const message = geoError.code === 1
          ? "Location permission was denied. Your existing location is preserved."
          : geoError.code === 2
            ? "Your location is unavailable. Your existing location is preserved."
            : "Location refresh timed out. Your existing location is preserved.";
        setError(message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [locationMeta]);

  useEffect(() => {
    if (!location || areaSearchActive) return;
    if (initialDiscoveryRef.current) {
      initialDiscoveryRef.current = false;
      return;
    }
    const previous = lastDiscoveryContextRef.current;
    const coverageRadius = Number(cacheStatus?.coverage_radius_km);
    const searchCenter = cacheStatus?.search_center;
    const covered = searchCenter && Number.isFinite(coverageRadius)
      && distanceKm(location, searchCenter) + radius <= coverageRadius;
    const sameLocation = previous
      && distanceKm(location, { lat: previous.lat, lng: previous.lng }) <= MOVEMENT_THRESHOLD_KM;
    const sameType = previous?.type === type;
    if (restaurants.length && sameType && (sameLocation || covered) && cacheStatus?.status !== "expired") {
      lastDiscoveryContextRef.current = { lat: location.lat, lng: location.lng, type };
      return;
    }
    areaSearchControllerRef.current?.abort();
    const controller = new AbortController();
    areaSearchControllerRef.current = controller;
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getNearbyRestaurants({
          lat: location.lat,
          lng: location.lng,
          radiusKm: radius,
          type,
          signal: controller.signal,
          onCacheMeta: setCacheStatus
        });
        if (active) {
          setRestaurants(data);
          lastDiscoveryContextRef.current = { lat: location.lat, lng: location.lng, type };
        }
      } catch (err) {
        if (active && err.name !== "AbortError") {
          setError("Couldn't load restaurants. Check that your FastAPI backend is running and try again.");
          setRestaurants([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; controller.abort(); };
  }, [location, type, areaSearchActive, discoveryGeneration]); // Radius is filtered locally; changing it should not spend another SerpApi search credit.

  const searchArea = async (event) => {
    event.preventDefault();
    const value = areaQuery.trim();
    if (value.length < 2) { setError("Enter a city, area or landmark (at least 2 characters)."); return; }
    const controller = new AbortController();
    setSearchingArea(true);
    setLoading(true);
    setError("");
    try {
      const results = await searchRestaurantsByArea({
        query: value,
        type,
        signal: controller.signal,
        onCacheMeta: setCacheStatus
      });
      if (!results.length) { setRestaurants([]); setError("No results returned. Try a nearby area or a broader search."); return; }
      // SerpApi's Maps search returns business coordinates, not a geocoded area centroid.
      // Use the first result as a practical map anchor and disclose this in the UI.
      const anchor = { lat: results[0].lat, lng: results[0].lng };
      setRestaurants(results);
      setLocation(anchor);
      setAreaSearchActive(true);
      setLocationLabel(`Search results: ${value}`);
      setSelectedId(null);
    } catch (err) {
      setError(err.message || "Area search failed. Check the backend and try again.");
    } finally {
      if (areaSearchControllerRef.current === controller) areaSearchControllerRef.current = null;
      setSearchingArea(false);
      setLoading(false);
    }
  };

  const visibleRestaurants = useMemo(() => {
    if (!location) return [];
    return restaurants
      .map((restaurant) => ({
        ...restaurant,
        distance: distanceKm(location, { lat: restaurant.lat, lng: restaurant.lng })
      }))
      .filter((restaurant) => restaurant.distance <= radius)
      .filter((restaurant) => {
        const text = `${restaurant.name} ${restaurant.address} ${(restaurant.cuisine || []).join(" ")}`.toLowerCase();
        return text.includes(query.toLowerCase().trim());
      })
      .filter((restaurant) => cuisineFilter === "all" || restaurant.cuisine.includes(cuisineFilter))
      .filter((restaurant) => ratingFilter === "all" || (restaurant.rating != null && restaurant.rating >= Number(ratingFilter)))
      .filter((restaurant) => priceFilter === "all" || String(restaurant.price_level) === priceFilter)
      .sort((a, b) => a.distance - b.distance);
  }, [restaurants, location, radius, query, cuisineFilter, ratingFilter, priceFilter]);

  const cuisineOptions = useMemo(() => (
    [...new Set(restaurants.flatMap((restaurant) => restaurant.cuisine || []))]
      .filter(Boolean)
      .slice(0, 5)
  ), [restaurants]);

  const selected = visibleRestaurants.find((r) => r.id === selectedId);
  const { records: detailRecords, retry: retryDetails } = useRestaurantDetails(selected, selectedId);
  visibleRef.current = visibleRestaurants;
  const savedLocationIsOld = locationMeta && Date.now() - locationMeta.lastUpdatedAt > 86400000;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="FoodScout home">
          <div className="brand-mark"><Utensils size={19} /></div>
          <span>food<span>scout</span></span>
        </a>
        <div className="top-location">
          <MapPin size={15} />
          <span className="location-copy">
            <strong>{locationLabel}</strong>
            {locationMeta && !areaSearchActive && (
              <small className={savedLocationIsOld ? "location-stale" : ""}>
                {savedLocationIsOld ? "Older saved location" : "Updated"} {formatLocationAge(locationMeta.lastUpdatedAt)}
              </small>
            )}
          </span>
          <button className="icon-button" onClick={requestLocation} title="Refresh location" aria-label="Refresh location" disabled={locating}>
            {locating ? <LoaderCircle className="spin" size={16} /> : <LocateFixed size={16} />}
          </button>
        </div>
        <div className="topbar-right">
          <span className="phase-pill">DISCOVER · SERPAPI</span>
          <div className="avatar">FS</div>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">GOOD FOOD, CLOSER TO YOU</p>
          <h1>Find your next <em>favourite.</em></h1>
          <p className="subheading">Explore restaurants around you. Compare the basics and pick your next stop.</p>
        </div>
        <div className="heading-decoration"><span>✳</span><span>✳</span><span>✳</span></div>
      </section>

      <section className="workspace">
        <aside className={`sidebar ${view === "map" ? "mobile-hidden" : ""}`}>
          <form className="area-search-box" onSubmit={searchArea}>
            <MapPin size={17} />
            <input value={areaQuery} onChange={(e) => setAreaQuery(e.target.value)} placeholder="Search city, area or landmark" aria-label="Search city, area or landmark" />
            <button type="submit" disabled={searchingArea}>{searchingArea ? "Searching…" : "Search"}</button>
          </form>
          <div className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search restaurants or cuisine"
              aria-label="Search restaurants or cuisine"
            />
            {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X size={15}/></button>}
          </div>

          <div className="type-filter">
            <label htmlFor="place-type">Place type</label>
            <select id="place-type" value={type} onChange={(e) => {
              setType(e.target.value);
              setAreaSearchActive(false);
              setSelectedId(null);
            }}>
              <option value="restaurant">Restaurants</option><option value="cafe">Cafes</option><option value="bakery">Bakeries</option><option value="meal_takeaway">Takeaway</option><option value="all">All food places</option>
            </select>
          </div>
          <div className="filter-chips" aria-label="Restaurant filters">
            <button type="button" className={cuisineFilter === "all" ? "active" : ""} onClick={() => setCuisineFilter("all")}>All</button>
            {cuisineOptions.map((cuisine) => (
              <button type="button" className={cuisineFilter === cuisine ? "active" : ""} onClick={() => setCuisineFilter(cuisine)} key={cuisine}>
                {cuisine}
              </button>
            ))}
            <select className="filter-chip-select" value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} aria-label="Minimum rating">
              <option value="all">Any rating</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
            <select className="filter-chip-select" value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)} aria-label="Price level">
              <option value="all">Any price</option>
              <option value="1">₹</option>
              <option value="2">₹₹</option>
              <option value="3">₹₹₹</option>
              <option value="4">₹₹₹₹</option>
            </select>
          </div>
          <div className="filter-row">
            <div className="result-count">
              <span className="count-dot"></span>
              <strong>{visibleRestaurants.length}</strong> places nearby
            </div>
            <label className="radius-select">
              <SlidersHorizontal size={14} />
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius">
                <option value={1}>1 km</option>
                <option value={3}>3 km</option>
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>

          {error && <div className="notice"><AlertCircle size={16}/><span>{error}</span></div>}
          {cacheStatus?.status === "stale" && (
            <div className="cache-notice">
              Showing older cached results while a fresh provider update is unavailable.
            </div>
          )}

          <div className="list-heading">
            <div><h2>Restaurants around you</h2><p>Sorted by distance</p></div>
            <span className="sort-label">NEAREST FIRST</span>
          </div>

          <div className="restaurant-list">
            {loading && (
              <div className="loading-state"><LoaderCircle className="spin" size={22}/><span>Finding nearby places...</span></div>
            )}
            {!loading && visibleRestaurants.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon"><Utensils size={22}/></div>
                <strong>No restaurants found</strong>
                <p>Try a larger radius or a different search.</p>
                <button onClick={() => { setRadius(5); setQuery(""); }}>Show more places</button>
              </div>
            )}
            {!loading && visibleRestaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                distance={restaurant.distance}
                selected={selectedId === restaurant.id}
                onClick={() => setSelectedId(restaurant.id)}
              />
            ))}
          </div>
          <div className="sidebar-footnote">Restaurant results are provided by SerpApi. Area searches use the first returned place as the map anchor; radius is measured from that point.</div>
        </aside>

        <section className={`map-panel ${view === "list" ? "mobile-hidden" : ""}`}>
          <div className="map-toolbar">
            <div className="map-label"><span className="live-dot"></span> OPENSTREETMAP <span className="map-separator">·</span> {radius} KM RADIUS</div>
            <button className="locate-button" onClick={requestLocation} disabled={locating}>
              <Locate size={15}/><span>{locating ? "Locating..." : "Refresh location"}</span>
            </button>
          </div>
          <div className="map-frame">
            <MapView
              userLocation={location}
              restaurants={visibleRestaurants}
              selectedId={selectedId}
              onSelect={setSelectedId}
              radiusKm={radius}
            />
            <div className="map-attribution-note"><Navigation size={12}/> Map data © OpenStreetMap</div>
          </div>
        </section>
        {selected && (
          <RestaurantDetails
            restaurant={selected}
            record={detailRecords[selected.id]}
            onClose={() => setSelectedId(null)}
            onRetry={retryDetails}
          />
        )}
      </section>

      <nav className="mobile-tabs">
        <button className={view !== "map" ? "active" : ""} onClick={() => setView("list")}><List size={17}/> List</button>
        <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><MapIcon size={17}/> Map</button>
      </nav>
      <footer className="footer"><span>© 2026 FoodScout</span><span>Discover local. Eat better.</span></footer>
    </main>
  );
}
