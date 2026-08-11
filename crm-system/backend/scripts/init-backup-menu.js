#!/usr/bin/env node
/**
 * 初始化数据库备份菜单
 * 在群晖上运行: node scripts/init-backup-menu.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function initBackupMenu() {
  try {
    console.log('检查数据库备份菜单...');

    // 查找系统管理菜单
    const systemMenu = await prisma.menuItem.findFirst({
      where: { path: '/system', type: 'MENU' }
    });

    if (!systemMenu) {
      console.error('找不到系统管理菜单');
      process.exit(1);
    }

    // 检查是否已存在数据库备份菜单
    const existingMenu = await prisma.menuItem.findFirst({
      where: { path: '/database-backup' }
    });

    if (existingMenu) {
      console.log('数据库备份菜单已存在，跳过创建');
      return;
    }

    // 创建数据库备份菜单
    const backupMenu = await prisma.menuItem.create({
      data: {
        title: '数据库备份',
        path: '/database-backup',
        icon: 'database',
        type: 'MENU',
        parentId: systemMenu.id,
        order: 6,
        status: 'ACTIVE',
        perm: 'system:backup:list'
      }
    });

    console.log('创建数据库备份菜单成功:', backupMenu.id);

    // 创建按钮权限
    const buttons = [
      { title: '立即备份', perm: 'system:backup:create', order: 1 },
      { title: '下载备份', perm: 'system:backup:download', order: 2 },
      { title: '恢复备份', perm: 'system:backup:restore', order: 3 },
      { title: '删除备份', perm: 'system:backup:delete', order: 4 }
    ];

    for (const btn of buttons) {
      await prisma.menuItem.create({
        data: {
          title: btn.title,
          type: 'BUTTON',
          parentId: backupMenu.id,
          order: btn.order,
          status: 'ACTIVE',
          perm: btn.perm
        }
      });
      console.log(`创建按钮权限: ${btn.title}`);
    }

    // 为管理员角色分配权限
    const adminRole = await prisma.role.findUnique({
      where: { roleKey: 'ADMIN' }
    });

    if (adminRole) {
      // 获取新创建的所有菜单项
      const newMenus = await prisma.menuItem.findMany({
        where: {
          OR: [
            { path: '/database-backup' },
            { perm: { startsWith: 'system:backup:' } }
          ]
        }
      });

      for (const menu of newMenus) {
        await prisma.roleMenu.create({
          data: {
            roleId: adminRole.id,
            menuId: menu.id
          }
        });
      }
      console.log('为管理员角色分配权限成功');
    }

    console.log('数据库备份菜单初始化完成');
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

initBackupMenu();
