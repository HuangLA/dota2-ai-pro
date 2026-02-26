# 开发计划: True Sight (Dota 2 录像分析工具)

> **最后更新**: 2026-02-26  
> **详细进度追踪**: [PROGRESS.md](./PROGRESS.md)  
> **项目分析**: [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md)  
> **API 契约**: [docs/api_specification.md](./docs/api_specification.md)

---

## 项目阶段总览

| 阶段 | 名称 | 状态 | 完成度 |
|------|------|------|--------|
| Phase 1 | 规划与需求 | ✅ DONE | 100% |
| Phase 2 | 技术验证 + MVP 核心 | ✅ DONE | 100% |
| Phase 3 | 进阶功能 (单场分析) | 🔄 部分完成 | 75% |
| Phase 4 | 数据化回放 + 职业数据库 | 🔄 进行中 | 85% |
| Phase 4.5 | 架构重构 (Live/Library) | 🔄 进行中 | 80% |
| Phase 5 | AI 分析 + 战术模块 | 📋 规划中 | 0% |
| Phase 6 | 打包与分发 | 📋 规划中 | 0% |

---

## 当前冲刺: Phase 4 收尾 + 架构补强

### 🎯 冲刺目标
1. 完成 Phase 4 最后一个核心功能 (Gold/XP 优势曲线)
2. 补齐 Phase 3 遗留的前端可视化组件
3. 解决关键技术债务 (状态管理、路由、大文件拆分)
4. 完成回放解析重构的剩余项

### ⚡ 优先级排序 (P0 → P3)

---

### P0 — 必须完成 (阻塞后续阶段)

#### T-001: Gold/XP Advantage 优势曲线 (PH4-7)
- **负责方**: Both (后端 API + 前端图表)
- **后端**: 新增 `GET /api/v1/playback/{match_id}/advantage` 返回按 game_time 的团队总经济/经验差序列
- **前端**: 在 RealMatchViewer 新增 Recharts/lightweight 曲线图，与 Timeline 联动
- **依赖**: HUD API (PH4-6) ✅ 已完成
- **预估**: 3-4 天
- **验收标准**:
  - [ ] API 返回 game_time + gold_advantage + xp_advantage 数组
  - [ ] 曲线图与时间轴拖动/播放同步高亮当前时间点
  - [ ] 暂停区间数据连续性验证

#### T-002: 回归测试与性能基线 (RB-7)
- **负责方**: Both
- **内容**: 同步/下载/解析/检索链路端到端验证
- **预估**: 2 天
- **验收标准**:
  - [ ] OpenDota sync → download → parse → library 完整链路可重复通过
  - [ ] 性能基线记录 (sync 延迟, parse 耗时, query 响应)

#### T-003: 回放时间轴回归测试 (RP2-4)
- **负责方**: Both
- **内容**: 验证 86083386/84782020 两场比赛时间对齐
- **预估**: 1 天
- **验收标准**:
  - [ ] 出兵前负时间显示正确
  - [ ] 出兵 0:00 对齐
  - [ ] 暂停区间冻结正常

---

### P1 — 高优先级 (核心体验提升)

#### T-004: 前端热力图可视化组件 (Phase 3 遗留)
- **负责方**: Frontend
- **后端**: ✅ HeatmapAnalyzer API 已完成
- **前端**: 在地图上叠加热力图层 (movement/kill/death), 时间范围联动
- **预估**: 2 天
- **验收标准**:
  - [ ] 可切换 movement/kill/death 模式
  - [ ] 支持时间范围筛选
  - [ ] 热力图叠加在 minimap 上, 半透明渲染

#### T-005: 前端路径轨迹可视化组件 (Phase 3 遗留)
- **负责方**: Frontend
- **后端**: ✅ PathAnalyzer API 已完成
- **前端**: 选中英雄后显示移动路径线, 支持 Douglas-Peucker 简化
- **预估**: 2 天
- **验收标准**:
  - [ ] 单英雄路径线渲染, 按阵营着色
  - [ ] 支持 simplify 和 time_range 参数
  - [ ] 不影响回放性能

