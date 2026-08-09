const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testBug1() {
  console.log('\n=== Bug 1: 归档项目保护 ===');
  // 登录
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { username: 'admin', password: 'admin123' });
  const token = loginRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  // 创建测试组织
  const orgRes = await axios.post(`${BASE_URL}/organizations`, {
    name: '测试组织',
    type: 'COMPANY',
    status: 'ACTIVE'
  }, { headers });
  const orgId = orgRes.data.id;

  // 创建测试项目
  const createRes = await axios.post(`${BASE_URL}/projects`, {
    name: '测试归档保护',
    status: 'IN_PROGRESS',
    budget: 10000,
    organizationId: orgId
  }, { headers });
  const projectId = createRes.data.id;
  console.log(`✓ 创建项目 ID: ${projectId}`);

  // 归档项目
  await axios.put(`${BASE_URL}/projects/${projectId}/archive`, {
    isArchived: true
  }, { headers });
  console.log('✓ 项目已归档');

  // 尝试编辑已归档项目
  try {
    await axios.put(`${BASE_URL}/projects/${projectId}`, {
      name: '修改名称'
    }, { headers });
    console.log('✗ 修复失败：仍可编辑已归档项目');
    return false;
  } catch (err) {
    if (err.response.status === 403) {
      console.log('✓ 修复成功：编辑已归档项目返回403');
    } else {
      console.log(`✗ 修复失败：返回 ${err.response.status} 而非403`);
      return false;
    }
  }

  // 尝试删除已归档项目
  try {
    await axios.delete(`${BASE_URL}/projects/${projectId}`, { headers });
    console.log('✗ 修复失败：仍可删除已归档项目');
    return false;
  } catch (err) {
    if (err.response.status === 403) {
      console.log('✓ 修复成功：删除已归档项目返回403');
    } else {
      console.log(`✗ 修复失败：返回 ${err.response.status} 而非403`);
      return false;
    }
  }

  // 清理：取消归档后删除
  await axios.put(`${BASE_URL}/projects/${projectId}/archive`, {
    isArchived: false
  }, { headers });
  await axios.delete(`${BASE_URL}/projects/${projectId}`, { headers });
  console.log('✓ 清理完成');

  return true;
}

async function testBug2() {
  console.log('\n=== Bug 2: 采购创建必填字段校验 ===');
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { username: 'admin', password: 'admin123' });
  const token = loginRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  // 尝试创建采购（缺少vendor字段）
  try {
    await axios.post(`${BASE_URL}/procurements`, {
      title: '测试采购',
      totalAmount: 1000,
      projectId: 1
    }, { headers });
    console.log('✗ 修复失败：缺少vendor仍可创建');
    return false;
  } catch (err) {
    if (err.response.status === 400) {
      console.log('✓ 修复成功：缺少vendor返回400');
      console.log(`  错误信息: ${err.response.data.error}`);
    } else {
      console.log(`✗ 修复失败：返回 ${err.response.status} 而非400`);
      return false;
    }
  }

  return true;
}

async function testBug3() {
  console.log('\n=== Bug 3: 出差创建必填字段校验 ===');
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { username: 'admin', password: 'admin123' });
  const token = loginRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  // 尝试创建出差（缺少purpose字段）
  try {
    await axios.post(`${BASE_URL}/business-trips`, {
      title: '测试出差',
      destination: '北京',
      startDate: '2026-08-10',
      endDate: '2026-08-12'
    }, { headers });
    console.log('✗ 修复失败：缺少purpose仍可创建');
    return false;
  } catch (err) {
    if (err.response.status === 400) {
      console.log('✓ 修复成功：缺少purpose返回400');
      console.log(`  错误信息: ${err.response.data.error}`);
    } else {
      console.log(`✗ 修复失败：返回 ${err.response.status} 而非400`);
      return false;
    }
  }

  return true;
}

async function main() {
  console.log('========================================');
  console.log('验证 Bug 修复');
  console.log('========================================');

  const results = [];
  results.push(await testBug1());
  results.push(await testBug2());
  results.push(await testBug3());

  console.log('\n========================================');
  console.log('验证结果');
  console.log('========================================');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`通过: ${passed}/${total}`);

  if (passed === total) {
    console.log('✓ 所有 Bug 修复验证通过！');
    process.exit(0);
  } else {
    console.log('✗ 部分修复未通过');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('测试出错:', err.message);
  process.exit(1);
});
