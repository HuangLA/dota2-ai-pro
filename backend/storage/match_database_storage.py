"""Aggregated storage helpers for match database page queries."""

from __future__ import annotations

from typing import Any

from database.sqlite_db import get_connection


class MatchDatabaseStorage:
    """Query layer for OpenDota matches joined with latest download task state."""

    def list_match_database(
        self,
        *,
        limit: int,
        offset: int,
        professional_only: bool = True,
        team_id: int | None = None,
        leagueid: int | None = None,
        has_download: bool | None = None,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """List OpenDota matches with latest replay download task status."""
        conn = get_connection()
        cursor = conn.cursor()

        latest_task_cte = """
            WITH latest_download_task AS (
                SELECT
                    task_id,
                    match_id,
                    status,
                    attempt_count,
                    download_path,
                    created_at,
                    updated_at
                FROM (
                    SELECT
                        task_id,
                        match_id,
                        status,
                        attempt_count,
                        download_path,
                        created_at,
                        updated_at,
                        ROW_NUMBER() OVER (
                            PARTITION BY match_id
                            ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, task_id DESC
                        ) AS row_num
                    FROM replay_download_tasks
                )
                WHERE row_num = 1
            )
        """

        from_sql = """
            FROM opendota_matches AS m
            LEFT JOIN opendota_teams AS radiant_team ON radiant_team.team_id = m.radiant_team_id
            LEFT JOIN opendota_teams AS dire_team ON dire_team.team_id = m.dire_team_id
            LEFT JOIN opendota_leagues AS league ON league.leagueid = m.leagueid
            LEFT JOIN latest_download_task AS d ON d.match_id = m.match_id
        """

        where_clauses: list[str] = []
        params: list[int] = []

        if professional_only:
            where_clauses.append("m.leagueid IS NOT NULL AND m.leagueid > 0")

        if team_id is not None:
            where_clauses.append("(m.radiant_team_id = ? OR m.dire_team_id = ?)")
            params.extend([team_id, team_id])

        if leagueid is not None:
            where_clauses.append("m.leagueid = ?")
            params.append(leagueid)

        if start_time_from is not None:
            where_clauses.append("m.start_time >= ?")
            params.append(start_time_from)

        if start_time_to is not None:
            where_clauses.append("m.start_time <= ?")
            params.append(start_time_to)

        if has_download is True:
            where_clauses.append("d.task_id IS NOT NULL")
        elif has_download is False:
            where_clauses.append("d.task_id IS NULL")

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        count_query = latest_task_cte + " SELECT COUNT(*) AS total " + from_sql + where_sql
        cursor.execute(count_query, tuple(params))
        count_row = cursor.fetchone()
        total = int(count_row["total"]) if count_row else 0

        data_query = (
            latest_task_cte
            + """
            SELECT
                m.match_id,
                m.start_time,
                m.duration,
                m.radiant_team_id,
                m.dire_team_id,
                m.leagueid,
                COALESCE(radiant_team.name, m.radiant_team_name) AS radiant_team_name,
                COALESCE(dire_team.name, m.dire_team_name) AS dire_team_name,
                COALESCE(league.name, m.league_name) AS league_name,
                d.status AS download_status,
                d.task_id AS download_task_id,
                d.attempt_count AS download_attempt_count,
                d.download_path AS download_path
            """
            + from_sql
            + where_sql
            + " ORDER BY m.start_time DESC, m.match_id DESC LIMIT ? OFFSET ?"
        )
        cursor.execute(data_query, tuple([*params, limit, offset]))
        rows = cursor.fetchall()

        records = [
            {
                "match_id": int(row["match_id"]),
                "start_time": int(row["start_time"]),
                "duration": int(row["duration"]),
                "radiant_team_id": row["radiant_team_id"],
                "dire_team_id": row["dire_team_id"],
                "leagueid": row["leagueid"],
                "radiant_team_name": row["radiant_team_name"],
                "dire_team_name": row["dire_team_name"],
                "league_name": row["league_name"],
                "download_status": row["download_status"],
                "download_task_id": row["download_task_id"],
                "download_attempt_count": row["download_attempt_count"],
                "download_path": row["download_path"],
            }
            for row in rows
        ]

        return total, records
