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
   npx prisma db push        # 按当前 schema 建表（迁移基线说明见 prisma/MIGRATIONS.md）
   npx prisma generate
   ```

4. **写入种子数据并创建管理员**
   > 注意：`/api/auth/register` 需要已登录且具备 `system:user:add` 权限，
   > 首个管理员无法通过 API 创建，请直接用下面的命令写库。
   ```bash
   # 仍在 backend 目录、已完成建表的前提下：
   node prisma/seed.js            # 写入 66 个菜单（含按钮权限）+ ADMIN 角色
   node prisma/seed-holidays.js   # 写入节假日数据

   # 创建管理员 admin / admin123（必须同时写 UserRole，权限判定只认这张表）
   node -e "
   const { PrismaClient } = require('@prisma/client');
   const bcrypt = require('bcryptjs');
   const prisma = new PrismaClient();
   (async () => {
     const r = await prisma.roleModel.findFirst({ where: { roleKey: 'ADMIN' } });
     const u = await prisma.user.create({ data: {
       username: 'admin', password: await bcrypt.hash('admin123', 10),
       name: '管理员', email: 'admin@crm.com', roleId: r.id } });
     await prisma.userRole.create({ data: { userId: u.id, roleId: r.id } });
     console.log('管理员创建成功: admin / admin123');
     await prisma.\$disconnect();
   })();"
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
