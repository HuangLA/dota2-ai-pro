"""Asset routes for frontend-consumable cached media."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services.item_asset_service import ItemAssetService

router = APIRouter()
item_asset_service = ItemAssetService()


@router.get("/items/{item_name}.png")
async def get_item_icon(item_name: str) -> FileResponse:
    icon_path = await item_asset_service.get_item_icon_path(item_name)
    if icon_path is None or not icon_path.exists():
        raise HTTPException(status_code=404, detail=f"Item icon not found for {item_name}")

    return FileResponse(
        icon_path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
