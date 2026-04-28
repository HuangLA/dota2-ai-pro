# PROGRESS.md - AI 协同开发进度追踪

> **用途**: 本文件供 AI 编码助手读取和更新，用于跟踪前后端开发进度、API 实现状态和当前任务。
> **更新规则**: AI 在完成任务后应更新相应状态；人类开发者也可手动修改。

---

## 项目元数据

| 字段 | 值 |
|------|-----|
| 项目名称 | True Sight (Dota 2 录像分析工具) |
| 当前阶段 | Phase 4/4.5 已完成 ✅ + 文档对齐更新，准备进入 Phase 5 🚀 |
| 最后更新 | 2026-04-28 |
| 更新者 | Codex |

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

## 当前进展摘要（2026-03-20）

### 最新完成任务（2026-04-28）
**✅ OpenDota Live 比赛卡片补充比赛时间**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已在比赛卡片底部元信息中加入比赛开始时间：有 `start_time` 时显示紧凑的本地时间 `MM-DD HH:mm`，悬停可看到完整本地时间；缺少时间的数据不会额外显示空占位。
- `frontend/src/renderer/index.css` 已为时间标签补充等宽数字样式，保持与现有“职业赛事 / 胜负 / 时长 / 状态”标签同层级，不增加卡片高度。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `9 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。

### 最新完成任务（2026-04-27）
**✅ 修复 OpenDota Live 部分比赛缺少英雄阵容时的补齐与提示**
- `backend/storage/opendota_match_storage.py` 已支持从 OpenDota 轻量列表行里提取 `radiant_lineup/radiant_heroes/radiant_hero_ids/radiant_team` 与 `dire_*` 英雄阵容字段，并写入 `opendota_match_players`；该 fallback 只补英雄与阵营，不会覆盖已有详情里的账号、玩家名和职业名。
- `backend/routers/remote.py` 已调整远端搜索提示逻辑：当直接搜比赛号但 `/matches/{id}` 详情补抓失败、且返回结果缺少英雄/玩家阵容时，会把 OpenDota 限流/失败原因带回前端，避免页面静默显示空阵容。
- 针对 `8786096329` 复测：当前本机 OpenDota 已触发 `daily api limit exceeded`，本地缓存只有 public 摘要、没有英雄阵容，因此不能凭空补出该场英雄；页面现在会明确展示限流提示。等上游额度恢复，或轻量列表同步到自带阵容字段的比赛，新逻辑会直接显示英雄头像。
- 本次验证：`cd backend && ./.venv/bin/pytest tests/test_opendota_match_storage.py tests/test_remote_routes.py` → `35 passed`；`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `9 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过；Codex in-app browser 搜索 `8786096329` 显示 1 张结果卡与 OpenDota 429 提示，console 无 error。

### 最新完成任务（2026-04-27）
**✅ 修复 OpenDota Live 搜索标题、战队搜索与联赛翻页**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已去掉搜索标题里的“命中 X 场”，搜索态只显示当前搜索类型，例如 `联赛 ID 15475` / `战队 ID 15`。
- `backend/routers/remote.py` 已修复战队搜索候选过滤：OpenDota team endpoint 返回的比赛会按当前战队 ID 归一化天辉 / 夜魇队伍 ID，并记录为战队候选，避免详情回填不完整时被误过滤。
- `backend/services/opendota_service.py` 与 remote 搜索窗口已修复联赛 / 战队分页：OpenDota league/team endpoint 忽略 `offset` 的情况下，服务层改为向上游取足够多的数据再本地切片，后端会按 `offset + limit` 补足候选，让前端无限滚动能继续拿第二页及后续结果。
- 本次验证：`cd backend && ./.venv/bin/pytest tests/test_opendota_service.py tests/test_remote_routes.py` → `35 passed`；`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `9 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过；本地 API 实测 `战队 15` 返回 `20/21`、`联赛 15475 offset=20` 返回 `20/41`；Codex in-app browser 实测 `战队 15` 显示 20 张卡片且页面无“命中”文案。

### 最新完成任务（2026-04-27）
**✅ 为 OpenDota Live 增加联赛 / 战队点击搜索**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已将比赛卡片里的联赛标题、联赛 ID 和可用战队名改为搜索入口；点击联赛名与联赛 ID 都统一落到 `联赛 {leagueid}`，保证两者结果一致，点击战队名优先落到 `战队 {team_id}`，缺少 ID 时回退 `战队 {teamName}`。
- `backend/routers/remote.py`、`backend/services/opendota_service.py` 与 OpenDota storage 层已补齐战队搜索契约：支持 `team/team_id/team_name/战队/队伍` 前缀，优先使用缓存战队维表和本地比赛命中，并可通过 OpenDota `/teams/{team_id}/matches` 补抓远端战队比赛。
- `frontend/src/renderer/api/remoteService.ts` 和 `docs/api_specification.md` 已同步 `team_id/team_name` 参数说明；页面仍保留原有统一搜索、无限滚动、批量入库和 Light/Dark 切换。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `9 passed`；`cd backend && ./.venv/bin/pytest tests/test_remote_routes.py` → `19 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过；Codex in-app browser 已确认点击联赛入口后搜索框为 `联赛 18959`，点击战队入口后搜索框为 `战队 9425656`，浏览器 console 无 error。

### 最新完成任务（2026-04-27）
**✅ 按批注收敛 OpenDota Live 比赛卡片队伍信息**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已删除比赛卡片内重复的 `Radiant vs Dire` 对阵摘要行，阵容区域改为承担主要队伍展示。
- 阵容行标题现在在“天辉 / 夜魇”下显示真实队伍名；路人局或无明确队伍名时不再回退显示 `Radiant` / `Dire`。
- 阵容行尾部重复阵营 / 分数块已移除，胜负与比分语义保留在辅助文本中，不影响现有测试断言和可访问信息。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `8 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过；Codex in-app browser 已确认 `.open-live-match-row` 与 `.open-live-side-foot` 数量均为 0，宽屏页面仍一行三场。

### 最新完成任务（2026-04-27）
**✅ 压缩 OpenDota Live 宽屏比赛卡片为三列布局**
- `frontend/src/renderer/index.css` 已将 OpenDota Live 结果区改为宽屏默认三列，并通过 stage 容器查询在空间不足时自动降为两列 / 一列，避免只按视口判断导致桌面壳层内宽度误判。
- 比赛卡片同步压缩了卡片高度、圆角、内边距、标题字号、VS 圆标、队伍行、英雄头像、底部标签和操作按钮，让一行三场时仍保留 banner 背景、天辉 / 夜魇头像、胜负和入库 / 状态动作。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `8 passed`；`cd frontend && npm run build` → 通过；Codex in-app browser 已确认 `/openDotaLive` 当前宽屏截图一行显示三场比赛。

### 最新完成任务（2026-04-27）
**✅ 按桌面端设计稿重写 OpenDota Live 正式页面**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已按确认后的桌面端设计方向重排正式页面：搜索命令栏、主结果舞台、缩窄右侧操作栏和状态抽屉都改为新的 `open-live-*` 结构；保留统一搜索、预设搜索、手动同步、单场入库、批量入库、状态详情、取消下载、自动轮询与 Light/Dark 主题切换能力。
- 比赛结果卡片已改为 banner 背景式卡片，并同时显示天辉 / 夜魇两侧英雄头像；未选中卡片不再显示候选队列文案，只有选中后才显示“已勾选”并在右侧显示已选列表。
- 旧分页按钮已移除，结果区改为滚动触底自动加载下一页，并通过顶部 / 底部渐隐 mask 处理比赛卡片滚动到边缘时的淡出效果。
- `frontend/src/renderer/index.css` 已新增 OpenDota Live 专属主题样式，跟随现有 `data-ts-theme` 变量在 Light / Dark 下切换，避免影响其它工作页。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `8 passed`；`cd frontend && npm run build` → 通过；Codex in-app browser 已打开 `http://127.0.0.1:5173/#/openDotaLive` 检查 Dark / Light 两种模式、无翻页按钮和选中态显示。

### 最新完成任务（2026-04-27）
**✅ 修复回放返回路径，并压缩 OpenDota 实时比赛卡片**
- `frontend/src/renderer/App.tsx` 已将 `/match` 顶部“返回工作台”从浏览器历史回退改为确定性路由：有来源上下文时回到对应库 / 数据库 / 战队页，直接打开回放页时默认回到 `/openDotaLive`；同时加了返回中的短路标记，避免现有 `currentMatchId` 自动跳转逻辑把页面重新弹回 `/match`。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已压缩实时比赛卡片：联赛视觉区、状态区、队伍阵容和工作流按钮都改为更紧凑的排版，保留比赛、赛事、开赛、时长、联赛、数据状态、同步时间、检索标签、两队阵容与下载 / 状态详情等信息。
- OpenDota 实时阵容里的英雄名已统一走中文英雄数据，覆盖 `hero_id`、内部名和英文名三类输入；浏览器 DOM 已确认原先的 `Tiny · ID` / `Pudge · ID` 等行现在显示为 `小小 · ID` / `帕吉 · ID` 等中文。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/App.matchDatabaseNavigation.test.tsx src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` → `10 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过；浏览器实际点击 `/match` 返回按钮后 URL 落到 `http://localhost:5173/#/openDotaLive`。

### 最新完成任务（2026-04-27）
**✅ 将地图工作台改为顶层 portal，彻底避开命令栏遮挡**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将地图控制台通过 `createPortal` 挂到 `.replay-workspace-inner`，不再作为地图面板子节点渲染，避免被地图面板 stacking context 限制。
- `frontend/src/renderer/index.css` 已将工作台起始位置下移到命令区下方，并保留高层级右侧抽屉；实际 Chrome 页面已确认工作台打开后不再被顶部比赛选择栏遮挡。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。

### 最新完成任务（2026-04-27）
**✅ 修复地图工作台被比赛选择栏遮挡**
- `frontend/src/renderer/index.css` 已把右侧地图控制台提升为更高层级浮层，让打开的工作台稳定压过顶部比赛选择栏；当前层级顺序调整为工作台抽屉 > 命令栏 / 比赛选择 > 地图 / HUD。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。

### 最新完成任务（2026-04-27）
**✅ 修复比赛录像选择面板被地图 / HUD 遮挡**
- `frontend/src/renderer/index.css` 已给回放页命令栏建立更高的 stacking context，并让地图工作区显式处在较低层级；比赛搜索面板提升为独立高层浮层，同时加厚玻璃底色，避免 Light/Dark 下展开后被主地图和两侧 HUD 压住或透出干扰。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。桌面 Chrome 截图仍返回 `cgWindowNotFound`，项目内也没有 Playwright 依赖，因此未完成自动截图复核。

### 最新完成任务（2026-04-27）
**✅ 按 4 条批注优化地图控制台、比赛选择和 Light 返回按钮**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已移除地图控制台路径区底部的“路径对象 / 压缩率 / 调试校准”调试尾栏，控制台内容更干净。
- 地图控制台打开 / 关闭改为可感知的右侧滑入滑出：新增 `mapWorkbenchRendered` 暂留状态，关闭时保留组件直到退出动画完成；`index.css` 增加 `replay-workbench-slide-in / slide-out` 动画并兼容 reduced motion。
- 顶部比赛选择从原生 select 改为搜索式录像选择器：当前比赛以按钮呈现，点击后可按队名、match id、来源筛选列表；本地比赛列表加载上限从 10 提到 100，便于后续录像数量变多时快速定位。
- `frontend/src/renderer/App.tsx` 和 `index.css` 已修正 `/match` 顶部返回工作台按钮在 Light 模式下的文字和背景对比度，去掉硬编码白字，改用主题变量。
- 本次验证：`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。Chrome 辅助功能截图这轮返回窗口句柄错误，未完成自动视觉截图。

### 最新完成任务（2026-04-27）
**✅ 按 HUD 数据裁切批注放宽横向信息区**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已调整回放页地图尺寸断点，在 1400-1600px 区间为两侧 HUD 释放更多空间；同时移除 NW / GPM / XPM 数值上的截断类，避免经济数据被压成省略号。
- `frontend/src/renderer/index.css` 已扩宽 `replay-map-hud-panel`，重新分配 `replay-hud-hero-main` 与 `replay-hud-row-details` 的列宽，让英雄概览、经济列和装备格都获得更稳定的最小宽度。
- 玩家 ID pill 已取消强制截断，改为可自然换行 / 完整显示；经济列文本也取消省略号裁切。
- 本次验证：已在 Chrome 打开 `http://localhost:5173/#/match` 检查 Light 模式下两侧 HUD；`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；`cd frontend && npm run build` → 通过；`git diff --check` → 通过。

### 最新完成任务（2026-04-26）
**✅ 按 HUD 批注改成常显横向信息行**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已移除天辉 / 夜魇 HUD 的展开收起交互，标题收敛为“天辉”“夜魇”，每个英雄卡默认常显详情，不再需要点击卡片查看装备和经济信息。
- HUD 英雄卡已从竖向展开面板改为横向信息行：头像、英雄 / 玩家 / HP / KDA、NW / GPM / XPM 和装备格在同一行结构中呈现，保留职业名 / 玩家 ID、装备 tooltip、死亡状态、高亮和路径 / 热力选择联动。
- `frontend/src/renderer/index.css` 已扩宽地图两侧 HUD 浮栏，并新增 `replay-hud-hero-main / replay-hud-row-details / replay-hud-row-items` 横向布局；同时轻微缩小主地图断点尺寸，给两侧 HUD 留出更稳定的横向空间。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已同步更新为“常显详情、无 HUD 后缀、横向详情区”的回归断言。
- 本次验证：已在 Chrome 打开 `http://localhost:5173/#/match` 直接检查实际页面，确认标题仅显示“天辉 / 夜魇”，英雄卡详情常显且装备格横向展开；`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-04-26）
**✅ 按 3 条新批注继续优化地图浮层、眼位详情和时间轴**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将地图图层工作台调整为右侧宽抽屉，和右上角“打开 / 关闭工作台”按钮保持方向一致；热力、路径、视野和状态区域改为更明确的工作台分区。
- `frontend/src/renderer/index.css` 已重排 `replay-workbench-float / replay-workbench-scroll / replay-workbench-section-*`：宽屏下热力与路径并排，视野和状态横向铺开，内部列表改成行式结构，减少小卡片堆叠；窄屏下自动退回单列。
- 眼位详情浮窗已从多张大卡片改为 `ward-popover-panel` + `ward-popover-list` 紧凑滚动列表，固定多个眼位时不会继续向下撑破视口，并保留取消固定、眼位类型、坐标、插下时间、持续时间、插眼来源和消失方式。
- 时间轴已从地图画面内部移出，改为地图下方的 `replay-timeline-shell-dock`，保留播放器式控制条但不再遮挡地图元素。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已补回归断言，确保时间轴不在 `map-overlay-container` 内，眼位详情使用新的滚动列表结构，工作台仍作为 `地图图层工作台` dialog 打开。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；已用浏览器 DOM 检查 `/match` 工作台打开后的结构。

### 最新完成任务（2026-04-26）
**✅ 按 6 条批注深度重构录像主地图工作台**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将录像页从“地图外套多列卡片”的布局改为地图舞台：天辉 / 夜魇 HUD 直接浮在主地图左右两侧，说明和图例浮窗默认收起，地图区优先呈现战术画面本身。
- 图层、路径和视野控制已改为视口级 `replay-workbench-float` 玻璃抽屉，打开时悬浮于屏幕上方，不再挤压地图，也减少了热力图、路径分析等区域里的说明文字和卡片套卡片。
- `frontend/src/renderer/components/timeline/Timeline.tsx` 已压缩为单行播放器式控制条，并浮在地图底部中央；播放、停止、跳转、拖动进度和倍速功能保留，原先的大段快捷键说明与冗余标题已移除。
- `frontend/src/renderer/index.css` 已补齐新的 command / map / HUD / workbench / timeline 样式，压缩顶部录像信息区，移除 Map Workspace 里的重复说明和右侧图层摘要，让主地图、HUD、时间轴保持在同一工作面。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已同步更新默认浮窗关闭、紧凑 header、HUD 内嵌地图和轻量 Map Workspace 的断言。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；并用浏览器检查 `/match` 默认状态与工作台打开状态。

### 最新完成任务（2026-04-26）
**✅ 继续压平录像主地图区，移除嵌套卡片与重复信息**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已重构主地图工作区结构：外层只保留 Map Workspace 标题、工作台展开按钮和单行图层摘要；内层主地图卡片改为 `replay-map-stage` 平铺舞台，不再重复“比赛分析视图”、说明文案和主视图 chip 串。
- 已删除主地图下方移动端“看图指南”重复卡片，将 `map-analysis-strip` 收敛为一条低存在感技术脚注，仅保留样本、聚焦、路径压缩和时间偏移等补充信息；`map-view-strip` 仍保留测试/语义锚点但不再作为可见重复模块。
- `frontend/src/renderer/index.css` 新增 `replay-map-overview / replay-map-stage / replay-map-status-strip / replay-map-footnote / replay-timeline-shell / replay-chart-shell` 等轻量样式，主地图、时间轴和优势图之间只用分隔线组织层级，减少卡片套卡片。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已同步更新旧图例断言，新的默认状态只验证轻量图层摘要。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && npm run test -- --run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` → `16 passed`；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；`git diff --check` → 通过；已用当前 Chrome 页面查看 `/match`，确认旧的主视图 chip 串、看图指南卡片和内层大地图卡片不再出现。

