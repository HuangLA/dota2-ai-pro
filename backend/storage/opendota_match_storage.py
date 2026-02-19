"""Storage helpers for OpenDota recent match persistence."""

from __future__ import annotations

import time
from typing import Any

from database.sqlite_db import get_connection


class OpenDotaMatchStorage:
    """Persist and upsert OpenDota recent matches into SQLite."""

    def upsert_recent_matches(self, matches: list[dict[str, Any]]) -> tuple[int, int]:
        """Upsert recent matches and return (inserted, updated)."""
        if not matches:
            return 0, 0

        normalized: list[tuple[int, int, int, int | None, int | None, int | None]] = []
        for raw in matches:
            match_id = self._as_int(raw.get("match_id"))
            if match_id is None:
                continue

            start_time = self._as_int(raw.get("start_time")) or 0
            duration = self._as_int(raw.get("duration")) or 0
            radiant_team_id = self._as_int(raw.get("radiant_team_id"))
            if radiant_team_id is None:
                radiant_team_id = self._as_int(raw.get("radiant_team"))
            dire_team_id = self._as_int(raw.get("dire_team_id"))
            if dire_team_id is None:
                dire_team_id = self._as_int(raw.get("dire_team"))
            leagueid = self._as_int(raw.get("leagueid"))
            if leagueid is None:
                leagueid = self._as_int(raw.get("league_id"))

            normalized.append(
                (match_id, start_time, duration, radiant_team_id, dire_team_id, leagueid)
            )

        if not normalized:
            return 0, 0

        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" for _ in normalized)
        existing_query = f"""
            SELECT match_id, start_time, duration, radiant_team_id, dire_team_id, leagueid
            FROM opendota_matches
            WHERE match_id IN ({placeholders})
        """
        cursor.execute(existing_query, [row[0] for row in normalized])
        existing_rows = cursor.fetchall()
        existing_by_id: dict[int, tuple[int, int, int | None, int | None, int | None]] = {
            int(row["match_id"]): (
                int(row["start_time"]),
                int(row["duration"]),
                row["radiant_team_id"],
                row["dire_team_id"],
                row["leagueid"],
            )
            for row in existing_rows
        }

        inserted = 0
        updated = 0
        for row in normalized:
            match_id = row[0]
            values = row[1:]
            if match_id not in existing_by_id:
                inserted += 1
                continue
            if existing_by_id[match_id] != values:
                updated += 1

        synced_at = int(time.time())
        upsert_rows = [(*row, synced_at) for row in normalized]
        cursor.executemany(
            """
            INSERT INTO opendota_matches (
                match_id, start_time, duration, radiant_team_id,
                dire_team_id, leagueid, last_synced_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                start_time = excluded.start_time,
                duration = excluded.duration,
                radiant_team_id = excluded.radiant_team_id,
                dire_team_id = excluded.dire_team_id,
                leagueid = excluded.leagueid,
                last_synced_at = excluded.last_synced_at
            """,
            upsert_rows,
        )
        conn.commit()
        return inserted, updated

    def list_recent_matches(
        self,
        *,
        limit: int,
        offset: int,
        team_id: int | None = None,
        leagueid: int | None = None,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """List persisted OpenDota matches with filters, total count and pagination."""
        conn = get_connection()
        cursor = conn.cursor()

        where_clauses: list[str] = []
        query_params: list[int] = []

        if team_id is not None:
            where_clauses.append("(radiant_team_id = ? OR dire_team_id = ?)")
            query_params.extend([team_id, team_id])

        if leagueid is not None:
            where_clauses.append("leagueid = ?")
            query_params.append(leagueid)

        if start_time_from is not None:
            where_clauses.append("start_time >= ?")
            query_params.append(start_time_from)

        if start_time_to is not None:
            where_clauses.append("start_time <= ?")
            query_params.append(start_time_to)

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        count_query = "SELECT COUNT(*) AS total FROM opendota_matches" + where_sql
        cursor.execute(count_query, tuple(query_params))
        total_row = cursor.fetchone()
        total = int(total_row["total"]) if total_row else 0

        data_query = (
            """
            SELECT
                match_id,
                start_time,
                duration,
                radiant_team_id,
                dire_team_id,
                leagueid,
                last_synced_at
            FROM opendota_matches
            """
            + where_sql
            + " ORDER BY start_time DESC LIMIT ? OFFSET ?"
        )
        data_query_params = [*query_params, limit, offset]
        cursor.execute(data_query, tuple(data_query_params))
        rows = cursor.fetchall()

        records = [
            {
                "match_id": int(row["match_id"]),
                "start_time": int(row["start_time"]),
                "duration": int(row["duration"]),
                "radiant_team_id": row["radiant_team_id"],
                "dire_team_id": row["dire_team_id"],
                "leagueid": row["leagueid"],
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
