# API 规范文档 - True Sight

> **版本**: v1.0.0  
> **最后更新**: 2026-02-04  
> **状态**: Draft  
> **基础 URL**: `http://127.0.0.1:{port}/api/v1` (默认端口: 8000)

### 🔌 连接说明

**桌面应用模式** (生产环境):
- Python FastAPI 作为 Electron 的子进程自动启动
- 端口动态分配（8000-8010 范围内寻找可用端口）
- Electron Main Process 通过 IPC 将实际 URL 传递给 Renderer

**独立开发模式** (开发环境):
- 前端: `cd frontend && npm run dev` (端口 5173)
- 后端: `cd backend && uvicorn main:app --reload --port 8000`
- 前端通过环境变量 `VITE_API_BASE_URL` 连接后端

## 📊 实现状态图例

- ✅ **已实现** - API 端点已完成开发和测试
- 🚧 **开发中** - 正在实现中
- ❌ **未开始** - 尚未开始开发

**当前进度**: 0/43 端点已完成 (RESTful: 0/41, WebSocket: 0/2)

---

## 📋 目录

1. [API 设计原则](#1-api-设计原则)
2. [通用规范](#2-通用规范)
3. [数据模型定义](#3-数据模型定义)
4. [核心 API 端点](#4-核心-api-端点)
   - [4.1 录像运维](#41-录像运维-replay-ops)
   - [4.2 比赛元数据](#42-比赛元数据-match-metadata)
   - [4.3 回放数据流](#43-回放数据流-playback-engine)
   - [4.4 可视化数据](#44-可视化数据-visualization)
   - [4.5 聚合分析](#45-聚合分析-analytics)
   - [4.6 BP 辅助](#46-bp-辅助-draft-commander)
   - [4.7 系统管理](#47-系统管理-system)
5. [WebSocket 实时通信](#5-websocket-实时通信)
6. [错误码定义](#6-错误码定义)
7. [性能指标与 SLA](#7-性能指标与-sla)
8. [版本演进路线图](#8-版本演进路线图)

---

## 1. API 设计原则

### 1.1 RESTful 规范
- **资源导向**: URL 使用名词而非动词
- **HTTP 方法语义化**: GET (查询)、POST (创建)、PUT (更新)、DELETE (删除)
- **状态码规范**: 2xx (成功)、4xx (客户端错误)、5xx (服务端错误)

### 1.2 命名约定
- **URL**: 小写字母 + 连字符 (`/api/v1/match-replays`)
- **JSON 字段**: 小写蛇形命名 (`start_time`, `hero_id`)
- **枚举值**: 大写蛇形命名 (`PARSING`, `COMPLETED`)

### 1.3 版本控制
- **URL 版本化**: `/api/v1/`, `/api/v2/`
- **向后兼容**: 新增字段不影响旧版本，废弃字段保留至少一个版本

### 1.4 性能优化策略
- **分页**: 默认返回 20 条记录，最大 100 条
- **字段过滤**: 支持 `fields` 参数选择返回字段
- **压缩**: 响应体使用 gzip 压缩
- **缓存**: 使用 `ETag` 和 `If-None-Match` 头

---

## 2. 通用规范

### 2.1 请求头

| 头字段 | 是否必需 | 说明 |
|--------|---------|------|
| `Content-Type` | 是 | 固定为 `application/json` |
| `Accept` | 否 | 默认 `application/json` |
| `X-Request-ID` | 否 | 用于请求追踪 (UUID) |

**示例**:
```http
POST /api/v1/replays/upload HTTP/1.1
Content-Type: multipart/form-data
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

### 2.2 响应格式

#### 成功响应
```json
{
  "data": { ... },
  "meta": {
    "timestamp": 1738645200,
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### 错误响应
```json
{
  "error": {
    "code": "REPLAY_PARSE_FAILED",
    "message": "录像解析失败：版本不兼容",
    "details": {
      "replay_version": "7.35d",
      "parser_version": "7.35c"
    },
    "suggestion": "请更新解析器到最新版本"
  },
  "meta": {
    "timestamp": 1738645200,
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 2.3 分页规范

#### Cursor-based 分页（推荐用于实时数据）
```json
{
  "data": [ ... ],
  "pagination": {
    "next_cursor": "eyJtYXRjaF9pZCI6IDgxMjM0NTY3ODl9",
    "has_more": true,
    "total_count": 150
  }
}
```

#### Offset-based 分页（用于历史数据）
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 2,
    "page_size": 20,
    "total_pages": 8,
    "total_count": 150
  }
}
```

### 2.4 通用查询参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `page` | int | 页码（从 1 开始） | `?page=2` |
| `page_size` | int | 每页数量（默认 20，最大 100） | `?page_size=50` |
| `cursor` | string | 游标（用于 cursor-based 分页） | `?cursor=eyJ...` |
| `sort` | string | 排序字段（前缀 `-` 表示降序） | `?sort=-start_time` |
| `fields` | string | 返回字段（逗号分隔） | `?fields=match_id,duration` |

---

## 3. 数据模型定义

### 3.1 核心实体

#### Match (比赛)
```json
{
  "match_id": 8123456789,
  "start_time": 1738645200,
  "duration": 2700,
  "game_mode": 22,
  "patch_version": "7.35d",
  "winner_team": 2,
  "radiant_score": 35,
  "dire_score": 28,
  "league_id": 16025,
  "league_name": "The International 2024",
  "replay_path": "data/replays/8123456789.dem",
  "parse_status": "COMPLETED",
  "created_at": 1738645200,
  "updated_at": 1738645300
}
```

#### Player (选手)
```json
{
  "account_id": 87278757,
  "player_name": "Ame",
  "hero_id": 1,
  "hero_name": "Anti-Mage",
  "team_id": 15,
  "team_name": "PSG.LGD",
  "player_slot": 0,
  "kills": 12,
  "deaths": 3,
  "assists": 18,
  "gpm": 685,
  "xpm": 723,
  "net_worth": 24500,
  "hero_damage": 32450,
  "tower_damage": 5600,
  "hero_healing": 0,
  "last_hits": 456,
  "denies": 18,
  "level": 25,
  "items": [1, 48, 63, 108, 112, 232]
}
```

#### Tick (时序数据单位)
```json
{
  "tick": 54000,
  "time": 1800,
  "hero_id": 1,
  "player_slot": 0,
  "x": -2450.5,
  "y": 3120.8,
  "hp": 1850,
  "max_hp": 2100,
  "mana": 420,
  "max_mana": 800,
  "gold": 1500,
  "net_worth": 12500,
  "level": 18,
  "is_alive": true,
  "xp": 22500
}
```

#### Ward (眼位)
```json
{
  "ward_id": 1001,
  "type": "observer",
  "x": -1500.0,
  "y": 2800.0,
  "placer_hero_id": 5,
  "placer_team": 2,
  "placed_at": 120,
  "expires_at": 480,
  "destroyed_at": null,
  "destroyed_by": null
}
```

#### Event (游戏事件)
```json
{
  "event_id": 5001,
  "type": "HERO_KILL",
  "time": 1234,
  "tick": 37020,
  "killer_hero_id": 3,
  "victim_hero_id": 7,
  "assist_hero_ids": [5, 9],
  "x": -1200.5,
  "y": 2400.8,
  "details": {
    "first_blood": false,
    "multikill": 2,
    "streak_end": 5
  }
}
```

#### ParseTask (解析任务)
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "match_id": 8123456789,
  "status": "PARSING",
  "progress": 45,
  "file_path": "data/replays/8123456789.dem",
  "file_size": 256000000,
  "started_at": 1738645200,
  "estimated_completion": 1738645230,
  "error": null
}
```

### 3.2 枚举类型

#### ParseStatus
```
PENDING      - 等待解析
PARSING      - 解析中
COMPLETED    - 解析完成
FAILED       - 解析失败
CANCELLED    - 已取消
```

#### EventType
```
HERO_KILL           - 英雄击杀
BUILDING_KILL       - 建筑摧毁
ROSHAN_KILL         - 肉山击杀
AEGIS_PICKED_UP     - 拾取不朽之守护
SMOKE_USED          - 使用烟雾
GLYPH_USED          - 使用真视守卫
SCAN_USED           - 使用扫描
BUYBACK             - 买活
COURIER_KILL        - 信使击杀
RUNE_PICKUP         - 拾取符文
```

#### WardType
```
observer    - 侦查守卫（假眼）
sentry      - 岗哨守卫（真眼）
```

#### TeamSide
```
2 - 天辉（Radiant）
3 - 夜魇（Dire）
```

---

## 4. 核心 API 端点

### 4.1 录像运维 (Replay Ops)

#### 4.1.1 上传录像文件 ❌

**MVP 版本**: v1.0  
**端点**: `POST /api/v1/replays/upload`  
**功能**: 上传本地 `.dem` 文件并触发异步解析任务

**请求**:
```http
POST /api/v1/replays/upload HTTP/1.1
Content-Type: multipart/form-data

file: (binary data of .dem file)
auto_parse: true
priority: normal
```

**请求参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `file` | File | 是 | `.dem` 录像文件 |
| `auto_parse` | boolean | 否 | 是否自动解析（默认 true） |
| `priority` | string | 否 | 解析优先级：`low`, `normal`, `high`（默认 normal） |

**响应** (201 Created):
```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "match_id": 8123456789,
    "file_path": "data/replays/8123456789.dem",
    "file_size": 256000000,
    "status": "PENDING",
    "estimated_time": 30
  },
  "meta": {
    "timestamp": 1738645200
  }
}
```

**错误响应**:
```json
{
  "error": {
    "code": "INVALID_FILE_FORMAT",
    "message": "不支持的文件格式",
    "details": {
      "file_extension": ".zip",
      "expected": ".dem"
    }
  }
}
```

**性能目标**: 文件上传速度 > 50 MB/s

---

#### 4.1.2 通过 Match ID 下载录像 ❌

**MVP 版本**: v1.5  
**端点**: `POST /api/v1/replays/fetch`  
**功能**: 从 OpenDota/Stratz API 下载指定比赛的录像

**请求**:
```json
{
  "match_id": 8123456789,
  "source": "opendota",
  "auto_parse": true
}
```

**请求参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `match_id` | int64 | 是 | Dota 2 比赛 ID |
| `source` | string | 否 | 下载源：`opendota`, `stratz`（默认 opendota） |
| `auto_parse` | boolean | 否 | 下载后是否自动解析（默认 true） |

**响应** (202 Accepted):
```json
{
  "data": {
    "task_id": "660f9500-f3ac-52e5-b827-557766551111",
    "match_id": 8123456789,
    "status": "DOWNLOADING",
    "download_url": "http://replay123.valve.net/...",
    "file_size": 256000000,
    "progress": 0
  }
}
```

**错误响应**:
```json
{
  "error": {
    "code": "REPLAY_NOT_AVAILABLE",
    "message": "该比赛录像不可下载",
    "details": {
      "match_id": 8123456789,
      "reason": "录像已过期（超过 7 天）"
    },
    "suggestion": "尝试从其他来源获取录像文件"
  }
}
```

---

#### 4.1.3 查询解析任务列表 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/replays/tasks`  
**功能**: 获取所有解析任务的状态

**请求**:
```http
GET /api/v1/replays/tasks?status=PARSING&page=1&page_size=20
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 过滤状态：`PENDING`, `PARSING`, `COMPLETED`, `FAILED` |
| `page` | int | 页码 |
| `page_size` | int | 每页数量 |

**响应** (200 OK):
```json
{
  "data": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "match_id": 8123456789,
      "status": "PARSING",
      "progress": 65,
      "started_at": 1738645200,
      "estimated_completion": 1738645230
    },
    {
      "task_id": "661fa611-g4bd-63f6-c938-668877662222",
      "match_id": 8123456790,
      "status": "COMPLETED",
      "progress": 100,
      "started_at": 1738645100,
      "completed_at": 1738645128
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_count": 45,
    "total_pages": 3
  }
}
```

**性能目标**: 响应时间 < 100ms

---

#### 4.1.4 查询单个任务状态 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/replays/tasks/{task_id}`  
**功能**: 获取指定解析任务的详细状态

**响应** (200 OK):
```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "match_id": 8123456789,
    "status": "PARSING",
    "progress": 75,
    "file_path": "data/replays/8123456789.dem",
    "file_size": 256000000,
    "started_at": 1738645200,
    "estimated_completion": 1738645230,
    "current_phase": "解析战斗日志",
    "phases_completed": ["基础信息", "英雄位置", "经济数据"],
    "error": null
  }
}
```

**错误响应** (404 Not Found):
```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "未找到指定的解析任务"
  }
}
```

---

#### 4.1.5 取消解析任务 ❌

**MVP 版本**: v1.0  
**端点**: `DELETE /api/v1/replays/tasks/{task_id}`  
**功能**: 取消正在进行的解析任务

**响应** (200 OK):
```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "CANCELLED",
    "cancelled_at": 1738645250
  }
}
```

---

#### 4.1.6 重试失败任务 ❌

**MVP 版本**: v1.5  
**端点**: `POST /api/v1/replays/tasks/{task_id}/retry`  
**功能**: 重新执行失败的解析任务

**响应** (200 OK):
```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PENDING",
    "retry_count": 1
  }
}
```

---

#### 4.1.7 验证录像文件 ❌

**MVP 版本**: v1.5  
**端点**: `POST /api/v1/replays/validate`  
**功能**: 预检查文件有效性（不实际解析）

**请求**:
```json
{
  "file_path": "data/replays/8123456789.dem"
}
```

**响应** (200 OK):
```json
{
  "data": {
    "is_valid": true,
    "match_id": 8123456789,
    "file_size": 256000000,
    "replay_version": "7.35d",
    "parser_compatible": true,
    "estimated_parse_time": 28
  }
}
```

**错误场景**:
```json
{
  "data": {
    "is_valid": false,
    "errors": [
      {
        "code": "VERSION_MISMATCH",
        "message": "录像版本 7.36a 不被当前解析器支持"
      }
    ]
  }
}
```

---

#### 4.1.8 批量删除录像 ❌

**MVP 版本**: v2.0  
**端点**: `DELETE /api/v1/replays/batch`  
**功能**: 批量删除多个录像及其解析数据

**请求**:
```json
{
  "match_ids": [8123456789, 8123456790, 8123456791],
  "delete_files": true
}
```

**响应** (200 OK):
```json
{
  "data": {
    "deleted_count": 3,
    "failed_count": 0,
    "freed_space_mb": 768
  }
}
```

---

### 4.2 比赛元数据 (Match Metadata)

#### 4.2.1 获取比赛列表 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/matches`  
**功能**: 浏览本地录像库（支持多维度筛选）

**请求**:
```http
GET /api/v1/matches?team_id=15&hero_id=1&patch=7.35&sort=-start_time&page=1
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `team_id` | int | 战队 ID |
| `hero_id` | int | 英雄 ID |
| `account_id` | int64 | 选手账号 ID |
| `patch` | string | 版本号（如 `7.35`） |
| `league_id` | int | 联赛 ID |
| `start_date` | int | 起始时间戳 |
| `end_date` | int | 结束时间戳 |
| `winner_team` | int | 获胜方（2=天辉, 3=夜魇） |
| `min_duration` | int | 最短时长（秒） |
| `max_duration` | int | 最长时长（秒） |
| `parse_status` | string | 解析状态 |
| `sort` | string | 排序字段 |

**响应** (200 OK):
```json
{
  "data": [
    {
      "match_id": 8123456789,
      "start_time": 1738645200,
      "duration": 2700,
      "patch_version": "7.35d",
      "winner_team": 2,
      "radiant_team": {
        "team_id": 15,
        "team_name": "PSG.LGD",
        "score": 35
      },
      "dire_team": {
        "team_id": 39,
        "team_name": "Team Spirit",
        "score": 28
      },
      "league_name": "The International 2024",
      "parse_status": "COMPLETED"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_count": 156
  }
}
```

**性能目标**: 响应时间 < 150ms（含索引查询）

---

#### 4.2.2 获取单场比赛详情 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/matches/{match_id}`  
**功能**: 获取比赛的完整元数据

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "start_time": 1738645200,
    "duration": 2700,
    "game_mode": 22,
    "game_mode_name": "All Pick",
    "patch_version": "7.35d",
    "winner_team": 2,
    "first_blood_time": 142,
    "radiant": {
      "team_id": 15,
      "team_name": "PSG.LGD",
      "score": 35,
      "tower_kills": 9,
      "barrack_kills": 4,
      "total_gold": 85600,
      "total_xp": 125400
    },
    "dire": {
      "team_id": 39,
      "team_name": "Team Spirit",
      "score": 28,
      "tower_kills": 5,
      "barrack_kills": 0,
      "total_gold": 72300,
      "total_xp": 98700
    },
    "league": {
      "league_id": 16025,
      "league_name": "The International 2024",
      "tier": "premium"
    },
    "replay_available": true,
    "parse_completed_at": 1738645300
  }
}
```

---

#### 4.2.3 获取选手表现详情 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/matches/{match_id}/players`  
**功能**: 获取该场比赛所有选手的详细数据

**响应** (200 OK):
```json
{
  "data": {
    "radiant": [
      {
        "account_id": 87278757,
        "player_name": "Ame",
        "hero_id": 1,
        "hero_name": "Anti-Mage",
        "player_slot": 0,
        "kills": 12,
        "deaths": 3,
        "assists": 18,
        "gpm": 685,
        "xpm": 723,
        "net_worth": 24500,
        "hero_damage": 32450,
        "tower_damage": 5600,
        "last_hits": 456,
        "denies": 18,
        "level": 25,
        "items": [1, 48, 63, 108, 112, 232],
        "backpack": [42],
        "neutral_item": 305
      }
    ],
    "dire": [ ... ]
  }
}
```

---

#### 4.2.4 删除比赛数据 ❌

**MVP 版本**: v1.0  
**端点**: `DELETE /api/v1/matches/{match_id}`  
**功能**: 从本地库彻底删除录像及解析数据

**请求参数**:
```http
DELETE /api/v1/matches/8123456789?delete_files=true
```

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "deleted_files": [
      "data/replays/8123456789.dem",
      "data/matches/8123456789/ticks.parquet",
      "data/matches/8123456789/wards.parquet"
    ],
    "freed_space_mb": 268
  }
}
```

---

#### 4.2.5 高级检索 ❌

**MVP 版本**: v1.5  
**端点**: `POST /api/v1/matches/search`  
**功能**: 支持复杂条件的全文检索

**请求**:
```json
{
  "query": "PSG.LGD vs Spirit",
  "filters": {
    "patch": "7.35",
    "min_duration": 1800,
    "heroes": [1, 5, 9]
  },
  "date_range": {
    "start": 1738000000,
    "end": 1738645200
  },
  "sort": [
    {"field": "start_time", "order": "desc"}
  ],
  "page": 1,
  "page_size": 20
}
```

**响应** (200 OK):
```json
{
  "data": [ ... ],
  "pagination": { ... },
  "facets": {
    "patches": {"7.35d": 45, "7.35c": 32},
    "leagues": {"TI 2024": 18, "DPC WEU": 12}
  }
}
```

---

#### 4.2.6 管理自定义标签 ❌

**MVP 版本**: v2.0  
**端点**: `POST /api/v1/matches/{match_id}/tags`  
**功能**: 为比赛添加自定义标签（如"精彩团战"、"经典翻盘"）

**请求**:
```json
{
  "tags": ["经典翻盘", "一级团精彩"],
  "notes": "28分钟圣坛团战逆转"
}
```

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "tags": ["经典翻盘", "一级团精彩"],
    "notes": "28分钟圣坛团战逆转",
    "updated_at": 1738645400
  }
}
```

---

### 4.3 回放数据流 (Playback Engine)

#### 4.3.0 时间语义约定（pause-aware，2026-02-14 起执行）

为避免 Timeline 与游戏时钟错位，回放时序接口统一遵循以下约定：

- `time`: 解析源时间轴（当前实现通常为 `tick / 30`，始终单调递增，不因暂停冻结）
- `game_time`: 游戏时钟（出兵时刻为 `0`，出兵前为负数，暂停期间保持不变）
- `time_basis`: 响应顶层时间映射元信息，用于前端无歧义对齐时间轴
- `pause_intervals`: 暂停区间映射（replay 时间域），用于前端在暂停区间显示“暂停中”并冻结 game clock

`GET /api/v1/playback/{match_id}/ticks` 与 `GET /api/v1/playback/{match_id}/wards` 顶层返回同构 `time_basis`，并在顶层冗余返回 `pause_intervals`（便于兼容旧前端解析路径）：

```json
{
  "time_basis": {
    "basis": "game_time",
    "contract_version": "v1",
    "ticks_per_second": 30,
    "game_start_time": 218.73334,
    "offset_seconds": 218.73334,
    "clock_zero_source": "combatlog",
    "pause_intervals": [
      {
        "replay_start_time": 1662.0,
        "replay_end_time": 1680.0,
        "game_time": 1443.2666,
        "duration_seconds": 18.0
      }
    ],
    "mapping": "game_time = source_time - offset_seconds; source_time 通常为 tick/30，pause_intervals 表示 source_time 增长但 game_time 冻结区间"
  },
  "pause_intervals": [
    {
      "replay_start_time": 1662.0,
      "replay_end_time": 1680.0,
      "game_time": 1443.2666,
      "duration_seconds": 18.0
    }
  ]
}
```

说明：
- 后端返回的 `game_time` 为解析器原始游戏时钟，不做额外平移。
- `pause_intervals` 允许前端在 replay 时间持续前进时冻结 game clock 展示。
- 无暂停数据时 `pause_intervals` 返回空数组，保持与既有行为兼容。

#### 4.3.1 获取时序坐标数据 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/playback/{match_id}/ticks`  
**功能**: 获取指定时间段内所有单位的坐标序列（用于 PixiJS 渲染）

**请求**:
```http
GET /api/v1/playback/8123456789/ticks?start_time=0&end_time=300&interval=1&layers=heroes,buildings
```

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `start_time` | int | 是 | 起始时间（游戏秒） |
| `end_time` | int | 是 | 结束时间（游戏秒） |
| `interval` | int | 否 | 采样间隔（秒，默认 1） |
| `layers` | string | 否 | 数据层：`heroes`, `creeps`, `buildings`, `wards` |
| `hero_ids` | string | 否 | 仅返回指定英雄（逗号分隔） |

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "time_range": {
      "start": 0,
      "end": 300
    },
    "interval": 1,
    "ticks": [
      {
        "time": 0,
        "heroes": [
          {
            "hero_id": 1,
            "player_slot": 0,
            "x": -6800,
            "y": -6200,
            "hp": 560,
            "max_hp": 560,
            "mana": 75,
            "max_mana": 75,
            "level": 1,
            "is_alive": true
          }
        ],
        "buildings": [
          {
            "building_id": 1001,
            "type": "tower",
            "team": 2,
            "x": -6200,
            "y": -5800,
            "hp": 1800,
            "is_alive": true
          }
        ]
      }
    ],
    "total_ticks": 300
  }
}
```

**性能目标**: 
- 5 分钟数据（300 ticks）< 200ms
- 支持数据压缩（gzip）减少传输体积 60%

---

#### 4.3.2 获取经济/经验曲线 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/playback/{match_id}/timeline`  
**功能**: 获取全场经济、经验、击杀差数据（用于仪表盘图表）

**请求**:
```http
GET /api/v1/playback/8123456789/timeline?interval=60
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `interval` | int | 采样间隔（秒，默认 60） |

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "duration": 2700,
    "interval": 60,
    "timeline": [
      {
        "time": 0,
        "radiant_gold": 2500,
        "dire_gold": 2500,
        "gold_diff": 0,
        "radiant_xp": 0,
        "dire_xp": 0,
        "xp_diff": 0,
        "radiant_kills": 0,
        "dire_kills": 0
      },
      {
        "time": 60,
        "radiant_gold": 3800,
        "dire_gold": 3600,
        "gold_diff": 200,
        "radiant_xp": 1850,
        "dire_xp": 1720,
        "xp_diff": 130,
        "radiant_kills": 0,
        "dire_kills": 0
      }
    ]
  }
}
```

**性能目标**: 响应时间 < 100ms

---

#### 4.3.3 获取关键事件列表 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/playback/{match_id}/events`  
**功能**: 获取所有关键事件（用于时间轴锚点标记）

**请求**:
```http
GET /api/v1/playback/8123456789/events?types=HERO_KILL,ROSHAN_KILL,BUILDING_KILL
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `types` | string | 事件类型过滤（逗号分隔） |
| `start_time` | int | 起始时间 |
| `end_time` | int | 结束时间 |
| `team` | int | 仅显示某队相关事件 |

**响应** (200 OK):
```json
{
  "data": {
    "events": [
      {
        "event_id": 1,
        "type": "HERO_KILL",
        "time": 142,
        "killer_hero_id": 5,
        "victim_hero_id": 9,
        "assist_hero_ids": [1],
        "x": -2100,
        "y": 1800,
        "details": {
          "first_blood": true,
          "gold_bounty": 200
        }
      },
      {
        "event_id": 5,
        "type": "ROSHAN_KILL",
        "time": 1280,
        "killer_team": 2,
        "x": -2350,
        "y": 2100,
        "details": {
          "aegis_picked_by": 1,
          "cheese_dropped": true
        }
      }
    ],
    "total_count": 87
  }
}
```

---

#### 4.3.4 获取眼位数据 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/playback/{match_id}/wards`  
**功能**: 获取全场眼位的放置和消失记录

**请求**:
```http
GET /api/v1/playback/8123456789/wards?type=observer&team=2
```

**响应** (200 OK):
```json
{
  "data": {
    "wards": [
      {
        "ward_id": 1001,
        "type": "observer",
        "x": -1500.0,
        "y": 2800.0,
        "placer_hero_id": 5,
        "placer_team": 2,
        "placed_at": 120,
        "expires_at": 480,
        "destroyed_at": 320,
        "destroyed_by": 9,
        "lifetime": 200,
        "enemies_spotted": 8
      }
    ],
    "statistics": {
      "total_observer_wards": 24,
      "total_sentry_wards": 18,
      "avg_lifetime": 285,
      "deward_efficiency": 0.42
    }
  }
}
```

---

#### 4.3.5 获取建筑状态序列 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/playback/{match_id}/buildings`  
**功能**: 获取全场建筑的血量变化和摧毁时间

**响应** (200 OK):
```json
{
  "data": {
    "buildings": [
      {
        "building_id": 1001,
        "type": "tower",
        "tier": 1,
        "lane": "top",
        "team": 2,
        "x": -6200,
        "y": -5800,
        "destroyed_at": 780,
        "destroyed_by_hero": 3,
        "damage_sources": [
          {"hero_id": 3, "damage": 1200},
          {"hero_id": 7, "damage": 600}
        ]
      }
    ]
  }
}
```

---

#### 4.3.6 获取战斗日志 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/playback/{match_id}/combat-log`  
**功能**: 获取详细战斗日志（技能释放、伤害来源）

**请求**:
```http
GET /api/v1/playback/8123456789/combat-log?start_time=1200&end_time=1260&hero_id=1
```

**响应** (200 OK):
```json
{
  "data": {
    "logs": [
      {
        "time": 1205,
        "type": "DAMAGE",
        "source_hero": 1,
        "target_hero": 7,
        "inflictor": "manta",
        "damage": 245,
        "damage_type": "physical"
      },
      {
        "time": 1207,
        "type": "ABILITY_USE",
        "hero": 1,
        "ability": "antimage_blink",
        "target_x": -1800,
        "target_y": 2200
      }
    ],
    "summary": {
      "total_damage_dealt": 3250,
      "total_damage_received": 1820,
      "abilities_used": 12,
      "items_used": 5
    }
  }
}
```

**性能目标**: 1 分钟战斗日志 < 300ms

---

#### 4.3.7 获取开雾事件 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/playback/{match_id}/smokes`  
**功能**: 获取所有开雾事件及其效果分析

**响应** (200 OK):
```json
{
  "data": {
    "smokes": [
      {
        "smoke_id": 1,
        "team": 2,
        "start_time": 720,
        "end_time": 840,
        "duration": 120,
        "participants": [1, 3, 5, 7, 9],
        "start_x": -2800,
        "start_y": -3200,
        "break_reason": "ENEMY_TOWER",
        "break_x": -1200,
        "break_y": 1800,
        "kills_during": 2,
        "deaths_during": 0,
        "objectives_taken": ["tower_t1_mid"],
        "success_rating": 0.85
      }
    ],
    "statistics": {
      "total_smokes": 12,
      "avg_duration": 105,
      "success_rate": 0.67,
      "kills_per_smoke": 1.8
    }
  }
}
```

---

#### 4.3.8 获取团战片段 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/playback/{match_id}/teamfights`  
**功能**: 自动检测的团战片段列表

**响应** (200 OK):
```json
{
  "data": {
    "teamfights": [
      {
        "teamfight_id": 1,
        "start_time": 1420,
        "end_time": 1465,
        "duration": 45,
        "location_x": -1500,
        "location_y": 2200,
        "location_name": "Roshan Pit",
        "participants": {
          "radiant": [1, 3, 5, 7, 9],
          "dire": [2, 4, 6, 8, 10]
        },
        "outcome": {
          "winner": 2,
          "radiant_kills": 4,
          "dire_kills": 1,
          "radiant_deaths": 1,
          "dire_deaths": 4,
          "gold_swing": 3200,
          "objectives": ["aegis", "cheese"]
        },
        "importance_score": 9.2
      }
    ]
  }
}
```

---

#### 4.3.9 获取特定时刻快照 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/playback/{match_id}/snapshot`  
**功能**: 获取游戏某一时刻的完整状态快照

**请求**:
```http
GET /api/v1/playback/8123456789/snapshot?time=1800
```

**响应** (200 OK):
```json
{
  "data": {
    "time": 1800,
    "heroes": [ ... ],
    "buildings": [ ... ],
    "wards": [ ... ],
    "gold_diff": 3500,
    "xp_diff": 4200,
    "kills": {"radiant": 12, "dire": 8}
  }
}
```

**性能目标**: 响应时间 < 50ms

---

### 4.4 可视化数据 (Visualization)

#### 4.4.1 生成单场热力图 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/visualization/{match_id}/heatmap`  
**功能**: 生成单场比赛的热力图网格数据

**请求**:
```http
GET /api/v1/visualization/8123456789/heatmap?hero_id=1&type=movement&start_time=600&end_time=1200&grid_size=128
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `hero_id` | int | 英雄 ID（可选，不指定则为全队） |
| `type` | string | 热力图类型：`movement`, `death`, `kill` |
| `start_time` | int | 起始时间 |
| `end_time` | int | 结束时间 |
| `grid_size` | int | 网格大小（像素，默认 128） |

**响应** (200 OK):
```json
{
  "data": {
    "match_id": 8123456789,
    "hero_id": 1,
    "type": "movement",
    "time_range": {"start": 600, "end": 1200},
    "grid_size": 128,
    "map_bounds": {
      "min_x": -8000,
      "max_x": 8000,
      "min_y": -8000,
      "max_y": 8000
    },
    "grid_data": [
      {"x": -2400, "y": 3200, "density": 125},
      {"x": -2272, "y": 3200, "density": 98},
      {"x": -2400, "y": 3072, "density": 87}
    ],
    "max_density": 125
  }
}
```

**性能目标**: 生成时间 < 500ms

---

#### 4.4.2 生成眼位热力图 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/visualization/{match_id}/ward-heatmap`  
**功能**: 可视化眼位分布密度

**请求**:
```http
GET /api/v1/visualization/8123456789/ward-heatmap?team=2&type=observer
```

**响应** (200 OK):
```json
{
  "data": {
    "ward_type": "observer",
    "team": 2,
    "grid_data": [
      {"x": -1500, "y": 2800, "count": 3, "avg_lifetime": 285},
      {"x": 1200, "y": -2400, "count": 2, "avg_lifetime": 320}
    ]
  }
}
```

---

#### 4.4.3 生成路径追踪 ❌

**MVP 版本**: v1.5  
**端点**: `GET /api/v1/visualization/{match_id}/path-trace`  
**功能**: 生成英雄的移动路径轨迹（用于绘制路径线）

**请求**:
```http
GET /api/v1/visualization/8123456789/path-trace?hero_id=1&start_time=0&end_time=300
```

**响应** (200 OK):
```json
{
  "data": {
    "hero_id": 1,
    "path": [
      {"time": 0, "x": -6800, "y": -6200},
      {"time": 5, "x": -6750, "y": -6180},
      {"time": 10, "x": -6700, "y": -6150}
    ],
    "total_distance": 12500,
    "avg_speed": 320
  }
}
```

---

#### 4.4.4 生成技能使用热图 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/visualization/{match_id}/ability-heatmap`  
**功能**: 可视化特定技能的释放位置分布

**请求**:
```http
GET /api/v1/visualization/8123456789/ability-heatmap?hero_id=1&ability=antimage_blink
```

**响应** (200 OK):
```json
{
  "data": {
    "hero_id": 1,
    "ability": "antimage_blink",
    "usage_count": 87,
    "positions": [
      {"x": -2100, "y": 1800, "count": 5},
      {"x": 1200, "y": -900, "count": 3}
    ]
  }
}
```

---

### 4.5 聚合分析 (Analytics)

#### 4.5.1 聚合热力图 ❌

**MVP 版本**: v2.0  
**端点**: `POST /api/v1/analytics/heatmap`  
**功能**: 聚合多场比赛生成热力图（战队习惯分析）

**请求**:
```json
{
  "filters": {
    "team_id": 15,
    "hero_id": 1,
    "time_range": "20-30",
    "advantage": "leading",
    "patch": "7.35"
  },
  "limit": 50
}
```

**请求参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `filters.team_id` | int | 战队 ID |
| `filters.hero_id` | int | 英雄 ID |
| `filters.time_range` | string | 时间段（如 "0-10", "20-30"） |
| `filters.advantage` | string | 局势筛选：`leading`, `trailing`, `even` |
| `filters.patch` | string | 版本号 |
| `limit` | int | 最多分析场次（默认 50） |

**响应** (200 OK):
```json
{
  "data": {
    "matches_analyzed": 48,
    "grid_data": [
      {"x": -2400, "y": 3200, "density": 1250, "frequency": 0.85},
      {"x": -2272, "y": 3200, "density": 980, "frequency": 0.72}
    ],
    "insights": {
      "most_frequented_area": "敌方上路野区",
      "avg_farm_efficiency": 0.78
    }
  }
}
```

**性能目标**: 50 场聚合 < 1 秒

---

#### 4.5.2 眼位聚类分析 ❌

**MVP 版本**: v2.0  
**端点**: `POST /api/v1/analytics/ward-clusters`  
**功能**: 识别战队的高频插眼区域（使用 DBSCAN 聚类）

**请求**:
```json
{
  "team_id": 15,
  "side": "radiant",
  "ward_type": "observer",
  "time_range": "0-10",
  "min_matches": 10
}
```

**响应** (200 OK):
```json
{
  "data": {
    "clusters": [
      {
        "cluster_id": 1,
        "center_x": -1500,
        "center_y": 2800,
        "radius": 200,
        "ward_count": 28,
        "frequency": 0.58,
        "avg_lifetime": 285,
        "label": "敌方上路三角区"
      },
      {
        "cluster_id": 2,
        "center_x": 1200,
        "center_y": -2400,
        "radius": 150,
        "ward_count": 22,
        "frequency": 0.46,
        "label": "己方下路野区入口"
      }
    ],
    "total_wards_analyzed": 156,
    "matches_count": 48
  }
}
```

---

#### 4.5.3 对线期路径分析 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/analytics/laning`  
**功能**: 分析一级团及对线期的移动模式

**请求**:
```http
GET /api/v1/analytics/laning?team_id=15&time_range=-60,300&limit=30
```

**响应** (200 OK):
```json
{
  "data": {
    "pre_game_patterns": {
      "avg_first_blood_time": 95,
      "invasion_frequency": 0.42,
      "common_paths": [
        {
          "path_id": 1,
          "frequency": 0.65,
          "description": "5人集结中路河道，等待符文",
          "waypoints": [
            {"time": -60, "x": -2800, "y": -3200},
            {"time": -10, "x": -1200, "y": 200}
          ]
        }
      ]
    },
    "laning_stats": {
      "avg_support_pull_time": 53,
      "avg_mid_rune_control": 0.72,
      "offlane_aggression_score": 6.8
    }
  }
}
```

---

#### 4.5.4 选手行为指纹 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/analytics/player/{account_id}`  
**功能**: 生成选手的综合能力分析和习惯报告

**响应** (200 OK):
```json
{
  "data": {
    "account_id": 87278757,
    "player_name": "Ame",
    "matches_analyzed": 86,
    "hero_pool": [
      {"hero_id": 1, "games": 18, "winrate": 0.72, "avg_gpm": 685},
      {"hero_id": 8, "games": 15, "winrate": 0.67, "avg_gpm": 650}
    ],
    "performance_radar": {
      "farming_efficiency": 9.2,
      "aggression": 6.8,
      "map_awareness": 8.5,
      "teamfight_participation": 7.9,
      "objective_focus": 8.8,
      "survival_instinct": 7.5
    },
    "habits": {
      "avg_first_item_timing": {
        "battle_fury": 13.5,
        "manta_style": 20.2
      },
      "preferred_farming_area": "敌方三角区（领先时）",
      "buyback_frequency": 0.18
    }
  }
}
```

---

#### 4.5.5 性能对标 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/analytics/benchmark`  
**功能**: 将选手数据与职业平均水平对比

**请求**:
```http
GET /api/v1/analytics/benchmark?account_id=87278757&hero_id=1&metric=gpm
```

**响应** (200 OK):
```json
{
  "data": {
    "player": {
      "account_id": 87278757,
      "avg_gpm": 685,
      "percentile": 92
    },
    "benchmark": {
      "tier1_avg": 670,
      "tier2_avg": 620,
      "global_avg": 550
    },
    "comparison": "超越 92% 的职业选手"
  }
}
```

---

#### 4.5.6 失误检测 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/analytics/{match_id}/misplays`  
**功能**: AI 诊断比赛中的失误（控制重叠、买活死等）

**响应** (200 OK):
```json
{
  "data": {
    "misplays": [
      {
        "type": "STUN_OVERLAP",
        "time": 1450,
        "severity": "medium",
        "heroes_involved": [5, 9],
        "description": "Lion 的眩晕在 Earthshaker 眩晕结束前 0.8 秒释放",
        "wasted_control_duration": 0.8,
        "suggestion": "等待队友控制结束后再释放"
      },
      {
        "type": "BUYBACK_DEATH",
        "time": 2100,
        "hero_id": 1,
        "severity": "high",
        "description": "买活后 12 秒再次阵亡",
        "gold_loss": 1850,
        "suggestion": "买活后应立即撤退或等待队友"
      }
    ],
    "total_misplays": 12,
    "severity_breakdown": {
      "high": 3,
      "medium": 5,
      "low": 4
    }
  }
}
```

---

#### 4.5.7 开雾效率分析 ❌

**MVP 版本**: v2.0  
**端点**: `POST /api/v1/analytics/smoke-efficiency`  
**功能**: 聚合分析战队的开雾习惯和成功率

**请求**:
```json
{
  "team_id": 15,
  "limit": 50
}
```

**响应** (200 OK):
```json
{
  "data": {
    "total_smokes": 156,
    "avg_smokes_per_game": 3.2,
    "success_rate": 0.68,
    "avg_kills_per_smoke": 1.9,
    "common_timings": [720, 1200, 1680],
    "preferred_routes": [
      {
        "route_id": 1,
        "frequency": 0.42,
        "description": "从己方上路野区进入敌方三角区",
        "success_rate": 0.75
      }
    ]
  }
}
```

---

### 4.6 BP 辅助 (Draft Commander)

#### 4.6.1 获取版本元数据 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/draft/meta`  
**功能**: 获取当前版本的 Tier List（基于 Stratz API 同步）

**请求**:
```http
GET /api/v1/draft/meta?patch=7.35&league_tier=premium
```

**响应** (200 OK):
```json
{
  "data": {
    "patch": "7.35d",
    "last_updated": 1738645200,
    "tier_list": {
      "T0": [
        {"hero_id": 102, "name": "Abaddon", "pick_rate": 0.45, "win_rate": 0.56, "ban_rate": 0.68}
      ],
      "T1": [ ... ],
      "T2": [ ... ]
    },
    "trending_heroes": [
      {"hero_id": 5, "name": "Crystal Maiden", "pick_rate_change": 0.15}
    ]
  }
}
```

---

#### 4.6.2 战队 BP 习惯 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/draft/signatures`  
**功能**: 识别战队的绝活英雄及优先级

**请求**:
```http
GET /api/v1/draft/signatures?team_id=15&patch=7.35&limit=30
```

**响应** (200 OK):
```json
{
  "data": {
    "team_id": 15,
    "team_name": "PSG.LGD",
    "signature_heroes": [
      {
        "hero_id": 1,
        "hero_name": "Anti-Mage",
        "pick_frequency": 0.42,
        "win_rate": 0.71,
        "avg_pick_phase": 2,
        "player_association": "Ame"
      }
    ],
    "must_ban": [
      {"hero_id": 5, "ban_rate_against": 0.85}
    ],
    "flex_picks": [
      {"hero_id": 9, "positions": [2, 3], "frequency": 0.35}
    ]
  }
}
```

---

#### 4.6.3 BP 模拟助手 ❌

**MVP 版本**: v2.0  
**端点**: `POST /api/v1/draft/simulate`  
**功能**: 基于历史数据预测对手的下一步 Pick/Ban

**请求**:
```json
{
  "team_id": 15,
  "current_picks": [1, 5, 9],
  "current_bans": [3, 7],
  "phase": "pick_2"
}
```

**响应** (200 OK):
```json
{
  "data": {
    "predictions": [
      {"hero_id": 12, "probability": 0.68, "reasoning": "高胜率核心，未被 Ban"},
      {"hero_id": 18, "probability": 0.42, "reasoning": "Combo with 已选英雄 5"}
    ],
    "recommended_bans": [
      {"hero_id": 20, "priority": "high", "reasoning": "克制己方核心英雄"}
    ]
  }
}
```

---

#### 4.6.4 英雄位置概率 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/draft/flex-pick`  
**功能**: 分析某英雄在对手体系中的位置分布

**请求**:
```http
GET /api/v1/draft/flex-pick?hero_id=9&team_id=15
```

**响应** (200 OK):
```json
{
  "data": {
    "hero_id": 9,
    "hero_name": "Mirana",
    "position_distribution": {
      "1": 0.05,
      "2": 0.25,
      "3": 0.15,
      "4": 0.45,
      "5": 0.10
    },
    "most_likely_position": 4
  }
}
```

---

#### 4.6.5 英雄组合分析 ❌

**MVP 版本**: v2.0  
**端点**: `GET /api/v1/draft/combos`  
**功能**: 识别高胜率英雄组合

**请求**:
```http
GET /api/v1/draft/combos?heroes=1,5&min_games=10
```

**响应** (200 OK):
```json
{
  "data": {
    "combos": [
      {
        "heroes": [1, 5, 9],
        "games": 18,
        "win_rate": 0.78,
        "synergy_score": 8.5,
        "key_strength": "强大的推进能力"
      }
    ]
  }
}
```

---

### 4.7 系统管理 (System)

#### 4.7.1 健康检查 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/health`  
**功能**: 系统健康状态检查

**响应** (200 OK):
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "parser": "ok",
    "storage": "ok"
  },
  "metrics": {
    "total_matches": 156,
    "storage_used_gb": 42.5,
    "uptime_seconds": 3600
  }
}
```

---

#### 4.7.2 系统配置 ❌

**MVP 版本**: v1.0  
**端点**: `GET /api/v1/config`  
**功能**: 获取系统配置信息

**响应** (200 OK):
```json
{
  "data": {
    "parser_version": "3.1.3",
    "supported_game_versions": ["7.35d", "7.35c", "7.35b"],
    "max_concurrent_parses": 2,
    "storage_path": "N:/dota2-ai-pro/data",
    "auto_update_enabled": true
  }
}
```

---

## 5. WebSocket 实时通信

### 5.1 解析进度推送 ❌

**端点**: `ws://localhost:8000/ws/parsing/{task_id}`  
**功能**: 实时推送解析进度

**连接示例**:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/parsing/550e8400-e29b-41d4-a716-446655440000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`进度: ${data.progress}%`);
};
```

**推送消息格式**:
```json
{
  "type": "PROGRESS_UPDATE",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "progress": 75,
  "current_phase": "解析战斗日志",
  "estimated_completion": 1738645230
}
```

**完成消息**:
```json
{
  "type": "PARSE_COMPLETED",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "match_id": 8123456789,
  "duration": 28
}
```

**错误消息**:
```json
{
  "type": "PARSE_FAILED",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "录像版本不兼容"
  }
}
```

---

### 5.2 地图回放数据流（可选） ❌

**端点**: `ws://localhost:8000/ws/playback/{match_id}`  
**功能**: 优化大数据量传输，减少 HTTP 轮询

**用途**: 用于 PixiJS 地图渲染时的实时数据流

---

## 6. 错误码定义

### 6.1 通用错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `INVALID_REQUEST` | 400 | 请求参数无效 |
| `UNAUTHORIZED` | 401 | 未授权 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 6.2 业务错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `INVALID_FILE_FORMAT` | 400 | 不支持的文件格式 |
| `FILE_TOO_LARGE` | 413 | 文件过大（超过 500MB） |
| `REPLAY_PARSE_FAILED` | 500 | 录像解析失败 |
| `VERSION_MISMATCH` | 400 | 录像版本与解析器不兼容 |
| `REPLAY_NOT_AVAILABLE` | 404 | 录像文件不可用 |
| `TASK_NOT_FOUND` | 404 | 解析任务不存在 |
| `MATCH_NOT_FOUND` | 404 | 比赛数据不存在 |
| `INSUFFICIENT_DATA` | 400 | 数据量不足（如聚合分析需要最少 10 场） |
| `ANALYSIS_TIMEOUT` | 504 | 分析超时 |
| `STORAGE_FULL` | 507 | 存储空间不足 |

### 6.3 错误响应示例

```json
{
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "录像版本 7.36a 不被当前解析器支持",
    "details": {
      "replay_version": "7.36a",
      "parser_version": "7.35d",
      "supported_versions": ["7.35d", "7.35c", "7.35b"]
    },
    "suggestion": "请更新解析器到最新版本或等待支持",
    "documentation_url": "https://docs.truesight.dev/errors/VERSION_MISMATCH"
  },
  "meta": {
    "timestamp": 1738645200,
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 7. 性能指标与 SLA

### 7.1 性能基准

| 操作 | 目标性能 | 测试数据量 |
|------|----------|------------|
| 录像上传 | > 50 MB/s | 256 MB 文件 |
| 录像解析 | < 30 秒 | 45 分钟比赛 |
| 比赛列表查询 | < 150 ms | 500 场比赛 |
| 单场元数据查询 | < 50 ms | - |
| 时序数据获取（5分钟） | < 200 ms | 300 ticks |
| 经济/经验曲线 | < 100 ms | 45 分钟比赛 |
| 关键事件列表 | < 50 ms | 100+ 事件 |
| 单场热力图生成 | < 500 ms | 81,000 数据点 |
| 聚合热力图（50场） | < 1 秒 | 4,050,000 数据点 |
| 眼位聚类分析 | < 2 秒 | 10,000 眼位 |
| 地图渲染帧率 | 60 FPS | 10 英雄实时移动 |

### 7.2 可用性 SLA

- **系统可用性**: 99.9%（单用户桌面应用）
- **数据一致性**: 100%（本地 SQLite + Parquet）
- **解析成功率**: > 95%（兼容版本内）

### 7.3 资源限制

| 资源 | 限制 |
|------|------|
| 单个录像文件大小 | 最大 500 MB |
| 并发解析任务数 | 2 个 |
| 单次查询最大返回记录数 | 100 条 |
| WebSocket 连接超时 | 30 秒无数据自动断开 |
| API 请求频率 | 无限制（本地应用） |

---

## 8. 版本演进路线图

### MVP v1.0（核心价值验证）

**已定义 API**:
- ✅ 录像上传/解析/任务管理
- ✅ 比赛列表/详情/选手数据
- ✅ 回放数据流（ticks, timeline, events）
- ✅ 建筑状态、特定时刻快照
- ✅ 系统健康检查

**预期交付**: 能够导入比赛并在 2D 地图上回放

---

### MVP v1.5（可视化增强）

**新增 API**:
- ✅ 录像自动下载（OpenDota/Stratz）
- ✅ 眼位数据获取
- ✅ 战斗日志详细数据
- ✅ 开雾事件分析
- ✅ 团战片段检测
- ✅ 单场热力图生成
- ✅ 眼位热力图
- ✅ 路径追踪
- ✅ 解析进度 WebSocket 推送

**预期交付**: 能够生成单场比赛的热力图和眼位分布图

---

### v2.0（AI 与聚合分析）

**新增 API**:
- ✅ 聚合热力图（多场分析）
- ✅ 眼位聚类分析
- ✅ 对线期路径分析
- ✅ 选手行为指纹
- ✅ 性能对标
- ✅ 失误检测引擎
- ✅ 开雾效率分析
- ✅ BP 元数据同步
- ✅ 战队 BP 习惯
- ✅ BP 模拟助手
- ✅ 英雄位置概率
- ✅ 英雄组合分析
- ✅ 技能使用热图
- ✅ 比赛自定义标签

**预期交付**: 能够分析某战队 50 场比赛的习惯并生成 AI 报告

---

## 9. 附录

### 9.1 常用查询示例

#### 查询某战队所有比赛
```http
GET /api/v1/matches?team_id=15&sort=-start_time&page_size=50
```

#### 查询某选手的 Anti-Mage 比赛
```http
GET /api/v1/matches?account_id=87278757&hero_id=1
```

#### 获取某比赛的 10-20 分钟热力图
```http
GET /api/v1/visualization/8123456789/heatmap?hero_id=1&start_time=600&end_time=1200
```

#### 分析某战队的眼位习惯（前期）
```json
POST /api/v1/analytics/ward-clusters
{
  "team_id": 15,
  "time_range": "0-10",
  "min_matches": 20
}
```

---

### 9.2 数据模型关系图

```
Match (比赛)
  ├── Players (选手) [1:N]
  ├── Ticks (时序数据) [1:N]
  ├── Events (事件) [1:N]
  ├── Wards (眼位) [1:N]
  ├── Smokes (开雾) [1:N]
  ├── Teamfights (团战) [1:N]
  └── ParseTask (解析任务) [1:1]

Team (战队)
  ├── Matches [N:N]
  └── Players [1:N]

Player (选手)
  ├── Matches [N:N]
  └── PerformanceStats [1:N]
```

---

### 9.3 技术约束

1. **数据存储**:
   - SQLite 用于元数据（比赛列表、选手信息）
   - Parquet 用于时序数据（每场比赛独立目录）
   - DuckDB 用于分析查询（直接读取 Parquet）

2. **解析器**:
   - 优先使用 Clarity (Java)
   - 备选 Manta (Go)

3. **前端技术**:
   - PixiJS 用于 2D 地图渲染
   - Recharts 用于图表
   - Zustand 用于状态管理

4. **通信协议**:
   - HTTP/REST 用于常规查询
   - WebSocket 用于实时推送

---

### 9.4 安全考虑

1. **本地优先**: 所有数据默认本地处理，不上传云端
2. **文件验证**: 上传文件需进行格式和大小验证
3. **路径安全**: 防止路径穿越攻击
4. **资源限制**: 限制并发解析任务数，防止资源耗尽

---

### 9.5 未来扩展方向

1. **云端协作** (v3.0):
   - 战队成员共享分析报告
   - 需新增认证 API 和权限管理

2. **实时比赛分析** (v3.0):
   - 接入 Dota 2 GSI（Game State Integration）
   - 实时获取比赛数据并分析

3. **语音分析** (v4.0):
   - 结合 Clarity 的语音数据
   - 分析队伍沟通效率

4. **自定义报告导出** (v2.5):
   - PDF/PPT 格式报告生成
   - 数据可视化图表导出

---

## 📝 文档变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0.0 | 2026-02-04 | 初始版本，定义 52 个核心 API 端点 |

---

**文档维护**: 本文档应随着项目开发进度实时更新。每个 API 实现后，需在对应端点标注实现状态（✅已实现 / 🚧开发中 / ❌未开始）。
