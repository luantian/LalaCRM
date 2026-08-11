# Gitea 安装配置记录

## 部署信息

- **部署位置**: 群晖 DS223j (192.168.2.13)
- **Docker 镜像**: gitea/gitea:latest
- **容器名称**: gitea
- **数据目录**: /volume1/docker/gitea/data
- **配置目录**: /volume1/docker/gitea/config

## Docker 启动命令

```bash
docker run -d --name gitea \
  -p 3000:3000 \
  -p 222:22 \
  -v /volume1/docker/gitea/data:/data \
  -v /volume1/docker/gitea/config:/data/gitea/conf \
  -e TZ=Asia/Shanghai \
  --restart always \
  gitea/gitea:latest
```

## Gitea 初始化配置

### 数据库设置

| 配置项 | 值 |
|--------|-----|
| 数据库类型 | SQLite3 |
| 数据库文件路径 | /data/gitea/gitea.db |

### 一般设置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 站点名称 | 自行填写（如：LalaCode） | 公司名称 |
| 仓库根目录 | /data/git/repositories | 所有远程 Git 仓库存储位置 |
| LFS 根目录 | /data/git/lfs | Git LFS 文件存储位置 |
| 服务器域名 | 192.168.2.13 | 群晖 IP 地址 |
| SSH 服务端口 | 222 | Docker 映射的 SSH 端口 |
| HTTP 服务端口 | 3000 | Web 访问端口 |
| 基础 URL | http://192.168.2.13:3000/ | 用于 HTTP 克隆和邮件通知 |
| 日志路径 | /data/gitea/log | 日志文件位置 |

### 管理员账户设置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 管理员用户名 | admin | 首次登录的管理员账号 |
| 密码 | 自行设置 | 建议使用强密码 |
| 邮箱 | 自行填写 | 管理员邮箱 |

## 访问地址

- **Web 界面**: http://192.168.2.13:3000
- **HTTP 克隆**: http://192.168.2.13:3000/用户名/仓库名.git
- **SSH 克隆**: ssh://git@192.168.2.13:222/用户名/仓库名.git

## 常用运维命令

```bash
# 查看容器状态
sudo docker ps | grep gitea

# 查看日志
sudo docker logs gitea

# 重启容器
sudo docker restart gitea

# 停止容器
sudo docker stop gitea

# 启动容器
sudo docker start gitea

# 删除容器（数据保留在挂载目录）
sudo docker stop gitea && sudo docker rm gitea
```

## 配置文件位置

- **app.ini**: /volume1/docker/gitea/config/app.ini
- **数据库**: /volume1/docker/gitea/data/gitea/gitea.db
- **仓库**: /volume1/docker/gitea/data/git/repositories

## 注意事项

1. SSH 端口 222 与群晖系统 SSH（22）不冲突
2. 容器内用户 UID 为 1000，挂载目录权限需一致
3. 使用 SQLite3 数据库，备份只需复制 gitea.db 文件
4. 建议定期备份 /volume1/docker/gitea/data 目录
