# True Sight - Dota 2 录像智能分析工作台

True Sight 是一个本地优先（local-first）的 Dota 2 录像分析平台，面向复盘、侦察与策略研究场景。

- 前端：Electron + React 18 + Vite + PixiJS 8 + Zustand + TanStack Query
- 后端：FastAPI + SQLite + Parquet + DuckDB
- 解析器：Java 17 + Clarity (Dota 2 Replay Parser)

## 项目状态

- 当前阶段：Phase 4 已完成，Phase 4.5 重构进行中
- 进度基线：`PROGRESS.md`
- API 契约：`docs/api_specification.md`

## 核心能力

- **OpenDota Live**：同步并浏览远端比赛（职业/路人），按 `match_id` 入库
- **Replay Library**：管理本地已解析比赛，支持检索与回放
- **Match Database**：比赛数据库，筛选/分页/跳转/批量下载
- **Team Profile**：战队归档页，赛事分组/对比/快照
- **回放查看器**：PixiJS 2D 地图 + 时间轴 + 实时 HUD（等级/KDA/经济/装备）
- **优势曲线**：经济差/经验差实时曲线，与 Timeline 联动
- 录像入库链路：prepare → download → decompress → parse → index
- 下载/解析可观测：单场状态详情、任务级错误信息

## 架构概览

```text
dota2-ai-pro/
├── frontend/                 Electron + React 渲染层
│   └── src/renderer/
│       ├── api/              后端 API 客户端
│       ├── components/       UI 组件 (地图/时间轴/图表/上传)
│       ├── pages/            页面 (6 个核心页面)
│       ├── store/            Zustand 状态管理
│       ├── hooks/            React Hooks
│       ├── data/             静态数据 (英雄/地图元素)
│       └── utils/            工具函数
├── backend/                  FastAPI 路由/服务/存储/数据库
│   ├── routers/              API 路由 (8 个模块)
│   ├── services/             业务服务 (解析/下载/同步)
│   ├── storage/              数据存储 (7 个存储模块)
│   ├── database/             SQLite 数据库管理
│   ├── parsers/              Java 解析器 Python 包装
│   ├── analyzers/            热力图/路径分析器
│   ├── tests/                pytest 测试
│   └── data/                 运行时数据 (db/replays/matches)
├── parsers/                  Java 解析器项目 (Clarity)
│   ├── src/main/java/        SimpleDemoParser.java
│   ├── build/libs/           clarity-parser-1.0.0-uber.jar
│   ├── clarity/              Clarity 库源码
│   └── jdk17/                OpenJDK 17
├── docs/                     API 规范/技术设计/规划文档
└── harness/                  开发流程基础设施
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
- POC 测试输出：`backend/data/poc_test/`
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
