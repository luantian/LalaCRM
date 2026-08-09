const axios = require('axios');
const BASE = 'http://localhost:5000/api';

async function r(m, p, d, t) {
  const c = { method: m, url: BASE+p, headers: {'Content-Type':'application/json'}, validateStatus: ()=>true };
  if (t) c.headers.Authorization = 'Bearer ' + t;
  if (d) c.data = d;
  return axios(c);
}

(async () => {
  const l = await r('POST','/auth/login',{username:'admin',password:'admin123'});
  const t = l.data.token;
  const uid = l.data.user.id;

  // 准备测试数据
  const org = await r('POST','/organizations',{name:'bugfix_org',type:'COMPANY',status:'ACTIVE',description:'x'},t);
  const oid = org.data.id;
  const proj = await r('POST','/projects',{name:'bugfix_proj',organizationId:oid,status:'IN_PROGRESS',budget:100000,startDate:'2026-08-01'},t);
  const pid = proj.data.id;
  const con = await r('POST','/contracts',{name:'bugfix_con',organizationId:oid,projectId:pid,amount:100000,signDate:'2026-08-01',status:'DRAFT'},t);
  const cid = con.data.id;

  let pass = 0, fail = 0;

  // === Bug 1: 归档保护 ===
  console.log('\n=== Bug 1: 归档保护 ===');
  await r('PUT',`/projects/${pid}/archive`,{isArchived:true},t);

  let x = await r('PUT',`/projects/${pid}`,{name:'尝试修改'},t);
  if (x.status === 403 && x.data.error && x.data.error.includes('归档')) {
    console.log('✓ 已归档项目不可编辑');
    pass++;
  } else {
    console.log('✗ 已归档项目仍可编辑:', x.status, JSON.stringify(x.data).substring(0,100));
    fail++;
  }

  x = await r('DELETE',`/projects/${pid}`,null,t);
  if (x.status === 403 && x.data.error && x.data.error.includes('归档')) {
    console.log('✓ 已归档项目不可删除');
    pass++;
  } else {
    console.log('✗ 已归档项目仍可删除:', x.status, JSON.stringify(x.data).substring(0,100));
    fail++;
  }

  // 取消归档以便后续清理
  await r('PUT',`/projects/${pid}/archive`,{isArchived:false},t);

  // === Bug 2: 采购创建 ===
  console.log('\n=== Bug 2: 采购创建 ===');
  x = await r('POST','/procurements',{title:'测试采购',totalAmount:50000,status:'PENDING',projectId:pid},t);
  console.log('缺少vendor:', x.status, JSON.stringify(x.data).substring(0,200));
  if (x.status === 400) {
    console.log('✓ 采购缺少vendor正确返回400');
    pass++;
  } else {
    console.log('✗ 采购缺少vendor应返回400');
    fail++;
  }

  x = await r('POST','/procurements',{title:'测试采购',vendor:'测试供应商',totalAmount:50000,status:'PENDING',projectId:pid},t);
  if (x.status === 201) {
    console.log('✓ 采购创建成功:', x.data.id);
    pass++;
  } else {
    console.log('✗ 采购创建失败:', x.status, JSON.stringify(x.data).substring(0,200));
    fail++;
  }

  // === Bug 3: 出差创建 ===
  console.log('\n=== Bug 3: 出差创建 ===');
  x = await r('POST','/business-trips',{title:'出差测试',destination:'上海',startDate:'2026-09-01',endDate:'2026-09-03'},t);
  console.log('缺少purpose:', x.status, JSON.stringify(x.data).substring(0,200));
  if (x.status === 400) {
    console.log('✓ 出差缺少必填字段正确返回400');
    pass++;
  } else {
    console.log('✗ 出差缺少必填字段应返回400');
    fail++;
  }

  x = await r('POST','/business-trips',{title:'出差测试',destination:'上海',startDate:'2026-09-01',endDate:'2026-09-03',purpose:'客户拜访',projectId:pid},t);
  if (x.status === 201) {
    console.log('✓ 出差创建成功:', x.data.id);
    pass++;
  } else {
    console.log('✗ 出差创建失败:', x.status, JSON.stringify(x.data).substring(0,200));
    fail++;
  }

  // 清理
  await r('DELETE',`/projects/${pid}`,null,t);
  await r('DELETE',`/contracts/${cid}`,null,t);
  await r('DELETE',`/organizations/${oid}`,null,t);

  console.log(`\n=== 验证结果: ${pass}通过, ${fail}失败 ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
