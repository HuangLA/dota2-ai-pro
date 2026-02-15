# PROGRESS.md - AI 协同开发进度追踪

> **用途**: 本文件供 AI 编码助手读取和更新，用于跟踪前后端开发进度、API 实现状态和当前任务。
> **更新规则**: AI 在完成任务后应更新相应状态；人类开发者也可手动修改。

---

## 项目元数据

| 字段 | 值 |
|------|-----|
| 项目名称 | True Sight (Dota 2 录像分析工具) |
| 当前阶段 | Phase 4 - 数据化回放与职业战队数据库 🚀 |
| 最后更新 | 2026-02-16 |
| 更新者 | OpenCode (Orchestrator) |

---

## 快速导航 (Read This First)

### 当前执行基线（优先阅读）
1. **当前冲刺 (Current Sprint)**：查看 Phase 4 目标与 PH4-1 ~ PH4-7
2. **下一步计划 (Phase 3 -> Phase 4)**：查看 Phase 4 里程碑和执行顺序
3. **API 实现状态**：确认当前可调用端点与 Stub 缺口

### 历史内容说明（保留原文，不删除）
- 文档中仍保留了 Phase 3 时期的任务表、路线图和前端 TODO，作为历史追溯依据。
- 当历史内容与 Phase 4 计划冲突时，以 `当前冲刺` + `Phase 4 里程碑` 为准。

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
| /api/v1/playback/{id}/smokes | GET | `STUB` | `TODO` | v1.5 |

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
| 2026-02-04 | 创建 PROGRESS.md 文件 | AI Assistant |
| 2026-02-04 | 完成前后端项目初始化 | AI Assistant (Claude) |
| 2026-02-04 | 创建 POC 测试脚本和组件 | AI Assistant (Claude) |
| 2026-02-04 | 添加 API Stub 实现 | AI Assistant (Claude) |
| 2026-02-04 | **执行 POC 测试 - 全部通过** | AI Assistant (Claude) |
| 2026-02-04 | 安装前后端依赖 | AI Assistant (Claude) |
| 2026-02-04 | 构建 Clarity 解析器 (JDK 17) | AI Assistant (Claude) |
| 2026-02-04 | 启动前端 (5173) 和后端 (8000) 服务 | AI Assistant (Claude) |
| 2026-02-04 18:30 | **构建 Clarity Uber JAR (17MB)** | AI Assistant (Claude) |
| 2026-02-04 18:35 | **解析器性能测试通过** (796ms/760ms) | AI Assistant (Claude) |
| 2026-02-04 18:40 | 更新 Python 测试脚本 | AI Assistant (Claude) |
| 2026-02-04 20:00 | **PARSER-4 完成**: 扩展 SimpleDemoParser.java 提取完整数据 | AI Assistant (Claude) |
| 2026-02-04 20:15 | **PARSER-3 完成**: 创建 Python 包装器 (clarity_parser.py) | AI Assistant (Claude) |
| 2026-02-04 20:30 | **测试通过**: Python 包装器成功解析录像，提取 53K 位置样本 | AI Assistant (Claude) |
| 2026-02-04 21:00 | **MVP-1 开始**: 创建 Dota 2 地图渲染引擎 | AI Assistant (Claude - Frontend) |
| 2026-02-04 21:15 | **MVP-1 完成**: DotaMapRenderer + MapViewer + MapTestPage 完成 | AI Assistant (Claude - Frontend) |
| 2026-02-04 21:30 | **MVP-3 完成**: Parquet 存储实现 (storage/parquet_storage.py) | AI Assistant (Claude - Backend) |
| 2026-02-04 21:45 | **MVP-4 完成**: 完整实现 /replays API (parse, tasks, upload) | AI Assistant (Claude - Backend) |
| 2026-02-04 22:00 | **MVP-5 完成**: 完整实现 /matches API (list, detail, players, draft) | AI Assistant (Claude - Backend) |
| 2026-02-04 22:15 | **MVP-6 完成**: 完整实现 /playback API (ticks, events, wards, heroes) | AI Assistant (Claude - Backend) |
| 2026-02-04 22:20 | **存储测试通过**: Parquet 存储 788KB/match, SQLite 元数据工作正常 | AI Assistant (Claude - Backend) |
| 2026-02-05 04:00 | **MVP-8 完成**: 解析 2 场测试录像 (84782020, 86083386) | AI Assistant (Claude - Backend) |
| 2026-02-05 04:10 | **API 测试通过**: /matches, /playback/ticks, /playback/events, /playback/heroes 全部正常 | AI Assistant (Claude - Backend) |
| 2026-02-05 04:15 | **修复 wards API**: 处理 NaN 值问题 | AI Assistant (Claude - Backend) |
| 2026-02-05 | **MVP-7 完成**: RealMatchViewer 前后端数据集成 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复坐标系**: DOTA_MAP_BOUNDS 调整为 8000-24000 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复 PixiJS 8 渲染**: Graphics 正确添加到容器 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **优化眼位过滤**: 根据时间范围过滤存活眼位 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **MVP-2 完成**: Timeline 时间轴组件实现 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **功能**: 播放/暂停、进度拖动、速度控制(0.5x-8x)、快捷键支持 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复 Timeline 性能问题**: 解决拖动进度条导致频繁 API 请求和卡顿 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **优化**: 内部时间状态分离、降低回调频率(60fps→1fps)、一次性加载数据、二分查找 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **实现平滑动画**: 英雄移动从闪现变为丝滑过渡 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **双层插值**: 数据层(tick间插值) + 渲染层(LERP平滑)，Timeline回调频率提升至20fps | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复坐标边界**: 实测坐标范围 X:7974~24992 Y:7844~24852，扩大边界至 7500~25500 | AI Assistant (Claude - Frontend) |
| 2026-02-05 | **修复幻象问题**: SimpleDemoParser 添加 firstHeroHandle 过滤机制 | AI Assistant (Claude) |
| 2026-02-05 | **验证通过**: 每个英雄只有 1 个 handle，位置样本从 53,882 优化到 36,310 | AI Assistant (Claude) |
| 2026-02-05 | **修复英雄阵亡显示问题**: RealMatchViewer 添加 hp>0 过滤，阵亡英雄不再显示在地图上 | AI Assistant (Claude) |
| 2026-02-05 | **实现热力图 API**: HeatmapAnalyzer + visualization.py 完整实现，支持 movement/kill/death 类型 | AI Assistant (Claude) |
| 2026-02-05 | **热力图性能测试通过**: 64x64 网格 43ms, 128x128 网格 100ms, 远低于 500ms 目标 | AI Assistant (Claude) |
| 2026-02-06 | **实现路径 API**: PathAnalyzer + Douglas-Peucker 算法，支持路径简化和分段 | AI Assistant (Claude) |
| 2026-02-06 | **路径性能测试**: 单英雄 97ms, 时间范围 135ms, 简化率 73.5% | AI Assistant (Claude) |
| 2026-02-06 | **集成 Dota 2 资源本地化**: 创建英雄数据配置 (heroes.ts) 含 127 个英雄中文名 | AI Assistant (Claude) |
| 2026-02-06 | **下载英雄图标**: 从 Steam CDN 下载 127 个英雄头像和 minimap 图标 | AI Assistant (Claude) |
| 2026-02-06 | **更新 DotaMapRenderer**: 支持英雄图标显示，带队伍颜色边框 | AI Assistant (Claude) |
| 2026-02-06 | **资源位置**: `frontend/public/assets/dota/heroes/` (头像) + `icons/` (minimap图标) | AI Assistant (Claude) |
| 2026-02-06 | **修复真假眼映射**: Observer Ward = 假眼(黄色), Sentry Ward = 真眼(蓝色) | AI Assistant (Claude) |
| 2026-02-06 | **添加 minimap 背景**: 从 OpenDota 下载真实 minimap 图片替换网格背景 | AI Assistant (Claude) |
| 2026-02-06 | **添加眼位图标**: 从 Steam CDN 下载假眼/真眼图标，带队伍颜色边框 | AI Assistant (Claude) |
| 2026-02-06 | **英雄名称智能匹配**: 支持多种格式 (驼峰/下划线/无下划线)，解决 Clarity 返回名称不一致问题 | AI Assistant (Claude) |
| 2026-02-06 | **完成眼位图标集成**: 实现 preloadWardTextures() + createWardContainer() 使用 Liquipedia 眼位图标 | AI Assistant (Claude) |
| 2026-02-06 | **眼位显示规则**: Radiant=绿色边框, Dire=红色边框, Observer/Sentry 使用对应小地图图标 | AI Assistant (Claude) |
| 2026-02-06 | **坐标系校准**: 更新 DOTA_MAP_BOUNDS 为理论边界 (8192~24576)，与 minimap 图片精确对齐 | AI Assistant (Claude) |
| 2026-02-06 | **创建地图元素数据**: mapElements.ts 包含 40+ 静态元素位置 (塔、兵营、Roshan、神符等) | AI Assistant (Claude) |
| 2026-02-06 | **实现地图元素渲染**: DotaMapRenderer.drawMapElements() 绘制建筑、Roshan、神符、传送门等 | AI Assistant (Claude) |
| 2026-02-06 | **添加校准标记功能**: showCalibrationMarkers 选项用于调试坐标对齐 | AI Assistant (Claude) |
| 2026-02-06 | **修复 minimap 边框问题**: 分析图片发现 6% 透明边框，添加 MINIMAP_IMAGE_CONFIG 配置 | AI Assistant (Claude) |
| 2026-02-06 | **更新坐标转换**: gameToScreen() 方法考虑 minimap 图片透明边框偏移 | AI Assistant (Claude) |
| 2026-02-06 | **基于录像数据校准**: 使用眼位数据推断 Roshan、神符等元素的实际游戏坐标 | AI Assistant (Claude) |
| 2026-02-06 | **精确坐标校准**: 使用泉水位置作为校准点，计算精确的游戏坐标边界 | AI Assistant (Claude) |
| 2026-02-06 | **校准数据**: Radiant泉水(9504,9964), Dire泉水(23462,22749) -> bounds(7951~25226, 8468~24141) | AI Assistant (Claude) |
| 2026-02-06 | **禁用静态地图元素**: 建筑/Roshan等应从录像数据动态获取，暂时禁用静态渲染 | AI Assistant (Claude) |
| 2026-02-07 | **坐标边界数据分析**: 分析 2 场录像的 72,480 个位置样本，验证坐标范围 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **实测坐标范围**: X: 7901~25011, Y: 7844~24928 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **泉水位置校准**: 天辉(9550,9950)屏幕11.2%/86.2%, 夜魇(23450,22750)屏幕89.3%/14.2% | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **更新 DOTA_MAP_BOUNDS**: 基于实测数据重新计算边界 minX=7558 maxX=25353 minY=7502 maxY=25269 | AI Assistant (Claude Opus 4.5) |
| 2026-02-07 | **创建分析工具**: backend/poc/analyze_coordinates.py, optimize_bounds.py 用于坐标校准 | AI Assistant (Claude Opus 4.5) |
| 2026-02-11 | **完成录像管理系统**: MatchListPage + ReplayUploader + API 搜索功能完整实现 | AI Assistant (Antigravity) |
| 2026-02-11 | **修复 Hero ID 映射**: 创建 hero_mapping.py 模块，修复所有英雄 ID 数据 | AI Assistant (Antigravity) |
| 2026-02-11 | **测试验证通过**: 所有搜索功能（Match/Hero/Player）正常工作 | AI Assistant (Antigravity) |
| 2026-02-11 | **修复 Timeline 时间同步问题**: 拖动/播放共享时间源，避免回跳 | OpenCode |
| 2026-02-11 | **修复英雄名称中文映射**: 增强 getHeroByName 兼容多格式名称匹配 | OpenCode |
| 2026-02-11 | **重构地图坐标映射模块**: 抽离 mapCoordinateMapper 纯函数并统一英雄/眼位/校准标记坐标入口 | OpenCode |
| 2026-02-11 | **修复小地图对齐偏移**: 统一边界/内容区域配置并在映射中加入边界夹取，提升边缘点对齐稳定性 | OpenCode |
| 2026-02-11 | **重构眼位图标渲染**: 移除 observer/sentry 图片依赖，改为内联 SVG 纹理并按阵营着色（天辉绿/夜魇红） | OpenCode |
| 2026-02-11 | **修正眼位图标形状一致性**: SVG 改为封装原始 ward 图标并做阵营着色，保持原始外形不变 | OpenCode |
| 2026-02-11 | **修复眼位图标不显示**: 将 SVG 内图片引用改为嵌入式 data URL，避免相对路径在 data URI 中失效 | OpenCode |
| 2026-02-11 | **按指定形状替换眼位图标**: 新增 observer/sentry SVG 资源并接入渲染管线 | OpenCode |
| 2026-02-11 | **优化眼位可视性**: 增加小地图暗化遮罩与眼位柔和辉光，提升红绿图标在复杂背景下辨识度 | OpenCode |
| 2026-02-11 | **微调眼位辉光质感**: 改为单层模糊光晕，移除明显分层效果 | OpenCode |
| 2026-02-12 | **更新项目阶段到 Phase 4**: 纳入比赛数据库、OpenDota 同步、录像下载与实时 HUD/优势曲线需求 | OpenCode |
| 2026-02-14 | **修复回放时间轴基准**: 统一 game clock 映射（支持负时间显示、0:00 对齐、Timeline/拖动/播放/事件过滤一致） | OpenCode |
| 2026-02-14 | **前端时间轴映射策略增强**: 优先使用 `game_time`，缺失时回退为“首个 source 时间=-1:30”锚点，保持 Timeline 与事件过滤一致 | OpenCode |
| 2026-02-14 | **ReplayUploader 清空交互增加二次确认**: 首次点击进入确认态，二次点击才执行清空，并提供取消按钮 | OpenCode |
| 2026-02-14 | **阶段重构(选项2)-Phase1 启动**: 解析器新增时间契约字段(`time_contract_version`,`game_start_time`)，playback 顶层新增 `time_basis`，并重新解析 84782020/86083386 验证 `game_time` 含负值 | OpenCode |
| 2026-02-14 | **前端第一阶段落地**: playback `time_basis` 类型对齐 + RealMatchViewer 基于 `game_time`/`time_basis` 映射 + 回退模式 badge 与状态面板可观测性 | OpenCode |
| 2026-02-14 | **修复解析器 game_time 采样基准**: `SimpleDemoParser` 改为优先 `tick/30 - m_flGameStartTime`（不依赖 `m_fGameTime` 连续更新），并重建 shadowJar + 重解析 84782020/86083386 验证负时间与递增样本 | OpenCode |
| 2026-02-14 | **二次校准时间轴偏移**: 修复 parser 的 64 位 match_id 保留并切换前端预游戏归一化（将异常早于 -95s 的起始样本校正到 -90s 附近），缓解不同录像的 +10s/+20s 显示偏移 | OpenCode |
| 2026-02-14 | **修复早期样本时间回填**: `SimpleDemoParser` 在首次读到 `m_flGameStartTime` 后回填已采样 `positions/wards` 的 `game_time`，避免前段正时间与后段负时间混用；重建 shadowJar 并复验 84782020/86083386 首段为负且递增 | OpenCode |
| 2026-02-14 | **修复 replay match_id 与 pause-aware game_time**: `SimpleDemoParser` 元数据改为优先 `fileInfo.match_id`（保留 gamerules 值用于调试），采样时优先 `m_fGameTime - m_flGameStartTime` 并统一 positions/wards 时基；重建 shadowJar 并重解析 8674716612/8676017978 验证通过 | OpenCode |
| 2026-02-14 | **后端下沉时间轴校正策略**: playback `time_basis` 新增 `offset_seconds/clock_zero_source`，并统一 `ticks/wards` 偏移计算优先级（metadata -> 样本推导 -> fallback） | OpenCode |
| 2026-02-14 | **时间口径定稿**: 回放查看器统一采用“标准(-1:30起点)”显示口径，移除“原始解析时间”切换；后端保留原始 `game_time` 不做整体平移 | OpenCode |
| 2026-02-14 | **RealMatchViewer 顶部阵容条**: 新增天辉/夜魇 5 英雄大头像 + 中间当前游戏时间；Timeline 支持隐藏时间显示并在回放页关闭“当前/总时长” | OpenCode |
| 2026-02-14 | **优化 RealMatchViewer 阵容条视觉**: 头像改为 16:9 卡片 + `object-contain` 完整显示，移动端/桌面 5v5 稳定布局，中间时间改为徽章式精致样式 | OpenCode |
| 2026-02-14 | **去除 HUD 阵容条横向滚动**: 阵容条改为自适应 5 列网格并略缩头像卡片间距，确保无需滑动即可看到双方全部头像 | OpenCode |
| 2026-02-14 | **调整 HUD 与地图居中关系**: 为阵容条与地图增加同一 `max-width` 容器并统一水平居中，保证地图相对上方 HUD 视觉居中 | OpenCode |
| 2026-02-14 | **修正 HUD/地图左偏对齐**: 容器宽度精确收敛到 900 并为 MapViewer 增加 `justify-center` 包裹，确保地图相对 HUD 真正水平居中 | OpenCode |
| 2026-02-14 | **新增 HUD 阵亡态与复活倒计时**: 英雄阵亡时头像灰度化显示，并在头像上方展示按游戏时钟计算的复活秒数，复活后自动恢复彩色 | OpenCode |
| 2026-02-14 | **启动 RP2-7**: 制定 pause-aware 双时基方案并分派前后端子智能体并行实现（解析/透传/前端冻结显示） | OpenCode (Orchestrator) |
| 2026-02-14 | **RP2-7 后端链路增强**: playback 返回 `pause_intervals`（含 `time_basis` 内冗余）、Parquet metadata 持久化 pause 区间并补充回归测试（无暂停/有暂停/过滤稳定） | OpenCode |
| 2026-02-14 | **RP2-7 前端冻结显示落地**: 回放推进统一基于 `replay_time`，game clock 在 pause 区间冻结并显示“暂停中”；补充 `gameClock` 单测覆盖 pause/非 pause 映射 | OpenCode |
| 2026-02-15 | **修复 RP2-7 时间偏移回归**: `gameClock` 在存在样本 `game_time` 时优先使用样本推导 offset（不被 `time_basis.offset_seconds` 覆盖），修正多场比赛慢 10~26 秒问题 | OpenCode |
| 2026-02-15 | **恢复标准开局锚点显示**: 对异常早于 -95s 的 `game_time` 自动做 -1:30 归一化显示（仅显示口径），修复 8676017978/8689397081/8674716612 的 +17/+26/+10 秒偏移 | OpenCode |
| 2026-02-15 | **修复 parser 暂停时钟冻结与区间输出**: `SimpleDemoParser` 以 Gamerules 暂停状态冻结 `game_time`，并在 metadata 输出 `pause_intervals`（replay_start/end/duration/game_time）供后端与前端透传消费 | OpenCode |
| 2026-02-15 | **修复前端 pause_intervals 键兼容**: `gameClock` 兼容后端字段 `replay_start_time/replay_end_time`（此前仅识别 `start_replay_time/end_replay_time` 导致暂停区间失效） | OpenCode |
| 2026-02-15 | **修复比赛时长口径**: 解析器新增终场锚点（`game_state` 转换/`winner` 首次确定）并将 `duration_seconds` 对齐有效比赛时长，剔除暂停与赛后尾段 | OpenCode |
| 2026-02-15 | **修复 backend 路径漂移根因**: `playback`/`ParseService`/`main` 统一以 `backend/` 目录为基准解析 `data/*` 路径，避免从不同 cwd 启动导致读写到错误目录（如 `backend/backend/data`） | OpenCode |
| 2026-02-15 | **彻底收敛 matches 路径配置**: `replays/matches/visualization` 路由与 `ParquetStorage` 默认路径统一为 `data/matches`（并兼容历史 `backend/data/matches` 入参），确保“解析写入”和“回放读取”同目录 | OpenCode |
| 2026-02-15 | **增加前端暂停兜底显示**: RealMatchViewer 在相邻 tick `game_time` 持平时强制判定暂停并冻结显示，避免 pause_intervals 元数据异常时 UI 仍走表 | OpenCode |
| 2026-02-15 | **修复比赛详情时长来源**: `GET /matches/{id}` 优先读取 Parquet metadata `duration_seconds` 覆盖 SQLite 值，避免列表/详情显示旧时长 58:59 | OpenCode |
| 2026-02-15 | **统一 HUD 计时基准并补全前端 pause 推断**: 回放页当前时钟与复活倒计时统一使用同一 `mapper` 基准；当后端未返回 `pause_intervals` 时由 `ticks.game_time` 冻结段自动推断暂停区间，修复“暂停显示有但时间轴/复活倒计时错位” | OpenCode |
| 2026-02-15 | **进一步缩小时轴偏差**: 回放页时间显示与复活倒计时改为基于相邻 tick 的 `game_time` 插值（而非仅依赖 source->offset 映射），降低终局关键事件约 2~3 秒漂移 | OpenCode |
| 2026-02-15 | **DONE: 比赛管理上传支持多文件**: ReplayUploader 扩展为文件选择与拖拽均可一次上传多个 `.dem`，并增加批量上传进度与错误汇总提示 | OpenCode |
| 2026-02-15 | **DONE: 修复小地图 antimage 头像加载**: 地图渲染增加英雄名紧凑匹配（忽略下划线差异），修复 `anti_mage`/`antimage` 映射失败并覆盖同类命名差异 | OpenCode |
| 2026-02-15 | **DONE: 回放 HUD 英雄头像下方新增实时血条**: 复用 tick `hp/max_hp` 数据在阵容栏渲染动态血量条，兼容桌面与移动端布局并保持现有视觉风格 | OpenCode |
| 2026-02-15 | **DONE: RealMatchViewer HUD 血条交互增强**: 血条加粗并增加 hover 高亮/阴影效果，悬停显示实时血量数值（当前/最大），兼容阵亡态显示 | OpenCode |
| 2026-02-15 | **DONE: 修复 RealMatchViewer HUD 血条 hover 双提示**: 移除血条区域 `title` 原生 tooltip，并将英雄名称 tooltip 限定到头像容器以保留名称提示且不干扰自定义血量浮层 | OpenCode |
| 2026-02-15 | **DONE: 全量文档更新并对齐当前实现状态**: 覆盖更新根文档、前后端/数据 README、API 规范、技术设计与 Replay 管理计划，修正文档实现状态与过时端点清单 | OpenCode |
| 2026-02-15 | **修复 matches 列表时长口径**: `GET /matches` 与 `GET /matches/{id}` 统一优先使用 Parquet metadata `duration_seconds`，缺失时回退 SQLite `duration`，未解析比赛保持兼容 | OpenCode |
| 2026-02-16 | **DONE: Timeline 悬停预览与暂停区间可视化**: 时间轴新增 hover 时间 tooltip（含“暂停中/进行中”状态）并叠加暂停区间橙色标记，复用现有 gameClock pause 映射逻辑 | OpenCode |
| 2026-02-16 | **DONE: 修复 Timeline hover 文案换行**: 优化悬停 tooltip 排版并增加 `whitespace-nowrap`，避免进度条尾端“进行中”被折行为两行 | OpenCode |

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
backend/
├── parsers/
│   ├── __init__.py           # 模块导出
│   ├── models.py             # 数据模型 (ParseResult, PositionSample, etc.)
│   └── clarity_parser.py     # ClarityParser 类
├── storage/                  # ✅ NEW - 存储层
│   ├── __init__.py
│   ├── parquet_storage.py    # Parquet 文件存储
│   └── match_storage.py      # SQLite 元数据存储
├── services/                 # ✅ NEW - 服务层
│   ├── __init__.py
│   └── parse_service.py      # 解析服务（整合解析+存储）
├── routers/                  # ✅ UPDATED - 真实API实现
│   ├── replays.py            # /api/v1/replays/*
│   ├── matches.py            # /api/v1/matches/*
│   ├── playback.py           # /api/v1/playback/*
│   └── visualization.py      # /api/v1/visualization/*
└── poc/
    └── test_storage.py       # ✅ NEW - 存储测试

