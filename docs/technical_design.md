# 技术设计文档 (Implementation-Aligned)

> 最后更新: 2026-02-26
> 对齐基线: `PROGRESS.md`（Phase 4 冲刺完成 + Phase 4.5 重构进行中）

## 1. 当前架构总览

```text
Frontend (React 18 + Vite + PixiJS 8 + Zustand + TanStack Query)
  -> HTTP REST
Backend (FastAPI)
  -> Router -> Service -> Storage
  -> ParseService -> ClarityParser (Java 17 subprocess)
  -> Parquet (时序数据) + SQLite (元数据/任务/索引)
```

核心链路：
1. OpenDota 同步/手动入库 → `opendota_matches` 表
2. 下载录像 → `backend/data/replays/{match_id}.dem`
3. 解析录像 → `backend/data/matches/{match_id}/` (parquet + meta.json)
4. 前端拉取 matches/playback 并渲染地图、HUD、优势曲线

## 2. 后端设计

### 2.1 分层架构

```text
backend/
├── routers/                  API 路由层
│   ├── admin.py              管理端 (OpenDota 同步/下载任务/比赛数据库)
│   ├── health.py             健康检查
│   ├── library.py            本地录像库 (已解析比赛检索)
│   ├── matches.py            比赛元数据 (列表/详情/选手/BP)
│   ├── playback.py           回放数据 (ticks/events/wards/heroes/hud/advantage)
│   ├── remote.py             远端比赛 (OpenDota Live 列表/同步)
│   ├── replays.py            录像管理 (上传/解析/任务)
│   └── visualization.py      可视化 (热力图/路径轨迹)
├── services/                 业务服务层
│   ├── opendota_service.py   OpenDota API 客户端 (含 403 风控兼容)
│   ├── opendota_sync_service.py  定时增量同步调度 (60s)
│   ├── parse_service.py      解析服务 (Java 调用/存储/索引)
│   └── replay_download_service.py  录像下载 (含自动解压+解析)
├── storage/                  数据存储层
│   ├── library_storage.py    本地已解析库查询
│   ├── match_database_storage.py  比赛数据库聚合查询
│   ├── match_storage.py      比赛元数据 CRUD (SQLite)
│   ├── opendota_match_storage.py  OpenDota 比赛索引 (upsert)
│   ├── opendota_reference_storage.py  战队/联赛参考数据
│   ├── parquet_storage.py    Parquet 文件读写
│   └── replay_download_storage.py  下载任务状态管理
├── database/
│   └── sqlite_db.py          SQLite 连接与 schema 管理
├── parsers/
│   ├── clarity_parser.py     Java 解析器 Python 包装 (subprocess + JSON)
│   └── models.py             解析数据模型 (ParseResult/PositionSample/KillEvent 等)
├── analyzers/
│   ├── heatmap_analyzer.py   热力图聚合 (movement/kill/death)
│   └── path_analyzer.py      路径简化 (Douglas-Peucker)
└── tests/                    pytest 测试 (156 项)
```

### 2.2 存储设计

每场比赛目录（`backend/data/matches/{match_id}`）：
- `positions.parquet`：英雄位置和状态（`x/y/hp/max_hp/mana/level/game_time`）
- `kills.parquet`：击杀事件（`time/killer/victim/x/y/assist_players`）
- `wards.parquet`：真假眼事件（`ward_type/team/game_time/placed/destroyed`）
- `economy.parquet`：经济时间线（`game_time/radiant_gold/dire_gold/advantage` 等）
- `meta.json`：比赛元数据、时间契约信息（`time_contract_version/game_start_time/pause_intervals/players`）

SQLite：`backend/data/truesight.db`
- `matches`：比赛索引与元数据
- `player_matches`：玩家-比赛关系
- `opendota_matches`：OpenDota 远端比赛镜像
- `opendota_teams` / `opendota_leagues`：参考维度数据
- `replay_download_tasks`：下载任务状态与重试

### 2.3 时间契约（pause-aware）

后端 playback 返回：
- `time`：源时间（通常 `tick/30`）
- `game_time`：游戏时钟（支持负时间，暂停时冻结）
- `time_basis`：时钟映射元信息（offset/source/strategy/clock_zero_source）
- `pause_intervals`：暂停区间（replay_start_time/replay_end_time/game_time/duration）

