# 项目分析报告: True Sight (Dota 2 AI Pro)

> **生成日期**: 2026-02-26  
> **项目阶段**: Phase 4 / Phase 4.5 重构  
> **代码库**: 29 commits, ~20K+ LOC (前端 ~16.4K, 后端 ~8K+)

---

## 1. 项目概述

**True Sight** 是一个面向 Dota 2 职业战队的本地优先（local-first）录像分析桌面应用。核心目标是通过解析 `.dem` 录像文件，提供比公共数据网站更深度的战术洞察——包括位置数据、视野效率、经济走势以及 AI 辅助的对手模式识别。

### 产品定位

| 维度 | 描述 |
|------|------|
| **目标用户** | 职业战队分析师、教练、选手 |
| **核心场景** | 赛后复盘、对手侦察、战术研究、BP 辅助 |
| **差异化** | 本地数据安全、深度位置分析、AI 习惯识别 |
| **竞品参考** | Dotabuff/OpenDota（网页端，数据浅层）、Stratz（付费，无本地化） |

### 当前核心能力

1. **录像入库链路**: OpenDota 同步 → prepare → download → decompress → parse → index
2. **2D 回放引擎**: PixiJS 渲染英雄位置、眼位、minimap，支持暂停感知双时基
3. **比赛数据库**: 远端比赛浏览 + 本地已解析录像管理
4. **战队档案**: 按战队/赛事维度的比赛聚合与快速操作
5. **HUD 实时指标**: 英雄等级/KDA/GPM/XPM/净资产面板

---

## 2. 技术架构

### 2.1 整体分层

```
┌─────────────────────────────────────────────────────┐
│                  Electron Shell                      │
│  ┌───────────────────────────────────────────────┐  │
│  │           Frontend (Renderer Process)          │  │
│  │  React 18 + TypeScript + Vite + TailwindCSS   │  │
│  │  PixiJS v8 (地图渲染) | Vitest (测试)          │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │ HTTP REST (localhost:8000)     │
│  ┌───────────────────▼───────────────────────────┐  │
│  │           Backend (Python Sidecar)             │  │
│  │  FastAPI + SQLite + Parquet + DuckDB          │  │
│  │  Services / Storage / Analyzers                │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │ subprocess + JSON             │
│  ┌───────────────────▼───────────────────────────┐  │
│  │           Parser (Java 17 + Clarity)           │  │
│  │  clarity-parser-1.0.0-uber.jar (17MB)         │  │
│  │  112MB .dem → 完整解析 < 3 秒                   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 技术栈明细

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| **桌面壳** | Electron | 多进程架构, BrowserWindow |
| **前端框架** | React 18 + TypeScript | 函数组件, Hooks |
| **构建工具** | Vite | HMR, 路径别名 `@/` → `src/` |
| **样式** | TailwindCSS | Dota 2 定制主题配色 |
| **地图渲染** | PixiJS v8 | 60fps, 高 DPI, 多图层 |
| **前端测试** | Vitest | 9 个测试文件 |
| **后端框架** | FastAPI | async 支持, 自动文档 |
| **元数据库** | SQLite | WAL 模式, 64MB 缓存 |
| **时序存储** | Parquet (PyArrow) | 列式压缩, 按 match 分目录 |
| **分析引擎** | DuckDB | 内存/磁盘混合, 原生查询 Parquet |
| **解析器** | Java 17 + Clarity | Uber JAR, Shadow Plugin |
| **Python** | 3.10+ | Type Hints + Pydantic v2 |

### 2.3 数据流

```
                    ┌──────────────┐
                    │  OpenDota API │
                    └──────┬───────┘
                           │ sync/fetch
                    ┌──────▼───────┐
                    │  SQLite DB    │ ← 比赛索引/选手/战队/联赛
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼───────┐  ┌─────▼──────┐  ┌──────▼───────┐
  │ Valve CDN    │  │ 本地 .dem  │  │  用户上传    │
  │ (下载录像)   │  │ (直接导入) │  │  (拖拽上传)  │
  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘
         │                │                │
         └────────┬───────┘────────────────┘
                  │ .dem 文件
           ┌──────▼───────┐
           │ Clarity Parser│ ← Java subprocess
           └──────┬───────┘
                  │ JSON (元数据+事件+位置)
           ┌──────▼───────┐
           │ ParseService  │ ← 写入 SQLite + Parquet
           └──────┬───────┘
                  │
    ┌─────────────┼──────────────┐
    │             │              │
