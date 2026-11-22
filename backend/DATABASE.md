# FoodScout Database Architecture

## Persistent application data

PostgreSQL is supported through `DATABASE_URL` and SQLAlchemy models. SQLite remains the default local database for backward compatibility.

Persistent entities:

- `users`
- `user_profiles`
- `user_preferences`
- `favorites`
- `user_activity`
- `revoked_sessions`

Only salted scrypt password hashes are persisted.

## Temporary provider data

Restaurant discovery results and place details remain process-local caches. Redis is optional and not required by the current deployment.

## Configuration

Local SQLite default:

```text
DATABASE_URL=sqlite:///backend/foodscout_auth.sqlite3
```

PostgreSQL example:

```text
DATABASE_URL=postgresql+psycopg://user:password@host:5432/foodscout
```

Set `FOODSCOUT_AUTH_SECRET` to a long random deployment secret.

## Migration

Run from `backend/`:

```text
python -m alembic upgrade head
python -m alembic current
python -m alembic downgrade base
```

The baseline migration preserves existing `users` and `user_preferences` tables. Downgrade removes only newly created application tables.

Production steps:

1. Back up the database.
2. Restore the backup into an isolated test database.
3. Run and verify the migration.
4. Verify row counts and the Alembic revision.
5. Deploy the application.
6. Confirm `/api/v1/health` reports database status `ok`.
7. Keep the rollback backup until verification is complete.
