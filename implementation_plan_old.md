# 产品需求文档 (PRD): Dota 2 职业级录像分析工具 ("True Sight")

## 1. 项目简介
**目标**: 为 Dota 2 职业战队打造一款可执行的桌面端录像分析应用。该工具旨在通过提供比公共数据网站（如 Dotabuff）更深度的洞察，特别是专注于**位置数据**、**视野效率**以及基于 **AI 的对手模式识别**，从而辅助战队制定战术。

## 2. 用户画像 (User Personas)
- **分析师 (Analyst)**: 负责上传训练赛/比赛录像，标记关键时间点，生成关于对手习惯的深度报告。
- **教练 (Coach)**: 使用 2D 地图回放功能与队员一起复盘比赛，通过在地图上画线来讲解战术移动。
- **职业选手 (Player)**: 检查特定的个人指标（例如：“我的刷钱效率是否达到了 一线 Carry 的水平？”）并研究对位选手的习惯。

## 3. 项目与分期规划

### 第一阶段: MVP (基础功能)
- **本地桌面应用**: 离线优先，稳定，数据安全，无需上传大文件。
- **录像解析**: 高性能解析 `.dem` 录像文件。
- **比赛仪表盘**:
  - 记分板 (KDA, 财产总和, 正反补)。
  - 趋势图表 (金钱差, 经验差, 胜率曲线)。
- **2D 地图回放**:
  - 可交互的 Dota 2 地图俯视图。
  - 时间轴拖动条。
  - 显示英雄、建筑、信使和守卫 (眼) 的实时图标移动。

### 第二阶段: AI 与进阶模块 (核心差异化)
- **习惯分析 (AI)**:
  - **眼位聚类分析**: “LGD 战队在天辉方 10-20 分钟通常把眼插在哪里？”
  - **开雾路径**: 识别并展示常见的开雾游走路线。
- **选手/战队数据库**:
  - 创建本地数据库 (SQLite/Parquet)，按“选手”或“战队”归档录像。
  - **支持海量聚合**: 支持选中 **50+** 场比赛进行综合分析（如“该选手过去一个月所有比赛的眼位热力图”）。
  - *技术策略*: 录像导入时进行“预解析”，提取关键坐标存入数据库。生成热力图时直接读取数据库，耗时 < 1秒。
- **性能对标**:
  - 将选手的关键指标（如“补刀/分钟”，“支援响应时间”）与数据库中的顶级职业局数据进行对比。

## 4. 功能需求 (Functional Requirements)

## 4. 功能需求 (Functional Requirements)

### 4.1. 模块 0: 录像控制塔 (Replay Ops Center) - 通用基础设施
**定位**: 负责所有数据的获取、处理与管理。是连接外部 API 和内部分析模块的枢纽。

- **FR-01 (录像获取与入库)**: 
  - **拖拽导入**: 支持本地 `.dem` 文件直接导入。
  - **搜索下载**: 集成 OpenDota/Stratz API，输入 Match ID 自动下载并解压录像到本地。
  - **解析队列**: 后台自动解析新入库的录像，提取关键数据存入本地数据库。
- **FR-02 (录像管理系统)**:
  - **本地知识库**: 建立基于 SQLite/Parquet 的索引。按“战队”、“选手”、“比赛时间”、“版本”对本地录像进行归档。
  - **全局搜索**: 允许用户搜索“所有包含 Ame 的比赛”或“所有 LGD 的比赛”。

---

### 4.2. 模块 A: 比赛显微镜 (Match Inspector) - 单场复盘
**定位**: 针对**单场比赛**的深度复盘与细节还原。

- **FR-A01 (战况仪表盘)**: 
  - 比赛摘要、积分板、经济/经验差曲线。
- **FR-A02 (2D 地图回放引擎)**: 
  - **全功能回放**: PixiJS 渲染地图、英雄、建筑、守卫。支持时间轴拖动、倍速播放。
  - **单场热力图 (New)**: 
    - 选中某英雄，显示其在当前时间段（如 10:00-15:00）的**移动热区**和**行进路线**。
    - 用途：分析选手“这一局”的刷钱路线是否高效，或寻找被抓的原因。
  - **视野遗憾模拟 (Vision Miss)**: 赛后分析真眼效率，绘制“未排到的假眼”距离圆圈。
