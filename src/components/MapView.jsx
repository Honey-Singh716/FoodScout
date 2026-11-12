import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";

const restaurantIcon = new L.DivIcon({
  className: "restaurant-marker-wrap",
  html: '<div class="restaurant-marker"><span>🍴</span></div>',
  iconSize: [34, 42],
  iconAnchor: [17, 38]
});

const selectedIcon = new L.DivIcon({
  className: "restaurant-marker-wrap",
  html: '<div class="restaurant-marker selected"><span>🍴</span></div>',
  iconSize: [38, 46],
  iconAnchor: [19, 42]
});

const userIcon = new L.DivIcon({
  className: "user-marker-wrap",
  html: '<div class="user-marker"><span></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

function MapController({ center, selected }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      if (container.offsetWidth && container.offsetHeight) map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    const container = map.getContainer();
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)
      || !container.offsetWidth || !container.offsetHeight) return;
    map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [center?.lat, center?.lng, map]);

  useEffect(() => {
    const container = map.getContainer();
    if (!selected || !Number.isFinite(selected.lat) || !Number.isFinite(selected.lng)
      || !container.offsetWidth || !container.offsetHeight) return;
    map.flyTo([selected.lat, selected.lng], 16, { duration: 0.7 });
  }, [selected?.id, map]);

  return null;
}

export default function MapView({ userLocation, restaurants, selectedId, onSelect, radiusKm }) {
  const center = userLocation || { lat: 26.2866, lng: 73.0300 };

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={14} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController center={userLocation} selected={restaurants.find(r => r.id === selectedId)} />
      {userLocation && (
        <>
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>
          <Circle center={[userLocation.lat, userLocation.lng]} radius={radiusKm * 1000}
            pathOptions={{ color: "#7c9b65", fillColor: "#a8c69a", fillOpacity: 0.07, weight: 1 }} />
        </>
      )}
      {restaurants.map((restaurant) => (
        <Marker
          key={restaurant.id}
          position={[restaurant.lat, restaurant.lng]}
          icon={restaurant.id === selectedId ? selectedIcon : restaurantIcon}
          eventHandlers={{ click: () => onSelect(restaurant.id) }}
        >
          <Popup>
            <strong>{restaurant.name}</strong><br />
            {restaurant.address}<br />
            {restaurant.rating ? `★ ${restaurant.rating.toFixed(1)}` : "Rating unavailable"}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
