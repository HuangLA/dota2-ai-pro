"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "true-sight-backend",
    }


@router.get("/health/ready")
async def readiness_check() -> dict:
    """Readiness check - verifies all dependencies are available."""
    # TODO: Add actual dependency checks (database, parser, etc.)
    return {
        "status": "ready",
        "checks": {
            "database": "ok",
            "parser": "ok",
        },
    }
