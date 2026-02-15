"""
True Sight Backend - FastAPI Application Entry Point

This is the main entry point for the True Sight backend service.
It provides REST API endpoints for replay parsing, analysis, and data queries.
"""

import os
import sys
from contextlib import asynccontextmanager
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
from routers import health, matches, playback, replays, visualization


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
    
    yield
    
    # Shutdown
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev server
        "app://.",                # Electron app
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(replays.router, prefix="/api/v1/replays", tags=["Replays"])
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


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("DEBUG", "true").lower() == "true"
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info" if debug else "warning",
    )
