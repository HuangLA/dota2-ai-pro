# API 规范文档 - True Sight

> 版本: v1.1 (implementation-aligned)
> 最后更新: 2026-02-15
> 基础 URL: `http://127.0.0.1:8000`

本文件以当前代码实现为准（`backend/routers/*.py`），并明确区分：
- `DONE`: 已实现可用
- `PARTIAL`: 可调用但仅部分实现
- `STUB`: 接口存在但返回占位结果
- `NOT_IMPLEMENTED`: 文档需求存在但当前代码未实现

## 1. 实现状态总览

### 1.1 系统与健康检查

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/` | DONE | 返回 API 基础信息 |
| GET | `/health` | DONE | 基础健康检查 |
| GET | `/health/ready` | PARTIAL | 当前为静态 ready 返回，依赖检查未完全落地 |

### 1.2 Replay 管理 (`/api/v1/replays`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| POST | `/api/v1/replays/upload` | DONE | 单文件上传 `.dem` 并创建解析任务 |
| POST | `/api/v1/replays/parse` | DONE | 基于已存在 replay 路径创建后台解析任务 |
| POST | `/api/v1/replays/parse/sync` | DONE | 同步解析（阻塞） |
| GET | `/api/v1/replays/tasks` | DONE | 查询任务列表，支持 `status/limit/offset` |
| GET | `/api/v1/replays/tasks/{task_id}` | DONE | 查询任务详情 |
| POST | `/api/v1/replays/tasks/{task_id}/cancel` | DONE | 取消 pending 任务 |

备注：
- 前端已支持多文件上传，但实现方式是前端批处理逐个调用单文件上传接口。
- 以下历史规划接口当前未实现：
  - `POST /api/v1/replays/fetch` (`NOT_IMPLEMENTED`)
  - `POST /api/v1/replays/validate` (`NOT_IMPLEMENTED`)
  - `POST /api/v1/replays/tasks/{task_id}/retry` (`NOT_IMPLEMENTED`)
  - `DELETE /api/v1/replays/batch` (`NOT_IMPLEMENTED`)

### 1.3 Match 数据 (`/api/v1/matches`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/api/v1/matches` | DONE | 分页列表 + 筛选（`status/league_id/hero_id/account_id/team_id`） |
| GET | `/api/v1/matches/{match_id}` | DONE | 单场详情（`duration` 优先读取 Parquet metadata） |
| GET | `/api/v1/matches/{match_id}/players` | DONE | 选手信息（优先 metadata，回退 SQLite） |
| GET | `/api/v1/matches/{match_id}/draft` | DONE | BP 信息（来自 metadata `picks_bans`） |
| DELETE | `/api/v1/matches/{match_id}` | DONE | 删除 SQLite + Parquet 数据 |

以下历史接口当前未实现：
- `POST /api/v1/matches/search` (`NOT_IMPLEMENTED`)
- `POST /api/v1/matches/{match_id}/tags` (`NOT_IMPLEMENTED`)

### 1.4 Playback 数据 (`/api/v1/playback`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/api/v1/playback/{match_id}/ticks` | DONE | 英雄时序点位与状态，支持 `start_time/end_time/hero/team/interval` |
| GET | `/api/v1/playback/{match_id}/events` | DONE | 当前输出击杀事件（`kill`） |
| GET | `/api/v1/playback/{match_id}/wards` | DONE | 眼位事件与摘要 |
| GET | `/api/v1/playback/{match_id}/heroes` | DONE | 对局英雄与阵营 |
| GET | `/api/v1/playback/{match_id}/smokes` | STUB | 返回空数组 + 说明 |

以下历史接口当前未实现：
- `GET /api/v1/playback/{match_id}/timeline` (`NOT_IMPLEMENTED`)
- `GET /api/v1/playback/{match_id}/buildings` (`NOT_IMPLEMENTED`)
- `GET /api/v1/playback/{match_id}/combat-log` (`NOT_IMPLEMENTED`)
- `GET /api/v1/playback/{match_id}/teamfights` (`NOT_IMPLEMENTED`)
- `GET /api/v1/playback/{match_id}/snapshot` (`NOT_IMPLEMENTED`)

### 1.5 Visualization (`/api/v1/visualization`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/api/v1/visualization/{match_id}/heatmap` | DONE | 单场热力图（movement/kill/death） |
| GET | `/api/v1/visualization/{match_id}/paths` | DONE | 多英雄路径 |
| GET | `/api/v1/visualization/{match_id}/paths/{hero_name}` | DONE | 指定英雄路径（可分段） |
| POST | `/api/v1/visualization/aggregate/heatmap` | PARTIAL | 当前仅按 `match_ids[0]` 返回并提示未聚合 |
| POST | `/api/v1/visualization/aggregate/ward-clusters` | STUB | 占位返回 |

## 2. 时间契约（重要）

为保证 Timeline、地图渲染、HUD 时钟一致，`ticks` 和 `wards` 响应包含：

- `time`: 源时间（通常 `tick / 30`）
- `game_time`: 游戏时钟（出兵 `0:00`，可为负）
- `time_basis`: 映射策略与偏移信息
- `pause_intervals`: 暂停区间（`replay_start_time/replay_end_time/game_time/duration_seconds`）

后端策略：
- 优先使用 metadata 的时基信息
- metadata 缺失时基于样本推导 offset/pause
- 兼容历史数据并返回回退策略标识

## 3. 关键请求/响应示例

### 3.1 上传 replay（单文件）

`POST /api/v1/replays/upload`

FormData:
- `file`: `.dem`

响应示例：

```json
{
  "status": "uploaded",
  "filename": "8674716612.dem",
  "replay_path": "data/replays/8674716612.dem",
  "task_id": "8f3b6f7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 3.2 查询 ticks

`GET /api/v1/playback/{match_id}/ticks?start_time=-90&end_time=120&interval=1`

响应要点：
- `ticks[].heroes[]` 包含 `hero/handle/team/x/y/hp/max_hp/mana/max_mana/level`
- 顶层包含 `time_basis` 和 `pause_intervals`

### 3.3 查询 matches

`GET /api/v1/matches?hero_id=1&account_id=123456&limit=20&offset=0`

响应示例：

```json
{
  "matches": [],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

## 4. 与前端实现对齐说明

- 比赛管理页多文件上传已上线，但 API 仍保持单文件接口设计
- HUD 血条数据来源于 `ticks.heroes[].hp/max_hp`
- 小地图英雄图标名称兼容增强属于前端渲染层，不新增后端 API 字段

## 5. 未实现能力清单（明确标注）

以下能力仍在规划或待实现：
- OpenDota/Stratz 自动下载 replay
- 多场聚合热力图真实聚合
- 眼位聚类分析
- Playback timeline/buildings/combat-log/teamfights/snapshot 系列接口
- BP 辅助、高级 analytics、WebSocket 通信
