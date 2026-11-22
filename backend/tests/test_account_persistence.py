import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import account
from app.database import Base


class AccountPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.directory.name) / 'account.sqlite3'}")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def tearDown(self):
        self.engine.dispose()
        self.directory.cleanup()

    def test_profile_and_favorite_operations_are_user_owned(self):
        with patch.object(account, "_user_from_token", return_value={"id": "1", "name": "Test"}), patch.object(
            account, "SessionLocal", self.session
        ):
            profile = account.save_profile("token", "Tester", None)
            favorite = account.add_favorite("token", "ChIJ12345678")
            favorites = account.list_favorites("token")

        self.assertEqual(profile["display_name"], "Tester")
        self.assertEqual(favorites[0]["place_id"], favorite["place_id"])

    def test_duplicate_favorite_is_safe(self):
        with patch.object(account, "_user_from_token", return_value={"id": "1", "name": "Test"}), patch.object(
            account, "SessionLocal", self.session
        ):
            first = account.add_favorite("token", "ChIJ12345678")
            second = account.add_favorite("token", "ChIJ12345678")

        self.assertEqual(first["place_id"], second["place_id"])


if __name__ == "__main__":
    unittest.main()
