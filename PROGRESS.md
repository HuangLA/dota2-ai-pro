# PROGRESS.md - AI 协同开发进度追踪

> **用途**: 本文件供 AI 编码助手读取和更新，用于跟踪前后端开发进度、API 实现状态和当前任务。
> **更新规则**: AI 在完成任务后应更新相应状态；人类开发者也可手动修改。

---

## 项目元数据

| 字段 | 值 |
|------|-----|
| 项目名称 | True Sight (Dota 2 录像分析工具) |
| 当前阶段 | Phase 4.5 收尾 + S-Next 稳定性冲刺 🚀 |
| 最后更新 | 2026-02-26 |
| 更新者 | OpenCode |

---

## 快速导航 (Read This First)

### 当前执行基线（优先阅读）
1. **当前冲刺 (Current Sprint)**：查看 Phase 4 目标与 PH4-1 ~ PH4-7
2. **S-Next 执行看板（新增）**：查看 SN-1 ~ SN-8 当前完成状态
3. **下一步计划 (Phase 3 -> Phase 4)**：查看 Phase 4 里程碑和执行顺序
4. **API 实现状态**：确认当前可调用端点与 Stub 缺口

### 历史内容说明（保留原文，不删除）
- 文档中仍保留了 Phase 3 时期的任务表、路线图和前端 TODO，作为历史追溯依据。
- 当历史内容与 Phase 4 计划冲突时，以 `当前冲刺` + `Phase 4 里程碑` 为准。

---

## 当前进展摘要（2026-02-26）

### S-Next 执行看板（补充）
| ID | 任务 | 状态 | 结果摘要 |
|----|------|------|----------|
| SN-1 | 全链路回归测试矩阵 | `DONE` | 核心后端回归稳定通过 |
| SN-2 | 性能基线落地 | `DONE` | 产出 `backend/data/baselines/sn2_baseline_20260227_014013.json` |
| SN-3 | 两场样本时间轴回归 | `DONE` | 负时间/近 0:00/pause 契约通过 |
| SN-4 | 前端时间轴最终对齐 | `TODO` | 待收尾 |
| SN-5 | Pause-aware 边缘场景收口 | `DONE` | ticks/wards/advantage 与 HUD 暂停点一致性通过 |
| SN-6 | smokes 最小可用实现 | `DONE` | `/playback/{match_id}/smokes` 已非占位化 |
| SN-7 | 文档状态对齐 | `DONE` | `docs/api_specification.md` 与实现对齐 |
| SN-8 | 冲刺验收与 Phase 5 准入清单 | `TODO` | 待输出验收包 |

### 最近一次回归验证
- 命令: `py -m pytest tests/test_playback_e2e.py tests/test_timeline_regression.py tests/test_playback_pause_contract.py tests/test_playback_hud_contract.py tests/test_replay_download_service.py tests/test_replay_download_storage.py -q`
- 结果: `79 passed`

---

## 当前冲刺 (Current Sprint)

### 目标: Phase 4 核心能力落地（比赛数据库 + 录像下载 + 实时HUD）
**截止日期**: 2026-02-28  
**状态**: `IN_PROGRESS` 🚀

| ID | 任务 | 负责方 | 状态 | 备注 |
|----|------|--------|------|------|
| PH4-1 | 接入 OpenDota 数据同步（近期比赛/战队/赛事） | Backend | `TODO` | 新增 opendota_service + sync_service |
| PH4-2 | 完善比赛数据库（Team/Tournament/Match 扩展模型） | Backend | `TODO` | 支持按战队/赛事/时间查询 |
| PH4-3 | 录像下载系统（按比赛ID + 查询结果下载） | Backend | `TODO` | 任务状态追踪 + 失败重试 |
| PH4-4 | 前端比赛数据库页面（筛选/分页/跳转） | Frontend | `TODO` | MatchDatabasePage |
| PH4-5 | 战队归档页（示例：XG 赛事战绩） | Frontend | `TODO` | TeamProfilePage |
| PH4-6 | 回放实时 HUD（等级/装备/KDA/GPM/XPM/净资产） | Both | `TODO` | 新增 playback HUD API + UI 面板 |
| PH4-7 | 经济差/经验差实时曲线图 | Both | `TODO` | Gold/XP Advantage 与 Timeline 联动 |

### Phase 4.5 重构蓝图（OpenDota Live + Replay Library）
**状态**: `IN_PROGRESS`  
**目标**: 拆分“远端实时比赛流”和“本地已解析录像库”，形成可持续同步 + 本地资产管理闭环。

#### 产品边界（确认版）
- OpenDota Live: 作为“远端职业/路人比赛流”页面，支持定时增量同步 + 手动刷新。
- Replay Library: 作为“本地录像资产”页面，仅展示本地已解析完成比赛，支持管理与检索。
- 本地库入库范围: 允许任意 `match_id` 手动入库（不限职业）。

#### 同步与数据策略（确认版）
- 同步模式: `定时增量(每1分钟)` + `手动刷新`。
- OpenDota Live 默认展示职业赛事，提供 `职业 / 路人` 复选过滤（可组合）。
- 搜索能力: 支持 `match_id` 精确搜索、`leagueid` 精确搜索，并保留时间范围/分页。
- 名称与图标: 列表优先显示联赛名/战队名，支持联赛 icon 与战队 icon（缺失时回退占位图）。

#### 存储与状态模型（重构目标）
- `remote_matches`（远端镜像层）: OpenDota 同步原始比赛索引，含 source=pro/public、sync 时间戳。
- `local_replay_assets`（本地文件层）: `.dem.bz2/.dem` 文件路径、大小、hash、删除标记。
- `local_parse_runs`（解析层）: 解析任务状态、版本、错误信息、耗时。
- `local_match_index`（本地检索层）: 仅解析成功写入，作为 Team/Player/League 检索入口。
- 软状态拆分: 下载状态与解析状态分离，页面展示聚合态，避免单字段混杂。

#### 核心 API 蓝图（不与现有端点冲突，逐步迁移）
- `GET /api/v1/remote/matches`：远端比赛列表（source 复选、match_id、leagueid、分页、时间筛选）。
- `POST /api/v1/remote/sync`：手动触发同步（pro/public 可选、limit、dry_run）。
- `POST /api/v1/remote/ingest`：按 `match_id` 触发下载+解析入库（支持批量）。
- `GET /api/v1/library/matches`：本地解析完成库列表（team/player/league/search）。
- `POST /api/v1/library/{match_id}/delete`：硬删本地文件并保留资产记录（`deleted_at` + reason）。
- `POST /api/v1/library/{match_id}/reparse`：对本地已下载资产重新解析。
- `GET /api/v1/jobs`：统一任务观察（sync/download/parse）。

#### 前端页面蓝图（UI 改造目标）
- 新页面 `OpenDotaLivePage`：
  - 顶部状态条（上次同步时间、自动同步开关、手动刷新按钮）。
  - 筛选区（职业/路人复选、match_id、leagueid、时间范围）。
  - 列表区（战队/联赛名称 + icon、下载并入库按钮、批量 checkbox）。
- 新页面 `ReplayLibraryPage`：
  - 仅展示已解析完成项目。
  - 支持按战队/选手/联赛检索。
  - 行级动作：打开回放、查看任务历史、删除本地资产、重新解析。

#### 迁移执行计划（建议）
| ID | 任务 | 负责方 | 状态 | 验收标准 |
|----|------|--------|------|----------|
| RB-1 | 新建 remote/local 分层表与迁移脚本 | Backend | `DONE` | 已新增 remote/library 路由依赖的 schema 扩展与兼容迁移 |
| RB-2 | 实现 1 分钟增量同步调度 + 手动刷新 API | Backend | `DONE` | 已接入 60s 后台增量同步与 `POST /api/v1/remote/sync` |
| RB-3 | 构建 ingest pipeline（下载→解析→索引） | Backend | `DONE` | 已提供 `POST /api/v1/remote/ingest` 支持任意 match_id 批量入库 |
| RB-4 | 实现 Replay Library API（仅 parsed） | Backend | `DONE` | 已提供 `GET /api/v1/library/matches` 与删除接口 |
| RB-5 | 拆分前端为 Live + Library 双页面 | Frontend | `DONE` | 已新增 OpenDota Live / Replay Library 页面与入口 |
| RB-6 | 图标资源接入（league/team）与占位策略 | Frontend | `DONE` | 已接入 icon URL + 占位样式，后续优化资源质量 |
| RB-7 | 现代化桌面级美化 (UI Polish) | Frontend | `DONE` | 全量引入 Glassmorphism 面板、全局渐变背景及悬浮交互 |
| RB-8 | 导航栏与组件中文化 | Frontend | `DONE` | 完成侧边栏全面汉化与页面内文案统一 |
| RB-9 | 回归测试与性能基线 | Both | `TODO` | 同步/下载/解析/检索链路稳定 |

### Option2 执行看板：回放解析重构（进行中）
**目标**: 以最小风险方式重构解析链路，统一时间契约并为 HUD/曲线扩展铺路。  
**状态**: `IN_PROGRESS`

| ID | 任务 | 负责方 | 状态 | 验收标准 |
|----|------|--------|------|----------|
| RP2-1 | 统一时间契约（parser -> parquet -> playback） | Backend | `DONE` | `ticks/wards` 返回 `game_time` + `time_basis`，语义明确 |
| RP2-2 | 修复 game_time 计算基准 | Backend | `DONE` | 两场样本 `game_time` 非空且包含负时间，开局样本递增 |
| RP2-3 | 前端时间轴对齐时间契约 | Frontend | `IN_PROGRESS` | Timeline 以 `game_time` 为主；fallback 有可见提示 |
| RP2-4 | 时间轴回归测试（2 场比赛） | Both | `TODO` | 86083386/84782020 验证出兵前负时间、出兵 0:00 对齐 |
| RP2-5 | 事件与 HUD 扩展字段设计 | Both | `TODO` | 明确 kills/networth/gold/xp 的统一时基与字段契约 |
| RP2-6 | 参考 OpenDota 处理链拆分解析模块 | Backend | `TODO` | 形成 processor 分层（时间层/事件层/统计层）设计草案 |
| RP2-7 | Pause-aware 双时基时间轴改造（replay_time/game_time） | Both | `IN_PROGRESS` | 暂停时显示“暂停中”并冻结 game_time，保障眼位/事件统计口径稳定 |

### 上一冲刺: Phase 3 MVP 核心功能开发 ✅
**状态**: `DONE` - 核心链路已打通

| ID | 任务 | 负责方 | 状态 | 备注 |
|----|------|--------|------|------|
| MVP-1 | 实现 2D 地图渲染引擎 | Frontend | `DONE` | DotaMapRenderer + MapViewer ✅ |
| MVP-2 | 实现时间轴控件 | Frontend | `DONE` | Timeline 组件完成 ✅ |
| MVP-3 | 实现 Parquet 数据存储 | Backend | `DONE` | storage/parquet_storage.py ✅ |
| MVP-4 | 实现真实 /parse API | Backend | `DONE` | routers/replays.py 完整实现 ✅ |
| MVP-5 | 实现真实 /matches API | Backend | `DONE` | routers/matches.py 完整实现 ✅ |
| MVP-6 | 实现真实 /playback API | Backend | `DONE` | routers/playback.py tick数据 ✅ |
| MVP-7 | 前后端数据集成 | Both | `DONE` | **RealMatchViewer 完成，英雄+眼位渲染正常** ✅ |
| MVP-8 | 生成测试数据 | Backend | `DONE` | 2场比赛已解析 (84782020, 86083386) ✅ |

