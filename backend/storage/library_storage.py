"""Storage helpers for local replay library queries and file-delete bookkeeping."""

from __future__ import annotations

import time
from typing import Any

from database.sqlite_db import get_connection


class LibraryStorage:
    """Persistence layer for local parsed replay library."""

    def list_completed_matches(
        self,
        *,
        limit: int,
        offset: int,
        team_id: int | None = None,
        player_id: int | None = None,
        leagueid: int | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """List parsed-completed local matches with optional team/player/league filters."""
        conn = get_connection()
        cursor = conn.cursor()

        joins = ["LEFT JOIN opendota_matches AS om ON om.match_id = m.match_id"]
        where_clauses = ["m.parse_status = 'completed'"]
        params: list[Any] = []

        if team_id is not None:
            where_clauses.append("(om.radiant_team_id = ? OR om.dire_team_id = ?)")
            params.extend([team_id, team_id])

        if player_id is not None:
            joins.append("JOIN player_matches AS pm ON pm.match_id = m.match_id")
            where_clauses.append("pm.account_id = ?")
            params.append(player_id)

        if leagueid is not None:
            where_clauses.append("COALESCE(om.leagueid, m.league_id) = ?")
            params.append(leagueid)

        join_sql = " ".join(joins)
        where_sql = " AND ".join(where_clauses)

        count_query = (
            "SELECT COUNT(DISTINCT m.match_id) AS total FROM matches AS m "
            + join_sql
            + " WHERE "
            + where_sql
        )
        cursor.execute(count_query, tuple(params))
        total_row = cursor.fetchone()
        total = int(total_row["total"]) if total_row else 0

        data_query = (
            """
            SELECT DISTINCT
                m.match_id,
                m.start_time,
                m.duration,
                COALESCE(om.leagueid, m.league_id) AS leagueid,
                om.radiant_team_id,
                om.dire_team_id,
                om.radiant_team_name,
                om.dire_team_name,
                om.league_name,
                m.replay_path,
                m.parse_status
            FROM matches AS m
            """
            + join_sql
            + " WHERE "
            + where_sql
            + " ORDER BY m.start_time DESC, m.match_id DESC LIMIT ? OFFSET ?"
        )
        cursor.execute(data_query, tuple([*params, limit, offset]))
        rows = cursor.fetchall()

        return total, [
            {
                "match_id": int(row["match_id"]),
                "start_time": int(row["start_time"]),
                "duration": int(row["duration"]),
                "leagueid": row["leagueid"],
                "radiant_team_id": row["radiant_team_id"],
                "dire_team_id": row["dire_team_id"],
                "radiant_team_name": row["radiant_team_name"],
                "dire_team_name": row["dire_team_name"],
                "league_name": row["league_name"],
                "replay_path": row["replay_path"],
                "parse_status": row["parse_status"],
            }
            for row in rows
        ]

    def clear_replay_path_keep_completed(self, match_id: int) -> bool:
        """Set replay_path to NULL while keeping parse_status as completed."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE matches
            SET replay_path = NULL,
                parse_status = 'completed',
                updated_at = ?
            WHERE match_id = ?
            """,
            (int(time.time()), match_id),
        )
        conn.commit()
        return cursor.rowcount > 0