### 最新完成任务（2026-04-26）
**✅ 继续逐页审计并把录像主功能区接入正式 Light/Dark UI 系统**
- 已按反馈重新过了一遍主要页面，重点确认 `matchDatabase / openDotaLive / replayLibrary / teamProfile / poc / map / match` 都能在当前主题下正常渲染；当前后端健康检查为 `healthy`，前端页面可以连接本地后端查看更完整效果。
- `frontend/src/renderer/theme.ts` 已新增主题工具，`App.tsx` 与 `DesktopLayout.tsx` 统一使用同一套 `readInitialTheme / applyTheme`，解决 `/match` 这种不经过桌面壳层的路由无法继承或切换 Light/Dark 的问题；回放页顶栏现在也有 Light/Dark 切换入口。
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已把旧的硬编码深色背景、顶层 3xl 卡片和回放底部提示条替换为 `replay-workspace-page / replay-command-panel / replay-map-panel / replay-shortcut-strip` 主题类，正式接入玻璃背景、低边框、浅深色变量和更柔和的工作区层级。
- `frontend/src/renderer/index.css` 新增回放页专属的 `replay-workspace-*` 覆盖层：统一压低旧 `slate/gray/dota-bg` 残留背景、旧大圆角、HUD 英雄卡、地图状态条、浮窗、输入和选择器的视觉重量；Light 模式下补齐 emerald / rose / amber / 任意色文本的可读性，避免胜者、状态和折叠按钮过浅。
- `frontend/src/renderer/components/timeline/Timeline.tsx` 已重做为 `replay-timeline` 轻量控制条，替换旧的 `bg-dota-surface` 卡片、灰色按钮和手写 SVG，使用 lucide 图标、分段速度控件、主题化进度条和 hover tooltip，让回放核心控制不再像旧组件。
- 浏览器验证：实际打开 `/match` 检查了 Light 与 Dark 两种模式，确认回放主功能区、地图工作台、主题切换、时间轴和状态条都已使用新视觉；同时抽查 `/matchDatabase` 和 `/openDotaLive` 的真实页面，确认共享工作区仍保持新玻璃语言。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`；`git diff --check` → 通过。测试日志仍有 jsdom/canvas 与本地网络沙箱相关 warning，但测试全部通过。

### 最新完成任务（2026-04-26）
**✅ 按最终柔和 Light/Dark 设计稿落地正式前端 UI 重构**
- 已把 `frontend/public/ui-redesign-concepts-soft.html` 的最终方向正式落到 React 应用：`frontend/src/renderer/components/DesktopLayout.tsx` 新增 Light / Dark 主题切换、`localStorage` 记忆、系统偏好初始值和 `data-ts-theme` 主题挂载，用户在工作台内可随时切换。
- `frontend/src/renderer/index.css` 已重写为一套全局 True Sight 玻璃主题系统：Dark 为低对比炭黑 + 电光青蓝，Light 为 macOS 亮色玻璃 + 系统蓝；侧栏改为 Codex 风格的连续半透明表面，顶栏、页头、筛选区、表格、按钮、KPI、输入和回放返回壳层都统一走主题变量。
- 已继续减弱正式页面中的卡片堆叠：各 `workspace-*` 页面保留完整功能，但把 KPI、chip、表格、工具条和旧暗色嵌套块压成透明分隔、轻边框和低阴影层级，避免“卡片套卡片”的拥挤感；同时在窄窗口下把侧栏改成可横向滚动的轻量工作流条，并保证主题切换按钮仍可见。
- `frontend/tailwind.config.js` 已同步把 `dota.primary` 调整为鲜亮系统蓝，正式组件中仍依赖 Tailwind `dota-*` token 的入口也会跟随新主题方向。
- `frontend/src/renderer/App.tsx` 的 `/match` 回放壳层已同步接入新玻璃背景和返回按钮风格；`frontend/src/renderer/pages/POCTestPage.tsx` 将默认页签从 PixiJS 压测改为 Summary，保留 PixiJS 功能但避免进入工具页时初始挂载 canvas 导致内嵌浏览器空白。
- 浏览器验证：已用 Codex in-app browser 实测 `/openDotaLive` 的 Light/Dark 切换与持久化，截图检查后修复了窄窗口侧栏堆叠、主题按钮隐藏、浅色模式旧任意色文本不可读等问题；随后逐路由审计 `/openDotaLive`、`/replayLibrary`、`/matchDatabase`、`/teamProfile`、`/matchList`、`/poc`、`/map`，均能渲染到 `workspace-page` 壳层并命中目标标题。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && npm run test -- --run` → `17 passed / 127 passed`。浏览器控制台仅保留 OpenDota 远端比赛请求在当前后端不可用时的 `Failed to fetch` 记录，未发现本次 UI 改动引入的页面渲染错误。

### 最新完成任务（2026-04-26）
**✅ 新增第二版更柔和的 UI 重构设计方案板，并补充 Light/Dark 双主题切换**
- 已新增 `frontend/public/ui-redesign-concepts-soft.html`，可在 Vite 下直接浏览 `http://localhost:5173/ui-redesign-concepts-soft.html`。
- 这版方向从“硬朗战术控制台”调整为“柔和赛事分析室”：Dark 保留更低对比的雾面炭黑，并把主强调色从墨绿改为更鲜亮的电光青蓝；Light 参考 macOS 亮色玻璃感，用系统蓝、瓷白底、低饱和辅助色和柔和阴影服务筛选、准备和会议展示。
- 方案板已支持页面右上角 Light / Dark 随时切换，并用 `localStorage` 记忆用户选择；透明效果已覆盖导航、顶栏、面板、输入、地图浮层、列表行和推荐区，避免只换配色而没有材质变化。
- 已按反馈把原本偏平的纯色背景升级为多方向柔和渐变底，并给屏幕内部、工作区背景、面板和列表单元补充可透出的渐变场与玻璃高光，让透明/毛玻璃效果在 Light 与 Dark 下都更明显。
- 已按 Codex 本身侧边栏的感觉继续收敛方案板侧栏：去掉“品牌卡 + 导航项卡 + 数字胶囊”的多层卡片堆叠，改为一整片连续的半透明侧栏表面；工作区入口、导航分组、选中态和数量信息都以轻量列表形式呈现，浅色模式下更接近 Codex 左侧栏。
- 已继续弱化内容区卡片堆叠感：指标、常用路径、英雄列表、inspector、表格、队列、比赛条和推荐清单从“二级玻璃卡片”改为透明列表、分隔线和信息行，只保留最外层面板作为功能分区。
- 已按反馈移除偏墨绿色主题倾向，主色改为更鲜艳的 macOS 系统蓝 / 电光青蓝，并同步应用到背景渐变、Ready 状态、侧栏选中线、进度条、时间轴和地图标记。
- 方案板覆盖三类关键屏：分析室首页（统一搜索、最近回放、队列状态、常用路径）、柔和地图复盘页（地图主画布 + 阵容摘要 + inspector + 时间轴）、准备室与战队视角（比赛准备、队列、战队快照和当前可见动作）。
- 已用 Codex in-app browser 打开并确认 DOM 内容完整，当前浏览器 URL 已切换到该新版设计方案板；已验证右上角 Light / Dark 按钮均唯一可点击，切换后 `body[data-theme]` 分别正确落到 `light` 与 `dark`。

### 最新完成任务（2026-04-26）
**✅ 新增 True Sight 完整 UI 重构设计方案板，先定方向再动正式页面**
- 已新增 `frontend/public/ui-redesign-concepts.html`，作为独立静态设计图，不接入正式 React 路由，方便在 Vite 下直接浏览 `http://localhost:5173/ui-redesign-concepts.html`。
- 方案板包含三套完整方向：A `Command Map`（回放地图优先，推荐作为主方向）、B `Operations Desk`（下载/解析/库/数据库任务调度优先）、C `Coach Board`（战队长期复盘优先）。三套方案都覆盖现有功能范围，不以删功能换简洁。
- 设计建议是以 A 为主结构，吸收 B 的任务队列和 C 的战队视角：先重构应用壳层，再重构回放页地图/HUD/inspector，最后把库和数据库收拢成任务运营台。
- 已用 Codex in-app browser 打开并确认设计板 DOM 内容完整；浏览器截图工具在捕获该静态方案板时出现超时，但当前页已切到方案板 URL，可直接人工查看。

### 最新完成任务（2026-04-26）
**✅ 全面收敛前端桌面壳层与共享工作台样式，强化战术分析工具质感**
- `frontend/src/renderer/components/DesktopLayout.tsx` 已把桌面壳层从大量内联渐变/边框样式收束为 `tactical-*` 共享类，保留全部核心工作流与开发工具导航入口，同时补充当前导航项的 `aria-current` 与 title 提示，导航状态更清晰、侧边栏更轻。
- `frontend/src/renderer/index.css` 已新增并统一 `tactical-shell / sidebar / topbar / nav / content-scroll` 等壳层样式，同时把现有 `workspace-*` 页头、筛选区、KPI、面板、表格、按钮、输入与 chip 的圆角、边框、阴影和背景噪声整体压低，移除多余装饰光斑，形成更干净的深石墨战术台视觉。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx`、`ReplayLibraryPage.tsx`、`MatchDatabasePage.tsx`、`TeamProfilePage.tsx`、`MatchListPage.tsx`、`MapTestPage.tsx` 与 `POCTestPage.tsx` 已完成页面级文案收敛：保留原有筛选、批量、回放、快照、工具入口等功能，但把长说明改为更短的操作型标签，降低首屏拥挤感。
- `frontend/src/renderer/App.tsx` 的 `/match` 返回工作台壳层已轻量调色并收窄圆角，使回放页入口和主桌面壳层保持一致；未改动 `RealMatchViewer` 数据逻辑或各页面请求逻辑。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/App.matchDatabaseNavigation.test.tsx src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx src/renderer/pages/ReplayLibraryPage.test.tsx src/renderer/pages/MatchDatabasePage.test.tsx src/renderer/pages/TeamProfilePage.test.tsx --reporter=dot` → `76 passed`；`git diff --check` → 通过；已用 Codex in-app browser 查看 `/openDotaLive`、`/replayLibrary`、`/matchDatabase`、`/teamProfile` 与 `/match` 的实际渲染。

### 最新完成任务（2026-04-22）
**✅ 统一各工作页头部与筛选区布局，降低头部臃肿感并细化筛选控件质感**
- 已在 `frontend/src/renderer/index.css` 新增一组共享工作台样式，包括更紧凑的 `workspace-header-compact`、更清晰的 `workspace-filter-shell`、更轻量的 `workspace-panel-header-inline` 与字段/底部工具条样式，用于统一各页面的页头结构、KPI 轨道、筛选表单与操作区层级。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx`、`ReplayLibraryPage.tsx`、`MatchDatabasePage.tsx`、`TeamProfilePage.tsx`、`MatchListPage.tsx` 已完成第二轮统一：页头文案与指标区更收敛，筛选区域改为更规整的字段栈与柔和面板容器，按钮与状态提示的留白、对齐和分组也更精致，整体减少“厚重大块头部”观感。
- 同步修正了 `OpenDotaLivePage` 联赛占位徽标文案，以匹配现有测试断言并保持回退态显示一致性。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx src/renderer/pages/ReplayLibraryPage.test.tsx src/renderer/pages/MatchDatabasePage.test.tsx src/renderer/pages/TeamProfilePage.test.tsx --reporter=dot` → `75 passed`。

### 最新完成任务（2026-04-22）
**✅ 收敛前端整体配色，统一桌面壳层与回放页视觉语气**
- 已将前端主题主色从“多套并行的深蓝 / 亮青 / 高饱和金色”收敛为更统一的深石墨底色、雾蓝面板与柔和青铜金强调，减少页面之间的色温冲突。
- `frontend/tailwind.config.js` 已更新 `dota.bg / surface / primary / accent / gold` 调色板；`frontend/src/renderer/index.css` 已同步重写工作台壳层、输入、按钮、表格与回放页关键覆盖样式，让导航、工作区页头、筛选区和回放 HUD 更接近同一套战术台语言。
- `frontend/src/renderer/components/DesktopLayout.tsx`、`frontend/src/renderer/App.tsx` 与 `frontend/src/renderer/pages/RealMatchViewer.tsx` 也已一起做了壳层和重点控件调色，重点降低返回按钮、地图工作台和页头区域的霓虹感，同时保留原有信息层级与交互结构。

### 最新完成任务（2026-04-03）
**✅ README 已补充当前支持补丁版本 7.41**
- 根目录 `README.md` 已明确写明当前支持的 Dota 2 补丁版本为 `7.41`，避免后续在分支合并或对外交付时还需要额外口头说明版本范围。

### 最新完成任务（2026-04-03）
**✅ 按用户要求回退到其修改前的 RealMatchViewer 基线版本**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已按用户最新要求直接恢复到仓库基线版，也就是此前备份 `RealMatchViewer.tsx.user-broken-20260403` 之前用于止血的那版“录像主工作区 / MAP WORKSPACE”实现，而不是 Tactical Console 558 行实验版。
- 当前工作区状态已确认：`RealMatchViewer.tsx` 不再有未提交改动，仅保留 `PROGRESS.md` 的记录更新，避免后续再次把“用户原始实验版”和“仓库稳定基线版”混淆。
- 本次验证：`cd frontend && npm run build` → 通过；Playwright 打开 `http://127.0.0.1:5173/#/match` → 正常渲染，可见 `录像主工作区`、`MAP WORKSPACE`、HUD、主地图、时间轴与工作台折叠按钮，无白屏、无 `pageerror`。

### 最新完成任务（2026-04-03）
**✅ 保留用户原始 Tactical Console UI，同时补齐当前仓库兼容层并恢复可运行状态**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 不再使用此前的大型工作台实现，而是回到用户自己的 558 行 Tactical Console 页面骨架；在此基础上，仅补了当前仓库所需的最小兼容层，包括：
- 接入当前 `App.tsx` 仍会传入的 `initialMatchId / replayEntryContext` props；
- 用现有 `useMatchStore + usePlaybackStore + backendAPI` 替代旧版 `matchStore / navigationStore` 契约；
- 本地补回 `formatDurationLabel / formatTimeDisplay / TeamHeroPortrait / WardPlacementRecord` 等旧页面依赖；
- 复用当前 `backendAPI` 拉取 `matches / match detail / players / ticks / wards / objectives / hud metrics`，把数据喂回用户原始的头部、HUD、地图、时间轴和眼位浮窗 UI；
- 把 `MapViewer` 眼位 hover / click 回调从旧的 `(wards, x, y)` 适配到现在的 `WardInteractionPayload`，并恢复当前眼位浮窗的交互能力。
- 结果上，页面已重新回到用户原本的 `TRUE SIGHT / TACTICAL CONSOLE` 三栏布局与简洁地图面板风格，不再保留之前那版“地图工作台”主结构。
- 本次验证：`cd frontend && npm run build` → 通过；Playwright 打开 `http://127.0.0.1:5173/#/match` → 页面正常渲染，无 `pageerror`，可见头部、RADIANT/DIRE HUD、`LIVE TACTICAL FEED`、时间轴和底部快捷键区。