### 上一冲刺: Clarity 解析器集成 ✅
**状态**: `DONE` - 核心功能已完成

| ID | 任务 | 负责方 | 状态 | 备注 |
|----|------|--------|------|------|
| PARSER-1 | 构建 Clarity Uber JAR | Backend | `DONE` | clarity-parser-1.0.0-uber.jar (17MB) ✅ |
| PARSER-2 | 验证解析器性能 | Backend | `DONE` | 112MB 录像 < 1秒 ✅ |
| PARSER-3 | 创建 Python 包装器 | Backend | `DONE` | backend/parsers/clarity_parser.py ✅ |
| PARSER-4 | 扩展数据提取功能 | Backend | `DONE` | 元数据、英雄位置、击杀、眼位 ✅ |
| PARSER-5 | 实现解析队列 | Backend | `TODO` | 异步任务队列 (后续优化) |

### 上一冲刺: 技术验证 POC ✅
**状态**: `DONE` - 所有性能测试通过

| ID | 任务 | 负责方 | 状态 | 备注 |
|----|------|--------|------|------|
| POC-1 | 初始化前端项目配置 | Frontend | `DONE` | package.json, tsconfig, vite, tailwind |
| POC-2 | 初始化后端项目配置 | Backend | `DONE` | requirements.txt, main.py, routers |
| POC-3 | 创建 SQLite Schema | Backend | `DONE` | database/sqlite_db.py |
| POC-4 | 验证 Parquet 读写性能 | Backend | `DONE` | **25.66ms** 写入 100K 行 |
| POC-5 | 测试 PixiJS 渲染性能 | Frontend | `DONE` | 组件已创建，待手动测试 |
| POC-6 | 下载并构建 Clarity 解析器 | Backend | `DONE` | clarity-3.1.3.jar 构建成功 |
| POC-7 | 验证 Python-Java IPC 通信 | Backend | `DONE` | Python 包装器测试通过 ✅ |

---

## POC 性能测试结果

### 后端性能测试 (2026-02-04)

| 测试项 | 结果 | 目标 | 状态 |
|--------|------|------|------|
| Parquet 写入 100K 行 | **25.66ms** | < 5000ms | ✅ PASS |
| Parquet 读取 100K 行 | **17.75ms** | < 1000ms | ✅ PASS |
| Parquet 过滤读取 | **4.57ms** | < 500ms | ✅ PASS |
| DuckDB 热力图聚合 | **5.96ms** | < 500ms | ✅ PASS |
| SQLite 列表查询 | **0.06ms** | < 50ms | ✅ PASS |
| SQLite 筛选查询 | **0.18ms** | < 50ms | ✅ PASS |
| SQLite 玩家历史 | **0.14ms** | < 50ms | ✅ PASS |
| SQLite 聚合统计 | **0.83ms** | < 100ms | ✅ PASS |

**结论**: 所有后端性能指标均远超目标，技术选型验证通过。

### Clarity 解析器性能测试 (2026-02-04)

| 测试项 | 录像文件 | 大小 | 结果 | 目标 | 状态 |
|--------|---------|------|------|------|------|
| 基础解析 | 8674716612.dem | 112 MB | **796 ms** | < 3000 ms | ✅ PASS |
| 基础解析 | 8676017978.dem | 110 MB | **760 ms** | < 3000 ms | ✅ PASS |
| **完整数据提取** | 8674716612.dem | 112 MB | **2752 ms** | < 5000 ms | ✅ PASS |
| Tick 统计 | 8674716612.dem | 112 MB | 112,484 ticks | - | ✅ OK |
| 位置样本数 | 8674716612.dem | 112 MB | 53,882 samples | - | ✅ OK |
| 击杀事件数 | 8674716612.dem | 112 MB | 52 kills | - | ✅ OK |
| 眼位事件数 | 8674716612.dem | 112 MB | 284 events | - | ✅ OK |

**结论**: 完整数据提取模式下解析时间 < 3 秒，满足 PRD 性能要求。

### 地图渲染器功能测试 (2026-02-05)

| 功能 | 状态 | 说明 |
|------|------|------|
| PixiJS 初始化 | ✅ DONE | 900x900 画布，高 DPI 支持 (1.5x) |
| 坐标系转换 | ✅ DONE | 游戏坐标 (8000-24000) → 屏幕坐标 |
| 网格背景 | ✅ DONE | 10x10 网格 + 河流线 + 基地指示器 |
| 英雄位置渲染 | ✅ DONE | 10 个英雄，Radiant 绿色 / Dire 红色 |
| 眼位渲染 | ✅ DONE | Observer (圆形黄心) / Sentry (菱形蓝心) |
| 多图层管理 | ✅ DONE | 地图底层 → 眼位层 → 英雄层 |
| React 组件封装 | ✅ DONE | MapViewer 组件，props 控制 |
| **真实数据集成** | ✅ DONE | RealMatchViewer 连接 playback API |
| **眼位时间过滤** | ✅ DONE | 根据时间范围过滤存活眼位 |

**已实现核心功能**：
- ✅ DotaMapRenderer 类 (TypeScript + PixiJS 8)
- ✅ MapViewer React 组件（处理 React Strict Mode）
- ✅ RealMatchViewer 页面（真实录像数据）
- ✅ MapTestPage 测试页面（示例数据）
- ✅ 集成到主应用导航

**坐标系说明**：
- 游戏坐标范围: X: 7974~24992, Y: 7844~24852 (实测)
- 渲染边界设置: X/Y 均为 7500-25500 (留有余量)
- Radiant 泉水: ~(9500, 10000) - 屏幕左下
- Dire 泉水: ~(23200, 22700) - 屏幕右上
- 游戏数据从 ~112 秒开始（选英雄阶段结束后）

**下一步**：
- ~~实现时间轴控件，支持播放/暂停/拖动~~ ✅ 已完成
- 添加英雄移动轨迹线
- 加载真实 minimap 图片
- 实现击杀事件标记

---

## 前端开发进度 (Frontend)

### 环境配置
| 文件/配置 | 状态 | 备注 |
|-----------|------|------|
| package.json | `DONE` | Electron + React 18 + TypeScript + PixiJS |
| tsconfig.json | `DONE` | 路径别名配置完成 |
| vite.config.ts | `DONE` | React 插件 + 路径别名 |
| tailwind.config.js | `DONE` | Dota 2 主题配色 |
| .eslintrc.cjs | `DONE` | TypeScript + React 规则 |
| postcss.config.js | `DONE` | |
| node_modules | `DONE` | 737 packages installed |

### 核心模块
| 模块 | 状态 | 进度 | 负责 AI | 最后更新 |
|------|------|------|---------|----------|
| Electron Main Process | `DONE` | 100% | Claude | 2026-02-04 |
| React App Shell | `DONE` | 100% | Claude | 2026-02-04 |
| **2D Map Engine (PixiJS)** | `DONE` | **100%** | Claude | 2026-02-04 21:15 |
| POC Test Page | `DONE` | 100% | Claude | 2026-02-04 |
| Backend API Integration | `DONE` | 100% | Claude | 2026-02-04 |
| Timeline Component | `DONE` | 100% | Claude | 2026-02-05 |
| Heatmap Renderer | `TODO` | 0% | - | - |
| State Management (Zustand) | `TODO` | 0% | - | - |

### 页面
| 页面 | 状态 | 路由 | 说明 |
|------|------|------|------|
| Home (App Shell) | `DONE` | / | 主页导航 |
| POC Test Page | `DONE` | (内嵌) | 技术验证 |
| **Map Test Page** | `DONE` | (内嵌) | **地图渲染测试** ✅ NEW |
| Dashboard | `TODO` | /dashboard | - |
| Match Viewer | `TODO` | /match/:id | - |
| Team Analysis | `TODO` | /team/:id | - |
| Draft Assistant | `TODO` | /draft | - |
| Settings | `TODO` | /settings | - |

---

## 后端开发进度 (Backend)

### 环境配置
| 文件/配置 | 状态 | 备注 |
|-----------|------|------|
| requirements.txt | `DONE` | FastAPI, Pandas, DuckDB, PyArrow |
| main.py (FastAPI) | `DONE` | CORS + 路由注册 |
| .env.example | `DONE` | 完整配置模板 |
| pyproject.toml | `DONE` | Ruff + MyPy 配置 |
| .venv | `DONE` | Python 3.11 虚拟环境 |

### 核心模块
| 模块 | 状态 | 进度 | 负责 AI | 最后更新 |
|------|------|------|---------|----------|
| FastAPI App | `DONE` | 100% | Claude | 2026-02-04 |
| **API Routers (Real)** | `DONE` | **100%** | Claude | 2026-02-04 22:15 |
| SQLite Database | `DONE` | 100% | Claude | 2026-02-04 |
| **Parquet Storage** | `DONE` | **100%** | Claude | 2026-02-04 21:30 |
| DuckDB Analytics | `DONE` | 100% | Claude | 2026-02-04 |
| **Parser Integration** | `DONE` | **100%** | Claude | 2026-02-04 20:30 |
| **Parse Service** | `DONE` | **100%** | Claude | 2026-02-04 21:45 |
| **Heatmap Analyzer** | `DONE` | **100%** | Claude | 2026-02-05 |
| **Path Analyzer** | `DONE` | **100%** | Claude | 2026-02-06 |
| Ward Analyzer | `TODO` | 0% | - | - |

### POC 测试脚本
| 脚本 | 状态 | 用途 |
|------|------|------|
| poc/run_all_tests.py | `DONE` | 运行所有 POC 测试 |
| poc/test_parquet_performance.py | `DONE` | Parquet + DuckDB 性能测试 |
| poc/test_sqlite_performance.py | `DONE` | SQLite 元数据查询性能 |
| poc/test_pixijs_data.py | `DONE` | 生成 PixiJS 测试数据 |
| poc/test_clarity_parser.py | `DONE` | Clarity 解析器测试 |
| **poc/test_storage.py** | `DONE` | **存储和服务层完整测试** ✅ NEW |

### 解析器模块 ✅ NEW
| 组件 | 状态 | 路径 | 说明 |
|------|------|------|------|
| Clarity Uber JAR | `DONE` | parsers/build/libs/clarity-parser-1.0.0-uber.jar | 17 MB |
| SimpleDemoParser.java | `DONE` | parsers/src/main/java/SimpleDemoParser.java | **完整数据提取** |
| JDK 17 | `DONE` | parsers/jdk17/jdk-17.0.18+8/ | OpenJDK 17.0.18 |
| Gradle 8.5 | `DONE` | parsers/gradle-8.5/ | Shadow Plugin 配置 |
| **Python 包装器** | `DONE` | backend/parsers/clarity_parser.py | ClarityParser 类 ✅ |
| **数据模型** | `DONE` | backend/parsers/models.py | ParseResult 等 ✅ |

### 解析器提取的数据类型
| 数据类型 | 状态 | 说明 |
|----------|------|------|
| 比赛元数据 | `DONE` | match_id, game_mode, winner, players, picks/bans |
| 英雄位置 | `DONE` | 每 30 tick 采样，包含 hp/mana/level |
| 击杀事件 | `DONE` | killer, victim, time, location |
| 眼位事件 | `DONE` | observer/sentry, placed/destroyed, location, team |

---

