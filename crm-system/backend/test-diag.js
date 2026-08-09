const axios = require("axios");
const B = "http://localhost:5000/api";

async function r(m, p, d, t) {
  const c = { method: m, url: B+p, headers: {"Content-Type":"application/json"}, validateStatus: ()=>true };
  if (t) c.headers.Authorization = "Bearer " + t;
  if (d) c.data = d;
  const res = await axios(c);
  return { s: res.status, d: res.data };
}

(async () => {
  const l = await r("POST","/auth/login",{username:"admin",password:"admin123"});
  const t = l.d.token, uid = l.d.user.id;

  // 准备基础数据
  const org = await r("POST","/organizations",{name:"diag_org",type:"COMPANY",status:"ACTIVE",description:"x"},t);
  const oid = org.d.id;
  const proj = await r("POST","/projects",{name:"diag_proj",organizationId:oid,status:"IN_PROGRESS",budget:100000,startDate:"2026-08-01"},t);
  const pid = proj.d.id;
  const con = await r("POST","/contracts",{name:"diag_con",organizationId:oid,projectId:pid,amount:100000,signDate:"2026-08-01",status:"DRAFT"},t);
  const cid = con.d.id;

  // 1. 创建角色
  console.log("=== 1. 创建角色 ===");
  let x = await r("POST","/roles",{name:"测试角色",displayName:"测试角色",description:"x"},t);
  console.log("name+displayName:", x.s, JSON.stringify(x.d).substring(0,200));
  x = await r("POST","/roles",{name:"测试角色2",roleKey:"TEST_DIAG",displayName:"测试角色2",description:"x"},t);
  console.log("+roleKey:", x.s, JSON.stringify(x.d).substring(0,200));

  // 2. 报价单
  console.log("\n=== 2. 报价单 ===");
  const opp = await r("POST","/opportunities",{name:"diag_opp",organizationId:oid,amount:100000,stage:"POTENTIAL"},t);
  const oppId = opp.d.id;
  console.log("创建商机:", opp.s, "id:", oppId);
  x = await r("POST","/quotations",{opportunityId:oppId,title:"报价测试",version:1,totalAmount:100000,validDays:30,status:"DRAFT"},t);
  console.log("报价单:", x.s, JSON.stringify(x.d).substring(0,300));

  // 3. 项目成本
  console.log("\n=== 3. 项目成本 ===");
  x = await r("GET","/project-costs/"+pid,null,t);
  console.log("/project-costs/"+pid+":", x.s, JSON.stringify(x.d).substring(0,200));
  x = await r("GET","/projects/"+pid+"/cost",null,t);
  console.log("/projects/"+pid+"/cost:", x.s, JSON.stringify(x.d).substring(0,200));

  // 4. 回款列表
  console.log("\n=== 4. 回款列表 ===");
  const rcpt = await r("POST","/contract-receipts",{contractId:cid,amount:50000,receiptDate:"2026-08-05",receiptType:"PROGRESS",status:"PENDING"},t);
  console.log("创建回款:", rcpt.s, "id:", rcpt.d && rcpt.d.id);
  x = await r("GET","/contract-receipts?contractId="+cid,null,t);
  console.log("?contractId=:", x.s, JSON.stringify(x.d).substring(0,300));
  x = await r("GET","/contract-receipts/"+cid,null,t);
  console.log("/"+cid+":", x.s, JSON.stringify(x.d).substring(0,200));

  // 5. 采购
  console.log("\n=== 5. 采购 ===");
  x = await r("POST","/procurements",{projectId:pid,title:"采购测试",totalAmount:50000,status:"PENDING"},t);
  console.log("无vendor:", x.s, JSON.stringify(x.d).substring(0,400));
  x = await r("POST","/procurements",{projectId:pid,title:"采购测试",totalAmount:50000,status:"PENDING",vendorName:"测试供应商"},t);
  console.log("+vendorName:", x.s, JSON.stringify(x.d).substring(0,400));

  // 6. 出差
  console.log("\n=== 6. 出差 ===");
  x = await r("POST","/business-trips",{title:"出差测试",destination:"上海",startDate:"2026-09-01",endDate:"2026-09-03",purpose:"测试",projectId:pid},t);
  console.log("出差:", x.s, JSON.stringify(x.d).substring(0,400));

  // 7. 报销
  console.log("\n=== 7. 报销 ===");
  x = await r("POST","/expenses",{title:"报销测试",projectId:pid,totalAmount:1000,status:"PENDING"},t);
  console.log("报销:", x.s, JSON.stringify(x.d).substring(0,300));

  // 8. 任务
  console.log("\n=== 8. 任务 ===");
  x = await r("POST","/tasks",{title:"任务测试",assigneeId:uid,projectId:pid,priority:"HIGH",dueDate:"2026-09-01",description:"test"},t);
  console.log("任务:", x.s, JSON.stringify(x.d).substring(0,300));

  // 9. 发票
  console.log("\n=== 9. 发票 ===");
  x = await r("POST","/invoices",{projectId:pid,contractId:cid,type:"INCOME",amount:50000,taxRate:6,invoiceNo:"INV-DIAG",invoiceDate:"2026-08-08"},t);
  console.log("发票:", x.s, JSON.stringify(x.d).substring(0,300));

  // 10. 归档保护
  console.log("\n=== 10. 归档保护 ===");
  const arch = await r("PUT","/projects/"+pid,{isArchived:true},t);
  console.log("归档:", arch.s, JSON.stringify(arch.d).substring(0,100));
  x = await r("PUT","/projects/"+pid,{name:"尝试修改"},t);
  console.log("编辑已归档:", x.s, JSON.stringify(x.d).substring(0,150));
  x = await r("DELETE","/projects/"+pid,null,t);
  console.log("删除已归档:", x.s, JSON.stringify(x.d).substring(0,150));

  // 清理
  await r("PUT","/projects/"+pid,{isArchived:false},t);
  await r("DELETE","/projects/"+pid,null,t);
  await r("DELETE","/opportunities/"+oppId,null,t);
  await r("DELETE","/contracts/"+cid,null,t);
  await r("DELETE","/organizations/"+oid,null,t);
})();
