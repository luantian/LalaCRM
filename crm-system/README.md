# CRM客户管理系统

一个基于React + Node.js + PostgreSQL的CRM客户管理系统，用于管理客户信息、销售记录、项目和合同。

## 功能特性

- **客户管理**: 添加、编辑、删除客户信息，跟踪客户状态
- **销售管理**: 记录销售收支，统计销售数据
- **项目管理**: 跟踪项目进度、预算和状态
- **合同管理**: 管理合同生命周期，包括签订、执行和到期
- **仪表盘**: 数据统计和概览

## 技术栈

### 前端
- React 18
- TypeScript
- Ant Design
- React Router
- Axios

### 后端
- Node.js
- Express
- TypeScript
- Prisma ORM
- JWT认证
- bcrypt加密

### 数据库
- PostgreSQL 15

### 部署
- Docker
- Nginx

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 15+ (或使用Docker)
- npm 或 yarn

### 本地开发

1. **克隆项目**
```bash
git clone <repository-url>
cd crm-system
```

2. **安装后端依赖**
```bash
cd backend
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑.env文件，配置数据库连接和JWT密钥
```

4. **初始化数据库**
```bash
npx prisma migrate dev --name init
npx prisma generate
```

5. **创建初始用户**
```bash
# 使用API注册用户，或使用Prisma Studio
npx prisma studio
```

6. **启动后端服务**
```bash
npm run dev
```

7. **安装前端依赖**（新终端）
```bash
cd frontend
npm install
```

8. **启动前端服务**
```bash
npm run dev
```

访问 http://localhost:3000 使用系统

### Docker部署

1. **启动所有服务**
```bash
docker-compose up -d
```

2. **初始化数据库**
```bash
docker-compose exec backend npx prisma migrate dev --name init
```

3. **访问系统**
- 前端: http://localhost:3000
- 后端API: http://localhost:5000

## 项目结构

```
crm-system/
├── frontend/          # React前端
│   ├── src/
│   │   ├── pages/     # 页面组件
│   │   ├── components/# 通用组件
│   │   ├── services/  # API调用
│   │   └── store/     # 状态管理
│   └── package.json
├── backend/           # Node.js后端
│   ├── src/
│   │   ├── routes/    # 路由定义
│   │   ├── middleware/# 中间件
│   │   └── index.ts   # 入口文件
│   ├── prisma/        # Prisma配置
│   └── package.json
├── prisma/            # 数据库Schema
└── docker-compose.yml # Docker配置
```

## API文档

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户信息

### 客户管理
- `GET /api/customers` - 获取客户列表
- `POST /api/customers` - 创建客户
- `GET /api/customers/:id` - 获取客户详情
- `PUT /api/customers/:id` - 更新客户
- `DELETE /api/customers/:id` - 删除客户

### 销售管理
- `GET /api/sales` - 获取销售记录
- `POST /api/sales` - 创建销售记录
- `GET /api/sales/:id` - 获取销售详情
- `PUT /api/sales/:id` - 更新销售记录
- `DELETE /api/sales/:id` - 删除销售记录

### 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建项目
- `GET /api/projects/:id` - 获取项目详情
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目

### 合同管理
- `GET /api/contracts` - 获取合同列表
- `POST /api/contracts` - 创建合同
- `GET /api/contracts/:id` - 获取合同详情
- `PUT /api/contracts/:id` - 更新合同
- `DELETE /api/contracts/:id` - 删除合同

### 仪表盘
- `GET /api/dashboard/stats` - 获取统计数据

## 默认账户

系统初始化后，需要创建第一个用户。可以通过以下方式：

1. **使用Prisma Studio**
```bash
npx prisma studio
```
在User表中手动添加用户（密码需要bcrypt加密）

2. **使用API注册**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "email": "admin@example.com",
    "name": "管理员",
    "role": "ADMIN"
  }'
```

## 开发计划

- [x] 项目初始化
- [x] 数据库设计
- [x] 后端API开发
- [x] 前端页面开发
- [ ] 单元测试
- [ ] 部署文档
- [ ] 数据导入导出
- [ ] 报表功能

## 许可证

MIT