## API 实现状态

> **契约文档**: `docs/api_specification.md`  
> **总计**: 43 个端点（历史统计）| **状态**: Phase 4 进行中，端点总数待按新需求重估

### 录像管理 API ✅ IMPLEMENTED
| 端点 | 方法 | 后端 | 前端调用 | MVP |
|------|------|------|----------|-----|
| /api/v1/replays/upload | POST | `DONE` | `TODO` | v1.0 |
| /api/v1/replays/parse | POST | `DONE` | `TODO` | v1.0 |
| /api/v1/replays/parse/sync | POST | `DONE` | `TODO` | v1.0 |
| /api/v1/replays/tasks | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/replays/tasks/{id} | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/replays/tasks/{id}/cancel | POST | `DONE` | `TODO` | v1.5 |

### 比赛数据 API ✅ IMPLEMENTED
| 端点 | 方法 | 后端 | 前端调用 | MVP |
|------|------|------|----------|-----|
| /api/v1/matches | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/matches/{id} | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/matches/{id}/players | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/matches/{id}/draft | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/matches/{id} | DELETE | `DONE` | `TODO` | v1.0 |

### 回放数据 API ✅ IMPLEMENTED
| 端点 | 方法 | 后端 | 前端调用 | MVP |
|------|------|------|----------|-----|
| /api/v1/playback/{id}/ticks | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/playback/{id}/events | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/playback/{id}/wards | GET | `DONE` | `TODO` | v1.5 |
| /api/v1/playback/{id}/heroes | GET | `DONE` | `TODO` | v1.0 |
| /api/v1/playback/{id}/smokes | GET | `DONE` | `TODO` | v1.5 |

### 可视化 API
| 端点 | 方法 | 后端 | 前端调用 | MVP |
|------|------|------|----------|-----|
| /api/v1/visualization/{id}/heatmap | GET | `DONE` | `TODO` | v1.5 |
| /api/v1/visualization/{id}/paths | GET | `DONE` | `TODO` | v1.5 |
| /api/v1/visualization/{id}/paths/{hero} | GET | `DONE` | `TODO` | v1.5 |
| /api/v1/visualization/aggregate/heatmap | POST | `STUB` | `TODO` | v2.0 |
| /api/v1/visualization/aggregate/ward-clusters | POST | `STUB` | `TODO` | v2.0 |

---

## 运行中的服务

| 服务 | URL | 状态 |
|------|-----|------|
| 前端开发服务器 | http://localhost:5173 | ✅ Running |
| 后端 API 服务器 | http://localhost:8000 | ✅ Running |
| API 文档 (Swagger) | http://localhost:8000/docs | ✅ Available |

---

## 阻塞问题 (Blockers)

| ID | 问题描述 | 影响范围 | 状态 | 解决方案 |
|----|----------|----------|------|----------|
| ~~B-1~~ | ~~需要手动下载 Clarity 解析器~~ | ~~POC-6~~ | `RESOLVED` | 已构建 clarity-3.1.3.jar ✅ |
| ~~B-2~~ | ~~需要获取测试用 .dem 文件~~ | ~~解析器测试~~ | `RESOLVED` | 用户已提供 2 个测试文件 ✅ |
| ~~B-3~~ | ~~需要扩展解析器数据提取~~ | ~~后端 API 实现~~ | `RESOLVED` | PARSER-3/4 已完成 ✅ |

**当前无阻塞问题！** 

---

## 决策记录 (Decisions)

| 日期 | 决策 | 原因 | 文档链接 |
|------|------|------|----------|
| 2026-02-01 | API 通信使用 HTTP REST + 动态端口 | 避免打包复杂性，支持独立调试 | docs/architecture_decisions/api-communication-strategy.md |
| 2026-02-01 | 推荐 Clarity (Java) 解析器 | 性能最优 (<3秒解析TI决赛) | docs/parser_comparison_analysis.md |
| 2026-02-04 | 采用 Stub-first API 开发模式 | 前后端可并行开发 | - |
| 2026-02-04 | 使用 Microsoft JDK 17 | 兼容性好，Gradle 构建成功 | - |
| 2026-02-04 | 构建 Clarity Uber JAR | 包含所有依赖，简化部署 | - |
| 2026-02-04 | 使用 Gradle Shadow Plugin | 自动打包所有依赖到单个 JAR | - |
| 2026-02-04 | Python 包装器使用 subprocess 调用 Java | 避免 JNI 复杂性，JSON 通信简单可靠 | - |
| 2026-02-04 | 位置采样间隔 30 ticks (~1秒) | 平衡数据量和精度 | - |
| 2026-02-04 | 地图坐标系 ±7500 units | 基于 Dota 2 游戏世界边界 | - |
| 2026-02-04 | PixiJS 多图层架构 | 地图底层 → 眼位层 → 英雄层，便于独立控制 | - |
| 2026-02-04 | 网格作为地图图片 fallback | 开发阶段可用，minimap 图片可选 | - |
| 2026-02-05 | Timeline 内部时间状态分离 | 避免播放时频繁触发父组件更新和 API 请求 | - |
| 2026-02-05 | 一次性加载整场比赛数据 | 初始加载稍慢但播放流畅，避免懒加载导致的请求堆积 | - |
| 2026-02-05 | 双层插值动画系统 | 数据层(tick间)+渲染层(LERP)实现丝滑英雄移动 | - |
| 2026-02-05 | 修正地图坐标边界 | 实测范围 7974~24992，边界扩大至 7500~25500 避免英雄消失 | - |
| 2026-02-24 | 比赛数据库重构为 OpenDota Live + Replay Library 双域架构 | 拆分远端实时流与本地已解析资产，支持 1 分钟增量同步与可维护扩展 | PROGRESS.md (Phase 4.5 重构蓝图) |

---

## AI 协作说明

### 状态值定义
- `TODO` - 未开始
- `IN_PROGRESS` - 进行中
- `STUB` - API 已定义但未实现业务逻辑
- `REVIEW` - 待审核
- `DONE` - 已完成
- `BLOCKED` - 被阻塞

### AI 更新规则
1. **开始任务前**: 将状态改为 `IN_PROGRESS`，填写 "负责 AI" 字段
2. **完成任务后**: 将状态改为 `DONE`，更新 "最后更新" 日期
3. **遇到阻塞**: 在 "阻塞问题" 表格中添加记录
4. **重要决策**: 在 "决策记录" 表格中添加记录

### 前后端协作流程
```
1. 后端 AI 实现 API 端点 → 更新 API 状态为 DONE
2. 前端 AI 查看 PROGRESS.md → 发现可调用的 API
3. 前端 AI 实现调用逻辑 → 更新 "前端调用" 状态为 DONE
```

### 解析器使用示例 (供其他 AI 参考)
```python
from backend.parsers import ClarityParser, ParseResult

# 初始化解析器
parser = ClarityParser()

# 同步解析
result: ParseResult = parser.parse("path/to/replay.dem")

# 异步解析 (FastAPI)
result = await parser.parse_async("path/to/replay.dem")

# 访问数据
print(f"Match ID: {result.metadata.match_id}")
print(f"Winner: {result.metadata.winner_name}")
print(f"Radiant heroes: {result.radiant_heroes}")
print(f"Kill events: {len(result.kills)}")
```

---

## 更新日志

