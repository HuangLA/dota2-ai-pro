"""Tests for replay download execution and retry flow."""

from __future__ import annotations

import bz2
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import httpx
import pytest

from database.sqlite_db import close_database, init_database
from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.replay_download_service import ReplayDownloadService
from storage.replay_download_storage import ReplayDownloadStorage


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


class _FakeStreamResponse:
    def __init__(self, *, chunks: list[bytes] | None = None, status_code: int = 200) -> None:
        self._chunks = chunks or []
        self.status_code = status_code

    async def __aenter__(self) -> "_FakeStreamResponse":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://replay236.valve.net/570/file.dem.bz2")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)

    async def aiter_bytes(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk


class _FakeAsyncClient:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        compressed = bz2.compress(b"demo-bytes")
        self._response = _FakeStreamResponse(chunks=[compressed], status_code=200)

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    def stream(self, method: str, url: str) -> _FakeStreamResponse:
        assert method == "GET"
        assert url.endswith(".dem.bz2")
        return self._response


class _FakeParseResult:
    def __init__(self, *, success: bool, error: str | None = None) -> None:
        self.success = success
        self.error = error


class _FakeParseService:
    def __init__(self, *, should_succeed: bool = True, error: str | None = None) -> None:
        self.should_succeed = should_succeed
        self.error = error

    async def parse_replay_async(self, replay_path: str) -> _FakeParseResult:
        assert replay_path.endswith(".dem")
        return _FakeParseResult(success=self.should_succeed, error=self.error)


@pytest.mark.asyncio
async def test_execute_download_success_marks_completed_and_writes_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=8674716612)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    )

    updated = await service.execute_download(task_id=task["task_id"])

    assert updated["status"] == "completed"
    assert updated["attempt_count"] == 1
    assert updated["download_path"] is not None

    downloaded_file = Path(str(updated["download_path"]))
    assert downloaded_file.exists()
    assert bz2.decompress(downloaded_file.read_bytes()) == b"demo-bytes"
    dem_file = tmp_path / "replays" / "8674716612.dem"
    assert dem_file.exists()
    assert dem_file.read_bytes() == b"demo-bytes"


class _FakeFailureAsyncClient(_FakeAsyncClient):
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        self._response = _FakeStreamResponse(chunks=[], status_code=404)


@pytest.mark.asyncio
async def test_execute_download_failure_marks_failed_with_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _FakeFailureAsyncClient)

    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=8676017978)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8676017978_1000.dem.bz2",
    )

    updated = await service.execute_download(task_id=task["task_id"])

    assert updated["status"] == "failed"
    assert updated["attempt_count"] == 1
    assert updated["download_path"] is None
    assert updated["error_code"] == "HTTP_ERROR"
    assert "status 404" in str(updated["error_message"])


@pytest.mark.asyncio
async def test_execute_download_missing_url_sets_url_missing_error_code(tmp_path: Path) -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=9000000001)
    storage.mark_prepared(task_id=task["task_id"], replay_url="   ")

    updated = await service.execute_download(task_id=task["task_id"])

    assert updated["status"] == "failed"
    assert updated["error_code"] == "URL_MISSING"
    assert "Replay URL is missing" in str(updated["error_message"])


def test_retry_task_resets_failed_to_prepared() -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    task = storage.create_prepare_task(match_id=8123456789)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8123456789_1000.dem.bz2",
    )
    storage.mark_failed(
        task_id=task["task_id"],
        error_message="Replay download failed.",
        error_code="UNKNOWN_ERROR",
    )

    retried = service.retry_task(task_id=task["task_id"])

    assert retried["status"] == "prepared"
    assert retried["error_message"] is None


@pytest.mark.asyncio
async def test_execute_download_rejects_non_prepared_status(tmp_path: Path) -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=8000000001)

    with pytest.raises(OpenDotaServiceError, match="INVALID_STATE"):
        await service.execute_download(task_id=task["task_id"])


