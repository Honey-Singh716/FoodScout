import json
import time

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth import _database_error, _user_from_token
from app.database import SessionLocal
from app.models import Favorite, UserActivity, UserProfile


def get_profile(token: str):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        row = db.scalar(select(UserProfile).where(UserProfile.user_id == int(user["id"])))
    except SQLAlchemyError:
        raise _database_error() from None
    finally:
        db.close()
    if row is None:
        return {"display_name": user["name"], "avatar_url": None}
    return {"display_name": row.display_name or user["name"], "avatar_url": row.avatar_url}


def save_profile(token: str, display_name: str | None, avatar_url: str | None):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        row = db.scalar(select(UserProfile).where(UserProfile.user_id == int(user["id"])))
        if row is None:
            row = UserProfile(
                user_id=int(user["id"]),
                display_name=display_name,
                avatar_url=avatar_url,
                updated_at=int(time.time()),
            )
            db.add(row)
        else:
            row.display_name = display_name
            row.avatar_url = avatar_url
            row.updated_at = int(time.time())
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {"display_name": display_name or user["name"], "avatar_url": avatar_url}


def list_favorites(token: str):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        rows = db.scalars(
            select(Favorite)
            .where(Favorite.user_id == int(user["id"]))
            .order_by(Favorite.created_at.desc())
        ).all()
    except SQLAlchemyError:
        raise _database_error() from None
    finally:
        db.close()
    return [{"id": row.id, "place_id": row.place_id, "created_at": row.created_at} for row in rows]


def add_favorite(token: str, place_id: str):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        row = Favorite(user_id=int(user["id"]), place_id=place_id.strip(), created_at=int(time.time()))
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(Favorite).where(
                Favorite.user_id == int(user["id"]),
                Favorite.place_id == place_id.strip(),
            )
        )
        if existing is not None:
            row = existing
        else:
            raise HTTPException(status_code=409, detail="Favorite could not be saved.") from None
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {"id": row.id, "place_id": row.place_id, "created_at": row.created_at}


def remove_favorite(token: str, place_id: str):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        result = db.execute(
            delete(Favorite).where(
                Favorite.user_id == int(user["id"]),
                Favorite.place_id == place_id,
            )
        )
        db.commit()
        deleted = result.rowcount
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Favorite not found.")
    return {"removed": True, "place_id": place_id}


def record_activity(token: str, event_type: str, place_id: str | None, metadata: dict):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        row = UserActivity(
            user_id=int(user["id"]),
            event_type=event_type,
            place_id=place_id,
            metadata_json=json.dumps(metadata, sort_keys=True),
            created_at=int(time.time()),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {
        "id": row.id,
        "event_type": row.event_type,
        "place_id": row.place_id,
        "created_at": row.created_at,
    }
