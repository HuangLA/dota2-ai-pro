# True Sight (Dota 2 Replay Analysis)

True Sight 是一个面向 Dota 2 回放分析的本地工具链：
- 前端：React + Vite + PixiJS 地图渲染
- 后端：FastAPI + Parquet/SQLite 存储
- 解析器：Clarity (Java 17)

## 项目状态

- 当前阶段：Phase 4 (`IN_PROGRESS`)
- 核心链路已打通：上传 -> 解析 -> 存储 -> 回放渲染

## 本地启动

### 1) 环境版本要求

- Node.js `>=18`（推荐 `20 LTS`）
- npm `>=9`
- Python `>=3.10`（推荐 `3.11`）
- Java `17`（必须，供 Clarity 解析器使用）

> 说明：仓库当前后端依赖以 `requirements.txt` 为准，前端依赖以 `frontend/package.json` 为准。

### 2) 一键启动（Windows）

在项目根目录直接运行：

```bat
start-all.bat
```

该脚本会分别启动后端和前端服务窗口。

### 3) 手动启动（推荐开发时使用）

1. 启动后端

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

2. 启动前端（新终端）

```bash
cd frontend
npm install
npm run dev
```

### 4) 验证服务

- 前端首页：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/health`
- Swagger 文档：`http://localhost:8000/docs`

## 解析器说明（Java）

- 后端解析 `.dem` 依赖 Java 17。
- 若缺少解析器 JAR，可在 `parsers/` 下构建：

```bash
cd parsers

# Windows
gradlew.bat shadowJar

# macOS / Linux
./gradlew shadowJar
```

## 目录概览

```text
frontend/            React renderer + Electron shell
backend/             FastAPI, services, storage, routers
parsers/             Clarity parser project (Java/Gradle)
backend/data/        Runtime data root (matches/replays/db/logs)
docs/                API / 技术设计 / 规划文档
PROGRESS.md          项目进度基线与更新日志
```

## 文档入口

- `PROGRESS.md`: 当前冲刺与已完成项
- `docs/api_specification.md`: API 契约与实现状态
- `docs/technical_design.md`: 技术设计
- `docs/REPLAY_MANAGEMENT_PLAN.md`: Replay 管理计划
- `frontend/README.md` / `backend/README.md` / `data/README.md`: 子模块说明
