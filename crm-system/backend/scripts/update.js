#!/usr/bin/env node
/**
 * LalaCRM 一键更新脚本（Node.js 版本）
 * 使用场景：系统已部署，需要更新到新版本
 * 使用方法：docker exec -it crm-backend node /app/scripts/update.js
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function logStep(msg) {
  console.log(`${colors.blue}[步骤]${colors.reset} ${msg}`);
}

function logInfo(msg) {
  console.log(`${colors.green}[✓]${colors.reset} ${msg}`);
}

function logWarn(msg) {
  console.log(`${colors.yellow}[!]${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}[✗]${colors.reset} ${msg}`);
}

// HTTP 健康检查
function checkHealth(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 等待服务就绪
async function waitForService(url, maxAttempts = 30, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkHealth(url)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

// 备份数据库
function backupDatabase() {
  logStep('备份数据库...');
  
  const backupDir = '/app/backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFile = path.join(backupDir, `crm_db_${timestamp}.sql`);
  
  try {
    // 使用 pg_dump 备份（需要在 postgres 容器中执行）
    execSync(`docker exec crm-postgres pg_dump -U crm_user crm_db > ${backupFile}`, {
      stdio: 'pipe'
    });
    
    const stats = fs.statSync(backupFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    logInfo(`数据库备份成功: ${backupFile} (大小: ${sizeMB}MB)`);
    
    // 保留最近 5 个备份
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('crm_db_') && f.endsWith('.sql'))
      .sort()
      .reverse();
    
    if (backups.length > 5) {
      const toDelete = backups.slice(5);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(backupDir, file));
      }
      logInfo(`已清理旧备份，保留最近 5 个`);
    }
    
    return true;
  } catch (error) {
    logError('数据库备份失败');
    logWarn('请检查数据库是否正常运行');
    return false;
  }
}

async function main() {
  console.log('\n==========================================');
  console.log('  LalaCRM 一键更新脚本 (Node.js)');
  console.log('==========================================\n');

  console.log('此脚本将执行以下操作:');
  console.log('  1. 检查运行环境');
  console.log('  2. 备份当前数据库');
  console.log('  3. 执行数据库迁移');
  console.log('  4. 插入新增的权限菜单');
  console.log('  5. 验证更新状态\n');

  console.log(`${colors.yellow}注意:${colors.reset} 更新过程中服务会短暂中断（约 1-2 分钟）\n`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    readline.question('是否继续？(y/N) ', resolve);
  });
  readline.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('已取消更新');
    process.exit(0);
  }

  console.log('');

  try {
    // 阶段1: 环境检查
    logStep('检查运行环境...');
    
    if (!commandExists('node')) {
      logError('Node.js 未安装');
      process.exit(1);
    }
    
    if (!commandExists('docker')) {
      logError('Docker 未安装');
      process.exit(1);
    }
    
    logInfo('环境检查通过');

    // 阶段2: 备份数据库
    const backupSuccess = backupDatabase();
    if (!backupSuccess) {
      const readline2 = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer2 = await new Promise(resolve => {
        readline2.question('是否跳过备份继续更新？(不推荐) (y/N) ', resolve);
      });
      readline2.close();
      
      if (answer2.toLowerCase() !== 'y') {
        process.exit(1);
      }
      logWarn('已跳过备份，继续更新...');
    }

    // 阶段3: 执行数据库迁移
    logStep('执行数据库迁移...');
    
    try {
      execSync('npx prisma db push --accept-data-loss', {
        stdio: 'inherit',
        cwd: '/app'
      });
      logInfo('数据库迁移成功');
    } catch (error) {
      logError('数据库迁移失败');
      logWarn('建议:');
      logWarn('  1. 检查 schema.prisma 是否有语法错误');
      logWarn('  2. 查看后端日志: docker logs crm-backend');
      logWarn('  3. 如果需要回滚，使用备份恢复数据库');
      process.exit(1);
    }

    // 阶段4: 插入新增的权限菜单
    logStep('插入新增的权限菜单...');
    
    const buttons = [
      { id: 98, key: 'project:contract:list',   label: '查看合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:list' },
      { id: 99, key: 'project:contract:add',    label: '新增合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:add' },
      { id: 100, key: 'project:contract:edit',  label: '编辑合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:edit' },
      { id: 101, key: 'project:contract:delete', label: '删除合同', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:delete' },
      { id: 102, key: 'project:procurement:list',   label: '查看采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:list' },
      { id: 103, key: 'project:procurement:add',    label: '新增采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:add' },
      { id: 104, key: 'project:procurement:edit',   label: '编辑采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:edit' },
      { id: 105, key: 'project:procurement:delete', label: '删除采购', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:delete' },
      { id: 106, key: 'project:contract:approve',   label: '合同审批', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:contract:approve' },
      { id: 107, key: 'project:procurement:approve', label: '采购审批', menuType: 'BUTTON', parentId: 4, icon: '', perm: 'project:procurement:approve' },
    ];
    
    let inserted = 0;
    let skipped = 0;
    
    for (const b of buttons) {
      try {
        await prisma.menuItem.create({ 
          data: { ...b, isVisible: true, requiredRoles: [], order: 0 } 
        });
        inserted++;
      } catch (e) {
        skipped++;
      }
    }
    
    // 给管理员角色分配新权限
    for (const b of buttons) {
      await prisma.roleMenu.create({ 
        data: { roleId: 1, menuId: b.id } 
      }).catch(() => {});
    }
    
    if (inserted > 0) {
      logInfo(`插入了 ${inserted} 个新权限菜单`);
    }
    if (skipped > 0) {
      logInfo(`跳过了 ${skipped} 个已存在的权限菜单`);
    }

    // 阶段5: 验证更新
    logStep('验证更新状态...');
    
    // 等待后端服务就绪
    logInfo('等待后端服务启动...');
    const backendReady = await waitForService('http://localhost:5000', 30, 2000);
    
    if (backendReady) {
      logInfo('后端服务启动成功');
    } else {
      logWarn('后端服务未响应，可能需要几秒钟启动时间');
    }
    
    // 检查前端服务
    logInfo('等待前端服务启动...');
    const frontendReady = await waitForService('http://localhost:8880', 30, 2000);
    
    if (frontendReady) {
      logInfo('前端服务启动成功');
    } else {
      logWarn('前端服务未响应，请检查 nginx 配置');
    }

    // 完成
    console.log('\n==========================================');
    logInfo('更新成功完成！');
    console.log('==========================================\n');
    
    console.log(`${colors.blue}访问地址:${colors.reset}`);
    console.log('  http://192.168.2.13:8880');
    console.log('');
    
    console.log(`${colors.blue}数据库备份:${colors.reset}`);
    const backupDir = '/app/backups';
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('crm_db_') && f.endsWith('.sql'))
        .sort()
        .reverse();
      
      if (backups.length > 0) {
        console.log(`  位置: ${backupDir}`);
        const latestBackup = backups[0];
        const stats = fs.statSync(path.join(backupDir, latestBackup));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  最新: ${latestBackup} (${sizeMB}MB)`);
      }
    }
    console.log('');
    
    console.log(`${colors.blue}常用命令:${colors.reset}`);
    console.log('  查看日志: docker logs -f crm-backend');
    console.log('  重启服务: docker-compose restart');
    console.log('  停止服务: docker-compose down');
    console.log('');
    
    console.log(`${colors.yellow}重要提示:${colors.reset}`);
    console.log('  1. 请进入"系统管理 > 角色管理"检查并配置新增的权限');
    console.log('  2. 如果发现问题，可以使用备份恢复数据库');
    console.log('');
    
  } catch (error) {
    logError(`更新失败: ${error.message}`);
    if (error.stack) {
      console.log(error.stack);
    }
    logWarn('系统可能处于不完整状态，建议检查日志:');
    logWarn('  docker logs crm-backend');
    logWarn('  docker logs crm-frontend');
    logWarn('');
    logWarn('如果需要回滚，可以使用备份恢复:');
    logWarn('  1. 找到备份文件: ls -lh /app/backups/');
    logWarn('  2. 恢复数据库: docker exec -i crm-postgres psql -U crm_user crm_db < <备份文件>');
    logWarn('  3. 重启服务: docker-compose restart');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 检查命令是否可用
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

main();