┌───▼──────┐ ┌───▼──────┐ ┌────▼─────┐
│ meta.json│ │ ticks.pq │ │ wards.pq │  ← Parquet 分文件
│          │ │ kills.pq │ │          │
└──────────┘ └──────────┘ └──────────┘
                  │
           ┌──────▼───────┐
           │ Playback API  │ ← 读取 Parquet, 返回时序数据
           │ DuckDB 聚合   │ ← 热力图/路径分析
           └──────┬───────┘
                  │ JSON
           ┌──────▼───────┐
           │  前端渲染      │ ← PixiJS 地图 + React HUD
           └──────────────┘
```

---

## 3. 代码库盘点

### 3.1 前端模块清单 (`frontend/src/`)

#### 页面组件 (9 个)

| 文件 | 用途 | 约 LOC | 状态 |
|------|------|--------|------|
| `App.tsx` | 主路由, 页面导航, 全局状态 | 298 | ✅ 已完成 |
| `RealMatchViewer.tsx` | 回放查看器 (地图+时间轴+HUD) | 1149 | ✅ 核心功能完成 |
| `MatchDatabasePage.tsx` | 比赛数据库 (筛选/分页/下载) | 1125 | ✅ 已完成 |
| `TeamProfilePage.tsx` | 战队档案 (赛事分组/快照/批量) | 2600 | ✅ 已完成 (最大页面) |
| `OpenDotaLivePage.tsx` | 远端比赛浏览 (职业/路人) | 740 | ✅ 已完成 |
| `ReplayLibraryPage.tsx` | 本地已解析录像管理 | 283 | ✅ 已完成 |
| `MatchListPage.tsx` | 比赛列表 + 搜索 + 上传 | 364 | ✅ 已完成 |
| `MapTestPage.tsx` | 地图渲染调试 | 188 | ✅ 调试用 |
| `POCTestPage.tsx` | POC 技术验证 | 334 | ✅ 调试用 |

#### 可复用组件 (6 个)

| 文件 | 用途 | 约 LOC |
|------|------|--------|
| `components/map/DotaMapRenderer.ts` | PixiJS 地图渲染引擎 (核心) | 1432 |
| `components/map/MapViewer.tsx` | React 封装 PixiJS | 145 |
| `components/map/mapCoordinateMapper.ts` | 游戏坐标 ↔ 屏幕坐标 | 113 |
| `components/timeline/Timeline.tsx` | 播放控制 (进度/速度/暂停) | 514 |
| `components/ReplayUploader.tsx` | 多文件拖拽上传 | 416 |
| `components/poc/PixiJSStressTest.tsx` | PixiJS 性能测试 | 253 |

#### API 服务层 (7 个)

| 文件 | 用途 | 约 LOC |
|------|------|--------|
| `api/backend.ts` | 后端类型定义 + 基础 fetch | 387 |
| `api/remoteService.ts` | OpenDota 远端同步/入库 | 180 |
| `api/matchDatabaseService.ts` | 比赛数据库管理操作 | 170 |
| `api/matchService.ts` | 比赛 CRUD | 108 |
| `api/libraryService.ts` | 本地录像库 | 86 |
| `api/replayService.ts` | 录像上传/解析任务 | 78 |
| `api/teamProfileService.ts` | 战队查询 | 55 |

#### 数据/工具/类型

| 文件 | 用途 | 约 LOC |
|------|------|--------|
| `data/mapElements.ts` | 地图元素坐标 (塔/兵营/Roshan) | 534 |
| `utils/gameClock.ts` | 游戏时钟映射 (4 策略 + 暂停) | 477 |
| `data/heroes.ts` | 127 英雄数据 (ID/名称/中文) | 285 |
| `pages/matchDatabaseFormatting.ts` | 下载状态/时间格式化 | 98 |
| `types/replayContext.ts` | 录像入口上下文类型 | 10 |

#### 测试文件 (10 个)

| 文件 | 测试目标 |
|------|----------|
| `TeamProfilePage.test.tsx` | 战队档案页 (2273 LOC, 最大测试) |
| `MatchDatabasePage.test.tsx` | 比赛数据库页 |
| `OpenDotaLivePage.test.tsx` | 远端比赛页 |
| `ReplayLibraryPage.test.tsx` | 本地录像库页 |
| `RealMatchViewer.hudMetrics.test.tsx` | HUD 指标面板 |
| `App.matchDatabaseNavigation.test.tsx` | App → 比赛数据库导航 |
| `App.teamProfileNavigation.test.tsx` | App → 战队档案导航 |
| `App.liveLibraryNavigation.test.tsx` | App → Live/Library 导航 |
| `mapCoordinateMapper.test.ts` | 坐标转换函数 |
| `gameClock.test.ts` | 游戏时钟映射 |

#### 前端架构特征

- **状态管理**: 纯 React `useState`，**未引入 Zustand**（尽管 AGENTS.md 有规划）
- **路由**: 无 React Router，App.tsx 内部状态切换页面
- **Hooks 目录**: 存在但为空，自定义 hooks 均内联在页面中
- **样式方案**: TailwindCSS + clsx + tailwind-merge
- **HTTP 客户端**: 主要使用原生 fetch，replayService 单独使用 axios

---

### 3.2 后端模块清单 (`backend/`)

#### 路由层 (8 个 router)

| 文件 | 端点前缀 | 主要端点 | 状态 |
|------|----------|---------|------|
| `routers/health.py` | `/health` | 健康检查 | ✅ |
| `routers/replays.py` | `/api/v1/replays` | upload, parse, tasks | ✅ |
| `routers/matches.py` | `/api/v1/matches` | list, detail, players, draft, delete | ✅ |
| `routers/playback.py` | `/api/v1/playback` | ticks, events, wards, heroes, hud, smokes(STUB) | ✅ (smokes STUB) |
| `routers/visualization.py` | `/api/v1/visualization` | heatmap, paths | ✅ (aggregate STUB) |
| `routers/admin.py` | `/api/v1/admin` | opendota sync/query, match-database, replay download | ✅ |
| `routers/remote.py` | `/api/v1/remote` | 远端比赛列表, 手动同步, ingest | ✅ |
| `routers/library.py` | `/api/v1/library` | 本地解析库, delete, reparse | ✅ |

#### 服务层 (4 个 service)

| 文件 | 用途 | 关键方法 |
|------|------|---------|
| `services/parse_service.py` | 录像解析 + 存储 | parse_replay(), parse_replay_sync() |
| `services/opendota_service.py` | OpenDota API 客户端 | fetch_recent_matches(), fetch_match_details() |
| `services/opendota_sync_service.py` | 增量同步调度 | sync_recent(), sync_reference() |
| `services/replay_download_service.py` | 录像下载 + 自动解析 | prepare(), execute(), retry() |

#### 存储层 (7 个 storage)

| 文件 | 用途 | 数据源 |
|------|------|--------|
| `storage/parquet_storage.py` | Parquet 读写 (ticks/kills/wards/meta) | Parquet 文件 |
| `storage/match_storage.py` | 比赛元数据 CRUD | SQLite `matches` 表 |
| `storage/opendota_match_storage.py` | OpenDota 比赛索引 | SQLite `opendota_matches` 表 |
| `storage/opendota_reference_storage.py` | 战队/联赛维表 | SQLite `opendota_teams/leagues` 表 |
| `storage/replay_download_storage.py` | 下载任务状态 | SQLite `replay_download_tasks` 表 |
| `storage/match_database_storage.py` | 比赛数据库聚合查询 | SQLite (跨表 JOIN) |
| `storage/library_storage.py` | 本地录像库查询 | SQLite + Parquet |

#### 分析器 (2 个 analyzer)

| 文件 | 用途 | 性能 |
|------|------|------|
| `analyzers/heatmap_analyzer.py` | 热力图生成 (movement/kill/death) | 64x64: 43ms, 128x128: 100ms |
| `analyzers/path_analyzer.py` | 路径轨迹 + Douglas-Peucker 简化 | 单英雄 97ms, 简化率 73.5% |

#### 解析器集成

| 文件 | 用途 |
|------|------|
| `parsers/clarity_parser.py` | Python→Java IPC 包装器 (subprocess + JSON) |
| `parsers/models.py` | ParseResult, PositionSample, KillEvent 等数据模型 |
| `parsers/` (Java 端) | SimpleDemoParser.java (Clarity 库调用) |

#### 数据库层

| 文件 | 用途 |
|------|------|
| `database/sqlite_db.py` | SQLite 连接管理, WAL 模式, 表创建/迁移 |

#### 后端测试 (13 个)

| 文件 | 测试目标 |
|------|----------|
| `tests/test_admin_opendota_sync.py` | OpenDota 同步端点 |
| `tests/test_opendota_service.py` | OpenDota 服务层 |
| `tests/test_opendota_match_storage.py` | OpenDota 比赛存储 |
| `tests/test_opendota_reference_storage.py` | 战队/联赛维表 |
| `tests/test_match_database_storage.py` | 比赛数据库聚合 |
| `tests/test_match_filters.py` | 查询过滤 |
| `tests/test_matches_duration_source.py` | 时长来源优先级 |
| `tests/test_replay_download_service.py` | 下载服务 |
| `tests/test_replay_download_storage.py` | 下载任务存储 |
| `tests/test_playback_hud_contract.py` | HUD API 契约 |
| `tests/test_playback_pause_contract.py` | 暂停契约 |
| `tests/test_remote_routes.py` | remote 路由 |
| `tests/test_library_routes.py` | library 路由 |

---

### 3.3 解析器层 (`parsers/`)

| 组件 | 路径 | 说明 |
|------|------|------|
| Clarity Uber JAR | `build/libs/clarity-parser-1.0.0-uber.jar` | 17MB, 含所有依赖 |
| 解析器主类 | `src/main/java/SimpleDemoParser.java` | 完整数据提取 |
| JDK 17 | `jdk17/jdk-17.0.18+8/` | OpenJDK |
| Gradle 8.5 | `gradle-8.5/` | Shadow Plugin |
| 构建配置 | `build.gradle.kts` | Kotlin DSL |

**解析能力**:
- 比赛元数据 (match_id, game_mode, winner, players, picks/bans)
- 英雄位置 (每 30 tick 采样, 含 hp/mana/level)
- 击杀事件 (killer, victim, time, location)
- 眼位事件 (observer/sentry, placed/destroyed, team)
- 暂停区间 (replay_start/end, game_time)
- 终场锚点 (game_state 转换, duration 校准)

**性能**: 112MB 录像完整提取 < 3 秒

---

### 3.4 数据存储

#### SQLite 表结构

| 表名 | 用途 | 来源 |
|------|------|------|
| `matches` | 比赛元数据索引 | 解析器写入 |
| `player_matches` | 选手单场数据 | 解析器写入 |
| `opendota_matches` | OpenDota 比赛镜像 | 同步服务写入 |
| `opendota_teams` | 战队维表 | reference sync |
| `opendota_leagues` | 联赛维表 | reference sync |
| `replay_download_tasks` | 下载任务状态 | 下载服务写入 |

#### Parquet 文件结构 (per match)

```
data/matches/{match_id}/
├── positions.parquet   # 英雄位置时序 (~768KB)
├── kills.parquet       # 击杀事件 (~4KB)
├── wards.parquet       # 眼位事件 (~10KB)
└── meta.json           # 比赛元数据 (~5KB)
```

---

## 4. 功能完成度矩阵

### Phase 1-3: 基础设施 + MVP ✅

| 功能 | 状态 | 完成度 |
|------|------|--------|
| 技术验证 POC (Parquet/PixiJS/Clarity) | ✅ DONE | 100% |
| Clarity 解析器集成 | ✅ DONE | 100% |
| 2D 地图渲染引擎 (PixiJS) | ✅ DONE | 100% |
| 英雄图标/minimap/眼位图标 | ✅ DONE | 100% |
| 时间轴组件 (播放/暂停/拖动/倍速) | ✅ DONE | 100% |
| 平滑动画系统 (双层插值) | ✅ DONE | 100% |
| Parquet 存储层 | ✅ DONE | 100% |
| SQLite 元数据层 | ✅ DONE | 100% |
| 全部核心 API (replays/matches/playback) | ✅ DONE | 100% |
| 前后端数据集成 (RealMatchViewer) | ✅ DONE | 100% |
| 热力图分析器 (后端) | ✅ DONE | 100% |
| 路径分析器 (后端) | ✅ DONE | 100% |
| 录像管理页 (上传/搜索/删除) | ✅ DONE | 100% |

### Phase 4: 数据化回放 + 职业战队数据库

| 任务 ID | 功能 | 状态 | 完成度 |
|---------|------|------|--------|
| PH4-1 | OpenDota 数据同步 (5 slices) | ✅ DONE | 100% |
| PH4-2 | 比赛数据模型扩展 (2 slices) | ✅ DONE | 100% |
| PH4-3 | 录像下载系统 (4 slices) | ✅ DONE | 100% |
| PH4-4 | 比赛数据库页面 (8 FE + 4 BE slices) | ✅ DONE | 100% |
| PH4-5 | 战队归档页 (17 slices) | ✅ DONE | 100% |
| PH4-6 | 回放实时 HUD (2 slices) | ✅ DONE | 100% |
| PH4-7 | Gold/XP 优势曲线 | ❌ TODO | 0% |

### Phase 4.5: 重构

| 任务 ID | 功能 | 状态 | 完成度 |
|---------|------|------|--------|
| RB-1~5 | remote/library 分层 + API | ✅ DONE | 100% |
| RB-6 | 图标资源接入 (league/team) | 🔄 IN_PROGRESS | 70% |
| RB-7 | 回归测试与性能基线 | ❌ TODO | 0% |

### 回放解析重构 (Option2)

| 任务 ID | 功能 | 状态 | 完成度 |
|---------|------|------|--------|
| RP2-1 | 统一时间契约 | ✅ DONE | 100% |
| RP2-2 | 修复 game_time 计算 | ✅ DONE | 100% |
| RP2-3 | 前端时间轴对齐 | 🔄 IN_PROGRESS | 80% |
| RP2-4 | 时间轴回归测试 | ❌ TODO | 0% |
| RP2-5 | 事件与 HUD 扩展字段设计 | ❌ TODO | 0% |
| RP2-6 | 参考 OpenDota 处理链拆分 | ❌ TODO | 0% |
| RP2-7 | Pause-aware 双时基改造 | 🔄 IN_PROGRESS | 80% |

### Phase 3 遗留 (未完成)

| 功能 | 状态 | 后端 | 前端 |
|------|------|------|------|
| 热力图可视化组件 | ❌ TODO | ✅ API 已完成 | ❌ UI 未实现 |
| 路径轨迹可视化组件 | ❌ TODO | ✅ API 已完成 | ❌ UI 未实现 |
| 地图击杀事件标记 | ❌ TODO | ✅ 数据已有 | ❌ UI 未实现 |
| 眼位聚类分析 (AI) | ❌ TODO | ❌ 未实现 | ❌ 未实现 |
| Ward Analyzer | ❌ TODO | ❌ 未实现 | - |

---

## 5. 技术债务评估

### 🔴 高优先级

| 项目 | 描述 | 影响 |
|------|------|------|
| **无全局状态管理** | 页面间通过 App.tsx props/callback 传递，TeamProfilePage 已达 2600 LOC | 可维护性差，跨页状态丢失风险 |
| **无 React Router** | App.tsx 内部状态手动切页，无 URL 路由 | 无法直接链接到页面，浏览器前进/后退不可用 |
| **STUB 端点未实现** | smokes API 返回空, aggregate heatmap/ward-clusters 占位 | 功能缺口 |
| **回归测试缺失** | RB-7 标记 TODO，核心解析→回放链路无端到端测试 | 重构风险高 |

### 🟡 中优先级

| 项目 | 描述 | 影响 |
|------|------|------|
| **HTTP 客户端不统一** | 部分用 fetch, 部分用 axios | 错误处理/拦截器不一致 |
| **前端大文件** | TeamProfilePage(2600), DotaMapRenderer(1432), RealMatchViewer(1149) | 阅读/维护困难 |
| **Hooks 目录为空** | 自定义逻辑内联在页面中，无法复用 | 代码重复 |
| **前端错误处理** | 各页面自行处理 API 错误，无统一方案 | 用户体验不一致 |
| **日志系统缺失** | 后端无结构化日志，前端无 error boundary | 问题排查困难 |
| **后端路径配置历史债务** | 多次修复 cwd 相关路径漂移 | 部署环境敏感 |

### 🟢 低优先级

| 项目 | 描述 | 影响 |
|------|------|------|
| **静态地图元素未启用** | mapElements.ts 534 LOC 定义但被禁用 | 数据浪费 |
| **POC 页面保留** | MapTestPage/POCTestPage 仅调试用 | 代码膨胀 |
| **hardcoded base URL** | `http://localhost:8000` 散布在各 service | 部署受限 |
| **Electron 打包未配置** | 无 electron-builder 配置 | 无法分发 |

