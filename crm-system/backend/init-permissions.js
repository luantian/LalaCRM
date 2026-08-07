const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化测试数据...\n');

  // 1. 确保所有基础角色存在
  console.log('步骤1: 创建基础角色...');
  
  let adminRole = await prisma.roleModel.findUnique({ where: { roleKey: 'ADMIN' } });
  if (!adminRole) {
    adminRole = await prisma.roleModel.create({
      data: {
        roleKey: 'ADMIN',
        name: '系统管理员',
        displayName: '系统管理员',
        dataScope: 'ALL',
        description: '拥有所有权限'
      }
    });
    console.log('✓ 创建角色: ADMIN');
  } else {
    console.log('✓ ADMIN角色已存在');
  }

  let testRole = await prisma.roleModel.findUnique({ where: { roleKey: 'TEST_ENGINEER' } });
  if (!testRole) {
    testRole = await prisma.roleModel.create({
      data: {
        roleKey: 'TEST_ENGINEER',
        name: '测试工程师',
        displayName: '测试工程师',
        dataScope: 'SELF',
        description: '测试用角色'
      }
    });
    console.log('✓ 创建角色: TEST_ENGINEER');
  } else {
    console.log('✓ TEST_ENGINEER角色已存在');
  }

  let userRole = await prisma.roleModel.findUnique({ where: { roleKey: 'USER' } });
  if (!userRole) {
    userRole = await prisma.roleModel.create({
      data: {
        roleKey: 'USER',
        name: '普通用户',
        displayName: '普通用户',
        dataScope: 'SELF',
        description: '基础查看权限'
      }
    });
    console.log('✓ 创建角色: USER');
  } else {
    console.log('✓ USER角色已存在');
  }

  // 2. 为 ADMIN 角色分配所有菜单权限
  console.log('\n步骤2: 为ADMIN角色分配所有菜单权限...');
  const allMenus = await prisma.menuItem.findMany();
  
  const existingAdminMenus = await prisma.roleMenu.findMany({
    where: { roleId: adminRole.id }
  });

  if (existingAdminMenus.length === 0) {
    const menuAssignments = allMenus.map(menu => ({
      roleId: adminRole.id,
      menuId: menu.id
    }));
    
    await prisma.roleMenu.createMany({
      data: menuAssignments
    });
    console.log(`✓ 为ADMIN角色分配了 ${allMenus.length} 个菜单权限`);
  } else {
    console.log(`✓ ADMIN角色已有 ${existingAdminMenus.length} 个菜单权限`);
  }

  // 3. 为 USER 角色分配基本查看权限
  console.log('\n步骤3: 为USER角色分配基础权限...');
  const viewMenus = allMenus.filter(menu => 
    menu.perm && (menu.perm.endsWith(':list') || menu.perm.endsWith(':view'))
  );
  
  const existingUserMenus = await prisma.roleMenu.findMany({
    where: { roleId: userRole.id }
  });

  if (existingUserMenus.length === 0) {
    const userMenuAssignments = viewMenus.map(menu => ({
      roleId: userRole.id,
      menuId: menu.id
    }));
    
    await prisma.roleMenu.createMany({
      data: userMenuAssignments
    });
    console.log(`✓ 为USER角色分配了 ${viewMenus.length} 个查看权限`);
  } else {
    console.log(`✓ USER角色已有 ${existingUserMenus.length} 个菜单权限`);
  }

  // 4. 创建测试用户并分配角色
  console.log('\n步骤4: 创建测试用户...');

  // admin 用户
  let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        name: '系统管理员',
        email: 'admin@example.com',
        role: 'ADMIN',
        deptId: null
      }
    });
    console.log('✓ 创建用户: admin (密码: admin123)');
  } else {
    console.log('✓ admin用户已存在');
  }

  // 确保 admin 关联到 ADMIN 角色
  const adminUserRole = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: adminRole.id }
  });
  if (!adminUserRole) {
    await prisma.userRole.create({
      data: {
        userId: admin.id,
        roleId: adminRole.id
      }
    });
    console.log('✓ 关联 admin 到 ADMIN 角色');
  } else {
    console.log('✓ admin 已关联到 ADMIN 角色');
  }

  // test_user1 用户
  let testUser1 = await prisma.user.findUnique({ where: { username: 'test_user1' } });
  if (!testUser1) {
    const hashedPassword = await bcrypt.hash('test123', 10);
    testUser1 = await prisma.user.create({
      data: {
        username: 'test_user1',
        password: hashedPassword,
        name: '测试用户1',
        email: 'test1@example.com',
        role: 'USER',
        deptId: null
      }
    });
    console.log('✓ 创建用户: test_user1 (密码: test123)');
  } else {
    console.log('✓ test_user1用户已存在');
  }

  // 确保 test_user1 关联到 TEST_ENGINEER 角色
  const testUser1Role = await prisma.userRole.findFirst({
    where: { userId: testUser1.id, roleId: testRole.id }
  });
  if (!testUser1Role) {
    await prisma.userRole.create({
      data: {
        userId: testUser1.id,
        roleId: testRole.id
      }
    });
    console.log('✓ 关联 test_user1 到 TEST_ENGINEER 角色');
  } else {
    console.log('✓ test_user1 已关联到 TEST_ENGINEER 角色');
  }

  // viewer_test 用户
  let viewerTest = await prisma.user.findUnique({ where: { username: 'viewer_test' } });
  if (!viewerTest) {
    const hashedPassword = await bcrypt.hash('test123', 10);
    viewerTest = await prisma.user.create({
      data: {
        username: 'viewer_test',
        password: hashedPassword,
        name: '查看者',
        email: 'viewer@example.com',
        role: 'USER',
        deptId: null
      }
    });
    console.log('✓ 创建用户: viewer_test (密码: test123)');
  } else {
    console.log('✓ viewer_test用户已存在');
  }

  // 确保 viewer_test 关联到 USER 角色
  const viewerRole = await prisma.userRole.findFirst({
    where: { userId: viewerTest.id, roleId: userRole.id }
  });
  if (!viewerRole) {
    await prisma.userRole.create({
      data: {
        userId: viewerTest.id,
        roleId: userRole.id
      }
    });
    console.log('✓ 关联 viewer_test 到 USER 角色');
  } else {
    console.log('✓ viewer_test 已关联到 USER 角色');
  }

  // 5. 验证初始化结果
  console.log('\n步骤5: 验证初始化结果...');
  const finalUsers = await prisma.user.findMany({
    include: {
      userRoles: {
        include: {
          role: true
        }
      }
    }
  });

  console.log('\n=== 用户和角色关联 ===');
  finalUsers.forEach(user => {
    const roles = user.userRoles.map(ur => ur.role.roleKey).join(', ') || '无角色';
    console.log(`${user.username} (${user.name}): ${roles}`);
  });

  const finalRoles = await prisma.roleModel.findMany({
    include: {
      _count: {
        select: {
          userRoles: true,
          roleMenus: true
        }
      }
    }
  });

  console.log('\n=== 角色统计 ===');
  finalRoles.forEach(role => {
    console.log(`${role.roleKey} (${role.displayName}): ${role._count.userRoles} 个用户, ${role._count.roleMenus} 个权限`);
  });

  console.log('\n✅ 初始化完成！\n');
  console.log('测试账号信息:');
  console.log('  admin / admin123 - 系统管理员 (ADMIN角色)');
  console.log('  test_user1 / test123 - 测试用户1 (TEST_ENGINEER角色)');
  console.log('  viewer_test / test123 - 查看者 (USER角色)');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