- **FR-A05 (失误分析引擎)**: 
  - **控制重叠 (Stun Stacking)**: 自动检测并标记眩晕技能重叠的时刻，计算浪费的控制时长。
  - **买活死 (Dieback)**: 时间轴上显著标记“买活死”事件及其经济损失。
  - **反应测试**: 检测受到攻击时 BKB/技能 的开启延迟。
- **FR-A06 (开雾评价 - Smoke Eval)**: 
  - 自动标记时间轴上的开雾时刻。
  - 统计单次开雾 KPI：行进距离、破雾原因（撞人/时间到）、最终收益（击杀/阵亡）。

---

### 4.3. 模块 B: 战队望远镜 (Team Profiler) - 综合分析
**定位**: 针对**战队/选手**的多场次聚合分析与规律总结。

- **FR-B01 (智能查询引擎)**: 
  - 基于 [模块 0] 的数据库，支持 **50+** 场比赛的秒级聚合查询。
- **FR-B02 (动态热力图)**: 
  - **筛选维度**: 支持按“时间段 (0-5min)”、“局势 (顺风/逆风)”筛选眼位。
  - **英雄关联**: 叠加显示特定英雄（如隐身系）在场时的视野习惯。
- **FR-B03 (战术与习惯)**:
  - **一级团战术板**: 聚合展 -1:00 到 0:00 的开局路径模式。
  - **选手行为指纹**: 生成选手六边形能力图及习惯报告（刷钱点、参团率）。
  - **对线压制指标**: 统计辅助拉野干扰成功率、核心仇恨吸引次数。
- **FR-B05 (选手行为指纹)**: 
  - 生成特定选手的六边形能力图及习惯报告（包括常去刷钱点、团战切入倾向）。

---

### 4.4. 模块 C: BP 指挥官 (Draft Commander) - 战术博弈
**定位**: 赛前/赛中的 Ban/Pick 辅助，结合联赛大数据与对手习惯。

#### 数据源
- **FR-C01 (联赛元数据)**: 
  - 集成 Stratz/OpenDota API，自动同步当前赛季/联赛的 BP 数据。
  - 生成 **Tier List**: 基于 BP 率（非胜率）的 T0/T1 英雄排行榜。

#### 智能分析
- **FR-C02 (对手 BP 基因)**: 
  - **绝活池**: 识别对手长期高胜率的绝活英雄。
  - **摇摆位侦测**: 提示某英雄在对手体系中的分路概率（如：70% 三号位, 30% 中单）。
- **FR-C03 (实时模拟助手)**: 
  - **下一手预测**: 基于历史数据预测对手可能的 Pick/Ban。
  - **Combo/Counter 预警**: 实时提示高胜率组合（如 Io+Gyro）或推荐克制英雄。

## 5. 非功能需求 (Non-Functional Requirements)
- **静态数据维护**: 必须构建 **Dota基础数据库** (Hero/Item/Ability DB)。
  - *策略*: 使用开源库 `dotaconstants` 或解析 Valve `npc_scripts`。需支持自动更新以适应 Dota 新版本。
- **性能**: 标准职业比赛录像（约45分钟）必须在现代笔记本电脑上于 **30秒内** 完成解析。
- **隐私**: 所有数据处理默认在**本地**进行。除非用户明确分享，否则不上传数据。
- **可用性**: 默认深色模式 (Dark Mode)。UI 信息密度需适配高分辨率显示器。

## 6. 技术架构与数据库设计 (System Architecture & Database)

### 6.1. 分层架构设计
系统采用典型的 **Electron 多进程架构**，确保界面流畅度与计算性能分离。

1.  **表示层 (Frontend)**: Electron (Renderer Process)
    - **技术栈**: React + TypeScript + Tailwind CSS.
    - **职责**: UI 渲染、路由管理、I/O 请求发起。
    - **地图引擎**: **PixiJS** 用于处理 2D 地图的高频渲染 (60FPS)。

2.  **业务逻辑层 (Backend / IPC)**: Electron (Main Process) + Python Sidecar
    - **Electron Main**: 负责窗口管理、文件系统访问、启动 Python 子进程。
    - **Python Sidecar**: 
        - 作为一个无头服务运行 (FastAPI 或 标准输入输出 IPC)。
        - 负责所有复杂计算：聚类分析、经济差计算、API 数据聚合。

