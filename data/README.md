# Data Directory

存储所有应用数据

## 目录说明

### database/
存储 SQLite 数据库文件
- `matches.db` - 主数据库（比赛索引、选手信息、战队数据）

### matches/
存储 Parquet 格式的时序数据，每场比赛一个子目录
```
matches/
└── {match_id}/
    ├── ticks.parquet       # 核心时序数据
    ├── wards.parquet       # 眼位数据
    ├── combat_log.parquet  # 战斗日志
    └── smokes.parquet      # 开雾数据
```

### replays/
存储原始 `.dem` 录像文件
```
replays/
└── {match_id}.dem
```

## 数据大小估算

单场 45 分钟比赛:
- `ticks.parquet`: ~32 MB (压缩后)
- `wards.parquet`: ~50 KB
- `combat_log.parquet`: ~2-10 MB
- `smokes.parquet`: ~10 KB
- `.dem` 文件: ~100-200 MB

50 场比赛总计: ~2-3 GB

## 注意事项

⚠️ 此目录已添加到 `.gitignore`，不会提交到版本控制
