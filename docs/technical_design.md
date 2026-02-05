# 技术设计文档: Dota 2 职业级录像分析工具

> **最后更新**: 2026-02-04  
> **实现状态**: Phase 3 - MVP 核心功能开发 🚀

## 实现进度概览

| 模块 | 设计状态 | 实现状态 | 备注 |
|------|---------|---------|------|
| 技术栈选型 | ✅ 完成 | ✅ 完成 | 采用 Clarity (Java) 替代 Manta |
| 数据库架构 | ✅ 完成 | ✅ 完成 | SQLite + Parquet + DuckDB |
| Python 后端 | ✅ 完成 | ✅ 完成 | FastAPI + 完整 API |
| 前端架构 | ✅ 完成 | ✅ 完成 | Electron + React + PixiJS |
| 性能优化 | ✅ 完成 | ✅ 验证通过 | 所有性能指标达标 |

## 1. 技术架构概览

### 1.1 分层架构设计

系统采用典型的 **Electron 多进程架构**，确保界面流畅度与计算性能分离。

```
┌─────────────────────────────────────────────────────────┐
│              表示层 (Electron Renderer)                  │
│         React + TypeScript + Tailwind + PixiJS          │
└─────────────────────────────────────────────────────────┘
                          │ IPC
┌─────────────────────────────────────────────────────────┐
│             业务逻辑层 (Electron Main + Python)          │
│          Electron Main Process + Python Sidecar         │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                   数据层 (Persistence)                   │
│         SQLite (元数据) + DuckDB (分析) + Parquet        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                  采集层 (Data Ingestion)                 │
│            Clarity (Java) + Replay Downloader           │
└─────────────────────────────────────────────────────────┘
```

---

### 1.2 技术栈选型

#### 前端 (Electron Renderer Process)
- **框架**: React 18+ + TypeScript
- **UI 库**: Tailwind CSS
- **地图渲染**: PixiJS (2D WebGL 渲染引擎)
- **图表库**: Recharts / Chart.js
- **状态管理**: Zustand / Redux Toolkit
- **构建工具**: Vite / electron-forge

#### 后端 (Electron Main Process + Python)
- **Electron Main**: 窗口管理、文件系统、IPC 通信
- **Python Sidecar**: FastAPI (HTTP) 或 stdio (IPC)
- **数据处理**: Pandas, NumPy
- **机器学习**: scikit-learn (聚类分析)
- **数据库**: 
  - SQLite (元数据管理)
  - DuckDB (分析查询引擎)
  - Parquet (时序数据存储)

#### 数据采集
- **录像解析器**: **Clarity (Java)** - BSD-3-Clause 协议 ⭐ **推荐**
  - 性能最优: TI 决赛 < 3秒（比 Manta 快 3-5 倍）
  - 功能最全: 支持语音、声音等高级功能
  - 维护最活跃: 2025-12 最新更新 (v3.1.3)
  - 备选方案: Manta (Go) - 如无法接受 Java 依赖
  - 详细对比: 见第 1.3 节
- **API 集成**: OpenDota API, Stratz API
- **文件下载**: axios / node-fetch

---

### 1.3 录像解析器选型对比

> **⚠️ 重要技术决策**: 经过深入对比，推荐使用 **Clarity (Java)** 替代 Manta (Go)

#### 三大候选方案对比

| 维度 | Clarity (Java) | Manta (Go) | OpenDota Core |
|------|----------------|------------|---------------|
| **性能** | ⭐⭐⭐⭐⭐ (< 3秒) | ⭐⭐⭐ (~10秒) | ⭐⭐⭐⭐⭐ (基于 Clarity) |
| **集成难度** | ⭐⭐⭐⭐ 中等 | ⭐⭐⭐ 简单 | ⭐⭐⭐⭐⭐ 复杂 |
| **维护状态** | ✅ 非常活跃 (2025-12) | ✅ 活跃 (2025) | ✅ 活跃 (2025) |
| **功能完整性** | ⭐⭐⭐⭐⭐ 最全 | ⭐⭐⭐⭐ 良好 | ⭐⭐⭐⭐⭐ 完整平台 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

#### Clarity 的核心优势

1. **性能最优** ⚡
   - 45分钟比赛 < 2秒，TI 决赛 < 3秒
   - 比 Manta 快 **3-5 倍**
   - 使用 `MappedFileSource` 达到最快速度

