# API 规范文档 - True Sight

> 版本: v1.4 (implementation-aligned)  
> 最后更新: 2026-03-18  
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
| GET | `/api/v1/playback/{match_id}/hud` | DONE | 实时 HUD 指标快照（`game_time` 或 `tick` 二选一；都不传取最新） |
| GET | `/api/v1/playback/{match_id}/smokes` | DONE | 最小可用实现：支持 `start_time/end_time/team` 过滤，返回 `smokes/time_basis/pause_intervals/summary` |

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

### 1.6 Admin OpenDota (`/api/v1/admin/opendota`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| POST | `/api/v1/admin/opendota/sync/recent` | DONE | OpenDota 最近比赛同步（支持 `dry_run/persist/pro_only/limit/sync_reference/reference_team_limit/reference_league_limit`，默认 `pro_only=true`，且落库成功后自动同步 teams/leagues） |
| GET | `/api/v1/admin/opendota/matches` | DONE | OpenDota 比赛分页查询，支持 `team_id/leagueid/start_time_from/start_time_to/limit/offset` |
| GET | `/api/v1/admin/match-database` | DONE | 比赛数据库聚合查询（OpenDota matches 左连接最新下载任务 + teams/leagues 名称，支持 `professional_only/team_id/leagueid/has_download/start_time_from/start_time_to/limit/offset`，默认 `professional_only=true`） |
| POST | `/api/v1/admin/opendota/sync/reference` | DONE | OpenDota 参考维度同步（teams/leagues，支持 `dry_run/persist/team_limit/league_limit`） |
| GET | `/api/v1/admin/opendota/teams` | DONE | OpenDota 战队维表分页查询（`limit/offset`） |
| GET | `/api/v1/admin/opendota/leagues` | DONE | OpenDota 赛事维表分页查询（`limit/offset`） |
| POST | `/api/v1/admin/replays/download/prepare` | DONE | 录像下载任务准备：按 `match_id` 拉取 OpenDota `cluster/replay_salt` 并生成 replay URL（仅准备，不含大文件下载） |
| GET | `/api/v1/admin/replays/download/tasks` | DONE | 查询下载任务分页列表（支持 `status/match_id/limit/offset` 过滤） |
| GET | `/api/v1/admin/replays/download/tasks/{task_id}` | DONE | 查询单个下载任务详情（按 `task_id` 观测状态/进度/尝试次数/错误信息/下载路径） |
| POST | `/api/v1/admin/replays/download/by-match` | DONE | 一键触发 `prepare + execute`（仅当 prepare 成功且为 `prepared` 时执行下载） |
| POST | `/api/v1/admin/match-database/{match_id}/download` | DONE | 比赛数据库页动作接口：按 `mode=prepare/prepare_and_execute` 触发单场下载准备或准备并执行 |
| POST | `/api/v1/admin/replays/download/execute` | DONE | 按 `task_id` 执行最小下载（流式写入 `backend/data/replays/{match_id}.dem.bz2`），状态流转 `prepared -> downloading -> parsing -> completed/failed` |
| POST | `/api/v1/admin/replays/download/retry` | DONE | 按 `task_id` 将 `failed/prepared` 重置为 `prepared`（清空错误） |

### 1.7 Remote Replay Discovery (`/api/v1/remote`, `/api/v1/library`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/api/v1/remote/matches` | DONE | 已同步到本地镜像的远端比赛列表，支持 `include_pro/include_public/match_id/team_id/leagueid/limit/offset`；默认工作台态会优先返回职业局，显式 `match_id/team_id/leagueid` 时可按需放开 public |
| GET | `/api/v1/remote/search` | DONE | 统一远端搜索/默认列表入口，支持单一 `q`（兼容 `match_id/player_id/player_name/team_id/team_name/league_id(兼容 leagueid)/league_name` 语义）以及 `limit/offset/include_pro/include_public`，并返回胜负、`hero_ids`、玩家/阵容摘要与本地下载解析状态；空搜索默认回到职业局优先的工作台视图 |
| POST | `/api/v1/remote/sync` | DONE | 手动同步远端比赛镜像（pro/public 可选） |
| POST | `/api/v1/remote/ingest` | DONE | 按 `match_ids` 批量触发下载 + 解析入库 |
| GET | `/api/v1/remote/matches/{match_id}/status` | DONE | 查询单场下载任务、解析状态与本地文件存在性 |
| DELETE | `/api/v1/remote/matches/{match_id}/download` | DONE | 取消单场活跃下载 |
| GET | `/api/v1/library/matches` | DONE | 本地已解析录像列表，支持 `team_id/player_id/leagueid/limit/offset` |
| POST | `/api/v1/library/{match_id}/delete` | DONE | 删除单场本地录像与解析产物 |