### 最新完成任务（2026-04-03）
**✅ 按用户要求将回放页整份恢复到原始备份版本（当前验证为不兼容现仓库接口）**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已按用户要求直接恢复为 `/tmp/RealMatchViewer.tsx.user-broken-20260403` 中的 558 行原始备份版，不再保留此前的“稳定数据链路 + 局部样式并回”方案。
- 当前验证结果表明，这份原始备份仍然与现仓库接口存在明显漂移：`App.tsx` / 测试仍向 `RealMatchViewer` 传入 `initialMatchId / replayEntryContext`，但备份组件不接收这些 props；`utils/gameClock.ts` 中也不存在备份版依赖的 `formatDurationLabel / formatTimeDisplay` 导出；同时 `../types` 缺失，`useMatchStore / useNavigationStore` 的数据结构已与备份实现不一致。
- 本次验证：`cd frontend && npm run build` → 失败。主要错误集中在组件 props、旧 store 契约、缺失导出以及 ward 交互回调签名不兼容，因此“原样恢复”已完成，但在当前代码基线上会重新引发构建失败/白屏风险。

### 最新完成任务（2026-04-03）
**✅ 修复用户改动后前端整站白屏的问题**
- 已定位根因为 `frontend/src/renderer/pages/RealMatchViewer.tsx` 被替换成了一份与当前仓库基线严重脱节的旧版/实验版实现，导致它和现有的 `App.tsx`、`store/*`、`utils/gameClock.ts`、`types`、`MapViewer` 回调签名都不再兼容。
- 直接症状是浏览器在应用入口加载时抛出模块错误：`/src/renderer/utils/gameClock.ts does not provide an export named 'formatDurationLabel'`。由于 `App.tsx` 顶层会 import `RealMatchViewer`，即便用户停留在首页，这个模块解析错误也会把整站打成白屏。
- 当前已先把用户修改前的损坏版本备份到 `/tmp/RealMatchViewer.tsx.user-broken-20260403`，随后先用基线版本止住白屏；在此基础上，没有继续整份回退，而是把用户这版里最明显的“战术控制台”视觉改动重新并回到当前稳定实现上，包括 `TRUE SIGHT / TACTICAL CONSOLE` 头部、比赛控制台信息条和底部快捷键页脚。
- 这次处理的策略是“保留视觉改动，修正断开的接口层”：继续使用当前稳定的 `usePlaybackStore + backendAPI + gameClock mapper + MapViewer` 数据链路，只把用户定制过的头部/页脚控制台样式重新接回去，避免再次因为整文件替换而打断运行时逻辑。
- 同步补回了用户自定义的眼位 hover / pin 浮窗视觉：`renderWardPreviewPopover()` 已从旧的圆角信息卡样式切回为更硬朗的技术面板风格，恢复紧凑边框、`眼位详情 (n)` 标题、`UNPIN` 按钮和双列表格信息排布，同时保留当前稳定实现里的插眼者与消失方式数据。
- 进一步把主工作区默认可见的 HUD / 地图容器重新向用户版式对齐：当前 `RealMatchViewer` 已恢复更扁平的 `RADIANT / DIRE` 控制台式 HUD 卡片、直边地图主容器、`LIVE TACTICAL FEED` 标题和 `FOCUS / INSIGHT / LEGEND / GRID` 工具条按钮文案，同时继续复用现有稳定逻辑和测试锚点，不再因样式回迁导致白屏。
- 本次验证：`cd frontend && npm run build` → 通过；使用 Playwright 打开 `http://127.0.0.1:5173/` 确认首页恢复渲染；再注入持久化 `match-store` 状态后打开 `http://127.0.0.1:5173/#/match`，确认回放主工作区、地图、HUD、时间轴与用户保留的控制台头部样式都可正常显示，不再白屏。

### 最新完成任务（2026-04-03）
**✅ 修复回放主工作区仅显示深蓝背景的问题**
- 已定位根因为 `frontend/src/renderer/pages/RealMatchViewer.tsx` 在 HUD 英雄卡片区域使用了 `clsx(...)`，但文件顶部遗漏了 `import clsx from 'clsx'`。由于回放页组件渲染时会直接执行这些分支，浏览器会抛出 `ReferenceError: clsx is not defined`，导致 React 在 `/match` 路由下整块工作区崩溃，视觉上只剩外层深蓝色背景壳。
- 当前已补回 `clsx` 导入，回放页恢复正常渲染；首页工作台和 `#/match` 路由均可正常进入，不再出现“只剩背景色”的空白故障。
- 本次验证：`cd frontend && npm run build` → 通过；使用 Playwright 打开 `http://127.0.0.1:5173/#/match`，确认不再出现 `clsx is not defined` 页面异常，回放 HUD / 地图 / 控制区均正常渲染。

### 最新完成任务（2026-03-28）
**✅ 录像主工作区物品 tooltip 已切到纯官方中文链路，不再混用旧英文规则翻译**
- 已复核“中英混杂、文案不像官方原文”的根因：`frontend/src/renderer/data/items.ts` 之前会把官方本地化文本和旧的英文 tooltip 规则翻译结果混合使用；一旦本地化条目里有 `%placeholder%` 未替换，前端就会整段回退到旧的正则/词典翻译，所以同一个 tooltip 里会同时出现官方中文、规则翻译中文甚至残留 HTML / 占位符。
- `frontend/scripts/generate-item-tooltip-localizations.mjs` 现已扩展为同时读取 `frontend/extracted/dota/source/resource/localization/abilities_english.txt`、`abilities_schinese.txt` 与新接入的 `frontend/extracted/dota/source/scripts/npc/items.txt`。脚本会直接用官方 `npc/items.txt` 的 AbilityValues / AbilityCastRange / AbilityChannelTime / AbilityHealthCost 等数值来替换 tooltip 占位符，并修复带转义引号的本地化行解析，因此 `manta / black_king_bar / holy_locket / soul_ring / foragers_* / trusty_shovel / tango / bloodstone / medallion_of_courage` 这类此前容易混杂或残留标记的物品现在都能落成完整官方中文说明。
- 同一条生成链路现已额外产出 `localized_attributes`：会优先套用 `abilities_schinese.txt` 里的官方属性模板，再结合 `npc/items.txt` 的实际数值补全最终展示文本，像 `相位鞋 / 动力鞋 / 慧光 / 散慧对剑 / 银月之晶 / 远行鞋 / 古之忍耐姜歌 / 卫士胫甲强化版` 这类此前“属性”栏容易出现 `%+技能增强`、`+攻击力（近战）`、`智力 +0` 之类半成品模板的物品，现在都能直接生成更接近游戏内展示的完整中文属性行。
- 前端 `frontend/src/renderer/data/items.ts` 也已同步收口为“官方文本优先且不再混用旧翻译”：只要存在官方本地化条目，就只展示官方中文的名称、效果、注释和 lore；对于仓库里没有官方本地化条目的少量旧/特殊物品，前端现在宁可留空对应说明，也不再退回旧的英文规则翻译，从而彻底避免中英混杂。
- `frontend/src/renderer/data/items.ts` 现已优先消费这批 `localized_attributes` 作为 tooltip 的属性栏来源；只有官方属性模板缺失时，才会回退到旧的属性组装逻辑，因此 `blink` 这类没有官方属性键的物品仍能保留基础属性信息，但大多数常见装备已经不再显示旧规则翻译出来的混合文案。
- 已同步扩充前端物品别名归一化，补齐 replay 样本里实际命中的旧内部名与特殊名，例如：`battlefury -> bfury`、`assault_cuirass -> assault`、`manta_style -> manta`、`refresher_orb_shard -> refresher_shard`、`forage_health -> foragers_health`、`splint_mail -> splintmail`、`drum_of_endurance -> ancient_janggo`。这样主工作区装备图标会继续固定走本地 `frontend/public/assets/dota/items/*.png`，不再因为命名不一致而缺图。
- `frontend/scripts/sync-dota-game-assets.js` 与 `docs/dota_asset_sync.md` 也已补齐 `scripts/npc/items.txt / neutral_items.txt` 的提取和说明，后续重新同步本地 Dota 资源时，这条官方 tooltip 文本链路不会再漏掉底层 KV 数值源。
- 本次验证：`cd frontend && npm run assets:generate:item-tooltips` → 重新生成 `475` 条本地化条目，并扫描确认生成结果里 `placeholder / HTML residue / class=\` 残留数量已降到 `0`；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/data/items.test.ts --reporter=verbose` → `4 passed`；`cd frontend && npm run build` → 通过；额外对本地 `backend/data/matches/*/positions.parquet` 的现有 replay 样本重新做物品归一化比对后，`replay_missing_icons = 0`。

### 最新完成任务（2026-03-28）
**✅ 录像主工作区的实时装备图标已切到仓库内本地静态资源，不再运行时请求远端**
- 已复核主工作区 HUD 装备图标链路：`frontend/src/renderer/pages/RealMatchViewer.tsx` 的 `ItemIcon` 组件通过 `frontend/src/renderer/data/items.ts` 的 `getItemIconCandidates()` 解析物品图标地址。变更前这里会按“本地静态资源 -> 后端 `/api/v1/assets/items/*` 代理 -> Steam CDN”顺序逐级回退，因此浏览录像时一旦本地命中失败，页面仍会继续请求远端。
- 当前仓库内 `frontend/public/assets/dota/items/` 已存在 `601` 张物品图标，并且 `blink / tpscroll / ward_observer / ward_sentry / branches / power_treads / travel_boots` 等前端归一化后会命中的别名文件也都已落盘，因此录像主工作区已经具备“纯本地读取”条件。
- `frontend/src/renderer/data/items.ts` 现已把实时装备图标候选地址收口为单一的 `/assets/dota/items/{normalized}.png`；本地资源若缺失，`RealMatchViewer` 会直接退回已有的文字缩写占位，不再请求后端缓存代理与 Steam CDN。
- `frontend/src/renderer/data/items.test.ts` 已同步更新回归，`docs/dota_asset_sync.md` 也已把录像主工作区物品图标策略改写为“固定读取仓库内静态资源”。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/data/items.test.ts --reporter=verbose` → `4 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-28）
**✅ minimap 建筑图标已切到“外塔跟随对应高地塔样式”，并加上阵营着色**
- `frontend/src/renderer/components/map/objectiveIconCatalog.ts` 已调整 minimap 建筑图标选择规则：双方 6 个外塔不再使用单独的 `tower_outer` 环形图标，而是直接复用对应分路高地塔的官方样式。当前规则是中路 `T1/T2` 统一走 `tower_90`，上下两路 `T1/T2` 统一走 `tower`，从而和各自对应的 `T3` 保持同款视觉语言。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 已把 objective sprite 的默认 tint 从纯白改成阵营色：天辉建筑统一使用绿色 `#22c55e`，夜魇建筑统一使用红色 `#ef4444`；被摧毁后的建筑则继续保留同阵营但更暗、更透明的状态，既能看出归属，也能继续区分“已摧毁”。
- `frontend/src/renderer/components/map/objectiveIconCatalog.test.ts` 已补回归，确保外塔不会再退回旧的 ring 样式，并且中路外塔与边路外塔会分别继承中路 / 边路高地塔的 icon 方向。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/components/map/objectiveIconCatalog.test.ts --reporter=verbose`、`cd frontend && npm run build`。

### 最新完成任务（2026-03-28）
**✅ 重新校准 minimap 世界坐标映射，并用 parser 实测坐标替换基地建筑近似锚点**
- 已确认“基地建筑位置不对”的根因不只是 `mapElements.ts` 里的局部近似值，`frontend/src/renderer/components/map/mapCoordinateMapper.ts` 里的 `DOTA_MAP_BOUNDS` 也沿用了旧版映射范围，导致 parser 输出的真实世界坐标投到当前官方 minimap / `dotamap_*_buildings.png` 上时会整体偏移。为此我直接拿官方建筑覆盖图里可明确识别的外塔位置，加上 replay 里实测到的 objective 世界坐标，重新拟合了一套线性世界边界。
- `frontend/src/renderer/components/map/mapCoordinateMapper.ts` 现已把世界边界更新为 `minX=6698 / maxX=25843 / minY=6774 / maxY=25881`，注释里也标明这是按官方 `dotamap_radiant_buildings.png / dotamap_dire_buildings.png` 与 parser objective 坐标联合校准出来的版本。这样英雄、眼位、建筑、objective 事件坐标都会共用同一套更贴近当前 minimap 的映射。
- `frontend/src/renderer/data/mapElements.ts` 里的建筑锚点也同步收口到“实测优先”。当前已经把 replay 中能验证到的结构物全部替换成 parser 实测坐标，例如：`radiant_ancient -> (10464, 11032)`、`radiant_mid_t3 -> (11744, 12240)`、`radiant_mid_rax_melee -> (11712, 11832)`、`radiant_mid_rax_ranged -> (11324, 12185)`、`dire_top_rax_melee -> (20282.031, 21880)`、`dire_bot_rax_ranged -> (22448, 19760)`；少数当前样本里还没摧毁过的建筑，则先用新边界下的对称推导值兜底。
- 随后又按用户反馈对“天辉上路高地三件套 + 天辉遗迹前两座塔”做了第二轮细调：`radiant_top_rax_ranged` 不再使用对称推导，改成从存活 barracks 实体位置读取到的 `9540 / 12625`；双方 T4 和夜魇遗迹也同步切到 live objective entity 实测坐标，分别收口为 `radiant_t4_top -> (10672, 11520)`、`radiant_t4_bot -> (10992, 11192)`、`dire_t4_top -> (21328, 21160)`、`dire_t4_bot -> (21664, 20816)`、`dire_ancient -> (21912, 21384)`。
- 我用新的世界边界重新把 parser 坐标投回官方建筑图做了叠图核对，`t1/t2` 外塔、`t3`、中路双兵营、天辉遗迹和夜魇高地建筑现在都已经明显回到对应白色 minimap 图标附近，不再像之前那样整体偏一截。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/components/map/mapCoordinateMapper.test.ts src/renderer/data/mapElements.test.ts src/renderer/data/mapObjectives.test.ts src/renderer/components/map/objectiveIconCatalog.test.ts --reporter=verbose` → `17 passed`；`cd frontend && npm run build` → 通过。并额外补了一个 mapper 校准回归测试，确保已知 objective 世界坐标会落到官方建筑覆盖图的预期像素附近。

