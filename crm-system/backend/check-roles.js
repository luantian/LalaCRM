const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.roleModel.findMany({
    select: { id: true, name: true, displayName: true, roleKey: true }
  });
  console.log(JSON.stringify(roles, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
