"""Collect SN-2 performance baseline for replay pipeline and playback queries."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from database.sqlite_db import init_database
from routers import playback, remote, replays


def _pick_sample_replay(replays_dir: Path) -> Path:
    candidates = sorted(replays_dir.glob("*.dem"))
    if not candidates:
        raise FileNotFoundError(f"No .dem file found in {replays_dir}")
    return candidates[0]


def _list_sample_replays(replays_dir: Path) -> list[Path]:
    return sorted(replays_dir.glob("*.dem"))


def _pick_sample_match(matches_dir: Path) -> int:
    candidates = sorted(path.name for path in matches_dir.iterdir() if path.is_dir() and path.name.isdigit())
    if not candidates:
        raise FileNotFoundError(f"No parsed match directory found in {matches_dir}")
    return int(candidates[0])


def _timed_request(client: TestClient, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        response = client.request(method, url, **kwargs)
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": False,
            "status_code": None,
            "latency_ms": round(elapsed_ms, 2),
            "error": str(exc),
        }

    elapsed_ms = (time.perf_counter() - started) * 1000
    payload: Any
    try:
        payload = response.json()
    except Exception:  # noqa: BLE001
        payload = None

    payload_summary: dict[str, Any] | None = None
    if isinstance(payload, dict):
        payload_summary = {"keys": sorted(payload.keys())}
        if isinstance(payload.get("ticks"), list):
            payload_summary["ticks_len"] = len(payload["ticks"])
        if isinstance(payload.get("data"), list):
            payload_summary["data_len"] = len(payload["data"])
        if isinstance(payload.get("heroes"), list):
            payload_summary["heroes_len"] = len(payload["heroes"])
        if isinstance(payload.get("results"), list):
            payload_summary["results_len"] = len(payload["results"])
        if "status" in payload:
            payload_summary["status"] = payload.get("status")
        if "success" in payload:
            payload_summary["success"] = payload.get("success")
        if "error" in payload and payload.get("error") is not None:
            payload_summary["error"] = payload.get("error")

    ok = response.status_code < 400
    if isinstance(payload, dict) and isinstance(payload.get("success"), bool):
        ok = ok and bool(payload["success"])

    return {
        "ok": ok,
        "status_code": response.status_code,
        "latency_ms": round(elapsed_ms, 2),
        "payload_summary": payload_summary,
    }


def collect_baseline(include_remote: bool, remote_timeout_seconds: float) -> dict[str, Any]:
    backend_root = Path(__file__).resolve().parents[1]
    replays_dir = backend_root / "data" / "replays"
    matches_dir = backend_root / "data" / "matches"
    db_path = backend_root / "data" / "truesight.db"
    init_database(str(db_path))

    replay_candidates = _list_sample_replays(replays_dir)
    replay_path = _pick_sample_replay(replays_dir)
    match_id = _pick_sample_match(matches_dir)

    app = FastAPI(title="SN-2 Baseline Collector")
    app.include_router(replays.router, prefix="/api/v1/replays")
    app.include_router(playback.router, prefix="/api/v1/playback")
    app.include_router(remote.router, prefix="/api/v1/remote")

    results: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_inputs": {
            "replay_path": str(replay_path),
            "match_id": match_id,
            "include_remote": include_remote,
        },
        "metrics": {},
    }

    with TestClient(app) as client:
        parse_metric: dict[str, Any] | None = None
        parse_attempts: list[dict[str, Any]] = []
        for candidate in replay_candidates:
            current_metric = _timed_request(
                client,
                "POST",
                "/api/v1/replays/parse/sync",
                json={"replay_path": str(candidate)},
            )
            parse_attempts.append(
                {
                    "replay_path": str(candidate),
                    "ok": current_metric.get("ok"),
                    "latency_ms": current_metric.get("latency_ms"),
                    "status_code": current_metric.get("status_code"),
                    "error": (current_metric.get("payload_summary") or {}).get("error"),
                }
            )
            if current_metric.get("ok"):
                replay_path = candidate
                parse_metric = current_metric
                break
            if parse_metric is None:
                parse_metric = current_metric

        if parse_metric is None:
            raise RuntimeError("Unable to collect parse baseline metric")

        parse_metric["attempts"] = parse_attempts
        results["metrics"]["parse_sync"] = parse_metric
        results["sample_inputs"]["replay_path"] = str(replay_path)

        query_ticks = _timed_request(
            client,
            "GET",
            f"/api/v1/playback/{match_id}/ticks",
            params={"start_time": 0, "end_time": 600, "interval": 1},
        )
        results["metrics"]["query_ticks_10min"] = query_ticks

        query_advantage = _timed_request(
            client,
            "GET",
            f"/api/v1/playback/{match_id}/advantage",
            params={"start_time": -120, "end_time": 600},
        )
        results["metrics"]["query_advantage"] = query_advantage

        first_frame_ticks = _timed_request(
            client,
            "GET",
            f"/api/v1/playback/{match_id}/ticks",
            params={"start_time": 0, "end_time": 0, "interval": 1},
        )
        results["metrics"]["first_frame_ticks"] = first_frame_ticks

        first_frame_hud = _timed_request(
            client,
            "GET",
            f"/api/v1/playback/{match_id}/hud",
            params={"game_time": -999},
        )
        results["metrics"]["first_frame_hud"] = first_frame_hud

        if include_remote:
            remote_sync = _timed_request(
                client,
                "POST",
                "/api/v1/remote/sync",
                json={
                    "include_pro": True,
                    "include_public": False,
                    "limit": 1,
                    "sync_reference": False,
                },
                timeout=remote_timeout_seconds,
            )
            results["metrics"]["remote_sync_probe"] = remote_sync

            remote_ingest = _timed_request(
                client,
                "POST",
                "/api/v1/remote/ingest",
                json={"match_ids": [match_id]},
                timeout=remote_timeout_seconds,
            )
            results["metrics"]["remote_ingest_probe"] = remote_ingest
        else:
            results["metrics"]["remote_sync_probe"] = {
                "ok": False,
                "status_code": None,
                "latency_ms": None,
                "error": "skipped (run with --include-remote)",
            }
            results["metrics"]["remote_ingest_probe"] = {
                "ok": False,
                "status_code": None,
                "latency_ms": None,
                "error": "skipped (run with --include-remote)",
            }

    return results


def _write_report(report: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = output_dir / f"sn2_baseline_{ts}.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect SN-2 performance baseline")
    parser.add_argument("--include-remote", action="store_true", help="Include remote sync/ingest probes")
    parser.add_argument(
        "--remote-timeout-seconds",
        type=float,
        default=20.0,
        help="Timeout for remote sync/ingest probe requests",
    )
    args = parser.parse_args()

    report = collect_baseline(
        include_remote=args.include_remote,
        remote_timeout_seconds=args.remote_timeout_seconds,
    )
    output_path = _write_report(report, Path(__file__).resolve().parents[1] / "data" / "baselines")

    print(f"SN-2 baseline written: {output_path}")
    for name, metric in report["metrics"].items():
        latency = metric.get("latency_ms")
        status = metric.get("status_code")
        ok = metric.get("ok")
        print(f"- {name}: ok={ok} status={status} latency_ms={latency}")


if __name__ == "__main__":
    main()
