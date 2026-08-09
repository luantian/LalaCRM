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

  const org = await r("POST","/organizations",{name:"diag2_org",type:"COMPANY",status:"ACTIVE",description:"x"},t);
  const oid = org.d.id;
  const proj = await r("POST","/projects",{name:"diag2_proj",organizationId:oid,status:"IN_PROGRESS",budget:100000,startDate:"2026-08-01"},t);
  const pid = proj.d.id;

  // 采购 - 试更多字段组合
  console.log("=== 采购 ===");
  let x = await r("POST","/procurements",{projectId:pid,title:"采购测试",totalAmount:50000,status:"PENDING",vendorId:oid},t);
  console.log("+vendorId:", x.s, JSON.stringify(x.d).substring(0,400));

  x = await r("POST","/procurements",{projectId:pid,title:"采购测试",totalAmount:50000,status:"PENDING",vendorName:"测试供应商",contactName:"张三"},t);
  console.log("+vendorName+contactName:", x.s, JSON.stringify(x.d).substring(0,400));

  // 出差 - 试更多字段
  console.log("\n=== 出差 ===");
  x = await r("POST","/business-trips",{title:"出差测试",destination:"上海",startDate:"2026-09-01",endDate:"2026-09-03",purpose:"测试",projectId:pid,applicantId:uid},t);
  console.log("+applicantId:", x.s, JSON.stringify(x.d).substring(0,400));

  x = await r("POST","/business-trips",{title:"出差测试",destination:"上海",startDate:"2026-09-01",endDate:"2026-09-03",reason:"客户拜访",projectId:pid},t);
  console.log("+reason:", x.s, JSON.stringify(x.d).substring(0,400));

  // 看看后端日志
  console.log("\n=== 检查后端日志 ===");

  // 清理
  await r("DELETE","/projects/"+pid,null,t);
  await r("DELETE","/organizations/"+oid,null,t);
})();
