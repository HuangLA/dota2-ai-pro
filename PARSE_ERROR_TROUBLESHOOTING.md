# 录像解析错误排查指南

## 问题现象

下载录像后显示错误：
```
PARSE_FAILED: Replay parse failed: [ClarityParserError] Parser failed: [NotImplementedError] NotImplementedError()
```

## 已修复的问题

### ✅ 1. 数据库连接管理问题（已修复）

**问题**：数据库全局连接在异步请求间丢失

**修复** (`backend/database/sqlite_db.py`):
- 添加自动重连机制
- 连接存活性检查
- 自动恢复丢失的连接

### ✅ 2. 错误消息丢失问题（已修复）

**问题**：异常消息被截断或丢失，只显示 "Parser failed:"

**修复** (`backend/parsers/clarity_parser.py`, `backend/services/replay_download_service.py`):
- 改进错误消息格式：`[ExceptionType] detailed_message`
- 添加详细日志记录
- 保留完整的异常堆栈

---

## NotImplementedError 排查步骤

### 第 1 步：清理环境

```cmd
cd backend

# 1. 删除 Python 字节码缓存
del /s /q *.pyc
del /s /q __pycache__

# 2. 清理失败的任务记录
python -c "import sqlite3; conn = sqlite3.connect('data/truesight.db'); cursor = conn.cursor(); cursor.execute('DELETE FROM replay_download_tasks WHERE status = \"failed\"'); conn.commit(); print(f'Deleted {cursor.rowcount} failed tasks'); conn.close()"

# 3. 重启后端
# 确保没有其他 Python 进程在运行
taskkill /F /IM python.exe
python main.py
```

### 第 2 步：使用诊断工具测试

```cmd
cd backend
.venv\Scripts\activate

# 测试特定比赛
python debug_parse_error.py 8717664010

# 查看详细日志
type data\logs\parse_debug.log
```

**预期输出**：
```
[1/3] Initializing database...
  OK - Database initialized

[2/3] Creating services...
  OK - Services created

[3/3] Executing download...

Result:
  Status: completed
  Task ID: <uuid>
  OK - Success
```

### 第 3 步：检查 FastAPI 环境

如果诊断脚本成功，但 FastAPI 后端失败，可能是：

1. **多个后端实例运行**
   ```cmd
   # 检查是否有多个 Python 进程
   tasklist | findstr python
   
   # 全部停止
   taskkill /F /IM python.exe
   ```

2. **端口冲突**
   ```cmd
   # 检查 8000 端口
   netstat -ano | findstr :8000
   ```

3. **uvicorn 热重载问题**
   
   编辑 `backend/main.py`，关闭热重载：
   ```python
   uvicorn.run(
       "main:app",
       host=host,
       port=port,
       reload=False,  # ← 改为 False
       log_level="info",
   )
   ```

### 第 4 步：并发问题排查

如果多次点击"下载并入库"导致错误，可能是并发问题：

**解决方案**：在 `ReplayDownloadService.execute_download()` 中添加锁

编辑 `backend/services/replay_download_service.py`:

```python
import asyncio
from pathlib import Path

class ReplayDownloadService:
    def __init__(self, ...):
        # ... 现有代码 ...
        self._download_locks: dict[int, asyncio.Lock] = {}  # 添加这行
    
    async def execute_download(self, task_id: str) -> dict[str, Any]:
        # 获取任务信息
        task = self.replay_download_storage.get_task(task_id)
        # ... 现有代码 ...
        
        match_id = int(task["match_id"])
        
        # 添加并发锁
        if match_id not in self._download_locks:
            self._download_locks[match_id] = asyncio.Lock()
        
        async with self._download_locks[match_id]:
            # ... 原有的下载逻辑 ...
```

---

## 验证修复

### 测试场景 1：单次下载

1. 启动后端：`python main.py`
2. 打开前端：http://localhost:5173
3. 进入 **OpenDota Live** 页面
4. 点击任意比赛的 "下载并入库"
5. 观察结果：
   - ✅ 应显示 "下载成功"
   - ✅ 状态详情：download_status=completed, parse_status=completed

### 测试场景 2：重复下载（已存在）

1. 再次点击同一比赛的 "下载并入库"
2. 应快速返回 completed（跳过已下载）

### 测试场景 3：并发下载

1. 快速点击多个不同比赛的 "下载并入库"
2. 所有下载应该成功
3. 无 NotImplementedError

---

## 常见问题

### Q1: 为什么我的测试脚本成功，但 FastAPI 失败？

**A**: 可能原因：
1. FastAPI 使用 uvicorn 的自动重载，可能导致模块重复导入
2. 路由在模块级别实例化服务，时序问题
3. Windows 上的 asyncio IocpProactor 在某些情况下有问题

**解决方案**：
- 关闭 uvicorn 热重载（`reload=False`）
- 使用 `python main.py` 启动，而不是 `uvicorn` 命令

### Q2: NotImplementedError 从哪里来的？

**A**: 经过详细排查，代码中没有任何 `raise NotImplementedError`。可能来源：
1. Python 标准库的某些未实现的方法
2. asyncio 在 Windows 上的某些操作
3. 第三方库的内部实现

由于无法稳定重现，建议：
1. 升级 Python 到最新版本
2. 更新依赖：`pip install --upgrade -r requirements.txt`
3. 使用诊断工具收集详细日志

### Q3: 如何预防这个问题？

**A**: 
1. ✅ 始终使用最新的修复代码（已提交到分支）
2. ✅ 定期清理失败的任务记录
3. ✅ 避免短时间内重复点击下载
4. ✅ 监控后端日志，发现问题及时重启

---

## 技术细节

### 错误消息改进

**之前**：
```
PARSE_FAILED: Replay parse failed: Parser failed:
```
（错误信息为空）

**现在**：
```
PARSE_FAILED: Replay parse failed: [ClarityParserError] Parser failed: [NotImplementedError] NotImplementedError()
```
（完整的异常类型和消息）

### 数据库自动重连

**之前**：
```python
def get_connection():
    if _connection is None:
        raise RuntimeError("Database not initialized")
    return _connection
```

**现在**：
```python
def get_connection():
    if _connection is None:
        if _db_path is None:
            raise RuntimeError("Database not initialized")
        # 自动重连
        return init_database(_db_path)
    
    # 检查连接是否存活
    try:
        _connection.execute("SELECT 1")
        return _connection
    except sqlite3.Error:
        # 重新连接
        _connection = None
        return init_database(_db_path)
```

---

## 获取帮助

如果问题仍然存在：

1. **收集诊断信息**：
   ```cmd
   cd backend
   python debug_parse_error.py <match_id> > error_report.txt 2>&1
   ```

2. **查看日志**：
   ```cmd
   type data\logs\parse_debug.log
   ```

3. **提供信息**：
   - Python 版本：`python --version`
   - 操作系统：Windows 版本
   - 错误日志：`error_report.txt`
   - 后端日志：FastAPI 启动后的完整输出

---

最后更新：2026-03-06