### 最新完成任务（2026-03-27）
**✅ Parser 已补上 objective 坐标回填，现有 replay 的建筑事件都能输出真实坐标**
- 已改造 `parsers/src/main/java/SimpleDemoParser.java` 的 objective 坐标回填逻辑。结论是：当前 Clarity 在这批 replay 里能稳定暴露塔 / 兵营 / 遗迹实体的 `m_iHealth` 与世界坐标，但并没有暴露可直接拿来对齐 combat log 的建筑名字字段；因此旧方案才会出现“objective 有事件、但 `x/y` 为空”的情况。
- 新方案改为维护 objective 实体的匿名状态快照：parser 会持续跟踪 `CDOTA_BaseNPC_Tower / Barracks / Fort` 等实体的 `type / team / health / x / y`，当实体从存活变成 `health <= 0` 或被删除时，先记录“最近死亡建筑快照”；随后在 combat log 收到 `npc_dota_*tower* / *rax* / *fort` 的 objective 事件、但原始日志没有 `locationX / locationY` 时，再按 `type + team + tick` 反向匹配这份死亡快照，把正确的 `x / y` 回填到 objective event。
- 已使用新的 parser 重新解析本地现有 5 场 replay：`8729115809 / 8731134498 / 8732912726 / 8736891827 / 8739045863`。重解析后，这 5 场 `backend/data/matches/{match_id}/objectives.parquet` 里的结构物事件（`tower / barracks / ancient`）`x / y` 缺失数已经全部降为 `0`。
- 针对前面暴露最明显的 `8736891827`，已确认天辉中路高地三件套现在会分别输出不同坐标：`tower3_mid -> (11744.0, 12240.0)`、`range_rax_mid -> (11324.0, 12185.0)`、`melee_rax_mid -> (11712.0, 11832.0)`，后续前端就可以直接优先使用这些真实事件坐标继续校正 minimap 锚点。
- 本次验证：`gradle -p parsers shadowJar` → 通过；`java -jar parsers/build/libs/clarity-parser-1.0.0-uber.jar backend/data/replays/8736891827.dem` → 生成的 objective JSON 中结构物 `x/y` 缺失数为 `0`；`cd backend && ./.venv/bin/python -c "... ParseService(...).parse_replay(...)"` → 5 场 replay 全部重解析成功；`cd backend && ./.venv/bin/python -c "... pandas.read_parquet(...)"` → 5 场 `objectives.parquet` 结构物 `x/y` 缺失数均为 `0`。

### 最新完成任务（2026-03-27）
**✅ 重新核对本地 Dota minimap 资源，并切换到官方独立建筑图标渲染**
- 已重新扫描本机 Dota 2 `pak01_dir.vpk` 的 minimap 相关资源，确认此前被拿来硬拆的 `panorama/images/minimap/dotamap_radiant_buildings_psd.vtex_c / dotamap_dire_buildings_psd.vtex_c` 并不是适合逐建筑拆分的稳定素材；同时确认本地还存在两套更合适的官方资源：一套是 `panorama/images/minimap/*tier1/*tier2/*base*` 这类“整路 / 整高地示意块”，另一套是 `materials/vgui/hud/minimap_tower* / minimap_racks* / minimap_ancient` 这类独立 minimap 建筑图标。
- `frontend/scripts/sync-dota-game-assets.js` 现已扩展为同步 `materials/overviews/dota_minimal*`、`materials/vgui/hud/minimap_*`，并把提取结果落到仓库内新的 `frontend/public/assets/dota/minimap/icons/` 与 `frontend/public/assets/dota/minimap/reference/`。本次同步新增了 `tower_outer.png / tower.png / tower_90.png / racks_45.png / racks_90.png / ancient.png / minimap_minimal.png / reference/base_group.png`。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 已从“拆 `dotamap_*_buildings.png` 的像素块”改为直接使用官方独立 minimap 图标；T1/T2 走官方外塔环形图标，T3/T4 与兵营、遗迹走 HUD 中的独立建筑图标，不再依赖那张会把高地三件套和基地其他建筑粘成一大片的合成图。新的图标选择规则收口在 `frontend/src/renderer/components/map/objectiveIconCatalog.ts`，并补了 `objectiveIconCatalog.test.ts`。
- 本次验证：`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/components/map/objectiveIconCatalog.test.ts src/renderer/data/mapElements.test.ts src/renderer/data/mapObjectives.test.ts --reporter=verbose` → `9 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-27）
**✅ 排查高地兵营 / 遗迹偏移原因，并补上“事件坐标优先”回退链路**
- 已对当前 minimap 渲染问题做定位：`frontend/src/renderer/data/mapElements.ts` 里的兵营与遗迹坐标本来就是手工近似锚点，夜魇兵营甚至直接写明是“按天辉镜像得到的近似坐标”；在切换到更清晰的官方独立 minimap 图标后，这批旧锚点的误差被明显放大，所以用户会感知到“高地兵营和基地位置不对”。
- 进一步核实了 replay 数据来源：当前本地样本 `backend/data/matches/8736891827/objectives.parquet` 中，塔 / 兵营事件的 `x / y` 仍然为空，因此前端现在拿不到这类建筑的真实事件坐标，暂时只能依赖 `mapElements.ts` 里的固定锚点。也就是说，当前问题的主因不是新图标锚点，而是底层建筑锚点数据质量；图标中心锚点只会带来很小的附加偏移。
- 为了避免后续 replay 或 parser 一旦提供了 objective `x / y` 还继续被死坐标限制，`frontend/src/renderer/data/mapObjectives.ts` 现在已经改为“事件坐标优先”：当 objective payload 自带 `x / y` 时，marker 会直接使用真实坐标覆盖手工锚点。并补了回归测试 `prefers event coordinates when the objective payload includes x/y`。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/data/mapObjectives.test.ts src/renderer/components/map/objectiveIconCatalog.test.ts src/renderer/data/mapElements.test.ts --reporter=verbose` → `10 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 修正高地三件套渲染，避免 T3 / 近战兵营 / 远程兵营被看成同一块**
- 在回放验证 `8736891827` 时，已确认 objective 事件本身是分开的：天辉中路高地的 `T3 / 远程兵营 / 近战兵营` 分别在 `game_time=1454.5665 / 1527.9 / 1539.4332` 被摧毁，因此“24:15 三个一起变灰”不是解析器问题，而是前端高地建筑贴图拆分与锚点的问题。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 现在对高地三件套改为优先使用稳定的高地模板纹理，而不再直接信任那些已经和基地其他建筑连成大连通块的局部拆片结果。这样 T3、近战兵营、远程兵营会按各自状态分别显示，不会再因为共用一大块 minimap 素材而一起变灰。
- 同时修正了 `frontend/src/renderer/data/mapElements.ts` 中天辉中路高地两个兵营的锚点，把原本几乎重合的 `radiant_mid_rax_melee / radiant_mid_rax_ranged` 拉开为更接近游戏 minimap 品字形的位置，避免两个兵营继续压在同一个像素附近。
- 本次验证：`CI=1 ./node_modules/.bin/vitest run src/renderer/data/mapObjectives.test.ts src/renderer/data/mapElements.test.ts --reporter=verbose` → `5 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 本地已有 replay 已全部重解析，并确认建筑 objective 链路可用**
- 已使用当前仓库里的解析器构建产物 `parsers/build/libs/clarity-parser-1.0.0-uber.jar` 重新解析 `backend/data/replays/` 下现有 5 场 replay：`8729115809 / 8731134498 / 8732912726 / 8736891827 / 8739045863`。重解析后，这 5 场对应的 `backend/data/matches/{match_id}/objectives.parquet` 都已生成。
- 当前解析器对这些本地 replay 的 objective 提取是有效的，不需要额外补“建筑事件提取”功能：五场的 objective 行数分别为 `19 / 16 / 14 / 11 / 10`，字段统一包含 `type / objective_type / objective_name / tick / x / y / team / game_time / attacker_name`。
- 已用 FastAPI `TestClient` 直接验证 `/api/v1/playback/8729115809/objectives` 路由可读到新数据，返回 `200`，`summary.total=19`，按类型统计为 `tower=10 / barracks=6 / roshan=2 / tormentor=1`。这说明“解析器 -> Parquet -> Playback objectives API -> 前端建筑状态层”这条链路在当前本地 replay 上已经打通；此前地图上建筑不消失，根因是旧解析产物里没有 `objectives.parquet`。

### 最新完成任务（2026-03-26）
**✅ 建筑层改为游戏内示意图风格，并临时移除 Roshan / Tormentor 显示**
- 地图目标层已收口成纯建筑显示：`frontend/src/renderer/data/mapElements.ts` 的 `OBJECTIVE_MAP_ELEMENT_TYPES` 现在只保留 `tower / barracks / ancient`，因此前端回放地图不再显示 Roshan 与 Tormentor；`frontend/src/renderer/pages/RealMatchViewer.tsx` 的相关概览文案也同步改成“建筑概览 / 建筑”。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 的建筑渲染逻辑已进一步从“整张队伍建筑图层叠加”改成“基于 `dotamap_radiant_buildings.png / dotamap_dire_buildings.png` 的逐建筑拆片渲染”。现在每个塔、兵营、遗迹都会先在那两张游戏内 minimap 建筑素材图里按锚点切出自己的独立图标，然后在回放时按建筑状态单独显示；高地三件套会拆成“高地塔 / 近战兵营 / 远程兵营”三个元素，小型基地装饰建筑继续忽略。
- 为了让这些独立图标落在正确位置，我用建筑图层做了一轮吸附校准，更新了 `frontend/src/renderer/data/mapElements.ts` 中塔、兵营、遗迹的坐标，尤其收紧了双方基地高地的建筑锚点。当前活着的建筑会显示对应 minimap 图标；摧毁后仅对应那一个建筑图标会单独变灰，不再影响同一路其他建筑。
- 本次验证：`CI=1 ./node_modules/.bin/vitest run src/renderer/data/mapObjectives.test.ts --reporter=verbose` → `4 passed`；`cd frontend && npm run build` → 通过；本地 Vite 开发服务保持运行，可直接刷新查看效果。

### 最新完成任务（2026-03-26）
**✅ 切换到无透明边 minimap，并改用整图直接坐标映射**
- 已按新的地图资产方向撤回“补透明边”方案：`frontend/public/assets/dota/minimap/minimap.png` 现在重新生成为无透明边的 `3072x3072` 高清图，alpha bbox 已恢复为整张图 `0..3071 / 3072`。
- 前端坐标映射已切换到更直接的方案：`frontend/src/renderer/components/map/mapCoordinateMapper.ts` 里的默认 `MINIMAP_CONTENT_BOUNDS` 现在是整张图 `0..1`，并且默认关闭 `preserveAspectRatio`，也就是直接把世界坐标线性映射到整张 minimap。旧版有透明边的映射仍保留为 `LEGACY_MINIMAP_CONTENT_BOUNDS`，只在显式需要兼容老图时使用。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 的地图 fallback 顺序也已调整，优先回退到无透明边的 `minimap_source.png / minimap_game.png / minimap_simple.png`，把 `minimap_740.png` 与 `minimap.jpg` 继续放在最后兜底，避免默认链路误回到旧透明边资源。
- 本次验证：`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过；`CI=1 ./node_modules/.bin/vitest run src/renderer/components/map/mapCoordinateMapper.test.ts --reporter=verbose` → `5 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 修复 minimap 坐标偏移，高清默认图补回旧版透明边框**
- 已核对当前前端坐标映射与旧地图资源的关系：`frontend/src/renderer/components/map/mapCoordinateMapper.ts` 中的 `MINIMAP_CONTENT_BOUNDS` 使用的是 `61 / 1024 ~ 962 / 1024` 这组历史边界，而旧版 `frontend/public/assets/dota/minimap/minimap_740.png` 的非透明内容框也正好落在 `61..962 / 1024`。此前新的高清 `minimap.png` 没有透明边框，所以坐标层会整体偏移。
- `frontend/scripts/sync-dota-game-assets.js` 现在会在生成高清 `minimap.png` 时，自动补回与 `minimap_740.png` 相同的透明边框比例：默认 `3072x3072` 产物会保留 `183px` 的四周透明边，中间 `2706x2706` 区域放置高清 minimap 内容。这样前端现有的 `MINIMAP_CONTENT_BOUNDS` 和所有已有地图锚点、英雄、建筑、眼位坐标都可以继续复用，无需额外改前端映射公式。
- 本次验证：旧图 `minimap_740.png` 的 alpha bbox 为 `61..962 / 1024`，新生成的 `minimap.png` alpha bbox 为 `183..2888 / 3072`，二者比例完全一致；`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 修正高清 minimap 方案，默认图切回官方同源 overview 链路**
- 已重新确认当前项目真正需要的不是 `world.glb` 模型俯视渲染图，而是和现有 `minimap_source.png` 同源的官方 minimap 美术。进一步比对本地资源后，确认 `materials/overviews/dota.vmat_c` 导出的 `dota.png` 与当前写实小地图几乎同源，且原生尺寸为 `512x512`；它比 Panorama 内的 `minimap_game_png`（`400x400`）更适合用作默认高清链路的源头。
- `frontend/scripts/sync-dota-game-assets.js` 已改为在基础提取阶段同时抽取 `materials/overviews/dota.vmat_c`，并自动生成默认的 `frontend/public/assets/dota/minimap/minimap.png`。现在 minimap 资产约定是：`minimap_source.png` 保留官方 overview 源图、`minimap_game.png` 保留游戏内 `400x400` 原图、`minimap.png` 则由脚本用 `sharp` 放大到 `3072x3072` 后供前端直接使用。
- 文档也已同步修正：`docs/dota_asset_sync.md` 现在把 overview 放大链路设为默认流程；`frontend/scripts/render-dota-world-minimap.mjs` 仍保留在仓库里，但只作为实验性模型渲染脚本，不再作为默认地图更新方案。
- 本次验证：`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过；`sips -g pixelWidth -g pixelHeight frontend/public/assets/dota/minimap/minimap_source.png frontend/public/assets/dota/minimap/minimap_game.png frontend/public/assets/dota/minimap/minimap.png frontend/public/assets/dota/minimap/minimap_simple.png` → 分别为 `512x512 / 400x400 / 3072x3072 / 1024x1024`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 高清写实 minimap 已从 Dota world 模型离线渲染落地，并接入手动工作流**
- 已新增 `frontend/scripts/render-dota-world-minimap.mjs`，这条脚本会读取 `Source2Viewer-CLI` 导出的 `/tmp/dota-world-glb/maps/dota/world.glb`，在本机启动临时静态服务，再通过 headless Chromium + Three.js 的正交俯视渲染生成高清 PNG。为了让输出更适合做地图底图，渲染时会把 world 网格材质压成以贴图为主的 `MeshBasicMaterial`，并在落盘前用 `sharp` 做无损压缩。
- 当前默认写实地图已经不再是本地提取的 `400x400` 原图，而是新生成的 `frontend/public/assets/dota/minimap/minimap.png`，尺寸已提升到 `3072x3072`；原始写实提取图现在保留为 `frontend/public/assets/dota/minimap/minimap_source.png`（`400x400`），简易高分辨率图仍保留为 `minimap_simple.png`（`1024x1024`）。
- 为了避免以后手动同步资源时又把高清默认图覆盖回低清版，`frontend/scripts/sync-dota-game-assets.js` 已调整 minimap 输出约定：基础提取只会写 `minimap_source.png`，而 `minimap.png` 明确保留给 world 离线渲染结果。`frontend/package.json` 新增了 `npm run assets:render:dota-minimap` 入口，`docs/dota_asset_sync.md` 也已同步补充高清写实地图的生成步骤。
- 本次验证：`node frontend/scripts/render-dota-world-minimap.mjs --size 3072 --output frontend/public/assets/dota/minimap/minimap.png` → 通过；`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过，已生成 `minimap_source.png`；`sips -g pixelWidth -g pixelHeight frontend/public/assets/dota/minimap/minimap.png frontend/public/assets/dota/minimap/minimap_source.png frontend/public/assets/dota/minimap/minimap_simple.png` → 分别为 `3072x3072 / 400x400 / 1024x1024`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-26）
**✅ 打通建筑 / Roshan / Tormentor 的实时地图目标层，并把状态接入回放主地图**
- 解析链路已扩展到目标物事件：`parsers/src/main/java/SimpleDemoParser.java` 现在会从 combat log 提取建筑、兵营、遗迹、Roshan 与 Tormentor 的摧毁事件，并在解析 JSON 中输出 `objectives`；`backend/parsers/models.py`、`backend/parsers/clarity_parser.py`、`backend/storage/parquet_storage.py` 与 `backend/routers/playback.py` 也已同步接入，新增 `/api/v1/playback/{match_id}/objectives` 端点，前端可直接按比赛读取目标物时间线。
- 前端主地图已接入动态目标层：`frontend/src/renderer/data/mapElements.ts` 补齐了建筑 / 兵营 / Roshan 双坑 / 双侧 Tormentor 的地图锚点，`frontend/src/renderer/data/mapObjectives.ts` 会根据当前比赛时间实时推导“在线 / 已摧毁 / 刷新中 / 未激活 / 不确定”状态，`frontend/src/renderer/components/map/DotaMapRenderer.ts` 与 `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将这些目标物叠加到主地图、状态条和图例中。
- 为了适应 combat log 中部分目标缺少坐标的现实情况，前端推断层额外补了两条稳健规则：T4 在无坐标时会按未摧毁顺序依次分配；Tormentor 在无坐标时会优先按击杀方英雄阵营推断，仍无法确定时则以“双侧位置待定”的方式显示，而不是静默猜错。
- 已完成验证：`gradle -p parsers shadowJar` → 通过；`./backend/.venv/bin/python -m pytest backend/tests/test_playback_objectives_contract.py -q` → `3 passed`；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/data/mapObjectives.test.ts src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `20 passed`；`cd frontend && npm run build` → 通过。真实回放 `8729115809` 重新解析后，解析器已成功产出 `19` 条 objective events。

