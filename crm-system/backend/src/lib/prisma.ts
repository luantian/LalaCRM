import { PrismaClient } from '@prisma/client'
import { softDeleteExtension } from './softDelete'

// Prisma 6.x 不支持 $use，改用 $extends 扩展
// 扩展后的 Prisma Client 类型
type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

function createPrismaClient() {
  return new PrismaClient().$extends(softDeleteExtension)
}

// 全局 Prisma 单例，避免在开发环境热重载时创建多个实例
const globalForPrisma = global as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
