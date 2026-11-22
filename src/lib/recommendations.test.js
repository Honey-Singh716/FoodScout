import assert from "node:assert/strict";
import test from "node:test";
import { rankRecommendations } from "./recommendations.js";

const restaurants = [
  { id: "italian", name: "Pasta Place", cuisine: ["Italian"], rating: 4.2, review_count: 40, lat: 26.28, lng: 73.03 },
  { id: "indian", name: "Spice House", cuisine: ["Indian"], rating: 4.8, review_count: 800, lat: 26.29, lng: 73.03 },
  { id: "missing", name: "Unknown", cuisine: [], rating: null, review_count: null, lat: 26.3, lng: 73.03 }
];

test("ranks preference matches transparently without inventing fields", () => {
  const result = rankRecommendations(restaurants, {
    location: { lat: 26.28, lng: 73.03 },
    cuisines: ["Italian"]
  });
  assert.equal(result[0].id, "italian");
  assert.equal(result.find((restaurant) => restaurant.id === "missing").rating, null);
  assert.equal(result.find((restaurant) => restaurant.id === "missing").recommendationReason, "A nearby pick");
});
