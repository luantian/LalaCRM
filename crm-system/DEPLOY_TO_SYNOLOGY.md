# 群晖部署指南

## 第一步：传输镜像到群晖

使用 File Station 将以下三个文件上传到群晖的 `/docker/crm-system/build/` 目录：

- `build/backend.tar` (721 MB)
- `build/frontend.tar` (26 MB)
- `build/postgres.tar` (108 MB)

**传输方式选择：**
1. **File Station**（推荐）：直接在群晖界面拖拽上传
2. **SFTP**：使用 WinSCP 或 FileZilla，连接到群晖 IP，端口 22
3. **SCP 命令**：
   ```bash
   scp build/*.tar admin@群晖IP:/volume1/docker/crm-system/build/
   ```

## 第二步：SSH 登录群晖

```bash
ssh admin@群晖IP
sudo -i
```

## 第三步：导入 Docker 镜像

```bash
cd /volume1/docker/crm-system/build

# 导入后端镜像
docker load -i backend.tar

# 导入前端镜像
docker load -i frontend.tar

# 导入数据库镜像
docker load -i postgres.tar

# 验证镜像已导入
docker images | grep -E "crm-|postgres"
```

应该看到类似输出：
```
crm-backend     latest    xxx    2 minutes ago    720MB
crm-frontend    latest    xxx    2 minutes ago    26MB
postgres        15-alpine xxx    2 minutes ago    108MB
```

## 第四步：修改配置文件

编辑 `/volume1/docker/crm-system/docker-compose.synology.yml`，修改两处：

1. **第 16 行**：修改数据库密码（至少 16 位，包含字母数字）
   ```yaml
   POSTGRES_PASSWORD: 你的强密码
   ```

2. **第 34 行**：JWT_SECRET 改为随机字符串
   ```yaml
   JWT_SECRET: 随机字符串至少32位
   ```

3. **第 35 行**：数据库连接字符串使用相同的密码
   ```yaml
   DATABASE_URL: postgresql://crm_user:你的强密码@postgres:5432/crm_db
   ```

**注意**：第 16 行和第 35 行的密码必须一致！

## 第五步：启动服务

```bash
cd /volume1/docker/crm-system
docker-compose -f docker-compose.synology.yml up -d
```

查看日志确认启动成功：
```bash
docker-compose -f docker-compose.synology.yml logs -f
```

## 第六步：初始化数据库

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

## 第七步：访问系统

浏览器打开：`http://群晖IP:8880`

默认管理员账户：
- 用户名：`admin`
- 密码：`admin123`

**⚠️ 重要**：首次登录后立即修改默认密码！

## 常见问题

### 1. 端口被占用
如果 8880 端口被占用，修改 `docker-compose.synology.yml` 第 39 行：
```yaml
ports:
  - "其他端口:80"
```

### 2. 容器启动失败
```bash
# 查看详细日志
docker-compose -f docker-compose.synology.yml logs

# 重启服务
docker-compose -f docker-compose.synology.yml restart
```

### 3. 数据库连接失败
等待 10-20 秒让 PostgreSQL 完全启动，然后重启后端：
```bash
docker-compose -f docker-compose.synology.yml restart backend
```

## 维护命令

```bash
# 停止服务
docker-compose -f docker-compose.synology.yml down

# 重启服务
docker-compose -f docker-compose.synology.yml restart

# 更新代码后重新部署
docker-compose -f docker-compose.synology.yml up -d --build

# 备份数据库
docker exec crm-postgres pg_dump -U crm_user crm_db > backup_$(date +%Y%m%d).sql
```

## 数据持久化

以下数据会持久化保存：
- 数据库文件：`./data/postgres/`
- 上传文件：`./data/uploads/`

**定期备份这两个目录！**
