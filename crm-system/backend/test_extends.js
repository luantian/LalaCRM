const { PrismaClient } = require('@prisma/client')
const { softDeleteExtension } = require('./src/lib/softDelete')

async function main() {
  const prisma = new PrismaClient().$extends(softDeleteExtension)

  const projects = await prisma.project.findMany()
  console.log('扩展过滤后项目数:', projects.length)

  const raw = new PrismaClient()
  const allProjects = await raw.project.findMany()
  console.log('不过滤项目数:', allProjects.length)

  console.log('扩展生效:', projects.length < allProjects.length ? 'YES' : 'NO')

  await raw.$disconnect()
  await prisma.$disconnect()
}
main()
