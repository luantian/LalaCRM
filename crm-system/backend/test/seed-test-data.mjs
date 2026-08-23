/**
 * 测试辅助脚本：向测试数据库 crm_test 写入冒烟测试所需的最小 RBAC 数据
 *
 * 前置条件：
 *   1. node test/create-test-db.mjs        （创建 crm_test）
 *   2. DATABASE_URL=...crm_test npx prisma migrate deploy （建表）
 *   3. DATABASE_URL=...crm_test node prisma/seed.js       （完整菜单树）
 *   4. 本脚本（角色 + 用户 + 角色-菜单关联）
 *
 * 运行方式（在 backend 目录下，DATABASE_URL 指向 crm_test）:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test?schema=public" node test/seed-test-data.mjs
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const TEST_PASSWORD = 'Test123456!'

async function main() {
  console.log('开始写入测试种子数据...')

  // ── 1. 角色 ──────────────────────────────────────────────
  // 管理员角色：roleKey=ADMIN 是 isAdmin() 的判定依据
  const adminRole = await prisma.roleModel.upsert({
    where: { roleKey: 'ADMIN' },
    update: { dataScope: 'ALL' },
    create: {
      name: 'TEST_SYSTEM_ADMIN',
      displayName: '测试系统管理员',
      roleKey: 'ADMIN',
      description: '冒烟测试用管理员角色',
      dataScope: 'ALL',
      status: 1
    }
  })

  // 普通用户角色：SELF 数据范围，仅授予部分权限
  const selfRole = await prisma.roleModel.upsert({
    where: { roleKey: 'TESTER' },
    update: { dataScope: 'SELF' },
    create: {
      name: 'TEST_SELF_USER',
      displayName: '测试普通用户(SELF)',
      roleKey: 'TESTER',
      description: '冒烟测试用受限角色：仅本人数据范围',
      dataScope: 'SELF',
      status: 1
    }
  })

  console.log(`✓ 角色就绪: ADMIN(#${adminRole.id}) / TESTER(#${selfRole.id})`)

  // ── 2. 角色-菜单关联 ─────────────────────────────────────
  const allMenus = await prisma.menuItem.findMany()

  // 管理员 → 全部菜单
  await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } })
  await prisma.roleMenu.createMany({
    data: allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id }))
  })

  // TESTER → 仅这些权限（用于验证 403 与数据范围）
  const testerPerms = new Set([
    'dashboard:view',
    'crm:organization:list',
    'crm:organization:add',
    'crm:organization:edit',
    'crm:organization:delete',
    'project:project:list',
    'project:project:add',
    'project:project:edit'
  ])
  const testerMenus = allMenus.filter(m => m.perm && testerPerms.has(m.perm))
  await prisma.roleMenu.deleteMany({ where: { roleId: selfRole.id } })
  await prisma.roleMenu.createMany({
    data: testerMenus.map(m => ({ roleId: selfRole.id, menuId: m.id }))
  })

  console.log(`✓ 菜单授权: ADMIN=${allMenus.length} 个 / TESTER=${testerMenus.length} 个`)

  // ── 3. 用户 ──────────────────────────────────────────────
  const hashed = await bcrypt.hash(TEST_PASSWORD, 10)

  const admin = await prisma.user.upsert({
    where: { username: 'testadmin' },
    update: { password: hashed },
    create: {
      username: 'testadmin',
      password: hashed,
      email: 'testadmin@crm-test.local',
      name: '测试管理员',
      role: 'ADMIN'
    }
  })

  const tester = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: { password: hashed },
    create: {
      username: 'testuser',
      password: hashed,
      email: 'testuser@crm-test.local',
      name: '测试普通用户',
      role: 'USER'
    }
  })

  // ── 4. 用户-角色关联 ─────────────────────────────────────
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id }
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: tester.id, roleId: selfRole.id } },
    update: {},
    create: { userId: tester.id, roleId: selfRole.id }
  })

  console.log(`✓ 用户就绪: testadmin(#${admin.id}) / testuser(#${tester.id})，密码均为 ${TEST_PASSWORD}`)
  console.log('测试种子数据写入完成')
}

main()
  .catch((err) => {
    console.error('写入测试数据失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