### 最新完成任务（2026-03-26）
**✅ 探明本地写实小地图的直接资源上限，并确认可走地图 world 自渲染路线**
- 已继续重新扫描本机 Dota 2 安装目录、`pak01_dir.vpk` 和地图包 `maps/dota.vpk`。结论是：本地能直接稳定提取到的写实小地图仍然只有 `panorama/images/textures/minimap_game_png.vtex_c`，尺寸上限为 `400x400`；`materials/overviews/dotamap683.vmat_c` / `panorama/images/textures/dotamap683_psd.vtex_c` 能拿到的 `1024x1024` 仍然是简易风格，而不是写实风格。
- 进一步确认 `maps/dota.vpk` 内含完整地图 world 资源链路，包括 `maps/dota.vmap_c`、`maps/dota/world.vwrld_c`、`maps/dota/worldnodes/*` 以及 `fog_flow_map.vtex_c / fog_opacity_map.vtex_c / water_flow_map.vtex_c`。这意味着虽然本地没有现成更大的写实 minimap 位图，但地图本体资源是齐的。
- 已用 `Source2Viewer-CLI` 对 `maps/dota.vpk` 成功执行 `world.vwrld_c` 的 glTF 导出，得到 `/tmp/dota-world-glb/maps/dota/world.glb`（约 `155MB`）以及数百张地表/路径/悬崖/建筑相关纹理。说明“从地图 world 自己渲染一张更高分辨率写实俯视图”在技术上是可行的，只是这将不再是简单的位图提取，而是需要额外的正交相机渲染步骤。
- 本次探索结论：短期内如果只想依赖现成本地贴图，写实风格上限就是 `400x400`；如果要真正提升默认写实地图清晰度，下一步应转向 `world.glb` / world 材质的离线渲染方案，而不是继续搜索 `minimap*.vtex_c`。

### 最新完成任务（2026-03-26）
**✅ 重新探索本地 Dota 小地图资源，默认图切换为本地写实版**
- 已重新扫描本机 Dota 2 安装目录与 `pak01_dir.vpk` 中的 minimap / dotamap / overview 相关资源，并对多个候选贴图做了真实提取和尺寸核对。结论是：本地 `panorama/images/textures/minimap_game_png.vtex_c` 是写实风格，但分辨率只有 `400x400`；本地 `panorama/images/textures/dotamap683_psd.vtex_c` 则是简易风格，但分辨率可达 `1024x1024`。
- `frontend/scripts/sync-dota-game-assets.js` 已更新 minimap 提取策略：`minimap.png` 现在优先由本地写实版 `minimap_game_png` 生成，`minimap_simple.png` 会单独保存本地高分辨率简易图；原有 `background.png` 与 `dotamap.png` 继续保留，方便后续对照或回退。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 已同步调整地图背景回退顺序：默认先尝试 `minimap.png`，若缺失则优先回退到新的 `minimap_simple.png`，再回退到历史 `minimap_740.png / minimap.jpg`。
- 本机重新同步后已确认当前仓库内小地图资产尺寸为：`minimap.png = 400x400`（写实）、`minimap_simple.png = 1024x1024`（简易）、`background.png = 96x96`、`dotamap.png = 320x320`。也就是说，这次已经修掉了“默认图误用低清简易图”的问题。
- 本次验证：`node frontend/scripts/sync-dota-game-assets.js --patch 7.41 --vrf-cli /tmp/source2viewer-cli/Source2Viewer-CLI` → 通过；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-25）
**✅ 新增并验证本地 Dota 资源手动提取工作流，7.41 资源已完成一次真实落盘**
- 已新增 `frontend/scripts/sync-dota-game-assets.js` 与 `frontend/scripts/lib/vpkDirectory.js`。新脚本支持直接读取本机 `pak01_dir.vpk` 目录树，在 `--inspect` 模式下验证目标资源是否存在；若本机已准备好 `Source2Viewer-CLI`，则可进一步把英雄头像、英雄小图、物品图标、小地图底图与 `dota_*.txt / abilities_*.txt / items_game.txt` 手动提取到项目目录。
- 资源更新策略已从“优先 CDN 自动下载”收敛为“按 parser / patch 分支手动同步并提交到 git”。相关文档已写入 `docs/dota_asset_sync.md`，并在 `frontend/package.json` 新增了 `npm run assets:sync:dota` 入口；依赖说明也补充了官方 `ValveResourceFormat` release 的下载方式。
- 前端资源消费已同步收口：`frontend/src/renderer/components/map/DotaMapRenderer.ts` 现在优先读取新的 `minimap.png`，若该文件尚未提取则会自动回退到当前仓库里的 `minimap_740.png / minimap.jpg`；`frontend/src/renderer/data/items.ts` 也已改为优先读取仓库内 `/assets/dota/items/*.png`，再回退到后端代理与 Steam CDN。
- 本机验证：`node frontend/scripts/sync-dota-game-assets.js --inspect --patch 7.41` → 成功解析本地 `pak01_dir.vpk`，确认 `buildId=22492873` 且 `hero / item / minimap / localization / items_game` 目标资源均存在；使用官方 `Source2Viewer` macOS CLI release `18.0` 完成一次真实提取后，已落盘 `128` 张英雄头像、`127` 张英雄小图、`601` 张物品图标、`5` 张小地图相关文件与 `5` 份文本源文件；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/data/items.test.ts --reporter=verbose` → `4 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 调整回放页头部辅助徽章位置，弱化标题区拥挤感**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将原本位于标题第一行右侧的辅助上下文徽章组，从头部主标题行中移出，改为放在对阵信息下方，与 `replay 文件名 / 解析状态 / 最近解析时间` 同属元信息区。
- 这组徽章仍保留 `回放来源 / 回退时间基准 / 比赛类型 / 重解析进度` 等信息，但不再与标题和胜者信息共享同一行，头部主层级更清晰，也减少了首屏横向拥挤。
- 本次验证：`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 重排主地图头部工具条，降低分析工作台展开时的横向挤压**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将主地图标题区从单个 `flex-wrap + justify-between` 的混合工具条，重排为更接近桌面应用的两层结构：上层承载“标题说明 + 地图浮窗操作”，下层承载“时钟/状态/时长 + 当前视图状态”。
- 工作台展开时，该区域现在不再让标题、状态条、视图条和浮窗按钮同时在同一横向流里抢空间；浮窗按钮被提升到上层独立操作区，`map-status-strip` 与 `map-view-strip` 则收敛到下层，整体换行更可控。
- 同时为标题说明增加了 `max-w-2xl` 限制，避免说明文案在宽屏下无限扩张，进一步压缩右侧操作区域。
- 本次验证：`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 放宽地图主工作区整体宽度，缓解分析工作台展开后的页面挤压**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将录像主工作区的外层容器从 `max-w-[1660px]` 放宽到 `max-w-[1820px]`，让地图、HUD 与分析工作台在桌面宽屏下拥有更充裕的横向空间。
- 同一文件也同步放宽了两个关键侧栏骨架：顶部比赛选择区从 `320px` 提升到 `360px`，分析工作台展开时的左侧控制栏从 `320px` 提升到 `360px`。这样在打开工作台时，地图主体不会因为侧栏占比过紧而明显被挤压变形。
- 本次变更保持为纯布局调整，没有改动视野分析、热力图、路径或 HUD 的业务逻辑。
- 本次验证：`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 通过 ward 实体 owner 信息补出精确插眼英雄，减少前端“疑似”归属**
- `parsers/src/main/java/SimpleDemoParser.java` 现已不再只依赖前端按站位猜测插眼者，而是在 ward 实体创建/删除时直接读取 `m_nPlayerOwnerID / m_hOwnerEntity / m_hOwnerNPC`，再结合 hero 侧缓存的 `m_iPlayerID / m_nPlayerOwnerID / m_hOwnerEntity` 做反查，输出精确的 `placer_name / placer_handle / placer_team`。
- 同一 parser 已为 hero 建立 `playerId / playerOwnerId / ownerEntityRef` 三组索引表，并在 hero 删除时同步清理；视野眼位创建和销毁事件现在都会尝试挂载 `placer_*`，因此即便某些 replay 在创建瞬间拿不到 owner，删除瞬间也还有补救机会。
- `backend/parsers/models.py`、`backend/parsers/clarity_parser.py`、`backend/storage/parquet_storage.py`、`backend/routers/playback.py` 已把 `placer_name / placer_handle / placer_team` 串通到 Python 数据模型、Parquet 存储和播放接口返回。`frontend/src/renderer/pages/RealMatchViewer.tsx` 也补了一个小兜底：若 placed 事件没有 `placer_*`，但 matched destroy 事件上有，就继续按 parser 精确归属展示，不再退回“疑似插眼英雄”。
- 已重新构建 parser 并重新解析本地 `backend/data/replays/` 下的 5 场比赛。抽样结果显示精确插眼者已能稳定落盘，例如：`8729115809` 有 `86` 个 placed ward 带 `placer_name`，`8731134498` 有 `68` 个，`8736891827` 有 `54` 个，`8739045863` 有 `41` 个；样例已包含 `npc_dota_hero_storm_spirit / tiny / phoenix / batrider / jakiro / lion / warlock / dark_willow / zuus / disruptor` 等真实插眼者。
- 本次验证：`gradle -p parsers shadowJar` → 通过；本地批量重解析 5 场 replay → 通过；`backend/.venv/bin/python -m py_compile backend/parsers/models.py backend/parsers/clarity_parser.py backend/storage/parquet_storage.py backend/routers/playback.py` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 继续重构 ward 销毁解析链路，修复 signal 时间漂移并显著压低未知来源**
- `parsers/src/main/java/SimpleDemoParser.java` 已继续重构 ward 销毁归因：combat log 的 ward target 现在只接收真正的 `observer / sentry / truesight`，不再把 `shadow_shaman_ward` 这类非视野单位误当成真眼/假眼信号；同时 destroyer 候选优先级调整为 `attacker -> damageSource -> inflictor -> targetSource`，因此当实际击杀单位是 `warlock_golem / shadow_shaman_ward / lane creep` 时，会优先保留“召唤物 / 小兵”而不是被 `damageSource` 覆盖成英雄本体。
- 同一 parser 现已把 `wardDestroySignals` 纳入统一时间重算链路：`recordWardDestroySignal()` 会像 ward/position/economy 一样保存 timing snapshot，后续如果 `clock_zero_time` 从 `combatlog_game_state_5` 切换到 `raw_game_start`，signals 也会同步 `recalculateGameTimes()`。这修掉了部分 replay 中 signal 和 ward delete 事件相差 `8s+`、导致明明有 combat log 却匹配不上的核心问题。
- 匹配阶段还新增了 `destroyer_team != ward.team` 的队伍约束，避免把同时间附近的错误信号配到己方眼位上，进一步减少错配。
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已同步把 `hero_summon` 文案调整为“`被 某英雄 的召唤物排掉`”，不再只显示笼统的“召唤物”。
- 已重新构建 parser JAR，并重新解析本地 `backend/data/replays/` 下的 5 场比赛。刷新后这 5 场合计 `281` 个 ward 销毁事件里，`destroyed=128 / expired=124 / unknown=29`，相比上一轮约 `unknown=50` 继续下降；其中 `8731134498` 从 `24` 个未知来源降到 `12`，`8739045863` 已清零，`8729115809` 也只剩 `3` 个未知来源。
- 仍残留的 `29` 个 unknown 主要集中在 `8736891827` 与 `8731134498` 的少数事件。抽样 probe 显示其中一部分 replay 在这些时点根本没有对应的 ward combat-log death signal，因此后续若要继续压低未知来源，需要补一条实体级/游戏事件级的额外归因通道，而不是继续堆前端兜底。
- 本次验证：`gradle -p parsers shadowJar` → 通过；本地批量重解析 5 场 replay → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 视野销毁来源归因加强，并批量刷新本地 replay 产物**
- `parsers/src/main/java/SimpleDemoParser.java` 已继续加强 ward 销毁归因：combat log 的 ward destroy signal 现已写入与 ward 删除事件相同口径的 `game_time`，匹配窗口从 `±2.5s` 放宽到 `±5s`；在匹配前还会用已知的插眼事件为销毁事件回填 `x/y/team`，避免删除时拿不到实体坐标导致距离约束完全失效。
- 同一 parser 现已在 `enrichWardDestroyEvents()` 内显式区分 `destroyed / expired / unknown`：对于未匹配到销毁者、但寿命接近该类型眼位自然寿命的事件，会直接标记为 `expired`，不再混进“来源未明”的排眼统计里。
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 与 `frontend/src/renderer/api/backend.ts` 已同步消费新的 `destroy_reason='expired'`，并把假眼/真眼的生命周期口径拆分为 `observer=360s / sentry=420s`；页面现在会把这类事件展示成“自然到时”，不再误写成“被排掉（来源未明）”。另外守卫类单位来源也补了中文显示，不再出现 `observer wards / sentry wards` 这种内部名。
- 已用新的 parser JAR 重新解析本地 `backend/data/replays/` 下的 5 场比赛：`8729115809 / 8731134498 / 8732912726 / 8736891827 / 8739045863`。刷新后这 5 场合计 `281` 个销毁事件里，`149` 个已经带明确 `destroyer_name`，`82` 个被识别成 `expired`，不再落入未知来源。
- 抽样结果：`8729115809` 从原先几乎全是 `unknown`，提升到 `76` 个销毁事件里 `62` 个带明确来源、`14` 个识别为自然到时。
- 本次验证：`gradle -p parsers shadowJar` → 通过；本地批量重解析 5 场 replay → 通过；`backend/.venv/bin/python -m py_compile backend/parsers/models.py backend/parsers/clarity_parser.py backend/storage/parquet_storage.py backend/routers/playback.py` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx src/renderer/api/backend.test.ts --reporter=verbose` → `18 passed`；`cd frontend && npm run build` → 通过。

