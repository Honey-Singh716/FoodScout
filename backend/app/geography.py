import re


def normalize_city(value: str) -> str:
    parts = [part.strip().lower() for part in value.split(",") if part.strip()]
    ignored = {"india", "in", "rajasthan", "ncr"}
    candidate = next((part for part in reversed(parts) if part not in ignored), parts[-1] if parts else "unknown")
    return re.sub(r"[^a-z0-9]+", "-", candidate).strip("-") or "unknown"


def geo_cell(lat: float, lng: float, precision: int = 2) -> str:
    scale = 10 ** precision
    return f"{round(lat * scale) / scale:.{precision}f}:{round(lng * scale) / scale:.{precision}f}"


def area_cell(city_id: str) -> str:
    return f"area:{city_id}"
