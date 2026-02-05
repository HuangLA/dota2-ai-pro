# True Sight - 快速启动摘要

## 🚀 最快启动方式

### Windows 用户
直接双击项目根目录的 `start-all.bat`

### 其他方式

**后端**:
```bash
cd backend
./start-backend.bat    # Windows
./start-backend.sh     # Linux/Mac
```

**前端**:
```bash
cd frontend
./start-frontend.bat   # Windows
./start-frontend.sh    # Linux/Mac
```

---

## ✅ 验证启动

1. **后端**: 访问 http://localhost:8000/health
   - 应返回: `{"status":"healthy"}`

2. **前端**: 访问 http://localhost:5173
   - 应看到: "True Sight" 金色标题

---

## 🧪 快速测试

### 1. POC 测试
- 点击 "进入 POC 测试" → "Backend API" → 点击 "Test"
- ✅ 看到绿色成功响应

### 2. 地图渲染
- 点击 "地图渲染测试"
- ✅ 看到地图和英雄点

### 3. 解析录像 (可选)
访问 http://localhost:8000/docs，找到 `POST /api/v1/replays/parse/sync`
```json
{"replay_path": "N:/dota2-ai-pro/data/replays/8674716612.dem"}
```

---

## 🐛 常见问题

**问题**: 提示 "python 不是内部或外部命令"

**解决**: 使用完整路径
```cmd
cd backend
python3.11 main.py
```

**问题**: 端口被占用

**解决**: 
```cmd
netstat -ano | findstr :8000
taskkill /PID <进程ID> /F
```

---

## 📖 详细文档

- 完整测试指南: [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- 项目文档: [README.md](./README.md)
- 开发进度: [PROGRESS.md](./PROGRESS.md)

---

**访问地址**:
- 🎮 前端: http://localhost:5173
- 🔧 API: http://localhost:8000
- 📖 文档: http://localhost:8000/docs