### 最新完成任务（2026-03-23）
**✅ 修复单场击杀 / 死亡热力图显示异常，并兼容旧 replay 数据**
- `backend/analyzers/heatmap_analyzer.py` 已修复 kill/death 热力图的时间过滤口径：优先使用稳定的 `game_time`，旧 `kills.parquet` 没有该字段时会回退到 `time - game_start_time`，不再把 combat log 原始时间直接拿来和前端比赛时钟比较。
- 同一分析器现已补上旧数据坐标回填：当历史 kill 事件缺少 `x/y` 时，会按受害者优先、击杀者兜底，从 `positions.parquet` 里回填最接近击杀时刻的死亡点位；英雄短名与 `npc_dota_hero_*` 内部名也已统一归一化，因此像 `8729115809` 这类历史比赛现在能重新生成 kill/death 热力格子。
- `backend/parsers/models.py`、`backend/parsers/clarity_parser.py`、`backend/storage/parquet_storage.py` 和 `parsers/src/main/java/SimpleDemoParser.java` 已把 kill 事件的 `game_time` 字段串通到 parser -> JSON -> Parquet，后续新解析的比赛不再依赖兼容回推。
- `frontend/src/renderer/api/backend.ts` 已把单场热力图请求的 `hero` 参数收口为单英雄契约，不再向仅支持单英雄的后端端点重复发送多个 `hero` 查询参数；`frontend/src/renderer/api/backend.test.ts` 已补回归，同时确认 paths 仍保留多英雄查询。
- 本次验证：`cd backend && ./.venv/bin/python -m pytest tests/test_heatmap_analyzer.py -q` → `4 passed`；`gradle -p parsers compileJava` → 通过；`backend/.venv/bin/python -m py_compile backend/parsers/models.py backend/parsers/clarity_parser.py backend/storage/parquet_storage.py backend/analyzers/heatmap_analyzer.py backend/routers/visualization.py` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/api/backend.test.ts --reporter=verbose` → `2 passed`；`cd frontend && npm run build` → 通过。额外抽样 `8729115809` 时，analyzer 已能返回 `kill 47 samples / 46 cells` 与 `death 47 samples / 46 cells`。

### 最新完成任务（2026-03-23）
**✅ 统一单场视野分析与热力图/路径的主模式按钮逻辑**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已把单场视野分析的主模式切换从“下拉 + 快捷按钮”收敛为和热力图一致的按钮组：`当前存活 / 所选区间 / 整场` 现在直接作为主模式按钮展示，交互层级与热力图模式切换保持一致。
- 地图工作台顶部摘要条也补上了 `视野` 状态，折叠和展开时都会和 `热力图 / 时间范围 / 路径` 一起显示，避免视野状态只出现在局部区域、造成显示逻辑不一致。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已同步调整回归，覆盖新的视野模式按钮切换逻辑。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`

### 最新完成任务（2026-03-23）
**✅ 单场视野分析与实时视野解耦，并补回插眼英雄归属信息**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 现已把地图上的“实时视野”和“单场视野分析”彻底拆开：当视野地图切到 `整场` 或 `所选区间` 时，主地图会自动进入 ward focus，只保留眼位本身，临时隐藏英雄头像、热力图、路径和死亡爆点；右侧实时视野统计仍继续按当前时间轴更新，不再互相干扰。
- hover / pinned 眼位详情、最近视野变化、整场全部眼位、整场排眼记录现在都会额外显示“插眼归属”。当前版本优先消费未来可能存在的 parser `placer_*` 字段；若 replay 数据链路还没有该字段，则会根据插眼时刻附近的同队英雄站位做 best-effort 匹配，并明确标注为“疑似插眼英雄”。
- 已复核 parser/backend 现状：当前 ward API 仍只有 `destroyer_*` 精确字段，没有现成的 `placer_*` 字段，因此这次“插眼英雄”属于前端推断能力；如果后续 parser 增加 owner 归属，前端可以直接无缝切到精确展示。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已补回归，覆盖 ward focus 进入后 hero 图层自动清空、整场/区间视野仍正常展示，以及 hover 详情中的插眼英雄信息。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`

### 最新完成任务（2026-03-23）
**✅ 单场视野分析补回整场全部眼位与排眼记录**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已把“整场全部眼位”和“整场排眼记录”重新补回单场视野分析面板，并新增“一键查看整场全部眼位”快捷入口；这两块列表尊重当前队伍与真假眼筛选，但不再受时间区间限制，方便直接核对全场插眼与排眼。
- 视野面板现在会把整场排眼来源按 `英雄 / 召唤物 / 小兵 / 中立 / 其他单位 / 未知` 分组计数，并在列表中展示每个眼位的插下时间、被排时间与排眼来源文案，恢复了之前解析器重构带来的来源信息消费链路。
- 已复核 parser/backend 链路仍然保留 `destroyer_name / destroyer_kind / destroyer_team / destroyer_is_hero` 字段；如果旧比赛仍显示来源未明，需要重新解析对应录像以刷新历史产物。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已补充回归，覆盖“整场全部眼位”“整场排眼记录”和“一键查看整场全部眼位”入口。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`

### 最新完成任务（2026-03-22）
**✅ 单场视野分析补齐 hover / 点击固定，并把工作台重排为左侧分析栏**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已把 replay 地图区改成“左侧 sticky 分析栏 + 右侧主地图舞台”的工作区结构；控制项不再堆在地图上方，地图尺寸会随工作台展开状态继续放大，减少了查看视野时的纵向滚动。
- 视野数据现已从 `WardsResponse` 统一构造成单场 ward 生命周期记录，前端按 `6:00` 口径补齐自然到时、被排时间、持续时长与销毁来源，并修正了当 tick 样本稀疏时视野区间被错误压扁的问题。
- `frontend/src/renderer/components/map/DotaMapRenderer.ts` 与 `frontend/src/renderer/components/map/MapViewer.tsx` 已补上 ward hover / click 交互事件；地图 hover 会在鼠标旁弹出详情浮窗，点击后可固定窗口，再点地图空白即可取消固定。
- 重叠 ward 现在会在同一个浮窗里并排展示，详情卡会同时显示插下时间、持续时间、消失/被排时间和排眼来源；主地图也会同步高亮当前 hover 或 pinned 的 ward。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已更新并补回归，覆盖新的视野工作台统计、hover 多眼位详情和点击固定交互。
- 本次验证：`cd frontend && npm run build` → 通过；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `16 passed`

### 最新完成任务（2026-03-21）
**✅ 修复 8736891827 时间轴整体漂移与召唤物误入英雄回放**
- `parsers/src/main/java/SimpleDemoParser.java` 已修正 `clock_zero` 判定：当 `m_flPreGameStartTime -> m_flGameStartTime` 仍然保持标准 `90s` 间隔时，不再重复减去 `pregame_paused_seconds`，避免像 `8736891827` 这种 replay 被整体错误平移约 `691.7s`。
- 已使用新 parser 重新解析 `backend/data/replays/8736891827.dem`，样本现已恢复到正确的开局时基：`backend/data/matches/8736891827/positions.parquet` 首批样本回到 `-111.7s`、`wards.parquet` 首个眼位回到 `-88.6s`，`meta.json` 的 `game_start_time` 也从 `169.96674` 修正为 `861.7001`，`clock_zero_source` 更新为 `raw_game_start`。
- `backend/routers/playback.py` 已按 `metadata.players` 过滤 playback 里的真实玩家英雄，避免 `Beastmaster_Boar` / `Beastmaster_Hawk` 这类召唤物继续混进 `/ticks`、`/heroes`、`/hud`，同时顺手修复了 `/playback/{match_id}/heroes` 在双方同英雄时只算 9 个英雄的去重问题。
- 继续追查后发现，这场 replay 还存在一段被截断的“负时间暂停”：10 个英雄在 `-86.7s` 到 `0:00` 前后整段不动，但旧的 `pause_intervals` 只从 `0:00` 开始记录，导致前端进度条少画了约 `86s` 的橙色暂停段。现已调整 parser 的 pause 跟踪起点，从 `clock_zero` 前移到 `pregame_start_time`，重新解析后 `backend/data/matches/8736891827/meta.json` 中该段 pause 已变为 `replay_start_time=775.0 / game_time=-86.70001 / duration_seconds=691.7333`，`positions.parquet` 里对应冻结区间的 `game_time` 也已正确保持不变。
- 本次验证：`cd backend && ./.venv/bin/python -m pytest tests/test_playback_hud_contract.py tests/test_timeline_regression.py -q` → `37 passed, 8 skipped`；并用 `TestClient` 验证 `8736891827` 的 `/ticks` 首批 `game_time=-111.70007`、`time_basis.pause_intervals[0].game_time=-86.70001`，且响应中已不再包含 `Beastmaster_Boar`。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 页头与主区栏宽再次收口**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已继续压缩下载台页头和主区布局：页头卡片在本页局部收紧了圆角与内边距，KPI 区最小宽度同步缩小；主区双栏布局的间距从 `gap-4` 收到 `gap-3`，右侧侧栏宽度也从 `340px` 收到 `320px`。
- 这次调整不改动页面结构，只是把整体“壳层”再压紧一档，让搜索页更贴合内容本身，不会因为外围容器太宽/太厚而显得头重脚轻。
- 本次验证：`cd frontend && npm run build` → 通过；真实 Chromium 页面验证 `workspace-header` 约 `1116x308`，主区网格约 `1116x581`，页面仍无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 联赛横幅头图缩尺收口**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已在不改变“纵向横幅头图”结构的前提下，继续压缩联赛区体量：头图改为居中且带 `max-width` 的横幅框，顶部标签、底部标题卡和内边距都同步缩小一档，避免联赛头图继续压过下方对阵内容。
- 这次调整保留了 banner 作为主视觉的表达方式，但把视觉重心从“大面积占高”收回到“更紧凑的头图提示”，更适合作为比赛卡中的一段上下文信息，而不是主页面 Hero 区。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证首张联赛区整体约 `716x353.5`，其中横幅头图约 `628x246.5`，较上一版 `682x267.6` 明显收缩，且页面仍无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 联赛区重规划为纵向横幅头图**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已将联赛区从“左图右信息”的分栏布局重构为真正的纵向 banner 头图区：横幅图独占上半区，联赛名/来源/联赛号直接叠在横幅上，下半区再承载赛道、数据状态、最近同步与检索标签，避免 banner 比例与右侧留白互相打架。
- 新版横幅不再依赖把联赛图塞进固定侧栏宽度，而是让 banner 按统一的 `1024:400` 视觉比例占满整条内容列，更适合 OpenDota 常见联赛素材。
- 回归测试已同步到 `frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 与 `frontend/src/renderer/pages/OpenDotaLivePage.richResults.test.tsx`，断言收口到新的横幅文案结构。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证首张联赛区整体约 `716x374.6`，其中横幅头图约 `682x267.6`，下方共有 `4` 个元信息卡片，页面仍无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 比赛卡主轴对齐优化 + 联赛横幅信息补全**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已将比赛卡重排为统一的三列骨架：左侧勾选、中间内容主轴、右侧状态/工作流。顶部比赛摘要、联赛横幅和下方天辉/夜魇阵容现在共用同一条内容列，不再出现上中下块左右边界错位的问题。
- 联赛横幅改为更完整的横向信息块：左侧保持宽幅 banner 预览，右侧新增赛道、联赛 ID、数据状态、最近同步等元信息，解决“联赛图右侧空间大片空白”的视觉问题。
- 路人局比赛的对阵卡已不再回退为“未知战队”；当没有职业战队名时，会改用 `天辉 / 夜魇` 作为主标题，更符合公开匹配语义。
- `frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 与 `frontend/src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` 已补充联赛横幅元信息与“路人局不显示未知战队”的回归。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证首张比赛卡 `meta / badge / radiant` 左边界均为约 `420px`，联赛横幅约 `716x254`、banner 图像约 `370x112`，页面无横向溢出，且 `未知战队` 命中数为 `0`。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 联赛徽章改为横向 banner，并隐藏路人空壳**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 的联赛徽章再次上调了视觉权重，并把图片从正方形视觉改成横向 banner 预览：联赛资源现在优先选 `banner/image`，再回退 `icon/logo`，图像区域明显更宽，联赛名和副标题仍然保持层级分明。
- 对于路人比赛且没有联赛元数据的记录，联赛徽章现在会直接返回 `null`，并且调用处也不再渲染这整行，避免在空数据场景下保留一块空壳。
- `frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 与 `frontend/src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` 已补充“职业/联赛结果应显示徽章”和“路人无联赛信息时徽章完全隐藏”的回归。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证 `live-league-badge` 首个徽章约 `459x122`、图像区域约 `248x96`，`public` 且无联赛元数据时徽章不存在，且页面仍无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 联赛徽章二次强化，提升图标权重**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已将比赛卡顶部的联赛信息从普通小胶囊继续强化为更明确的联赛徽章块：图标放大到更稳定的视觉尺寸，联赛名与副标题重新分层，职业联赛与路人来源也采用了更清晰的色彩语义。
- 新版联赛徽章在不改变整张比赛卡信息架构的前提下，解决了“联赛图标偏小、视觉锚点不够明显”的问题，同时保持默认列表和搜索结果的一致表现。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证 `live-league-badge` 共 `20` 个，首个徽章约 `236x70`、图标约 `48x48`，且页面仍无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 结果区卡片化重构，消除英雄/玩家撑表问题**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已将结果区从横向数据表彻底改为纵向“比赛卡列表”：每场比赛现在拆成顶部摘要、左右对阵阵容卡和右侧工作流卡，保留勾选、批量入库、单场入库、状态详情、下载/解析状态等功能，但不再因为英雄头像和玩家信息把整页表格横向撑爆。
- 阵容展示已从旧版“表格单元格里嵌套长列表”改为更紧凑的 player-first 双列卡片，优先显示玩家名，再显示英雄和玩家 ID；同时保留胜方高亮、队标、击杀数和联赛/路人来源信息。
- 结果区工具栏现在单独承载“全选当前页”和页内统计，默认页/搜索页都不再依赖 table header 承载复杂内容，桌面和中等宽度下的可读性都明显更稳定。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过；真实 Chromium 页面验证 `/#/openDotaLive` 命中 `20` 张 `live-match-card`、`0` 个 `table`，`bodyScrollWidth === innerWidth`，确认无横向溢出。

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 默认列表阵容补齐 + 对阵表信息收口**
- `backend/routers/remote.py` 的默认 enriched list 现在不只会在队名/联赛名缺失时回填 detail；如果 `opendota_match_players` 里还没有该场比赛的玩家身份，也会触发一次 best-effort detail backfill，再重新查询列表，修复了“默认第一页职业比赛能看到对阵，但英雄和玩家经常是空的”问题。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已去掉单独的“胜者”列，胜负只保留在天辉/夜魇对阵卡内部展示，避免和现有 UI 重复表达。
- 同页联赛列现在对没有联赛归属的记录统一显示为“路人”，不再落成“未知联赛”，更符合公开匹配语义。
- `backend/tests/test_remote_routes.py` 已新增默认列表缺少玩家身份时自动补抓详情的回归；`frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 与 `frontend/src/renderer/pages/OpenDotaLivePage.richResults.test.tsx` 已补齐“胜者列移除”和“路人标签”断言。
- 本次验证：`cd backend && ./.venv/bin/python -m pytest tests/test_remote_routes.py -q` → `18 passed`；`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `8 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 后端统一搜索/默认 feed 重构**
- `backend/routers/remote.py` 已将 `/api/v1/remote/search` 收敛为单入口 enriched feed：支持单一 `q` 统一搜索 `match_id / player_id / player_name / league_id / league_name`，并在无查询时直接返回默认 enriched match rows。
- `q` 现在成为前端统一搜索框的唯一主链路：支持中英文 `比赛/玩家/联赛` 与 `match/player/league` 前缀；纯文本会联合覆盖玩家名与联赛名命中，纯数字会按常见 ID 规则自动判断。
- 路人局比赛号（例如 `8735428765`）不再误走玩家查询链路；单纯比赛 ID 查询会直接回填 match detail，避免再出现“OpenDota 搜索失败，请重试”的整页错误。
- 显式类型前缀的无效输入（如 `比赛 abc`）现在会稳定返回空结果，不会再悄悄回退到默认列表。
- 默认列表与空搜索现在强制回到职业局优先，不再把一堆公开路人局混进默认工作台；显式 `match_id/leagueid` 仍可按需查看 public 记录。
- 已确认当前主机访问 OpenDota 官方接口时会收到 `429 {"error":"daily api limit exceeded"}`；`OpenDotaService` 现已将 429 明确翻译为可读错误，`remote.search` 响应新增 `message` 字段，能把“只能返回本地已缓存结果”的原因透出给前端，而不是继续沉默空结果。
- `backend/main.py` 的后台远端镜像同步已改成更保守的默认值：只自动同步职业局、默认 10 分钟周期、命中 rate limit 后自动退避到更长间隔，避免后台循环继续把 OpenDota 日额度烧空。
- 远端搜索已改成 best-effort：单场 `match_id` detail 拉取失败不会再把整页打成 `502`，而是尽量返回已有结果或空列表；响应中补齐 `hero_ids`、`players / radiant_players / dire_players`、胜负等摘要字段。
- `docs/api_specification.md` 已同步更新 remote search 契约说明，`backend/tests/test_remote_routes.py` 也补上了默认 feed、`q` 搜索和公共局失败回退的回归覆盖。
- 本次验证：`cd backend && ./.venv/bin/python -m pytest tests/test_opendota_service.py tests/test_remote_routes.py -q` → `32 passed`；`cd backend && ./.venv/bin/python -m pytest -q` → `205 passed, 9 skipped`

### 最新完成任务（2026-03-20）
**✅ OpenDota Live 前端搜索分流收口**
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已收口为单输入统一搜索台，不再暴露职业 / 路人区分。
- 默认列表已改回职业比赛优先，只在搜索态使用职业 + 路人的全量统一搜索；自动同步与手动同步也回到职业源，避免默认页混入一堆公开路人局。
- 搜索框现在默认鼓励直接输入比赛号、玩家名、联赛名，也支持 `比赛/玩家/联赛` 与 `match/player/league` 前缀显式指定；搜索请求已重新收口为只发送原始 `q`，不再把 `q` 与结构化参数混发后导致名字搜索被交集打空。
- 默认列表和搜索结果都改为更富的英雄 + 玩家展示，包含双方阵容、玩家名/ID 与胜者信息，方便在下载前直接筛选录像。
- `OpenDotaLivePage.test.tsx` 已新增默认职业列表、显式无效前缀输入和统一搜索请求回归，`OpenDotaLivePage.richResults.test.tsx` 覆盖富结果展示。
- 页面现在会展示上游限流提示：当 `DreamLeague`、`8735428765` 这类查询因为 OpenDota 日限额无法补抓时，界面会明确说明“当前只能返回本地已缓存结果”，不再只剩下模糊的失败或空白。
- 浏览器级验证已通过：在真实 Chromium 页面里拦截 `/api/v1/remote/matches` 与 `/api/v1/remote/search`，确认初始请求 `include_public=false`、搜索 `Ame` 时实际请求为 `.../remote/search?q=Ame&...include_public=true`、搜索 `8735428765` 时请求为 `.../remote/search?q=8735428765&...include_public=true`，`DreamLeague` 与 `8735428765` 两个搜索都会显示 `daily api limit exceeded` 提示与空结果态，而不再出现 `OpenDota 搜索失败，请重试。`
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/OpenDotaLivePage.richResults.test.tsx --reporter=verbose` → `7 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay HUD 玩家名默认态改为金色高亮**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将英雄名下方那一行玩家名默认态改为金色高亮，未选中时也能稳定识别；被热力图或路径分析选中后，会切换成更强的青色发光态，与默认态明确区分。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已补充玩家名默认金色态与选中青色态的双态断言，避免只高亮下方 meta chip 的回退。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `14 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay HUD 玩家 ID 默认态改为金色高亮**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已将 HUD 英雄卡里的 `玩家 ID / 职业名` meta chip 默认态改为金色高亮，未选中时也能稳定识别；被热力图或路径分析选中后，仍会切换为更强的青色高亮效果，形成明确状态区分。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已新增默认金色态与选中青色态的双态回归断言，锁住视觉语义。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `14 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay HUD 玩家 ID 高亮补强**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已补强 HUD 英雄卡中 `玩家 ID / 职业名` meta chip 的选中态样式；当英雄被热力图或路径分析选中时，玩家 ID 现在会与选手名一起显著高亮，不再只是很轻的 cyan 边框。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已新增玩家 ID 高亮类名断言，锁住 meta chip 的高亮表达。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `14 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ 多页面动作按钮稳定化 + 中文标签防竖排**
- `frontend/src/renderer/index.css` 新增 `workspace-action-row` / `workspace-action-button` / `workspace-chip-button`，并把 `workspace-subtle-button` 收口为 `inline-flex + whitespace-nowrap`，避免中文按钮在中等宽度下被挤成多行或看起来像竖排。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 已移除动作区和批量区里会在特定断点反向改成单列的按钮网格，改为统一动作行；查询/清空/批量入库等按钮补齐 `min-width` 与 `nowrap`，不再在 `2xl` 附近重新竖排。
- `frontend/src/renderer/pages/ReplayLibraryPage.tsx` 与 `frontend/src/renderer/pages/MatchDatabasePage.tsx` 的筛选动作区已改成统一按钮行；`frontend/src/renderer/pages/TeamProfilePage.tsx` 的查询、预设和“当前可见动作”按钮也同步收口，并对超长文案做了适度缩短与 `title` 保留。
- `frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 已补充“不再包含 `2xl:grid-cols-1` 按钮堆叠”的回归。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/ReplayLibraryPage.test.tsx src/renderer/pages/MatchDatabasePage.test.tsx src/renderer/pages/TeamProfilePage.test.tsx --reporter=verbose` → `71 passed`；`cd frontend && npm run build` → 通过；本地 Playwright 宽度审计显示 `openDotaLive / replayLibrary / matchDatabase / teamProfile` 在 `1360 / 1512 / 1728` 宽度下仍无横向溢出。

