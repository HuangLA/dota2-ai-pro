"""Tests for replay download task storage."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from database.sqlite_db import close_database, init_database
from storage.replay_download_storage import ReplayDownloadStorage


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


def test_replay_download_task_lifecycle_and_list() -> None:
    storage = ReplayDownloadStorage()

    first = storage.create_prepare_task(match_id=123)
    second = storage.create_prepare_task(match_id=456)

    prepared = storage.mark_prepared(
        task_id=first["task_id"],
        replay_url="https://replay123.valve.net/570/123_456.dem.bz2",
    )
    downloading = storage.mark_downloading(task_id=first["task_id"])
    completed = storage.mark_completed(
        task_id=first["task_id"],
        download_path="backend/data/replays/123.dem.bz2",
    )

    failed = storage.mark_failed(
        task_id=second["task_id"],
        error_message="missing replay fields",
        error_code="URL_MISSING",
    )
    retried = storage.retry_task(task_id=second["task_id"])

    listed = storage.list_tasks(limit=10, offset=0)

    assert prepared["status"] == "prepared"
    assert prepared["attempt_count"] == 0
    assert prepared["replay_url"] is not None
    assert prepared["download_path"] is None
    assert prepared["error_message"] is None

    assert downloading["status"] == "downloading"
    assert downloading["attempt_count"] == 1

    assert completed["status"] == "completed"
    assert completed["attempt_count"] == 1
    assert completed["download_path"].endswith("123.dem.bz2")

    assert failed["status"] == "failed"
    assert failed["attempt_count"] == 0
    assert failed["replay_url"] is None
    assert failed["download_path"] is None
    assert failed["error_code"] == "URL_MISSING"
    assert failed["error_message"] == "missing replay fields"

    assert retried["status"] == "prepared"
    assert retried["error_code"] is None
    assert retried["error_message"] is None

    assert listed["total"] == 2
    assert len(listed["tasks"]) == 2
    assert {row["status"] for row in listed["tasks"]} == {"completed", "prepared"}


def test_retry_rejects_non_retryable_status() -> None:
    storage = ReplayDownloadStorage()
    task = storage.create_prepare_task(match_id=789)
    storage.mark_prepared(task_id=task["task_id"], replay_url="https://replay123.valve.net/570/789_1.dem.bz2")
    storage.mark_downloading(task_id=task["task_id"])

    with pytest.raises(ValueError, match="failed/prepared"):
        storage.retry_task(task_id=task["task_id"])


def test_get_task_returns_full_observability_fields() -> None:
    storage = ReplayDownloadStorage()
    task = storage.create_prepare_task(match_id=999)
    storage.mark_prepared(task_id=task["task_id"], replay_url="https://replay123.valve.net/570/999_1.dem.bz2")

    loaded = storage.get_task(task_id=task["task_id"])

    assert loaded is not None
    assert set(loaded.keys()) == {
        "task_id",
        "match_id",
        "status",
        "attempt_count",
        "replay_url",
        "download_path",
        "error_code",
        "error_message",
        "created_at",
        "updated_at",
    }


def test_list_tasks_filters_by_status() -> None:
    storage = ReplayDownloadStorage()
    prepared_task = storage.create_prepare_task(match_id=111)
    failed_task = storage.create_prepare_task(match_id=222)

    storage.mark_prepared(
        task_id=prepared_task["task_id"],
        replay_url="https://replay236.valve.net/570/111_1.dem.bz2",
    )
    storage.mark_failed(
        task_id=failed_task["task_id"],
        error_message="timeout",
        error_code="DOWNLOAD_TIMEOUT",
    )

    listed = storage.list_tasks(limit=10, offset=0, status="failed")

    assert listed["total"] == 1
    assert len(listed["tasks"]) == 1
    assert listed["tasks"][0]["task_id"] == failed_task["task_id"]
    assert listed["tasks"][0]["status"] == "failed"


def test_list_tasks_filters_by_match_id() -> None:
    storage = ReplayDownloadStorage()
    task_a = storage.create_prepare_task(match_id=333)
    storage.create_prepare_task(match_id=444)

    listed = storage.list_tasks(limit=10, offset=0, match_id=333)

    assert listed["total"] == 1
    assert len(listed["tasks"]) == 1
    assert listed["tasks"][0]["task_id"] == task_a["task_id"]
    assert listed["tasks"][0]["match_id"] == 333
