import { useEffect } from "react";
import {
  AlertCircle, Clock3, ExternalLink, Globe, LoaderCircle, MapPin,
  Navigation, Phone, Star, X
} from "lucide-react";
import { formatDistance } from "../lib/geo";
import { presentRestaurant } from "../lib/restaurantDetails";

function Missing({ children }) {
  return <span className="details-missing">{children}</span>;
}

export default function RestaurantDetails({ restaurant, record, onClose, onRetry }) {
  const details = presentRestaurant(restaurant, record);
  const status = record?.status || (details.loading ? "loading" : "ready");

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = details.name || "Name unavailable";

  return (
    <section className="details-panel" role="dialog" aria-label={`${title} details`}>
      <header className="details-header">
        <div>
          <div className="selected-kicker">RESTAURANT DETAILS</div>
          <h2>{title}</h2>
        </div>
        <button className="selected-close details-close" type="button" onClick={onClose} aria-label="Close restaurant details">
          <X size={15} />
        </button>
      </header>

      <div className="details-body">
        {status === "loading" && (
          <div className="details-status" role="status">
            <LoaderCircle className="spin" size={16} />
            <span>Loading place details...</span>
          </div>
        )}
        {status === "loading" && (
          <div className="details-skeleton" aria-hidden="true">
            <span className="skeleton-line wide" />
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
          </div>
        )}
        {status === "error" && (
          <div className="notice" role="alert">
            <AlertCircle size={16} />
            <span>
              {record?.error || "Couldn't load restaurant details."}
              <button type="button" className="details-retry" onClick={onRetry}>Try again</button>
            </span>
          </div>
        )}
        {status === "unavailable" && (
          <div className="notice" role="status">
            <AlertCircle size={16} />
            <span>{record?.error || "Additional place details are unavailable for this restaurant."}</span>
          </div>
        )}

        <div className="details-photos" aria-label="Photos">
          {details.photos.length > 0 && details.photos.map((url) => (
            <img key={url} src={url} alt="" onError={(event) => { event.currentTarget.remove(); }} />
          ))}
          {details.photos.length === 0 && (
            <div className="details-photo-empty">
              {details.loading ? "Loading photos..." : "Photos not available"}
            </div>
          )}
        </div>

        <div className="details-rating-row">
          {details.rating == null ? <Missing>Rating not available</Missing> : (
            <span className="rating"><Star size={13} fill="currentColor" /> {Number(details.rating).toFixed(1)}</span>
          )}
          {details.reviewCount == null ? <Missing>Reviews not available</Missing> : (
            <span>{Number(details.reviewCount).toLocaleString()} reviews</span>
          )}
          {Number.isFinite(restaurant.distance) && <span>{formatDistance(restaurant.distance)} away</span>}
        </div>

        <dl className="details-facts">
          <div>
            <dt><MapPin size={14} /> Address</dt>
            <dd>{details.address || <Missing>Address not available</Missing>}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{details.category.length ? details.category.join(" · ") : <Missing>Category not available</Missing>}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>
              {details.description || (details.loading
                ? <Missing>Loading description...</Missing>
                : <Missing>Description not available</Missing>)}
            </dd>
          </div>
          <div>
            <dt><Clock3 size={14} /> Opening hours</dt>
            <dd>
              {details.openState && <p className="details-open-state">{details.openState}</p>}
              {details.openingHours.length > 0 ? (
                <ul className="details-hours">
                  {details.openingHours.map((entry) => (
                    <li key={`${entry.day}-${entry.hours}`}>
                      {entry.day ? <strong>{entry.day}</strong> : null}
                      <span>{entry.hours}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                !details.openState && (details.loading
                  ? <Missing>Loading hours...</Missing>
                  : <Missing>Opening hours not available</Missing>)
              )}
            </dd>
          </div>
          <div>
            <dt><Phone size={14} /> Phone</dt>
            <dd>
              {details.phone
                ? <a href={`tel:${details.phone}`}>{details.phone}</a>
                : <Missing>{details.loading ? "Loading phone..." : "Phone not available"}</Missing>}
            </dd>
          </div>
          <div>
            <dt><Globe size={14} /> Website</dt>
            <dd>
              {details.website
                ? <a href={details.website} target="_blank" rel="noreferrer">{details.website.replace(/^https?:\/\//, "")}</a>
                : <Missing>{details.loading ? "Loading website..." : "Website not available"}</Missing>}
            </dd>
          </div>
        </dl>
      </div>

      <footer className="details-actions">
        {details.directionsUrl ? (
          <a className="details-action primary" href={details.directionsUrl} target="_blank" rel="noreferrer">
            <Navigation size={14} /> Directions
          </a>
        ) : (
          <span className="details-action disabled">Directions not available</span>
        )}
        {details.website ? (
          <a className="details-action" href={details.website} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Website
          </a>
        ) : (
          <span className="details-action disabled">Website not available</span>
        )}
      </footer>
    </section>
  );
}