### 1.8 Assets (`/api/v1/assets`)

| Method | Endpoint | 状态 | 说明 |
|---|---|---|---|
| GET | `/api/v1/assets/items/{item_name}.png` | DONE | 物品图标代理与本地缓存；会先归一化 parser/frontend 物品别名，再尝试多组 Steam CDN 地址并缓存在 `backend/data/cache/item_icons` |

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

### 3.3 查询 HUD 实时指标

`GET /api/v1/playback/{match_id}/hud?tick=3600`

参数说明：
- `game_time`（可选，秒）与 `tick`（可选）二选一；同时传入返回 `422`。
- 两者都不传时，后端返回最新可用采样点。

响应要点：
- 顶层固定字段：`status/match_id/game_time/tick/heroes`。
- `heroes[]` 固定包含：`hero/team/level/kills/deaths/assists/net_worth/gpm/xpm/items`。
- `net_worth/gpm/xpm` 来自 parser 输出的 per-player economy 快照；`items` 来自英雄位置采样时的 inventory 快照。
- 对于旧 schema 的历史 match 数据，响应可能额外包含 `warnings[]` / `message` 提示重新解析，以补齐真实 HUD 指标。
- `kills/deaths` 由 `kills.parquet` 在目标时间点之前累计得到；`assists` 由 `assist_players` 映射累计（缺失时回退为 `0`）。

### 3.3.1 查询 Smokes

`GET /api/v1/playback/{match_id}/smokes?start_time=-90&end_time=600&team=2`

响应要点：
- 顶层固定字段：`match_id/smokes/time_basis/pause_intervals/summary`。
- `summary.source` 表示来源（`parquet` 或 `metadata`）。
- 当缺少 smoke 数据时返回空数组，但结构保持稳定（非占位 note 文本）。

### 3.4 查询 matches

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

### 3.5 查询 OpenDota 同步比赛（管理端）

`GET /api/v1/admin/opendota/matches?team_id=15&leagueid=15475&start_time_from=1700000000&start_time_to=1700100000&limit=20&offset=0`

响应示例：

```json
{
  "status": "ok",
  "total": 1,
  "limit": 20,
  "offset": 0,
  "matches": [
    {
      "match_id": 8123456789,
      "start_time": 1700054321,
      "duration": 2450,
      "radiant_team_id": 15,
      "dire_team_id": 2163,
      "leagueid": 15475,
      "last_synced_at": 1700055000
    }
  ]
}
```

参数说明：
- `team_id`（可选）：匹配 `radiant_team_id` 或 `dire_team_id` 任一侧。
- `leagueid`（可选）：按赛事筛选。
- `start_time_from` / `start_time_to`（可选）：按比赛开始时间区间筛选（Unix 秒）。当两者同时传入且 `start_time_from > start_time_to` 时返回 `422`。

### 3.5.1 同步 OpenDota 近期比赛（管理端）

`POST /api/v1/admin/opendota/sync/recent`

请求示例：

```json
{
  "dry_run": true,
  "persist": false,
  "pro_only": true,
  "limit": 50,
  "sync_reference": true,
  "reference_team_limit": 200,
  "reference_league_limit": 200
}
```

响应示例：

```json
{
  "status": "ok",
  "fetched": 50,
  "dry_run": false,
  "message": "Fetch and persistence completed (source=pro). [reference_sync=executed;reason=persist_flow]",
  "inserted": 12,
  "updated": 8,
  "reference_teams_inserted": 5,
  "reference_teams_updated": 2,
  "reference_leagues_inserted": 3,
  "reference_leagues_updated": 1
}
```

参数说明：
- `pro_only`（可选，默认 `true`）：`true` 使用 OpenDota `/proMatches`（职业比赛）；`false` 使用 `/publicMatches`（公开路人池）。
- `sync_reference`（可选，默认 `true`）：仅当 `persist=true && dry_run=false` 时生效；开启后 recent 同步成功后自动执行 teams/leagues 参考维度同步。
- `reference_team_limit` / `reference_league_limit`（可选，默认 `200`）：自动 reference sync 使用的拉取上限，范围 `1..1000`，越界返回 `422`。
- 响应新增 `reference_teams_inserted/reference_teams_updated/reference_leagues_inserted/reference_leagues_updated` 统计字段；原有字段保持不变。
- `message` 始终包含 `reference_sync=executed|skipped` 标记，便于诊断是否执行了自动 reference sync。

### 3.6 同步 OpenDota 参考维度（管理端）

