"""
True Sight Backend - FastAPI Application Entry Point

This is the main entry point for the True Sight backend service.
It provides REST API endpoints for replay parsing, analysis, and data queries.
"""

import os
import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from contextlib import suppress
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from database.sqlite_db import init_database
from routers import admin, assets, health, library, matches, playback, remote, replays, visualization
from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.opendota_sync_service import OpenDotaSyncService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.opendota_reference_storage import OpenDotaReferenceStorage

logger = logging.getLogger(__name__)


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


async def _run_remote_incremental_sync(sync_service: OpenDotaSyncService) -> None:
    """Run periodic remote mirror sync with conservative defaults and rate-limit backoff."""
    include_pro = _read_bool_env("REMOTE_SYNC_INCLUDE_PRO", True)
    include_public = _read_bool_env("REMOTE_SYNC_INCLUDE_PUBLIC", False)
    limit = max(1, min(int(os.getenv("REMOTE_SYNC_LIMIT", "50")), 200))
    sync_reference = _read_bool_env("REMOTE_SYNC_REFERENCE", True)
    interval_seconds = max(60, int(os.getenv("REMOTE_SYNC_INTERVAL_SECONDS", "600")))
    rate_limited_interval_seconds = max(
        interval_seconds,
        int(os.getenv("REMOTE_SYNC_RATE_LIMIT_INTERVAL_SECONDS", "3600")),
    )

    while True:
        sleep_seconds = interval_seconds
        try:
            await sync_service.sync_selected_sources(
                include_pro=include_pro,
                include_public=include_public,
                limit=limit,
                sync_reference=sync_reference,
            )
        except OpenDotaServiceError as exc:
            if exc.is_rate_limited:
                sleep_seconds = rate_limited_interval_seconds
            logger.exception("Remote incremental sync failed with OpenDota error")
        except Exception:
            logger.exception("Remote incremental sync failed")
        await asyncio.sleep(sleep_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager - handles startup and shutdown."""
    # Startup
    print("Starting True Sight Backend...")
    
    backend_root = Path(__file__).resolve().parent

    def resolve_path(env_key: str, default_relative: str) -> Path:
        configured = os.getenv(env_key, default_relative)
        candidate = Path(configured)
        if not candidate.is_absolute():
            candidate = backend_root / candidate
        return candidate

    # Initialize database
    db_path = resolve_path("DATABASE_PATH", "data/truesight.db")
    init_database(str(db_path))
    print(f"Database initialized: {db_path}")
    
    # Ensure data directories exist
    data_dirs = [
        resolve_path("MATCHES_DIR", "data/matches"),
        resolve_path("REPLAYS_DIR", "data/replays"),
        resolve_path("LOGS_DIR", "data/logs"),
    ]
    for dir_path in data_dirs:
        dir_path.mkdir(parents=True, exist_ok=True)
    
    sync_service = OpenDotaSyncService(
        opendota_service=OpenDotaService(),
        opendota_match_storage=OpenDotaMatchStorage(),
        opendota_reference_storage=OpenDotaReferenceStorage(),
    )
    remote_sync_task = asyncio.create_task(_run_remote_incremental_sync(sync_service))

    yield
    
    # Shutdown
    remote_sync_task.cancel()
    with suppress(asyncio.CancelledError):
        await remote_sync_task
    print("Shutting down True Sight Backend...")


# Create FastAPI application
app = FastAPI(
    title="True Sight API",
    description="Dota 2 Professional Replay Analysis Tool - Backend API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
# In packaged mode, Electron uses file:// protocol which sends null origin.
# Since this is a local-only server (bound to 127.0.0.1), allowing all origins is safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(remote.router, prefix="/api/v1/remote", tags=["Remote"])
app.include_router(library.router, prefix="/api/v1/library", tags=["Library"])
app.include_router(replays.router, prefix="/api/v1/replays", tags=["Replays"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Assets"])
app.include_router(matches.router, prefix="/api/v1/matches", tags=["Matches"])
app.include_router(playback.router, prefix="/api/v1/playback", tags=["Playback"])
app.include_router(visualization.router, prefix="/api/v1/visualization", tags=["Visualization"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint - returns API info."""
    return {
        "name": "True Sight API",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
    }


# On Windows, ensure ProactorEventLoop is used so asyncio subprocesses work.
# SelectorEventLoop (which uvicorn may default to) raises NotImplementedError
# when asyncio.create_subprocess_exec is called.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _is_frozen() -> bool:
    """Check if running as a PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("DEBUG", "true").lower() == "true"
    
    if _is_frozen():
        # PyInstaller bundle: pass app object directly (reload not supported)
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level="info",
        )
    else:
        # Development: use string reference for hot-reload support
        uvicorn.run(
            "main:app",
            host=host,
            port=port,
            reload=debug,
            log_level="info" if debug else "warning",
        )
