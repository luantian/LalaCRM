FROM node:20-alpine

# Install OpenSSL (for Prisma) + LibreOffice (for Office document preview) + CJK fonts (for Chinese text rendering)
RUN apk add --no-cache openssl libreoffice font-noto-cjk

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

# Create previews cache directory
RUN mkdir -p /app/uploads/previews

EXPOSE 5000

CMD ["npm", "start"]
