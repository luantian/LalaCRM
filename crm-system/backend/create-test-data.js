const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function createTestData() {
  try {
    console.log('🔄 开始创建测试数据...\n');

    // 1. 获取或创建不同角色的用户
    console.log('\n📋 获取/创建用户...');

    // 获取现有用户
    const existingUsers = await prisma.user.findMany({
      select: { id: true, username: true, role: true }
    });
    console.log('现有用户:', existingUsers);

    // 查找或创建项目总监
    let director = existingUsers.find(u => u.username === 'director');
    if (!director) {
      director = await prisma.user.create({
        data: {
          username: 'director',
          password: await bcrypt.hash('director123', 10),
          email: 'director@crm.com',
          name: '张总监',
          role: 'PROJECT_DIRECTOR',
          roleId: 2
        }
      });
      console.log('✅ 项目总监创建成功');
    } else {
      console.log('✅ 项目总监已存在');
    }

    // 查找或创建项目经理1
    let manager1 = existingUsers.find(u => u.username === 'manager1');
    if (!manager1) {
      manager1 = await prisma.user.create({
        data: {
          username: 'manager1',
          password: await bcrypt.hash('manager123', 10),
          email: 'manager1@crm.com',
          name: '李经理',
          role: 'PROJECT_MANAGER',
          roleId: 3
        }
      });
      console.log('✅ 项目经理1创建成功');
    } else {
      console.log('✅ 项目经理1已存在');
    }

    // 查找或创建项目经理2
    let manager2 = existingUsers.find(u => u.username === 'manager2');
    if (!manager2) {
      manager2 = await prisma.user.create({
        data: {
          username: 'manager2',
          password: await bcrypt.hash('manager123', 10),
          email: 'manager2@crm.com',
          name: '王经理',
          role: 'PROJECT_MANAGER',
          roleId: 3
        }
      });
      console.log('✅ 项目经理2创建成功');
    } else {
      console.log('✅ 项目经理2已存在');
    }

    // 查找或创建普通用户
    let user1 = existingUsers.find(u => u.username === 'user1');
    if (!user1) {
      user1 = await prisma.user.create({
        data: {
          username: 'user1',
          password: await bcrypt.hash('user123', 10),
          email: 'user1@crm.com',
          name: '赵员工',
          role: 'USER',
          roleId: 4
        }
      });
      console.log('✅ 普通用户创建成功');
    } else {
      console.log('✅ 普通用户已存在');
    }

    // 获取admin用户
    const admin = existingUsers.find(u => u.username === 'admin');
    const adminId = admin ? admin.id : 1;

    // 2. 创建客户
    console.log('\n📋 创建客户...');

    const customer1 = await prisma.customer.create({
      data: {
        name: '张三',
        companyName: '阿里巴巴集团',
        phone: '13800138001',
        email: 'zhangsan@alibaba.com',
        address: '杭州市西湖区',
        ownerId: adminId
      }
    });
    console.log('✅ 客户1创建成功');

    const customer2 = await prisma.customer.create({
      data: {
        name: '李四',
        companyName: '腾讯科技',
        phone: '13800138002',
        email: 'lisi@tencent.com',
        address: '深圳市南山区',
        ownerId: director.id
      }
    });
    console.log('✅ 客户2创建成功');

    const customer3 = await prisma.customer.create({
      data: {
        name: '王五',
        companyName: '字节跳动',
        phone: '13800138003',
        email: 'wangwu@bytedance.com',
        address: '北京市海淀区',
        ownerId: manager1.id
      }
    });
    console.log('✅ 客户3创建成功');

    // 3. 创建项目
    console.log('\n📋 创建项目...');

    const project1 = await prisma.project.create({
      data: {
        name: 'ERP系统开发',
        customerId: customer1.id,
        status: 'IN_PROGRESS',
        budget: 200000,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        description: '为企业开发ERP系统',
        ownerId: manager1.id
      }
    });
    console.log('✅ 项目1创建成功');

    const project2 = await prisma.project.create({
      data: {
        name: '移动APP开发',
        customerId: customer2.id,
        status: 'PENDING',
        budget: 150000,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-09-30'),
        description: '开发移动应用',
        ownerId: manager2.id
      }
    });
    console.log('✅ 项目2创建成功');

    const project3 = await prisma.project.create({
      data: {
        name: '数据分析平台',
        customerId: customer3.id,
        status: 'COMPLETED',
        budget: 100000,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        description: '大数据分析和可视化平台',
        ownerId: manager1.id
      }
    });
    console.log('✅ 项目3创建成功');

    // 4. 创建合同
    console.log('\n📋 创建合同...');

    const contract1 = await prisma.contract.create({
      data: {
        name: 'ERP系统开发合同',
        customerId: customer1.id,
        projectId: project1.id,
        amount: 200000,
        signDate: new Date('2026-01-01'),
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        status: 'ACTIVE',
        content: 'ERP系统开发服务合同',
        ownerId: manager1.id
      }
    });
    console.log('✅ 合同1创建成功');

    const contract2 = await prisma.contract.create({
      data: {
        name: '移动APP开发合同',
        customerId: customer2.id,
        projectId: project2.id,
        amount: 150000,
        signDate: new Date('2026-03-01'),
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-09-30'),
        status: 'PENDING',
        content: '移动应用开发服务合同',
        ownerId: manager2.id
      }
    });
    console.log('✅ 合同2创建成功');

    // 5. 创建销售记录
    console.log('\n📋 创建销售记录...');

    await prisma.sale.create({
      data: {
        customerId: customer1.id,
        type: 'IN',
        category: '产品销售',
        amount: 100000,
        description: 'ERP系统首付款',
        date: new Date('2026-01-15'),
        ownerId: manager1.id
      }
    });

    await prisma.sale.create({
      data: {
        customerId: customer1.id,
        type: 'IN',
        category: '产品销售',
        amount: 100000,
        description: 'ERP系统尾款',
        date: new Date('2026-06-30'),
        ownerId: manager1.id
      }
    });

    await prisma.sale.create({
      data: {
        customerId: customer2.id,
        type: 'IN',
        category: '服务收入',
        amount: 50000,
        description: 'APP开发首付款',
        date: new Date('2026-03-15'),
        ownerId: manager2.id
      }
    });

    await prisma.sale.create({
      data: {
        customerId: customer1.id,
        type: 'OUT',
        category: '外包费用',
        amount: 30000,
        description: '外包开发费用',
        date: new Date('2026-02-01'),
        ownerId: manager1.id
      }
    });
    console.log('✅ 销售记录创建成功');

    // 6. 创建出差记录
    console.log('\n📋 创建出差记录...');

    await prisma.businessTrip.create({
      data: {
        title: '客户需求调研',
        customerId: customer1.id,
        projectId: project1.id,
        destination: '杭州',
        purpose: 'ERP系统需求调研',
        startDate: new Date('2026-01-05'),
        endDate: new Date('2026-01-07'),
        days: 3,
        accommodation: 1500,
        transportation: 2000,
        meals: 600,
        otherExpenses: 400,
        totalAmount: 4500,
        status: 'COMPLETED',
        notes: '需求调研顺利完成',
        ownerId: manager1.id
      }
    });

    await prisma.businessTrip.create({
      data: {
        title: '项目验收',
        customerId: customer1.id,
        projectId: project1.id,
        destination: '杭州',
        purpose: 'ERP系统项目验收',
        startDate: new Date('2026-06-28'),
        endDate: new Date('2026-06-30'),
        days: 3,
        accommodation: 1500,
        transportation: 2000,
        meals: 600,
        otherExpenses: 500,
        totalAmount: 4600,
        status: 'APPROVED',
        notes: '项目验收通过',
        ownerId: manager1.id
      }
    });

    await prisma.businessTrip.create({
      data: {
        title: '客户拜访',
        customerId: customer2.id,
        projectId: project2.id,
        destination: '深圳',
        purpose: 'APP开发项目启动会',
        startDate: new Date('2026-03-05'),
        endDate: new Date('2026-03-06'),
        days: 2,
        accommodation: 1000,
        transportation: 1500,
        meals: 400,
        otherExpenses: 300,
        totalAmount: 3200,
        status: 'PENDING',
        notes: '等待审批',
        ownerId: manager2.id
      }
    });
    console.log('✅ 出差记录创建成功');

    // 7. 创建费用报销
    console.log('\n📋 创建费用报销...');

    await prisma.expense.create({
      data: {
        title: '出差费用报销',
        customerId: customer1.id,
        projectId: project1.id,
        category: '差旅费',
        amount: 4500,
        expenseDate: new Date('2026-01-10'),
        description: '杭州客户需求调研出差费用',
        receipt: '发票号：INV20260110001',
        status: 'PAID',
        ownerId: manager1.id
      }
    });

    await prisma.expense.create({
      data: {
        title: '办公用品采购',
        category: '办公用品',
        amount: 2000,
        expenseDate: new Date('2026-02-15'),
        description: '采购笔记本电脑和显示器',
        receipt: '发票号：INV20260215001',
        status: 'APPROVED',
        ownerId: adminId
      }
    });

    await prisma.expense.create({
      data: {
        title: '招待费用',
        customerId: customer2.id,
        category: '招待费',
        amount: 3000,
        expenseDate: new Date('2026-03-10'),
        description: '客户晚宴招待',
        receipt: '发票号：INV20260310001',
        status: 'PENDING',
        ownerId: manager2.id
      }
    });

    await prisma.expense.create({
      data: {
        title: '培训费用',
        category: '培训费',
        amount: 5000,
        expenseDate: new Date('2026-04-01'),
        description: '项目管理培训课程',
        receipt: '发票号：INV20260401001',
        status: 'APPROVED',
        ownerId: manager1.id
      }
    });
    console.log('✅ 费用报销创建成功');

    console.log('\n🎉 测试数据创建完成！');
    console.log('\n📊 数据统计：');
    console.log('- 用户：5个（1管理员 + 1总监 + 2经理 + 1普通用户）');
    console.log('- 客户：3个');
    console.log('- 项目：3个');
    console.log('- 合同：2个');
    console.log('- 销售记录：4个');
    console.log('- 出差记录：3个');
    console.log('- 费用报销：4个');

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();
