# Backend

Python 后端服务，负责数据解析、分析和查询

## 目录结构

```
backend/
├── main.py              # FastAPI 应用入口
├── parsers/             # 录像解析模块
│   └── manta_parser.py
├── analyzers/           # 数据分析模块
│   ├── ward_analyzer.py
│   ├── smoke_analyzer.py
│   └── heatmap_generator.py
├── database/            # 数据库操作
│   ├── sqlite_manager.py
│   └── duckdb_manager.py
└── requirements.txt     # Python 依赖
```

## 开发

```bash
# 安装依赖
pip install -r requirements.txt

# 运行开发服务器
python main.py

# 或使用 uvicorn
uvicorn main:app --reload --port 8000
```

## 技术栈

- **框架**: FastAPI
- **数据处理**: Pandas, NumPy
- **机器学习**: scikit-learn
- **数据库**: SQLite, DuckDB, PyArrow (Parquet)

## API 文档

启动服务后访问: http://localhost:8000/docs

## 时间字段语义

- `time`: 基于回放 `tick` 的时间，计算方式为 `tick / 30`。
- `game_time`: 游戏内时钟（0 对应兵线出兵），优先使用解析器输出 `m_fGameTime - m_flGameStartTime`。
- 兼容旧数据: 当历史数据没有 `game_time` 时，后端会回退到 `time`，并在 playback 响应顶层返回 `time_basis` 说明当前映射来源。
