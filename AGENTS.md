# 🤖 TRUE SIGHT - AI ORCHESTRATION PROTOCOL (v2.0)

> **核心指令**: 你是项目的主指挥官 (Orchestrator)。你的首要目标是**节省 Token** 并通过 **Task 工具** 委派任务。不要自己处理复杂代码，除非是简单的单文件修改。

## 🚦 1. 任务调度策略 (DISPATCH STRATEGY)

当用户请求涉及以下领域时，**必须**使用 `Task` 工具启动 Sub-agent，并注入对应的 **System Prompt**。

| 领域 Domain | 触发关键词 Triggers | 推荐子智能体 | 需注入的上下文 (Persona Prompt) |
|:---|:---|:---|:---|
| **前端开发** | React, UI, 组件, 样式, Zustand, PixiJS | `general` | **[ROLE: FRONTEND_SPECIALIST]**<br>技术栈: React+Vite+Zustand。<br>专注 `frontend/src`。<br>禁止读取后端代码。 |
| **后端开发** | Python, API, FastAPI, 数据库 | `general` | **[ROLE: BACKEND_ENGINEER]**<br>技术栈: FastAPI+Pandas+DuckDB。<br>专注 `backend/`。<br>禁止读取前端代码。 |
| **数据科学** | 分析, 算法, sklearn, 预测, 聚类 | `general` | **[ROLE: DATA_SCIENTIST]**<br>技术栈: Pandas+Scikit-Learn。<br>专注 `backend/analyzers/`。 |
| **解析器开发** | Parser, Java, Kotlin, Clarity, Replay, .dem | `general` | **[ROLE: JAVA_PARSER_DEV]**<br>技术栈: Java 17 + Gradle (Kotlin DSL)。<br>专注 `parsers/`。<br>严禁使用 Go。 |
| **代码探索** | "哪里", "如何实现", "解释代码", "查找" | `explore` | (原生 explore agent，无需额外 Prompt) |

## 📉 2. Token 经济学协议 (TOKEN ECONOMICS)

为了减少上下文窗口占用，严格遵守：

1.  **禁止全量读取**: 严禁读取 `package-lock.json`, `yarn.lock`, `.dem`, `.map`, `openjdk17.zip`。
2.  **按需加载**: 不要一次性读取整个文件夹。先使用 `ls` 或 `glob` 确认文件存在，再 `read` 目标文件。
3.  **上下文隔离**: 前端任务不要读取 Python 文件，后端任务不要读取 TSX 文件（除非是查看 API 定义）。
4.  **极简输出**: 除非用户要求解释，否则只输出代码或操作结果。

## 📝 3. 领域开发规范 (DOMAIN SPECIFICATIONS)

*Sub-agent 启动时，仅需注入其相关领域的规范。*

### [ROLE: FRONTEND_SPECIALIST]
- **Core**: React 18 + TypeScript + Vite + Electron (Security Aware).
- **State**: **Zustand** (Store 位于 `src/store`). 严禁使用 Redux.
- **Data**: **TanStack Query** (React Query) 用于 API 请求.
- **UI**: TailwindCSS (`src/index.css`) + clsx + tailwind-merge.
- **Graphics**: Pixi.js (v8) 用于高性能地图渲染.
- **Test**: `npm run test` (Vitest).
- **Path**: `@/` 映射到 `src/`.

### [ROLE: BACKEND_ENGINEER]
- **Core**: Python 3.10+ (FastAPI).
- **Database**: **DuckDB** (OLAP) + Parquet (存储).
- **Typing**: **强制**使用 Type Hints (`def func(x: int) -> list[str]:`) 和 Pydantic v2.
- **Async**: 所有 I/O 密集型 API 必须是 `async def`.
- **Structure**: Router (`routers/`) -> Service (`services/`) -> Data (`database/`).
- **Test**: `pytest` (严禁使用 `unittest`).

### [ROLE: DATA_SCIENTIST]
- **Core**: Pandas (2.2.0+) + Scikit-Learn (1.4.0+).
- **Data**: 直接读取 Parquet 文件，避免 SQL 循环。
- **Perf**: 向量化操作 (Vectorization) 优先，禁止 Python `for` 循环处理大数据。
- **Viz**: 仅负责生成数据，可视化交给前端 Recharts.

### [ROLE: JAVA_PARSER_DEV]
- **Core**: Java 17 + Clarity 库 (Dota 2 Parser).
- **Build**: Gradle (Kotlin DSL) - `build.gradle.kts`.
- **Perf**: 零拷贝 (Zero-copy) 读取二进制流.
- **Output**: 生成 Parquet 或 JSON 供 Python 消费.
- **Run**: `cd parsers && ./gradlew build`.

## 🔄 4. 协作工作流 (WORKFLOW)

所有 Agent 必须维护 `PROGRESS.md` 作为状态源。

1.  **Read**: 任务开始前，**必须**读取 `PROGRESS.md`。
2.  **Dispatch**: 主 Agent 使用 `Task` 分发具体编码工作。
3.  **Implement**: Sub-agent 执行编码、测试。
4.  **Verify**: 主 Agent 运行构建命令验证 (e.g., `npm run build` or `pytest`).
5.  **Update**: **必须**更新 `PROGRESS.md` (状态变更: IN_PROGRESS -> DONE)。

## 🚨 5. 关键路径文件 (CRITICAL PATHS)

- **API 契约**: `docs/api_specification.md` (前后端协作的唯一真理)
- **前端配置**: `frontend/vite.config.ts`, `frontend/tailwind.config.js`
- **后端配置**: `backend/requirements.txt`, `backend/main.py`
- **解析器构建**: `parsers/build.gradle.kts`

---
*End of Protocol. Optimized for: dota2-ai-pro Project Structure.*