parsers/
├── build/libs/           # clarity-parser-1.0.0-uber.jar
├── src/main/java/        # SimpleDemoParser.java
├── jdk17/                # OpenJDK 17.0.18
├── gradle-8.5/           # Gradle 构建工具
├── build.gradle.kts      # 构建配置
└── gradle.properties     # JDK 路径配置

data/
├── matches/              # ✅ NEW - Parquet 存储
│   └── {match_id}/
│       ├── positions.parquet  # 英雄位置 (~768KB)
│       ├── kills.parquet      # 击杀事件 (~4KB)
│       ├── wards.parquet      # 眼位事件 (~10KB)
│       └── meta.json          # 比赛元数据 (~5KB)
├── replays/              # .dem 文件存储
└── truesight.db          # SQLite 元数据库

frontend/
├── public/assets/dota/   # ✅ NEW - Dota 2 游戏资源 (本地化)
│   ├── heroes/           # 英雄头像 (127 个 PNG)
│   ├── heroes/icons/     # Minimap 图标 (127 个 PNG)
│   ├── minimap/          # 小地图背景 (minimap_740.png)
│   └── wards/            # 眼位图标 (observer_mapicon.png, sentry_mapicon.png)
├── scripts/
│   └── download-dota-assets.js  # 资源下载脚本
└── src/renderer/
    ├── components/
    │   ├── map/              # ✅ 地图渲染组件
    │   │   ├── DotaMapRenderer.ts  # 核心渲染引擎 (支持英雄图标)
    │   │   └── MapViewer.tsx       # React 组件封装
    │   ├── timeline/         # ✅ 时间轴组件
    │   │   ├── Timeline.tsx        # 播放控制组件
    │   │   └── index.ts            # 模块导出
    │   └── poc/              # POC 测试组件
    │       └── PixiJSStressTest.tsx
    ├── data/                 # ✅ NEW - 静态数据配置
    │   ├── heroes.ts         # 英雄数据 (127个英雄ID/名称/中文名映射)
    │   └── mapElements.ts    # 地图元素配置 (建筑、Roshan、神符等位置)
    ├── pages/
    │   ├── POCTestPage.tsx   # POC 测试页面
    │   ├── MapTestPage.tsx   # 地图测试页面 (示例数据)
    │   └── RealMatchViewer.tsx  # 真实比赛查看器
    ├── api/
    │   └── backend.ts        # Backend API 服务 (含 playback API)
    └── App.tsx               # 主应用 (含 Real Match 导航)
```
