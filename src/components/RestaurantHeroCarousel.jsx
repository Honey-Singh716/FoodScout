import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";
import { distanceKm, formatDistance } from "../lib/geo";

const POSITIONS = ["left", "center", "right"];

function cardPosition(index, activeIndex, length) {
  const offset = (index - activeIndex + length) % length;
  if (offset === 0) return "center";
  if (offset === 1) return "right";
  return "left";
}

export default function RestaurantHeroCarousel({ restaurants, location, onSelect }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const touchStart = useRef(null);
  const transitionTimer = useRef(null);
  const interactionTimer = useRef(null);
  const visibleRestaurants = useMemo(() => restaurants.slice(0, 12), [restaurants]);
  const length = visibleRestaurants.length;

  useEffect(() => {
    if (activeIndex >= length) setActiveIndex(0);
  }, [activeIndex, length]);

  const move = useCallback((direction) => {
    if (animating || length < 2) return;
    setAnimating(true);
    setActiveIndex((index) => (index + direction + length) % length);
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setAnimating(false), 820);
  }, [animating, length]);

  useEffect(() => {
    if (length < 3 || hovered || focused || interactionPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => move(1), 5600);
    return () => window.clearInterval(timer);
  }, [focused, hovered, interactionPaused, length, move]);

  useEffect(() => () => {
    window.clearTimeout(transitionTimer.current);
    window.clearTimeout(interactionTimer.current);
  }, []);

  const pauseAfterInteraction = () => {
    setInteractionPaused(true);
    window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => setInteractionPaused(false), 6000);
  };

  const handleTouchStart = (event) => {
    touchStart.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStart.current == null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) > 45) {
      pauseAfterInteraction();
      move(delta < 0 ? 1 : -1);
    }
  };

  if (!length) {
    return <div className="hero-carousel-empty">Load nearby restaurants to see your local picks here.</div>;
  }

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onPointerDown={pauseAfterInteraction}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="hero-carousel-stage">
        {visibleRestaurants.map((restaurant, index) => {
          const position = length === 1 ? "center" : cardPosition(index, activeIndex, length);
          const calculatedDistance = location && Number.isFinite(Number(restaurant.lat)) && Number.isFinite(Number(restaurant.lng))
            ? distanceKm(location, restaurant)
            : null;
          const distance = calculatedDistance == null ? "Distance unavailable" : formatDistance(calculatedDistance);
          return (
            <button
              className={`hero-restaurant-card hero-card-${position}`}
              key={restaurant.id}
              type="button"
              onClick={() => {
                pauseAfterInteraction();
                if (position === "center") onSelect?.(restaurant);
                else setActiveIndex(index);
              }}
              aria-label={`${position === "center" ? "Open" : "Show"} ${restaurant.name}`}
              aria-current={position === "center" ? "true" : undefined}
            >
              <div className="hero-card-image">
                {restaurant.image_url
                  ? <img src={restaurant.image_url} alt="" loading={position === "center" ? "eager" : "lazy"} />
                  : <div className="hero-card-fallback">{restaurant.name.slice(0, 1).toUpperCase()}</div>}
                <span className="hero-card-badge">FOODSCOUT PICK</span>
              </div>
              <div className="hero-card-copy">
                <strong>{restaurant.name}</strong>
                <span className="hero-card-cuisine">{restaurant.cuisine?.[0] || "Local favourite"}</span>
                <div className="hero-card-meta">
                  <span><Star size={13} fill="currentColor" /> {restaurant.rating == null ? "—" : restaurant.rating.toFixed(1)}</span>
                  <span>{restaurant.review_count ? `${restaurant.review_count.toLocaleString()} reviews` : "Reviews unavailable"}</span>
                  <span><MapPin size={13} /> {distance}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="hero-carousel-controls">
        <button type="button" onClick={() => { pauseAfterInteraction(); move(-1); }} disabled={animating || length < 2} aria-label="Previous restaurant"><ChevronLeft size={18} /></button>
        <div className="hero-carousel-dots" aria-label="Choose restaurant">
          {visibleRestaurants.map((restaurant, index) => (
            <button type="button" key={restaurant.id} className={index === activeIndex ? "active" : ""} onClick={() => { if (!animating) { pauseAfterInteraction(); setActiveIndex(index); } }} aria-label={`Show ${restaurant.name}`} />
          ))}
        </div>
        <button type="button" onClick={() => { pauseAfterInteraction(); move(1); }} disabled={animating || length < 2} aria-label="Next restaurant"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
