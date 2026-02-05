# Dota 2 职业级录像分析工具 ("True Sight")

一款为 Dota 2 职业战队打造的桌面端录像分析应用，提供深度的位置数据、视野效率分析和 AI 驱动的对手模式识别。

## 🎯 项目状态

**当前阶段**: Phase 3 - MVP 功能开发 🚀  
**最后更新**: 2026-02-04 21:30

### 已完成的里程碑
- ✅ Phase 1: 规划与架构设计
- ✅ Phase 2: 技术验证 POC (所有性能测试通过)
- ✅ Clarity 解析器集成 (112MB 录像 < 3 秒解析)
- ✅ 后端 API 完整实现 (15 个真实端点)
- ✅ 2D 地图渲染引擎 (PixiJS)
- 🚀 Phase 3: 前后端数据集成 (下一步)

### 当前进度概览

| 模块 | 状态 | 进度 |
|------|------|------|
| 前端框架 (Electron + React) | ✅ 完成 | 100% |
| 后端 API (FastAPI) | ✅ 完成 | 100% |
| 录像解析器 (Clarity Java) | ✅ 完成 | 100% |
| 数据存储 (SQLite + Parquet) | ✅ 完成 | 100% |
| 2D 地图渲染引擎 (PixiJS) | ✅ 完成 | 100% |
| Backend API 真实实现 | ✅ 完成 | 100% |
| 时间轴控件 | ⏳ 待开发 | 0% |
| 前后端数据集成 | ⏳ 待开发 | 0% |

## 📁 项目结构

```
dota2-ai-pro/
├── frontend/                 # Electron + React 前端
│   ├── src/
│   │   ├── main/            # Electron Main Process
│   │   ├── renderer/        # React 渲染进程
│   │   │   ├── components/  # React 组件
│   │   │   │   ├── map/     # 🆕 2D 地图渲染组件
│   │   │   │   └── poc/     # POC 测试组件
│   │   │   ├── pages/       # 页面
│   │   │   ├── api/         # 🆕 后端 API 客户端
│   │   │   ├── hooks/       # 自定义 Hooks
│   │   │   └── utils/       # 工具函数
│   │   └── assets/          # 静态资源
│   └── package.json
├── backend/                  # Python 后端
│   ├── main.py              # FastAPI 入口
│   ├── routers/             # 🆕 API 路由 (replays, matches, playback)
│   ├── services/            # 🆕 业务服务层
│   ├── storage/             # 🆕 存储层 (Parquet, SQLite)
│   ├── parsers/             # 🆕 Clarity 解析器包装
│   ├── database/            # 数据库操作
│   ├── poc/                 # POC 测试脚本
│   └── requirements.txt
├── parsers/                  # 🆕 Clarity Java 解析器
│   ├── build/libs/          # clarity-parser-1.0.0-uber.jar (17MB)
│   ├── src/main/java/       # SimpleDemoParser.java
│   ├── jdk17/               # OpenJDK 17.0.18
│   └── gradle-8.5/          # Gradle 构建工具
├── data/                     # 数据存储
│   ├── matches/             # 🆕 Parquet 文件 (按 match_id 组织)
│   ├── replays/             # .dem 录像文件
│   └── truesight.db         # 🆕 SQLite 元数据库
├── docs/                     # 文档
│   ├── PRD.md
│   ├── technical_design.md
│   ├── api_specification.md # 🆕 API 规范 (52 个端点)
│   └── parser_comparison_analysis.md
├── start-all.bat            # 🆕 一键启动脚本 (Windows)
├── TESTING_GUIDE.md         # 🆕 测试指南
├── PROGRESS.md              # 🆕 AI 协同开发进度追踪
├── AGENTS.md                # 🆕 AI 编码助手指南
└── task.md                   # 任务清单
```

## 📚 核心文档

- **[PRD.md](./docs/PRD.md)** - 产品需求文档
- **[technical_design.md](./docs/technical_design.md)** - 技术设计文档
- **[api_specification.md](./docs/api_specification.md)** - API 规范文档 (52 个端点)
- **[parser_comparison_analysis.md](./docs/parser_comparison_analysis.md)** - 解析器对比分析
- **[PROGRESS.md](./PROGRESS.md)** - 开发进度追踪 (AI 协同)
- **[task.md](./task.md)** - 开发任务清单

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Python 3.11+
- Java 17+ (JDK，用于 Clarity 解析器)

### 安装依赖

**前端**:
```bash
cd frontend
npm install
```

**后端**:
```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**解析器** (已预编译):
```bash
# Clarity 解析器已预编译为 uber JAR，无需额外构建
# 位置: parsers/build/libs/clarity-parser-1.0.0-uber.jar
# JDK 17 已包含在 parsers/jdk17/ 目录
```

### 启动开发服务器

#### 🚀 一键启动 (Windows)

双击项目根目录下的 `start-all.bat`，会自动打开两个窗口启动前后端。

或在终端运行：
```cmd
start-all.bat
```

#### 方法 1: 使用启动脚本 (推荐)

**Windows 用户**:
```cmd
# 启动后端 (打开第一个终端)
cd backend
start-backend.bat

# 启动前端 (打开第二个终端)
cd frontend
start-frontend.bat
```

**Linux/Mac 用户**:
```bash
# 启动后端 (打开第一个终端)
cd backend
./start-backend.sh

