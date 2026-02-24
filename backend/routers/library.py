"""Local replay library endpoints (parsed-completed only)."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Path as ApiPath, Query
from pydantic import BaseModel

from database.sqlite_db import get_connection
from storage.library_storage import LibraryStorage

router = APIRouter()
library_storage = LibraryStorage()

DEFAULT_REPLAYS_DIR = Path(__file__).resolve().parent.parent / "data" / "replays"


class LibraryMatchRecord(BaseModel):
    match_id: int
    start_time: int
    duration: int
    leagueid: int | None = None
    radiant_team_id: int | None = None
    dire_team_id: int | None = None
    radiant_team_name: str | None = None
    dire_team_name: str | None = None
    league_name: str | None = None
    replay_path: str | None = None
    parse_status: str


class LibraryMatchListResponse(BaseModel):
    status: str
    total: int
    limit: int
    offset: int
    matches: list[LibraryMatchRecord]


class LibraryDeleteResponse(BaseModel):
    status: str
    match_id: int
    deleted_files: list[str]


@router.get("/matches", response_model=LibraryMatchListResponse)
async def list_library_matches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    team_id: int | None = Query(None, ge=1),
    player_id: int | None = Query(None, ge=1),
    leagueid: int | None = Query(None, ge=1),
) -> LibraryMatchListResponse:
    """List local parsed-completed matches with team/player/league filters."""
    total, records = library_storage.list_completed_matches(
        limit=limit,
        offset=offset,
        team_id=team_id,
        player_id=player_id,
        leagueid=leagueid,
    )
    return LibraryMatchListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        matches=[LibraryMatchRecord(**record) for record in records],
    )


def _resolve_delete_candidates(match_id: int, replay_path: str | None) -> list[Path]:
    candidates: list[Path] = []
    if replay_path and replay_path.strip():
        path = Path(replay_path)
        candidates.append(path)
        if path.suffix == ".dem":
            candidates.append(path.with_suffix(".dem.bz2"))
        elif path.suffixes[-2:] == [".dem", ".bz2"]:
            candidates.append(path.with_suffix(""))

    candidates.append(DEFAULT_REPLAYS_DIR / f"{match_id}.dem")
    candidates.append(DEFAULT_REPLAYS_DIR / f"{match_id}.dem.bz2")

    seen: set[str] = set()
    unique_candidates: list[Path] = []
    for candidate in candidates:
        normalized = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_candidates.append(candidate)
    return unique_candidates


@router.post("/{match_id}/delete", response_model=LibraryDeleteResponse)
async def delete_library_match_files(match_id: int = ApiPath(..., ge=1)) -> LibraryDeleteResponse:
    """Hard delete replay files but keep completed match record."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT replay_path, parse_status FROM matches WHERE match_id = ?",
        (match_id,),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

    deleted_files: list[str] = []
    replay_path = row["replay_path"] if isinstance(row["replay_path"], str) else None
    for candidate in _resolve_delete_candidates(match_id, replay_path):
        if candidate.exists() and candidate.is_file():
            candidate.unlink()
            deleted_files.append(str(candidate))

    library_storage.clear_replay_path_keep_completed(match_id)
    return LibraryDeleteResponse(status="ok", match_id=match_id, deleted_files=deleted_files)
