# Frontend (React + Vite)

前端负责比赛管理、回放可视化、地图渲染、时间轴交互、OpenDota 同步浏览与战队档案。

## 开发命令

```bash
npm install
npm run dev
```

常用脚本：
- `npm run build`
- `npm run test`
- `npm run lint`

## 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Home | `/` | 入口导航 |
| OpenDota Live | `/opendota-live` | 远端比赛同步/浏览/入库 |
| Replay Library | `/replay-library` | 本地已解析录像管理 |
| Match Database | `/match-database` | 比赛数据库（筛选/分页/批量下载） |
| Team Profile | `/team-profile` | 战队归档（赛事分组/对比/快照） |
| Match List | `/matches` | 比赛列表（上传/搜索/删除） |
| Real Match Viewer | `/match/:id` | 回放查看器（地图/时间轴/HUD/曲线） |

## 核心组件

- `DotaMapRenderer`：PixiJS 8 地图渲染引擎（英雄图标/眼位/击杀标记/热力图/路径轨迹）
- `MapViewer`：React 地图包装组件
- `Timeline`：播放控制（播放/暂停/拖动/速度/快捷键/暂停区间可视化）
- `AdvantageChart`：Recharts 经济+经验优势曲线
- `ReplayUploader`：多文件拖拽上传 + 任务监控

## 状态管理

- Zustand store（`src/store/`）
- TanStack Query 管理 API 请求缓存
- 会话态跨页保留（Match Database ↔ Team Profile ↔ Replay Viewer）

## 目录结构

```text
src/renderer/
├── api/
│   └── backend.ts            后端 API 客户端
├── components/
│   ├── charts/
│   │   └── AdvantageChart.tsx 经济/经验优势曲线
│   ├── map/
│   │   ├── DotaMapRenderer.ts PixiJS 渲染引擎
│   │   └── MapViewer.tsx      React 地图包装
│   ├── timeline/
│   │   └── Timeline.tsx       播放控制组件
│   └── ReplayUploader.tsx     录像上传组件
├── data/
│   ├── heroes.ts              英雄数据 (127 个英雄 ID/名称/中文名)
│   └── mapElements.ts         地图元素配置
├── hooks/                     React Hooks
├── pages/
│   ├── MatchDatabasePage.tsx  比赛数据库
│   ├── MatchListPage.tsx      比赛列表 (上传/管理)
│   ├── OpenDotaLivePage.tsx    OpenDota 实时比赛
│   ├── RealMatchViewer.tsx     回放查看器
│   ├── ReplayLibraryPage.tsx   本地录像库
│   ├── TeamProfilePage.tsx     战队档案
│   ├── MapTestPage.tsx         地图测试
│   └── POCTestPage.tsx         POC 测试
├── store/                     Zustand 状态管理
├── types/                     TypeScript 类型
├── utils/                     工具函数
├── App.tsx                    主应用 (HashRouter 路由)
└── main.tsx                   入口
```