#### T-006: 地图击杀事件标记 (Phase 3 遗留)
- **负责方**: Frontend
- **后端**: ✅ kills.parquet 数据已有
- **前端**: 在地图上显示击杀图标 (骷髅/X), 与 Timeline 同步
- **预估**: 1 天
- **验收标准**:
  - [ ] 击杀事件在地图对应位置显示标记
  - [ ] 标记随时间轴显隐
  - [ ] killer 和 victim 信息 tooltip

#### T-007: 引入 Zustand 状态管理
- **负责方**: Frontend
- **内容**:
  - 创建 `src/store/` 目录
  - 抽取全局状态: 当前比赛、用户偏好、页面导航
  - App.tsx 从 2600+ LOC 状态管理代码中解耦
- **预估**: 3 天
- **验收标准**:
  - [ ] 至少 2 个 Zustand store (matchStore, navigationStore)
  - [ ] App.tsx LOC 减少 30%+
  - [ ] 跨页面状态共享正常 (如从 TeamProfile → Replay → 返回)

#### T-008: 引入前端路由系统
- **负责方**: Frontend
- **内容**: 引入 React Router (或 TanStack Router), 替换 App.tsx 手动切页
- **预估**: 2 天
- **路由规划**:
  ```
  /                          → Home
  /matches                   → MatchListPage
  /match/:id                 → RealMatchViewer
  /database                  → MatchDatabasePage
  /team/:id                  → TeamProfilePage
  /live                      → OpenDotaLivePage
  /library                   → ReplayLibraryPage
  /settings                  → Settings (未来)
  ```
- **验收标准**:
  - [ ] URL 与页面对应, 支持深链接
  - [ ] 浏览器前进/后退工作正常
  - [ ] 现有导航测试全部通过

#### T-009: RP2-7 完成: Pause-aware 双时基收尾
- **负责方**: Both
- **当前进度**: 80% (后端链路已增强, 前端冻结基本落地)
- **剩余**: 边缘情况修复 + 多场比赛交叉验证
- **预估**: 1 天

#### T-010: RP2-3 完成: 前端时间轴对齐收尾
- **负责方**: Frontend
- **当前进度**: 80%
- **剩余**: Timeline 以 game_time 为主的最终校准
- **预估**: 1 天

---

### P2 — 中优先级 (体验优化 + 技术健康)

#### T-011: 拆分大组件
- **负责方**: Frontend
- **目标**:
  - TeamProfilePage (2600 LOC) → 拆为 5+ 子组件
  - RealMatchViewer (1149 LOC) → 拆分 HUD/Controls/MapPanel
  - DotaMapRenderer (1432 LOC) → 拆分图层管理逻辑
- **预估**: 3 天

#### T-012: 统一 HTTP 客户端
- **负责方**: Frontend
- **内容**: 统一为 fetch 或 axios, 增加:
  - 请求/响应拦截器
  - 统一错误处理
  - 请求超时配置
  - Base URL 可配置化
- **预估**: 1 天

#### T-013: 抽取自定义 Hooks
- **负责方**: Frontend
- **内容**: 从页面中抽取复用逻辑:
  - `usePlayback(matchId)` — 回放数据加载 + 时间控制
  - `useMatchDatabase()` — 列表查询 + 筛选 + 分页
  - `useTeamProfile(teamId)` — 战队数据 + 快照管理
  - `useDownloadAction(matchId)` — 下载操作 + 状态轮询
- **预估**: 2 天

#### T-014: 图标资源接入完善 (RB-6)
- **负责方**: Frontend
- **当前进度**: 70%
- **剩余**: 联赛/战队图标加载优化 + 缺失回退策略
- **预估**: 1 天

#### T-015: RP2-5 事件与 HUD 扩展字段设计
- **负责方**: Both
- **内容**: 明确 kills/networth/gold/xp 的统一时基与字段契约
- **预估**: 1 天

#### T-016: RP2-6 参考 OpenDota 处理链拆分解析模块
- **负责方**: Backend
- **内容**: 形成 processor 分层设计草案 (时间层/事件层/统计层)
- **预估**: 2 天

