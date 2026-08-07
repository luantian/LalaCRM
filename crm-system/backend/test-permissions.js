const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 开始权限配置检查 ===\n');

  // 1. 查看所有角色及其菜单权限
  const roles = await prisma.roleModel.findMany({
    include: {
      roleMenus: {
        include: {
          menu: {
            select: { id: true, label: true, perm: true, menuType: true, parentId: true }
          }
        }
      }
    }
  });

  console.log('=== 角色权限详情 ===\n');
  
  roles.forEach(role => {
    const menus = role.roleMenus.map(rm => rm.menu);
    const menuItems = menus.filter(m => m.menuType === 'MENU');
    const buttons = menus.filter(m => m.menuType === 'BUTTON');
    
    console.log('【' + role.displayName + '】(ID: ' + role.id + ', 数据范围: ' + role.dataScope + ')');
    console.log('  菜单数: ' + menuItems.length + ', 按钮权限数: ' + buttons.length);
    
    // 按父菜单分组显示
    const parentMap = {};
    menuItems.forEach(m => {
      if (!parentMap[m.id]) parentMap[m.id] = { label: m.label, children: [] };
    });
    
    buttons.forEach(b => {
      if (b.parentId && parentMap[b.parentId]) {
        parentMap[b.parentId].children.push(b.label + ' [' + b.perm + ']');
      }
    });
    
    Object.values(parentMap).forEach(p => {
      console.log('  ├─ ' + p.label);
      p.children.forEach(c => console.log('  │   └─ ' + c));
    });
    console.log('');
  });

  // 2. 查看用户角色绑定
  const users = await prisma.user.findMany({
    select: { id: true, username: true, roleId: true, userRoles: { include: { role: true } } }
  });

  console.log('=== 用户角色绑定 ===\n');
  users.forEach(u => {
    const newRoles = u.userRoles.map(ur => ur.role.displayName).join(', ');
    const oldRole = u.roleId ? 'RoleID:' + u.roleId : '无';
    console.log(u.username + ' (ID:' + u.id + ')');
    console.log('  新角色表: ' + (newRoles || '无'));
    console.log('  旧roleId: ' + oldRole);
  });

  // 3. 检查测试用户的角色分配
  console.log('\n=== 测试用户角色分配 ===\n');
  const testUsers = await prisma.user.findMany({
    where: {
      username: {
        in: ['test_admin', 'test_user1', 'test_user2', 'viewer_test']
      }
    },
    include: {
      userRoles: {
        include: {
          role: {
            select: { id: true, displayName: true, roleKey: true, dataScope: true }
          }
        }
      }
    }
  });

  testUsers.forEach(u => {
    console.log(u.username + ' (ID:' + u.id + ')');
    u.userRoles.forEach(ur => {
      console.log('  ├─ ' + ur.role.displayName + ' [' + ur.role.roleKey + '] 数据范围:' + ur.role.dataScope);
    });
  });

  console.log('\n=== 检查完成 ===');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
