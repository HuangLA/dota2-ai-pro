# 项目分析报告: Dota 2 AI Pro (True Sight)

## 1. 项目概述
**项目名称**: True Sight (Dota 2 AI Pro)
**核心目标**: 这是一个面向职业战队的 Dota 2 录像分析桌面应用，旨在通过 AI 辅助解析比赛数据，提供战术分析、视野分析、BP 模拟等功能。

## 2. 技术架构
项目采用现代化的前后端分离架构，结合了高性能解析器：

*   **前端 (Frontend)**:
    *   **框架**: Electron + React + TypeScript
    *   **构建工具**: Vite
    *   **UI/UX**: 采用现代 Web 技术构建桌面客户端体验。
    *   **职责**: 用户通过 Electron 界面进行交互，查看图表、热力图和视频回放。

*   **后端 (Backend)**:
    *   **框架**: Python FastAPI
    *   **职责**: 处理业务逻辑、API 服务、数据聚合与分析。
    *   **数据库**: SQLite (用于元数据) + Parquet (用于海量时序数据) + DuckDB (用于高性能分析查询)。

*   **解析层 (Parsers)**:
    *   **核心引擎**: Go (Manta 解析器) & Java (Clarity 解析器)
    *   **职责**: 高效解析 Dota 2 的 `.dem` 录像文件，提取原子级游戏事件和时序数据。

## 3. 目录结构分析
```text
dota2-ai-pro/
├── frontend/          # Electron + React 源码 (界面层)
├── backend/           # FastAPI 服务源码 (业务逻辑层)
├── parsers/           # Go/Java 解析器源码 (数据提取层)
├── data/              # 本地数据存储 (Database, Replays)
├── docs/              # 项目文档 (API 规范, 架构设计)
├── AGENTS.md          # AI 协作指南与规范
└── PROGRESS.md        # 项目开发进度追踪
```

## 4. 核心功能模块 (基于文档)
*   **录像运维**: 自动上传与解析队列管理。
*   **数据可视化**: 交互式热力图、眼位分布图、经济/经验曲线。
*   **战术分析**: 团战复盘、关键事件时间轴。
*   **AI 辅助**: BP 模拟与建议、视野习惯聚类分析。

## 5. 当前状态 (基于提交信息)
项目处于快速开发阶段，基础架构（前后端分离、解析器集成）已搭建完毕。代码库包含完整的基础设施配置 (`package.json`, `requirements.txt`) 和详细的开发规范文档。
