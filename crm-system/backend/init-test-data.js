/**
 * 初始化基础角色数据（测试用）
 * 清空后需要先运行这个脚本创建基础角色
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🔧 初始化基础数据...\n');

  // 1. 查询所有菜单
  const allMenus = await prisma.menuItem.findMany({ select: { id: true, perm: true, label: true } });
  console.log(`找到 ${allMenus.length} 个菜单项`);

  // 2. 创建 ADMIN 角色
  let adminRole = await prisma.roleModel.findFirst({ where: { roleKey: 'ADMIN' } });
  if (!adminRole) {
    adminRole = await prisma.roleModel.create({
      data: { roleKey: 'ADMIN', name: '系统管理员', displayName: '系统管理员', dataScope: 'ALL', description: '拥有所有权限' }
    });
    console.log('✓ 创建角色: ADMIN');
  } else {
    console.log('→ ADMIN角色已存在');
  }

  // 为ADMIN角色分配所有菜单权限
  const existingAdminMenus = await prisma.roleMenu.findMany({ where: { roleId: adminRole.id } });
  if (existingAdminMenus.length === 0) {
    await prisma.roleMenu.createMany({
      data: allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id }))
    });
    console.log(`✓ 为ADMIN角色分配 ${allMenus.length} 个菜单权限`);
  } else {
    console.log(`→ ADMIN角色已有 ${existingAdminMenus.length} 个菜单权限`);
  }

  // 3. 创建 TEST_ENGINEER 角色
  let testRole = await prisma.roleModel.findFirst({ where: { roleKey: 'TEST_ENGINEER' } });
  if (!testRole) {
    testRole = await prisma.roleModel.create({
      data: { roleKey: 'TEST_ENGINEER', name: '测试工程师', displayName: '测试工程师', dataScope: 'SELF', description: '测试用角色，拥有大部分权限' }
    });
    console.log('✓ 创建角色: TEST_ENGINEER');
  } else {
    console.log('→ TEST_ENGINEER角色已存在');
  }

  // 4. 创建 USER 角色
  let userRole = await prisma.roleModel.findFirst({ where: { roleKey: 'USER' } });
  if (!userRole) {
    userRole = await prisma.roleModel.create({
      data: { roleKey: 'USER', name: '普通用户', dataScope: 'SELF', description: '基本查看权限' }
    });
    console.log('✓ 创建角色: USER');
  } else {
    console.log('→ USER角色已存在');
  }

  // 为USER角色分配少量菜单权限
  const existingUserMenus = await prisma.roleMenu.findMany({ where: { roleId: userRole.id } });
  if (existingUserMenus.length === 0) {
    // 只分配查看类权限
    const viewMenus = allMenus.filter(m => 
      m.perm && (
        m.perm.endsWith(':list') || 
        m.perm === 'dashboard:view'
      )
    );
    await prisma.roleMenu.createMany({
      data: viewMenus.map(m => ({ roleId: userRole.id, menuId: m.id }))
    });
    console.log(`✓ 为USER角色分配 ${viewMenus.length} 个查看权限`);
  }

  // 5. 确保admin用户存在并关联ADMIN角色
  let adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
  if (!adminUser) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        email: 'admin@crm.com',
        name: '系统管理员',
        role: 'ADMIN'
      }
    });
    console.log('✓ 创建admin用户 (密码: admin123)');
  } else {
    console.log('→ admin用户已存在');
  }

  // 关联admin用户到ADMIN角色
  const existingUserRole = await prisma.userRole.findFirst({
    where: { userId: adminUser.id, roleId: adminRole.id }
  });
  if (!existingUserRole) {
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id }
    });
    console.log('✓ 关联admin用户到ADMIN角色');
  }

  // 6. 创建test_user1用户并关联TEST_ENGINEER角色
  let testUser1 = await prisma.user.findFirst({ where: { username: 'test_user1' } });
  if (!testUser1) {
    const hashedPassword = await bcrypt.hash('test123', 10);
    testUser1 = await prisma.user.create({
      data: {
        username: 'test_user1',
        password: hashedPassword,
        email: 'test1@crm.com',
        name: '测试用户1',
        role: 'USER'
      }
    });
    console.log('✓ 创建test_user1用户 (密码: test123)');
  } else {
    console.log('→ test_user1用户已存在');
  }

  const existingTestUserRole = await prisma.userRole.findFirst({
    where: { userId: testUser1.id, roleId: testRole.id }
  });
  if (!existingTestUserRole) {
    await prisma.userRole.create({
      data: { userId: testUser1.id, roleId: testRole.id }
    });
    console.log('✓ 关联test_user1到TEST_ENGINEER角色');
  }

  // 7. 创建viewer_test用户并关联USER角色
  let viewerUser = await prisma.user.findFirst({ where: { username: 'viewer_test' } });
  if (!viewerUser) {
    const hashedPassword = await bcrypt.hash('test123', 10);
    viewerUser = await prisma.user.create({
      data: {
        username: 'viewer_test',
        password: hashedPassword,
        email: 'viewer@crm.com',
        name: '查看者',
        role: 'USER'
      }
    });
    console.log('✓ 创建viewer_test用户 (密码: test123)');
  } else {
    console.log('→ viewer_test用户已存在');
  }

  const existingViewerUserRole = await prisma.userRole.findFirst({
    where: { userId: viewerUser.id, roleId: userRole.id }
  });
  if (!existingViewerUserRole) {
    await prisma.userRole.create({
      data: { userId: viewerUser.id, roleId: userRole.id }
    });
    console.log('✓ 关联viewer_test到USER角色');
  }

  // 汇总
  console.log('\n=== 初始化完成 ===');
  const finalRoles = await prisma.roleModel.findMany({
    include: { _count: { select: { roleMenus: true, userRoles: true } } }
  });
  for (const r of finalRoles) {
    console.log(`角色 ${r.roleKey}: ${r._count.roleMenus} 个菜单权限, ${r._count.userRoles} 个用户`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