| 日期 | 更新内容 | 更新者 |
|------|----------|--------|
| 2026-03-01 | **Phase 4.1 前端桌面化重构 (UI Redesign)**: ① 移除旧有网格式 Homepage，引入常驻侧边栏（Sidebar）布局及图标导航 ② 引入全局径向渐变背景，定制深色模式 Tailwind 色板 ③ 承载型面板全面采用玻璃磨砂质感 (Glassmorphism) 替换生硬色块 ④ 按钮全量替换现代质感渐变与 hover 反馈 ⑤ 取消 OpenDota Live 和 Match Database 表格定宽限制，新增 `whitespace-nowrap` 防折行 ⑥ 文案全面中文化（侧边栏、表格表头、时间精简至分钟），修复所有报错前端测试。 | OpenCode (Frontend Specialist) |
| 2026-02-26 | **Phase 4 收尾冲刺完成 (PH4-7 + 可视化 + 测试 + 技术债务)**: ① Java解析器新增 CDOTA_DataRadiant/Dire 经济数据提取，输出 economy JSON数组 ② Python EconomySample 模型 + economy.parquet 存储 + clarity_parser 解析 ③ GET /playback/{match_id}/advantage API 端点 ④ Recharts AdvantageChart 组件(金线+经验线+Timeline同步) ⑤ PixiJS击杀标记(T-006)、热力图覆盖(T-004)、移动轨迹(T-005) ⑥ 20项 timeline 回归测试 + 19项 E2E 端点测试 ⑦ Zustand store 状态管理(T-007) ⑧ React Router HashRouter路由(T-008)。前端 Vite build 通过，后端 154/155 测试通过(1项预存在失败)。 | OpenCode |
| 2026-02-26 | **新增 playback API E2E 回归测试**: 新增 `backend/tests/test_playback_e2e.py`，基于真实样本比赛 `8674716612/8689321714` 覆盖 `ticks/events/wards/heroes/hud/advantage/smokes` 端点的响应结构、数据字段、404 与查询边界（含空结果）校验；`py -m pytest tests/test_playback_e2e.py -v` 19 项全部通过。 | OpenCode |
| 2026-02-26 | **SimpleDemoParser 新增经济时间线提取**: 在 `CDOTA_DataRadiant/CDOTA_DataDire` 上按 30 tick 采样 `m_vecDataTeam.0000-0004` 的 `m_iTotalEarnedGold/m_iTotalEarnedXP/m_iNetWorth`，输出顶层 `economy` 数组（含双方总量、优势值与每槽位净资产），并保持 positions/kills/wards 与 pause-aware game_time 逻辑不变；重建 shadowJar 并用 `8674716612.dem` 验证通过。 | OpenCode |
| 2026-02-24 | **新增 Phase 4.5 重构蓝图**: 明确 OpenDota Live + Replay Library 双页面与双域数据架构，确认同步策略（每1分钟增量+手动刷新）、删除策略（硬删文件保留记录）、本地库范围（支持任意 match_id 手动入库），并纳入 RB-1~RB-7 迁移计划 | OpenCode |
| 2026-02-24 | **Phase 4.5 第一版实现完成（前后端并行）**: 后端新增 `/api/v1/remote/*` 与 `/api/v1/library/*`，支持 1 分钟增量同步、手动同步、批量 ingest、本地已解析库查询与硬删文件保留记录；前端新增 `OpenDotaLivePage` 与 `ReplayLibraryPage`，完成职业/路人筛选、match_id/leagueid 搜索、行级/批量入库、本地删除与回放入口。 | OpenCode |
| 2026-02-24 | **修复 OpenDota Live 联赛名补全链路**: `GET /api/v1/remote/matches` 对当前页缺失 `league_name` 的比赛按 `match_id` best-effort 拉取 OpenDota match details 并回写 `opendota_matches`，补全失败不阻断响应且完成后重查当前页返回；补充 remote 路由测试覆盖“补全成功”和“失败不阻断”场景。 | OpenCode |
| 2026-02-23 | **DONE: Match Database 增强删除录像 + 名称补全链路修复**: 新增 `POST /api/v1/admin/match-database/{match_id}/delete-replay` 删除已下载 `.dem.bz2/.dem` 并清理任务 `download_path`；`prepare_replay_download` 同步回写 OpenDota match detail 到 `opendota_matches`（含 team/league 名称），修复已入库比赛名称长期缺失问题；前端新增“删除录像”行级动作并完成回归测试。 | OpenCode (Backend+Frontend) |
| 2026-02-23 | **DONE: Replay 下载后自动解析 + 比赛库名称兜底**: `ReplayDownloadService` 下载成功后自动解压 `{match_id}.dem.bz2` 并异步触发解析，解析失败受控写入 `PARSE_FAILED`；`opendota_matches` 新增 `radiant_team_name/dire_team_name/league_name`（含 ALTER TABLE 迁移），`match_database` 查询改为 `COALESCE(reference_name, opendota_matches_name)` 兜底，相关后端 pytest 全部通过。 | OpenCode (Backend Engineer) |
| 2026-02-23 | **DONE: Match Database 交互改造（单行下载 + 勾选批量）**: MatchDatabasePage 行级动作收敛为单一“下载录像”（固定 `prepare_and_execute`），新增当前页 checkbox 选择与全选/取消全选，批量动作改为仅作用于勾选项并保留失败项复制/导出；同时优化战队/联赛缺失名称的友好回退文案并更新前端测试覆盖。 | OpenCode (Frontend Specialist) |
| 2026-02-19 | **DONE: PH4-1-OPENDOTA-SYNC-SLICE-5 recent 同步自动联动 reference 并增强诊断**: `POST /api/v1/admin/opendota/sync/recent` 新增 `sync_reference/reference_team_limit/reference_league_limit`（`1..1000`），在 `persist=true && dry_run=false && sync_reference=true` 时自动执行 teams/leagues reference sync，并在同一响应新增 `reference_teams_inserted/reference_teams_updated/reference_leagues_inserted/reference_leagues_updated`；`message` 统一追加 `reference_sync=executed|skipped` 诊断标记，补充后端 pytest 覆盖自动执行/禁用分支与参数边界。 | OpenCode (Backend Engineer) |
| 2026-02-19 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-8 职业联赛默认筛选与可见开关**: Match Database 前端新增默认开启的 `仅职业联赛` 筛选开关，列表查询始终透传 `professional_only`（默认 `true`，关闭为 `false`），并在页面说明中明确“默认职业联赛，可关闭查看全部（含路人局）”；`清空` 操作保持职业联赛默认开启，补充前端测试覆盖默认/关闭两种请求参数与重置行为，确保分页/批量/任务详情逻辑不回退 | OpenCode (Frontend Specialist) |
| 2026-02-19 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-4 职业赛事默认源与专业筛选修复**: `POST /api/v1/admin/opendota/sync/recent` 新增 `pro_only`（默认 `true`）并默认改走 OpenDota `/proMatches`（保留 `pro_only=false` 回退 public）；`GET /api/v1/admin/match-database` 新增 `professional_only`（默认 `true`）并默认过滤空 `leagueid` 比赛，修复路人局污染导致 team/league 筛选失效根因；补充路由/存储/服务层 pytest 覆盖默认路径与过滤组合可用性 | OpenCode (Backend Engineer) |
| 2026-02-19 | **DONE: PH4-1-OPENDOTA-SYNC-SLICE-4 OpenDota 403 风控兼容增强**: `OpenDotaService` 为所有 OpenDota 请求统一注入稳定默认 headers（浏览器样式 `User-Agent` + `Accept: application/json` + `Accept-Language`），并对 403 返回更清晰受控错误信息（含“可能被上游风控拦截，请检查 User-Agent/网络环境”）；补充服务层测试覆盖 headers 与 403 文案，回归 admin sync 相关测试与 dry-run 脚本调用 | OpenCode (Backend Engineer) |
| 2026-02-19 | **DONE: PH4-FE-LOCALIZATION-SLICE-1 前端页面中文化（Match Database / Team Profile / HUD）**: 完成 `App` 新增入口、`MatchDatabasePage`、`TeamProfilePage`、`RealMatchViewer` HUD 面板的用户可见文案中文化，并同步更新相关前端可见文本断言；文档 `docs/user_guide_team_profile_match_database_hud.md` 按新中文按钮与提示对齐 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-6-REALTIME-HUD-METRICS-SLICE-2 前端 HUD 最小接入**: RealMatchViewer 新增 `HUD Metrics` 面板并接入 `GET /api/v1/playback/{match_id}/hud?game_time=...`，与播放/拖动时间联动并启用 500ms 轻量节流 + 旧请求中止；展示 `Hero/Team/Lvl/K/D/A/NW/GPM/XPM`（`items` 显示 count），并提供可见 loading/empty/error 状态且失败不阻断主回放；补充前端 HUD 成功/失败最小测试并完成相关回归 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-6-REALTIME-HUD-METRICS-SLICE-1 后端 HUD 指标最小契约**: 新增 `GET /api/v1/playback/{match_id}/hud`（`game_time`/`tick` 二选一，默认最新），返回稳定字段 `status/match_id/game_time/tick/heroes[]`；`heroes[]` 固定含 `hero/team/level/kills/deaths/assists/net_worth/gpm/xpm/items`，并基于 kills 事件聚合 K/D，缺失指标以 fallback（`assists=0`、`net_worth/gpm/xpm=0`、`items=[]`）保证契约稳定；补充后端 pytest 与 `/health` smoke 验证 | OpenCode (Backend Engineer) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-17 历史分组重放与失败重试**: Team Profile `Action History` 新增 `Replay Visible History`（按当前筛选可见记录时间顺序串行重放并输出 `replayed/succeeded/failed` 汇总），并为失败记录新增 `Retry`；历史记录扩展 `lastRunStatus/lastRunAt/lastRunMessage` 以更新最近执行结果且保持最多 10 条上限；补充前端测试覆盖批量重放与失败重试链路 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-16 历史筛选与批量清理**: Team Profile `Action History` 新增 `History Filter`（All + 4 类动作）仅影响展示；新增 `Clear Visible History`/`Clear All History` 按筛选或全量批量清理并反馈清理条数，空历史或无筛选命中时按钮禁用；补充前端测试覆盖筛选展示与可见/全量清理行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-15 操作历史面板与快速重放**: Team Profile 新增会话内 `Action History`（最多 10 条）记录高频页面动作 `Prepare Visible Matches`、`Prepare Selected Leagues`、`Open Compare First 3 Replays`、`Open Visible In Match Database`，每条展示动作名/执行时间/摘要并提供 `Replay Action`；重放复用记录参数触发同类动作并沿用现有并发 guard，目标失效时返回受控提示；补充前端测试覆盖历史追加与 replay 触发 API 行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-14 Compare 导出与一键回放清单**: Team Profile 在 `League Compare` 新增页面级 `Export Compare Selection (.txt)`（导出 Compare 已选 league 且当前可见比赛，格式 `match_id\tleagueid\tstart_time`，空目标禁用）与 `Open Compare First 3 Replays`（按当前可见排序取前 3 逐条 `mode=prepare`，仅第一场触发回放跳转，反馈 `prepared_count/failed_count/opened_match_id`，执行中禁用并防重复触发）；补充前端测试覆盖导出流程/空禁用与 first-3 prepare+单次导航行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-13 Compare 选择集批量 prepare 与快照快速应用**: Team Profile 在 `League Compare` 新增页面级 `Prepare Selected Leagues`，仅对“Compare 当前勾选 league 且当前可见”的比赛逐条调用 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare`），执行中禁用并防重复触发，完成后反馈 `Total/Success/Failed`；快照区新增 `Apply Snapshot`（与 `Load Snapshot` 复用同一应用逻辑并保留兼容命名），选择快照后可一键应用并给出简短反馈；补充前端测试覆盖 compare 批量 prepare 范围/汇总与 Apply Snapshot 恢复关键筛选字段 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-12 快照导入导出与 Compare 多选筛选**: Team Profile 新增 `Export Snapshots (.json)` 与 `Import Snapshots (.json)`（仅传输 `name + team_id/limit/league quick filter/sort/only-with-download/focus-latest-league`）；导入支持非法项跳过汇总、同名覆盖及超 5 条按导入顺序截断提示；`League Compare` 新增行级复选与 `Apply Selected Leagues/Clear Selection`，应用多选时自动关闭 `Focus: Latest League` 并按所选 league 过滤可见分组；补充前端测试覆盖导出触发下载、导入合并覆盖与多选筛选行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-11 多快照管理与一键清理**: Team Profile `Quick Preset` 升级为最多 5 个会话内命名快照（`Snapshot Name` + `Save/Load/Delete` + 下拉选择），同名保存覆盖并提示 `updated`，超限新增返回受控提示；新增 `Clear All Snapshots` 清空并反馈条数，清理后下拉重置且 `Load/Delete` 禁用；补充前端测试覆盖多快照按名加载、同名覆盖与清空禁用行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-10 对比区联动与快速预设备忘**: Team Profile 在 `League Compare` 新增 `Pin Top League` 一键将 compare 第一名同步到 `League Quick Filter`（无可用 top 时禁用），并新增会话内 `Quick Preset`（`Save Snapshot`/`Load Snapshot`）保存与恢复 `team_id/limit/league quick filter/sort/only-with-download/focus-latest-league`，加载时在存在有效 team_id 时自动刷新；补充前端测试覆盖 pin 联动与 snapshot 恢复链路 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-9 赛事对比概览与可见项复制分享**: Team Profile 新增 `League Compare`（基于当前结果聚合每个 league 的比赛数/平均时长/最近比赛时间，默认按比赛数降序展示 Top 5，点击行可快捷应用 `League Quick Filter`）与页面级 `Copy Visible Match IDs`（按当前排序复制可见 `match_id` 为逗号分隔，空可见项禁用，clipboard 不可用时受控提示）；补充前端测试覆盖 league compare 渲染/点击筛选与复制可见项行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-8 最近赛事固定视图与分组批量复合动作**: Team Profile 新增 `Focus: Latest League`（基于当前筛选结果自动锁定最近比赛所属 league，关闭后恢复原 `League Quick Filter`），并新增页面级 `Prepare + Open First Replay (Visible)`（逐条 prepare 当前可见项后自动打开按当前排序第一场，展示 `Total/Success/Failed` 与已打开场次；全失败时仍打开首场并提示）；补充前端测试覆盖聚焦开关与复合批量动作链路 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-7 分组批量跳转与可见项导出**: Team Profile 新增页面级 `Open Visible In Match Database`（可见项为空时轻提示不跳转，映射 `team_id` + 可选 `leagueid` + `has_download=true`）与 `Export Visible Matches (.txt)`（Blob 导出每行 `match_id\tstart_time\tleagueid`，空可见项禁用并反馈导出条数）；补充前端测试覆盖跳转上下文映射与导出/禁用分支 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-6 赛事预设视图与跨页回流**: Team Profile 新增 `Preset View`（`All Matches`/`With Download Status`/`Latest 20`）并自动应用筛选与 limit（`Latest 20` 强制最新优先）；App 层新增 Team Profile 会话态托管并打通 Team Profile -> Replay -> 返回后的上下文恢复（`team_id/limit/league quick filter/sort/only-with-download`）；补充前端测试覆盖预设切换与跨页回流 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-5 赛事分组快捷筛选与动作回流**: Team Profile 新增 `League Quick Filter`（来源于当前结果去重赛事，支持 `All`）并与排序/下载状态筛选/分组折叠兼容；新增页面级 `Prepare Visible Matches`（仅处理当前可见分组比赛，执行中禁用、空可见项禁用），完成后展示 `Total/Success/Failed` 汇总并刷新当前数据；补充前端测试覆盖快捷筛选与可见项批量 prepare 行为 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-4 赛事摘要统计与快速筛选跳转**: Team Profile 新增顶部 `Tournament Summary`（总比赛数/赛事数去重/最近比赛时间），赛事分组标题补充 `场次 + 平均时长`（复用时长格式化）；每组新增 `Open In Match Database` 并携带 `team_id + leagueid` 跳转到 Match Database 预置筛选（缺失 `leagueid` 时按钮禁用）；补充前端测试覆盖摘要渲染与跨页筛选上下文 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-3 赛事分组折叠与快速回放动作**: Team Profile 赛事分组新增默认展开的折叠/展开交互（组头展示展开状态、组内比赛数与最近比赛时间）；行级新增 `Prepare + Open Replay` 复合动作（先 `mode=prepare`，无论成功失败均继续进入 Replay 并提供轻量反馈）；补充前端测试覆盖分组折叠与复合动作成功/失败路径 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-2 赛事分组与列表可读性增强**: Team Profile 按 `leagueid` 分组展示（标题优先 `league_name`，缺失回退 `League {leagueid}`/`Unknown League`）并显示组内比赛数；新增 `Only show with download status`（基于可用字段筛选，缺字段时 graceful fallback）与 `Sort: Newest First/Oldest First`（默认降序）；复用 Match Database 时间/时长格式工具并补充分组/排序/下载状态筛选前端测试 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-5-TEAM-PROFILE-PAGE-SLICE-1 最小可用团队档案页**: 新增 Team Profile 页面与首页入口，接入 `GET /api/v1/admin/opendota/matches`（`team_id + limit`）渲染近期比赛列表并提供 `Open Replay`；行级 `Prepare Download` 复用 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare`）；补充前端最小测试覆盖 team_id 拉取渲染与回放跳转回调 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-7 批量失败清单导出/复制 + 筛选预设**: Match Database 新增 `Copy Failed Items` 与 `Export Failed Items (.txt)`（稳定格式每行 `match_id\tmessage`，无失败项禁用）；新增会话内筛选预设 `Preset Name/Save Preset/Preset/Apply`，可恢复 `team_id/leagueid/start_time_from/start_time_to/has_download` 并触发列表请求；补充前端测试覆盖 clipboard/export/preset restore | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-6 批量动作与任务详情联动优化**: 批量汇总新增 `withTaskId` 计数，批量完成后自动打开最后一个含 `task_id` 的任务详情并显示 `Opened from batch result.` 提示；批量执行中禁用行级动作并增加逻辑层重复批量触发 guard，`Refresh Current Page` 统一提示稍后自动刷新；补充前端测试覆盖自动打开提示与重复批量点击防护 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-5 当前页批量下载动作与结果汇总**: Match Database 操作区新增 `Batch Prepare (Current Page)` / `Batch Prepare + Execute (Current Page)`，按当前页可操作比赛逐条触发下载动作并在执行中禁用批量按钮；完成后展示 `Total/Success/Failed` 与失败样例摘要并刷新当前列表，补充批量触发与空列表禁用测试 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-4 列表体验优化与状态可读性**: Match Database 列表新增下载状态徽章、本地可读时间/时长格式、`Refresh Current Page` 按钮与动作后短暂行高亮反馈；Task Details 在终态显示“Final state”并保持自动刷新停止；补充前端测试并完成文档/harness 更新 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-3 任务详情与状态刷新体验**: Match Database 列表新增 `Task Details` 动作（仅 `download_task_id` 可用），详情面板接入 `GET /api/v1/admin/replays/download/tasks/{task_id}` 展示关键字段，支持手动刷新与 `pending/prepared/downloading` 每 4 秒轮询并在 `completed/failed` 自动停止；补充前端轮询测试与文档/harness 更新 | OpenCode (Frontend Specialist) |
| 2026-02-18 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-2 页面联动与上下文保留**: Match Database 新增 `Open Replay` 行动作并携带 `match_id/download_status/download_task_id` 跳转至 Replay Viewer；回放页新增来源提示；从回放返回 Match Database 可恢复会话内筛选与分页状态（含 `offset`）并补充前端测试覆盖 | OpenCode (Frontend Specialist) |
| 2026-02-17 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-FE-1 前端最小页面交付**: 新增 Match Database 页面与主页入口，接入 `GET /api/v1/admin/match-database`（筛选+分页）及 `POST /api/v1/admin/match-database/{match_id}/download`（prepare/prepare_and_execute），补充最小前端测试覆盖渲染与动作触发 | OpenCode (Frontend Specialist) |
| 2026-02-17 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-3 列表触发下载动作接口**: 新增 `POST /api/v1/admin/match-database/{match_id}/download`（`mode=prepare/prepare_and_execute`），复用 replay download service 并增加同 match `downloading` 受控阻止与 `prepare` 复用 latest `prepared` 轻量幂等；补齐路由/服务测试、API 文档与 harness 追踪更新 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-2 可展示名称与时间范围过滤**: 扩展 `GET /api/v1/admin/match-database` 支持 `start_time_from/start_time_to`（反向区间返回 422），聚合结果新增 `radiant_team_name/dire_team_name/league_name`（来自 `opendota_teams/opendota_leagues`），并补齐存储/路由测试与文档、harness 追踪更新 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-4-MATCH-DATABASE-PAGE-SLICE-1 后端聚合查询契约**: 新增 `GET /api/v1/admin/match-database` 与存储层聚合查询（OpenDota matches 左连接每场最新下载任务），支持 `team_id/leagueid/has_download` 过滤并返回过滤后 `total`；补齐存储/路由测试与 422 边界验证 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-3-REPLAY-DOWNLOAD-SYSTEM-SLICE-4 任务过滤与错误分类**: 下载任务列表新增 `status/match_id` 过滤并保证过滤后 `total`；下载失败链路新增 `error_code`（`INVALID_STATE/URL_MISSING/DOWNLOAD_TIMEOUT/HTTP_ERROR/NETWORK_ERROR/FILE_WRITE_ERROR/UNKNOWN_ERROR`）并写入任务；补齐存储/服务/路由测试与 422 非法状态边界 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-3-REPLAY-DOWNLOAD-SYSTEM-SLICE-3 任务可观测性与一键触发**: 新增单任务查询 `GET /api/v1/admin/replays/download/tasks/{task_id}`（不存在返回受控 payload）与一键触发 `POST /api/v1/admin/replays/download/by-match`（prepare 成功后自动 execute），并补齐详情/不存在/by-match 成功与 prepare 失败测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-3-REPLAY-DOWNLOAD-SYSTEM-SLICE-2 下载执行与重试最小闭环**: 扩展下载任务状态/尝试次数/落盘路径，新增 `execute_download` 流式下载与失败受控标记，新增 `POST /api/v1/admin/replays/download/execute`、`POST /api/v1/admin/replays/download/retry`，并补齐执行成功/失败/重试/非 prepared 边界测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-3-REPLAY-DOWNLOAD-SYSTEM-SLICE-1 下载任务准备链路**: 新增 `replay_download_tasks` 表与存储层，扩展 OpenDota match details + replay URL 组装，新增 `POST /api/v1/admin/replays/download/prepare` 与 `GET /api/v1/admin/replays/download/tasks`，完成成功/失败与列表测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-2-MATCH-DATA-MODEL-SLICE-2 参考维度数据**: 新增 `opendota_teams/opendota_leagues` 维表与幂等 upsert，扩展 OpenDota teams/leagues 拉取与 reference sync，新增 `POST /api/v1/admin/opendota/sync/reference`、`GET /api/v1/admin/opendota/teams`、`GET /api/v1/admin/opendota/leagues` 及对应测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-2-MATCH-DATA-MODEL-SLICE-1 查询过滤增强**: 在 `GET /api/v1/admin/opendota/matches` 增加 `team_id/leagueid/start_time_from/start_time_to` 可选过滤，存储层支持参数化条件查询与过滤后 total 统计，并补充 team/league+time/反向时间区间测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-1-OPENDOTA-SYNC-SLICE-3 查询端点**: 新增 `GET /api/v1/admin/opendota/matches`（分页+总数）及存储层分页查询方法，补充分页/422 参数边界测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: PH4-1-OPENDOTA-SYNC-SLICE-2 增量持久化**: 新增 SQLite `opendota_matches` 表与幂等 upsert，管理端 `persist=true` 返回 `inserted/updated` 统计，并补充端点/存储层测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: MCP 运行时依赖安装到项目本地**: `harness/` 安装 Playwright/filesystem MCP 包，并创建 `harness/.venv` 安装 git MCP server，示例配置改为本地可执行路径 | OpenCode |
| 2026-02-17 | **DONE: PH4-1-OPENDOTA-SYNC-SLICE-1 最小落地**: 新增 OpenDota async service + 管理端 dry-run 同步端点（仅连通性与拉取计数，不写库）并补充超时受控失败测试 | OpenCode (Backend Engineer) |
| 2026-02-17 | **DONE: 引入 long-running harness 基础设施**: 新增 `harness/`（feature list、session checklist、agent progress、init 脚本、MCP 示例配置、next task）用于增量开发流程落地 | OpenCode (Implementation Sub-agent) |
| 2026-02-16 | **DONE: 修复 Timeline hover 文案换行**: 优化悬停 tooltip 排版并增加 `whitespace-nowrap`，避免进度条尾端“进行中”被折行为两行 | OpenCode |
| 2026-02-16 | **DONE: Timeline 悬停预览与暂停区间可视化**: 时间轴新增 hover 时间 tooltip（含“暂停中/进行中”状态）并叠加暂停区间橙色标记，复用现有 gameClock pause 映射逻辑 | OpenCode |
| 2026-02-15 | **修复 matches 列表时长口径**: `GET /matches` 与 `GET /matches/{id}` 统一优先使用 Parquet metadata `duration_seconds`，缺失时回退 SQLite `duration`，未解析比赛保持兼容 | OpenCode |
| 2026-02-15 | **DONE: 全量文档更新并对齐当前实现状态**: 覆盖更新根文档、前后端/数据 README、API 规范、技术设计与 Replay 管理计划，修正文档实现状态与过时端点清单 | OpenCode |
| 2026-02-15 | **DONE: 修复 RealMatchViewer HUD 血条 hover 双提示**: 移除血条区域 `title` 原生 tooltip，并将英雄名称 tooltip 限定到头像容器以保留名称提示且不干扰自定义血量浮层 | OpenCode |
| 2026-02-15 | **DONE: RealMatchViewer HUD 血条交互增强**: 血条加粗并增加 hover 高亮/阴影效果，悬停显示实时血量数值（当前/最大），兼容阵亡态显示 | OpenCode |
| 2026-02-15 | **DONE: 回放 HUD 英雄头像下方新增实时血条**: 复用 tick `hp/max_hp` 数据在阵容栏渲染动态血量条，兼容桌面与移动端布局并保持现有视觉风格 | OpenCode |
| 2026-02-15 | **DONE: 修复小地图 antimage 头像加载**: 地图渲染增加英雄名紧凑匹配（忽略下划线差异），修复 `anti_mage`/`antimage` 映射失败并覆盖同类命名差异 | OpenCode |
| 2026-02-15 | **DONE: 比赛管理上传支持多文件**: ReplayUploader 扩展为文件选择与拖拽均可一次上传多个 `.dem`，并增加批量上传进度与错误汇总提示 | OpenCode |
| 2026-02-15 | **进一步缩小时轴偏差**: 回放页时间显示与复活倒计时改为基于相邻 tick 的 `game_time` 插值（而非仅依赖 source->offset 映射），降低终局关键事件约 2~3 秒漂移 | OpenCode |
| 2026-02-15 | **统一 HUD 计时基准并补全前端 pause 推断**: 回放页当前时钟与复活倒计时统一使用同一 `mapper` 基准；当后端未返回 `pause_intervals` 时由 `ticks.game_time` 冻结段自动推断暂停区间，修复“暂停显示有但时间轴/复活倒计时错位” | OpenCode |
| 2026-02-15 | **修复比赛详情时长来源**: `GET /matches/{id}` 优先读取 Parquet metadata `duration_seconds` 覆盖 SQLite 值，避免列表/详情显示旧时长 58:59 | OpenCode |
| 2026-02-15 | **增加前端暂停兜底显示**: RealMatchViewer 在相邻 tick `game_time` 持平时强制判定暂停并冻结显示，避免 pause_intervals 元数据异常时 UI 仍走表 | OpenCode |
| 2026-02-15 | **彻底收敛 matches 路径配置**: `replays/matches/visualization` 路由与 `ParquetStorage` 默认路径统一为 `data/matches`（并兼容历史 `backend/data/matches` 入参），确保“解析写入”和“回放读取”同目录 | OpenCode |
| 2026-02-15 | **修复 backend 路径漂移根因**: `playback`/`ParseService`/`main` 统一以 `backend/` 目录为基准解析 `data/*` 路径，避免从不同 cwd 启动导致读写到错误目录（如 `backend/backend/data`） | OpenCode |
| 2026-02-15 | **修复比赛时长口径**: 解析器新增终场锚点（`game_state` 转换/`winner` 首次确定）并将 `duration_seconds` 对齐有效比赛时长，剔除暂停与赛后尾段 | OpenCode |
| 2026-02-15 | **修复前端 pause_intervals 键兼容**: `gameClock` 兼容后端字段 `replay_start_time/replay_end_time`（此前仅识别 `start_replay_time/end_replay_time` 导致暂停区间失效） | OpenCode |
| 2026-02-15 | **修复 parser 暂停时钟冻结与区间输出**: `SimpleDemoParser` 以 Gamerules 暂停状态冻结 `game_time`，并在 metadata 输出 `pause_intervals`（replay_start/end/duration/game_time）供后端与前端透传消费 | OpenCode |
| 2026-02-15 | **恢复标准开局锚点显示**: 对异常早于 -95s 的 `game_time` 自动做 -1:30 归一化显示（仅显示口径），修复 8676017978/8689397081/8674716612 的 +17/+26/+10 秒偏移 | OpenCode |
| 2026-02-15 | **修复 RP2-7 时间偏移回归**: `gameClock` 在存在样本 `game_time` 时优先使用样本推导 offset（不被 `time_basis.offset_seconds` 覆盖），修正多场比赛慢 10~26 秒问题 | OpenCode |
| 2026-02-14 | **RP2-7 前端冻结显示落地**: 回放推进统一基于 `replay_time`，game clock 在 pause 区间冻结并显示“暂停中”；补充 `gameClock` 单测覆盖 pause/非 pause 映射 | OpenCode |
| 2026-02-14 | **RP2-7 后端链路增强**: playback 返回 `pause_intervals`（含 `time_basis` 内冗余）、Parquet metadata 持久化 pause 区间并补充回归测试（无暂停/有暂停/过滤稳定） | OpenCode |
| 2026-02-14 | **启动 RP2-7**: 制定 pause-aware 双时基方案并分派前后端子智能体并行实现（解析/透传/前端冻结显示） | OpenCode (Orchestrator) |
| 2026-02-14 | **新增 HUD 阵亡态与复活倒计时**: 英雄阵亡时头像灰度化显示，并在头像上方展示按游戏时钟计算的复活秒数，复活后自动恢复彩色 | OpenCode |
| 2026-02-14 | **修正 HUD/地图左偏对齐**: 容器宽度精确收敛到 900 并为 MapViewer 增加 `justify-center` 包裹，确保地图相对 HUD 真正水平居中 | OpenCode |
| 2026-02-14 | **调整 HUD 与地图居中关系**: 为阵容条与地图增加同一 `max-width` 容器并统一水平居中，保证地图相对上方 HUD 视觉居中 | OpenCode |
| 2026-02-14 | **去除 HUD 阵容条横向滚动**: 阵容条改为自适应 5 列网格并略缩头像卡片间距，确保无需滑动即可看到双方全部头像 | OpenCode |
| 2026-02-14 | **优化 RealMatchViewer 阵容条视觉**: 头像改为 16:9 卡片 + `object-contain` 完整显示，移动端/桌面 5v5 稳定布局，中间时间改为徽章式精致样式 | OpenCode |
| 2026-02-14 | **RealMatchViewer 顶部阵容条**: 新增天辉/夜魇 5 英雄大头像 + 中间当前游戏时间；Timeline 支持隐藏时间显示并在回放页关闭“当前/总时长” | OpenCode |
| 2026-02-14 | **时间口径定稿**: 回放查看器统一采用“标准(-1:30起点)”显示口径，移除“原始解析时间”切换；后端保留原始 `game_time` 不做整体平移 | OpenCode |
| 2026-02-14 | **后端下沉时间轴校正策略**: playback `time_basis` 新增 `offset_seconds/clock_zero_source`，并统一 `ticks/wards` 偏移计算优先级（metadata -> 样本推导 -> fallback） | OpenCode |
| 2026-02-14 | **修复 replay match_id 与 pause-aware game_time**: `SimpleDemoParser` 元数据改为优先 `fileInfo.match_id`（保留 gamerules 值用于调试），采样时优先 `m_fGameTime - m_flGameStartTime` 并统一 positions/wards 时基；重建 shadowJar 并重解析 8674716612/8676017978 验证通过 | OpenCode |
| 2026-02-14 | **修复早期样本时间回填**: `SimpleDemoParser` 在首次读到 `m_flGameStartTime` 后回填已采样 `positions/wards` 的 `game_time`，避免前段正时间与后段负时间混用；重建 shadowJar 并复验 84782020/86083386 首段为负且递增 | OpenCode |
| 2026-02-14 | **二次校准时间轴偏移**: 修复 parser 的 64 位 match_id 保留并切换前端预游戏归一化（将异常早于 -95s 的起始样本校正到 -90s 附近），缓解不同录像的 +10s/+20s 显示偏移 | OpenCode |
| 2026-02-14 | **修复解析器 game_time 采样基准**: `SimpleDemoParser` 改为优先 `tick/30 - m_flGameStartTime`（不依赖 `m_fGameTime` 连续更新），并重建 shadowJar + 重解析 84782020/86083386 验证负时间与递增样本 | OpenCode |
| 2026-02-14 | **前端第一阶段落地**: playback `time_basis` 类型对齐 + RealMatchViewer 基于 `game_time`/`time_basis` 映射 + 回退模式 badge 与状态面板可观测性 | OpenCode |
| 2026-02-14 | **阶段重构(选项2)-Phase1 启动**: 解析器新增时间契约字段(`time_contract_version`,`game_start_time`)，playback 顶层新增 `time_basis`，并重新解析 84782020/86083386 验证 `game_time` 含负值 | OpenCode |
| 2026-02-14 | **ReplayUploader 清空交互增加二次确认**: 首次点击进入确认态，二次点击才执行清空，并提供取消按钮 | OpenCode |
| 2026-02-14 | **前端时间轴映射策略增强**: 优先使用 `game_time`，缺失时回退为“首个 source 时间=-1:30”锚点，保持 Timeline 与事件过滤一致 | OpenCode |
| 2026-02-14 | **修复回放时间轴基准**: 统一 game clock 映射（支持负时间显示、0:00 对齐、Timeline/拖动/播放/事件过滤一致） | OpenCode |
| 2026-02-12 | **更新项目阶段到 Phase 4**: 纳入比赛数据库、OpenDota 同步、录像下载与实时 HUD/优势曲线需求 | OpenCode |
| 2026-02-11 | **微调眼位辉光质感**: 改为单层模糊光晕，移除明显分层效果 | OpenCode |
| 2026-02-11 | **优化眼位可视性**: 增加小地图暗化遮罩与眼位柔和辉光，提升红绿图标在复杂背景下辨识度 | OpenCode |
| 2026-02-11 | **按指定形状替换眼位图标**: 新增 observer/sentry SVG 资源并接入渲染管线 | OpenCode |
| 2026-02-11 | **修复眼位图标不显示**: 将 SVG 内图片引用改为嵌入式 data URL，避免相对路径在 data URI 中失效 | OpenCode |
| 2026-02-11 | **修正眼位图标形状一致性**: SVG 改为封装原始 ward 图标并做阵营着色，保持原始外形不变 | OpenCode |
| 2026-02-11 | **重构眼位图标渲染**: 移除 observer/sentry 图片依赖，改为内联 SVG 纹理并按阵营着色（天辉绿/夜魇红） | OpenCode |
| 2026-02-11 | **修复小地图对齐偏移**: 统一边界/内容区域配置并在映射中加入边界夹取，提升边缘点对齐稳定性 | OpenCode |
| 2026-02-11 | **重构地图坐标映射模块**: 抽离 mapCoordinateMapper 纯函数并统一英雄/眼位/校准标记坐标入口 | OpenCode |
| 2026-02-11 | **修复英雄名称中文映射**: 增强 getHeroByName 兼容多格式名称匹配 | OpenCode |
| 2026-02-11 | **修复 Timeline 时间同步问题**: 拖动/播放共享时间源，避免回跳 | OpenCode |
| 2026-02-11 | **测试验证通过**: 所有搜索功能（Match/Hero/Player）正常工作 | AI Assistant (Antigravity) |
| 2026-02-11 | **修复 Hero ID 映射**: 创建 hero_mapping.py 模块，修复所有英雄 ID 数据 | AI Assistant (Antigravity) |
| 2026-02-11 | **完成录像管理系统**: MatchListPage + ReplayUploader + API 搜索功能完整实现 | AI Assistant (Antigravity) |
| 2026-02-07 | **创建分析工具**: backend/poc/analyze_coordinates.py, optimize_bounds.py 用于坐标校准 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **更新 DOTA_MAP_BOUNDS**: 基于实测数据重新计算边界 minX=7558 maxX=25353 minY=7502 maxY=25269 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **泉水位置校准**: 天辉(9550,9950)屏幕11.2%/86.2%, 夜魇(23450,22750)屏幕89.3%/14.2% | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **实测坐标范围**: X: 7901~25011, Y: 7844~24928 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **坐标边界数据分析**: 分析 2 场录像的 72,480 个位置样本，验证坐标范围 | AI Assistant (Claude Opus 4.5) |
| 2026-02-06 | **禁用静态地图元素**: 建筑/Roshan等应从录像数据动态获取，暂时禁用静态渲染 | AI Assistant (Claude) |
| 2026-02-06 | **校准数据**: Radiant泉水(9504,9964), Dire泉水(23462,22749) -> bounds(7951~25226, 8468~24141) | AI Assistant (Claude) |
| 2026-02-06 | **精确坐标校准**: 使用泉水位置作为校准点，计算精确的游戏坐标边界 | AI Assistant (Claude) |
| 2026-02-06 | **基于录像数据校准**: 使用眼位数据推断 Roshan、神符等元素的实际游戏坐标 | AI Assistant (Claude) |
| 2026-02-06 | **更新坐标转换**: gameToScreen() 方法考虑 minimap 图片透明边框偏移 | AI Assistant (Claude) |
| 2026-02-06 | **修复 minimap 边框问题**: 分析图片发现 6% 透明边框，添加 MINIMAP_IMAGE_CONFIG 配置 | AI Assistant (Claude) |
| 2026-02-06 | **添加校准标记功能**: showCalibrationMarkers 选项用于调试坐标对齐 | AI Assistant (Claude) |
| 2026-02-06 | **实现地图元素渲染**: DotaMapRenderer.drawMapElements() 绘制建筑、Roshan、神符、传送门等 | AI Assistant (Claude) |
| 2026-02-06 | **创建地图元素数据**: mapElements.ts 包含 40+ 静态元素位置 (塔、兵营、Roshan、神符等) | AI Assistant (Claude) |
| 2026-02-06 | **坐标系校准**: 更新 DOTA_MAP_BOUNDS 为理论边界 (8192~24576)，与 minimap 图片精确对齐 | AI Assistant (Claude) |
| 2026-02-06 | **眼位显示规则**: Radiant=绿色边框, Dire=红色边框, Observer/Sentry 使用对应小地图图标 | AI Assistant (Claude) |
| 2026-02-06 | **完成眼位图标集成**: 实现 preloadWardTextures() + createWardContainer() 使用 Liquipedia 眼位图标 | AI Assistant (Claude) |
| 2026-02-06 | **英雄名称智能匹配**: 支持多种格式 (驼峰/下划线/无下划线)，解决 Clarity 返回名称不一致问题 | AI Assistant (Claude) |
| 2026-02-06 | **添加眼位图标**: 从 Steam CDN 下载假眼/真眼图标，带队伍颜色边框 | AI Assistant (Claude) |
| 2026-02-06 | **添加 minimap 背景**: 从 OpenDota 下载真实 minimap 图片替换网格背景 | AI Assistant (Claude) |
| 2026-02-06 | **修复真假眼映射**: Observer Ward = 假眼(黄色), Sentry Ward = 真眼(蓝色) | AI Assistant (Claude) |
| 2026-02-06 | **资源位置**: `frontend/public/assets/dota/heroes/` (头像) + `icons/` (minimap图标) | AI Assistant (Claude) |
| 2026-02-06 | **更新 DotaMapRenderer**: 支持英雄图标显示，带队伍颜色边框 | AI Assistant (Claude) |
| 2026-02-06 | **下载英雄图标**: 从 Steam CDN 下载 127 个英雄头像和 minimap 图标 | AI Assistant (Claude) |
| 2026-02-06 | **集成 Dota 2 资源本地化**: 创建英雄数据配置 (heroes.ts) 含 127 个英雄中文名 | AI Assistant (Claude) |
| 2026-02-06 | **路径性能测试**: 单英雄 97ms, 时间范围 135ms, 简化率 73.5% | AI Assistant (Claude) |
| 2026-02-06 | **实现路径 API**: PathAnalyzer + Douglas-Peucker 算法，支持路径简化和分段 | AI Assistant (Claude) |
| 2026-02-05 | **热力图性能测试通过**: 64x64 网格 43ms, 128x128 网格 100ms, 远低于 500ms 目标 | AI Assistant (Claude) |
| 2026-02-05 | **实现热力图 API**: HeatmapAnalyzer + visualization.py 完整实现，支持 movement/kill/death 类型 | AI Assistant (Claude) |
| 2026-02-05 | **修复英雄阵亡显示问题**: RealMatchViewer 添加 hp>0 过滤，阵亡英雄不再显示在地图上 | AI Assistant (Claude) |
| 2026-02-05 | **验证通过**: 每个英雄只有 1 个 handle，位置样本从 53,882 优化到 36,310 | AI Assistant (Claude) |
| 2026-02-05 | **修复幻象问题**: SimpleDemoParser 添加 firstHeroHandle 过滤机制 | AI Assistant (Claude) |
| 2026-02-05 | **修复坐标边界**: 实测坐标范围 X:7974~24992 Y:7844~24852，扩大边界至 7500~25500 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **双层插值**: 数据层(tick间插值) + 渲染层(LERP平滑)，Timeline回调频率提升至20fps | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **实现平滑动画**: 英雄移动从闪现变为丝滑过渡 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **优化**: 内部时间状态分离、降低回调频率(60fps→1fps)、一次性加载数据、二分查找 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复 Timeline 性能问题**: 解决拖动进度条导致频繁 API 请求和卡顿 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **功能**: 播放/暂停、进度拖动、速度控制(0.5x-8x)、快捷键支持 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **MVP-2 完成**: Timeline 时间轴组件实现 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **优化眼位过滤**: 根据时间范围过滤存活眼位 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复 PixiJS 8 渲染**: Graphics 正确添加到容器 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复坐标系**: DOTA_MAP_BOUNDS 调整为 8000-24000 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **MVP-7 完成**: RealMatchViewer 前后端数据集成 | AI Assistant (Claude - Frontend) |
| 2026-02-05 04:15 | **修复 wards API**: 处理 NaN 值问题 | AI Assistant (Claude - Backend) |
| 2026-02-05 04:10 | **API 测试通过**: /matches, /playback/ticks, /playback/events, /playback/heroes 全部正常 | AI Assistant (Claude - Backend) |
| 2026-02-05 04:00 | **MVP-8 完成**: 解析 2 场测试录像 (84782020, 86083386) | AI Assistant (Claude - Backend) |
| 2026-02-04 22:20 | **存储测试通过**: Parquet 存储 788KB/match, SQLite 元数据工作正常 | AI Assistant (Claude - Backend) |
| 2026-02-04 22:15 | **MVP-6 完成**: 完整实现 /playback API (ticks, events, wards, heroes) | AI Assistant (Claude - Backend) |
| 2026-02-04 22:00 | **MVP-5 完成**: 完整实现 /matches API (list, detail, players, draft) | AI Assistant (Claude - Backend) |
| 2026-02-04 21:45 | **MVP-4 完成**: 完整实现 /replays API (parse, tasks, upload) | AI Assistant (Claude - Backend) |
| 2026-02-04 21:30 | **MVP-3 完成**: Parquet 存储实现 (storage/parquet_storage.py) | AI Assistant (Claude - Backend) |
| 2026-02-04 21:15 | **MVP-1 完成**: DotaMapRenderer + MapViewer + MapTestPage 完成 | AI Assistant (Claude - Frontend) |
| 2026-02-04 21:00 | **MVP-1 开始**: 创建 Dota 2 地图渲染引擎 | AI Assistant (Claude - Frontend) |
| 2026-02-04 20:30 | **测试通过**: Python 包装器成功解析录像，提取 53K 位置样本 | AI Assistant (Claude) |
| 2026-02-04 20:15 | **PARSER-3 完成**: 创建 Python 包装器 (clarity_parser.py) | AI Assistant (Claude) |
| 2026-02-04 20:00 | **PARSER-4 完成**: 扩展 SimpleDemoParser.java 提取完整数据 | AI Assistant (Claude) |
| 2026-02-04 18:40 | 更新 Python 测试脚本 | AI Assistant (Claude) |
| 2026-02-04 18:35 | **解析器性能测试通过** (796ms/760ms) | AI Assistant (Claude) |
| 2026-02-04 18:30 | **构建 Clarity Uber JAR (17MB)** | AI Assistant (Claude) |
| 2026-02-04 | 启动前端 (5173) 和后端 (8000) 服务 | AI Assistant (Claude) |
| 2026-02-04 | 构建 Clarity 解析器 (JDK 17) | AI Assistant (Claude) |
| 2026-02-04 | 安装前后端依赖 | AI Assistant (Claude) |
| 2026-02-04 | **执行 POC 测试 - 全部通过** | AI Assistant (Claude) |
| 2026-02-04 | 添加 API Stub 实现 | AI Assistant (Claude) |
| 2026-02-04 | 创建 POC 测试脚本和组件 | AI Assistant (Claude) |
| 2026-02-04 | 完成前后端项目初始化 | AI Assistant (Claude) |
| 2026-02-04 | 创建 PROGRESS.md 文件 | AI Assistant |

