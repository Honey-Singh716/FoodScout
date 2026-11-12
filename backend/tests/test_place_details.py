import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.main import normalize_result
from app.place_details import (
    get_place_details,
    normalize_place_details,
    provider_params_for_place,
    reset_place_detail_state,
)


class PlaceDetailsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        reset_place_detail_state()

    def test_search_result_preserves_detail_fields(self):
        result = normalize_result({
            "place_id": "ChIJ12345678",
            "title": "Cafe",
            "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
            "reviews": "1,234 Reviews",
            "rating": 4.5,
            "type": "Cafe",
            "thumbnail": "https://example.com/thumb.jpg",
            "hours": {"Monday": "9 AM–10 PM"},
            "description": "A local cafe",
        })

        self.assertEqual(result["review_count"], 1234)
        self.assertEqual(result["opening_hours"], [{"day": "Monday", "hours": "9 AM–10 PM"}])
        self.assertEqual(result["photos"], ["https://example.com/thumb.jpg"])

    def test_invalid_place_id_is_rejected(self):
        with self.assertRaises(Exception) as context:
            provider_params_for_place("not valid")
        self.assertEqual(context.exception.status_code, 400)

    async def test_details_normalize_coordinate_directions_url(self):
        normalized = normalize_place_details("ChIJ12345678", {
            "place_results": {
                "title": "Cafe",
                "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
                "type": "Cafe",
                "links": {"directions": "https://provider.example/directions"},
            }
        })

        self.assertEqual(
            normalized.directions_url,
            "https://www.google.com/maps/dir/?api=1&destination=26.2,73.0",
        )

    async def test_details_cache_deduplicates_requests(self):
        payload = {"place_results": {
            "title": "Cafe",
            "address": "Jodhpur",
            "gps_coordinates": {"latitude": 26.2, "longitude": 73.0},
        }}
        search = AsyncMock(return_value=payload)
        with patch("app.place_details.serpapi.serpapi_search", search):
            results = await asyncio.gather(
                get_place_details("ChIJ12345678"),
                get_place_details("ChIJ12345678"),
            )

        self.assertEqual(results[0], results[1])
        search.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
