"""Storage helpers for OpenDota reference dimensions (teams/leagues)."""

from __future__ import annotations

import time
from typing import Any

from database.sqlite_db import get_connection


class OpenDotaReferenceStorage:
    """Persist and query OpenDota team/league reference data."""

    def upsert_teams(self, teams: list[dict[str, Any]]) -> tuple[int, int]:
        """Upsert teams and return (inserted, updated)."""
        normalized: list[
            tuple[int, str | None, str | None, str | None, str | None, int, int]
        ] = []
        for raw in teams:
            team_id = self._as_int(raw.get("team_id"))
            if team_id is None:
                continue

            normalized.append(
                (
                    team_id,
                    self._as_str(raw.get("name")),
                    self._as_str(raw.get("tag")),
                    self._as_str(raw.get("logo_url") or raw.get("logo")),
                    self._as_str(raw.get("logo_sponsor_url") or raw.get("logo_sponsor")),
                    self._as_int(raw.get("wins")) or 0,
                    self._as_int(raw.get("losses")) or 0,
                )
            )

        if not normalized:
            return 0, 0

        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" for _ in normalized)
        cursor.execute(
            f"""
            SELECT team_id, name, tag, logo_url, logo_sponsor_url, wins, losses
            FROM opendota_teams
            WHERE team_id IN ({placeholders})
            """,
            [row[0] for row in normalized],
        )
        existing_rows = cursor.fetchall()
        existing_by_id: dict[int, tuple[str | None, str | None, str | None, str | None, int, int]] = {
            int(row["team_id"]): (
                row["name"],
                row["tag"],
                row["logo_url"],
                row["logo_sponsor_url"],
                int(row["wins"]),
                int(row["losses"]),
            )
            for row in existing_rows
        }

        inserted = 0
        updated = 0
        for team_id, name, tag, logo_url, logo_sponsor_url, wins, losses in normalized:
            current = (name, tag, logo_url, logo_sponsor_url, wins, losses)
            existing = existing_by_id.get(team_id)
            if existing is None:
                inserted += 1
            elif existing != current:
                updated += 1

        synced_at = int(time.time())
        cursor.executemany(
            """
            INSERT INTO opendota_teams (
                team_id, name, tag, logo_url, logo_sponsor_url, wins, losses, last_synced_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(team_id) DO UPDATE SET
                name = excluded.name,
                tag = excluded.tag,
                logo_url = excluded.logo_url,
                logo_sponsor_url = excluded.logo_sponsor_url,
                wins = excluded.wins,
                losses = excluded.losses,
                last_synced_at = excluded.last_synced_at
            """,
            [(*row, synced_at) for row in normalized],
        )
        conn.commit()
        return inserted, updated

    def upsert_leagues(self, leagues: list[dict[str, Any]]) -> tuple[int, int]:
        """Upsert leagues and return (inserted, updated)."""
        normalized: list[
            tuple[int, str | None, str | None, str | None, str | None, str | None]
        ] = []
        for raw in leagues:
            leagueid = self._as_int(raw.get("leagueid"))
            if leagueid is None:
                continue

            normalized.append(
                (
                    leagueid,
                    self._as_str(raw.get("name")),
                    self._as_str(raw.get("tier")),
                    self._as_str(raw.get("icon_url")),
                    self._as_str(raw.get("image_url")),
                    self._as_str(raw.get("banner_url") or raw.get("banner")),
                )
            )

        if not normalized:
            return 0, 0

        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" for _ in normalized)
        cursor.execute(
            f"""
            SELECT leagueid, name, tier, icon_url, image_url, banner_url
            FROM opendota_leagues
            WHERE leagueid IN ({placeholders})
            """,
            [row[0] for row in normalized],
        )
        existing_rows = cursor.fetchall()
        existing_by_id: dict[int, tuple[str | None, str | None, str | None, str | None, str | None]] = {
            int(row["leagueid"]): (
                row["name"],
                row["tier"],
                row["icon_url"],
                row["image_url"],
                row["banner_url"],
            )
            for row in existing_rows
        }

        inserted = 0
        updated = 0
        for leagueid, name, tier, icon_url, image_url, banner_url in normalized:
            current = (name, tier, icon_url, image_url, banner_url)
            existing = existing_by_id.get(leagueid)
            if existing is None:
                inserted += 1
            elif existing != current:
                updated += 1

        synced_at = int(time.time())
        cursor.executemany(
            """
            INSERT INTO opendota_leagues (
                leagueid, name, tier, icon_url, image_url, banner_url, last_synced_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(leagueid) DO UPDATE SET
                name = excluded.name,
                tier = excluded.tier,
                icon_url = excluded.icon_url,
                image_url = excluded.image_url,
                banner_url = excluded.banner_url,
                last_synced_at = excluded.last_synced_at
            """,
            [(*row, synced_at) for row in normalized],
        )
        conn.commit()
        return inserted, updated

    def list_teams(self, limit: int, offset: int) -> tuple[int, list[dict[str, Any]]]:
        """List teams with total count and pagination."""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) AS total FROM opendota_teams")
        total = int(cursor.fetchone()["total"])

        cursor.execute(
            """
            SELECT team_id, name, tag, logo_url, logo_sponsor_url, wins, losses, last_synced_at
            FROM opendota_teams
            ORDER BY team_id ASC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()
        records = [
            {
                "team_id": int(row["team_id"]),
                "name": row["name"],
                "tag": row["tag"],
                "logo_url": row["logo_url"],
                "logo_sponsor_url": row["logo_sponsor_url"],
                "wins": int(row["wins"]),
                "losses": int(row["losses"]),
                "last_synced_at": int(row["last_synced_at"]),
            }
            for row in rows
        ]
        return total, records

    def list_leagues(self, limit: int, offset: int) -> tuple[int, list[dict[str, Any]]]:
        """List leagues with total count and pagination."""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) AS total FROM opendota_leagues")
        total = int(cursor.fetchone()["total"])

        cursor.execute(
            """
            SELECT leagueid, name, tier, icon_url, image_url, banner_url, last_synced_at
            FROM opendota_leagues
            ORDER BY leagueid ASC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()
        records = [
            {
                "leagueid": int(row["leagueid"]),
                "name": row["name"],
                "tier": row["tier"],
                "icon_url": row["icon_url"],
                "image_url": row["image_url"],
                "banner_url": row["banner_url"],
                "last_synced_at": int(row["last_synced_at"]),
            }
            for row in rows
        ]
        return total, records

    @staticmethod
    def _as_int(value: object) -> int | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str) and value.strip():
            try:
                return int(value)
            except ValueError:
                return None
        return None

    @staticmethod
    def _as_str(value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized if normalized else None
        return str(value)