2. **功能最全** 📦
   - ✅ 战斗日志、实体、光环、用户消息
   - ✅ 语音数据（Manta 不支持）
   - ✅ 声音事件（Manta 不支持）
   - ✅ 支持多游戏（CSGO/CS2/Deadlock）

3. **维护最活跃** 🔄
   - 最新版本: v3.1.3 (2025-12-16)
   - 每月更新，版本兼容性最好
   - OpenDota 使用，生产验证

#### 集成方案 (已实现 ✅)

```python
# backend/parsers/clarity_parser.py - 实际实现
from backend.parsers import ClarityParser, ParseResult

# 初始化解析器
parser = ClarityParser()

# 同步解析
result: ParseResult = parser.parse("path/to/replay.dem")

# 异步解析 (FastAPI)
result = await parser.parse_async("path/to/replay.dem")

# 访问解析结果
print(f"Match ID: {result.metadata.match_id}")
print(f"Winner: {result.metadata.winner_name}")
print(f"位置样本数: {len(result.positions)}")  # ~53,000
print(f"击杀事件数: {len(result.kills)}")       # ~52
print(f"眼位事件数: {len(result.wards)}")       # ~284
```

#### 已解决的集成问题 ✅

- **JRE 依赖**: 已将 OpenJDK 17.0.18 打包到 `parsers/jdk17/` 目录
- **JAR 打包**: 使用 Gradle Shadow Plugin 构建 Uber JAR (17MB)，包含所有依赖
- **IPC 通信**: 使用 subprocess + JSON stdout，简单可靠
- **性能验证**: 112MB 录像完整解析 < 3 秒

#### 备选方案: Manta (Go)

仅在以下情况选择 Manta:
- 无法接受 Java 依赖
- 性能要求可放宽到 10-15 秒
- 不需要语音/声音数据

详细对比分析请参考: [解析器对比分析报告](../parser_comparison_analysis.md)


## 2. 数据库架构设计

> **⚠️ 重要架构决策**: 采用混合架构而非单一数据库方案

### 2.1 架构选择理由

经过深入研究和性能对比，**SQLite 单独使用无法满足大规模分析查询的性能需求**。

**混合架构**:
```
SQLite (元数据管理) + DuckDB (分析查询) + Parquet (时序数据存储)
```

**性能对比数据**:
| 场景 | SQLite | DuckDB | 性能差距 |
|------|--------|--------|----------|
| 1000万行聚合查询 | 15-30秒 | 2-3秒 | **10-15x** |
| Parquet 直接查询 | 不支持 | 原生支持 | **∞** |
| 多核并行 | 不支持 | 支持 | **4-8x** |

