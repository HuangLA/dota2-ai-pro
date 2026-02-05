# True Sight - 启动和测试指南

## 📋 前置要求

### 已安装的软件（应该已经有了）
- ✅ Python 3.11 (虚拟环境在 `backend/.venv/`)
- ✅ Node.js (已安装 737 packages)
- ✅ Java 17 (在 `parsers/jdk17/`)
- ✅ 测试录像文件 (在 `data/replays/`)

---

## 🚀 方法一：使用启动脚本（推荐）

### 1. 启动后端

打开第一个终端：

```bash
cd N:\dota2-ai-pro\backend
./start-backend.sh
```

**预期输出**：
```
================================
True Sight Backend 启动中...
================================

✓ 找到虚拟环境
检查依赖...
检查数据目录...

================================
✓ 准备完成
================================

后端将运行在: http://localhost:8000
API 文档: http://localhost:8000/docs

按 Ctrl+C 停止服务器

================================

INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. 启动前端

打开第二个终端：

```bash
cd N:\dota2-ai-pro\frontend
./start-frontend.sh
```

**预期输出**：
```
================================
True Sight Frontend 启动中...
================================

✓ 找到 node_modules

================================
✓ 准备完成
================================

前端将运行在: http://localhost:5173

按 Ctrl+C 停止服务器

================================

  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 🚀 方法二：手动启动

### 启动后端

```bash
cd N:\dota2-ai-pro\backend

# 激活虚拟环境（如果有）
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate     # Windows

# 启动服务器
python main.py
# 或
python3 main.py
```

### 启动前端

```bash
cd N:\dota2-ai-pro\frontend

# 启动开发服务器
npm run dev
```

---

## 🧪 测试步骤

### ✅ 1. 测试后端健康检查

打开浏览器或使用 curl：

```bash
curl http://localhost:8000/health
```

**预期响应**：
```json
{
  "status": "healthy",
  "service": "true-sight-backend"
}
```

### ✅ 2. 查看 API 文档

浏览器打开：
```
http://localhost:8000/docs
```

你应该能看到完整的 Swagger API 文档，包括：
- `/api/v1/replays/*` - 录像管理
- `/api/v1/matches/*` - 比赛数据
- `/api/v1/playback/*` - 回放数据

### ✅ 3. 测试前端主页

浏览器打开：
```
http://localhost:5173
```

你应该看到：
- **True Sight** 标题（金色）
- **Dota 2 职业级录像分析工具** 副标题
- 两个按钮：
  - 进入 POC 测试（红色）
  - 地图渲染测试（蓝色）

### ✅ 4. 测试 POC 功能

1. 点击 **"进入 POC 测试"**
2. 切换到 **"Backend API"** 标签
3. 点击两个 **"Test"** 按钮：
   - Health Check
   - List Matches

**预期结果**：
- ✅ 绿色背景 = 成功
- 显示 JSON 响应
- 显示响应时间（几毫秒）

4. 切换到 **"Summary"** 标签

**预期结果**：
- Frontend 部分全部绿点
- Backend 部分（测试后）变成绿点
- 显示 "All core systems verified and operational!"

### ✅ 5. 测试地图渲染器

1. 返回主页（点击左上角 "Back to Home"）
2. 点击 **"地图渲染测试"**

**预期结果**：
- 看到 800x800 的黑色网格地图
- 10 个英雄位置点：
  - 5 个绿色点（Radiant）
  - 5 个红色点（Dire）
- 6 个眼位标记
- 右侧面板显示英雄列表

3. 测试控制开关：
   - 取消勾选 "Show Heroes" → 英雄点消失
   - 重新勾选 → 英雄点出现
   - 取消勾选 "Show Wards" → 眼位消失
   - 重新勾选 → 眼位出现

---

## 🎮 高级测试：解析真实录像