---

## 已验证的测试数据

### 已解析的比赛
| Match ID | 文件 | 时长 | 胜方 | 位置样本 | 击杀 | 眼位 | 备注 |
|----------|------|------|------|---------|------|------|------|
| 84782020 | 8674716612.dem | 62:29 | Dire | **36,310** | 52 | 284 | 幻象已过滤 ✅ |
| 86083386 | 8676017978.dem | 62:08 | Dire | **36,170** | 55 | 214 | 时间契约(v1)已验证 ✅ |

### API 测试验证
| 端点 | 状态 | 示例请求 |
|------|------|----------|
| `/api/v1/matches` | ✅ 正常 | 返回 2 场比赛 |
| `/api/v1/playback/{id}/ticks` | ✅ 正常 | `?start_time=120&end_time=125` 返回 6 个 tick |
| `/api/v1/playback/{id}/events` | ✅ 正常 | 返回 52 个击杀事件 |
| `/api/v1/playback/{id}/heroes` | ✅ 正常 | 返回 10 个英雄 (5 Radiant + 5 Dire) |
| `/api/v1/playback/{id}/wards` | ✅ 已修复 | 需重启服务器生效 |

---

## 下一步计划 (Phase 3 -> Phase 4)

### 执行说明（2026-02-12 起）
- 本节已升级为 Phase 4 主执行看板。
- 若与下方历史任务表存在重复或冲突，以 `Phase 4 里程碑拆分` 和 `PH4-*` 任务为准。
- 历史规划保留用于回溯决策，不作为当前排期唯一依据。