详细分析请参考: [数据库架构深度分析](file:///C:/Users/Administrator/.gemini/antigravity/brain/5d2b4e34-cb68-42e9-8091-583cb8c973e7/database_architecture_analysis.md)

---

### 2.2 SQLite Schema (元数据管理)

**用途**: 存储比赛索引、选手信息、战队数据等结构化元数据

```sql
-- 比赛索引表
CREATE TABLE matches (
    match_id BIGINT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    game_mode INTEGER,
    patch_version TEXT,
    winner_team INTEGER CHECK(winner_team IN (2, 3)),
    radiant_score INTEGER,
    dire_score INTEGER,
    league_id INTEGER,
    replay_path TEXT,
    parse_status TEXT CHECK(parse_status IN ('pending', 'parsing', 'completed', 'failed')),
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 性能优化索引
CREATE INDEX idx_match_time ON matches(start_time DESC);
CREATE INDEX idx_match_league ON matches(league_id);
CREATE INDEX idx_match_patch ON matches(patch_version);

-- 选手表现表
CREATE TABLE player_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    hero_id INTEGER NOT NULL,
    team_id INTEGER,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    gpm INTEGER DEFAULT 0,
    xpm INTEGER DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
    UNIQUE(match_id, account_id)
);

CREATE INDEX idx_player_account ON player_matches(account_id);
CREATE INDEX idx_player_hero ON player_matches(hero_id);

-- 战队表
CREATE TABLE teams (
    team_id INTEGER PRIMARY KEY,
    team_name TEXT NOT NULL,
    team_tag TEXT,
    logo_url TEXT
);

CREATE TABLE team_matches (
    match_id BIGINT,
    team_id INTEGER,
    is_radiant BOOLEAN,
    is_winner BOOLEAN,
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE
);

-- 英雄/物品字典表
CREATE TABLE heroes (
    id INTEGER PRIMARY KEY, 
    name TEXT NOT NULL, 
    localized_name TEXT NOT NULL,
    primary_attr TEXT,
    roles TEXT
);

CREATE TABLE items (
    id INTEGER PRIMARY KEY, 
    name TEXT NOT NULL, 
    cost INTEGER
);

-- 版本兼容性追踪
CREATE TABLE dota_versions (
    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_string TEXT UNIQUE NOT NULL,
    release_date INTEGER,
    parser_compatible BOOLEAN DEFAULT 1,
    manta_version TEXT
);
```

**SQLite 性能优化配置**:
```python
import sqlite3

def init_sqlite_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 启用 WAL 模式 (提升并发性能)
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    
    # 增加缓存大小到 64MB
    cursor.execute("PRAGMA cache_size = -64000;")
    
    # 启用内存映射 (加速读取)
    cursor.execute("PRAGMA mmap_size = 268435456;")
    
    conn.commit()
    return conn
```

---

### 2.3 Parquet 文件结构 (时序数据存储)

每场比赛存储在独立目录: `data/matches/{match_id}/`

#### 1. `ticks.parquet` - 核心时序数据
```python
{
    'tick': 'int32',           # 游戏 tick
    'time': 'int32',           # 游戏时间 (秒)
    'hero_id': 'int16',        # 英雄 ID
    'player_slot': 'int8',     # 玩家槽位
    'x': 'float32',            # X 坐标
    'y': 'float32',            # Y 坐标
    'hp': 'int16',             # 当前生命值
    'mana': 'int16',           # 当前魔法值
    'gold': 'int32',           # 当前金钱
    'net_worth': 'int32',      # 净资产
    'level': 'int8',           # 等级
    'is_alive': 'bool',        # 是否存活
}

# 预估: 45分钟比赛 ≈ 810,000 行 ≈ 32 MB (压缩后)
```

#### 2. `wards.parquet` - 眼位数据
```python
{
    'tick': 'int32',
    'time': 'int32',
    'ward_id': 'int32',
    'type': 'string',          # 'observer' 或 'sentry'
    'x': 'float32',
    'y': 'float32',
    'placer_hero_id': 'int16',
    'placer_team': 'int8',
    'placed_at': 'int32',
    'expires_at': 'int32',
    'destroyed_at': 'int32',
}

# 预估: 200-500 行/场 ≈ 50 KB
```

#### 3. `combat_log.parquet` - 战斗日志
```python
{
    'tick': 'int32',
    'time': 'int32',
    'event_type': 'string',    # 'damage', 'heal', 'kill', 'stun'
    'source_unit': 'int16',
    'target_unit': 'int16',
    'inflictor': 'string',     # 技能/物品名称
    'value': 'int32',          # 伤害/治疗量
    'damage_type': 'string',
}

# 预估: 10,000-50,000 行/场 ≈ 2-10 MB
```

#### 4. `smokes.parquet` - 开雾数据
```python
{
    'smoke_id': 'int32',
    'team': 'int8',
    'start_time': 'int32',
    'end_time': 'int32',
    'participants': 'string',  # JSON 数组
    'start_x': 'float32',
    'start_y': 'float32',
    'break_reason': 'string',
    'kills_during': 'int8',
}

# 预估: 10-30 行/场 ≈ 10 KB
```

---

### 2.4 DuckDB 查询引擎

**用途**: 执行大规模聚合查询，直接查询 Parquet 文件

**示例查询 1: 生成单场热力图**
```python
import duckdb

conn = duckdb.connect(':memory:')

query = """
SELECT 
    FLOOR(x / 128) * 128 AS grid_x,
    FLOOR(y / 128) * 128 AS grid_y,
    COUNT(*) AS density
FROM 'data/matches/8123456789/ticks.parquet'
WHERE hero_id = 1 AND time BETWEEN 600 AND 1200
GROUP BY grid_x, grid_y
"""
result = conn.execute(query).fetchdf()
```

**示例查询 2: 聚合 50 场比赛的眼位数据**
```python
query = """
SELECT 
    FLOOR(x / 64) * 64 AS grid_x,
    FLOOR(y / 64) * 64 AS grid_y,
    COUNT(*) AS ward_count
FROM 'data/matches/*/wards.parquet'
WHERE type = 'observer' AND placer_team = 2
GROUP BY grid_x, grid_y
HAVING ward_count >= 3
ORDER BY ward_count DESC
LIMIT 100
"""
result = conn.execute(query).fetchdf()
```

---

### 2.5 数据流设计

```
录像解析 (Clarity Java)
    ↓
写入 Parquet 文件 (时序数据)
    ↓
提取元数据写入 SQLite (比赛信息、选手表现)
    ↓
用户查询:
  - 元数据查询 (比赛列表、选手信息) → SQLite
  - 分析查询 (热力图、眼位聚合) → DuckDB 查询 Parquet
```

---

## 3. Python 后端架构

### 3.1 插件化 Pipeline 设计

```python
# 核心 Pipeline 框架
class AnalysisPipeline:
    def __init__(self):
        self.analyzers = []
    
    def register(self, analyzer):
        """注册分析器"""
        self.analyzers.append(analyzer)
    
    def process(self, match_data):
        """处理单场比赛数据"""
        results = {}
        for analyzer in self.analyzers:
            try:
                results[analyzer.name] = analyzer.analyze(match_data)
            except Exception as e:
                results[analyzer.name] = {"error": str(e)}
        return results

# 各模块作为独立分析器
class WardAnalyzer:
    name = "ward_analysis"
    
    def analyze(self, data):
        # 提取眼位数据
        return {"ward_positions": [...], "efficiency": 0.85}

class SmokeAnalyzer:
    name = "smoke_analysis"
    
    def analyze(self, data):
        # 分析开雾事件
        return {"smoke_events": [...], "success_rate": 0.6}

# 使用示例
pipeline = AnalysisPipeline()
pipeline.register(WardAnalyzer())
pipeline.register(SmokeAnalyzer())
results = pipeline.process(match_data)
```

**优势**:
- 新增分析功能只需编写新的 Analyzer 类并注册
- 各模块可独立测试和调试
- 支持按需启用/禁用特定分析器

---

### 3.3 扩展性设计原则

#### 模块解耦
- **前后端分离**: UI 只负责展示 JSON 数据，不包含任何计算逻辑
- **云端迁移**: 未来如果要把后端迁移到云端，前端只需更改 API 地址即可
- **接口标准化**: 所有模块间通信使用标准 JSON 格式

#### 插件化架构
- 分析模块采用 Pipeline 模式（见 3.1节）
- 新增功能无需修改主流程，只需编写新的 Analyzer 类并注册
- 支持动态加载/卸载分析器
- 示例：未来要加"反补分析"，只需写一个新的 `DenyAnalyzer` 类并注册到 Pipeline 中


### 3.2 Electron-Python IPC 通信

**方案 1: HTTP (FastAPI)**
```python
# Python 端 (FastAPI)
from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.post("/parse_replay")
async def parse_replay(replay_path: str):
    # 调用 Manta 解析器
    result = parse_dem_file(replay_path)
    return {"status": "success", "data": result}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

```typescript
// Electron 端
import axios from 'axios';

async function parseReplay(replayPath: string) {
  const response = await axios.post('http://127.0.0.1:8000/parse_replay', {
    replay_path: replayPath
  });
  return response.data;
}
```

**方案 2: stdio (标准输入输出)**
```python
# Python 端
import sys
import json

def main():
    for line in sys.stdin:
        request = json.loads(line)
        if request['action'] == 'parse_replay':
            result = parse_dem_file(request['replay_path'])
            print(json.dumps({"status": "success", "data": result}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
```

```typescript
// Electron 端
import { spawn } from 'child_process';

const pythonProcess = spawn('python', ['backend/main.py']);

function sendRequest(action: string, data: any) {
  return new Promise((resolve) => {
    pythonProcess.stdin.write(JSON.stringify({ action, ...data }) + '\n');
    pythonProcess.stdout.once('data', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}
```

---

## 4. 前端架构设计

### 4.1 PixiJS 地图渲染引擎 (已实现 ✅)

实际实现位于: `frontend/src/renderer/components/map/DotaMapRenderer.ts`

```typescript
// DotaMapRenderer - 核心渲染引擎
import * as PIXI from 'pixi.js';

export class DotaMapRenderer {
  private app: PIXI.Application;
  private layers: {
    map: PIXI.Container;      // 地图底图
    wards: PIXI.Container;    // 眼位层
    heroes: PIXI.Container;   // 英雄层
  };

  constructor(container: HTMLElement, width = 800, height = 800) {
    this.app = new PIXI.Application();
    await this.app.init({
      width, height,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    });
    // 多图层架构: 地图 → 眼位 → 英雄
    this.initLayers();
  }

  // 游戏坐标 (±7500) → 屏幕坐标
  private gameToScreen(x: number, y: number): { x: number; y: number } {
    const MAP_MIN = -7500, MAP_MAX = 7500;
    const range = MAP_MAX - MAP_MIN;
    return {
      x: ((x - MAP_MIN) / range) * this.width,
      y: this.height - ((y - MAP_MIN) / range) * this.height,
    };
  }

  // 更新英雄位置
  updateHeroPositions(heroes: HeroPosition[]) {
    heroes.forEach(hero => {
      const pos = this.gameToScreen(hero.x, hero.y);
      // 根据 team 设置颜色: Radiant=绿色, Dire=红色
      this.updateHeroSprite(hero.heroId, pos.x, pos.y, hero.team);
    });
  }

  // 渲染眼位
  renderWards(wards: WardData[]) {
    wards.forEach(ward => {
      const pos = this.gameToScreen(ward.x, ward.y);
      // observer=圆形, sentry=方形
      this.renderWard(ward.type, pos.x, pos.y, ward.team);
    });
  }
}
```

**已实现功能**:
- ✅ PixiJS 8.0 初始化 (800x800 画布，高 DPI 支持)
- ✅ 游戏坐标系转换 (±7500 units → 屏幕坐标)
- ✅ 多图层架构 (地图底层 → 眼位层 → 英雄层)
- ✅ 英雄位置渲染 (Radiant 绿色 / Dire 红色)
- ✅ 眼位渲染 (Observer 圆形 / Sentry 方形)
- ✅ React 组件封装 (MapViewer.tsx)

---

### 4.2 时间轴控制组件

```typescript
interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
}

function Timeline({ duration, currentTime, onSeek, onPlay, onPause }: TimelineProps) {
  return (
    <div className="timeline">
      <button onClick={onPlay}>播放</button>
      <button onClick={onPause}>暂停</button>
      <input
        type="range"
        min={0}
        max={duration}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>
  );
}
```

---

## 5. 性能优化策略

### 5.1 性能基准测试目标

| 操作 | 目标性能 | 测试数据量 |
|------|----------|------------|
| 单场比赛导入 SQLite | < 1 秒 | 10 个选手 |
| 单场比赛解析并存储 Parquet | < 30 秒 | 45 分钟比赛 |
| 查询单场比赛元数据 | < 50 ms | SQLite 索引查询 |
| 生成单场热力图 (DuckDB) | < 500 ms | 81,000 行数据 |
| 聚合 50 场比赛眼位 (DuckDB) | < 1 秒 | 10,000 行眼位数据 |
| 地图渲染帧率 | 60 FPS | 10 个英雄实时移动 |

---

### 5.2 优化策略

#### 数据库优化
- 在关键字段上建立索引
- 使用分区存储（按时间段、英雄等维度）
- 实现数据预聚合（提前计算常用指标）

#### 预解析与缓存策略
- **录像导入预解析**: 
  - 在录像导入时立即提取关键坐标数据
  - 预计算常用时间段的热力图网格数据（如 5 分钟间隔）
  - 存储到 SQLite 的 `heatmap_cache` 表或独立的 Parquet 文件
- **查询加速**: 
  - 生成热力图时直接读取预计算数据
  - 目标响应时间 < 1秒（相比实时计算的 5-10秒）
  - 避免实时扫描大量 Parquet 原始数据
- **缓存失效**: 
  - 当原始数据更新时自动重新计算缓存
  - 支持手动清除缓存

#### 渲染优化
- 使用 PixiJS 的 ParticleContainer 批量渲染
- 实现视口裁剪（只渲染可见区域）
- 使用对象池减少 GC 压力

#### 查询优化
- 实现查询结果缓存
- 使用 Web Worker 处理大数据量计算
- 增量加载数据（只加载当前时间窗口）

---

## 6. 风险分析与缓解策略

### 6.1 风险优先级矩阵

| 风险 | 影响 | 概率 | 优先级 | 缓解成本 |
|------|------|------|--------|----------|
| 录像解析兼容性 | 高 | 中 | **P0** | 中 |
| AI 功能实现难度 | 中 | 高 | **P1** | 高 |
| 数据性能挑战 | 中 | 中 | **P1** | 中 |
| 第三方 API 依赖 | 低 | 低 | P2 | 低 |

详细风险分析请参考: [可行性分析报告](file:///C:/Users/Administrator/.gemini/antigravity/brain/5d2b4e34-cb68-42e9-8091-583cb8c973e7/feasibility_analysis.md)

---

## 7. 开发环境配置

### 7.1 依赖安装

**Node.js 依赖**:
```bash
npm install electron react react-dom typescript
npm install pixi.js recharts zustand
npm install better-sqlite3 @electron/rebuild
npm install -D vite @vitejs/plugin-react
```

**Python 依赖**:
```bash
pip install fastapi uvicorn
pip install pandas numpy pyarrow
pip install duckdb scikit-learn
pip install requests aiohttp
```

**Java 依赖** (Clarity 解析器):
```bash
# 安装 JRE 17+
# Windows: 下载并安装 OpenJDK 17
# macOS: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jre

# 下载 Clarity
git clone https://github.com/skadistats/clarity.git
cd clarity
./gradlew build
```

**备选: Go 依赖** (Manta 解析器):
```bash
go get github.com/dotabuff/manta/v2
```

---

### 7.2 项目目录结构

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

---

## 8. 实现状态与下一步行动

### ✅ 已完成 (2026-02-04)

#### 技术验证 POC - 全部通过
- ✅ 构建 Clarity 解析器 (Java) - clarity-parser-1.0.0-uber.jar (17MB)
- ✅ 解析性能测试: 112MB 录像 < 3 秒
- ✅ Parquet 读写性能: 100K 行写入 25.66ms，读取 17.75ms
- ✅ DuckDB 聚合查询: 热力图聚合 5.96ms
- ✅ SQLite 元数据查询: < 1ms

#### 基础框架搭建 - 完成
- ✅ Electron + React + TypeScript 项目初始化
- ✅ FastAPI 后端服务搭建
- ✅ Python-Java IPC 通信 (subprocess + JSON)

#### 数据层实现 - 完成
- ✅ SQLite Schema 设计与实现 (matches, players, teams 等)
- ✅ Parquet 存储层 (positions.parquet, kills.parquet, wards.parquet)
- ✅ DuckDB 分析查询集成

#### MVP 核心功能 - 部分完成
- ✅ 2D 地图渲染引擎 (DotaMapRenderer + MapViewer)
- ✅ 后端 API 完整实现 (16 个端点)
- ✅ 数据存储和服务层 (storage/, services/)

### 🚀 进行中

#### 当前冲刺目标 (截止 2026-02-06)
1. **时间轴控件开发**
   - 播放/暂停/拖动功能
   - 与地图渲染联动

2. **前后端数据集成**
   - 连接后端 API，显示真实录像数据
   - 实现比赛选择和加载

### 📅 近期计划

#### MVP v1.0 剩余功能
- [ ] 比赛列表页面
- [ ] 单场热力图生成
- [ ] 眼位可视化

#### MVP v1.5 功能
- [ ] OpenDota API 集成 (自动下载录像)
- [ ] 后台解析队列
- [ ] 移动轨迹分析

### 📊 性能测试结果

| 测试项 | 结果 | 目标 | 状态 |
|--------|------|------|------|
| 录像解析 (112MB) | 2752 ms | < 5000 ms | ✅ PASS |
| Parquet 写入 100K 行 | 25.66 ms | < 5000 ms | ✅ PASS |
| Parquet 读取 100K 行 | 17.75 ms | < 1000 ms | ✅ PASS |
| DuckDB 热力图聚合 | 5.96 ms | < 500 ms | ✅ PASS |
| SQLite 查询 | < 1 ms | < 50 ms | ✅ PASS |

**结论**: 所有性能指标均达标，技术选型验证通过。
