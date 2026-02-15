# Backend (FastAPI)

True Sight 后端负责 `.dem` 解析、任务管理、比赛元数据查询、回放时序数据读取和可视化数据生成。

## 运行

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

API 文档：`http://localhost:8000/docs`

## 当前模块

```text
backend/
├── main.py
├── routers/
│   ├── health.py
│   ├── replays.py
│   ├── matches.py
│   ├── playback.py
│   └── visualization.py
├── services/
│   └── parse_service.py
├── storage/
│   ├── match_storage.py
│   └── parquet_storage.py
├── database/
│   └── sqlite_db.py
├── parsers/
│   └── clarity_parser.py
└── data/
    ├── matches/
    ├── replays/
    └── truesight.db
```

## API 实现状态摘要

- 已实现：`replays` / `matches` / `playback` / `visualization` 主流程端点
- Stub/部分实现：
  - `GET /api/v1/playback/{match_id}/smokes`（返回空数组 + 说明）
  - `POST /api/v1/visualization/aggregate/heatmap`（当前仅基于首场 match）
  - `POST /api/v1/visualization/aggregate/ward-clusters`（占位返回）

## 时间语义（pause-aware）

- `time`：回放源时间，默认等价 `tick / 30`，单调递增
- `game_time`：游戏时钟（出兵为 `0`，出兵前可为负）
- `time_basis`：ticks/wards 响应顶层返回，标记时基策略与偏移
- `pause_intervals`：暂停区间信息，用于前端冻结 game clock 显示

## 上传能力说明

- 后端上传端点 `POST /api/v1/replays/upload` 当前仍是单文件（`file`）
- 前端已支持多文件上传，采用队列方式逐个调用该端点
