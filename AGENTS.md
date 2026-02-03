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

## 注意事项

1. 不要提交 `.dem` 文件 (已在 .gitignore)
2. API 密钥存 `.env`, 不提交
3. 代码需兼容 Windows/macOS/Linux
4. 避免使用 `any` 类型，使用 `unknown` 或具体类型
5. React 组件优先使用函数组件 + Hooks