# 启动前端 (打开第二个终端)
cd frontend
./start-frontend.sh
```

💡 **提示**: 也可以直接双击 `.bat` (Windows) 或 `.sh` (Linux/Mac) 文件运行

#### 方法 2: 手动启动

**启动后端**:
```bash
cd backend
# 激活虚拟环境 (如果有)
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# 运行服务器
python main.py
```

**启动前端**:
```bash
cd frontend
npm run dev
```

#### 访问地址
- 🎮 **前端应用**: http://localhost:5173
- 🔧 **后端 API**: http://localhost:8000
- 📖 **API 文档**: http://localhost:8000/docs

#### 验证启动成功

**后端检查**:
```bash
curl http://localhost:8000/health
# 应返回: {"status":"healthy","service":"true-sight-backend"}
```

**前端检查**:
浏览器打开 http://localhost:5173，应该看到 "True Sight" 金色标题

### 快速测试功能

启动成功后，在前端页面测试以下功能：

1. **POC 测试** - 验证前后端通信
   - 点击 "进入 POC 测试"
   - 切换到 "Backend API" 标签
   - 点击两个 "Test" 按钮，应该看到绿色成功响应

2. **地图渲染测试** - 验证 2D 地图引擎
   - 点击 "地图渲染测试"
   - 应该看到 800x800 网格地图
   - 10 个英雄点（5 绿 + 5 红）和 6 个眼位标记

3. **解析真实录像** (可选)
   - 访问 API 文档: http://localhost:8000/docs
   - 找到 `POST /api/v1/replays/parse/sync`
   - 使用录像路径: `N:/dota2-ai-pro/data/replays/8674716612.dem`
   - 等待 2-3 秒，应该返回解析成功

💡 **详细测试指南**: 参见 [TESTING_GUIDE.md](./TESTING_GUIDE.md)


## 🛠️ 技术栈

### 前端
- **框架**: Electron 28 + React 18 + TypeScript 5
- **渲染引擎**: PixiJS 8.0 (2D WebGL 地图渲染)
- **样式**: Tailwind CSS
- **构建工具**: Vite

### 后端
- **框架**: Python 3.11 + FastAPI
- **数据处理**: Pandas, NumPy, PyArrow
- **分析引擎**: DuckDB (OLAP 查询)
- **AI/ML**: scikit-learn (聚类分析)

### 数据库
- **SQLite**: 元数据管理 (比赛信息、选手、战队)
- **DuckDB**: 分析查询引擎 (直接查询 Parquet)
- **Parquet**: 时序数据存储 (位置、眼位、击杀)

### 解析器
- **Clarity (Java)** - BSD-3-Clause 协议
  - 性能: 112MB 录像 < 3 秒
  - 数据: 元数据、英雄位置、击杀、眼位
  - 已构建: clarity-parser-1.0.0-uber.jar (17MB)

## 📊 性能测试结果

| 测试项 | 结果 | 目标 | 状态 |
|--------|------|------|------|
| 录像解析 (112MB) | **2.75 秒** | < 5 秒 | ✅ |
| Parquet 写入 100K 行 | **25.66 ms** | < 5000 ms | ✅ |
| Parquet 读取 100K 行 | **17.75 ms** | < 1000 ms | ✅ |
| DuckDB 热力图聚合 | **5.96 ms** | < 500 ms | ✅ |
| SQLite 查询 | **< 1 ms** | < 50 ms | ✅ |

## 📋 开发路线图

### Phase 1: 规划与架构设计 ✅
- [x] 项目规划与架构设计
- [x] PRD 和技术设计文档
- [x] API 规范定义 (52 个端点)

### Phase 2: 技术验证 POC ✅
- [x] 技术验证 POC (所有测试通过)
- [x] Clarity 解析器构建和集成
- [x] Parquet + DuckDB 性能验证
- [x] PixiJS 渲染组件开发

### Phase 3: MVP 核心功能 🚀 (进行中)
- [x] 2D 地图回放引擎 (PixiJS)
- [x] 后端 API 完整实现
- [x] 数据存储层 (Parquet + SQLite)
- [ ] 时间轴控件
- [ ] 前后端数据集成
- [ ] 比赛列表页面

### Phase 4: MVP v1.5 (计划中)
- [ ] 单场热力图
- [ ] 眼位可视化
- [ ] API 自动下载录像

### Phase 5: v2.0 (计划中)
- [ ] 多场次数据聚合
- [ ] 眼位聚类分析 (AI)
- [ ] 失误检测引擎
- [ ] 选手行为指纹

## 🔌 API 端点概览

### 已实现的核心 API

| 模块 | 端点 | 方法 | 说明 |
|------|------|------|------|
| 录像管理 | `/api/v1/replays/upload` | POST | 上传 .dem 文件 |
| | `/api/v1/replays/parse/sync` | POST | 同步解析录像 |
| | `/api/v1/replays/tasks` | GET | 查询解析任务 |
| 比赛数据 | `/api/v1/matches` | GET | 获取比赛列表 |
| | `/api/v1/matches/{id}` | GET | 获取比赛详情 |
| | `/api/v1/matches/{id}/players` | GET | 获取选手表现 |
| 回放数据 | `/api/v1/playback/{id}/ticks` | GET | 获取时序坐标 |
| | `/api/v1/playback/{id}/events` | GET | 获取游戏事件 |
| | `/api/v1/playback/{id}/wards` | GET | 获取眼位数据 |

完整 API 文档: http://localhost:8000/docs (启动后端后访问)

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

详细开发指南请参考 [AGENTS.md](./AGENTS.md)

---

**项目代号**: "True Sight"  
**开始日期**: 2026-02-01  
**当前版本**: MVP 开发阶段