#### T-017: 后端日志系统
- **负责方**: Backend
- **内容**: 引入 structlog 或 loguru, 统一日志格式
- **预估**: 1 天

#### T-018: 前端错误边界
- **负责方**: Frontend
- **内容**: React Error Boundary + 统一 toast/notification 组件
- **预估**: 1 天

---

### P3 — 低优先级 (可延后)

#### T-019: 前端端到端测试
- **内容**: Playwright 覆盖核心链路 (上传→解析→回放)
- **预估**: 3 天

#### T-020: STUB 端点实现
- **内容**:
  - `GET /api/v1/playback/{id}/smokes` — 开雾数据
  - `POST /api/v1/visualization/aggregate/heatmap` — 多场聚合热力图
  - `POST /api/v1/visualization/aggregate/ward-clusters` — 眼位聚类
- **预估**: 3 天

#### T-021: 异步解析队列 (PARSER-5)
- **内容**: 后端并发下载/解析能力, 任务队列
- **预估**: 3 天

#### T-022: 清理 POC/调试代码
- **内容**: 评估 MapTestPage/POCTestPage 是否保留
- **预估**: 0.5 天

#### T-023: 配置外部化
- **内容**: Base URL, API 超时, 同步间隔等配置项从 `.env` 读取
- **预估**: 1 天

---

## Phase 5: AI 分析 + 战术模块 (规划)

> **前置条件**: Phase 4 全部完成, 架构债务清理完毕

### 模块 B: 战队望远镜 (Multi-Match Analysis)

| ID | 功能 | 优先级 | 预估 | 依赖 |
|----|------|--------|------|------|
| PH5-B1 | 多场次数据聚合引擎 (DuckDB) | P0 | 3 天 | T-020 (aggregate API) |
| PH5-B2 | 动态热力图 (筛选维度: 时间/经济/局势) | P1 | 3 天 | T-004, PH5-B1 |
| PH5-B3 | 眼位聚类分析 (DBSCAN/K-means) | P1 | 5 天 | Ward Analyzer |
| PH5-B4 | 一级团战术板 (聚合开局路径) | P2 | 3 天 | PH5-B1 |
| PH5-B5 | 选手行为指纹 (六边形能力图) | P2 | 4 天 | PH5-B1 |
| PH5-B6 | 对线压制指标 | P3 | 3 天 | 扩展解析器 |

### 模块 C: BP 指挥官 (Draft Analysis)

| ID | 功能 | 优先级 | 预估 | 依赖 |
|----|------|--------|------|------|
| PH5-C1 | 联赛 BP 数据同步 (Stratz/OpenDota) | P1 | 2 天 | PH4-1 |
| PH5-C2 | Tier List 自动生成 (基于 BP 率) | P1 | 2 天 | PH5-C1 |
| PH5-C3 | 对手 BP 基因分析 (绝活/摇摆) | P2 | 4 天 | PH5-C1 |
| PH5-C4 | 实时 BP 模拟界面 | P2 | 5 天 | PH5-C2/C3 |

### 模块 A 进阶: 比赛显微镜扩展

| ID | 功能 | 优先级 | 预估 | 依赖 |
|----|------|--------|------|------|
| PH5-A1 | 视野遗憾模拟 (Vision Miss) | P2 | 4 天 | 眼位数据完善 |
| PH5-A2 | 失误分析引擎 (控制重叠/买活死) | P2 | 5 天 | 扩展解析器事件 |
| PH5-A3 | 开雾评价 (Smoke Eval) | P2 | 3 天 | T-020 (smokes API) |
| PH5-A4 | 团战技能时序图 | P3 | 5 天 | combat_log 解析 |
| PH5-A5 | 眼位投资回报率 (Ward ROI) | P3 | 2 天 | PH5-B3 |

---

## Phase 6: 打包与分发 (规划)

