"""
Parse service for handling replay parsing workflow.

This service coordinates:
1. Parsing replays with Clarity
2. Storing tick data to Parquet
3. Storing metadata to SQLite
4. Managing parse tasks
"""

import sqlite3
import time
import uuid
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from enum import Enum

from parsers.clarity_parser import ClarityParser, ClarityParserError
from parsers.models import ParseResult
from storage.parquet_storage import ParquetStorage
from storage.match_storage import MatchStorage
from database.sqlite_db import get_connection


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ParseTask:
    """Represents a parse task."""
    task_id: str
    replay_path: str
    status: TaskStatus
    progress: float
    error_message: Optional[str]
    created_at: int
    started_at: Optional[int]
    completed_at: Optional[int]
    match_id: Optional[int] = None


class ParseService:
    """
    Service for parsing replays and storing data.
    
    Usage:
        service = ParseService()
        
        # Synchronous parsing
        result = service.parse_replay("path/to/replay.dem")
        
        # Create async task
        task_id = service.create_parse_task("path/to/replay.dem")
        task = service.get_task(task_id)
    """
    
    def __init__(
        self,
        data_dir: str = "data/matches",
        replays_dir: str = "data/replays"
    ):
        """
        Initialize parse service.
        
        Args:
            data_dir: Directory for Parquet storage
            replays_dir: Directory for replay files
        """
        backend_root = Path(__file__).resolve().parents[1]

        def resolve_path(path_value: str, env_key: str) -> Path:
            configured = os.getenv(env_key, path_value)
            candidate = Path(configured)
            if not candidate.is_absolute():
                candidate = backend_root / candidate
            return candidate

        self.parser = ClarityParser()
        self.parquet_storage = ParquetStorage(str(resolve_path(data_dir, "MATCHES_DIR")))
        self.match_storage = MatchStorage()
        self.replays_dir = resolve_path(replays_dir, "REPLAYS_DIR")
        self.replays_dir.mkdir(parents=True, exist_ok=True)
    
    def parse_replay(self, replay_path: str) -> ParseResult:
        """
        Parse a replay file synchronously.
        
        This method:
        1. Parses the replay with Clarity
        2. Stores tick data to Parquet
        3. Stores metadata to SQLite
        
        Args:
            replay_path: Path to the .dem file
            
        Returns:
            ParseResult with all extracted data
            
        Raises:
            FileNotFoundError: If replay doesn't exist
            ClarityParserError: If parsing fails
        """
        # Parse replay
        result = self.parser.parse(replay_path)
        
        if result.success:
            # Store to Parquet
            self.parquet_storage.save_parse_result(result)
            
            # Store metadata to SQLite
            self.match_storage.save_from_parse_result(result, replay_path)
        
        return result
    
    async def parse_replay_async(self, replay_path: str) -> ParseResult:
        """
        Parse a replay file asynchronously.
        
        Args:
            replay_path: Path to the .dem file
            
        Returns:
            ParseResult with all extracted data
        """
        # Parse replay
        result = await self.parser.parse_async(replay_path)
        
        if result.success:
            # Store to Parquet
            self.parquet_storage.save_parse_result(result)
            
            # Store metadata to SQLite
            self.match_storage.save_from_parse_result(result, replay_path)
        
        return result
    
    # =========== Task Management ===========
    
    def create_parse_task(self, replay_path: str) -> str:
        """
        Create a new parse task.
        
        Args:
            replay_path: Path to the replay file
            
        Returns:
            Task ID
        """
        task_id = str(uuid.uuid4())
        now = int(time.time())
        
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO parse_tasks (task_id, replay_path, status, progress, created_at)
            VALUES (?, ?, 'pending', 0.0, ?)
        """, (task_id, replay_path, now))
        
        conn.commit()
        return task_id
    
    def get_task(self, task_id: str) -> Optional[ParseTask]:
        """Get a parse task by ID."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT task_id, replay_path, status, progress, error_message,
                   created_at, started_at, completed_at
            FROM parse_tasks
            WHERE task_id = ?
        """, (task_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return ParseTask(
            task_id=row["task_id"],
            replay_path=row["replay_path"],
            status=TaskStatus(row["status"]),
            progress=row["progress"],
            error_message=row["error_message"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            completed_at=row["completed_at"]
        )
    
    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 20,
        offset: int = 0
    ) -> list[ParseTask]:
        """List parse tasks with optional filtering."""
        conn = get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT task_id, replay_path, status, progress, error_message,
                   created_at, started_at, completed_at
            FROM parse_tasks
        """
        params = []
        
        if status:
            query += " WHERE status = ?"
            params.append(status.value)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        
        tasks = []
        for row in cursor.fetchall():
            tasks.append(ParseTask(
                task_id=row["task_id"],
                replay_path=row["replay_path"],
                status=TaskStatus(row["status"]),
                progress=row["progress"],
                error_message=row["error_message"],
                created_at=row["created_at"],
                started_at=row["started_at"],
                completed_at=row["completed_at"]
            ))
        
        return tasks
    
    def update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        progress: float = 0.0,
        error_message: Optional[str] = None,
        match_id: Optional[int] = None
    ) -> bool:
        """Update task status."""
        conn = get_connection()
        cursor = conn.cursor()
        
        now = int(time.time())
        
        # Determine timestamps
        started_at = now if status == TaskStatus.RUNNING else None
        completed_at = now if status in (TaskStatus.COMPLETED, TaskStatus.FAILED) else None
        
        cursor.execute("""
            UPDATE parse_tasks
            SET status = ?, progress = ?, error_message = ?,
                started_at = COALESCE(started_at, ?),
                completed_at = ?
            WHERE task_id = ?
        """, (status.value, progress, error_message, started_at, completed_at, task_id))
        
        conn.commit()
        return cursor.rowcount > 0
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a pending task."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE parse_tasks
            SET status = 'cancelled'
            WHERE task_id = ? AND status = 'pending'
        """, (task_id,))
        
        conn.commit()
        return cursor.rowcount > 0
    
    def run_task(self, task_id: str) -> ParseResult:
        """
        Execute a parse task synchronously.
        
        Args:
            task_id: Task ID to execute
            
        Returns:
            ParseResult from parsing
        """
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        if task.status != TaskStatus.PENDING:
            raise ValueError(f"Task is not pending: {task.status}")
        
        # Update to running
        self.update_task_status(task_id, TaskStatus.RUNNING, progress=0.1)
        
        try:
            # Parse replay
            result = self.parse_replay(task.replay_path)
            
            if result.success:
                self.update_task_status(
                    task_id,
                    TaskStatus.COMPLETED,
                    progress=1.0,
                    match_id=result.metadata.match_id
                )
            else:
                self.update_task_status(
                    task_id,
                    TaskStatus.FAILED,
                    error_message=result.error
                )
            
            return result
            
        except Exception as e:
            self.update_task_status(
                task_id,
                TaskStatus.FAILED,
                error_message=str(e)
            )
            raise
    
    async def run_task_async(self, task_id: str) -> ParseResult:
        """
        Execute a parse task asynchronously.
        
        Args:
            task_id: Task ID to execute
            
        Returns:
            ParseResult from parsing
        """
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        if task.status != TaskStatus.PENDING:
            raise ValueError(f"Task is not pending: {task.status}")
        
        # Update to running
        self.update_task_status(task_id, TaskStatus.RUNNING, progress=0.1)
        
        try:
            # Parse replay
            result = await self.parse_replay_async(task.replay_path)
            
            if result.success:
                self.update_task_status(
                    task_id,
                    TaskStatus.COMPLETED,
                    progress=1.0,
                    match_id=result.metadata.match_id
                )
            else:
                self.update_task_status(
                    task_id,
                    TaskStatus.FAILED,
                    error_message=result.error
                )
            
            return result
            
        except Exception as e:
            self.update_task_status(
                task_id,
                TaskStatus.FAILED,
                error_message=str(e)
            )
            raise
    
    # =========== Utility Methods ===========
    
    def get_pending_task(self) -> Optional[ParseTask]:
        """Get the next pending task to process."""
        tasks = self.list_tasks(status=TaskStatus.PENDING, limit=1)
        return tasks[0] if tasks else None
    
    def cleanup_stale_tasks(self, max_age_seconds: int = 3600) -> int:
        """
        Mark stale running tasks as failed.
        
        Args:
            max_age_seconds: Tasks running longer than this are considered stale
            
        Returns:
            Number of tasks cleaned up
        """
        conn = get_connection()
        cursor = conn.cursor()
        
        cutoff_time = int(time.time()) - max_age_seconds
        
        cursor.execute("""
            UPDATE parse_tasks
            SET status = 'failed', error_message = 'Task timed out'
            WHERE status = 'running' AND started_at < ?
        """, (cutoff_time,))
        
        conn.commit()
        return cursor.rowcount
    
    def validate_replay_path(self, replay_path: str) -> tuple[bool, str]:
        """
        Validate a replay file path.
        
        Returns:
            Tuple of (is_valid, message)
        """
        path = Path(replay_path)
        
        if not path.exists():
            return False, f"File not found: {replay_path}"
        
        if not path.suffix.lower() == ".dem":
            return False, f"Invalid file type: {path.suffix}"
        
        if path.stat().st_size < 1000:
            return False, "File too small to be a valid replay"
        
        return True, "OK"
