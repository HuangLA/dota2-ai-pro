"""Storage helpers for replay download tasks."""

from __future__ import annotations

import time
import uuid
from typing import Any

from database.sqlite_db import get_connection

_UNSET = object()

_SELECT_COLS = "task_id, match_id, status, progress, attempt_count, replay_url, download_path, error_code, error_message, created_at, updated_at"


class ReplayDownloadStorage:
    """Persistence layer for replay download tasks."""

    def create_prepare_task(self, match_id: int) -> dict[str, Any]:
        """Create a new pending task for a match."""
        now = int(time.time())
        task_id = str(uuid.uuid4())

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO replay_download_tasks (
                task_id, match_id, status, progress, attempt_count,
                replay_url, download_path, error_code, error_message, created_at, updated_at
            )
            VALUES (?, ?, 'pending', 0, 0, NULL, NULL, NULL, NULL, ?, ?)
            """,
            (task_id, match_id, now, now),
        )
        conn.commit()

        return {
            "task_id": task_id,
            "match_id": match_id,
            "status": "pending",
            "progress": 0,
            "attempt_count": 0,
            "replay_url": None,
            "download_path": None,
            "error_code": None,
            "error_message": None,
            "created_at": now,
            "updated_at": now,
        }

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Fetch a single replay download task by id."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_SELECT_COLS} FROM replay_download_tasks WHERE task_id = ?",
            (task_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return self._row_to_task(row)

    def mark_prepared(self, task_id: str, replay_url: str) -> dict[str, Any]:
        """Mark a task as prepared with resolved replay URL."""
        return self._update_task(
            task_id=task_id,
            status="prepared",
            progress=5,
            replay_url=replay_url,
            download_path=None,
            error_code=None,
            error_message=None,
        )

    def mark_downloading(self, task_id: str) -> dict[str, Any]:
        """Mark a task as downloading and increment attempt count."""
        return self._update_task(
            task_id=task_id,
            status="downloading",
            progress=10,
            replay_url=_UNSET,
            download_path=None,
            error_code=None,
            error_message=None,
            increment_attempt=True,
        )

    def mark_parsing(self, task_id: str) -> dict[str, Any]:
        """Mark a task as parsing (download finished, parse in progress)."""
        return self._update_task(
            task_id=task_id,
            status="parsing",
            progress=50,
            replay_url=_UNSET,
            download_path=_UNSET,
            error_code=None,
            error_message=None,
        )

    def update_download_progress(self, task_id: str, progress: int) -> None:
        """Lightweight progress-only update during download (10-49%)."""
        clamped = max(10, min(49, progress))
        now = int(time.time())
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE replay_download_tasks SET progress = ?, updated_at = ? WHERE task_id = ?",
            (clamped, now, task_id),
        )
        conn.commit()

    def mark_completed(self, task_id: str, download_path: str) -> dict[str, Any]:
        """Mark a task as completed with final download path."""
        return self._update_task(
            task_id=task_id,
            status="completed",
            progress=100,
            replay_url=_UNSET,
            download_path=download_path,
            error_code=None,
            error_message=None,
        )

    def increment_attempt(self, task_id: str) -> dict[str, Any]:
        """Increment attempt_count while keeping current status."""
        task = self.get_task(task_id)
        if task is None:
            raise ValueError(f"Replay download task not found: {task_id}")
        return self._update_task(
            task_id=task_id,
            status=str(task["status"]),
            progress=_UNSET,
            replay_url=_UNSET,
            download_path=_UNSET,
            error_code=_UNSET,
            error_message=_UNSET,
            increment_attempt=True,
        )

    def mark_failed(self, task_id: str, error_message: str, error_code: str) -> dict[str, Any]:
        """Mark a task as failed with controlled error message."""
        normalized_error = error_message.strip() if error_message else "Unknown preparation error."
        normalized_code = error_code.strip() if error_code else "UNKNOWN_ERROR"
        return self._update_task(
            task_id=task_id,
            status="failed",
            progress=_UNSET,
            replay_url=_UNSET,
            download_path=None,
            error_code=normalized_code,
            error_message=normalized_error,
        )

    def mark_cancelled(self, task_id: str) -> dict[str, Any]:
        """Mark a download task as cancelled by user request."""
        return self._update_task(
            task_id=task_id,
            status="failed",
            progress=_UNSET,
            replay_url=_UNSET,
            download_path=None,
            error_code="CANCELLED",
            error_message="Download cancelled by user.",
        )

    def retry_task(self, task_id: str) -> dict[str, Any]:
        """Reset failed/prepared task back to prepared and clear error."""
        task = self.get_task(task_id)
        if task is None:
            raise ValueError(f"Replay download task not found: {task_id}")

        current_status = str(task["status"])
        if current_status not in {"failed", "prepared"}:
            raise ValueError("Replay download task can only retry from failed/prepared status.")

        return self._update_task(
            task_id=task_id,
            status="prepared",
            progress=5,
            replay_url=_UNSET,
            download_path=None,
            error_code=None,
            error_message=None,
        )

    def clear_download_path(self, task_id: str) -> dict[str, Any]:
        """Clear download path after replay files are removed from disk."""
        task = self.get_task(task_id)
        if task is None:
            raise ValueError(f"Replay download task not found: {task_id}")

        return self._update_task(
            task_id=task_id,
            status=str(task["status"]),
            progress=_UNSET,
            replay_url=_UNSET,
            download_path=None,
            error_code=None,
            error_message=None,
        )

    def list_tasks(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None = None,
        match_id: int | None = None,
    ) -> dict[str, Any]:
        """List replay download prepare tasks with pagination."""
        conn = get_connection()
        cursor = conn.cursor()

        where_clauses: list[str] = []
        where_params: list[Any] = []

        if status is not None:
            where_clauses.append("status = ?")
            where_params.append(status)

        if match_id is not None:
            where_clauses.append("match_id = ?")
            where_params.append(match_id)

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        cursor.execute(
            "SELECT COUNT(*) AS total FROM replay_download_tasks" + where_sql,
            tuple(where_params),
        )
        total = int(cursor.fetchone()["total"])

        cursor.execute(
            f"""
            SELECT {_SELECT_COLS}
            FROM replay_download_tasks
            {where_sql}
            ORDER BY created_at DESC, task_id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(where_params + [limit, offset]),
        )
        rows = cursor.fetchall()

        tasks = [self._row_to_task(row) for row in rows]
        return {"total": total, "tasks": tasks}

    def _update_task(
        self,
        *,
        task_id: str,
        status: str,
        progress: object,
        replay_url: object,
        download_path: object,
        error_message: object,
        error_code: object,
        increment_attempt: bool = False,
    ) -> dict[str, Any]:
        now = int(time.time())
        conn = get_connection()
        cursor = conn.cursor()

        existing = self.get_task(task_id)
        if existing is None:
            raise ValueError(f"Replay download task not found: {task_id}")

        next_progress = int(existing["progress"]) if progress is _UNSET else (progress if isinstance(progress, int) else int(str(progress)))
        next_replay_url = existing["replay_url"] if replay_url is _UNSET else replay_url
        next_download_path = existing["download_path"] if download_path is _UNSET else download_path
        next_error_code = existing["error_code"] if error_code is _UNSET else error_code
        next_error_message = existing["error_message"] if error_message is _UNSET else error_message
        next_attempt_count = int(existing["attempt_count"]) + (1 if increment_attempt else 0)

        cursor.execute(
            """
            UPDATE replay_download_tasks
            SET status = ?,
                progress = ?,
                attempt_count = ?,
                replay_url = ?,
                download_path = ?,
                error_code = ?,
                error_message = ?,
                updated_at = ?
            WHERE task_id = ?
            """,
            (
                status,
                next_progress,
                next_attempt_count,
                next_replay_url,
                next_download_path,
                next_error_code,
                next_error_message,
                now,
                task_id,
            ),
        )

        conn.commit()
        cursor.execute(
            f"SELECT {_SELECT_COLS} FROM replay_download_tasks WHERE task_id = ?",
            (task_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise ValueError(f"Replay download task not found after update: {task_id}")
        return self._row_to_task(row)

    @staticmethod
    def _row_to_task(row: Any) -> dict[str, Any]:
        return {
            "task_id": str(row["task_id"]),
            "match_id": int(row["match_id"]),
            "status": str(row["status"]),
            "progress": int(row["progress"]) if row["progress"] is not None else 0,
            "attempt_count": int(row["attempt_count"]),
            "replay_url": row["replay_url"],
            "download_path": row["download_path"],
            "error_code": row["error_code"],
            "error_message": row["error_message"],
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }
