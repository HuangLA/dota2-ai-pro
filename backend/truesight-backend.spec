# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for True Sight Backend
Bundles the FastAPI backend into a single-folder distribution.
"""

import os
import sys
from pathlib import Path
from PyInstaller.building.build_main import Analysis, PYZ, EXE, COLLECT

block_cipher = None
backend_dir = os.path.abspath('.')

a = Analysis(
    ['main.py'],
    pathex=[backend_dir],
    binaries=[],
    datas=[
        # Include .env.example as reference
    ],
    hiddenimports=[
        # FastAPI / Uvicorn
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'fastapi.middleware.cors',
        'pydantic',
        'pydantic_settings',
        'python_multipart',
        'multipart',
        'starlette',
        'starlette.routing',
        'starlette.responses',
        'starlette.middleware',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # Data processing
        'pandas',
        'numpy',
        'pyarrow',
        'pyarrow.parquet',
        'duckdb',
        'sklearn',
        'sklearn.cluster',
        'sklearn.preprocessing',
        # HTTP clients
        'httpx',
        'aiohttp',
        'dotenv',
        # App modules - routers
        'routers',
        'routers.admin',
        'routers.assets',
        'routers.health',
        'routers.library',
        'routers.matches',
        'routers.playback',
        'routers.remote',
        'routers.replays',
        'routers.visualization',
        # App modules - services
        'services',
        'services.opendota_service',
        'services.opendota_sync_service',
        'services.parse_service',
        'services.replay_download_service',
        'services.item_asset_service',
        # App modules - storage
        'storage',
        'storage.library_storage',
        'storage.match_database_storage',
        'storage.match_storage',
        'storage.opendota_match_storage',
        'storage.opendota_reference_storage',
        'storage.parquet_storage',
        'storage.replay_download_storage',
        # App modules - other
        'database',
        'database.sqlite_db',
        'parsers',
        'parsers.clarity_parser',
        'parsers.models',
        'analyzers',
        'analyzers.heatmap_analyzer',
        'analyzers.path_analyzer',
        'utils',
        'utils.hero_mapping',
        'utils.steam_cdn',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'PIL',
        'test',
        'tests',
        'pytest',
        'mypy',
        'ruff',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='truesight-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # Keep console for logging
    disable_windowed_traceback=False,
    icon='../frontend/src/assets/icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='truesight-backend',
)
