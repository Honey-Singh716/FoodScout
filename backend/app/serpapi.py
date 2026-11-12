import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

SERPAPI_URL = "https://serpapi.com/search.json"
API_KEY = os.getenv("SERPAPI_API_KEY", "").strip()
SERPAPI_REQUEST_COUNTS = {"search": 0, "details": 0}


def get_serpapi_request_count() -> int:
    return sum(SERPAPI_REQUEST_COUNTS.values())


def get_serpapi_request_counts() -> dict[str, int]:
    return dict(SERPAPI_REQUEST_COUNTS)


def reset_serpapi_request_count() -> None:
    for key in SERPAPI_REQUEST_COUNTS:
        SERPAPI_REQUEST_COUNTS[key] = 0


def scrub(message: Any) -> str:
    text = str(message)
    if API_KEY and API_KEY != "PASTE_YOUR_SERPAPI_KEY_HERE" and API_KEY in text:
        text = text.replace(API_KEY, "[redacted]")
    return text[:300]


async def serpapi_search(params: dict[str, Any], request_kind: str = "search") -> dict[str, Any]:
    if not API_KEY or API_KEY == "PASTE_YOUR_SERPAPI_KEY_HERE":
        raise HTTPException(
            status_code=503,
            detail="SerpApi key missing. Add SERPAPI_API_KEY to backend/.env and restart FastAPI.",
        )
    request_params = {**params, "engine": "google_maps", "api_key": API_KEY, "hl": "en", "gl": "in"}
    if request_kind not in SERPAPI_REQUEST_COUNTS:
        request_kind = "search"
    SERPAPI_REQUEST_COUNTS[request_kind] += 1
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.get(SERPAPI_URL, params=request_params)
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="SerpApi request timed out. Please retry.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"SerpApi returned HTTP {exc.response.status_code}.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not read a valid response from SerpApi.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Could not read a valid response from SerpApi.")
    if payload.get("error"):
        raise HTTPException(status_code=502, detail=f"SerpApi error: {scrub(payload['error'])}")
    return payload