`POST /api/v1/admin/opendota/sync/reference`

请求示例：

```json
{
  "dry_run": false,
  "persist": true,
  "team_limit": 100,
  "league_limit": 100
}
```

响应示例：

```json
{
  "status": "ok",
  "dry_run": false,
  "teams_fetched": 100,
  "leagues_fetched": 100,
  "teams_inserted": 12,
  "teams_updated": 4,
  "leagues_inserted": 6,
  "leagues_updated": 1,
  "message": "Reference fetch and persistence completed."
}
```

参数说明：
- `team_limit` / `league_limit`：`1..200`；越界返回 `422`。
- `dry_run=true` 时不落库，仅返回拉取计数。

### 3.7 查询 OpenDota 战队维表（管理端）

`GET /api/v1/admin/opendota/teams?limit=20&offset=0`

响应示例：

```json
{
  "status": "ok",
  "total": 1,
  "limit": 20,
  "offset": 0,
  "teams": [
    {
      "team_id": 15,
      "name": "Team Liquid",
      "tag": "TL",
      "wins": 123,
      "losses": 77,
      "last_synced_at": 1700100000
    }
  ]
}
```

### 3.8 查询 OpenDota 赛事维表（管理端）

`GET /api/v1/admin/opendota/leagues?limit=20&offset=0`

响应示例：

```json
{
  "status": "ok",
  "total": 1,
  "limit": 20,
  "offset": 0,
  "leagues": [
    {
      "leagueid": 15475,
      "name": "DreamLeague Season 26",
      "tier": "professional",
      "last_synced_at": 1700100000
    }
  ]
}
```

### 3.9 查询比赛数据库（管理端）

`GET /api/v1/admin/match-database?professional_only=true&team_id=15&leagueid=15475&has_download=true&start_time_from=1700050000&start_time_to=1700060000&limit=20&offset=0`

响应示例：

```json
{
  "status": "ok",
  "total": 1,
  "limit": 20,
  "offset": 0,
  "matches": [
    {
      "match_id": 8123456789,
      "start_time": 1700054321,
      "duration": 2450,
      "radiant_team_id": 15,
      "dire_team_id": 2163,
      "leagueid": 15475,
      "radiant_team_name": "Team Liquid",
      "dire_team_name": "Team Falcons",
      "league_name": "DreamLeague Season 26",
      "download_status": "prepared",
      "download_task_id": "task-prepare-1",
      "download_attempt_count": 0
    }
  ]
}
```

参数说明：
- `professional_only`（可选，默认 `true`）：`true` 时仅返回 `leagueid` 非空的职业赛事比赛；`false` 时包含公开路人池等非赛事比赛。
- `team_id`（可选）：匹配 `radiant_team_id` 或 `dire_team_id` 任一侧。
- `leagueid`（可选）：按赛事筛选。
- `has_download`（可选）：`true` 仅返回存在下载任务的比赛；`false` 仅返回尚无下载任务的比赛。
- `start_time_from` / `start_time_to`（可选）：按比赛开始时间区间筛选（Unix 秒）。当两者同时传入且 `start_time_from > start_time_to` 时返回 `422`。
- `limit`：`1..200`；`offset`：`>=0`，越界返回 `422`。

### 3.10 准备 replay 下载任务（管理端）

`POST /api/v1/admin/replays/download/prepare`

请求示例：

```json
{
  "match_id": 8674716612
}
```

响应示例（准备成功）：

```json
{
  "status": "ok",
  "task": {
    "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce",
    "match_id": 8674716612,
    "status": "prepared",
    "progress": 5,
    "attempt_count": 0,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": null,
    "error_code": null,
    "error_message": null,
    "created_at": 1700100000,
    "updated_at": 1700100001
  }
}
```

响应示例（受控失败）：

```json
{
  "status": "ok",
  "task": {
    "task_id": "1e8d2a3c-4f5a-4f47-bbb4-5b5c3c77f108",
    "match_id": 8676017978,
    "status": "failed",
    "progress": 0,
    "attempt_count": 0,
    "replay_url": null,
    "download_path": null,
    "error_code": "UNKNOWN_ERROR",
    "error_message": "Missing required replay fields from OpenDota match details (cluster/replay_salt).",
    "created_at": 1700100100,
    "updated_at": 1700100101
  }
}
```

