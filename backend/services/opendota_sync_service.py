"""Business service for OpenDota recent match sync workflows."""

from __future__ import annotations

from typing import Any

from services.opendota_service import OpenDotaService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.opendota_reference_storage import OpenDotaReferenceStorage


class OpenDotaSyncService:
    """Coordinates fetch + optional persistence for OpenDota sync."""

    def __init__(
        self,
        opendota_service: OpenDotaService,
        opendota_match_storage: OpenDotaMatchStorage,
        opendota_reference_storage: OpenDotaReferenceStorage,
    ) -> None:
        self.opendota_service = opendota_service
        self.opendota_match_storage = opendota_match_storage
        self.opendota_reference_storage = opendota_reference_storage

    async def sync_recent_matches(
        self,
        *,
        limit: int,
        dry_run: bool,
        persist: bool,
        pro_only: bool,
    ) -> dict[str, Any]:
        """Fetch recent matches and optionally persist with idempotent upsert."""
        source_label = "pro" if pro_only else "public"
        if pro_only:
            recent_matches = await self.opendota_service.fetch_pro_matches(limit=limit)
        else:
            recent_matches = await self.opendota_service.fetch_recent_matches(limit=limit)

        inserted = 0
        updated = 0
        if persist and not dry_run:
            try:
                inserted, updated = self.opendota_match_storage.upsert_recent_matches(
                    recent_matches,
                    source=source_label,
                )
            except TypeError:
                inserted, updated = self.opendota_match_storage.upsert_recent_matches(recent_matches)

        if dry_run:
            message = f"Dry-run fetch completed (source={source_label})."
        elif persist:
            message = f"Fetch and persistence completed (source={source_label})."
        else:
            message = f"Fetch completed (persistence disabled, source={source_label})."

        return {
            "status": "ok",
            "fetched": len(recent_matches),
            "dry_run": dry_run,
            "message": message,
            "inserted": inserted,
            "updated": updated,
        }

    async def sync_selected_sources(
        self,
        *,
        include_pro: bool,
        include_public: bool,
        limit: int,
        sync_reference: bool,
    ) -> dict[str, Any]:
        """Sync selected OpenDota match sources and optional reference dimensions."""
        total_inserted = 0
        total_updated = 0
        fetched = {"pro": 0, "public": 0}
        inserted = {"pro": 0, "public": 0}
        updated = {"pro": 0, "public": 0}

        if include_pro:
            pro_matches = await self.opendota_service.fetch_pro_matches(limit=limit)
            fetched["pro"] = len(pro_matches)
            inserted["pro"], updated["pro"] = self.opendota_match_storage.upsert_recent_matches(
                pro_matches,
                source="pro",
            )
            total_inserted += inserted["pro"]
            total_updated += updated["pro"]

        if include_public:
            public_matches = await self.opendota_service.fetch_recent_matches(limit=limit)
            fetched["public"] = len(public_matches)
            inserted["public"], updated["public"] = self.opendota_match_storage.upsert_recent_matches(
                public_matches,
                source="public",
            )
            total_inserted += inserted["public"]
            total_updated += updated["public"]

        reference_result: dict[str, int] = {
            "teams_inserted": 0,
            "teams_updated": 0,
            "leagues_inserted": 0,
            "leagues_updated": 0,
        }
        if sync_reference:
            result = await self.sync_reference_data(
                team_limit=200,
                league_limit=200,
                dry_run=False,
                persist=True,
            )
            reference_result = {
                "teams_inserted": int(result["teams_inserted"]),
                "teams_updated": int(result["teams_updated"]),
                "leagues_inserted": int(result["leagues_inserted"]),
                "leagues_updated": int(result["leagues_updated"]),
            }

        return {
            "status": "ok",
            "fetched": fetched,
            "inserted": inserted,
            "updated": updated,
            "total_inserted": total_inserted,
            "total_updated": total_updated,
            "reference": reference_result,
        }

    async def sync_reference_data(
        self,
        *,
        team_limit: int,
        league_limit: int,
        dry_run: bool,
        persist: bool,
    ) -> dict[str, Any]:
        """Fetch teams/leagues and optionally persist to reference tables."""
        teams = await self.opendota_service.fetch_teams(limit=team_limit)
        leagues = await self.opendota_service.fetch_leagues(limit=league_limit)

        teams_inserted = 0
        teams_updated = 0
        leagues_inserted = 0
        leagues_updated = 0

        if persist and not dry_run:
            teams_inserted, teams_updated = self.opendota_reference_storage.upsert_teams(teams)
            leagues_inserted, leagues_updated = self.opendota_reference_storage.upsert_leagues(leagues)

        if dry_run:
            message = "Reference dry-run fetch completed."
        elif persist:
            message = "Reference fetch and persistence completed."
        else:
            message = "Reference fetch completed (persistence disabled)."

        return {
            "status": "ok",
            "dry_run": dry_run,
            "teams_fetched": len(teams),
            "leagues_fetched": len(leagues),
            "teams_inserted": teams_inserted,
            "teams_updated": teams_updated,
            "leagues_inserted": leagues_inserted,
            "leagues_updated": leagues_updated,
            "message": message,
        }
