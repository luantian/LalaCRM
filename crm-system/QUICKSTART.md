# CRM系统快速启动指南

## 第一次启动

### 方式1: 本地开发（推荐）

1. **确保PostgreSQL已安装并运行**
   - 安装PostgreSQL 15+
   - 创建数据库: `createdb crm_db`

2. **配置环境变量**
   ```bash
   cd backend
   cp .env.example .env
   # 编辑.env文件，确认数据库连接信息
   ```

3. **初始化数据库**
   ```bash
   cd backend
   npx prisma migrate dev --name init
   npx prisma generate
   ```

4. **创建管理员账户**
   ```bash
   # 启动后端（新终端）
   cd backend
   npm run dev
   
   # 在另一个终端创建管理员
   ./create-admin.sh
   # 或手动调用API
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123","email":"admin@crm.com","name":"管理员","role":"ADMIN"}'
   ```

5. **启动前端**
   ```bash
   cd frontend
   npm run dev
   ```

6. **访问系统**
   打开浏览器访问: http://localhost:3000
   使用创建的管理员账户登录

### 方式2: Docker部署

1. **启动所有服务**
   ```bash
   docker-compose up -d
   ```

2. **初始化数据库**
   ```bash
   docker-compose exec backend npx prisma migrate dev --name init
   ```

3. **创建管理员**
   ```bash
   docker-compose exec backend curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123","email":"admin@crm.com","name":"管理员","role":"ADMIN"}'
   ```

4. **访问系统**
   - 前端: http://localhost:3000
   - 后端API: http://localhost:5000

## 日常使用

### 启动服务

**后端:**
```bash
cd backend
npm run dev
```

**前端:**
```bash
cd frontend
npm run dev
```

### 数据库管理

**查看数据:**
```bash
cd backend
npx prisma studio
```

**重置数据库（谨慎使用）:**
```bash
cd backend
npx prisma migrate reset
```

## 常见问题

### 1. 数据库连接失败
- 检查PostgreSQL是否运行: `pg_isready`
- 检查.env中的DATABASE_URL配置
- 确认数据库crm_db已创建

### 2. 前端无法连接后端
- 确认后端运行在 http://localhost:5000
- 检查前端vite.config.ts中的代理配置
- 查看浏览器控制台错误信息

### 3. Prisma客户端未生成
```bash
cd backend
npx prisma generate
```

### 4. 端口被占用
- 修改backend/.env中的PORT
- 修改frontend/vite.config.ts中的server.port

## 开发命令

```bash
# 安装所有依赖
npm run install:all

# 启动后端
npm run dev:backend

# 启动前端
npm run dev:frontend

# 使用Docker启动
npm run dev

# 构建生产版本
npm run build
```

## 技术支持

如有问题，请查看:
- 后端日志: terminal输出
- 前端日志: 浏览器控制台
- 数据库日志: PostgreSQL日志
