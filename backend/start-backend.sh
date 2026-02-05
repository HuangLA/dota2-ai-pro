#!/bin/bash
# True Sight - Backend 启动脚本

echo "================================"
echo "True Sight Backend 启动中..."
echo "================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "main.py" ]; then
    echo "错误: 请在 backend 目录下运行此脚本"
    exit 1
fi

# 检查 Python 虚拟环境
if [ ! -d ".venv" ]; then
    echo "⚠️  警告: 未找到虚拟环境，将使用系统 Python"
    echo ""
else
    echo "✓ 找到虚拟环境"
    source .venv/bin/activate
fi

# 检查依赖
echo "检查依赖..."
python3 -c "import fastapi, uvicorn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  警告: 缺少依赖，正在安装..."
    pip install -r requirements.txt
fi

# 创建必要的目录
echo "检查数据目录..."
mkdir -p ../data/database
mkdir -p ../data/parquet
mkdir -p ../data/replays

echo ""
echo "================================"
echo "✓ 准备完成"
echo "================================"
echo ""
echo "后端将运行在: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""
echo "================================"
echo ""

# 启动服务器
python3 main.py
