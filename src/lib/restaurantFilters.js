import { distanceKm } from "./geo.js";

export const DEFAULT_RESTAURANT_FILTERS = {
  query: "",
  cuisine: "all",
  minRating: "all",
  priceLevel: "all",
  openStatus: "all",
  sortBy: "distance"
};

function validCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function restaurantDistance(location, restaurant) {
  const lat = Number(restaurant.lat);
  const lng = Number(restaurant.lng);
  if (
    !location ||
    !validCoordinate(Number(location.lat), -90, 90) ||
    !validCoordinate(Number(location.lng), -180, 180) ||
    !validCoordinate(lat, -90, 90) ||
    !validCoordinate(lng, -180, 180)
  ) {
    return null;
  }
  return distanceKm(location, { lat, lng });
}

function compareNullableDescending(first, second, field) {
  const firstValue = Number(first[field]);
  const secondValue = Number(second[field]);
  const firstMissing = !Number.isFinite(firstValue);
  const secondMissing = !Number.isFinite(secondValue);
  if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
  if (firstMissing) return 0;
  return secondValue - firstValue;
}

export function filterAndSortRestaurants(
  restaurants,
  {
    location,
    radius = 3,
    query = "",
    cuisine = "all",
    minRating = "all",
    priceLevel = "all",
    openStatus = "all",
    sortBy = "distance"
  } = {}
) {
  const normalizedQuery = query.trim().toLowerCase();
  const minimumRating = minRating === "all" ? null : Number(minRating);
  const selectedPrice = priceLevel === "all" ? null : String(priceLevel);

  return restaurants
    .map((restaurant, index) => ({
      ...restaurant,
      distance: restaurantDistance(location, restaurant),
      _filterIndex: index
    }))
    .filter((restaurant) => restaurant.distance == null || restaurant.distance <= radius)
    .filter((restaurant) => {
      if (!normalizedQuery) return true;
      const text = [
        restaurant.name,
        restaurant.address,
        ...(Array.isArray(restaurant.cuisine) ? restaurant.cuisine : [])
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(normalizedQuery);
    })
    .filter((restaurant) => (
      cuisine === "all" ||
      (Array.isArray(restaurant.cuisine) && restaurant.cuisine.includes(cuisine))
    ))
    .filter((restaurant) => (
      minimumRating == null ||
      (Number.isFinite(Number(restaurant.rating)) && Number(restaurant.rating) >= minimumRating)
    ))
    .filter((restaurant) => (
      selectedPrice == null || String(restaurant.price_level) === selectedPrice
    ))
    .filter((restaurant) => (
      openStatus === "all" ||
      (openStatus === "open" && restaurant.open_now === true) ||
      (openStatus === "closed" && restaurant.open_now === false)
    ))
    .sort((first, second) => {
      if (sortBy === "rating") return compareNullableDescending(first, second, "rating") || first._filterIndex - second._filterIndex;
      if (sortBy === "reviews") return compareNullableDescending(first, second, "review_count") || first._filterIndex - second._filterIndex;
      const firstDistance = first.distance;
      const secondDistance = second.distance;
      if (firstDistance == null || secondDistance == null) {
        if (firstDistance !== secondDistance) return firstDistance == null ? 1 : -1;
        return first._filterIndex - second._filterIndex;
      }
      return firstDistance - secondDistance || first._filterIndex - second._filterIndex;
    })
    .map(({ _filterIndex, ...restaurant }) => restaurant);
}

export function cuisineOptions(restaurants) {
  return [...new Set(
    restaurants.flatMap((restaurant) => Array.isArray(restaurant.cuisine) ? restaurant.cuisine : [])
  )].filter(Boolean).slice(0, 5);
}
