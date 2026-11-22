from math import radians, sin, cos, asin, sqrt


def distance_km(origin: dict, restaurant: dict) -> float | None:
    lat = origin.get("lat")
    lng = origin.get("lng")
    restaurant_lat = restaurant.get("lat")
    restaurant_lng = restaurant.get("lng")
    if not all(isinstance(value, (int, float)) for value in (lat, lng, restaurant_lat, restaurant_lng)):
        return None
    lat1, lng1, lat2, lng2 = map(radians, (lat, lng, restaurant_lat, restaurant_lng))
    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1
    value = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(value))


def rank_restaurants(restaurants: list[dict], location: dict | None, cuisines: list[str]) -> list[dict]:
    normalized_preferences = {value.strip().lower() for value in cuisines if value.strip()}
    ranked = []
    for restaurant in restaurants:
        categories = {
            str(value).strip().lower()
            for value in restaurant.get("cuisine", [])
            if value is not None
        }
        cuisine_match = bool(normalized_preferences & categories)
        rating = restaurant.get("rating")
        rating_score = rating if isinstance(rating, (int, float)) else 0
        review_count = restaurant.get("review_count")
        review_score = min(review_count if isinstance(review_count, (int, float)) else 0, 10000) / 10000
        distance = distance_km(location or {}, restaurant)
        distance_score = 1 / (1 + distance) if distance is not None else 0
        score = (35 * int(cuisine_match)) + (25 * rating_score / 5) + (20 * review_score) + (20 * distance_score)
        item = dict(restaurant)
        item["recommendation_score"] = round(score, 2)
        item["recommendation_reason"] = "Matches your cuisine preferences" if cuisine_match else None
        ranked.append(item)
    return sorted(ranked, key=lambda item: item["recommendation_score"], reverse=True)
