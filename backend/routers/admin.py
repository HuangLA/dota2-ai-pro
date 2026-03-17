"""Admin endpoints for operational backend tasks."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.opendota_sync_service import OpenDotaSyncService
from services.replay_download_service import ReplayDownloadService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.opendota_reference_storage import OpenDotaReferenceStorage
from storage.replay_download_storage import ReplayDownloadStorage
from storage.match_database_storage import MatchDatabaseStorage

router = APIRouter()
opendota_service = OpenDotaService()
opendota_match_storage = OpenDotaMatchStorage()
opendota_reference_storage = OpenDotaReferenceStorage()
replay_download_storage = ReplayDownloadStorage()
match_database_storage = MatchDatabaseStorage()
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


def _is_missing_name(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _find_match_ids_with_missing_names(records: list[dict[str, Any]]) -> list[int]:
    match_ids: list[int] = []
    for record in records:
        if not (
            _is_missing_name(record.get("radiant_team_name"))
            or _is_missing_name(record.get("dire_team_name"))
            or _is_missing_name(record.get("league_name"))
        ):
            continue

        match_id = record.get("match_id")
        if isinstance(match_id, int):
            match_ids.append(match_id)

    return match_ids


class OpenDotaSyncRecentRequest(BaseModel):
    dry_run: bool = True
    persist: bool = False
    pro_only: bool = True
    limit: int = Field(default=50, ge=1, le=200)
    sync_reference: bool = True
    reference_team_limit: int = Field(default=200, ge=1, le=1000)
    reference_league_limit: int = Field(default=200, ge=1, le=1000)


class OpenDotaSyncRecentResponse(BaseModel):
    status: str
    fetched: int
    dry_run: bool
    message: str
    inserted: int = 0
    updated: int = 0
    reference_teams_inserted: int = 0
    reference_teams_updated: int = 0
    reference_leagues_inserted: int = 0
    reference_leagues_updated: int = 0


class OpenDotaSyncReferenceRequest(BaseModel):
    dry_run: bool = True
    persist: bool = False
    team_limit: int = Field(default=100, ge=1, le=200)
    league_limit: int = Field(default=100, ge=1, le=200)


class OpenDotaSyncReferenceResponse(BaseModel):
    status: str
    dry_run: bool
    teams_fetched: int
    leagues_fetched: int
    teams_inserted: int
    teams_updated: int
    leagues_inserted: int
    leagues_updated: int
    message: str


class OpenDotaMatchRecord(BaseModel):
    match_id: int
    start_time: int
    duration: int
    radiant_team_id: int | None = None
    dire_team_id: int | None = None
    leagueid: int | None = None
    last_synced_at: int


class OpenDotaMatchListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    matches: list[OpenDotaMatchRecord]


class MatchDatabaseRecord(BaseModel):
    match_id: int
    start_time: int
    duration: int
    radiant_team_id: int | None = None
    dire_team_id: int | None = None
    leagueid: int | None = None
    radiant_team_name: str | None = None
    dire_team_name: str | None = None
    league_name: str | None = None
    download_status: str | None = None
    download_task_id: str | None = None
    download_attempt_count: int | None = None
    download_path: str | None = None


class MatchDatabaseListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    matches: list[MatchDatabaseRecord]


class OpenDotaTeamRecord(BaseModel):
    team_id: int
    name: str | None = None
    tag: str | None = None
    wins: int
    losses: int
    last_synced_at: int


class OpenDotaTeamListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    teams: list[OpenDotaTeamRecord]


class OpenDotaLeagueRecord(BaseModel):
    leagueid: int
    name: str | None = None
    tier: str | None = None
    last_synced_at: int


class OpenDotaLeagueListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    leagues: list[OpenDotaLeagueRecord]


class ReplayPrepareRequest(BaseModel):
    match_id: int = Field(..., ge=1)


class ReplayDownloadTaskRecord(BaseModel):
    task_id: str
    match_id: int
    status: str
    progress: int
    attempt_count: int
    replay_url: str | None = None
    download_path: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: int
    updated_at: int


class ReplayPrepareResponse(BaseModel):
    status: str
    task: ReplayDownloadTaskRecord


class ReplayDownloadTaskListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    tasks: list[ReplayDownloadTaskRecord]


class ReplayDownloadTaskActionRequest(BaseModel):
    task_id: str = Field(..., min_length=1)


class MatchDatabaseDownloadActionRequest(BaseModel):
    mode: Literal["prepare", "prepare_and_execute"] = "prepare"


class ReplayDownloadTaskActionResponse(BaseModel):
    status: str
    message: str
    task: ReplayDownloadTaskRecord | None = None


@router.post("/opendota/sync/recent", response_model=OpenDotaSyncRecentResponse)
async def sync_recent_matches(
    payload: OpenDotaSyncRecentRequest,
) -> OpenDotaSyncRecentResponse:
    """OpenDota recent match sync with optional persistence."""
    try:
        result = await opendota_sync_service.sync_recent_matches(
            limit=payload.limit,
            dry_run=payload.dry_run,
            persist=payload.persist,
            pro_only=payload.pro_only,
        )

        reference_executed = False
        reference_reason = "disabled_by_request"
        reference_teams_inserted = 0
        reference_teams_updated = 0
        reference_leagues_inserted = 0
        reference_leagues_updated = 0

        if payload.persist and not payload.dry_run and payload.sync_reference:
            reference_result = await opendota_sync_service.sync_reference_data(
                team_limit=payload.reference_team_limit,
                league_limit=payload.reference_league_limit,
                dry_run=False,
                persist=True,
            )
            reference_executed = True
            reference_reason = "persist_flow"
            reference_teams_inserted = int(reference_result.get("teams_inserted", 0))
            reference_teams_updated = int(reference_result.get("teams_updated", 0))
            reference_leagues_inserted = int(reference_result.get("leagues_inserted", 0))
            reference_leagues_updated = int(reference_result.get("leagues_updated", 0))
        elif payload.dry_run:
            reference_reason = "dry_run_mode"
        elif not payload.persist:
            reference_reason = "persist_disabled"

        reference_state = "executed" if reference_executed else "skipped"
        message = (
            f"{result['message']} "
            f"[reference_sync={reference_state};reason={reference_reason}]"
        )
    except OpenDotaServiceError as exc:
        return OpenDotaSyncRecentResponse(
            status="error",
            fetched=0,
            dry_run=payload.dry_run,
            message=f"{exc} [reference_sync=skipped;reason=recent_sync_failed]",
            inserted=0,
            updated=0,
            reference_teams_inserted=0,
            reference_teams_updated=0,
            reference_leagues_inserted=0,
            reference_leagues_updated=0,
        )

    response_payload = dict(result)
    response_payload["message"] = message
    response_payload["reference_teams_inserted"] = reference_teams_inserted
    response_payload["reference_teams_updated"] = reference_teams_updated
    response_payload["reference_leagues_inserted"] = reference_leagues_inserted
    response_payload["reference_leagues_updated"] = reference_leagues_updated
    return OpenDotaSyncRecentResponse(**response_payload)


@router.post("/opendota/sync/reference", response_model=OpenDotaSyncReferenceResponse)
async def sync_opendota_reference(
    payload: OpenDotaSyncReferenceRequest,
) -> OpenDotaSyncReferenceResponse:
    """OpenDota teams/leagues reference sync with optional persistence."""
    try:
        result = await opendota_sync_service.sync_reference_data(
            team_limit=payload.team_limit,
            league_limit=payload.league_limit,
            dry_run=payload.dry_run,
            persist=payload.persist,
        )
    except OpenDotaServiceError as exc:
        return OpenDotaSyncReferenceResponse(
            status="error",
            dry_run=payload.dry_run,
            teams_fetched=0,
            leagues_fetched=0,
            teams_inserted=0,
            teams_updated=0,
            leagues_inserted=0,
            leagues_updated=0,
            message=str(exc),
        )

    return OpenDotaSyncReferenceResponse(**result)


@router.get("/opendota/matches", response_model=OpenDotaMatchListResponse)
async def list_opendota_matches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    team_id: int | None = Query(None, ge=1),
    leagueid: int | None = Query(None, ge=1),
    start_time_from: int | None = Query(None, ge=0),
    start_time_to: int | None = Query(None, ge=0),
) -> OpenDotaMatchListResponse:
    """List synced OpenDota matches with optional filters and pagination."""
    if (
        start_time_from is not None
        and start_time_to is not None
        and start_time_from > start_time_to
    ):
        raise HTTPException(
            status_code=422,
            detail="start_time_from must be less than or equal to start_time_to",
        )

    total, records = opendota_match_storage.list_recent_matches(
        limit=limit,
        offset=offset,
        team_id=team_id,
        leagueid=leagueid,
        start_time_from=start_time_from,
        start_time_to=start_time_to,
    )
    return OpenDotaMatchListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        matches=[OpenDotaMatchRecord(**record) for record in records],
    )


@router.get("/opendota/teams", response_model=OpenDotaTeamListResponse)
async def list_opendota_teams(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> OpenDotaTeamListResponse:
    """List synced OpenDota teams with pagination."""
    total, records = opendota_reference_storage.list_teams(limit=limit, offset=offset)
    return OpenDotaTeamListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        teams=[OpenDotaTeamRecord(**record) for record in records],
    )


@router.get("/match-database", response_model=MatchDatabaseListResponse)
async def list_match_database(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    professional_only: bool = Query(True),
    team_id: int | None = Query(None, ge=1),
    leagueid: int | None = Query(None, ge=1),
    has_download: bool | None = Query(None),
    start_time_from: int | None = Query(None, ge=0),
    start_time_to: int | None = Query(None, ge=0),
) -> MatchDatabaseListResponse:
    """List match database records by joining OpenDota matches and latest download task."""
    if (
        start_time_from is not None
        and start_time_to is not None
        and start_time_from > start_time_to
    ):
        raise HTTPException(
            status_code=422,
            detail="start_time_from must be less than or equal to start_time_to",
        )

    total, records = match_database_storage.list_match_database(
        limit=limit,
        offset=offset,
        professional_only=professional_only,
        team_id=team_id,
        leagueid=leagueid,
        has_download=has_download,
        start_time_from=start_time_from,
        start_time_to=start_time_to,
    )

    missing_name_match_ids = _find_match_ids_with_missing_names(records)
    if missing_name_match_ids:
        for match_id in missing_name_match_ids:
            try:
                detail = await opendota_service.fetch_match_details(match_id)
                opendota_match_storage.upsert_match_detail(detail)
            except OpenDotaServiceError:
                continue

        total, records = match_database_storage.list_match_database(
            limit=limit,
            offset=offset,
            professional_only=professional_only,
            team_id=team_id,
            leagueid=leagueid,
            has_download=has_download,
            start_time_from=start_time_from,
            start_time_to=start_time_to,
        )

    return MatchDatabaseListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        matches=[MatchDatabaseRecord(**record) for record in records],
    )


@router.get("/opendota/leagues", response_model=OpenDotaLeagueListResponse)
async def list_opendota_leagues(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> OpenDotaLeagueListResponse:
    """List synced OpenDota leagues with pagination."""
    total, records = opendota_reference_storage.list_leagues(limit=limit, offset=offset)
    return OpenDotaLeagueListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        leagues=[OpenDotaLeagueRecord(**record) for record in records],
    )


@router.post("/replays/download/prepare", response_model=ReplayPrepareResponse)
async def prepare_replay_download(payload: ReplayPrepareRequest) -> ReplayPrepareResponse:
    """Prepare replay download by resolving replay URL from match details."""
    task = await replay_download_service.prepare_replay_download(match_id=payload.match_id)
    return ReplayPrepareResponse(status="ok", task=ReplayDownloadTaskRecord(**task))


@router.get("/replays/download/tasks", response_model=ReplayDownloadTaskListResponse)
async def list_replay_download_tasks(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Literal["pending", "prepared", "downloading", "completed", "failed"] | None = Query(None),
    match_id: int | None = Query(None, ge=1),
) -> ReplayDownloadTaskListResponse:
    """List replay download preparation tasks."""
    result = replay_download_service.list_prepare_tasks(
        limit=limit,
        offset=offset,
        status=status,
        match_id=match_id,
    )
    return ReplayDownloadTaskListResponse(
        status="ok",
        total=int(result["total"]),
        limit=limit,
        offset=offset,
        tasks=[ReplayDownloadTaskRecord(**record) for record in result["tasks"]],
    )


@router.get("/replays/download/tasks/{task_id}", response_model=ReplayDownloadTaskActionResponse)
async def get_replay_download_task(task_id: str) -> ReplayDownloadTaskActionResponse:
    """Get one replay download task by task_id."""
    task = replay_download_service.get_task(task_id=task_id)
    if task is None:
        return ReplayDownloadTaskActionResponse(
            status="error",
            message=f"Replay download task not found: {task_id}",
            task=None,
        )

    return ReplayDownloadTaskActionResponse(
        status="ok",
        message="Replay download task loaded.",
        task=ReplayDownloadTaskRecord(**task),
    )


@router.post("/replays/download/by-match", response_model=ReplayPrepareResponse)
async def prepare_and_execute_replay_download(payload: ReplayPrepareRequest) -> ReplayPrepareResponse:
    """Prepare replay download task and execute immediately when prepared."""
    task = await replay_download_service.prepare_and_execute(match_id=payload.match_id)
    return ReplayPrepareResponse(status="ok", task=ReplayDownloadTaskRecord(**task))


@router.post(
    "/match-database/{match_id}/download",
    response_model=ReplayDownloadTaskActionResponse,
)
async def trigger_match_database_download_action(
    payload: MatchDatabaseDownloadActionRequest,
    match_id: int = Path(..., ge=1),
) -> ReplayDownloadTaskActionResponse:
    """Trigger replay download action from match database page."""
    result = await replay_download_service.trigger_match_download_action(
        match_id=match_id,
        mode=payload.mode,
    )
    task = result.get("task")
    return ReplayDownloadTaskActionResponse(
        status=str(result.get("status", "error")),
        message=str(result.get("message", "Unknown action result.")),
        task=ReplayDownloadTaskRecord(**task) if isinstance(task, dict) else None,
    )


@router.post(
    "/match-database/{match_id}/delete-replay",
    response_model=ReplayDownloadTaskActionResponse,
)
async def delete_match_database_replay(
    match_id: int = Path(..., ge=1),
) -> ReplayDownloadTaskActionResponse:
    """Delete downloaded replay artifacts for a match."""
    result = replay_download_service.delete_downloaded_replay(match_id=match_id)
    task = result.get("task")
    return ReplayDownloadTaskActionResponse(
        status=str(result.get("status", "error")),
        message=str(result.get("message", "Unknown action result.")),
        task=ReplayDownloadTaskRecord(**task) if isinstance(task, dict) else None,
    )


@router.post("/replays/download/execute", response_model=ReplayDownloadTaskActionResponse)
async def execute_replay_download(
    payload: ReplayDownloadTaskActionRequest,
) -> ReplayDownloadTaskActionResponse:
    """Execute replay download for a prepared task."""
    try:
        task = await replay_download_service.execute_download(task_id=payload.task_id)
    except OpenDotaServiceError as exc:
        return ReplayDownloadTaskActionResponse(status="error", message=str(exc), task=None)
    except ValueError as exc:
        return ReplayDownloadTaskActionResponse(status="error", message=str(exc), task=None)

    task_status = str(task["status"])
    message = "Replay download completed." if task_status == "completed" else "Replay download failed."
    return ReplayDownloadTaskActionResponse(
        status="ok",
        message=message,
        task=ReplayDownloadTaskRecord(**task),
    )


@router.post("/replays/download/retry", response_model=ReplayDownloadTaskActionResponse)
async def retry_replay_download_task(
    payload: ReplayDownloadTaskActionRequest,
) -> ReplayDownloadTaskActionResponse:
    """Reset replay download task from failed/prepared to prepared."""
    try:
        task = replay_download_service.retry_task(task_id=payload.task_id)
    except ValueError as exc:
        return ReplayDownloadTaskActionResponse(status="error", message=str(exc), task=None)

    return ReplayDownloadTaskActionResponse(
        status="ok",
        message="Replay download task reset to prepared.",
        task=ReplayDownloadTaskRecord(**task),
    )
