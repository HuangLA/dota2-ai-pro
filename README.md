# True Sight (Dota 2 Replay Analysis)

True Sight 是一个面向 Dota 2 回放分析的本地工具链：
- 前端：React + Vite + PixiJS 地图渲染
- 后端：FastAPI + Parquet/SQLite 存储
- 解析器：Clarity (Java 17)

## 项目状态 (as of 2026-02-15)

- 当前阶段：Phase 4 (`IN_PROGRESS`)
- 已落地核心链路：上传 -> 解析 -> 存储 -> 回放渲染
- 本次已对齐实现更新：
  - 比赛管理页支持多文件上传（前端批处理；后端 API 仍单文件）
  - 小地图英雄图标映射修复（`anti_mage` / `antimage` 等下划线差异兼容）
  - RealMatchViewer HUD 血条：实时血量、hover 数值浮层、移除双 tooltip 冲突

## 快速启动

### 环境要求

- Node.js 18+
- Python 3.10+
- Java 17+

### 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 访问地址

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

## 目录

```text
frontend/            React renderer + Electron shell
backend/             FastAPI, services, storage, routers
parsers/             Clarity parser project (Java/Gradle)
backend/data/        Runtime data root (matches/replays/db/logs)
docs/                API/技术设计/规划文档
PROGRESS.md          项目进度基线与更新日志
```

## 文档入口

- `PROGRESS.md`：当前冲刺与已完成项
- `docs/api_specification.md`：最新 API 实现状态与契约
- `docs/technical_design.md`：实现对齐后的技术设计
- `docs/REPLAY_MANAGEMENT_PLAN.md`：Replay 管理现状和后续计划
- `frontend/README.md` / `backend/README.md` / `data/README.md`：子模块说明
