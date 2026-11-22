import base64
import hashlib
import hmac
import os
import secrets
import time

from dotenv import load_dotenv
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.database import SessionLocal
from app.models import RevokedSession, User, UserPreference

load_dotenv()

AUTH_SECRET = os.getenv("FOODSCOUT_AUTH_SECRET", "foodscout-development-secret-change-me").encode()
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        _, salt, expected = encoded.split("$")
        actual = _hash_password(password, base64.urlsafe_b64decode(salt)).split("$", 2)[2]
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _public_user(row: User) -> dict:
    return {"id": str(row.id), "name": row.name, "email": row.email}


def _token_for(user_id: str) -> str:
    expires = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{user_id}.{expires}".encode()
    signature = hmac.new(AUTH_SECRET, payload, hashlib.sha256).hexdigest()
    return f"{base64.urlsafe_b64encode(payload).decode().rstrip('=')}.{signature}"


def _database_error() -> HTTPException:
    return HTTPException(status_code=503, detail="Account database is temporarily unavailable.")


def _user_from_token(token: str):
    try:
        encoded_payload, signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        expected = hmac.new(AUTH_SECRET, payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        user_id, expires = payload.decode().split(".", 1)
        if int(expires) < int(time.time()):
            raise ValueError
    except (ValueError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.") from None

    db = SessionLocal()
    try:
        revoked = db.scalar(
            select(RevokedSession).where(
                RevokedSession.token_hash == hashlib.sha256(token.encode()).hexdigest(),
                RevokedSession.expires_at >= int(time.time()),
            )
        )
        if revoked is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has been logged out.")
        row = db.scalar(select(User).where(User.id == int(user_id)))
    except HTTPException:
        raise
    except (SQLAlchemyError, ValueError):
        raise _database_error() from None
    finally:
        db.close()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.")
    return _public_user(row)


def signup(name: str, email: str, password: str):
    normalized_email = email.strip().lower()
    db = SessionLocal()
    try:
        row = User(
            name=name.strip(),
            email=normalized_email,
            password_hash=_hash_password(password),
            created_at=int(time.time()),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with that email already exists.") from None
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {"token": _token_for(str(row.id)), "user": _public_user(row)}


def login(email: str, password: str):
    db = SessionLocal()
    try:
        row = db.scalar(select(User).where(User.email == email.strip().lower()))
    except SQLAlchemyError:
        raise _database_error() from None
    finally:
        db.close()
    if row is None or not _verify_password(password, row.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"token": _token_for(str(row.id)), "user": _public_user(row)}


def current_user(token: str):
    return _user_from_token(token)


def logout(token: str):
    user = _user_from_token(token)
    encoded_payload = token.split(".", 1)[0]
    payload = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
    _, expires = payload.decode().split(".", 1)
    db = SessionLocal()
    try:
        db.merge(RevokedSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=int(expires),
            revoked_at=int(time.time()),
        ))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {"logged_out": True, "user_id": user["id"]}


def get_preferences(token: str):
    user = _user_from_token(token)
    db = SessionLocal()
    try:
        row = db.scalar(select(UserPreference).where(UserPreference.user_id == int(user["id"])))
    except SQLAlchemyError:
        raise _database_error() from None
    finally:
        db.close()
    if row is None:
        return {"cuisines": [], "configured": False}
    return {
        "cuisines": [value for value in row.cuisines.split(",") if value],
        "configured": bool(row.configured),
    }


def save_preferences(token: str, cuisines: list[str]):
    user = _user_from_token(token)
    normalized = sorted({value.strip() for value in cuisines if value and value.strip()})
    db = SessionLocal()
    try:
        row = db.scalar(select(UserPreference).where(UserPreference.user_id == int(user["id"])))
        if row is None:
            row = UserPreference(user_id=int(user["id"]), cuisines=",".join(normalized), configured=True, updated_at=int(time.time()))
            db.add(row)
        else:
            row.cuisines = ",".join(normalized)
            row.configured = True
            row.updated_at = int(time.time())
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise _database_error() from None
    finally:
        db.close()
    return {"cuisines": normalized, "configured": True}