@pytest.mark.asyncio
async def test_prepare_and_execute_runs_execute_when_prepared(monkeypatch: pytest.MonkeyPatch) -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    prepared_task = {
        "task_id": "task-combo-1",
        "match_id": 8674716612,
        "status": "prepared",
        "attempt_count": 0,
        "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
        "download_path": None,
        "error_message": None,
        "created_at": 1700102000,
        "updated_at": 1700102001,
    }
    completed_task = dict(prepared_task)
    completed_task["status"] = "completed"
    completed_task["attempt_count"] = 1
    completed_task["download_path"] = "backend/data/replays/8674716612.dem.bz2"

    async def _fake_prepare(match_id: int) -> dict[str, object]:
        assert match_id == 8674716612
        return prepared_task

    async def _fake_execute(task_id: str) -> dict[str, object]:
        assert task_id == "task-combo-1"
        return completed_task

    monkeypatch.setattr(service, "prepare_replay_download", _fake_prepare)
    monkeypatch.setattr(service, "execute_download", _fake_execute)

    result = await service.prepare_and_execute(match_id=8674716612)

    assert result["status"] == "completed"
    assert result["attempt_count"] == 1


@pytest.mark.asyncio
async def test_prepare_and_execute_returns_prepare_failure_directly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    failed_task = {
        "task_id": "task-combo-fail",
        "match_id": 8676017978,
        "status": "failed",
        "attempt_count": 0,
        "replay_url": None,
        "download_path": None,
        "error_message": "Missing required replay fields from OpenDota match details (cluster/replay_salt).",
        "created_at": 1700102100,
        "updated_at": 1700102101,
    }

    async def _fake_prepare(match_id: int) -> dict[str, object]:
        assert match_id == 8676017978
        return failed_task

    async def _fake_execute(task_id: str) -> dict[str, object]:
        raise AssertionError("execute_download should not run when prepare failed")

    monkeypatch.setattr(service, "prepare_replay_download", _fake_prepare)
    monkeypatch.setattr(service, "execute_download", _fake_execute)

    result = await service.prepare_and_execute(match_id=8676017978)

    assert result["status"] == "failed"
    assert "Missing required replay fields" in str(result["error_message"])


@pytest.mark.asyncio
async def test_trigger_match_download_action_prepare_reuses_existing_prepared() -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    task = storage.create_prepare_task(match_id=8123456789)
    prepared = storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8123456789_1000.dem.bz2",
    )

    result = await service.trigger_match_download_action(match_id=8123456789, mode="prepare")

    assert result["status"] == "ok"
    assert "Reuse latest prepared" in str(result["message"])
    assert result["task"] == prepared


@pytest.mark.asyncio
async def test_trigger_match_download_action_blocks_when_downloading_exists() -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    task = storage.create_prepare_task(match_id=8123456790)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8123456790_1001.dem.bz2",
    )
    downloading = storage.mark_downloading(task_id=task["task_id"])

    result = await service.trigger_match_download_action(match_id=8123456790, mode="prepare")

    assert result["status"] == "error"
    assert "already in progress" in str(result["message"])
    assert result["task"] == downloading


@pytest.mark.asyncio
async def test_execute_download_parse_failure_marks_failed_with_parse_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(should_succeed=False, error="parser exploded"),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=8674716613)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="https://replay236.valve.net/570/8674716613_55500123.dem.bz2",
    )

    updated = await service.execute_download(task_id=task["task_id"])

    assert updated["status"] == "failed"
    assert updated["error_code"] == "PARSE_FAILED"
    assert "parser exploded" in str(updated["error_message"])


def test_delete_downloaded_replay_removes_dem_and_bz2(tmp_path: Path) -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
        replays_dir=tmp_path / "replays",
    )

    task = storage.create_prepare_task(match_id=8123456791)
    storage.mark_prepared(
        task_id=task["task_id"],
        replay_url="http://replay236.valve.net/570/8123456791_1002.dem.bz2",
    )
    completed = storage.mark_completed(
        task_id=task["task_id"],
        download_path=str((tmp_path / "replays" / "8123456791.dem.bz2")),
    )

    bz2_path = Path(str(completed["download_path"]))
    dem_path = tmp_path / "replays" / "8123456791.dem"
    bz2_path.parent.mkdir(parents=True, exist_ok=True)
    bz2_path.write_bytes(b"dummy")
    dem_path.write_bytes(b"dummy-dem")

    result = service.delete_downloaded_replay(match_id=8123456791)

    assert result["status"] == "ok"
    assert not bz2_path.exists()
    assert not dem_path.exists()
    assert result["task"] is not None
    assert result["task"]["download_path"] is None


def test_delete_downloaded_replay_returns_error_when_not_found() -> None:
    storage = ReplayDownloadStorage()
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=storage,
        parse_service=_FakeParseService(),
    )

    result = service.delete_downloaded_replay(match_id=9999999999)

    assert result["status"] == "error"
    assert "No completed replay download" in str(result["message"])
