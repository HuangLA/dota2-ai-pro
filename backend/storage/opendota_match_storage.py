from __future__ import annotations

"""Storage helpers for OpenDota recent match persistence."""

from utils.steam_cdn import get_team_logo_url, get_league_icon_url, get_dotabuff_league_url

import time
from typing import Any

from database.sqlite_db import get_connection


class OpenDotaMatchStorage:
    """Persist and upsert OpenDota recent matches into SQLite."""

    def upsert_recent_matches(
        self,
        matches: list[dict[str, Any]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        """Upsert recent matches and return (inserted, updated)."""
        if not matches:
            return 0, 0

        normalized_source = source if source in {"pro", "public"} else "pro"

        normalized: list[
            tuple[
                int,
                int,
                int,
                int | None,
                int | None,
                int | None,
                str,
                int,
                int | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
            ]
        ] = []
        for raw in matches:
            match_id = self._as_int(raw.get("match_id"))
            if match_id is None:
                continue

            start_time = self._as_int(raw.get("start_time")) or 0
            duration = self._as_int(raw.get("duration")) or 0
            radiant_team_id = self._extract_team_id(raw, "radiant")
            dire_team_id = self._extract_team_id(raw, "dire")
            leagueid = self._as_int(raw.get("leagueid"))
            if leagueid is None:
                # league 可能是嵌套对象
                league = raw.get("league")
                if isinstance(league, dict):
                    leagueid = self._as_int(league.get("leagueid") or league.get("league_id"))
            is_professional = self._as_bool_flag(raw.get("is_professional"))
            if is_professional is None:
                is_professional = 1 if normalized_source == "pro" else 0
            radiant_win = self._as_bool_flag(raw.get("radiant_win"))
            radiant_team_name = self._extract_name(
                raw,
                direct_keys=("radiant_team_name", "radiant_name"),
                nested_keys=(("radiant_team", "name"),),
            )
            dire_team_name = self._extract_name(
                raw,
                direct_keys=("dire_team_name", "dire_name"),
                nested_keys=(("dire_team", "name"),),
            )
            league_name = self._extract_name(
                raw,
                direct_keys=("league_name",),
                nested_keys=(("league", "name"),),
            )
            # OpenDota API 返回 logo_url，我们将其映射到 icon_url（前端优先使用）
            radiant_icon_url = self._extract_url(
                raw,
                direct_keys=("radiant_icon_url", "radiant_team_icon", "radiant_team_logo"),
                nested_keys=(("radiant_team", "logo_url"), ("radiant_team", "logo"), ("radiant_team", "icon_url")),
            )
            dire_icon_url = self._extract_url(
                raw,
                direct_keys=("dire_icon_url", "dire_team_icon", "dire_team_logo"),
                nested_keys=(("dire_team", "logo_url"), ("dire_team", "logo"), ("dire_team", "icon_url")),
            )
            radiant_logo_url = self._extract_url(
                raw,
                direct_keys=("radiant_logo_url", "radiant_team_logo"),
                nested_keys=(("radiant_team", "logo_url"), ("radiant_team", "logo")),
            )
            dire_logo_url = self._extract_url(
                raw,
                direct_keys=("dire_logo_url", "dire_team_logo"),
                nested_keys=(("dire_team", "logo_url"), ("dire_team", "logo")),
            )
            # OpenDota API 返回 image_url/logo_url，我们优先使用 image_url 作为 icon
            league_icon_url = self._extract_url(
                raw,
                direct_keys=("league_icon_url", "league_image_url"),
                nested_keys=(("league", "image_url"), ("league", "logo_url"), ("league", "icon_url")),
            )
            league_logo_url = self._extract_url(
                raw,
                direct_keys=("league_logo_url",),
                nested_keys=(("league", "logo_url"), ("league", "logo")),
            )
            league_image_url = self._extract_url(
                raw,
                direct_keys=("league_image_url", "image_url"),
                nested_keys=(("league", "image_url"), ("league", "logo_url")),
            )
            league_banner_url = self._extract_url(
                raw,
                direct_keys=("league_banner_url", "banner", "banner_url"),
                nested_keys=(("league", "banner"), ("league", "banner_url")),
            )
            radiant_logo_sponsor_url = self._extract_url(
                raw,
                direct_keys=("radiant_logo_sponsor_url",),
                nested_keys=(("radiant_team", "logo_sponsor_url"), ("radiant_team", "logo_sponsor")),
            )
            dire_logo_sponsor_url = self._extract_url(
                raw,
                direct_keys=("dire_logo_sponsor_url",),
                nested_keys=(("dire_team", "logo_sponsor_url"), ("dire_team", "logo_sponsor")),
            )

            normalized.append(
                (
                    match_id,
                    start_time,
                    duration,
                    radiant_team_id,
                    dire_team_id,
                    leagueid,
                    normalized_source,
                    is_professional,
                    radiant_win,
                    radiant_team_name,
                    dire_team_name,
                    league_name,
                    radiant_icon_url,
                    dire_icon_url,
                    radiant_logo_url,
                    dire_logo_url,
                    league_icon_url,
                    league_logo_url,
                    league_image_url,
                    league_banner_url,
                    radiant_logo_sponsor_url,
                    dire_logo_sponsor_url,
                )
            )

        if not normalized:
            return 0, 0

        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" for _ in normalized)
        existing_query = f"""
            SELECT
                match_id,
                start_time,
                duration,
                radiant_team_id,
                dire_team_id,
                leagueid,
                source,
                is_professional,
                radiant_win,
                radiant_team_name,
                dire_team_name,
                league_name,
                radiant_icon_url,
                dire_icon_url,
                radiant_logo_url,
                dire_logo_url,
                league_icon_url,
                league_logo_url,
                league_image_url,
                league_banner_url,
                radiant_logo_sponsor_url,
                dire_logo_sponsor_url
            FROM opendota_matches
            WHERE match_id IN ({placeholders})
        """
        cursor.execute(existing_query, [row[0] for row in normalized])
        existing_rows = cursor.fetchall()
        existing_by_id: dict[
            int,
            tuple[
                int,
                int,
                int | None,
                int | None,
                int | None,
                str,
                int,
                int | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
                str | None,
            ],
        ] = {
            int(row["match_id"]): (
                int(row["start_time"]),
                int(row["duration"]),
                row["radiant_team_id"],
                row["dire_team_id"],
                row["leagueid"],
                str(row["source"]),
                int(row["is_professional"] or 0),
                row["radiant_win"],
                row["radiant_team_name"],
                row["dire_team_name"],
                row["league_name"],
                row["radiant_icon_url"],
                row["dire_icon_url"],
                row["radiant_logo_url"],
                row["dire_logo_url"],
                row["league_icon_url"],
                row["league_logo_url"],
                row["league_image_url"],
                row["league_banner_url"],
                row["radiant_logo_sponsor_url"],
                row["dire_logo_sponsor_url"],
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
                dire_team_id, leagueid, source, is_professional,
                radiant_win, radiant_team_name, dire_team_name,
                league_name, radiant_icon_url,
                dire_icon_url, radiant_logo_url, dire_logo_url,
                league_icon_url, league_logo_url, league_image_url,
                league_banner_url, radiant_logo_sponsor_url,
                dire_logo_sponsor_url, last_synced_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                start_time = excluded.start_time,
                duration = excluded.duration,
                radiant_team_id = excluded.radiant_team_id,
                dire_team_id = excluded.dire_team_id,
                leagueid = excluded.leagueid,
                source = excluded.source,
                is_professional = excluded.is_professional,
                radiant_win = excluded.radiant_win,
                radiant_team_name = excluded.radiant_team_name,
                dire_team_name = excluded.dire_team_name,
                league_name = excluded.league_name,
                radiant_icon_url = excluded.radiant_icon_url,
                dire_icon_url = excluded.dire_icon_url,
                radiant_logo_url = excluded.radiant_logo_url,
                dire_logo_url = excluded.dire_logo_url,
                league_icon_url = excluded.league_icon_url,
                league_logo_url = excluded.league_logo_url,
                league_image_url = excluded.league_image_url,
                league_banner_url = excluded.league_banner_url,
                radiant_logo_sponsor_url = excluded.radiant_logo_sponsor_url,
                dire_logo_sponsor_url = excluded.dire_logo_sponsor_url,
                last_synced_at = excluded.last_synced_at
            """,
            upsert_rows,
        )
        conn.commit()
        return inserted, updated

    def upsert_match_detail(self, detail: dict[str, Any]) -> tuple[int, int]:
        """Upsert one match detail payload from OpenDota /matches/{id}."""
        source = self._as_text(detail.get("source")) or "pro"
        inserted, updated = self.upsert_recent_matches([detail], source=source)
        self._upsert_match_players(detail)
        return inserted, updated

    def get_match(self, match_id: int) -> dict[str, Any] | None:
        """Return one cached OpenDota match row if present."""
        _, rows = self.list_recent_matches(
            limit=1,
            offset=0,
            match_id=match_id,
            include_pro=True,
            include_public=True,
        )
        return rows[0] if rows else None

    def get_match_player_identities(self, match_id: int) -> list[dict[str, Any]]:
        """Return cached OpenDota player identities for a match."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                match_id,
                account_id,
                player_slot,
                hero_id,
                team_id,
                persona_name,
                pro_name,
                last_synced_at
            FROM opendota_match_players
            WHERE match_id = ?
            ORDER BY
                player_slot ASC,
                hero_id ASC,
                account_id ASC
            """,
            (match_id,),
        )
        rows = cursor.fetchall()

        return [
            {
                "match_id": int(row["match_id"]),
                "account_id": row["account_id"],
                "player_slot": row["player_slot"],
                "hero_id": row["hero_id"],
                "team": row["team_id"],
                "team_id": row["team_id"],
                "persona_name": row["persona_name"],
                "pro_name": row["pro_name"],
                "last_synced_at": int(row["last_synced_at"]),
            }
            for row in rows
        ]

    def list_recent_matches(
        self,
        *,
        limit: int,
        offset: int,
        team_id: int | None = None,
        leagueid: int | None = None,
        match_id: int | None = None,
        match_ids: list[int] | None = None,
        include_pro: bool = True,
        include_public: bool = True,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """List persisted OpenDota matches with filters, total count and pagination."""
        conn = get_connection()
        cursor = conn.cursor()

        where_clauses: list[str] = []
        query_params: list[int] = []

        if team_id is not None:
            where_clauses.append("(m.radiant_team_id = ? OR m.dire_team_id = ?)")
            query_params.extend([team_id, team_id])

        if leagueid is not None:
            where_clauses.append("m.leagueid = ?")
            query_params.append(leagueid)

        if match_id is not None:
            where_clauses.append("m.match_id = ?")
            query_params.append(match_id)

        if match_ids is not None:
            normalized_match_ids = [current_id for current_id in match_ids if current_id > 0]
            if not normalized_match_ids:
                return 0, []
            placeholders = ",".join("?" for _ in normalized_match_ids)
            where_clauses.append(f"m.match_id IN ({placeholders})")
            query_params.extend(normalized_match_ids)

        if include_pro and not include_public:
            where_clauses.append("m.source = 'pro'")
        elif include_public and not include_pro:
            where_clauses.append("m.source = 'public'")
        elif not include_pro and not include_public:
            return 0, []

        if start_time_from is not None:
            where_clauses.append("m.start_time >= ?")
            query_params.append(start_time_from)

        if start_time_to is not None:
            where_clauses.append("m.start_time <= ?")
            query_params.append(start_time_to)

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        count_query = "SELECT COUNT(*) AS total FROM opendota_matches m" + where_sql
        cursor.execute(count_query, tuple(query_params))
        total_row = cursor.fetchone()
        total = int(total_row["total"]) if total_row else 0

        data_query = (
            """
            WITH latest_download AS (
                SELECT
                    task_id,
                    match_id,
                    status,
                    attempt_count,
                    error_code,
                    error_message,
                    updated_at
                FROM (
                    SELECT
                        task_id,
                        match_id,
                        status,
                        attempt_count,
                        error_code,
                        error_message,
                        updated_at,
                        ROW_NUMBER() OVER (
                            PARTITION BY match_id
                            ORDER BY created_at DESC, task_id DESC
                        ) AS rn
                    FROM replay_download_tasks
                )
                WHERE rn = 1
            )
            SELECT
                m.match_id,
                m.start_time,
                m.duration,
                m.radiant_team_id,
                m.dire_team_id,
                m.leagueid,
                m.source,
                m.is_professional,
                m.radiant_win,
                COALESCE(rt.name, m.radiant_team_name) AS radiant_team_name,
                COALESCE(dt.name, m.dire_team_name) AS dire_team_name,
                COALESCE(l.name, m.league_name) AS league_name,
                COALESCE(m.radiant_icon_url, rt.icon_url) AS radiant_icon_url,
                COALESCE(m.dire_icon_url, dt.icon_url) AS dire_icon_url,
                COALESCE(m.radiant_logo_url, rt.logo_url) AS radiant_logo_url,
                COALESCE(m.dire_logo_url, dt.logo_url) AS dire_logo_url,
                COALESCE(m.league_icon_url, l.icon_url) AS league_icon_url,
                COALESCE(m.league_logo_url, l.logo_url) AS league_logo_url,
                COALESCE(m.radiant_logo_sponsor_url, rt.logo_sponsor_url) AS radiant_logo_sponsor_url,
                COALESCE(m.dire_logo_sponsor_url, dt.logo_sponsor_url) AS dire_logo_sponsor_url,
                COALESCE(m.league_image_url, l.image_url) AS league_image_url,
                COALESCE(m.league_banner_url, l.banner_url) AS league_banner_url,
                d.task_id AS download_task_id,
                d.status AS download_status,
                d.attempt_count AS download_attempt_count,
                d.error_code AS download_error_code,
                d.error_message AS download_error_message,
                d.updated_at AS download_updated_at,
                lm.parse_status AS local_parse_status,
                lm.replay_path AS local_replay_path,
                m.last_synced_at
            FROM opendota_matches m
            LEFT JOIN opendota_teams rt ON rt.team_id = m.radiant_team_id
            LEFT JOIN opendota_teams dt ON dt.team_id = m.dire_team_id
            LEFT JOIN opendota_leagues l ON l.leagueid = m.leagueid
            LEFT JOIN latest_download d ON d.match_id = m.match_id
            LEFT JOIN matches lm ON lm.match_id = m.match_id
            """
            + where_sql
            + " ORDER BY m.start_time DESC LIMIT ? OFFSET ?"
        )
        data_query_params = [*query_params, limit, offset]
        cursor.execute(data_query, tuple(data_query_params))
        rows = cursor.fetchall()

        records = []
        for row in rows:
            # Apply Steam CDN fallback for missing team/league icons
            radiant_team_id = row["radiant_team_id"]
            dire_team_id = row["dire_team_id"]
            leagueid = row["leagueid"]
            
            # 战队图片回退：DB值（Steam UGC URL from /teams/{id} API） → Steam CDN → None
            # 优先使用数据库中存储的完整 UGC URL（例如 cdn.steamusercontent.com）
            radiant_icon_url = row["radiant_icon_url"] or get_team_logo_url(radiant_team_id)
            dire_icon_url = row["dire_icon_url"] or get_team_logo_url(dire_team_id)
            radiant_logo_url = row["radiant_logo_url"] or get_team_logo_url(radiant_team_id)
            dire_logo_url = row["dire_logo_url"] or get_team_logo_url(dire_team_id)
            
            # 联赛图片回退：Dotabuff CDN（100%可用） → DB值 → Steam CDN（低覆盖率） → None
            league_icon_url = (
                get_dotabuff_league_url(leagueid)
                or row["league_icon_url"]
                or row["league_image_url"]
                or get_league_icon_url(leagueid)
                or row["league_banner_url"]  # banner 通常为 null，但作为最后备选
            )
            league_logo_url = row["league_logo_url"] or row["league_image_url"]
            
            records.append({
                "match_id": int(row["match_id"]),
                "start_time": int(row["start_time"]),
                "duration": int(row["duration"]),
                "radiant_team_id": radiant_team_id,
                "dire_team_id": dire_team_id,
                "leagueid": leagueid,
                "source": row["source"],
                "is_professional": bool(row["is_professional"]),
                "radiant_win": bool(row["radiant_win"]) if row["radiant_win"] is not None else None,
                "radiant_team_name": row["radiant_team_name"],
                "dire_team_name": row["dire_team_name"],
                "league_name": row["league_name"],
                "radiant_icon_url": radiant_icon_url,
                "dire_icon_url": dire_icon_url,
                "radiant_logo_url": radiant_logo_url,
                "dire_logo_url": dire_logo_url,
                "league_icon_url": league_icon_url,
                "league_logo_url": league_logo_url,
                "radiant_logo_sponsor_url": row["radiant_logo_sponsor_url"],
                "dire_logo_sponsor_url": row["dire_logo_sponsor_url"],
                "league_image_url": row["league_image_url"],
                "league_banner_url": row["league_banner_url"],
                "download_task_id": row["download_task_id"],
                "download_status": row["download_status"],
                "download_attempt_count": row["download_attempt_count"],
                "download_error_code": row["download_error_code"],
                "download_error_message": row["download_error_message"],
                "download_updated_at": row["download_updated_at"],
                "local_parse_status": row["local_parse_status"],
                "local_replay_path": row["local_replay_path"],
                "last_synced_at": int(row["last_synced_at"]),
            })

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

    @classmethod
    def _extract_url(
        cls,
        payload: dict[str, Any],
        *,
        direct_keys: tuple[str, ...],
        nested_keys: tuple[tuple[str, str], ...],
    ) -> str | None:
        for key in direct_keys:
            direct_value = cls._as_asset_url(payload.get(key))
            if direct_value is not None:
                return direct_value

        for parent_key, child_key in nested_keys:
            nested_value = cls._nested_text(payload, parent_key, child_key)
            if nested_value is not None:
                return cls._as_asset_url(nested_value)

        return None

    @classmethod
    def _as_asset_url(cls, value: object) -> str | None:
        normalized = cls._as_text(value)
        if normalized is None:
            return None
        if normalized.startswith("//"):
            return f"https:{normalized}"
        if normalized.startswith("/"):
            return f"https://api.opendota.com{normalized}"
        return normalized

    @staticmethod
    def _as_text(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip()
        return normalized if normalized else None

    @classmethod
    def _extract_name(
        cls,
        payload: dict[str, Any],
        *,
        direct_keys: tuple[str, ...],
        nested_keys: tuple[tuple[str, str], ...],
    ) -> str | None:
        for key in direct_keys:
            direct_value = cls._as_text(payload.get(key))
            if direct_value is not None:
                return direct_value

        for parent_key, child_key in nested_keys:
            nested_value = cls._nested_text(payload, parent_key, child_key)
            if nested_value is not None:
                return nested_value

        return None

    @classmethod
    def _extract_team_id(cls, payload: dict[str, Any], side: str) -> int | None:
        direct_value = cls._as_int(payload.get(f"{side}_team_id"))
        if direct_value is not None:
            return direct_value

        nested_value = payload.get(f"{side}_team")
        scalar_value = cls._as_int(nested_value)
        if scalar_value is not None:
            return scalar_value

        if isinstance(nested_value, dict):
            return cls._as_int(nested_value.get("team_id"))

        return None

    def _upsert_match_players(self, detail: dict[str, Any]) -> None:
        """Persist player identity rows from OpenDota match detail."""
        match_id = self._as_int(detail.get("match_id"))
        players = detail.get("players")
        if match_id is None or not isinstance(players, list):
            return

        normalized_rows: list[tuple[Any, ...]] = []
        synced_at = int(time.time())
        for index, raw_player in enumerate(players):
            if not isinstance(raw_player, dict):
                continue

            player_slot = self._normalize_player_slot(raw_player.get("player_slot"), index)

            is_radiant = raw_player.get("isRadiant")
            if isinstance(is_radiant, bool):
                team_id = 2 if is_radiant else 3
            else:
                team_id = 2 if player_slot < 5 else 3

            normalized_rows.append(
                (
                    match_id,
                    player_slot,
                    self._as_int(raw_player.get("account_id")),
                    self._as_int(raw_player.get("hero_id")),
                    team_id,
                    self._as_text(raw_player.get("personaname") or raw_player.get("persona_name")),
                    self._as_text(raw_player.get("name") or raw_player.get("pro_name")),
                    synced_at,
                )
            )

        if not normalized_rows:
            return

        conn = get_connection()
        cursor = conn.cursor()
        cursor.executemany(
            """
            INSERT INTO opendota_match_players (
                match_id,
                player_slot,
                account_id,
                hero_id,
                team_id,
                persona_name,
                pro_name,
                last_synced_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id, player_slot) DO UPDATE SET
                account_id = excluded.account_id,
                hero_id = excluded.hero_id,
                team_id = excluded.team_id,
                persona_name = excluded.persona_name,
                pro_name = excluded.pro_name,
                last_synced_at = excluded.last_synced_at
            """,
            normalized_rows,
        )
        conn.commit()

    @staticmethod
    def _as_bool_flag(value: object) -> int | None:
        if isinstance(value, bool):
            return 1 if value else 0
        if isinstance(value, (int, float)) and value in {0, 1}:
            return int(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes"}:
                return 1
            if normalized in {"0", "false", "no"}:
                return 0
        return None

    @classmethod
    def _normalize_player_slot(cls, raw_slot: object, fallback_index: int) -> int:
        normalized_slot = cls._as_int(raw_slot)
        if normalized_slot is None:
            return fallback_index
        if normalized_slot >= 128:
            return normalized_slot - 128 + 5
        return normalized_slot

    @classmethod
    def _nested_text(cls, payload: dict[str, Any], parent_key: str, child_key: str) -> str | None:
        nested = payload.get(parent_key)
        if not isinstance(nested, dict):
            return None
        return cls._as_text(nested.get(child_key))
