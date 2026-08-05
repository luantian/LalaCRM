#!/usr/bin/env node
/**
 * LalaCRM 首次部署脚本（Node.js 版本）
 * 使用场景：服务器上从未部署过 CRM 系统
 * 使用方法：docker exec -it crm-backend node /app/scripts/deploy-fresh.js
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const http = require('http');

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

// 检查命令是否可用
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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

async function main() {
  console.log('\n==========================================');
  console.log('  LalaCRM 首次部署脚本 (Node.js)');
  console.log('==========================================\n');

  console.log('此脚本将执行以下操作:');
  console.log('  1. 检查运行环境');
  console.log('  2. 初始化数据库结构');
  console.log('  3. 插入种子数据');
  console.log('  4. 验证部署状态\n');

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    readline.question('是否继续？(y/N) ', resolve);
  });
  readline.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('已取消部署');
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

    // 阶段2: 初始化数据库
    logStep('初始化数据库结构...');
    
    try {
      // Prisma 会自动检测 schema 变化并同步
      execSync('npx prisma db push --accept-data-loss', {
        stdio: 'inherit',
        cwd: '/app'
      });
      logInfo('数据库结构初始化成功');
    } catch (error) {
      logError('数据库迁移失败');
      logWarn('请检查数据库连接和权限');
      process.exit(1);
    }

    // 阶段3: 插入种子数据
    logStep('插入种子数据（部门、角色、管理员）...');
    
    // 1. 插入部门
    const depts = [
      { name: '销售部', order: 1 },
      { name: '技术部', order: 2 },
      { name: '市场部', order: 3 },
      { name: '财务部', order: 4 },
      { name: '人事部', order: 5 }
    ];
    
    for (const d of depts) {
      await prisma.department.create({ data: d }).catch(() => {});
    }
    console.log('✓ 部门数据插入完成');
    
    // 2. 插入角色
    const roles = [
      { name: '管理员', code: 'ADMIN', description: '系统管理员，拥有所有权限', dataScope: 'ALL' },
      { name: '销售经理', code: 'SALES_MANAGER', description: '销售部门经理', dataScope: 'DEPARTMENT_BELOW' },
      { name: '项目经理', code: 'PROJECT_MANAGER', description: '项目部门经理', dataScope: 'DEPARTMENT_BELOW' },
      { name: '普通用户', code: 'USER', description: '普通员工', dataScope: 'SELF' }
    ];
    
    for (const r of roles) {
      await prisma.roleModel.create({ data: r }).catch(() => {});
    }
    console.log('✓ 角色数据插入完成');
    
    // 3. 创建管理员账号
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        name: '管理员',
        email: 'admin@localhost',
        roleId: 1,  // 系统管理员
        deptId: 1   // 销售部
      }
    }).catch(() => {
      console.log('! 管理员账号已存在');
    });
    
    console.log('✓ 管理员账号创建完成（用户名: admin, 密码: admin123）');
    console.log('! 请登录后立即修改密码！');
    
    logInfo('种子数据插入成功');

    // 阶段4: 验证部署
    logStep('验证部署状态...');
    
    // 等待后端服务就绪
    logInfo('等待后端服务启动...');
    const backendReady = await waitForService('http://localhost:5000', 30, 2000);
    
    if (backendReady) {
      logInfo('后端服务启动成功');
    } else {
      logWarn('后端服务未响应，但可能仍在启动中');
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
    logInfo('部署成功完成！');
    console.log('==========================================\n');
    
    console.log(`${colors.blue}访问信息:${colors.reset}`);
    console.log('  地址: http://192.168.2.13:8880');
    console.log('');
    
    console.log(`${colors.blue}登录信息:${colors.reset}`);
    console.log('  用户名: admin');
    console.log('  密码: admin123');
    console.log('');
    
    console.log(`${colors.yellow}重要提示:${colors.reset}`);
    console.log('  1. 请立即登录并修改管理员密码');
    console.log('  2. 进入"系统管理 > 角色管理"配置各角色的权限');
    console.log('  3. 进入"系统管理 > 菜单管理"导入菜单数据');
    console.log('');
    
    console.log(`${colors.blue}常用命令:${colors.reset}`);
    console.log('  查看日志: docker logs -f crm-backend');
    console.log('  重启服务: docker-compose restart');
    console.log('  停止服务: docker-compose down');
    console.log('');
    
  } catch (error) {
    logError(`部署失败: ${error.message}`);
    if (error.stack) {
      console.log(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