实现目标：
- Timeline 拖动、播放和 HUD 显示使用同一时基
- 暂停期间 game clock 冻结，UI 显示"暂停中"
- 历史数据无 `game_time` 时可回退，并显式暴露回退状态

### 2.4 HUD 实时指标

`GET /playback/{match_id}/hud` 返回：
- 每英雄：`hero/team/level/kills/deaths/assists/net_worth/gpm/xpm/items`
- 击杀/死亡基于 kills 事件聚合，助攻基于 Java 解析器 `getAssistPlayers()` 真实数据
- 经济指标来自 economy.parquet 样本

### 2.5 优势曲线

`GET /playback/{match_id}/advantage` 返回：
- 每个采样点的 `game_time/radiant_gold/dire_gold/gold_advantage/radiant_xp/dire_xp/xp_advantage`
- 前端 Recharts 渲染金色经济线 + 虚线经验线

## 3. 前端设计

### 3.1 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Home | `/` | 入口导航 |
| OpenDota Live | `/opendota-live` | 远端比赛同步/浏览/入库 |
| Replay Library | `/replay-library` | 本地已解析录像管理 |
| Match Database | `/match-database` | 比赛数据库（筛选/分页/批量下载） |
| Team Profile | `/team-profile` | 战队归档（赛事分组/对比/快照） |
| Match List | `/matches` | 比赛列表（上传/搜索/删除） |
| Real Match Viewer | `/match/:id` | 回放查看器（地图/时间轴/HUD/曲线） |

### 3.2 核心组件

- `DotaMapRenderer`：PixiJS 8 地图渲染引擎（英雄图标/眼位/击杀标记/热力图/路径轨迹）
- `MapViewer`：React 地图包装组件
- `Timeline`：播放控制（播放/暂停/拖动/速度/快捷键/暂停区间可视化）
- `AdvantageChart`：Recharts 经济+经验优势曲线
- `ReplayUploader`：多文件拖拽上传 + 任务监控

### 3.3 状态管理

- Zustand store（`src/store/`）
- TanStack Query 管理 API 请求缓存
- 会话态跨页保留（Match Database ↔ Team Profile ↔ Replay Viewer）

### 3.4 已实现的关键交互

- 多文件上传（前端队列，后端单文件 API）
- 英雄图标智能匹配（驼峰/下划线/紧凑命名兼容）
- HUD 阵容条（头像 + 血条 + 阵亡态 + 复活倒计时）
- 暂停冻结显示（game clock 冻结 + "暂停中"标记）
- Timeline hover 预览（时间 tooltip + 暂停区间橙色标记）
- 批量操作（勾选/全选/批量下载/失败导出）

## 4. Java 解析器

```text
parsers/
├── src/main/java/SimpleDemoParser.java    Clarity 解析器
├── build/libs/clarity-parser-1.0.0-uber.jar
├── clarity/                               Clarity 库源码
├── jdk17/                                 OpenJDK 17
└── build.gradle.kts                       Gradle Kotlin DSL
```

提取数据：
- 比赛元数据（match_id/mode/winner/players/picks_bans/duration/pause_intervals）
- 英雄位置（30 tick 采样，含 hp/mana/level/game_time，pause-aware）
- 击杀事件（含 `assist_players` 来自 CombatLogEntry.getAssistPlayers()）
- 眼位事件（observer/sentry placed/destroyed）
- 经济时间线（radiant/dire 总金/总经验/净资产，30 tick 采样）

## 5. API 端点总览

已实现核心端点：
- `replays`：上传/解析/任务管理
- `matches`：比赛列表/详情/选手/BP
- `playback`：ticks/events/wards/heroes/hud/advantage
- `visualization`：热力图/路径轨迹
- `admin`：OpenDota 同步/下载任务/比赛数据库
- `remote`：远端比赛列表/同步
- `library`：本地已解析库

Stub/部分实现：
- `GET /playback/{match_id}/smokes`（返回空数组）
- `POST /visualization/aggregate/heatmap`（基于单场）
- `POST /visualization/aggregate/ward-clusters`（占位）

详细端点状态见：`docs/api_specification.md`