---

## 6. 质量与测试现状

### 测试覆盖

| 层级 | 测试文件数 | 覆盖范围 | 评估 |
|------|-----------|----------|------|
| **前端** | 10 | 页面组件 + 工具函数 + 导航流 | 中等 (核心页面有测试，组件层薄弱) |
| **后端** | 13 | 路由 + 服务 + 存储 | 中等 (Phase 4 新增功能测试完整，Phase 3 遗留较薄) |
| **解析器** | 2 (POC) | 基础解析 + 性能 | 低 (仅 POC 验证) |
| **端到端** | 0 | - | 无 |

### 已验证性能基线

| 指标 | 结果 | 目标 |
|------|------|------|
| Parquet 写入 100K 行 | 25.66ms | < 5000ms ✅ |
| Parquet 读取 100K 行 | 17.75ms | < 1000ms ✅ |
| DuckDB 热力图聚合 | 5.96ms | < 500ms ✅ |
| 完整录像解析 (112MB) | 2752ms | < 5000ms ✅ |
| 热力图生成 (128x128) | 100ms | < 500ms ✅ |
| 路径分析 (单英雄) | 97ms | - ✅ |

---

## 7. 关键风险与建议

### 架构风险

| 风险 | 等级 | 建议 |
|------|------|------|
| TeamProfilePage 过于庞大 (2600 LOC) | 🔴 高 | 拆分为子组件 + 引入状态管理 |
| 无路由系统导致无法深链接 | 🔴 高 | 引入 React Router 或等效方案 |
| 前后端共享类型缺失 | 🟡 中 | 后端生成 OpenAPI schema, 前端自动生成类型 |
| 单线程解析器 | 🟡 中 | 解析队列 (PARSER-5) 支持并行 |

