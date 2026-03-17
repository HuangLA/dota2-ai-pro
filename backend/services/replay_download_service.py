"""Business service for replay download workflow."""

from __future__ import annotations

import logging

import bz2
from pathlib import Path
import shutil
from typing import Any

import httpx

from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.parse_service import ParseService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.replay_download_storage import ReplayDownloadStorage


class ReplayDownloadService:
    """Coordinates replay URL preparation and download task state transitions."""

    def __init__(
        self,
        opendota_service: OpenDotaService,
        replay_download_storage: ReplayDownloadStorage,
        opendota_match_storage: OpenDotaMatchStorage | None = None,
        parse_service: Any | None = None,
        download_timeout_seconds: float = 120.0,
        replays_dir: Path | None = None,
    ) -> None:
        self.opendota_service = opendota_service
        self.replay_download_storage = replay_download_storage
        self.download_timeout = httpx.Timeout(download_timeout_seconds)
        self.replays_dir = (
            replays_dir
            if replays_dir is not None
            else Path(__file__).resolve().parent.parent / "data" / "replays"
        )
        self.parse_service = parse_service or ParseService(replays_dir=str(self.replays_dir))
        self.opendota_match_storage = opendota_match_storage or OpenDotaMatchStorage()

        self.logger = logging.getLogger(__name__)
    def _decompress_replay_archive(self, archive_path: Path, match_id: int) -> Path:
        replay_path = self.replays_dir / f"{match_id}.dem"
        with bz2.open(archive_path, "rb") as compressed:
            with replay_path.open("wb") as replay_file:
                shutil.copyfileobj(compressed, replay_file)
        return replay_path

    async def prepare_replay_download(self, match_id: int) -> dict[str, Any]:
        """Prepare a replay download task by resolving replay URL from OpenDota."""
        task = self.replay_download_storage.create_prepare_task(match_id=match_id)
        task_id = str(task["task_id"])

        try:
            details = await self.opendota_service.fetch_match_details(match_id=match_id)
            self.opendota_match_storage.upsert_match_detail(details)
            replay_url = self.opendota_service.build_replay_url(
                match_id=match_id,
                cluster=details.get("cluster"),
                replay_salt=details.get("replay_salt"),
            )
            return self.replay_download_storage.mark_prepared(task_id=task_id, replay_url=replay_url)
        except Exception as exc:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message=str(exc),
                error_code="UNKNOWN_ERROR",
            )

    def _latest_task_for_match(
        self,
        *,
        match_id: int,
        status: str,
    ) -> dict[str, Any] | None:
        listed = self.replay_download_storage.list_tasks(
            limit=1,
            offset=0,
            status=status,
            match_id=match_id,
        )
        tasks = listed.get("tasks", [])
        if not tasks:
            return None
        return tasks[0]

    async def trigger_match_download_action(self, match_id: int, mode: str) -> dict[str, Any]:
        """Trigger prepare or prepare+execute action by match_id with guardrails."""
        active_task = self._latest_task_for_match(match_id=match_id, status="downloading")
        if active_task is not None:
            return {
                "status": "error",
                "message": f"Replay download already in progress for match_id={match_id}.",
                "task": active_task,
            }

        if mode == "prepare":
            prepared_task = self._latest_task_for_match(match_id=match_id, status="prepared")
            if prepared_task is not None:
                return {
                    "status": "ok",
                    "message": "Reuse latest prepared replay download task.",
                    "task": prepared_task,
                }

            task = await self.prepare_replay_download(match_id=match_id)
            return {
                "status": "ok",
                "message": "Replay download prepare action finished.",
                "task": task,
            }

        task = await self.prepare_and_execute(match_id=match_id)
        return {
            "status": "ok",
            "message": "Replay download prepare_and_execute action finished.",
            "task": task,
        }

    async def execute_download(self, task_id: str) -> dict[str, Any]:
        """Execute replay download for a prepared task."""
        task = self.replay_download_storage.get_task(task_id)
        if task is None:
            raise OpenDotaServiceError(f"INVALID_STATE: Replay download task not found: {task_id}")

        if str(task["status"]) != "prepared":
            raise OpenDotaServiceError(
                f"INVALID_STATE: Replay download task {task_id} must be in prepared status to execute."
            )

        replay_url = task.get("replay_url")
        if not isinstance(replay_url, str) or not replay_url.strip():
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message="Replay URL is missing; run prepare or retry first.",
                error_code="URL_MISSING",
            )

        self.replay_download_storage.mark_downloading(task_id)

        match_id = int(task["match_id"])
        download_target = self.replays_dir / f"{match_id}.dem.bz2"
        download_target.parent.mkdir(parents=True, exist_ok=True)

        try:
            async with httpx.AsyncClient(
                timeout=self.download_timeout,
                follow_redirects=True,
                trust_env=False,
            ) as client:
                async with client.stream("GET", replay_url) as response:
                    response.raise_for_status()
                    response_headers = getattr(response, "headers", {})
                    content_length = (
                        response_headers.get("content-length")
                        if hasattr(response_headers, "get")
                        else None
                    )
                    total_bytes = int(content_length) if content_length else 0
                    downloaded_bytes = 0
                    last_reported_pct = 10
                    chunk_count = 0
                    cancelled = False
                    with download_target.open("wb") as output_file:
                        async for chunk in response.aiter_bytes():
                            if chunk:
                                output_file.write(chunk)
                                downloaded_bytes += len(chunk)
                                chunk_count += 1
                                if total_bytes > 0:
                                    raw_pct = int(downloaded_bytes / total_bytes * 49)
                                    pct = max(10, min(49, raw_pct))
                                    if pct >= last_reported_pct + 5:
                                        last_reported_pct = pct
                                        self.replay_download_storage.update_download_progress(task_id, pct)
                                        current = self.replay_download_storage.get_task(task_id)
                                        if current and current.get("error_code") == "CANCELLED":
                                            cancelled = True
                                            break
                                elif chunk_count % 200 == 0:
                                    current = self.replay_download_storage.get_task(task_id)
                                    if current and current.get("error_code") == "CANCELLED":
                                        cancelled = True
                                        break

            if cancelled:
                try:
                    download_target.unlink(missing_ok=True)
                except OSError:
                    pass
                current_task = self.replay_download_storage.get_task(task_id)
                return current_task if current_task is not None else {}

            # Download complete — transition to parsing phase
            self.replay_download_storage.mark_parsing(task_id)

            try:
                replay_path = self._decompress_replay_archive(download_target, match_id)
                parse_result = await self.parse_service.parse_replay_async(str(replay_path))
                if not parse_result.success:
                    parse_error = parse_result.error or "Unknown parse error."
                    self.logger.error(
                        f"Parse failed for match {match_id}: {parse_error}",
                        extra={"match_id": match_id, "task_id": task_id}
                    )
                    return self.replay_download_storage.mark_failed(
                        task_id=task_id,
                        error_message=f"Replay parse failed: {parse_error}",
                        error_code="PARSE_FAILED",
                    )
            except Exception as exc:
                error_msg = str(exc) or repr(exc) or "Unknown parsing error occurred"
                error_type = type(exc).__name__
                self.logger.exception(
                    f"Parse exception for match {match_id}: [{error_type}] {error_msg}",
                    extra={"match_id": match_id, "task_id": task_id}
                )
                return self.replay_download_storage.mark_failed(
                    task_id=task_id,
                    error_message=f"Replay parse failed: [{error_type}] {error_msg}",
                    error_code="PARSE_FAILED",
                )

            return self.replay_download_storage.mark_completed(
                task_id=task_id,
                download_path=str(download_target),
            )
        except httpx.TimeoutException:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message="Replay download timed out.",
                error_code="DOWNLOAD_TIMEOUT",
            )
        except httpx.HTTPStatusError as exc:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message=f"Replay download failed with status {exc.response.status_code}.",
                error_code="HTTP_ERROR",
            )
        except httpx.HTTPError:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message="Failed to reach replay download server.",
                error_code="NETWORK_ERROR",
            )
        except OSError as exc:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message=f"Failed to write replay file: {exc}",
                error_code="FILE_WRITE_ERROR",
            )
        except Exception as exc:
            return self.replay_download_storage.mark_failed(
                task_id=task_id,
                error_message=f"Replay download failed: {exc}",
                error_code="UNKNOWN_ERROR",
            )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Fetch one replay download task for observability."""
        return self.replay_download_storage.get_task(task_id)

    def delete_downloaded_replay(self, match_id: int) -> dict[str, Any]:
        """Delete downloaded replay artifacts for latest completed task by match_id."""
        listed = self.replay_download_storage.list_tasks(
            limit=1,
            offset=0,
            status="completed",
            match_id=match_id,
        )
        tasks = listed.get("tasks", [])
        if not tasks:
            return {
                "status": "error",
                "message": f"No completed replay download found for match_id={match_id}.",
                "task": None,
            }

        task = tasks[0]
        task_id = str(task["task_id"])
        bz2_path_raw = task.get("download_path")
        bz2_path = Path(str(bz2_path_raw)) if isinstance(bz2_path_raw, str) and bz2_path_raw.strip() else (self.replays_dir / f"{match_id}.dem.bz2")
        dem_path = self.replays_dir / f"{match_id}.dem"

        removed_any = False
        for candidate in (bz2_path, dem_path):
            if candidate.exists() and candidate.is_file():
                candidate.unlink()
                removed_any = True

        if not removed_any:
            return {
                "status": "error",
                "message": f"Replay files not found for match_id={match_id}.",
                "task": task,
            }

        updated = self.replay_download_storage.clear_download_path(task_id)
        return {
            "status": "ok",
            "message": f"Replay files deleted for match_id={match_id}.",
            "task": updated,
        }

    def cancel_match_download(self, match_id: int) -> dict[str, Any]:
        """Cancel the latest active download for a match and delete partial artifacts."""
        active = None
        for status in ("downloading", "parsing", "prepared", "pending"):
            active = self._latest_task_for_match(match_id=match_id, status=status)
            if active:
                break

        if active is None:
            return {
                "status": "error",
                "message": f"No active download found for match_id={match_id}.",
                "task": None,
            }

        task_id = str(active["task_id"])
        updated = self.replay_download_storage.mark_cancelled(task_id)

        # Best-effort cleanup — file may be locked on Windows if actively writing
        for p in (self.replays_dir / f"{match_id}.dem.bz2", self.replays_dir / f"{match_id}.dem"):
            try:
                if p.exists() and p.is_file():
                    p.unlink()
            except OSError:
                pass  # Locked file; execute_download will clean up on next chunk check

        return {
            "status": "ok",
            "message": f"Download cancelled for match_id={match_id}.",
            "task": updated,
        }

    async def prepare_and_execute(self, match_id: int) -> dict[str, Any]:
        """Prepare replay URL and execute download immediately when ready."""
        prepared_task = await self.prepare_replay_download(match_id=match_id)
        if str(prepared_task["status"]) != "prepared":
            return prepared_task

        return await self.execute_download(task_id=str(prepared_task["task_id"]))

    def retry_task(self, task_id: str) -> dict[str, Any]:
        """Reset failed/prepared task for another download attempt."""
        return self.replay_download_storage.retry_task(task_id)

    def list_prepare_tasks(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None = None,
        match_id: int | None = None,
    ) -> dict[str, Any]:
        """List replay download prepare tasks with pagination metadata."""
        return self.replay_download_storage.list_tasks(
            limit=limit,
            offset=offset,
            status=status,
            match_id=match_id,
        )