### 最新完成任务（2026-03-18）
**✅ 桌面工作台多分辨率收口 + OpenDota 实时筛选区重排**
- `frontend/src/renderer/components/DesktopLayout.tsx` 已收紧中等宽度下的工作台壳层：侧栏宽度、外边距、主区 header 间距与圆角都做了分级压缩，页面标题区延后到 `2xl` 才强制左右并排，减少 14 寸 MacBook 这类宽度下的横向拥挤。
- `frontend/src/renderer/index.css` 的 `workspace-*` 共享 token 已同步调整：页面/卡片 padding、header 断点、KPI 网格、输入高度和表格外壳都更适合中等桌面宽度，避免每个页面单独补丁式修布局。
- `frontend/src/renderer/pages/OpenDotaLivePage.tsx` 的“筛选实时比赛”区域已重排为统一高度的分组卡片：来源、比赛 ID、联赛 ID、动作四块对齐；批量入库区也同步压缩为更紧凑的摘要 + 动作布局，不再出现旧版 checkbox / input / button 基线错位。
- `frontend/src/renderer/pages/OpenDotaLivePage.test.tsx` 已新增下载页响应式筛选结构回归。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/App.matchDatabaseNavigation.test.tsx src/renderer/App.teamProfileNavigation.test.tsx src/renderer/pages/OpenDotaLivePage.test.tsx src/renderer/pages/ReplayLibraryPage.test.tsx src/renderer/pages/MatchDatabasePage.test.tsx src/renderer/pages/TeamProfilePage.test.tsx --reporter=verbose` → `73 passed`；`cd frontend && npm run build` → 通过；本地 Playwright 宽度审计显示 `openDotaLive / replayLibrary / matchDatabase / teamProfile` 在 `1360 / 1512 / 1728` 宽度下均无横向溢出。

### 最新完成任务（2026-03-18）
**✅ Replay 页头 14 寸断点收口 + 返回按钮脱离覆盖层**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已把顶部比赛选择区延后到 `2xl` 断点才左右分栏，14 寸 MacBook 宽度会优先走堆叠布局，避免右侧选择面板挤压左侧页头信息。
- `frontend/src/renderer/App.tsx` 的“返回工作台”按钮不再使用绝对定位覆盖在回放内容上，而是移入独立的顶部栏正常占位；中等宽度下保持紧凑图标优先样式，`2xl` 才恢复完整文案密度。
- `frontend/src/renderer/App.matchDatabaseNavigation.test.tsx` 已补充回放页壳层 / 顶栏 / 按钮不再为 `absolute` 的回归，确保后续不会回退成遮挡式布局。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/App.matchDatabaseNavigation.test.tsx src/renderer/App.teamProfileNavigation.test.tsx --reporter=verbose` → `2 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay 页 HUD lane 头部按钮回归 + playerDisplayMeta 文案修正**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已恢复 lane 头部的“全部展开/收起”按钮，并保持头部为紧凑双行布局；说明文字不再 `truncate`，可完整展示。
- 同页已移除英雄卡右上角箭头指示器，改由按钮 `title` / `aria-label` 提供 hover/focus 提示；选手名高亮色改得更醒目。
- `playerDisplayMeta` 已统一修正：当 `persona/pro` 实际显示为数字账号 ID 时，文案统一为更准确的 `玩家 ID ...`。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已补回 lane 批量展开回归，并新增数字账号 ID 文案回归。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `13 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay 页 HUD lane 头部单行化 + 英雄卡整卡展开/收起**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 已移除 HUD lane 头部的展开计数 tag，并把说明压成单行摘要，lane 头部更紧凑。
- 同页单英雄展开按钮已删除，改为点击整张英雄卡切换展开/收起；展开态通过更明显但克制的边框/背景/指示器差异区分。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 已更新为整卡点击回归，并补充 lane 头部去 tag、展开态样式与再次收起的断言。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `12 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay 页 HUD 动作行重排 + 选手名提亮**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 现已将单英雄“展开/收起”按钮移到血条下方的独立动作行，不再与英雄名、选手名和 KDA 争抢同一行宽度。
- HUD 选手显示名与 meta chip 提高了对比度，展开按钮保持固定 pill 形态；lane 头部也改成更紧凑的摘要条，减少“全部展开”和说明文案的纵向占用。
- `frontend/src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx` 新增动作行与选手名样式回归，确认按钮仍稳定且位于独立操作区。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `11 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay 页 HUD 展开按钮稳定化 + 主地图信息条瘦身**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 现已将 HUD 英雄详情展开按钮固定为稳定的 pill 形态，补齐 `inline-flex` / `min-w` / `whitespace-nowrap` / `shrink-0`，避免展开前后在不同布局下出现圆按钮和长条按钮来回切换。
- 同页主地图上方与下方的信息条已做最小重构：将密集的状态 chip 与统计卡压缩为更少的紧凑信息块，保留比赛时钟、图层、时间范围、路径、样本和偏移秒数等关键信息，同时让地图与时间轴获得更高优先级。
- 新增 Vitest 回归用例，覆盖 HUD 展开按钮的稳定样式与切换前后 `aria-expanded` 行为。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `11 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Replay Workspace HUD 同步静默化，消除播放中 workbench 跳动**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 现已将 HUD 的“同步中”状态限制在首次空数据加载阶段，播放中的后续 HUD 刷新改为静默更新，避免 workbench 因状态反复进出而持续跳动。
- 同步保留了首次 HUD 加载提示与错误提示；刷新过程中不再提前清空既有的 HUD 警告/错误展示，减少闪烁。
- 新增 Vitest 回归用例 `keeps HUD refreshes quiet after the first load so the workbench does not keep jumping`，覆盖首次加载显示同步中、后续 scrub 刷新不再重新显示同步中的行为。
- 本次验证：`cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `10 passed`；`cd frontend && npm run build` → 通过

### 最新完成任务（2026-03-18）
**✅ Playback 时间轴改为按 `game_time` 截止，避免 8729115809 这类比赛提前结束**
- `backend/routers/playback.py` 的 `GET /api/v1/playback/{match_id}/ticks` 现在优先按 `game_time` 过滤 `start_time/end_time`，仅在缺少 `game_time` 时回退到 tick 过滤。
- `backend/tests/test_playback_pause_contract.py` 更新为 `game_time` 语义回归；`backend/tests/test_playback_e2e.py` 新增 `8729115809` 真实样本尾部回归，确认 `end_time=1937` 不再把后半段样本裁掉。
- 本次验证：`cd backend && ./.venv/bin/python -m pytest tests/test_playback_pause_contract.py -q` → `3 passed`；`cd backend && ./.venv/bin/python -m pytest tests/test_playback_e2e.py -q` → `25 passed, 1 skipped`；`cd backend && ./.venv/bin/python -m pytest tests/test_timeline_regression.py -q` → `20 passed, 8 skipped`

### S-Next 执行看板（补充）
| ID | 任务 | 状态 | 结果摘要 |
|----|------|------|----------|
| SN-1 | 全链路回归测试矩阵 | `DONE` | 核心后端回归稳定通过 |
| SN-2 | 性能基线落地 | `DONE` | 产出 `backend/data/baselines/sn2_baseline_20260227_014013.json` |
| SN-3 | 两场样本时间轴回归 | `DONE` | 负时间/近 0:00/pause 契约通过 |
| SN-4 | 前端时间轴最终对齐 | `DONE` | Timeline/HUD/pause 时基已统一并通过回归 |
| SN-5 | Pause-aware 边缘场景收口 | `DONE` | ticks/wards/advantage 与 HUD 暂停点一致性通过 |
| SN-6 | smokes 最小可用实现 | `DONE` | `/playback/{match_id}/smokes` 已非占位化 |
| SN-7 | 文档状态对齐 | `DONE` | `docs/api_specification.md` 与实现对齐 |
| SN-8 | 冲刺验收与 Phase 5 准入清单 | `DONE` | 全量验证、样本重解析与 PH4 收口已形成验收基线 |

### 最近一次回归验证
- 后端: `./.venv/bin/python -m pytest -q` → `176 passed, 8 skipped`
- 前端: `npx vitest run` → `98 passed`
- 构建: `npm run build` → 通过

### 本次增量验证（2026-03-18）
- 后端: `cd backend && ./.venv/bin/python -m pytest tests/test_opendota_match_storage.py tests/test_match_routes_context.py tests/test_matches_routes_enrichment.py tests/test_matches_duration_source.py -q` → `26 passed`
- 前端: `cd frontend && CI=1 ./node_modules/.bin/vitest run src/renderer/pages/RealMatchViewer.hudMetrics.test.tsx --reporter=verbose` → `9 passed`
- 构建: `cd frontend && npm run build` → 通过
- Parser/时长修复: `cd backend && ./.venv/bin/python -m pytest tests/test_clarity_parser_postgame_trim.py tests/test_match_storage_duration.py tests/test_matches_duration_source.py tests/test_match_routes_context.py tests/test_matches_routes_enrichment.py tests/test_opendota_match_storage.py -q` → `31 passed`
- Java parser: `cd parsers && gradle shadowJar` → `BUILD SUCCESSFUL`

### 最新完成任务（2026-03-18）
**✅ 终场后统计裁剪 + 录像真实时长修复（样本 8729115809）**
- 调查结论：`8729115809` 的 parser metadata 其实早就识别到了正确终场时长（约 `1936.6s`），真正的问题是 Java parser 在检测到胜负后仍继续写入 positions / economy 等样本，SQLite `matches.duration` 还额外取了 `total_ticks/30` 的更大值，导致回放页面时间轴、热力图和路径分析被拖到赛后阶段。
- `parsers/src/main/java/SimpleDemoParser.java` 现已记录 `final_whistle_game_time` / `final_whistle_replay_time`，并在输出 `positions` / `economy` / `wards` / `kills` / `pause_intervals` 前裁掉终场后的样本。
- `backend/parsers/clarity_parser.py` 新增 post-game safety trim，作为 parser pipeline 的第二层兜底；`backend/storage/parquet_storage.py` 会把终场字段持久化到 `meta.json`。
- `backend/storage/match_storage.py` 与 `backend/routers/matches.py` 现改为在已识别胜负时优先采用终场时长，而不是继续信任 replay container 长度。
- 已对样本 `8729115809.dem` 重新解析落盘：`data/matches/8729115809/meta.json` 现包含 `final_whistle_game_time=1936.5665`、`final_whistle_replay_time=2963.2`；`positions/economy` 最大 `game_time` 已收敛到 `1936.3666`；SQLite `matches.duration` 已更新为 `1937`。
- 本次相关验证已通过：后端 `31 passed`、Java parser 构建成功，并完成样本 `8729115809` 的真实重解析验证。