### 前提条件
- 确保 `N:\dota2-ai-pro\data\replays\` 中有 `.dem` 文件
- 两个测试文件应该已经存在：
  - `8674716612.dem` (112 MB)
  - `8676017978.dem` (110 MB)

### 使用 Swagger UI 测试

1. 打开 API 文档：http://localhost:8000/docs

2. 找到 **POST /api/v1/replays/parse/sync**

3. 点击 "Try it out"

4. 填写 Request Body：
```json
{
  "replay_path": "N:/dota2-ai-pro/data/replays/8674716612.dem"
}
```

5. 点击 "Execute"

**预期结果**（约 2-3 秒）：
```json
{
  "match_id": 8674716612,
  "status": "completed",
  "message": "Parse completed successfully",
  "parse_time": 2.75,
  "data": {
    "match_id": 8674716612,
    "radiant_win": true,
    "duration": 2247,
    // ... 更多数据
  }
}
```

### 使用 curl 测试

```bash
curl -X POST http://localhost:8000/api/v1/replays/parse/sync \
  -H "Content-Type: application/json" \
  -d '{"replay_path": "N:/dota2-ai-pro/data/replays/8674716612.dem"}'
```

### 查询已解析的比赛

```bash
curl http://localhost:8000/api/v1/matches
```

**预期响应**：
```json
{
  "matches": [
    {
      "match_id": 8674716612,
      "radiant_win": true,
      "duration": 2247,
      "radiant_team": "Radiant",
      "dire_team": "Dire",
      "parsed_at": "2026-02-04T22:30:00"
    }
  ],
  "total": 1
}
```

### 获取英雄位置数据

```bash
# 获取前 60 秒的英雄位置
curl "http://localhost:8000/api/v1/playback/8674716612/ticks?start_time=0&end_time=60"
```

**预期响应**：
```json
{
  "positions": [
    {
      "tick": 900,
      "game_time": 30.0,
      "hero_id": 1,
      "hero_name": "npc_dota_hero_antimage",
      "team": "radiant",
      "x": -6234.5,
      "y": -5891.2,
      "hp": 620,
      "max_hp": 640,
      "mana": 280,
      "max_mana": 340,
      "level": 3
    }
    // ... 更多位置数据
  ],
  "total": 120
}
```

---

## 🐛 常见问题

### 问题 1：后端端口被占用

**错误信息**：
```
OSError: [Errno 98] Address already in use
```

**解决方法**：
```bash
# 查找占用 8000 端口的进程
lsof -i :8000
# 或
netstat -ano | grep :8000

# 杀死进程
kill -9 <PID>
```

### 问题 2：前端端口被占用

**错误信息**：
```
Port 5173 is in use
```

**解决方法**：
Vite 会自动尝试下一个端口（5174, 5175...）

### 问题 3：Python 依赖缺失

**错误信息**：
```
ModuleNotFoundError: No module named 'fastapi'
```

**解决方法**：
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

### 问题 4：Node 依赖缺失

**错误信息**：
```
Cannot find module 'vite'
```

**解决方法**：
```bash
cd frontend
npm install
```

---

## 📊 性能基准

如果一切正常，你应该看到以下性能：

| 测试项 | 预期结果 | 说明 |
|--------|---------|------|
| 后端健康检查 | < 10ms | 简单响应 |
| 获取比赛列表 | < 50ms | SQLite 查询 |
| 解析 110MB 录像 | < 3s | Clarity 解析器 |
| 获取 tick 数据 | < 100ms | Parquet 读取 |
| 前端地图渲染 | 60 FPS | PixiJS 渲染 |

---

## ✅ 成功标志

如果你能完成以上所有测试，说明：

✅ 后端 API 服务器正常运行
✅ 前端开发服务器正常运行
✅ 前后端通信正常
✅ 解析器可以正常解析录像
✅ 数据存储和读取正常
✅ 地图渲染引擎正常工作

**恭喜！核心系统已验证通过！** 🎉

---

## 📝 下一步

测试通过后，可以开始：

1. **前后端数据集成** - 在地图上显示真实录像数据
2. **时间轴控件** - 添加播放/暂停/拖动功能
3. **比赛列表页面** - 显示已解析的比赛
4. **更多可视化功能** - 热力图、移动轨迹等

---

## 🆘 需要帮助？

如果遇到问题：

1. 检查终端错误信息
2. 查看浏览器控制台（F12）
3. 访问 API 文档：http://localhost:8000/docs
4. 查看日志文件（如果有）

**祝测试顺利！** 🚀
