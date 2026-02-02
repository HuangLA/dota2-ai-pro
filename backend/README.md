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
