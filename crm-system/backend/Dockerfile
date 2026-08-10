# Build stage
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# Production stage
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制构建产物和依赖文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# 生成 Prisma Client
RUN npx prisma generate

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["npm", "run", "start"]
