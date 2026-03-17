"""Local caching proxy for Dota 2 item icons."""

from __future__ import annotations

import re
from pathlib import Path

import httpx


ITEM_ALIASES: dict[str, str] = {
    "aghanims_scepter": "ultimate_scepter",
    "aghanims_blessing": "ultimate_scepter_roshan",
    "aegis_of_the_immortal": "aegis",
    "ancient_janggo": "drum_of_endurance",
    "blink_dagger": "blink",
    "boots_of_travel": "travel_boots",
    "boots_of_travel_2": "travel_boots_2",
    "boots_of_speed": "boots",
    "dust_of_appearance": "dust",
    "dustof_appearance": "dust",
    "empty_bottle": "bottle",
    "guardian_shell": "defiant_shell",
    "greater_critical": "greater_crit",
    "lesser_critical": "lesser_crit",
    "observer_ward": "ward_observer",
    "robe_of_magi": "robe",
    "robe_of_the_magi": "robe",
    "sentry_ward": "ward_sentry",
    "ironwood_branch": "branches",
    "teleport_scroll": "tpscroll",
    "dagon_upgraded": "dagon",
    "planeswalkers_cloak": "cloak",
    "power_treads_agi": "power_treads",
    "power_treads_int": "power_treads",
    "power_treads_str": "power_treads",
    "smoke": "smoke_of_deceit",
}


def normalize_item_name(item_name: str | None) -> str:
    """Normalize parser/frontend item identifiers to Steam CDN item ids."""
    if not item_name or not isinstance(item_name, str):
        return ""

    normalized = item_name.strip()
    if not normalized:
        return ""

    normalized = (
        normalized.replace("CDOTA_Item_", "")
        .replace("cdota_item_", "")
        .replace("item_", "")
    )
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", normalized)
    normalized = re.sub(r"[.'’]", "", normalized)
    normalized = re.sub(r"[\s-]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_").lower()

    if normalized.startswith("recipe_"):
        return "recipe"

    return ITEM_ALIASES.get(normalized, normalized)


def build_item_icon_candidates(normalized_item_name: str) -> list[str]:
    if not normalized_item_name:
        return []

    return [
        f"https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{normalized_item_name}.png",
        f"https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/items/{normalized_item_name}.png",
        f"https://steamcdn-a.akamaihd.net/apps/dota2/images/dota_react/items/{normalized_item_name}.png",
    ]


class ItemAssetService:
    def __init__(self, cache_dir: Path | None = None, timeout_seconds: float = 12.0) -> None:
        backend_root = Path(__file__).resolve().parent.parent
        self.cache_dir = cache_dir or backend_root / "data" / "cache" / "item_icons"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout = httpx.Timeout(timeout_seconds, connect=5.0)
        self.headers = {
            "User-Agent": "True Sight Item Asset Proxy/0.1",
            "Accept": "image/png,image/*;q=0.8,*/*;q=0.5",
        }

    def resolve_cache_path(self, item_name: str | None) -> Path | None:
        normalized = normalize_item_name(item_name)
        if not normalized:
            return None
        return self.cache_dir / f"{normalized}.png"

    async def get_item_icon_path(self, item_name: str | None) -> Path | None:
        cache_path = self.resolve_cache_path(item_name)
        if cache_path is None:
            return None

        if cache_path.exists() and cache_path.stat().st_size > 0:
            return cache_path

        normalized = cache_path.stem
        for candidate_url in build_item_icon_candidates(normalized):
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout,
                    follow_redirects=True,
                    headers=self.headers,
                ) as client:
                    response = await client.get(candidate_url)
                    response.raise_for_status()
            except httpx.HTTPError:
                continue

            content_type = response.headers.get("content-type", "")
            if "image" not in content_type.lower():
                continue

            cache_path.write_bytes(response.content)
            return cache_path

        return None
