from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from routers import assets
from services.item_asset_service import normalize_item_name


class _FakeItemAssetService:
    def __init__(self, icon_path: Path | None) -> None:
        self.icon_path = icon_path

    async def get_item_icon_path(self, item_name: str | None) -> Path | None:
        return self.icon_path


def test_asset_route_returns_cached_item_icon(tmp_path, monkeypatch) -> None:
    icon_path = tmp_path / "blink.png"
    icon_path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
        b"\x90wS\xde\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
        b"\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    monkeypatch.setattr(assets, "item_asset_service", _FakeItemAssetService(icon_path))

    client = TestClient(app)
    response = client.get("/api/v1/assets/items/blink.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_asset_route_returns_404_when_icon_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(assets, "item_asset_service", _FakeItemAssetService(None))

    client = TestClient(app)
    response = client.get("/api/v1/assets/items/nonexistent_item.png")

    assert response.status_code == 404


def test_item_name_normalization_handles_aliases() -> None:
    assert normalize_item_name("CDOTA_Item_PowerTreadsInt") == "power_treads"
    assert normalize_item_name("Aghanims_Scepter") == "ultimate_scepter"
    assert normalize_item_name("boots_of_travel") == "travel_boots"
    assert normalize_item_name("observer_ward") == "ward_observer"
    assert normalize_item_name("robe_of_magi") == "robe"
    assert normalize_item_name("robe_of_the_magi") == "robe"
    assert normalize_item_name("guardian_shell") == "defiant_shell"
    assert normalize_item_name("sentry_ward") == "ward_sentry"
    assert normalize_item_name("ironwood_branch") == "branches"
    assert normalize_item_name("teleport_scroll") == "tpscroll"
    assert normalize_item_name("blink_dagger") == "blink"
    assert normalize_item_name("greater_critical") == "greater_crit"
