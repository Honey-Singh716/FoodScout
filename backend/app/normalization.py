import re
from typing import Any
from urllib.parse import quote_plus


def clean_text(value: Any, limit: int = 1200) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    return text[:limit] if text else None


def http_url(value: Any) -> str | None:
    text = clean_text(value)
    if not text or not text.startswith(("http://", "https://")):
        return None
    return text


def number(value: Any) -> float | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def rating(value: Any) -> float | None:
    result = number(value)
    return result if result is not None and 0 <= result <= 5 else None


def review_count(value: Any) -> int | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    match = re.search(r"\d[\d,]*", str(value))
    return int(match.group(0).replace(",", "")) if match else None


def opening_hours(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return []
    return [
        {"day": str(day), "hours": str(hours)}
        for day, hours in value.items()
        if hours is not None and str(hours).strip()
    ]


def photos(item: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    thumbnail = http_url(item.get("thumbnail"))
    if thumbnail:
        urls.append(thumbnail)
    images = item.get("images")
    if isinstance(images, list):
        for image in images:
            if isinstance(image, str):
                url = image
            elif isinstance(image, dict):
                url = image.get("thumbnail") or image.get("image") or image.get("serpapi_thumbnail")
            else:
                url = None
            url = http_url(url)
            if url and url not in urls:
                urls.append(url)
            if len(urls) >= 8:
                break
    return urls


def normalize_discovery_result(item: dict[str, Any]) -> dict[str, Any] | None:
    point = item.get("gps_coordinates") or {}
    lat = number(point.get("latitude"))
    lng = number(point.get("longitude"))
    if lat is None or lng is None:
        return None

    title = item.get("title") or "Unnamed place"
    address = item.get("address") or "Address unavailable"
    place_id = item.get("place_id") or item.get("data_id") or f"{lat}:{lng}"
    links = item.get("links") if isinstance(item.get("links"), dict) else {}
    maps_url = links.get("directions") or (
        "https://www.google.com/maps/search/?api=1&query="
        + quote_plus(f"{title}, {address}")
    )
    return {
        "id": str(place_id),
        "name": title,
        "cuisine": [item["type"]] if item.get("type") else [],
        "rating": rating(item.get("rating")),
        "review_count": review_count(item.get("reviews")) or 0,
        "price_level": None,
        "price_label": item.get("price") if isinstance(item.get("price"), str) else None,
        "address": address,
        "lat": lat,
        "lng": lng,
        "open_now": None,
        "image_url": item.get("thumbnail"),
        "maps_url": maps_url,
        "phone": item.get("phone"),
        "website": item.get("website"),
        "hours": item.get("hours") or item.get("open_state"),
        "opening_hours": opening_hours(item.get("hours")),
        "description": item.get("description"),
        "photos": photos(item),
        "source": "SerpApi Google Maps results",
    }


def normalize_discovery_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("local_results") or []
    results = [
        normalized
        for item in raw
        if isinstance(item, dict) and (normalized := normalize_discovery_result(item))
    ]
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for result in results:
        if result["id"] in seen:
            continue
        seen.add(result["id"])
        unique.append(result)
    return unique