说明：
- 当前任务模型状态：`pending` / `prepared` / `downloading` / `parsing` / `completed` / `failed`。
- 底层任务记录维护整数型 `progress`：`pending=0`、`prepared=5`、`downloading=10..49`、`parsing=50`、`completed=100`；下载阶段仅在可获得 `content-length` 时按字节进度推进，失败时保留当前进度值。
- `attempt_count` 表示下载执行尝试次数；执行接口会在进入 `downloading` 时自动 +1。
- `download_path` 在成功后写入本地文件路径。
- `error_code` 为可机读错误分类；当前包含：`INVALID_STATE` / `URL_MISSING` / `DOWNLOAD_TIMEOUT` / `HTTP_ERROR` / `NETWORK_ERROR` / `FILE_WRITE_ERROR` / `UNKNOWN_ERROR`。

### 3.11 查询 replay 下载任务（管理端）

`GET /api/v1/admin/replays/download/tasks?status=failed&match_id=8676017978&limit=20&offset=0`

响应示例：

```json
{
  "status": "ok",
  "total": 1,
  "limit": 20,
  "offset": 0,
  "tasks": [
    {
      "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce",
      "match_id": 8674716612,
      "status": "prepared",
      "progress": 5,
      "attempt_count": 0,
      "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
      "download_path": null,
      "error_code": null,
      "error_message": null,
      "created_at": 1700100000,
      "updated_at": 1700100001
    }
  ]
}
```

参数说明：
- `status`（可选）：任务状态过滤，仅允许 `pending/prepared/downloading/completed/failed`，非法值返回 `422`。任务在下载完成到解析完成之间会短暂进入 `parsing`，该状态当前可在详情/无过滤列表中观察到，但不能直接作为过滤参数传入。
- `match_id`（可选）：按比赛 ID 精确过滤。

### 3.12 查询单个 replay 下载任务（管理端）

`GET /api/v1/admin/replays/download/tasks/{task_id}`

响应示例（成功）：

```json
{
  "status": "ok",
  "message": "Replay download task loaded.",
  "task": {
    "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce",
    "match_id": 8674716612,
    "status": "completed",
    "progress": 100,
    "attempt_count": 1,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": "backend/data/replays/8674716612.dem.bz2",
    "error_code": null,
    "error_message": null,
    "created_at": 1700100000,
    "updated_at": 1700100010
  }
}
```

响应示例（不存在）：

```json
{
  "status": "error",
  "message": "Replay download task not found: missing-task",
  "task": null
}
```

### 3.13 一键按 match_id prepare+execute（管理端）

`POST /api/v1/admin/replays/download/by-match`

请求示例：

```json
{
  "match_id": 8674716612
}
```

### 3.14 回放库远端搜索

`GET /api/v1/remote/search?q=90001&limit=20`

说明：
- 当传入 `q` 时，后端会将其作为统一搜索入口，尽量覆盖 `match_id / player_id / player_name / league_id / league_name / team_id / team_name`。
- `q` 可直接传比赛号、玩家 ID、联赛 ID、战队 ID、玩家名、联赛名或战队名；纯文本会联合覆盖玩家名、联赛名与战队名，纯数字会按常见 ID 规则自动判断。
- 支持中英文前缀显式指定搜索类型，例如 `比赛 8735428765`、`玩家 Ame`、`联赛 DreamLeague`、`战队 Team Liquid`、`match 8735428765`、`player 86745912`、`league 15475`、`team 15`。
- 当 `q` 为空时，后端返回默认的 enriched remote feed，而不是 `422`；默认工作台态优先显示职业局，显式 `match_id/leagueid` 时可按需放开 public。
- 命中的 `match_id` 会 best-effort 回填到本地镜像层，以便返回统一的 `download_status/local_parse_status/local_replay_path`。
- 单场 `match_id` detail 拉取失败时，接口会尽量降级为 `200 + empty/fallback`，避免整页报错。
- 上游返回非 JSON 或短暂异常时，`/search` 会以 empty/fallback 方式降级，而不是把页面打成错误态。
- 当 OpenDota 对当前 IP 返回 `429 / daily api limit exceeded` 等上游限流时，响应会额外带上 `message`，提示“本次只能返回本地已缓存结果，未缓存比赛暂时无法补抓”。

响应示例：

```json
{
  "status": "ok",
  "message": null,
  "total": 1,
  "limit": 20,
  "offset": 0,
  "matches": [
    {
      "match_id": 8123456789,
      "start_time": 1700054321,
      "duration": 2450,
      "radiant_team_id": 15,
      "dire_team_id": 2163,
      "leagueid": 15475,
      "radiant_team_name": "Team Liquid",
      "dire_team_name": "Team Falcons",
      "league_name": "DreamLeague Season 26",
      "source": "pro",
      "last_synced_at": 1700055000,
      "download_status": null,
      "local_parse_status": null,
      "local_replay_path": null
    }
  ]
}
```

