"""Create FoodScout application schema without resetting existing users.

Revision ID: 20261122_001
Revises: None
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20261122_001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("password_hash", sa.Text(), nullable=False),
            sa.Column("created_at", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )

    if not inspector.has_table("user_preferences"):
        op.create_table(
            "user_preferences",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("cuisines", sa.Text(), nullable=False, server_default=""),
            sa.Column("configured", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id"),
        )

    inspector = inspect(bind)
    if not inspector.has_table("user_profiles"):
        op.create_table(
            "user_profiles",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("display_name", sa.String(length=80), nullable=True),
            sa.Column("avatar_url", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id"),
        )

    inspector = inspect(bind)
    if not inspector.has_table("favorites"):
        op.create_table(
            "favorites",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("place_id", sa.String(length=256), nullable=False),
            sa.Column("created_at", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "place_id", name="uq_favorites_user_place"),
        )
        op.create_index("ix_favorites_user_id", "favorites", ["user_id"])

    inspector = inspect(bind)
    if not inspector.has_table("user_activity"):
        op.create_table(
            "user_activity",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("place_id", sa.String(length=256), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_user_activity_user_id", "user_activity", ["user_id"])

    inspector = inspect(bind)
    if not inspector.has_table("revoked_sessions"):
        op.create_table(
            "revoked_sessions",
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.Integer(), nullable=False),
            sa.Column("revoked_at", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("token_hash"),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    for table in ("revoked_sessions", "user_activity", "favorites", "user_profiles"):
        if inspector.has_table(table):
            op.drop_table(table)
