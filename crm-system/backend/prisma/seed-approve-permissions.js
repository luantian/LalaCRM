const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('开始插入合同和采购审批权限节点...')

  // 项目管理菜单ID是4
  const projectId = 4

  // 检查是否已存在
  const existing1 = await prisma.menuItem.findUnique({ where: { key: 'project:contract:approve' } })
  const existing2 = await prisma.menuItem.findUnique({ where: { key: 'project:procurement:approve' } })

  if (existing1) {
    console.log('project:contract:approve 已存在，跳过')
  } else {
    await prisma.menuItem.create({
      data: {
        key: 'project:contract:approve',
        label: '合同审批',
        icon: '',
        menuType: 'BUTTON',
        perm: 'project:contract:approve',
        parentId: projectId,
        isVisible: true,
        requiredRoles: []
      }
    })
    console.log('✅ 已插入 project:contract:approve')
  }

  if (existing2) {
    console.log('project:procurement:approve 已存在，跳过')
  } else {
    await prisma.menuItem.create({
      data: {
        key: 'project:procurement:approve',
        label: '采购审批',
        icon: '',
        menuType: 'BUTTON',
        perm: 'project:procurement:approve',
        parentId: projectId,
        isVisible: true,
        requiredRoles: []
      }
    })
    console.log('✅ 已插入 project:procurement:approve')
  }

  console.log('\n审批权限节点插入完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
