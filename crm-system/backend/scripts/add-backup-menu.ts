import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始添加数据库备份菜单...')

  // 查找系统管理目录
  const systemDir = await prisma.menuItem.findFirst({
    where: {
      key: 'system',
      menuType: 'DIRECTORY'
    }
  })

  if (!systemDir) {
    console.error('错误: 找不到系统管理目录')
    process.exit(1)
  }

  console.log(`找到系统管理目录: ID=${systemDir.id}`)

  // 检查是否已存在数据库备份菜单
  const existingMenu = await prisma.menuItem.findFirst({
    where: {
      key: 'system:backup',
      parentId: systemDir.id
    }
  })

  if (existingMenu) {
    console.log(`数据库备份菜单已存在: ID=${existingMenu.id}`)
    return
  }

  // 创建数据库备份菜单
  const backupMenu = await prisma.menuItem.create({
    data: {
      key: 'system:backup',
      label: '数据库备份',
      icon: 'DatabaseOutlined',
      path: '/database-backup',
      menuType: 'MENU',
      order: 60,
      isVisible: true,
      parentId: systemDir.id,
      perm: 'system:backup:list'
    }
  })

  console.log(`✓ 创建数据库备份菜单: ID=${backupMenu.id}`)

  // 创建按钮权限
  const buttons = [
    { key: 'system:backup:create', label: '创建备份', permission: 'system:backup:create' },
    { key: 'system:backup:download', label: '下载备份', permission: 'system:backup:download' },
    { key: 'system:backup:delete', label: '删除备份', permission: 'system:backup:delete' },
    { key: 'system:backup:restore', label: '恢复备份', permission: 'system:backup:restore' },
    { key: 'system:backup:config', label: '备份配置', permission: 'system:backup:config' }
  ]

  for (const btn of buttons) {
    const existingBtn = await prisma.menuItem.findFirst({
      where: { key: btn.key }
    })

    if (existingBtn) {
      console.log(`  按钮已存在: ${btn.label} (ID=${existingBtn.id})`)
      continue
    }

    await prisma.menuItem.create({
      data: {
        key: btn.key,
        label: btn.label,
        icon: 'ButtonOutlined',
        menuType: 'BUTTON',
        order: 0,
        isVisible: true,
        parentId: backupMenu.id,
        permission: btn.permission
      }
    })
    console.log(`  ✓ 创建按钮: ${btn.label}`)
  }

  // 查找管理员角色并分配权限
  const adminRole = await prisma.roleModel.findFirst({
    where: { roleKey: 'ADMIN' }
  })

  if (adminRole) {
    console.log(`\n为管理员角色分配权限 (ID=${adminRole.id})...`)
    
    // 获取所有备份相关的菜单
    const backupMenus = await prisma.menuItem.findMany({
      where: {
        OR: [
          { key: 'system:backup' },
          { key: { startsWith: 'system:backup:' } }
        ]
      }
    })

    for (const menu of backupMenus) {
      const existing = await prisma.roleMenu.findFirst({
        where: {
          roleId: adminRole.id,
          menuId: menu.id
        }
      })

      if (!existing) {
        await prisma.roleMenu.create({
          data: {
            roleId: adminRole.id,
            menuId: menu.id
          }
        })
        console.log(`  ✓ 分配: ${menu.label}`)
      }
    }
  }

  console.log('\n✓ 数据库备份菜单初始化完成')
}

main()
  .catch((e) => {
    console.error('错误:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