| ID | 功能 | 优先级 | 预估 | 依赖 |
|----|------|--------|------|------|
| PH6-1 | 配置 Electron Builder (Windows) | P0 | 2 天 | Phase 5 基本完成 |
| PH6-2 | 打包 Python 后端 (PyInstaller/Nuitka) | P0 | 3 天 | PH6-1 |
| PH6-3 | 打包 Java 运行时 (JRE 17) | P0 | 1 天 | PH6-1 |
| PH6-4 | Windows 安装包测试 | P0 | 2 天 | PH6-1/2/3 |
| PH6-5 | 自动更新机制 | P1 | 3 天 | PH6-4 |
| PH6-6 | macOS 安装包 (可选) | P2 | 3 天 | PH6-1 |
| PH6-7 | 演示视频/截图 | P1 | 1 天 | PH6-4 |
| PH6-8 | 分析师用户手册 | P1 | 2 天 | PH6-4 |

---

## 推荐执行顺序 (近 4 周)

### Week 1: Phase 4 收尾
| 天数 | 任务 |
|------|------|
| Day 1-2 | T-001 Gold/XP 优势曲线 (后端 API) |
| Day 2-3 | T-001 Gold/XP 优势曲线 (前端图表) |
| Day 4 | T-003 时间轴回归测试 + T-009/T-010 收尾 |
| Day 5 | T-002 回归测试与性能基线 |

### Week 2: Phase 3 遗留 + 可视化补齐
| 天数 | 任务 |
|------|------|
| Day 1-2 | T-004 热力图可视化组件 |
| Day 2-3 | T-005 路径轨迹可视化组件 |
| Day 4 | T-006 击杀事件标记 |
| Day 5 | T-014 图标资源完善 + T-015 HUD 扩展字段设计 |

### Week 3: 架构补强
| 天数 | 任务 |
|------|------|
| Day 1-2 | T-007 引入 Zustand |
| Day 3-4 | T-008 引入路由系统 |
| Day 5 | T-012 统一 HTTP 客户端 + T-018 错误边界 |

### Week 4: 重构 + Phase 5 准备
| 天数 | 任务 |
|------|------|
| Day 1-2 | T-011 拆分大组件 |
| Day 3 | T-013 抽取自定义 Hooks |
| Day 4 | T-016 解析模块分层 + T-017 日志系统 |
| Day 5 | Phase 5 架构设计 + 评审 |

---

## 里程碑检查点

| 里程碑 | 目标日期 | 验收标准 |
|--------|---------|---------|
| **M1: Phase 4 功能完整** | Week 1 末 | PH4-7 + RB-7 + RP2-4 全部通过 |
| **M2: 可视化完整** | Week 2 末 | 热力图/路径/击杀事件均可在回放中使用 |
| **M3: 架构健康** | Week 3 末 | Zustand + Router 集成, App.tsx < 200 LOC |
| **M4: Phase 5 就绪** | Week 4 末 | 技术债务清理, 代码可维护, 设计文档完成 |

---

## 风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 引入路由系统导致导航回退 | 中 | 高 | 先添加路由不删旧代码, 逐步迁移 |
| Zustand 引入打破现有状态流 | 中 | 中 | 增量引入, 先 store 后消费 |
| Gold/XP API 数据不完整 | 低 | 中 | HUD API 已证明 tick 数据可用 |
| OpenDota API 限流影响同步 | 中 | 低 | 已有 User-Agent 缓解, 增加缓存 |
| Dota 2 版本更新破坏解析 | 低 | 高 | 版本兼容性数据库 + 监控 |

---

## 决策待定

| 项目 | 选项 | 建议 | 状态 |
|------|------|------|------|
| 状态管理库 | Zustand vs Jotai vs Redux Toolkit | **Zustand** (已在 AGENTS.md 规划) | 待确认 |
| 路由库 | React Router v6 vs TanStack Router | **React Router v6** (生态最大) | 待确认 |
| 图表库 (优势曲线) | Recharts vs Chart.js vs lightweight | **Recharts** (React 原生, 足够轻量) | 待确认 |
| HTTP 客户端统一 | 全部 fetch vs 全部 axios | **fetch** (减少依赖) + 封装 wrapper | 待确认 |

---

*End of Development Plan. Refer to PROGRESS.md for sprint-level tracking.*