### Phase 4 新增需求（2026-02-12）✅ 已纳入规划

#### 需求 A：Replay 管理系统升级
1. 建立完整比赛数据库，支持查询近期比赛。
2. 支持按战队/赛事归类（例如 XG 参加某杯赛的场次与逐场数据）。
3. 通过 OpenDota API 拉取赛事和比赛数据并入库。
4. 支持按比赛 ID 直接下载录像。
5. 支持从查询结果一键下载录像并跟踪下载状态。

#### 需求 B：回放实时信息增强
1. 回放实时显示英雄装备、等级、击杀、GPM/XPM、净资产。
2. 显示团队总经济、经济差（Gold Advantage）、经验差（XP Advantage）。
3. 显示实时经济差/经验差曲线图，并与 Timeline 联动。

### Phase 4 里程碑拆分（建议执行顺序）

| 里程碑 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| M1 | 数据模型 + OpenDota 同步 API | `TODO` | teams/tournaments/matches_ext + 同步任务 |
| M2 | 录像下载任务系统 | `TODO` | by match_id 下载 + 任务状态/重试 |
| M3 | 前端比赛数据库与战队档案页 | `TODO` | 查询、筛选、分页、跳转回放 |
| M4 | 回放 HUD + 优势曲线 | `TODO` | 实时指标 + Gold/XP 曲线 |

