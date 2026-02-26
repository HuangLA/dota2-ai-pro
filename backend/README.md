# Backend (FastAPI)

True Sight 后端负责 `.dem` 解析、任务管理、比赛元数据查询、回放时序数据读取、OpenDota 同步和可视化数据生成。

## 运行

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

API 文档：`http://localhost:8000/docs`

## 模块结构

```text
backend/
├── main.py                       FastAPI 入口 (CORS + 路由注册 + 同步调度)
├── routers/                      API 路由层
│   ├── admin.py                  管理端 (OpenDota 同步/下载任务/比赛数据库)
│   ├── health.py                 健康检查
│   ├── library.py                本地已解析录像库 API
│   ├── matches.py                比赛元数据 (列表/详情/选手/BP)
│   ├── playback.py               回放数据 (ticks/events/wards/heroes/hud/advantage)
│   ├── remote.py                 远端比赛 (OpenDota Live 列表/同步)
│   ├── replays.py                录像管理 (上传/解析/任务)
│   └── visualization.py          可视化 (热力图/路径轨迹)
├── services/                     业务服务层
│   ├── opendota_service.py       OpenDota API 客户端 (含风控兼容 headers)
│   ├── opendota_sync_service.py  定时增量同步调度 (每 60s)
│   ├── parse_service.py          解析服务 (Java 调用 + 存储 + 索引)
│   └── replay_download_service.py 录像下载 (下载 + 解压 + 自动解析)
├── storage/                      数据存储层
│   ├── library_storage.py        本地已解析库查询
│   ├── match_database_storage.py 比赛数据库聚合查询
│   ├── match_storage.py          比赛元数据 CRUD
│   ├── opendota_match_storage.py OpenDota 比赛索引 (幂等 upsert)
│   ├── opendota_reference_storage.py 战队/联赛参考数据
│   ├── parquet_storage.py        Parquet 文件读写
│   └── replay_download_storage.py 下载任务状态管理
├── database/
│   └── sqlite_db.py              SQLite 连接与 schema 管理
├── parsers/
│   ├── clarity_parser.py         Java 解析器 Python 包装 (subprocess + JSON)
│   └── models.py                 解析数据模型 (ParseResult/KillEvent/EconomySample 等)
├── analyzers/
│   ├── heatmap_analyzer.py       热力图聚合 (movement/kill/death)
│   └── path_analyzer.py          路径简化 (Douglas-Peucker)
├── utils/                        工具函数
├── tests/                        pytest 测试 (156 项)
├── poc/                          POC 性能测试脚本
├── scripts/                      辅助脚本
└── data/                         运行时数据
    ├── matches/{match_id}/       解析产物 (parquet + meta.json)
    ├── replays/                  .dem 录像文件
    ├── poc_test/                 POC 测试输出
    └── truesight.db              SQLite 元数据库
```

## API 实现状态摘要

已实现：
- `replays`：上传/同步解析/异步任务/取消
- `matches`：列表/详情/选手/BP/删除
- `playback`：ticks/events/wards/heroes/hud/advantage
- `visualization`：热力图/路径轨迹/单英雄路径
- `admin`：OpenDota 同步/reference sync/下载任务/比赛数据库
- `remote`：远端比赛列表/联赛名补全
- `library`：本地已解析库列表/删除

Stub/部分实现：
- `GET /api/v1/playback/{match_id}/smokes`（返回空数组 + 说明）
- `POST /api/v1/visualization/aggregate/heatmap`（当前仅基于单场）
- `POST /api/v1/visualization/aggregate/ward-clusters`（占位返回）

## 时间语义（pause-aware）

- `time`：回放源时间，默认等价 `tick / 30`，单调递增
- `game_time`：游戏时钟（出兵为 `0`，出兵前可为负，暂停时冻结）
- `time_basis`：ticks/wards 响应顶层返回，标记时基策略与偏移
- `pause_intervals`：暂停区间信息，用于前端冻结 game clock 显示

## 上传与解析说明

- 后端上传端点 `POST /api/v1/replays/upload` 为单文件（`file`）
- 前端已支持多文件上传，采用队列方式逐个调用该端点
- 下载完成后自动解压 `.dem.bz2` 并异步触发解析
- 解析失败受控写入 `PARSE_FAILED` 状态

## 测试

```bash
pytest          # 运行全部测试
pytest -v       # 详细输出
pytest -k hud   # 按关键词过滤
```

当前：155/156 通过（1 项预存在的 http/https URL 不匹配）
