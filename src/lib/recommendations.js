import { distanceKm } from "./geo.js";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function rankRecommendations(restaurants, { location, cuisines = [] } = {}) {
  const preferred = new Set(cuisines.map((cuisine) => cuisine.toLowerCase()));
  return restaurants
    .map((restaurant, index) => {
      const rating = finite(restaurant.rating);
      const reviews = finite(restaurant.review_count);
      const distance = location && Number.isFinite(Number(restaurant.lat)) && Number.isFinite(Number(restaurant.lng))
        ? distanceKm(location, restaurant)
        : null;
      const cuisineMatch = restaurant.cuisine?.some((cuisine) => preferred.has(String(cuisine).toLowerCase()));
      const ratingScore = rating == null ? 0 : rating / 5;
      const reviewScore = reviews == null ? 0 : Math.min(Math.log10(reviews + 1) / 4, 1);
      const distanceScore = distance == null ? 0 : Math.max(0, 1 - distance / 15);
      const score = (cuisineMatch ? 0.45 : 0) + ratingScore * 0.3 + reviewScore * 0.15 + distanceScore * 0.1;
      return { ...restaurant, distance, recommendationScore: score, _index: index, cuisineMatch };
    })
    .sort((first, second) => second.recommendationScore - first.recommendationScore || first._index - second._index)
    .map(({ _index, recommendationScore, cuisineMatch, ...restaurant }) => ({
      ...restaurant,
      recommendationReason: cuisineMatch
        ? "Matches your cuisine preferences"
        : restaurant.rating != null && restaurant.rating >= 4.5
          ? "Highly rated nearby"
          : restaurant.review_count > 100
            ? "Popular with local diners"
            : restaurant.distance != null
              ? "A nearby pick"
              : null
    }));
}

export function recommendationCuisineOptions(restaurants) {
  return [...new Set(restaurants.flatMap((restaurant) => (
    Array.isArray(restaurant.cuisine) ? restaurant.cuisine : []
  )))].filter(Boolean).slice(0, 8);
}
