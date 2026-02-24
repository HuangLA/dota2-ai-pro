# True Sight - Dota 2 录像智能分析工作台

True Sight 是一个本地优先（local-first）的 Dota 2 录像分析平台，面向复盘、侦察与策略研究场景。

- 前端：Electron + React + Vite + PixiJS
- 后端：FastAPI + SQLite + Parquet + DuckDB
- 解析器：Java 17 + Clarity

当前产品包含两个核心页面：

- OpenDota Live：同步并浏览远端比赛（职业/路人），按 `match_id` 入库
- Replay Library：管理本地已解析比赛，支持检索与后续分析

## 项目状态

- 当前阶段：Phase 4 / Phase 4.5 重构（进行中）
- 进度基线：`PROGRESS.md`
- API 契约：`docs/api_specification.md`

## 核心能力

- 录像入库链路：prepare -> download -> decompress -> parse -> index
- 本地录像管理：打开回放、删除本地文件、保留任务记录
- 比赛检索：职业/路人过滤，`match_id` 与 `leagueid` 搜索
- 下载/解析可观测：单场状态详情、任务级错误信息
- 回放数据 API：支持时间轴/地图/事件可视化

## 架构概览

```text
frontend/                 Electron + React 渲染层
backend/                  FastAPI 路由/服务/存储/数据库
parsers/                  Java 解析器项目（Clarity）
backend/data/             运行时数据（db、replays、解析结果）
docs/                     API/设计/规划文档
PROGRESS.md               冲刺进度与更新日志
```

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+
- Java 17+

### 安装依赖

前端：

```bash
cd frontend
npm install
```

后端：

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
```

### 启动方式

方式 A（Windows 一键启动）：

```cmd
start-all.bat
```

方式 B（手动启动）：

后端：

```bash
cd backend
python main.py
```

前端：

```bash
cd frontend
npm run dev
```

### 访问地址

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`
- Swagger：`http://localhost:8000/docs`

## 产品工作流

### 1) OpenDota Live

- 按来源（职业/路人）、`match_id`、`leagueid` 过滤
- 手动触发同步
- 单条/批量下载并入库
- 查看单场下载与解析状态

### 2) Replay Library

- 浏览本地已解析比赛
- 按战队/选手/联赛检索（API 侧）
- 打开回放进行复盘
- 删除本地录像文件并保留记录元数据

## 重要文档

- `PROGRESS.md`：当前冲刺与更新日志
- `docs/api_specification.md`：接口契约
- `docs/technical_design.md`：技术设计
- `docs/REPLAY_MANAGEMENT_PLAN.md`：录像管理规划
- `frontend/README.md`、`backend/README.md`：子模块说明

## 开发说明

- 运行时数据库：`backend/data/truesight.db`（元数据与任务状态）
- 录像文件目录：`backend/data/replays/`
- 解析输出目录：`backend/data/matches/`
- 部分联赛/战队图片可能在上游缺失，前端会自动回退占位图

## 测试

后端：

```bash
cd backend
pytest
```

前端：

```bash
cd frontend
npm run test
```

## 许可证

MIT
