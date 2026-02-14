"""Replay management endpoints."""

import os
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, BackgroundTasks
from pydantic import BaseModel

from services.parse_service import ParseService, TaskStatus

router = APIRouter()

# Initialize parse service
parse_service = ParseService(
    data_dir="backend/data/matches",
    replays_dir="data/replays"
)

# =========== Models ===========

class ParseTaskResponse(BaseModel):
    """Parse task response model."""
    task_id: str
    status: str
    replay_path: str
    progress: float = 0.0
    error: Optional[str] = None
    match_id: Optional[int] = None
    created_at: int
    started_at: Optional[int] = None
    completed_at: Optional[int] = None


class ParseTaskCreate(BaseModel):
    """Request model for creating a parse task."""
    replay_path: str


class ParseDirectRequest(BaseModel):
    """Request for direct (synchronous) parsing."""
    replay_path: str


class ParseDirectResponse(BaseModel):
    """Response for direct parsing."""
    success: bool
    match_id: Optional[int] = None
    parse_time_ms: int = 0
    total_ticks: int = 0
    position_samples: int = 0
    kill_events: int = 0
    ward_events: int = 0
    error: Optional[str] = None


class UploadResponse(BaseModel):
    """Response for file upload."""
    status: str
    filename: str
    replay_path: str
    task_id: str


# =========== Background task runner ===========

def run_parse_task_background(task_id: str):
    """Run a parse task in the background."""
    try:
        parse_service.run_task(task_id)
    except Exception as e:
        # Error is already logged in run_task
        pass


# =========== Endpoints ===========

@router.post("/upload", response_model=UploadResponse)
async def upload_replay(
    file: UploadFile,
    background_tasks: BackgroundTasks
) -> UploadResponse:
    """
    Upload a .dem replay file for parsing.
    
    The file will be saved and a parse task will be created automatically.
    """
    if not file.filename or not file.filename.endswith(".dem"):
        raise HTTPException(
            status_code=400, 
            detail="File must be a .dem replay file"
        )
    
    # Ensure replays directory exists
    replays_dir = Path("data/replays")
    replays_dir.mkdir(parents=True, exist_ok=True)
    
    # Save file
    replay_path = replays_dir / file.filename
    
    try:
        with open(replay_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {e}"
        )
    
    # Create parse task
    task_id = parse_service.create_parse_task(str(replay_path))
    
    # Start background parsing
    background_tasks.add_task(run_parse_task_background, task_id)
    
    return UploadResponse(
        status="uploaded",
        filename=file.filename,
        replay_path=str(replay_path),
        task_id=task_id
    )


@router.post("/parse", response_model=ParseTaskResponse)
async def create_parse_task(
    request: ParseTaskCreate,
    background_tasks: BackgroundTasks
) -> ParseTaskResponse:
    """
    Create a new replay parsing task for an existing file.
    
    The task will be queued and processed in the background.
    """
    # Validate replay path
    valid, message = parse_service.validate_replay_path(request.replay_path)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    
    # Create task
    task_id = parse_service.create_parse_task(request.replay_path)
    
    # Start background parsing
    background_tasks.add_task(run_parse_task_background, task_id)
    
    # Get task info
    task = parse_service.get_task(task_id)
    
    return ParseTaskResponse(
        task_id=task.task_id,
        status=task.status.value,
        replay_path=task.replay_path,
        progress=task.progress,
        error=task.error_message,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at
    )


@router.post("/parse/sync", response_model=ParseDirectResponse)
async def parse_replay_sync(request: ParseDirectRequest) -> ParseDirectResponse:
    """
    Parse a replay file synchronously (blocking).
    
    This endpoint will wait for parsing to complete before returning.
    Use this for testing or when immediate results are needed.
    For production use, prefer the async /parse endpoint.
    """
    # Validate replay path
    valid, message = parse_service.validate_replay_path(request.replay_path)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    
    try:
        result = await parse_service.parse_replay_async(request.replay_path)
        
        if result.success:
            return ParseDirectResponse(
                success=True,
                match_id=result.metadata.match_id,
                parse_time_ms=result.parse_time_ms,
                total_ticks=result.total_ticks,
                position_samples=len(result.positions),
                kill_events=len(result.kills),
                ward_events=len(result.wards)
            )
        else:
            return ParseDirectResponse(
                success=False,
                error=result.error
            )
    except Exception as e:
        return ParseDirectResponse(
            success=False,
            error=str(e)
        )


@router.get("/tasks")
async def list_parse_tasks(
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0
) -> dict:
    """
    List all parse tasks with optional filtering.
    
    Args:
        status: Filter by status (pending, running, completed, failed, cancelled)
        limit: Maximum number of results (default 20)
        offset: Skip this many results (for pagination)
    """
    # Convert status string to enum if provided
    status_enum = None
    if status:
        try:
            status_enum = TaskStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status}. Must be one of: pending, running, completed, failed, cancelled"
            )
    
    tasks = parse_service.list_tasks(
        status=status_enum,
        limit=limit,
        offset=offset
    )
    
    return {
        "tasks": [
            {
                "task_id": t.task_id,
                "status": t.status.value,
                "replay_path": t.replay_path,
                "progress": t.progress,
                "error": t.error_message,
                "created_at": t.created_at,
                "started_at": t.started_at,
                "completed_at": t.completed_at
            }
            for t in tasks
        ],
        "total": len(tasks),
        "limit": limit,
        "offset": offset
    }


@router.get("/tasks/{task_id}", response_model=ParseTaskResponse)
async def get_parse_task(task_id: str) -> ParseTaskResponse:
    """Get status of a specific parse task."""
    task = parse_service.get_task(task_id)
    
    if not task:
        raise HTTPException(
            status_code=404, 
            detail=f"Task {task_id} not found"
        )
    
    return ParseTaskResponse(
        task_id=task.task_id,
        status=task.status.value,
        replay_path=task.replay_path,
        progress=task.progress,
        error=task.error_message,
        match_id=task.match_id,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_parse_task(task_id: str) -> dict:
    """Cancel a pending parse task."""
    success = parse_service.cancel_task(task_id)
    
    if not success:
        task = parse_service.get_task(task_id)
        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"Task {task_id} not found"
            )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status: {task.status.value}"
        )
    
    return {
        "task_id": task_id,
        "status": "cancelled",
        "message": "Task cancelled successfully"
    }
