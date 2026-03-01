"""Remote mirror endpoints for OpenDota sync and ingest workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from database.sqlite_db import get_connection
from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.opendota_sync_service import OpenDotaSyncService
from services.replay_download_service import ReplayDownloadService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.opendota_reference_storage import OpenDotaReferenceStorage
from storage.replay_download_storage import ReplayDownloadStorage

router = APIRouter()

opendota_service = OpenDotaService()
opendota_match_storage = OpenDotaMatchStorage()
opendota_reference_storage = OpenDotaReferenceStorage()
replay_download_storage = ReplayDownloadStorage()
opendota_sync_service = OpenDotaSyncService(
    opendota_service=opendota_service,
    opendota_match_storage=opendota_match_storage,
    opendota_reference_storage=opendota_reference_storage,
)
replay_download_service = ReplayDownloadService(
    opendota_service=opendota_service,
    replay_download_storage=replay_download_storage,
    opendota_match_storage=opendota_match_storage,
)


class RemoteMatchRecord(BaseModel):
    match_id: int
    start_time: int
    duration: int
    radiant_team_id: int | None = None
    dire_team_id: int | None = None
    leagueid: int | None = None
    radiant_team_name: str | None = None
    dire_team_name: str | None = None
    league_name: str | None = None
    source: str
    last_synced_at: int
    radiant_icon_url: str | None = None
    dire_icon_url: str | None = None
    radiant_logo_url: str | None = None
    dire_logo_url: str | None = None
    league_icon_url: str | None = None
    league_logo_url: str | None = None
    radiant_logo_sponsor_url: str | None = None
    dire_logo_sponsor_url: str | None = None
    league_image_url: str | None = None
    league_banner_url: str | None = None
    download_task_id: str | None = None
    download_status: str | None = None
    download_attempt_count: int | None = None
    download_error_code: str | None = None
    download_error_message: str | None = None
    download_updated_at: int | None = None
    local_parse_status: str | None = None
    local_replay_path: str | None = None


class RemoteMatchListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    matches: list[RemoteMatchRecord]


class RemoteSyncRequest(BaseModel):
    include_pro: bool = True
    include_public: bool = False
    limit: int = Field(default=100, ge=1, le=200)
    sync_reference: bool = True


class RemoteSyncResponse(BaseModel):
    status: str
    message: str | None = None
    fetched: dict[str, int]
    inserted: dict[str, int]
    updated: dict[str, int]
    total_inserted: int
    total_updated: int
    reference: dict[str, int]


class RemoteIngestRequest(BaseModel):
    match_ids: list[int] = Field(..., min_length=1)


class RemoteIngestItem(BaseModel):
    match_id: int
    status: str
    task_id: str | None = None
    message: str | None = None


class RemoteIngestResponse(BaseModel):
    status: str
    total: int
    succeeded: int
    failed: int
    results: list[RemoteIngestItem]


class RemoteMatchStatusResponse(BaseModel):
    status: str
    match_id: int
    download_task: dict[str, Any] | None = None
    local_parse_status: str | None = None
    local_replay_path: str | None = None
    replay_dem_exists: bool = False
    replay_bz2_exists: bool = False


def _is_missing_name(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


async def _backfill_missing_league_names(*, match_ids: list[int]) -> None:
    for current_match_id in match_ids:
        try:
            detail = await opendota_service.fetch_match_details(current_match_id)
            opendota_match_storage.upsert_match_detail(detail)
        except Exception:
            # Best-effort backfill should never block listing responses.
            continue


@router.get("/matches", response_model=RemoteMatchListResponse)
async def list_remote_matches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_pro: bool = Query(True),
    include_public: bool = Query(False),
    match_id: int | None = Query(None, ge=1),
    leagueid: int | None = Query(None, ge=1),
) -> RemoteMatchListResponse:
    """List synced remote mirror matches with source filters and pagination."""
    total, rows = opendota_match_storage.list_recent_matches(
        limit=limit,
        offset=offset,
        include_pro=include_pro,
        include_public=include_public,
        match_id=match_id,
        leagueid=leagueid,
    )

    missing_league_name_match_ids: list[int] = []
    for row in rows:
        if _is_missing_name(row.get("league_name")):
            raw_match_id = row.get("match_id")
            if isinstance(raw_match_id, int):
                missing_league_name_match_ids.append(raw_match_id)

    if missing_league_name_match_ids:
        await _backfill_missing_league_names(match_ids=missing_league_name_match_ids[: len(rows)])
        total, rows = opendota_match_storage.list_recent_matches(
            limit=limit,
            offset=offset,
            include_pro=include_pro,
            include_public=include_public,
            match_id=match_id,
            leagueid=leagueid,
        )

    return RemoteMatchListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        matches=[RemoteMatchRecord(**row) for row in rows],
    )


@router.post("/sync", response_model=RemoteSyncResponse)
async def sync_remote_matches(payload: RemoteSyncRequest) -> RemoteSyncResponse:
    """Trigger remote mirror sync for pro/public sources."""
    if not payload.include_pro and not payload.include_public:
        raise HTTPException(status_code=422, detail="At least one source must be enabled.")

    try:
        result = await opendota_sync_service.sync_selected_sources(
            include_pro=payload.include_pro,
            include_public=payload.include_public,
            limit=payload.limit,
            sync_reference=payload.sync_reference,
        )
    except OpenDotaServiceError as exc:
        return RemoteSyncResponse(
            status="error",
            message=str(exc),
            fetched={"pro": 0, "public": 0},
            inserted={"pro": 0, "public": 0},
            updated={"pro": 0, "public": 0},
            total_inserted=0,
            total_updated=0,
            reference={
                "teams_inserted": 0,
                "teams_updated": 0,
                "leagues_inserted": 0,
                "leagues_updated": 0,
            },
        )

    return RemoteSyncResponse(message=None, **result)


@router.post("/ingest", response_model=RemoteIngestResponse)
async def ingest_remote_matches(payload: RemoteIngestRequest) -> RemoteIngestResponse:
    """Ingest one or more match IDs through prepare+download+parse chain."""
    succeeded = 0
    failed = 0
    results: list[RemoteIngestItem] = []

    for match_id in payload.match_ids:
        try:
            task: dict[str, Any] = await replay_download_service.prepare_and_execute(match_id=match_id)
            status = str(task.get("status", "failed"))
            task_id = task.get("task_id")
            if status == "completed":
                succeeded += 1
            else:
                failed += 1
            results.append(
                RemoteIngestItem(
                    match_id=match_id,
                    status=status,
                    task_id=str(task_id) if isinstance(task_id, str) else None,
                    message=str(task.get("error_message")) if task.get("error_message") else None,
                )
            )
        except Exception as exc:
            failed += 1
            results.append(
                RemoteIngestItem(
                    match_id=match_id,
                    status="failed",
                    task_id=None,
                    message=str(exc),
                )
            )

    return RemoteIngestResponse(
        status="ok",
        total=len(payload.match_ids),
        succeeded=succeeded,
        failed=failed,
        results=results,
    )


@router.get("/matches/{match_id}/status", response_model=RemoteMatchStatusResponse)
async def get_remote_match_status(match_id: int) -> RemoteMatchStatusResponse:
    """Return latest download task and local parse/file status for one match."""
    latest = replay_download_storage.list_tasks(limit=1, offset=0, match_id=match_id)
    tasks = latest.get("tasks", []) if isinstance(latest, dict) else []
    task = tasks[0] if tasks else None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT parse_status, replay_path FROM matches WHERE match_id = ?",
        (match_id,),
    )
    row = cursor.fetchone()
    local_parse_status = row["parse_status"] if row else None
    local_replay_path = row["replay_path"] if row else None

    replays_dir = Path(__file__).resolve().parent.parent / "data" / "replays"
    dem_path = replays_dir / f"{match_id}.dem"
    bz2_path = replays_dir / f"{match_id}.dem.bz2"

    return RemoteMatchStatusResponse(
        status="ok",
        match_id=match_id,
        download_task=task,
        local_parse_status=str(local_parse_status) if local_parse_status is not None else None,
        local_replay_path=str(local_replay_path) if isinstance(local_replay_path, str) else None,
        replay_dem_exists=dem_path.exists(),
        replay_bz2_exists=bz2_path.exists(),
    )