### Phase 4 任务看板（Canonical）

| ID | 优先级 | 任务 | 负责方 | 状态 | 依赖 | 目标产出 |
|----|--------|------|--------|------|------|----------|
| PH4-1 | P0 | OpenDota 数据同步（近期/战队/赛事） | Backend | `TODO` | 无 | 可增量同步的基础数据 |
| PH4-2 | P0 | 比赛数据库扩展模型（Team/Tournament/Match） | Backend | `TODO` | PH4-1 | 可按战队/赛事/时间查询 |
| PH4-3 | P0 | 录像下载系统（按 match_id + 查询结果） | Backend | `TODO` | PH4-2 | 下载任务、状态、重试 |
| PH4-4 | P1 | 前端比赛数据库页面 | Frontend | `TODO` | PH4-1/2 | 查询、筛选、分页、跳转 |
| PH4-5 | P1 | 战队归档页（XG/赛事维度） | Frontend | `TODO` | PH4-2/4 | 战队场次与逐场数据展示 |
| PH4-6 | P1 | 回放实时 HUD（等级/装备/KDA/GPM/XPM/净资产） | Both | `TODO` | PH4-2 | 时间点实时数据面板 |
| PH4-7 | P1 | Gold/XP Advantage 曲线 | Both | `TODO` | PH4-6 | 与 Timeline 联动的曲线图 |

