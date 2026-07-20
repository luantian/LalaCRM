#!/bin/bash

echo "创建初始管理员用户"
echo "=================="

cd backend

# 检查后端是否运行
if ! curl -s http://localhost:5000/api/health > /dev/null; then
    echo "错误: 后端服务未运行"
    echo "请先启动后端: cd backend && npm run dev"
    exit 1
fi

echo "请输入管理员信息:"
read -p "用户名 (默认: admin): " username
username=${username:-admin}

read -p "密码 (默认: admin123): " password
password=${password:-admin123}

read -p "邮箱 (默认: admin@crm.com): " email
email=${email:-admin@crm.com}

read -p "姓名 (默认: 管理员): " name
name=${name:-管理员}

echo ""
echo "创建用户..."
response=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$username\",
    \"password\": \"$password\",
    \"email\": \"$email\",
    \"name\": \"$name\",
    \"role\": \"ADMIN\"
  }")

if echo "$response" | grep -q "error"; then
    echo "创建失败: $response"
else
    echo "创建成功！"
    echo "用户名: $username"
    echo "密码: $password"
    echo ""
    echo "现在可以登录系统了"
fi