3.  **数据层 (Persistence)**: 
    - **SQLite**: 存储结构化元数据（比赛索引、玩家信息、英雄基础数据）。好处是单文件、零配置。
    - **Parquet**: 存储海量分析数据（如每场比赛 10万行的坐标数据）。Parquet 的压缩率和读取速度远超 CSV/JSON，适合大数据分析。

4.  **采集层 (Ingestion)**: 
    - **Manta (Go)**: 高性能二进制解析器。作为一个独立二进制文件被 Python 调用，将 `.dem` 转换为中间格式 (Protobuf/JSON)。
    - **Downloader**: 负责从 Valve/第三方 CDN 断点续传录像文件。

---

### 6.2. 数据库设计 (Schema Design)

> **⚠️ 重要架构决策**: 基于性能评估，我们采用 **混合架构** 而非单一数据库方案。

#### 架构选择理由

经过深入研究和性能对比，**SQLite 单独使用无法满足大规模分析查询的性能需求**。因此我们采用：

```
SQLite (元数据管理) + DuckDB (分析查询) + Parquet (时序数据存储)
```

**性能对比数据**:
- **分析查询**: DuckDB 比 SQLite 快 **10-100 倍**
- **Parquet 直接查询**: DuckDB 原生支持，SQLite 需先导入
- **多核并行**: DuckDB 自动利用多核，SQLite 不支持
- **存储压缩**: Parquet 比 JSON/CSV 节省 **50-80%** 空间

详细的数据库架构分析和性能评估请参考: [数据库架构深度分析](file:///C:/Users/Administrator/.gemini/antigravity/brain/5d2b4e34-cb68-42e9-8091-583cb8c973e7/database_architecture_analysis.md)

---

#### A. SQLite (元数据管理)

**用途**: 存储比赛索引、选手信息、战队数据等结构化元数据。

```sql
-- 比赛索引表
CREATE TABLE matches (
    match_id BIGINT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    game_mode INTEGER,
    patch_version TEXT,
    winner_team INTEGER CHECK(winner_team IN (2, 3)), -- 2=Radiant, 3=Dire
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

-- 战队表 (支持战队分析)
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

**SQLite 性能优化配置** (Python):
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

#### B. Parquet (时序数据存储)

每场比赛存储在独立目录: `data/matches/{match_id}/`

**1. `ticks.parquet` - 核心时序数据**
```python
# Schema 定义
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

**2. `wards.parquet` - 眼位数据**
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
    'destroyed_at': 'int32',   # NULL 表示自然过期
}

# 预估: 200-500 行/场 ≈ 50 KB
```

**3. `combat_log.parquet` - 战斗日志**
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

**4. `smokes.parquet` - 开雾数据**
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

#### C. DuckDB (分析查询引擎)

**用途**: 执行大规模聚合查询，直接查询 Parquet 文件。

**示例查询 1: 生成单场热力图**
```python
import duckdb

conn = duckdb.connect(':memory:')  # 或持久化数据库

query = """
SELECT 
    FLOOR(x / 128) * 128 AS grid_x,
    FLOOR(y / 128) * 128 AS grid_y,
    COUNT(*) AS density
FROM 'data/matches/8123456789/ticks.parquet'
WHERE hero_id = 1 AND time BETWEEN 600 AND 1200
GROUP BY grid_x, grid_y
"""
result = conn.execute(query).fetchdf()  # 返回 Pandas DataFrame
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

**性能优势**:
- 自动并行处理（利用多核 CPU）
- 只读取需要的列（列式存储优势）
- 支持通配符查询多个文件 (`data/matches/*/ticks.parquet`)

---

#### D. 数据流设计

```
录像解析 (Manta)
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

---

### 6.3. 扩展性设计
- **插件化解析**: Python 层的分析模块应设计为 Pipeline 模式。如果未来要加“反补分析”，只需写一个新的 `DenyAnalyzer` 类并注册到 Pipeline 中，无需修改主流程。
- **模块解耦**: UI 只负责展示 JSON 数据，不包含任何计算逻辑。这意味着未来如果要把后端迁移到云端，前端只需更改 API 地址即可。

---

## 6.4. 数据库设计优化建议

为了支持高效的多场次查询和战队分析,建议在基础 Schema 上添加以下优化:

```sql
-- 添加索引以支持快速查询
CREATE INDEX idx_player_account ON player_matches(account_id);
CREATE INDEX idx_match_time ON matches(start_time);
CREATE INDEX idx_hero_id ON player_matches(hero_id);