响应示例（prepare 成功并完成下载）：

```json
{
  "status": "ok",
  "task": {
    "task_id": "ab28cf20-25d1-4daf-a97a-5cb06e276f25",
    "match_id": 8674716612,
    "status": "completed",
    "progress": 100,
    "attempt_count": 1,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": "backend/data/replays/8674716612.dem.bz2",
    "error_code": null,
    "error_message": null,
    "created_at": 1700101200,
    "updated_at": 1700101220
  }
}
```

响应示例（prepare 失败时直接返回 failed task）：

```json
{
  "status": "ok",
  "task": {
    "task_id": "a772ce7f-d7d8-4fe6-856e-2a1ad6e9067f",
    "match_id": 8676017978,
    "status": "failed",
    "progress": 0,
    "attempt_count": 0,
    "replay_url": null,
    "download_path": null,
    "error_code": "UNKNOWN_ERROR",
    "error_message": "Missing required replay fields from OpenDota match details (cluster/replay_salt).",
    "created_at": 1700101300,
    "updated_at": 1700101301
  }
}
```

### 3.14 执行 replay 下载任务（管理端）

`POST /api/v1/admin/replays/download/execute`

请求示例：

```json
{
  "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce"
}
```

响应示例（成功）：

```json
{
  "status": "ok",
  "message": "Replay download completed.",
  "task": {
    "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce",
    "match_id": 8674716612,
    "status": "completed",
    "progress": 100,
    "attempt_count": 1,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": "backend/data/replays/8674716612.dem.bz2",
    "error_code": null,
    "error_message": null,
    "created_at": 1700100000,
    "updated_at": 1700100010
  }
}
```

响应示例（非 prepared 受控失败）：

```json
{
  "status": "error",
  "message": "Replay download task 7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce must be in prepared status to execute.",
  "task": null
}
```

执行细节：
- 下载开始后任务先进入 `downloading`，完成归档写入后进入 `parsing`，解析成功才会返回 `completed`。
- 若上游响应包含 `content-length`，服务会在下载阶段按字节量滚动更新内部 `progress`（10..49）；无该头时仅维持阶段性进度。
- 解析失败会返回 `failed`，并写入 `error_code=PARSE_FAILED` 与受控错误消息。

### 3.15 重试 replay 下载任务（管理端）

`POST /api/v1/admin/replays/download/retry`

请求示例：

```json
{
  "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce"
}
```

响应示例：

```json
{
  "status": "ok",
  "message": "Replay download task reset to prepared.",
  "task": {
    "task_id": "7c0b7605-f5e6-4ee8-b0f3-c57d86b5b8ce",
    "match_id": 8674716612,
    "status": "prepared",
    "progress": 5,
    "attempt_count": 1,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": null,
    "error_code": null,
    "error_message": null,
    "created_at": 1700100000,
    "updated_at": 1700100020
  }
}
```

### 3.16 比赛数据库页触发下载动作（管理端）

`POST /api/v1/admin/match-database/{match_id}/download`

请求示例（默认 prepare）：

```json
{
  "mode": "prepare"
}
```

请求示例（prepare 后立即执行下载）：

```json
{
  "mode": "prepare_and_execute"
}
```

响应示例（prepare 成功）：

```json
{
  "status": "ok",
  "message": "Replay download prepare action finished.",
  "task": {
    "task_id": "task-mdb-prepare-1",
    "match_id": 8674716612,
    "status": "prepared",
    "progress": 5,
    "attempt_count": 0,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": null,
    "error_code": null,
    "error_message": null,
    "created_at": 1700100000,
    "updated_at": 1700100001
  }
}
```

响应示例（受控并发阻止）：

```json
{
  "status": "error",
  "message": "Replay download already in progress for match_id=8674716612.",
  "task": {
    "task_id": "task-mdb-running-1",
    "match_id": 8674716612,
    "status": "downloading",
    "progress": 10,
    "attempt_count": 1,
    "replay_url": "http://replay236.valve.net/570/8674716612_55500123.dem.bz2",
    "download_path": null,
    "error_code": null,
    "error_message": null,
    "created_at": 1700100050,
    "updated_at": 1700100060
  }
}
```

幂等与可用性策略：
- 当同一 `match_id` 存在 `downloading` 任务时，接口返回受控错误（`status=error`），避免重复执行。
- 当 `mode=prepare` 且同一 `match_id` 已存在最新 `prepared` 任务时，接口复用并直接返回该任务（轻量幂等，不重复新建 prepare 任务）。
- `mode` 仅允许 `prepare` 或 `prepare_and_execute`，非法值由参数校验返回 `422`。
- 该端点仅是动作入口，不改变既有 `/api/v1/admin/replays/download/*` 端点语义。