### 最新完成任务（2026-03-18）
**✅ Replay Workspace 英雄聚焦高亮 + 队伍名/胜方/玩家展示 ID**
- `frontend/src/renderer/pages/RealMatchViewer.tsx` 现已支持热力图与路径分析的多英雄选择；被选中的英雄会在左右 HUD 中按天辉/夜魇主题高亮，清空为“全部英雄”时不会全员高亮。
- 顶部对阵区改为优先显示 `radiant_team_name` / `dire_team_name`，职业局展示战队名，路人局回退天辉/夜魇；同时统一显示胜方 badge 和双方胜者态。
- HUD 英雄卡默认就会显示玩家识别信息：职业局优先显示 `pro_name/display_name`，路人局优先显示 `persona_name`，仍保留 parser metadata 作为最终回退。
- `frontend/src/renderer/api/backend.ts` 已兼容新的 `/api/v1/matches/{match_id}/players` 返回结构，并同步放宽 `winner_team` / `parsed_at` 类型；旧版 `MatchListPage` 也已补齐新旧胜方格式兼容。
- `backend/routers/matches.py`、`backend/storage/opendota_match_storage.py`、`backend/database/sqlite_db.py` 已打通 OpenDota players identity 缓存、比赛上下文 enrich，以及 `/api/v1/matches/{match_id}/players` 的职业/路人展示名策略。
- 本次相关回归已通过：后端 `26 passed`、前端 HUD 场景 `9 passed`、前端构建通过。

### 最新完成任务（2026-03-18）
**✅ Matches API 比赛上下文增强 + OpenDota 玩家身份缓存**
- `backend/database/sqlite_db.py` 新增 `opendota_match_players` 表，并为 `opendota_matches` 扩展 `is_professional` / `radiant_win` 字段与兼容迁移。
- `backend/storage/opendota_match_storage.py` 现会在 `upsert_match_detail()` 时同步 upsert OpenDota players 身份信息，支持重复写入更新。
- `backend/routers/matches.py` 已为 `/api/v1/matches`、`/api/v1/matches/{match_id}` 补齐 `radiant_team_name` / `dire_team_name` / `league_name` / `source` / `is_professional` / `radiant_win` enrich 字段。
- `backend/routers/matches.py` 的 `/api/v1/matches/{match_id}/players` 已支持 `persona_name` / `pro_name` / `display_name` / `display_type`，并按职业/路人上下文选择展示名；若 OpenDota players 缓存缺失但 match 上下文已存在，会 best-effort 在线补抓 detail 后落库，失败则回退本地 parser metadata。
- 新增后端测试覆盖 `upsert_match_detail()` 玩家身份落库、`matches` enrich 响应、玩家展示名 fallback 策略。
- 增量验证结果：`cd backend && ./.venv/bin/python -m pytest tests/test_opendota_match_storage.py tests/test_match_routes_context.py tests/test_matches_routes_enrichment.py tests/test_matches_duration_source.py -q` → `26 passed`

### 最新完成任务（2026-03-18）
**✅ Replay Workspace 桌面化重构 + 远端搜索/物品提示闭环**
- **回放主工作区重构**:
  - `RealMatchViewer` 重排为地图优先的桌面式分析台；顶部 header 与对阵信息压缩为工具栏形态，地图时间信息移到主地图标题区。
  - 英雄 HUD 改为默认折叠，可按需展开 `NW/GPM/XPM` 与装备；地图工作台本身也改为默认折叠，仅在需要热力图/路径分析控制时展开。
  - 地图说明/图例浮窗支持拖动、关闭、重置与 `Esc` 清空；单英雄热力图/路径分析会自动清理英雄头像、眼位与死亡爆点，避免分析层遮挡。
- **录像搜索与下载体验闭环**:
  - `ReplayLibraryPage` 不再只查本地已解析录像；`player_id/leagueid` 会通过 `GET /api/v1/remote/search` 直连 OpenDota 搜索远端比赛，并回填本地下载/解析状态。
  - 远端搜索结果可直接“下载并入库”，本地已就绪比赛可直接“打开回放”，形成从发现到分析的一页式链路。
- **物品资源与提示完善**:
  - 新增 `/api/v1/assets/items/{item_name}.png` 资源代理与本地缓存，统一处理 Steam CDN 物品图标加载。
  - 物品别名、旧 parser 内部名与常见中立物品映射已补齐，HUD 装备区改成纯图标优先布局，主包/背包/中立格可稳定显示。
  - 物品 hover tooltip 已支持中英文名、中文属性/效果摘要；中立物品会额外显示附魔中文名与效果。
- **可视化表达收口**:
  - 热力图后端现已真正支持 `hero/team/start_time/end_time` 过滤，前端加入更强的可见性控制、更多时间预设与自定义时间段。
  - 页面壳层、比赛数据库、OpenDota Live、战队档案等页面同步收口为统一桌面端视觉骨架，避免浏览器式大卡片占满首屏。
- **当前验证结果**:
  - 后端: `176 passed, 8 skipped`
  - 前端: `98 passed`
  - 构建: `npm run build` 通过
  - 浏览器: 已多轮实机回归 OpenDota Live / Replay Library / Replay Workspace / Match Database / Team Profile 主流程

### 最新完成任务（2026-03-08）
**✅ OpenDota Live 实时下载进度条 + 取消下载功能**
- **需求**:
  - 下载进度条内联显示（替代分离 badge + progress bar 方案）
  - 解析进度同理，内联于状态列
  - 页面刷新后进度条不消失
  - 鼠标悬停「下载中」状态时，显示取消按钮（✕），点击可取消下载并删除已下载文件
  - 修复进度条胶囊挤压同行元素问题；全页面一屏显示（无横向滚动）
- **后端实现**:
  - `backend/database/sqlite_db.py`: `replay_download_tasks` 表新增 `progress` 整型列，status CHECK 增加 `'parsing'`，自动迁移
  - `backend/storage/replay_download_storage.py`: 新增 `progress` 字段、`mark_parsing()`、`update_download_progress()`、`mark_cancelled()` 方法
  - `backend/services/replay_download_service.py`: 字节级下载进度追踪（每 5% 写 DB）、取消检测（读 DB `error_code == 'CANCELLED'`）、取消后删除部分文件、`cancel_match_download()` 方法
  - `backend/routers/remote.py`: 新增 `DELETE /api/v1/remote/matches/{match_id}/download` 端点
- **前端实现**:
  - `frontend/src/renderer/api/remoteService.ts`: `download_task` 新增 `progress` 字段、新增 `cancelMatchDownload()` 方法
  - `frontend/src/renderer/pages/OpenDotaLivePage.tsx`:
    - `fetchMatches` 中对活跃状态行自动 seed `liveStatus`（解决刷新后进度丢失）
    - 下载状态列：固定 `w-[72px]` 圆形胶囊进度条，蓝色填充，内嵌 `{progress}%`，hover 显示 absolute 定位 ✕ 取消按钮
    - 解析状态列：固定 `w-[56px]` 圆形胶囊（amber，固定 50%），内嵌「解析中」文字
    - 全表格瘦身：`px-4 py-3` → `px-2 py-2`，图标列缩小，操作按钮 `text-xs`，状态 pill 固定宽（消除横向滚动）
- **新增 API 端点**: `DELETE /api/v1/remote/matches/{match_id}/download` → 取消活跃下载、best-effort 删除文件

### 最新完成任务（2026-03-16）
**✅ Phase 4/Phase 3 尾项收口 + HUD 高频指标完成**
- **后端稳定化**:
  - 修复 `OpenDotaMatchStorage` 对 `radiant_team` / `dire_team` 标量 team_id 的归一化遗漏，恢复按战队筛选和 team/league 名称回填。
  - `admin` replay task 响应模型补齐 `progress` 字段，下载执行链对缺失 `headers` 的 fake/边界响应更稳健。
  - `matches` / `visualization` 路由统一为基于 `backend` 根目录的 Parquet 路径解析，避免因启动目录变化读不到 `data/matches`。
- **前端可视化补齐**:
  - `RealMatchViewer` 已正确接入 `/visualization/{match_id}/heatmap`，将稀疏 `grid_data` 转换为小地图热力图所需的致密二维网格，并补上时间范围筛选。
  - `RealMatchViewer` 已接入 `/visualization/{match_id}/paths`，支持英雄筛选、时间范围、`simplify` 和 `epsilon` 控制，并将返回轨迹渲染到小地图。
  - `Gold/XP Advantage` 曲线能力确认落地并通过现有回归验证。
- **HUD 高频指标闭环**:
  - Java parser 现已输出英雄实时装备快照与 per-player `gold/xp/net_worth` 数组，并修正物品槽位探测去重。
  - Python parser / Parquet / playback HUD 链路已接入真实 `items/net_worth/gpm/xpm`，按 `metadata.players` 映射到英雄，不再对新 schema 使用 fallback。
  - 仓库内置样本 `8729115809.dem` 已重新解析落盘，`/api/v1/playback/{match_id}/hud` 可直接返回真实 HUD 指标。
- **测试/文档对齐**:
  - 回放下载测试与 API 文档统一到当前契约：`http://replay...`、`progress`、`parsing` 状态。
  - `test_playback_e2e.py` 改为跟随仓库实际内置样本集运行；缺少 pause 样本时显式 `skip`，不再依赖过期硬编码 match_id。
  - `test_playback_hud_contract.py` 新增真实 `NW/GPM/XPM/items` spot-check，锁定 HUD 契约从 parser 到 API 的完整行为。
- **当前验证结果**:
  - 后端: `164 passed, 10 skipped`
  - 前端: `83 passed`
  - 构建: `npm run build` 通过
- **当前状态**:
  - `PH4-1` ~ `PH4-7` 已全部完成，Phase 4 核心能力闭环。

---

## 当前冲刺 (Current Sprint)

### 目标: Phase 4 核心能力落地（比赛数据库 + 录像下载 + 实时HUD）
**截止日期**: 2026-02-28  
**状态**: `DONE` 🚀

| ID | 任务 | 负责方 | 状态 | 备注 |
|----|------|--------|------|------|
| PH4-1 | 接入 OpenDota 数据同步（近期比赛/战队/赛事） | Backend | `DONE` | recent/pro/reference sync 与 admin/remote 查询链路已稳定 |
| PH4-2 | 完善比赛数据库（Team/Tournament/Match 扩展模型） | Backend | `DONE` | Team/League 维表与 team/league/time 查询已完成 |
| PH4-3 | 录像下载系统（按比赛ID + 查询结果下载） | Backend | `DONE` | prepare/execute/retry/cancel/progress/parsing 契约已对齐 |
| PH4-4 | 前端比赛数据库页面（筛选/分页/跳转） | Frontend | `DONE` | MatchDatabasePage 与后端 action/task 细节链路通过回归 |
| PH4-5 | 战队归档页（示例：XG 赛事战绩） | Frontend | `DONE` | TeamProfilePage 功能与导航回归通过 |
| PH4-6 | 回放实时 HUD（等级/装备/KDA/GPM/XPM/净资产） | Both | `DONE` | parser -> parquet -> playback -> HUD 面板真实指标已贯通 |
| PH4-7 | 经济差/经验差实时曲线图 | Both | `DONE` | Advantage API + RealMatchViewer 图表联动已完成 |

### Phase 4.5 重构蓝图（OpenDota Live + Replay Library）
**状态**: `DONE`  
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
- `GET /api/v1/remote/search`：按 `player_id/leagueid` 直连 OpenDota 搜索远端比赛候选，并回填下载/解析状态。
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
  - 支持按战队检索本地库，并按选手/联赛直连 OpenDota 发现远端比赛。
  - 行级动作：打开回放、下载并入库、删除本地资产。

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
| RB-9 | 回归测试与性能基线 | Both | `DONE` | 同步/下载/解析/检索链路稳定，基线已产出 |

### Option2 执行看板：回放解析重构（已完成）
**目标**: 以最小风险方式重构解析链路，统一时间契约并为 HUD/曲线扩展铺路。  
**状态**: `DONE`

| ID | 任务 | 负责方 | 状态 | 验收标准 |
|----|------|--------|------|----------|
| RP2-1 | 统一时间契约（parser -> parquet -> playback） | Backend | `DONE` | `ticks/wards` 返回 `game_time` + `time_basis`，语义明确 |
| RP2-2 | 修复 game_time 计算基准 | Backend | `DONE` | 两场样本 `game_time` 非空且包含负时间，开局样本递增 |
| RP2-3 | 前端时间轴对齐时间契约 | Frontend | `DONE` | Timeline 以 `game_time` 为主，pause/fallback 提示已落地 |
| RP2-4 | 时间轴回归测试（2 场比赛） | Both | `DONE` | 回归测试改为跟随仓库内置样本，负时间/0:00/pause 契约稳定 |
| RP2-5 | 事件与 HUD 扩展字段设计 | Both | `DONE` | kills/assists/networth/gold/xp/items 契约已在 parser -> playback 实现 |
| RP2-6 | 参考 OpenDota 处理链拆分解析模块 | Backend | `DONE` | 当前实现已形成 Java parser / Python wrapper / Parquet / playback 分层 |
| RP2-7 | Pause-aware 双时基时间轴改造（replay_time/game_time） | Both | `DONE` | 暂停时冻结 game_time，HUD/眼位/事件统计口径一致 |

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
| 2026-03-20 | **OpenDota Live 搜索台全面升级**: ① `OpenDotaLivePage` 升级为实时镜像 + 直连搜索双模式，支持 `match_id / player_id / player_name / leagueid / league_name` 多字段搜索 ② 结果表新增胜者 badge、天辉/夜魇阵容卡片、玩家 `ID / 名字` 展示，保留下载并入库 / 状态详情 / 批量入库主流程 ③ `/api/v1/remote/search` 升级为统一远端搜索入口，补齐公共局搜索、玩家/联赛名称解析与 richer match summary ④ 修复 OpenDota match detail 回写时公共局来源被误判为职业局的问题，并补充联赛名/玩家名检索索引与回归测试；本次验证为后端 `39 passed`、前端 `6 passed`、`npm run build` 通过。 | Codex |
| 2026-03-18 | **T-007 Zustand 状态管理实现完成**: ① 创建 `matchStore.ts` - 管理比赛选择和回放上下文 ② 创建 `navigationStore.ts` - 管理页面导航状态 ③ 重构 `App.tsx` - 从 163 LOC 简化为 88 LOC，移除所有 useState 和回调 props ④ 更新导航测试 - 使用 Zustand store 替代 props 传递 ⑤ 所有 106 个测试通过 ⑥ 构建成功通过 | Codex |
| 2026-03-18 | **Replay Workspace 桌面化重构 + 远端搜索/物品提示闭环**: ① `RealMatchViewer` 重构为地图优先的桌面分析台，header/对阵区压缩为工具栏，地图时间信息移到主地图标题区 ② 英雄 HUD 与地图工作台改为默认折叠，热力图/路径分析支持更清晰的聚焦模式与浮窗交互 ③ `ReplayLibraryPage` 新增按 `player_id/leagueid` 直连 OpenDota 的远端搜索链路，可直接下载并入库或打开本地已就绪回放 ④ 新增 `/api/v1/assets/items/{item_name}.png` 物品图标代理与本地缓存，前端补齐物品别名、中文 tooltip 与中立物品附魔说明 ⑤ OpenDota Live / Replay Library / Match Database / Team Profile 同步收口为统一桌面端布局；当前验证为后端 `176 passed, 8 skipped`、前端 `98 passed`、`npm run build` 通过。 | Codex |
| 2026-03-16 | **Phase 4 尾项收口 + HUD 真实指标完成**: ① 修复 OpenDota 比赛归一化中的 team_id 标量兼容问题，恢复战队筛选和名称回填 ② `admin` replay task 契约补齐 `progress`，下载链与测试文档统一到 `prepared/downloading/parsing/completed` 语义 ③ `matches` / `visualization` 路由统一为 backend-root 相对路径，避免启动目录变化导致读取失败 ④ `RealMatchViewer` 完成热力图和路径分析真接线，支持时间范围、英雄筛选、轨迹简化与主地图渲染 ⑤ Java parser / Python parser / Parquet / playback HUD 全链路接入真实 `items/net_worth/gpm/xpm`，内置样本可直接返回真实 HUD 指标。 | OpenCode |
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