-- 添加战队表 (支持模块 B 的战队分析)
CREATE TABLE teams (
    team_id INTEGER PRIMARY KEY,
    team_name TEXT,
    tag TEXT
);

CREATE TABLE team_matches (
    match_id BIGINT,
    team_id INTEGER,
    is_winner BOOLEAN,
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

-- 添加版本兼容性表 (追踪 Dota 版本变化)
CREATE TABLE dota_versions (
    version_id INTEGER PRIMARY KEY,
    version_string TEXT,
    release_date INTEGER,
    parser_compatible BOOLEAN
);
```

---

## 6.5. Python 后端架构建议

采用**插件化 Pipeline 设计**,使各分析模块可独立开发和测试:

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

## 7. 风险分析与缓解策略 (Risk Analysis)

### 🔴 风险 1: 录像解析复杂度与版本兼容性

**问题描述**:
- `.dem` 文件格式是 Valve 的私有二进制格式
- 每个 Dota 2 大版本更新可能导致格式变化
- Manta 解析器需要持续维护以适配新版本
- 45分钟录像在30秒内完成解析的性能要求很高

**影响等级**: 高 (可能导致工具在新版本发布后失效)

**缓解策略**:
1. **版本隔离测试**: 在 MVP 阶段使用固定版本的录像进行开发和测试
2. **建立版本兼容性数据库**: 记录每个 Dota 版本对应的解析器版本
3. **备选数据源**: 集成 OpenDota/Stratz API 作为备选,当本地解析失败时可回退到 API 数据
4. **性能优化策略**:
   - 使用增量解析 (只解析变化的 tick)
   - 多线程/多进程并行处理
   - 缓存中间结果
5. **监控机制**: 实现解析失败率监控,及时发现版本兼容性问题

---

### 🟡 风险 2: AI 功能的技术实现难度

**问题描述**:
- "眼位聚类分析"、"开雾路径识别" 需要机器学习专业知识
- 50+ 场比赛的秒级聚合查询对数据结构设计要求极高
- 热力图生成、路径识别算法需要大量调优

**影响等级**: 中 (可能导致开发周期延长)

**缓解策略**:
1. **渐进式实现**:
   - **第一阶段**: 基础数据可视化 (热力图、路径绘制)
   - **第二阶段**: 简单统计聚合 (均值、中位数、频率分布)
   - **第三阶段**: 引入聚类算法 (使用 scikit-learn 的 DBSCAN/K-means)
2. **使用成熟库**: 避免从零实现算法,优先使用 scikit-learn、pandas、numpy
3. **数据预聚合**: 在录像导入时预计算常用指标,减少实时计算压力
4. **性能基准测试**: 设定明确的性能目标 (如 "50场比赛聚合 < 1秒"),定期测试
5. **算法简化**: 如果复杂算法性能不达标,使用简化版本 (如用网格统计代替精确聚类)

---

### 🟡 风险 3: 数据量与性能挑战

**问题描述**:
- 每场比赛产生约 10 万行坐标数据
- 50 场比赛 = 500 万行数据
- Parquet 虽然高效,但查询优化仍需精心设计

**影响等级**: 中 (可能导致用户体验下降)

**缓解策略**:
1. **数据库优化**:
   - 在关键字段上建立索引 (时间、英雄ID、坐标范围)
   - 使用分区存储 (按时间段、英雄等维度)
2. **预聚合策略**: 导入时预计算热力图数据,存储为低分辨率网格
3. **增量加载**: UI 只加载当前时间窗口的数据,而非全部数据
4. **考虑 DuckDB**: 替代纯 Parquet,DuckDB 提供 SQL 查询能力且性能优异
5. **数据压缩**: 使用 Parquet 的高压缩率编码 (Snappy/Zstd)

---

### 🟢 风险 4: 第三方 API 依赖

**问题描述**:
- OpenDota/Stratz API 可能有速率限制
- API 可能变更或停止服务
- 录像下载依赖 Valve CDN 稳定性

**影响等级**: 低 (有备选方案)

**缓解策略**:
1. **本地优先**: 支持本地 `.dem` 文件导入作为主要方式
2. **API 请求管理**:
   - 实现请求缓存 (避免重复请求)
   - 实现重试机制 (指数退避)
   - 遵守 API 速率限制
3. **降级方案**: API 下载作为辅助功能,不作为核心依赖
4. **监控与日志**: 记录 API 调用日志,监控失败率

---

### 📊 风险优先级矩阵

| 风险 | 影响 | 概率 | 优先级 | 缓解成本 |
|------|------|------|--------|----------|
| 录像解析兼容性 | 高 | 中 | **P0** | 中 |
| AI 功能实现难度 | 中 | 高 | **P1** | 高 |
| 数据性能挑战 | 中 | 中 | **P1** | 中 |
| 第三方 API 依赖 | 低 | 低 | P2 | 低 |

---

## 8. MVP 范围调整建议

当前 PRD 中的 MVP 范围较大,建议采用**渐进式交付**策略:

### MVP v1.0 
**目标**: 证明核心技术路径可行,交付最小可用产品

- ✅ 本地 `.dem` 文件拖拽导入
- ✅ 基础解析 (英雄位置、KDA、经济、经验)
- ✅ 2D 地图回放引擎 (PixiJS 渲染,无热力图)
- ✅ 时间轴控制 (播放/暂停/跳跃/倍速)
- ✅ 基础仪表盘 (记分板、经济/经验差曲线)
- ✅ SQLite 数据库 (比赛索引、选手表现)

**交付标准**: 能够导入一场比赛并在 2D 地图上回放英雄移动

---

### MVP v1.5 
**目标**: 提升分析深度,增加差异化功能

- ✅ 单场热力图 (英雄移动热区)
- ✅ 眼位可视化 (守卫位置、存活时间)
- ✅ API 自动下载录像 (OpenDota/Stratz)
- ✅ 战斗日志解析 (伤害统计、技能释放)

**交付标准**: 能够生成单场比赛的热力图和眼位分布图

---

### v2.0 
**目标**: 实现核心差异化功能

- ✅ 多场次数据聚合 (50+ 场比赛)
- ✅ 眼位聚类分析 (战队习惯识别)
- ✅ 失误检测引擎 (控制重叠、买活死)
- ✅ 开雾路径分析
- ✅ 选手行为指纹

**交付标准**: 能够分析某战队 50 场比赛的眼位习惯并生成报告

---

## 9. 下一步行动

### 🚀 立即执行 (本周)
1. **技术验证 POC**:
   - 下载并编译 **Manta** 解析器 (从 GitHub 获取最新版本)
   - 获取 1-2 个真实 `.dem` 文件进行解析测试 (建议一个路人局 + 一个职业比赛)
   - 验证解析输出的数据完整性 (检查是否包含位置、经济、技能等数据)
   - 测试 Parquet 读写性能 (使用 pandas 模拟 10 万行数据的写入和查询)

2. **环境准备**:
   - 安装 Node.js、Python 3.9+、Go 开发环境
   - 创建项目 Git 仓库并初始化目录结构

### 📅 短期目标 (2周内)
1. **基础框架搭建**:
   - 初始化 Electron + React 项目 (使用 electron-vite 或 electron-forge)
   - 搭建 Python 后端服务 (FastAPI)
   - 实现 Electron Main Process 与 Python 的 IPC 通信

2. **数据层实现**:
   - 创建 SQLite 数据库并实现基础 Schema
   - 测试插入和查询性能

### 🎯 中期目标 (1个月内)
1. **MVP v1.0 核心功能**:
   - 完成 2D 地图基础渲染 (PixiJS)
   - 实现时间轴控制组件
   - 完成第一个可演示的原型 (能够回放一场比赛)

2. **性能验证**:
   - 测试 45 分钟录像的解析时间
   - 测试地图渲染帧率 (目标 60 FPS)

---

## 10. 未来功能孵化池 (Idea Backlog)
记录优秀但暂不加入 MVP 的创意，留待后续迭代。
- **团战技能时序图 (Combat Sequence)**: 类似视频剪辑轨道，可视化展示团战中技能释放的精确微秒级顺序（验证 BKB 是否开慢了，Combo 是否接上了）。
- **眼位投资回报率 (Ward ROI)**: 计算单个眼位的“性价比”（存活时长 / 侦测到的敌方英雄次数）。
