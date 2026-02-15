# Frontend (React + Vite)

前端负责比赛管理、回放可视化、地图渲染与时间轴交互。

## 开发命令

```bash
npm install
npm run dev
```

常用脚本：
- `npm run build`
- `npm run test`
- `npm run lint`

## 当前页面

- Home：入口导航
- Match List (`MatchListPage`)：比赛管理 + 上传 + 搜索 + 删除 + 跳转回放
- Real Match Viewer (`RealMatchViewer`)：真实回放渲染
- POC / Map Test：联调与渲染测试页

## 本次对齐的已实现能力

- 比赛管理页支持多文件上传：
  - 点击选择和拖拽都支持一次传多个 `.dem`
  - 以前端队列顺序上传，展示批量进度和失败汇总
  - 后端接口仍为单文件 `POST /api/v1/replays/upload`
- 小地图英雄图标映射增强：
  - 英雄名标准化 + 别名映射
  - 兼容下划线差异（如 `anti_mage` <-> `antimage`）
- RealMatchViewer HUD 血条：
  - 阵容头像下方实时血条（基于 tick `hp/max_hp`）
  - hover 显示即时血量数值（当前/最大）
  - 去除血条区域原生 `title`，避免与自定义浮层形成双 tooltip

## 目录（关键路径）

```text
src/renderer/
├── api/
├── components/
│   ├── map/
│   ├── timeline/
│   └── ReplayUploader.tsx
├── data/
├── pages/
│   ├── MatchListPage.tsx
│   └── RealMatchViewer.tsx
└── utils/
```
