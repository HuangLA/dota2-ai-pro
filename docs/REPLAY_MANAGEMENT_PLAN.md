# Replay Management Plan (Status-Aligned)

> 更新日期: 2026-02-15
> 基线: `PROGRESS.md` 已完成项

## 1. 当前已实现 (DONE)

### 1.1 Upload + Parse 主流程

- `POST /api/v1/replays/upload`：上传 `.dem` 并创建解析任务
- `POST /api/v1/replays/parse`：指定路径创建后台任务
- `POST /api/v1/replays/parse/sync`：同步解析
- `GET /api/v1/replays/tasks` / `GET /tasks/{id}` / `POST /tasks/{id}/cancel`

### 1.2 前端比赛管理页

- `MatchListPage` 已提供：
  - 比赛列表展示
  - 按 Match ID / Player(account_id) / Hero(hero_id) 搜索
  - 删除比赛
  - 跳转回放

### 1.3 多文件上传能力（本次重点）

- `ReplayUploader` 支持拖拽与文件选择的多文件上传
- 前端执行批处理队列，逐个调用单文件上传 API
- UI 提供：
  - 批量进度（completed/total）
  - 失败文件汇总提示
  - 最近任务轮询面板

## 2. 当前实现边界

- 后端上传 API 仍为单文件模式（`file: UploadFile`）
- 暂无按 match_id 自动下载 replay 接口
- 任务重试、批量删除等管理型接口尚未实现

## 3. 下一步计划（Phase 4）

1. OpenDota/Stratz 数据同步（近期比赛、战队、赛事）
2. 扩展比赛数据库模型（team/tournament 维度）
3. 录像下载任务系统（按 match_id + 状态跟踪 + 重试）
4. 前端比赛数据库页与战队归档页联动

## 4. API 规划与状态对照

- 已实现：见 `docs/api_specification.md` 的 replays/matches 实现清单
- 未实现但仍计划：
  - `POST /api/v1/replays/fetch`
  - `POST /api/v1/replays/tasks/{task_id}/retry`
  - `DELETE /api/v1/replays/batch`

## 5. 风险与约束

- 多文件上传对 API 层仍是高频单请求，后端无并发队列管理时需关注峰值负载
- replay 下载能力依赖外部服务可用性（OpenDota/Stratz）
- 解析任务当前为进程内状态管理，后续可评估持久化任务队列
