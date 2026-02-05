# AGENTS.md - AI 编码助手指南

本文档为 AI 编码助手提供项目规范和开发指南。

## 项目概述

**项目代号**: "True Sight" - Dota 2 职业战队录像分析桌面应用  
**技术栈**: Electron + React + TypeScript | Python + FastAPI | Go/Java 解析器

```
dota2-ai-pro/
├── frontend/          # Electron + React (src/main, src/renderer)
├── backend/           # Python FastAPI (parsers, analyzers, database)
├── parsers/           # Go 解析器 (Manta)
├── data/              # SQLite + Parquet + .dem 文件
└── docs/              # PRD, 技术设计文档
```

## 构建与测试命令

### 前端 (Electron + React)
```bash
cd frontend
npm install                           # 安装依赖
npm run dev                           # 开发模式
npm run build                         # 构建
npm run lint && npm run typecheck     # 代码检查
npm run test                          # 运行所有测试
npm run test -- path/to/file.test.ts  # 单个测试文件
npm run test -- -t "test name"        # 按名称运行测试
```

### 后端 (Python)
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000           # 开发服务器
ruff check . && ruff format .                   # 代码检查
mypy .                                          # 类型检查
pytest                                          # 运行所有测试
pytest tests/test_file.py                       # 单个测试文件
pytest -k "test_name"                           # 按名称运行测试
pytest --cov=backend                            # 覆盖率
```

### Go 解析器
```bash
cd parsers
go build -o parser.exe
go test ./...                   # 所有测试
go test -run TestName ./...     # 单个测试
```

## 代码风格

### TypeScript 导入顺序
```typescript
import path from 'path';                    // 1. Node 内置
import React from 'react';                  // 2. 第三方库
import { MapRenderer } from '@/components'; // 3. 项目模块
import type { MatchData } from '@/types';   // 4. 类型
import './styles.css';                      // 5. 样式
```

### TypeScript 命名规范
- 组件: `PascalCase` (HeroTracker.tsx)
- 函数/变量: `camelCase`
- 常量: `SCREAMING_SNAKE_CASE`
- 类型/接口: `PascalCase` (无 I 前缀)
- 文件: `kebab-case.ts` (组件用 PascalCase.tsx)

### Python 导入顺序
```python
import json                        # 1. 标准库
import pandas as pd                # 2. 第三方库
from analyzers import WardAnalyzer # 3. 本地模块
```

### Python 命名规范
- 类: `PascalCase`
- 函数/变量: `snake_case`
- 常量: `SCREAMING_SNAKE_CASE`
- 私有成员: `_leading_underscore`

### 类型注解
```python
# 函数必须有类型注解
def analyze_wards(match_id: int, team: str = "radiant") -> list[dict]:
    ...

# 使用 dataclass 或 Pydantic
@dataclass
class HeroPosition:
    hero_id: int
    x: float
    y: float
