import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortRestaurants } from "./restaurantFilters.js";

const location = { lat: 26.28, lng: 73.03 };
const restaurants = [
  { id: "a", name: "Green Cafe", cuisine: ["Cafe"], rating: 4.8, review_count: 100, price_level: 2, open_now: true, lat: 26.281, lng: 73.031 },
  { id: "b", name: "Spice House", cuisine: ["Indian"], rating: 4.2, review_count: 900, price_level: 1, open_now: false, lat: 26.29, lng: 73.03 },
  { id: "c", name: "Unknown Kitchen", cuisine: ["Indian"], rating: null, review_count: null, price_level: null, open_now: null, lat: 26.282, lng: 73.03 },
  { id: "d", name: "No Coordinates", cuisine: ["Cafe"], rating: 4.9, review_count: 50, price_level: 3, open_now: true }
];

test("combines text, cuisine, rating, price, and open filters locally", () => {
  const result = filterAndSortRestaurants(restaurants, {
    location,
    query: "green",
    cuisine: "Cafe",
    minRating: "4.5",
    priceLevel: "2",
    openStatus: "open"
  });
  assert.deepEqual(result.map((restaurant) => restaurant.id), ["a"]);
});

test("sorts by rating and keeps missing values last", () => {
  const result = filterAndSortRestaurants(restaurants, { location, sortBy: "rating" });
  assert.deepEqual(result.map((restaurant) => restaurant.id), ["d", "a", "b", "c"]);
});

test("does not invent distance or missing-field values", () => {
  const result = filterAndSortRestaurants(restaurants, { location });
  const missing = result.find((restaurant) => restaurant.id === "d");
  assert.equal(missing.distance, null);
  assert.equal(result.some((restaurant) => restaurant.id === "c"), true);
});

test("supports review sorting and reset-equivalent defaults", () => {
  const result = filterAndSortRestaurants(restaurants, { location, sortBy: "reviews" });
  assert.deepEqual(result.map((restaurant) => restaurant.id), ["b", "a", "d", "c"]);
  const reset = filterAndSortRestaurants(restaurants, { location });
  assert.equal(reset.length, 4);
});