### Phase 3 遗留任务（并入 Phase 4）

| 优先级 | 任务 | 状态 | 备注 |
|--------|------|------|------|
| P1 | 前端热力图可视化组件 | `TODO` | 后端 Heatmap API 已完成 |
| P1 | 前端路径轨迹组件 | `TODO` | 后端 Path API 已完成 |
| P1 | 地图击杀事件标记 | `TODO` | 与 Timeline 同步显示 |
| P2 | 眼位聚类分析 (AI) | `TODO` | 依赖 ward 数据完善 |
| P2 | 异步解析队列 (PARSER-5) | `TODO` | 后端并发下载/解析能力 |

### 历史任务快照（Phase 3 末，保留原文）
| 优先级 | 任务 | 预计时间 | 依赖 | 负责方 |
|--------|------|----------|------|--------|
| ~~P0~~ | ~~前端连接 playback API，渲染真实数据~~ | ~~1 天~~ | ~~后端 API ✅~~ | ~~Frontend~~ | ✅ DONE |
| ~~P0~~ | ~~实现时间轴控件 (Timeline)~~ | ~~2-3 天~~ | ~~RealMatchViewer ✅~~ | ~~Frontend~~ | ✅ DONE |
| ~~P1~~ | ~~实现单场热力图 API~~ | ~~1 天~~ | ~~position数据 ✅~~ | ~~Backend~~ | ✅ DONE |
| ~~P1~~ | ~~移动轨迹分析 / 路径 API~~ | ~~2-3 天~~ | ~~position数据 ✅~~ | ~~Backend~~ | ✅ DONE |
| ~~P0~~ | ~~[后端] 扩展比赛列表搜索接口~~ | ~~1 天~~ | ~~Existing API~~ | ~~Backend~~ | ✅ DONE |
| ~~P0~~ | ~~[前端] 录像管理/上传/列表页面~~ | ~~3 天~~ | ~~Search API~~ | ~~Frontend~~ | ✅ DONE |
| | - API Client (matchService.ts) | - | - | Frontend | ✅ DONE |
| | - Match List Page (列表 & 搜索) | - | - | Frontend | ✅ DONE |
| | - Replay Uploader (上传 & 监控) | - | - | Frontend | ✅ DONE |
| | - **Hero ID 数据修复 (映射模块)** | - | - | Backend | ✅ DONE |
| P1 | 前端热力图可视化组件 | 1 天 | 热力图 API ✅ | Frontend |
| P1 | 前端路径轨迹组件 | 1 天 | 路径 API ✅ | Frontend |
| ~~P1~~ | ~~加载真实 minimap 图片~~ | ~~0.5 天~~ | ~~地图引擎 ✅~~ | ~~Frontend~~ | ✅ DONE |
| P2 | 眼位聚类分析 (AI) | 3-5 天 | ward数据 ✅ | Backend |

### 历史规划：录像管理系统实施规划 (Replay System Roadmap) 🚀
此规划旨在实现完整的录像上传、管理、搜索功能。

#### 阶段一：后端搜索能力增强 (Backend Search)
1.  **扩展存储层 (`storage/match_storage.py`)**:
    *   更新 `list_matches` 方法，支持 `hero_id`, `account_id` (选手), `team_id` (队伍) 过滤参数。
    *   优化 `player_matches` 表的联表查询。
2.  **更新路由层 (`routers/matches.py`)**:
    *   `/api/v1/matches` 增加查询参数 (`hero_id`, `player_id`, `team_id`)。
    *   确保搜索参数能正确传递给存储层。

#### 阶段二：前端管理界面 (Frontend Replay Manager)
1.  **API 客户端封装 (`api/matchService.ts`)**:
    *   封装 `uploadReplay`, `getMatchList` (带搜索参数), `deleteMatch`, `getParseTasks`。
2.  **录像列表页 (`MatchListPage`)**:
    *   **数据表格**: 展示 Match ID, 获胜方, 持续时间, 录像时间, 解析状态。
    *   **操作栏**: "观看比赛" (跳转 Viewer), "删除录像" (带确认弹窗)。
    *   **搜索/过滤栏**: 支持按 `Match ID`, `Player ID`, `Hero` 筛选比赛。
3.  **上传与任务监控 (`ReplayUploader`)**:
    *   **拖拽上传区**: 支持 `.dem` 文件拖拽上传。
    *   **任务状态面板**: 轮询 `/tasks` 接口，实时显示解析进度条和状态 (Pending -> Parsing -> Done)。

### 历史成果：已完成的前后端集成 ✅
- RealMatchViewer 页面可显示真实录像数据
- 英雄位置实时渲染（绿色 Radiant / 红色 Dire）
- 眼位渲染（Observer 圆形黄心 / Sentry 菱形蓝心）
- 时间范围选择器（可调整查看不同时间点）
- 眼位智能过滤（只显示当前时间存活的眼位）
- **Timeline 时间轴组件** ✅ NEW
  - 播放/暂停控制
  - 进度条拖动跳转
  - 速度控制 (0.5x, 1x, 2x, 4x, 8x)
  - 快捷键支持 (空格、方向键、Home/End)
  - **性能优化**: 内部时间状态分离，避免频繁 API 请求
  - **数据加载**: 一次性加载整场比赛数据，播放时纯本地计算
- **平滑动画系统** ✅ NEW
  - 数据层插值: 在两个采样点之间计算精确中间位置
  - 渲染层插值: PixiJS ticker 使用 LERP 实现 60fps 平滑过渡
  - Timeline 回调频率: 50ms/次 (约 20fps)

### 历史前端下一步（已部分并入 Phase 4）
1. ~~实现时间轴控件（播放/暂停/拖动）~~ ✅ 已完成
2. ~~英雄图标显示~~ ✅ 已完成 (127 个英雄图标 + 队伍颜色边框)
3. ~~加载真实 Dota 2 minimap 图片~~ ✅ 已完成 (从 OpenDota 获取)
4. ~~眼位图标显示~~ ✅ 已完成 (假眼/真眼图标 + 队伍颜色边框)
5. 添加英雄移动轨迹线 (使用 PathAnalyzer API)
6. 实现击杀事件在地图上显示
7. 热力图可视化组件
8. 路径轨迹可视化组件

---

## 文件结构参考

```
dota2-ai-pro/
├── backend/                      FastAPI 后端
│   ├── main.py                   入口 (CORS + 路由注册 + 同步调度)
│   ├── routers/                  API 路由层
│   │   ├── admin.py              管理端 (OpenDota 同步/下载/比赛数据库)
│   │   ├── health.py             健康检查
│   │   ├── library.py            本地已解析录像库
│   │   ├── matches.py            比赛元数据
│   │   ├── playback.py           回放数据 (ticks/events/wards/heroes/hud/advantage)
│   │   ├── remote.py             远端比赛 (OpenDota Live)
│   │   ├── replays.py            录像管理 (上传/解析/任务)
│   │   └── visualization.py      可视化 (热力图/路径)
│   ├── services/                 业务服务层
│   │   ├── opendota_service.py   OpenDota API 客户端
│   │   ├── opendota_sync_service.py 同步调度 (60s)
│   │   ├── parse_service.py      解析服务
│   │   └── replay_download_service.py 录像下载
│   ├── storage/                  数据存储层
│   │   ├── library_storage.py    本地已解析库
│   │   ├── match_database_storage.py 比赛数据库聚合
│   │   ├── match_storage.py      比赛元数据
│   │   ├── opendota_match_storage.py OpenDota 比赛索引
│   │   ├── opendota_reference_storage.py 战队/联赛参考
│   │   ├── parquet_storage.py    Parquet 文件读写
│   │   └── replay_download_storage.py 下载任务状态
│   ├── database/sqlite_db.py     SQLite 管理
│   ├── parsers/                  Java 解析器包装
│   │   ├── clarity_parser.py     ClarityParser 类
│   │   └── models.py             解析数据模型
│   ├── analyzers/                分析器
│   │   ├── heatmap_analyzer.py   热力图
│   │   └── path_analyzer.py      路径简化
│   ├── tests/                    pytest 测试 (156 项)
│   ├── poc/                      POC 性能测试脚本
│   └── data/                     运行时数据
│       ├── matches/{match_id}/   解析产物
│       │   ├── positions.parquet 英雄位置
│       │   ├── kills.parquet     击杀事件 (含 assist_players)
│       │   ├── wards.parquet     真假眼事件
│       │   ├── economy.parquet   经济时间线
│       │   └── meta.json         比赛元数据
│       ├── replays/              .dem 录像文件
│       ├── poc_test/             POC 测试输出
│       └── truesight.db          SQLite 元数据库
├── frontend/                     Electron + React 前端
│   ├── public/assets/dota/       Dota 2 游戏资源
│   │   ├── heroes/               英雄头像 (127 PNG)
│   │   ├── heroes/icons/         Minimap 图标 (127 PNG)
│   │   ├── minimap/              小地图背景
│   │   └── wards/                真假眼图标
│   └── src/renderer/
│       ├── api/backend.ts        后端 API 客户端
│       ├── components/
│       │   ├── charts/AdvantageChart.tsx 经济/经验曲线
│       │   ├── map/DotaMapRenderer.ts   PixiJS 渲染引擎
│       │   ├── map/MapViewer.tsx        React 地图包装
│       │   ├── timeline/Timeline.tsx    播放控制
│       │   └── ReplayUploader.tsx       录像上传
│       ├── data/                     静态数据 (heroes.ts/mapElements.ts)
│       ├── pages/                    6 个核心页面 + 2 个测试页
│       ├── store/                    Zustand 状态管理
│       ├── hooks/                    React Hooks
│       ├── types/                    TypeScript 类型
│       ├── utils/                    工具函数
│       └── App.tsx                   主应用 (HashRouter)
├── parsers/                      Java 解析器 (Clarity)
│   ├── src/main/java/            SimpleDemoParser.java
│   ├── build/libs/               clarity-parser-1.0.0-uber.jar
│   ├── clarity/                  Clarity 库源码
│   ├── jdk17/                    OpenJDK 17
│   └── build.gradle.kts          Gradle 构建配置
├── docs/                         文档
│   ├── api_specification.md      API 契约
│   ├── technical_design.md       技术设计
│   └── PRD.md                    产品需求
└── harness/                      开发流程基础设施
```
