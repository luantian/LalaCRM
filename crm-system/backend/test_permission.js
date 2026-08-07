const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // 1. 查看角色菜单分配
  console.log('=== 1. 角色菜单分配(RoleMenu) ===')
  const roleMenus = await prisma.roleMenu.findMany({
    select: {
      roleId: true,
      role: { select: { displayName: true } },
      menu: { select: { key: true, label: true, perm: true, menuType: true } }
    }
  })
  const roleMenuMap = {}
  roleMenus.forEach(rm => {
    const roleName = rm.role.displayName
    if (!roleMenuMap[roleName]) roleMenuMap[roleName] = []
    roleMenuMap[roleName].push({ label: rm.menu.label, perm: rm.menu.perm, type: rm.menu.menuType })
  })
  Object.entries(roleMenuMap).forEach(([role, menus]) => {
    console.log(`\n角色: ${role}`)
    const perms = menus.filter(m => m.perm)
    const dirs = menus.filter(m => m.type === 'DIRECTORY')
    const pages = menus.filter(m => m.type === 'MENU')
    console.log(`  目录(${dirs.length}): ${dirs.map(d => d.label).join(', ')}`)
    console.log(`  菜单(${pages.length}): ${pages.map(p => p.label).join(', ')}`)
    console.log(`  按钮权限(${perms.length}): ${perms.map(p => p.perm).join(', ')}`)
  })

  // 2. 查看关键角色数据
  console.log('\n\n=== 2. 关键用户信息 ===')
  const keyUsers = await prisma.user.findMany({
    where: { id: { in: [1, 3, 5, 6, 23] } },
    select: {
      id: true, username: true, role: true, roleId: true,
      userRoles: { select: { role: { select: { id: true, name: true, displayName: true } } } }
    }
  })
  keyUsers.forEach(u => {
    const roles = u.userRoles.length > 0 ? u.userRoles.map(ur => `${ur.role.displayName}(${ur.role.name})`).join(',') : '无'
    console.log(`  用户${u.id}: ${u.username} | role字段=${u.role} | roleId=${u.roleId} | 新角色: ${roles}`)
  })

  // 3. 查看菜单列表
  console.log('\n\n=== 3. 所有菜单项 ===')
  const allMenus = await prisma.menuItem.findMany({
    select: { id: true, key: true, label: true, perm: true, menuType: true, parentId: true },
    orderBy: [{ parentId: 'asc' }, { order: 'asc' }]
  })
  allMenus.forEach(m => {
    const prefix = m.menuType === 'DIRECTORY' ? '📁' : m.menuType === 'MENU' ? '📄' : '🔘'
    console.log(`  ${prefix} [${m.id}] ${m.label} | key=${m.key} | perm=${m.perm || '-'} | parent=${m.parentId || '-'}`)
  })

  await prisma.$disconnect()
}

main().catch(console.error)
