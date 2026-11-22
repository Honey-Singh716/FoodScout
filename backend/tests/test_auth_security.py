import base64
import hashlib
import hmac
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auth
from app.main import nearby_restaurants, restaurant_details, search_restaurants


class AuthSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_protected_restaurant_routes_require_bearer_authentication(self):
        with self.assertRaises(HTTPException) as nearby_error:
            await nearby_restaurants(lat=26.2, lng=73.0)
        with self.assertRaises(HTTPException) as search_error:
            await search_restaurants(q="cafe")
        with self.assertRaises(HTTPException) as details_error:
            await restaurant_details("ChIJ12345678")

        self.assertEqual(nearby_error.exception.status_code, 401)
        self.assertEqual(search_error.exception.status_code, 401)
        self.assertEqual(details_error.exception.status_code, 401)

    async def test_public_landing_preview_remains_available_without_authentication(self):
        entry = SimpleNamespace(results=[], metadata=lambda: {})
        with patch("app.main._get_nearby_cached", AsyncMock(return_value=(entry, False))):
            result = await nearby_restaurants(
                lat=26.2,
                lng=73.0,
                public_preview=True,
            )

        self.assertEqual(result["results"], [])

    async def test_authorized_details_access_validates_the_bearer_token(self):
        expected = {"id": "ChIJ12345678", "name": "Cafe"}
        with patch("app.main.current_user", return_value={"id": "1"}), patch(
            "app.main.get_place_details",
            AsyncMock(return_value=expected),
        ) as details:
            result = await restaurant_details(
                "ChIJ12345678",
                authorization="Bearer valid-token",
            )

        self.assertEqual(result, expected)
        details.assert_awaited_once_with("ChIJ12345678")

    def test_expired_session_is_rejected(self):
        payload = f"1.{int(time.time()) - 1}".encode()
        encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
        signature = hmac.new(auth.AUTH_SECRET, payload, hashlib.sha256).hexdigest()

        with self.assertRaises(HTTPException) as error:
            auth.current_user(f"{encoded}.{signature}")

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.detail, "Invalid or expired session.")

    def test_logout_revokes_a_valid_session(self):
        token = auth._token_for("1")
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory) / 'auth.sqlite3'}")
            auth.Base.metadata.create_all(engine) if hasattr(auth, "Base") else None
            from app.database import Base
            Base.metadata.create_all(engine)
            isolated_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            from app.models import User
            with isolated_session() as db:
                db.add(User(id=1, name="Test", email="test@example.com", password_hash="hash", created_at=1))
                db.commit()
            with patch.object(auth, "SessionLocal", isolated_session):
                result = auth.logout(token)
                self.assertEqual(result["logged_out"], True)
                with self.assertRaises(HTTPException) as error:
                    auth.current_user(token)
                self.assertEqual(error.exception.status_code, 401)
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