```

## 错误处理

### TypeScript
```typescript
try {
  const data = await fetchMatchData(matchId);
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('网络错误:', error.message);
  } else { throw error; }
}
```

### Python (FastAPI)
```python
@app.post("/parse")
async def parse_replay(request: ParseRequest):
    try:
        return {"status": "success", "data": await parse_dem(request.path)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在")
```

## 数据库规范

- **SQLite**: WAL 模式, 所有表有主键, 使用 created_at/updated_at
- **Parquet**: 每场比赛目录 `data/matches/{match_id}/`, Snappy 压缩
- **DuckDB**: 直接查询 Parquet, 参数化查询防注入

## Git 提交规范

```
<type>(<scope>): <subject>

feat: 新功能 | fix: 修复 | docs: 文档 | style: 格式
refactor: 重构 | test: 测试 | chore: 构建

示例: feat(parser): 添加 Clarity 解析器支持
```

## 性能目标

| 操作 | 目标 |
|------|------|
| 45分钟录像解析 | < 30秒 |
| 热力图生成 | < 500ms |
| 50场聚合查询 | < 1秒 |
| 地图渲染 | 60 FPS |

## 环境要求

- Node.js 18+ | Python 3.9+ | Go 1.20+ | Java 17+ (Clarity)

## API 规范

**完整文档**: `docs/api_specification.md` (52 个端点)

### 核心端点速查

| 模块 | 端点示例 | 用途 |
|------|---------|------|
| 录像运维 | `POST /api/v1/replays/upload` | 上传 .dem 文件 |
| | `GET /api/v1/replays/tasks` | 查询解析队列 |
| 比赛数据 | `GET /api/v1/matches?team_id=15` | 检索比赛列表 |
| | `GET /api/v1/matches/{id}/players` | 选手表现 |
| 回放引擎 | `GET /api/v1/playback/{id}/ticks` | 时序坐标（PixiJS） |
| | `GET /api/v1/playback/{id}/events` | 关键事件（时间轴） |
| 可视化 | `GET /api/v1/visualization/{id}/heatmap` | 单场热力图 |
| 聚合分析 | `POST /api/v1/analytics/ward-clusters` | 眼位聚类（AI） |
| BP 辅助 | `POST /api/v1/draft/simulate` | BP 预测 |

### 数据模型核心字段

```typescript
// Match (比赛)
{ match_id, start_time, duration, winner_team, parse_status }

// Tick (时序数据 - 用于地图渲染)
{ time, hero_id, x, y, hp, mana, gold, level, is_alive }

// Ward (眼位)
{ ward_id, type, x, y, placer_team, placed_at, destroyed_at }

// Event (游戏事件)
{ type, time, killer_hero_id, victim_hero_id, x, y }
```

### 通用响应格式

```json
// 成功
{ "data": {...}, "meta": { "timestamp": 1738645200 } }

// 错误
{ "error": { "code": "REPLAY_PARSE_FAILED", "message": "..." } }
```

### 性能 SLA
- 比赛列表查询 < 150ms
- 时序数据（5分钟）< 200ms
- 热力图生成 < 500ms
- 聚合查询（50场）< 1秒

**详细定义见**: `docs/api_specification.md`

---

## AI 协同开发工作流

> **重要**: 每次完成任务后，必须更新 `PROGRESS.md` 文件！这是 AI 协作的核心机制。

### 进度追踪文件
- **`PROGRESS.md`**: 开发进度追踪（**AI 必须读写**）
- **`task.md`**: 总体任务规划（只读参考）

### AI 工作流程

1. **开始任务前**
   ```
   1. 阅读 PROGRESS.md 了解当前状态
   2. 检查是否有阻塞问题
   3. 将任务状态改为 IN_PROGRESS
   4. 填写 "负责 AI" 字段
   ```

2. **完成任务后** ⚠️ **必须执行**
   ```
   1. 将任务状态改为 DONE
   2. 更新 "最后更新" 日期
   3. 如果实现了 API，更新 API 实现状态表
   4. 在 "更新日志" 中添加记录
   5. 如果有性能测试结果，更新 "POC 性能测试结果" 表
   ```

3. **遇到阻塞时**
   ```
   1. 在 "阻塞问题" 表格中添加记录
   2. 将任务状态改为 BLOCKED
   3. 描述问题和可能的解决方案
   ```

4. **做出重要决策时**
   ```
   1. 在 "决策记录" 表格中添加记录
   2. 说明决策原因和相关文档链接
   ```

### PROGRESS.md 更新检查清单

每次完成任务后，检查是否需要更新以下内容：

- [ ] 当前冲刺任务状态
- [ ] 前端/后端开发进度表
- [ ] API 实现状态表（如果涉及 API）
- [ ] 阻塞问题（如果已解决，标记为 RESOLVED）
- [ ] 更新日志（添加本次更新内容）
- [ ] 运行中的服务（如果启动了新服务）

### 前后端协作契约

```
后端 AI: 实现 API → 更新 PROGRESS.md 中 API 状态为 DONE
前端 AI: 查看 PROGRESS.md → 发现可用 API → 实现调用 → 更新状态
```

### 状态值
| 状态 | 含义 |
|------|------|
| `TODO` | 未开始 |
| `IN_PROGRESS` | 进行中 |
| `STUB` | API 已定义但未实现业务逻辑 |
| `REVIEW` | 待审核 |
| `DONE` | 已完成 |
| `BLOCKED` | 被阻塞 |

---

## 注意事项

1. 不要提交 `.dem` 文件 (已在 .gitignore)
2. API 密钥存 `.env`, 不提交
3. 代码需兼容 Windows/macOS/Linux
4. 避免使用 `any` 类型，使用 `unknown` 或具体类型
5. React 组件优先使用函数组件 + Hooks
6. **⚠️ 每次开发前先阅读 `PROGRESS.md`，完成后必须更新状态**
7. **⚠️ 不要忘记在更新日志中记录所做的更改**
8. 全程使用中文