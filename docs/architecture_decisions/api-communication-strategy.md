# API 通信策略 - 架构决策记录

## 决策背景

True Sight 是一个 Electron 桌面应用，需要在前端 (React) 和后端 (Python FastAPI) 之间进行通信。需要决定采用何种通信方式。

## 决策结果

**采用 HTTP REST API (FastAPI)，动态端口分配**

## 理由

### 为什么选择 HTTP 而非 IPC/stdio？

1. **开发体验** ⭐
   - 前后端可以完全独立开发和测试
   - 可以使用 Swagger UI、Postman 等工具调试
   - API 文档直接可用，无需额外转换

2. **架构灵活性** ⭐
   - 未来如果需要改成 C/S 架构（服务端部署），前端代码无需修改
   - 支持未来的云端协作功能扩展
   - 易于集成第三方工具（如性能监控）

3. **标准化** ⭐
   - RESTful API 是工业标准
   - 丰富的生态系统（中间件、认证、限流等）
   - 团队成员更熟悉 HTTP API

### 为什么使用动态端口？

1. **避免端口冲突**: 用户机器上可能 8000 端口被其他应用占用
2. **支持多实例**: 理论上可以同时运行多个 True Sight 实例
3. **安全性**: 随机端口更难被外部访问

## 实现方案

### 1. Electron Main Process (启动流程)

```typescript
// src/main/backend-manager.ts
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import portfinder from 'portfinder';

class BackendManager {
  private process: ChildProcess | null = null;
  private baseUrl: string = '';
  
  async start(): Promise<string> {
    // 1. 找到可用端口
    const port = await portfinder.getPortPromise({
      port: 8000,
      stopPort: 8010
    });
    
    // 2. 启动 Python 后端
    this.process = spawn('python', [
      'resources/backend/main.py',
      '--port', port.toString(),
      '--host', '127.0.0.1'
    ], {
      cwd: app.getAppPath()
    });
    
    // 3. 监听日志
    this.process.stdout?.on('data', (data) => {
      console.log(`[Backend] ${data}`);
    });
    
    this.process.stderr?.on('data', (data) => {
      console.error(`[Backend Error] ${data}`);
    });
    
    // 4. 等待服务就绪
    this.baseUrl = `http://127.0.0.1:${port}`;
    await this.waitForHealthy();
    
    return this.baseUrl;
  }
  
  private async waitForHealthy(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await axios.get(`${this.baseUrl}/api/v1/health`, {
          timeout: 1000
        });
        console.log('[Backend] Service is ready');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Backend failed to start');
  }
  
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export const backendManager = new BackendManager();
```

### 2. IPC 桥接（暴露 URL 给 Renderer）

```typescript
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { backendManager } from './backend-manager';

ipcMain.handle('get-api-base-url', async () => {
  return backendManager.getBaseUrl();
});
```

### 3. Renderer Process (前端使用)

```typescript
// src/renderer/services/api.ts
import axios from 'axios';

class ApiClient {
  private baseUrl: string = '';
  
  async initialize() {
    // 从 Main Process 获取实际的 API URL
    if (window.electron) {
      this.baseUrl = await window.electron.ipcRenderer.invoke('get-api-base-url');
    } else {
      // 开发模式：使用环境变量
      this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
    }
    
    console.log(`[API] Using base URL: ${this.baseUrl}`);
  }
  
  async getMatches(params: MatchQueryParams) {
    return axios.get(`${this.baseUrl}/api/v1/matches`, { params });
  }
}

export const apiClient = new ApiClient();
```

### 4. Python 后端（接收端口参数）

```python
# backend/main.py
import argparse
import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()
    
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info"
    )
```

### 5. 开发环境配置

```bash
# frontend/.env.development
VITE_API_BASE_URL=http://127.0.0.1:8000
```

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
```

## 安全考虑

1. **绑定 127.0.0.1**: 只监听本地回环地址，不暴露到局域网
2. **无认证**: 本地应用不需要 API Key（简化设计）
3. **CORS**: 开发模式启用 CORS，生产模式关闭
4. **进程隔离**: Python 进程由 Electron 管理，应用退出时自动清理

## 替代方案（未采纳）

### 方案 A: Electron IPC
- **优点**: 不需要端口，性能更高
- **缺点**: 无法独立开发测试，API 文档无用

### 方案 B: stdio 通信
- **优点**: 简单
- **缺点**: 不支持并发，调试困难

### 方案 C: 固定端口 8000
- **优点**: 配置简单
- **缺点**: 端口冲突风险高

## 未来演进

如果后续需要支持**云端部署**：

```typescript
// 检测模式
const API_MODE = process.env.API_MODE; // 'local' | 'cloud'

if (API_MODE === 'cloud') {
  baseUrl = 'https://api.truesight.gg';
} else {
  baseUrl = await getLocalBackendUrl();
}
```

## 参考资料

- [Electron IPC 通信最佳实践](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [FastAPI 部署指南](https://fastapi.tiangolo.com/deployment/manually/)
- [Portfinder 文档](https://github.com/http-party/node-portfinder)
