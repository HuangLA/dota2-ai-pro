# Frontend

Electron + React 前端应用

## 目录结构

```
src/
├── main/              # Electron Main Process
│   ├── index.ts       # 主进程入口
│   └── ipc/           # IPC 通信处理
├── renderer/          # React 渲染进程
│   ├── components/    # 可复用组件
│   ├── pages/         # 页面组件
│   ├── hooks/         # 自定义 Hooks
│   ├── utils/         # 工具函数
│   └── App.tsx        # 应用入口
└── assets/            # 静态资源
    ├── images/
    └── styles/
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 技术栈

- **框架**: React 18 + TypeScript
- **UI**: Tailwind CSS
- **地图渲染**: PixiJS
- **状态管理**: Zustand
- **构建工具**: Vite