### 产品风险

| 风险 | 等级 | 建议 |
|------|------|------|
| Dota 2 版本更新可能破坏 Clarity 解析 | 🔴 高 | 建立版本兼容性数据库 + 监控 |
| OpenDota API 限流/403 | 🟡 中 | 已加 User-Agent 缓解，建议增加本地缓存 |
| 打包/分发未准备 | 🟡 中 | Phase 6 需完整的 Electron Builder 配置 |

### 技术建议 (按优先级)

1. **引入 Zustand** — 解耦页面状态，支持跨页共享 (比赛选择、用户偏好)
2. **引入 React Router** — 支持 URL 路由、深链接、浏览器导航
3. **拆分大组件** — TeamProfilePage 拆为 LeagueCompare/SnapshotManager/ActionHistory 等
4. **统一 HTTP 客户端** — 全部迁移到 fetch 或 axios，增加请求/响应拦截器
5. **抽取自定义 Hooks** — usePlayback, useMatchDatabase, useTeamProfile 等
6. **添加端到端测试** — 至少覆盖: 上传→解析→回放 核心链路
7. **配置 Electron Builder** — 为 Windows 分发做准备

---

## 8. 项目亮点

- **解析器性能优异**: 112MB 录像 < 3 秒，远超 PRD 目标
- **暂停感知时间系统**: 完整的 dual-time-basis 设计，解决了 Dota 暂停场景
- **Phase 4 交付密度高**: 17 个 Team Profile slice 均已交付并测试
- **harness 基础设施**: 已建立增量开发流程 (feature list, session checklist)
- **测试驱动**: 所有 Phase 4 新增功能均有配套测试
