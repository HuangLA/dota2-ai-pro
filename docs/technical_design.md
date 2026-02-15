# 技术设计文档 (Implementation-Aligned)

> 最后更新: 2026-02-15
> 对齐基线: `PROGRESS.md`（2026-02-15 已完成项）

## 1. 当前架构总览

```text
Frontend (React + Vite + PixiJS)
  -> HTTP
Backend (FastAPI)
  -> ParseService
Clarity Parser (Java 17)
  -> Storage
SQLite (metadata) + Parquet (positions/kills/wards/meta)
```

核心链路：
1. 上传 `.dem`
2. 创建解析任务并执行
3. 写入 `backend/data/matches/{match_id}` + `truesight.db`
4. 前端拉取 matches/playback 并渲染地图与 HUD

## 2. 后端设计

### 2.1 分层

- Router: `backend/routers/`
- Service: `backend/services/parse_service.py`
- Storage: `backend/storage/`
- Parser wrapper: `backend/parsers/clarity_parser.py`

### 2.2 存储设计

每场比赛目录（`backend/data/matches/{match_id}`）：
- `positions.parquet`
- `kills.parquet`
- `wards.parquet`
- `meta.json`

SQLite：`backend/data/truesight.db`，保存比赛索引、任务状态、玩家关系等。

### 2.3 时间契约（pause-aware）

后端 playback 返回：
- `time`：源时间（通常 `tick/30`）
- `game_time`：游戏时钟（支持负时间）
- `time_basis`：时钟映射元信息（offset/source/strategy）
- `pause_intervals`：暂停区间

实现目标：
- Timeline 拖动、播放和 HUD 显示使用同一时基
- 暂停期间 game clock 冻结
- 历史数据无 `game_time` 时可回退，并显式暴露回退状态

## 3. 前端设计

### 3.1 页面与组件

- `MatchListPage`：比赛管理、搜索过滤、删除、观看跳转
- `ReplayUploader`：上传区 + 任务列表
- `RealMatchViewer`：地图、时间轴、HUD（阵容头像/血条/复活倒计时）
- `DotaMapRenderer`：PixiJS 地图渲染（英雄图标、眼位、坐标映射）

### 3.2 已实现的关键交互

- 多文件上传（前端队列）：
  - 拖拽/文件选择都支持多选
  - 批量进度与失败汇总
  - 后端保持单文件上传 API
- 小地图英雄图标映射增强：
  - 名称标准化 + 别名
  - 下划线/紧凑命名兼容（如 `anti_mage` 与 `antimage`）
- HUD 血条增强：
  - 实时血条（来自 tick `hp/max_hp`）
  - hover 显示实时数值
  - 清理双 tooltip 冲突（血条区域移除原生 title）

## 4. API 与实现边界

已实现核心：
- replay/matches/playback/visualization 主流程

当前边界（未完整实现）：
- replay 自动下载（OpenDota/Stratz）
- playback timeline/buildings/combat-log/teamfights/snapshot
- visualization 聚合热力图与 ward clustering 全量逻辑

详细端点状态见：`docs/api_specification.md`

## 5. Phase 4 对齐结论

已完成并验证的文档对齐项：
- 比赛管理页多文件上传（前端批处理）
- antimage 小地图图标映射修复
- RealMatchViewer HUD 血条与 hover 交互优化

仍在 Phase 4 待推进：
- OpenDota 同步与比赛数据库扩展
- 录像下载任务系统
- HUD 扩展指标（装备/KDA/GPM/XPM/净资产）和优势曲线
