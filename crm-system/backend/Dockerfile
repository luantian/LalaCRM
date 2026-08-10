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
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
