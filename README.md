# Dota 2 职业级录像分析工具 ("True Sight")

一款为 Dota 2 职业战队打造的桌面端录像分析应用，提供深度的位置数据、视野效率分析和 AI 驱动的对手模式识别。

## 🎯 项目状态

**当前阶段**: 规划与架构设计 ✅  
**下一步**: 技术验证 POC

## 📁 项目结构

```
dota2-ai-pro/
├── frontend/                 # Electron + React 前端
│   ├── src/
│   │   ├── main/            # Electron Main Process
│   │   ├── renderer/        # React 渲染进程
│   │   │   ├── components/  # React 组件
│   │   │   ├── pages/       # 页面
│   │   │   ├── hooks/       # 自定义 Hooks
│   │   │   └── utils/       # 工具函数
│   │   └── assets/          # 静态资源
│   └── package.json
├── backend/                  # Python 后端
│   ├── main.py              # FastAPI 入口
│   ├── parsers/             # 解析器模块
│   ├── analyzers/           # 分析器模块
│   ├── database/            # 数据库操作
│   └── requirements.txt
├── parsers/                  # Go 解析器
│   └── manta_wrapper.go
├── data/                     # 数据存储
│   ├── database/            # SQLite 数据库
│   ├── matches/             # Parquet 文件
│   └── replays/             # .dem 录像文件
├── docs/                     # 文档
│   ├── PRD.md
│   ├── technical_design.md
│   └── database_architecture_analysis.md
└── task.md                   # 任务清单
```

## 📚 核心文档

- **[PRD.md](./PRD.md)** - 产品需求文档
- **[technical_design.md](./technical_design.md)** - 技术设计文档
- **[task.md](./task.md)** - 开发任务清单

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Python 3.9+
- Go 1.20+

### 安装依赖

**前端**:
```bash
cd frontend
npm install
```

**后端**:
```bash
cd backend
pip install -r requirements.txt
```

**Go 解析器**:
```bash
cd parsers
go mod init dota2-parser
go get github.com/dotabuff/manta/v2
```

## 🛠️ 技术栈

### 前端
- Electron + React + TypeScript
- PixiJS (2D 地图渲染)
- Tailwind CSS

### 后端
- Python + FastAPI
- Pandas + NumPy
- scikit-learn (AI 分析)

### 数据库
- SQLite (元数据管理)
- DuckDB (分析查询)
- Parquet (时序数据存储)

### 解析器
- Manta (Go) - MIT 协议

## 📋 开发路线图

### Phase 1: MVP v1.0 (2-3个月)
- [x] 项目规划与架构设计
- [ ] 技术验证 POC
- [ ] 基础框架搭建
- [ ] 2D 地图回放引擎
- [ ] 基础仪表盘

### Phase 2: MVP v1.5 (1-2个月)
- [ ] 单场热力图
- [ ] 眼位可视化
- [ ] API 自动下载录像

### Phase 3: v2.0 (2-3个月)
- [ ] 多场次数据聚合
- [ ] 眼位聚类分析
- [ ] 失误检测引擎
- [ ] 选手行为指纹

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**项目代号**: "True Sight"  
**开始日期**: 2026-02-01