## 4. 与前端实现对齐说明

- 比赛管理页多文件上传已上线，但 API 仍保持单文件接口设计
- Match Database 页面已对接 `GET /api/v1/admin/match-database` 与 `POST /api/v1/admin/match-database/{match_id}/download`（`prepare` / `prepare_and_execute`）并支持筛选、分页、动作刷新
- Match Database 列表 `download_status` 已对齐前端状态徽章策略：`pending/prepared/downloading/parsing/completed/failed` 分别使用差异化文案与颜色；空值或未知值统一显示为 `Unknown`
- Match Database 时间可读性策略：`start_time` 与 Task Details `updated_at` 以本地时间 `YYYY-MM-DD HH:mm:ss` 显示，并通过 `title` 保留原始 Unix 秒值；`duration` 统一显示为 `mm:ss` 或 `hh:mm:ss`
- Match Database 列表对存在 `download_task_id` 的行新增 `Task Details` 面板，按需调用 `GET /api/v1/admin/replays/download/tasks/{task_id}` 展示 `task_id/status/progress/attempt_count/error_code/error_message/download_path/updated_at`
- Task Details 面板支持手动刷新；当任务状态为 `pending/prepared/downloading/parsing` 时前端每 4 秒轻量轮询，进入 `completed/failed` 后自动停止
- Match Database 列表新增 `Open Replay` 跳转：进入 Replay Viewer 时携带 `match_id/download_status/download_task_id` 上下文，并在回放页显示轻量来源提示
- 从 Replay Viewer 返回 Match Database 时，前端会在会话内恢复上一轮筛选条件与分页（包含至少一个筛选项与 `offset`）
- Match Database 操作区新增当前页批量动作：`Batch Prepare (Current Page)` 与 `Batch Prepare + Execute (Current Page)`；基于当前页可操作 `match_id` 逐条串行调用单场动作接口，执行中启用页面级并发保护（禁用行级 `Prepare/Prepare+Execute/Open Replay/Task Details`，阻止重复批量触发），完成后展示汇总（`Total/Success/Failed/withTaskId` + 最多 3 条失败摘要），并自动打开“最后一个有 `task_id` 的批量结果”任务详情且显示 `Opened from batch result.` 轻提示
- 当批量动作执行中点击 `Refresh Current Page`，前端采用统一提示策略：显示 `Batch action in progress. Current page will auto refresh when finished.`，不触发额外刷新请求
- Match Database 批量失败项支持轻量二次操作：`Copy Failed Items` 与 `Export Failed Items (.txt)`；导出/复制文本格式稳定为每行 `match_id\tmessage`，无失败项时按钮禁用
- Match Database 新增会话内筛选预设最小能力：`Preset Name` + `Save Preset` 保存当前筛选（`team_id/leagueid/start_time_from/start_time_to/has_download`），`Preset` 下拉 + `Apply` 可恢复筛选并触发列表请求
- Team Profile 已增强为赛事分组阅读模式：基于 `leagueid` 分组渲染（标题优先 `league_name`，其次 `League {leagueid}`，缺失为 `Unknown League`），每组默认展开，组头支持折叠/展开并显示当前状态、组内比赛数、平均时长（复用 Match Database 时长格式化）与“最近比赛时间”（取当前排序后的组内首条 `start_time`）
- Team Profile 新增前端交互：`Only show with download status` 开关（优先依据 `download_status/download_task_id/replay_url` 等可用字段做筛选；当当前数据缺少相关字段时保持 graceful fallback，不抛错并回退展示全部）与 `Sort: Newest First/Oldest First`（默认按 `start_time` 降序）
- Team Profile 行级动作新增复合操作 `Prepare + Open Replay`：先调用 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare`），无论 prepare 成功或失败都继续进入 replay（沿用现有 `match_id` 导航回调），并在跳转前提供轻量反馈 `prepared/prepare failed`
- Team Profile `start_time` 与 `duration` 对齐 Match Database 友好格式策略，复用同一格式化工具（本地时间 `YYYY-MM-DD HH:mm:ss` + 时长 `mm:ss/hh:mm:ss`）
- Team Profile 新增顶部 `Tournament Summary`（当前视图维度）：展示总比赛数、去重赛事数（`leagueid`）与最近比赛时间
- Team Profile 赛事分组新增 `Open In Match Database` 快速跳转：携带 `team_id + leagueid` 作为 Match Database 初始筛选上下文并复用现有页面状态恢复机制；当分组缺少 `leagueid` 时按钮禁用
- Team Profile 新增 `League Quick Filter`（来源于当前拉取结果去重后的 league 列表，支持 `All` 复位）；筛选与既有 `Sort`、`Only show with download status`、分组折叠状态兼容，筛选后仅展示命中赛事分组
- Team Profile 新增 `Focus: Latest League` 开关：开启后基于当前筛选结果自动锁定“最近比赛所属 league”并仅显示该分组（临时覆盖 `League Quick Filter`，关闭后恢复原 quick filter 选择）；与 `Sort`、`Only show with download status`、`Preset View` 兼容
- Team Profile 新增页面级动作 `Prepare Visible Matches`：仅对当前可见分组（已应用下载筛选/赛事快捷筛选且处于展开态）的比赛逐条调用 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare`）；执行中按钮禁用，空可见项时禁用；完成后显示 `Total/Success/Failed` 汇总并刷新当前 Team Profile 数据
- Team Profile 新增页面级复合动作 `Prepare + Open First Replay (Visible)`：按当前可见项与当前排序逐条执行 `mode=prepare`，完成后自动打开“可见项第一场”回放，并展示 `Total/Success/Failed + Opened Replay <match_id>` 汇总；动作执行中禁用并防重复触发；即使 prepare 全失败仍继续打开第一场回放并给出失败提示
- Team Profile 新增会话内 `Preset View`（`All Matches` / `With Download Status` / `Latest 20`）：切换时自动应用对应筛选与 limit（`Latest 20` 同时强制 `Sort: Newest First`）；当 `team_id` 为空时仅更新本地控件，不触发无效请求
- Team Profile -> Replay -> 返回 Team Profile 已支持会话内上下文回流，恢复 `team_id`、`limit`、`league quick filter`、排序方式与 `only-with-download`（与 Match Database 状态托管机制保持同风格）
- Team Profile 新增页面级动作 `Open Visible In Match Database`：基于当前可见项映射 Match Database 筛选上下文并跳转；最小映射规则为必带 `team_id`，当 `League Quick Filter` 锁定单一赛事时附带 `leagueid`，当 `Only show with download status` 为开启时附带 `has_download=true`；当可见项为空时仅提示不跳转
- Team Profile 新增页面级动作 `Export Visible Matches (.txt)`：导出当前可见比赛为文本文件（Blob 下载，无新依赖），每行格式 `match_id\tstart_time\tleagueid`；可见项为空时按钮禁用，导出成功反馈导出条数
- Team Profile 新增轻量 `League Compare` 区块：基于当前结果聚合每个 league 的 `Matches/Avg Duration/Most Recent Match`，默认按比赛数降序展示 Top 5；点击任一 league 行可作为 `League Quick Filter` 快捷入口（同时退出 `Focus: Latest League` 锁定）
- Team Profile 新增页面级动作 `Copy Visible Match IDs`：复制当前可见项 `match_id`（按当前排序、逗号分隔，如 `123,456,789`）；可见项为空时按钮禁用；复制成功反馈 `Copied <n> match ids.`，当 clipboard 不可用或写入失败时返回受控错误提示而不抛异常
- Team Profile `League Compare` 新增一键联动 `Pin Top League`：当 compare 有可用第一名 league 且存在于 `League Quick Filter` 选项中时，可一键将其应用到 quick filter；compare 为空或第一名不可用时按钮禁用
- Team Profile `Quick Preset` 已升级为会话内多快照管理（最多 5 个）：支持 `Snapshot Name` + `Save Snapshot`（同名覆盖并提示 `updated`）、`Snapshot` 下拉、`Load Snapshot`、`Delete Snapshot`，并保持快照字段为 `team_id/limit/league quick filter/sort/only-with-download/focus-latest-league`
- Team Profile 新增 `Clear All Snapshots` 一键清理：清空后重置快照下拉并禁用 `Load/Delete`，反馈已清理条数；当尝试新增第 6 个快照时返回受控提示并拒绝保存
- Team Profile 新增快照导入导出与 Compare 多选筛选：`Export Snapshots (.json)` 导出仅包含 `name + team_id/limit/league quick filter/sort/only-with-download/focus-latest-league`，`Import Snapshots (.json)` 对非法项跳过并汇总 `valid/invalid/overwritten`（同名覆盖，超出 5 条按导入顺序截断并提示）；`League Compare` 每行新增复选并支持 `Apply Selected Leagues/Clear Selection`，应用多选后会自动关闭 `Focus: Latest League` 且仅展示所选 league 分组，清除后恢复原 `League Quick Filter` 行为
- Team Profile 新增 Compare 批量动作 `Prepare Selected Leagues`：基于 `League Compare` 当前已勾选 league，并限制在“当前可见比赛”（已应用 quick filter / compare 过滤且分组处于展开态）逐条调用 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare`）；无选择或无可见命中时禁用，执行中禁用并防重复触发，完成后展示 `Total/Success/Failed` 汇总
- Team Profile 快照动作新增 `Apply Snapshot`（与 `Load Snapshot` 复用同一应用逻辑）：在选择快照后可一键应用并触发同等数据刷新与反馈；`Load Snapshot` 继续保留兼容命名
- Team Profile 新增 Compare 结果导出动作 `Export Compare Selection (.txt)`：导出范围为 `League Compare` 当前已勾选 league 与当前可见比赛（含分组展开态）交集，导出格式为每行 `match_id\tleagueid\tstart_time`；无可导出项时按钮禁用
- Team Profile 新增 Compare 一键回放清单动作 `Open Compare First 3 Replays`：基于 Compare 选择集 + 当前可见排序截取前 3 场并逐条执行 `mode=prepare`，仅第一场触发 Replay 跳转，其余仅 prepare；完成后反馈 `prepared_count/failed_count/opened_match_id`，执行中禁用并防重复触发
- Team Profile 新增会话内 `Action History` 面板（最多保留最近 10 条）：记录页面级高频动作 `Prepare Visible Matches`、`Prepare Selected Leagues`、`Open Compare First 3 Replays`、`Open Visible In Match Database`，每条展示动作名、执行时间与摘要（如 `Total/Success/Failed` 或目标上下文）；每条支持 `Replay Action`，可复用当次记录参数在当前会话内快速重放，若重放条件不满足（如无有效目标）返回受控提示而非抛错
- Team Profile `Action History` 新增 `History Filter`（`All` + 4 类已追踪动作类型），筛选仅影响当前展示列表，不改变底层会话记录；新增 `Clear Visible History` 与 `Clear All History`，分别按当前筛选结果/全部记录批量清理，并反馈清理条数，空列表或筛选无命中时按钮自动禁用
- Team Profile `Action History` 新增页面级批量动作 `Replay Visible History`：按当前 `History Filter` 可见记录的时间顺序（旧 -> 新）串行执行重放，执行中禁用并防重复触发，完成后反馈 `replayed/succeeded/failed` 汇总；当无可见记录时按钮禁用
- Team Profile `Action History` 记录结构扩展最小执行状态字段：`lastRunStatus`（`succeeded`/`failed`）、`lastRunAt`、`lastRunMessage`，用于标记最近一次重放结果
- Team Profile `Action History` 新增失败项 `Retry`：仅当记录最近执行为失败时展示 `Retry` 按钮，点击后复用同一重放逻辑并更新该记录的最近状态与时间
- Playback 新增 `GET /api/v1/playback/{match_id}/hud`：支持 `game_time`/`tick` 二选一查询单时间点 10 英雄核心指标，稳定返回 `hero/team/level/kills/deaths/assists/net_worth/gpm/xpm/items`，其中 `items/net_worth/gpm/xpm` 已接入 parser/storage 真实值
- RealMatchViewer 已新增最小 `HUD Metrics` 面板并接入上述接口，表格列至少包含 `Hero/Team/Lvl/K/D/A/NW/GPM/XPM`，`items` 以 count 方式展示
- HUD 请求与回放时间联动：播放/拖动按当前 source time 映射 `game_time` 触发 `GET /playback/{match_id}/hud?game_time=...`，前端采用 500ms 轻量节流并在新请求到来时中止旧请求以避免堆积
- HUD 面板具备可见状态反馈：`Loading`、`No HUD metrics at current time`、以及非阻断错误态（`HUD metrics request failed. Playback continues normally.`），失败不影响地图渲染与时间轴交互
- HUD 血条数据来源于 `ticks.heroes[].hp/max_hp`
- 小地图英雄图标名称兼容增强属于前端渲染层，不新增后端 API 字段

## 5. 文档更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-18 | v1.4 | 对齐实际代码实现：smokes API 已升级为 DONE（最小可用实现），热力图/路径/击杀标记 UI 已完成，Phase 4/4.5 全部完成 |
| 2026-03-16 | v1.3 | 增加 advantage/hud/smokes API 文档，完善时间契约说明 |

## 6. 未实现能力清单（明确标注）

以下能力仍在规划或待实现（Phase 5）：
- 多场聚合热力图真实聚合（aggregate heatmap）
- 眼位聚类分析（ward-clusters）
- Playback buildings/combat-log/teamfights/snapshot 系列接口
- BP 辅助、高级 analytics、WebSocket 通信
