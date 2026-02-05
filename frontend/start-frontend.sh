#!/bin/bash
# True Sight - Frontend 启动脚本

echo "================================"
echo "True Sight Frontend 启动中..."
echo "================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "错误: 请在 frontend 目录下运行此脚本"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "⚠️  警告: 未找到 node_modules，正在安装依赖..."
    npm install
else
    echo "✓ 找到 node_modules"
fi

echo ""
echo "================================"
echo "✓ 准备完成"
echo "================================"
echo ""
echo "前端将运行在: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""
echo "================================"
echo ""

# 启动开发服务器
npm run dev
