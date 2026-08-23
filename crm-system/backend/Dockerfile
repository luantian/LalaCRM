FROM node:20-bookworm

WORKDIR /app

# 使用阿里云镜像源加速
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# 只安装 LibreOffice 核心模块（Writer + Calc）和轻量中文字体
# --no-install-recommends 避免安装推荐包，减小体积
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    fonts-wqy-zenhei \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/cache/*

COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

COPY . .
# 根据 schema 生成与当前代码匹配的 Prisma Client（npm install 时 schema 尚未拷入，
# 生成的空壳 client 会导致 tsc 报 TS2339）
RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
