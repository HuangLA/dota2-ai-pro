# Data 目录说明

本仓库存在两套 data 路径：

- `backend/data/`：当前后端运行时实际读写路径（主路径）
- `data/`：历史/实验数据目录（保留，不作为主路径）

## 当前主数据结构（`backend/data/`）

```text
backend/data/
├── matches/
│   └── {match_id}/
│       ├── positions.parquet
│       ├── kills.parquet
│       ├── wards.parquet
│       └── meta.json
├── replays/
│   └── *.dem
├── logs/
└── truesight.db
```

## 字段口径要点

- `positions.parquet`：英雄位置和状态（含 `hp/max_hp/mana/level/game_time`）
- `kills.parquet`：击杀事件（`time`, `killer`, `victim`, `x`, `y`）
- `wards.parquet`：真假眼放置/摧毁事件（含 `ward_type`, `team`, `game_time`）
- `meta.json`：比赛元数据、时间契约信息（`time_contract_version`, `game_start_time`, `pause_intervals` 等）

## 说明

- 前端多文件上传是队列逐个调用单文件上传 API，数据仍按单场比赛落盘
- 本目录与 `backend/data/` 通常在 `.gitignore` 范围内，不建议提交真实回放与产物数据
