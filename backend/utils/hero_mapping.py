"""
Hero name to ID mapping.

This module provides utilities to convert hero internal names to their IDs.
Data synchronized with frontend/src/renderer/data/heroes.ts
"""

from typing import Optional


# Hero name to ID mapping (synchronized with frontend)
# Format: hero_name (without npc_dota_hero_ prefix) -> hero_id
HERO_NAME_TO_ID: dict[str, int] = {
    'antimage': 1,
    'axe': 2,
    'bane': 3,
    'bloodseeker': 4,
    'crystal_maiden': 5,
    'drow_ranger': 6,
    'earthshaker': 7,
    'juggernaut': 8,
    'mirana': 9,
    'morphling': 10,
    'nevermore': 11,
    'phantom_lancer': 12,
    'puck': 13,
    'pudge': 14,
    'razor': 15,
    'sand_king': 16,
    'storm_spirit': 17,
    'sven': 18,
    'tiny': 19,
    'vengefulspirit': 20,
    'windrunner': 21,
    'zuus': 22,
    'kunkka': 23,
    'lina': 25,
    'lion': 26,
    'shadow_shaman': 27,
    'slardar': 28,
    'tidehunter': 29,
    'witch_doctor': 30,
    'lich': 31,
    'riki': 32,
    'enigma': 33,
    'tinker': 34,
    'sniper': 35,
    'necrolyte': 36,
    'warlock': 37,
    'beastmaster': 38,
    'queenofpain': 39,
    'venomancer': 40,
    'faceless_void': 41,
    'skeleton_king': 42,
    'death_prophet': 43,
    'phantom_assassin': 44,
    'pugna': 45,
    'templar_assassin': 46,
    'viper': 47,
    'luna': 48,
    'dragon_knight': 49,
    'dazzle': 50,
    'rattletrap': 51,
    'leshrac': 52,
    'furion': 53,
    'life_stealer': 54,
    'dark_seer': 55,
    'clinkz': 56,
    'omniknight': 57,
    'enchantress': 58,
    'huskar': 59,
    'night_stalker': 60,
    'broodmother': 61,
    'bounty_hunter': 62,
    'weaver': 63,
    'jakiro': 64,
    'batrider': 65,
    'chen': 66,
    'spectre': 67,
    'ancient_apparition': 68,
    'doom_bringer': 69,
    'ursa': 70,
    'spirit_breaker': 71,
    'gyrocopter': 72,
    'alchemist': 73,
    'invoker': 74,
    'silencer': 75,
    'obsidian_destroyer': 76,
    'lycan': 77,
    'brewmaster': 78,
    'shadow_demon': 79,
    'lone_druid': 80,
    'chaos_knight': 81,
    'meepo': 82,
    'treant': 83,
    'ogre_magi': 84,
    'undying': 85,
    'rubick': 86,
    'disruptor': 87,
    'nyx_assassin': 88,
    'naga_siren': 89,
    'keeper_of_the_light': 90,
    'wisp': 91,
    'visage': 92,
    'slark': 93,
    'medusa': 94,
    'troll_warlord': 95,
    'centaur': 96,
    'magnataur': 97,
    'shredder': 98,
    'bristleback': 99,
    'tusk': 100,
    'skywrath_mage': 101,
    'abaddon': 102,
    'elder_titan': 103,
    'legion_commander': 104,
    'techies': 105,
    'ember_spirit': 106,
    'earth_spirit': 107,
    'abyssal_underlord': 108,
    'terrorblade': 109,
    'phoenix': 110,
    'oracle': 111,
    'winter_wyvern': 112,
    'arc_warden': 113,
    'monkey_king': 114,
    'dark_willow': 119,
    'pangolier': 120,
    'grimstroke': 121,
    'hoodwink': 123,
    'void_spirit': 126,
    'snapfire': 128,
    'mars': 129,
    'ringmaster': 131,
    'dawnbreaker': 135,
    'marci': 136,
    'primal_beast': 137,
    'muerta': 138,
    'kez': 145,
    'largo': 155,
}


def get_hero_id(hero_name: str) -> int:
    """
    Get hero ID from hero name.
    
    Args:
        hero_name: Hero name in any format:
            - Full format: "npc_dota_hero_snapfire"
            - Short format: "snapfire"
    
    Returns:
        Hero ID (int), or 0 if not found
    
    Examples:
        >>> get_hero_id("npc_dota_hero_snapfire")
        128
        >>> get_hero_id("snapfire")
        128
        >>> get_hero_id("queenofpain")
        39
        >>> get_hero_id("unknown_hero")
        0
    """
    # Remove npc_dota_hero_ prefix if present
    short_name = hero_name.replace('npc_dota_hero_', '')
    
    # Normalize underscores (some heroes use both formats)
    short_name = short_name.lower().replace(' ', '_')
    
    return HERO_NAME_TO_ID.get(short_name, 0)


def get_hero_id_safe(hero_name: Optional[str]) -> int:
    """
    Safe version of get_hero_id that handles None values.
    
    Args:
        hero_name: Hero name or None
    
    Returns:
        Hero ID or 0
    """
    if not hero_name:
        return 0
    return get_hero_id(hero_name)
