import { useEffect, useRef } from "react";
import { MapPin, Star, Clock3, ArrowUpRight } from "lucide-react";
import { formatDistance } from "../lib/geo";

function priceLabel(level, label) {
  if (label) return label;
  if (level == null || Number.isNaN(level)) return "Price not listed";
  return "₹".repeat(Math.max(1, Math.min(4, level)));
}

export default function RestaurantCard({ restaurant, distance, selected, onClick }) {
  const cuisine = restaurant.cuisine?.length ? restaurant.cuisine.join(" · ") : "Cuisine not listed";
  const cardRef = useRef(null);

  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button ref={cardRef} className={`restaurant-card ${selected ? "active" : ""}`} onClick={onClick} type="button" aria-pressed={selected}>
      <div className="restaurant-card-top">
        {restaurant.image_url ? (
          <img className="restaurant-thumbnail" src={restaurant.image_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        ) : (
          <div className="restaurant-avatar">{restaurant.name.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="restaurant-main">
          <div className="restaurant-name-row">
            <h3>{restaurant.name}</h3>
            {restaurant.rating != null && (
              <span className="rating"><Star size={13} fill="currentColor" /> {restaurant.rating.toFixed(1)}</span>
            )}
          </div>
          <p>{cuisine}</p>
        </div>
      </div>
      <div className="restaurant-meta">
        <span><MapPin size={13} /> {distance == null ? "Distance unavailable" : formatDistance(distance)}</span>
        <span className="price">{priceLabel(restaurant.price_level, restaurant.price_label)}</span>
        {restaurant.open_now === true && <span className="open"><Clock3 size={12} /> Open now</span>}
        {restaurant.open_now === false && <span className="closed">Closed</span>}
      </div>
      <div className="restaurant-address">
        <span>{restaurant.address || "Address unavailable"}</span>
        <ArrowUpRight size={15} />
      </div>
    </button>
  );
}
