# 群晖 NAS 部署指南

## 📋 前置要求

- 群晖 NAS 已安装 **Container Manager**（Docker）
- 至少 2GB 可用内存
- 至少 5GB 可用存储空间

## 🚀 部署步骤

### 1. 上传项目文件到群晖

将整个 `crm-system` 文件夹上传到群晖的任意共享文件夹，例如：
```
/volume1/docker/crm-system/
```

### 2. 修改配置文件

编辑 `docker-compose.synology.yml`，修改以下两处：

**第 15 行** - 数据库密码（必须修改）：
```yaml
POSTGRES_PASSWORD: 你的强密码
```

**第 27 行** - JWT 密钥（必须修改）：
```yaml
JWT_SECRET: 随机生成的64位字符串
```

生成 JWT 密钥的方法：
```bash
# Linux/Mac
openssl rand -base64 48

# 或者用这个在线工具：https://generate-secret.vercel.app/64
```

**注意**：第 24 行的 `DATABASE_URL` 中的密码也要和第 15 行保持一致。

### 3. 通过 SSH 部署（推荐）

SSH 登录到群晖后执行：

```bash
cd /volume1/docker/crm-system

# 使用生产配置文件启动
docker-compose -f docker-compose.synology.yml up -d --build

# 查看日志确认启动成功
docker-compose -f docker-compose.synology.yml logs -f
```

### 4. 通过 Container Manager 界面部署（备选）

1. 打开 **Container Manager** → **项目**
2. 点击 **新增** → **选择路径**
3. 选择 `docker-compose.synology.yml` 文件
4. 项目名称填：`crm`
5. 点击 **完成**

### 5. 初始化数据库

首次启动需要初始化数据库结构：

```bash
# 进入后端容器
docker exec -it crm-backend sh

# 执行数据库迁移
npx prisma migrate deploy

# 创建管理员账户
npm run create-admin

# 退出容器
exit
```

### 6. 访问系统

浏览器打开：
```
http://你的群晖IP:8880
```

默认管理员账户：
- 用户名：`admin`
- 密码：`admin123`（首次登录后请立即修改）

## 🔧 常用运维命令

### 查看服务状态
```bash
docker-compose -f docker-compose.synology.yml ps
```

### 查看日志
```bash
# 查看所有服务日志
docker-compose -f docker-compose.synology.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.synology.yml logs -f backend
docker-compose -f docker-compose.synology.yml logs -f frontend
docker-compose -f docker-compose.synology.yml logs -f postgres
```

### 重启服务
```bash
# 重启所有服务
docker-compose -f docker-compose.synology.yml restart

# 重启单个服务
docker-compose -f docker-compose.synology.yml restart backend
```

### 更新代码
```bash
cd /volume1/docker/crm-system

# 拉取最新代码后重新构建
docker-compose -f docker-compose.synology.yml up -d --build
```

### 停止服务
```bash
docker-compose -f docker-compose.synology.yml down
```

### 备份数据库
```bash
# 备份到当前目录
docker exec crm-postgres pg_dump -U crm_user crm_db > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260128.sql | docker exec -i crm-postgres psql -U crm_user crm_db
```

## 📁 数据持久化

以下数据会持久化到 `./data/` 目录：

- `./data/postgres/` - 数据库文件
- `./data/uploads/` - 用户上传的文件

**重要**：定期备份这两个目录！

## 🔒 安全建议

1. **修改默认密码**：部署后立即修改 admin 账户密码
2. **使用 HTTPS**：通过群晖的反向代理配置 SSL 证书
3. **限制访问 IP**：在群晖防火墙中限制 8880 端口的访问 IP
4. **定期备份**：设置定时任务备份数据库和上传文件

## 🌐 配置 HTTPS（可选）

### 方法 1：使用群晖反向代理

1. 打开 **控制面板** → **登录门户** → **高级**
2. 点击 **反向代理服务器** → **新增**
3. 配置：
   - 描述：CRM
   - 源协议：HTTPS
   - 源主机名：你的域名
   - 源端口：443
   - 目标协议：HTTP
   - 目标主机名：localhost
   - 目标端口：8880
4. 点击 **自定义标题** → 添加 `Connection: Upgrade`
5. 保存后自动申请 Let's Encrypt 证书

### 方法 2：使用 Nginx Proxy Manager

如果群晖已安装 Nginx Proxy Manager，可以直接添加反向代理规则。

## ⚠️ 常见问题

### 问题 1：容器启动失败
```bash
# 查看详细错误日志
docker-compose -f docker-compose.synology.yml logs

# 检查端口是否被占用
netstat -tlnp | grep 8880
```

### 问题 2：数据库连接失败
```bash
# 检查数据库是否就绪
docker exec crm-postgres pg_isready -U crm_user -d crm_db

# 如果失败，等待几秒后重试（数据库初始化需要时间）
```

### 问题 3：上传文件无法访问
```bash
# 检查上传目录权限
chmod -R 755 ./data/uploads
```

### 问题 4：前端页面空白
```bash
# 检查后端 API 是否可访问
curl http://localhost:5000/api/health

# 检查 nginx 配置
docker exec crm-frontend cat /etc/nginx/conf.d/default.conf
```

## 📊 资源监控

在 Container Manager 中可以查看：
- CPU 使用率
- 内存使用量
- 网络流量
- 磁盘 I/O

建议配置：
- 最低：1 CPU 核心 + 1GB 内存
- 推荐：2 CPU 核心 + 2GB 内存

## 🔄 版本更新

```bash
cd /volume1/docker/crm-system

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose -f docker-compose.synology.yml up -d --build

# 数据库迁移（如果有）
docker exec -it crm-backend npx prisma migrate deploy
```

## 💾 完整备份脚本

创建 `backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/volume1/backup/crm"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
docker exec crm-postgres pg_dump -U crm_user crm_db | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz ./data/uploads

# 保留最近 30 天的备份
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

设置定时任务（每天凌晨 2 点执行）：
```bash
# 编辑 crontab
crontab -e

# 添加以下行
0 2 * * * /volume1/docker/crm-system/backup.sh >> /volume1/backup/crm/backup.log 2>&1
```

## 📞 技术支持

如有问题，请检查：
1. 日志输出
2. 容器状态
3. 网络连接
4. 端口占用情况

---

**部署完成后，记得：**
- ✅ 修改默认密码
- ✅ 配置 HTTPS（生产环境）
- ✅ 设置自动备份
- ✅ 限制访问 IP
