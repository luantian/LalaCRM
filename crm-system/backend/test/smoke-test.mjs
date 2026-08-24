/**
 * LalaCRM API 冒烟测试（只读业务代码，仅调用 HTTP 接口）
 *
 * 前置条件：测试服务器已用 crm_test 数据库启动（见 test/README.md）
 *
 * 运行方式（在 backend 目录下）:
 *   node test/smoke-test.mjs
 *
 * 可用环境变量:
 *   TEST_BASE_URL  服务器地址，默认 http://localhost:5001
 *
 * 说明：
 *   - verify() 为硬断言（计入通过/失败）
 *   - observe() 为行为观察（用于记录疑似 bug 的实际表现，不计入失败）
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5001'

let passed = 0
let failed = 0
const failures = []
const observations = []

function verify(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    failures.push({ name, detail })
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function observe(name, cond, ifTrue, ifFalse) {
  if (cond) {
    observations.push({ name, verdict: ifTrue })
    console.log(`  🔎 ${name} → ${ifTrue}`)
  } else {
    observations.push({ name, verdict: ifFalse })
    console.log(`  🔎 ${name} → ${ifFalse}`)
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON 响应 */ }
  return { status: res.status, json }
}

const login = (username, password) =>
  call('POST', '/api/auth/login', { body: { username, password } })

async function main() {
  console.log(`\n🧪 LalaCRM API 冒烟测试  目标: ${BASE}\n`)

  // ════════════════ G1 健康检查 ════════════════
  console.log('── G1 健康检查 ──')
  {
    const r = await call('GET', '/health')
    verify('GET /health 返回 200', r.status === 200, `实际 ${r.status}`)
    verify('健康状态为 ok', r.json?.status === 'ok', JSON.stringify(r.json))
  }

  // ════════════════ G2 认证 ════════════════
  // 注意：登录接口限流为每 IP 每分钟 5 次，本组恰好使用 5 次登录，
  //       第 6 次调用用于验证限流。之后所有测试复用已取得的 token。
  console.log('── G2 认证（登录失败/成功/限流）──')
  let adminToken = null
  let testerToken = null
  let approverToken = null
  let adminId = null
  let testerUserId = null
  {
    const r1 = await call('POST', '/api/auth/login', { body: {} })
    verify('空参数登录返回 400', r1.status === 400, `实际 ${r1.status}`)

    const r2 = await login('testadmin', 'wrong-password')
    verify('错误密码返回 401', r2.status === 401, `实际 ${r2.status}`)
    verify('错误密码不泄露具体原因', r2.json?.error === '用户名或密码错误', JSON.stringify(r2.json))

    const r3 = await login('no_such_user', 'whatever')
    verify('不存在用户返回 401', r3.status === 401, `实际 ${r3.status}`)

    const r4 = await login('testadmin', 'Test123456!')
    verify('管理员登录返回 200', r4.status === 200, `实际 ${r4.status} ${JSON.stringify(r4.json)}`)
    verify('返回 token', !!r4.json?.token)
    verify('管理员权限为通配符 *', r4.json?.user?.permissions?.includes('*'), JSON.stringify(r4.json?.user?.permissions))
    adminToken = r4.json?.token
    adminId = r4.json?.user?.id

    const r5 = await login('testuser', 'Test123456!')
    verify('普通用户登录返回 200', r5.status === 200, `实际 ${r5.status}`)
    const perms = r5.json?.user?.permissions || []
    verify('普通用户权限不含 *', !perms.includes('*'))
    verify('普通用户拥有 crm:organization:list', perms.includes('crm:organization:list'), JSON.stringify(perms))
    verify('权限继承: 拥有 crm:organization:add 则含 :list', perms.includes('crm:organization:list'))
    testerToken = r5.json?.token
    testerUserId = r5.json?.user?.id

    if (!adminToken || !testerToken) {
      console.log('\n⛔ 无法获取测试 token，中止后续测试。')
      return summary()
    }

    const r6 = await login('testadmin', 'wrong-again') // 第 6 次 → 应触发限流
    verify('登录限流：第 6 次/分钟返回 429', r6.status === 429, `实际 ${r6.status} ${JSON.stringify(r6.json)}`)
  }

  // ════════════════ G3 token 校验 ════════════════
  console.log('── G3 token 校验 ──')
  {
    const r1 = await call('GET', '/api/organizations')
    verify('无 token 访问业务接口返回 401', r1.status === 401, `实际 ${r1.status}`)

    const r2 = await call('GET', '/api/organizations', { token: 'garbage.token.value' })
    verify('无效 token 返回 401', r2.status === 401, `实际 ${r2.status}`)

    const r3 = await call('GET', '/api/auth/me', { token: adminToken })
    verify('GET /api/auth/me 返回 200', r3.status === 200, `实际 ${r3.status}`)
    verify('me 返回正确用户', r3.json?.username === 'testadmin', JSON.stringify(r3.json?.username))

    // 篡改 token（改 payload 后签名失配）
    const forged = `${adminToken.split('.')[0]}.${btoa('{"id":999,"username":"hacker"}')}.${adminToken.split('.')[2]}`
    const r4 = await call('GET', '/api/auth/me', { token: forged })
    verify('篡改 payload 的 token 被拒绝', r4.status === 401, `实际 ${r4.status}`)
  }

  // ════════════════ G4 功能级权限（RBAC）════════════════
  console.log('── G4 功能级权限（RBAC）──')
  {
    const r1 = await call('GET', '/api/users', { token: testerToken })
    verify('无 system:user:list 权限访问用户列表返回 403', r1.status === 403, `实际 ${r1.status}`)

    const r2 = await call('GET', '/api/users', { token: adminToken })
    verify('管理员访问用户列表返回 200', r2.status === 200, `实际 ${r2.status}`)

    const r3 = await call('POST', '/api/auth/register', {
      token: testerToken,
      body: { username: 'hacker', password: '123456', email: 'h@x.com', name: 'H' }
    })
    verify('无权限用户不能注册新用户（403）', r3.status === 403, `实际 ${r3.status}`)

    const r4 = await call('POST', '/api/auth/register', {
      token: adminToken,
      body: { username: '', password: '123', email: 'bad', name: '' }
    })
    verify('注册参数校验返回 400', r4.status === 400, `实际 ${r4.status}`)
  }

  // ════════════════ G5 组织 CRUD + 输入校验 + 软删除 ════════════════
  console.log('── G5 组织 CRUD + 软删除 ──')
  let crudOrgId = null
  {
    const bad = await call('POST', '/api/organizations', {
      token: adminToken,
      body: { name: '非法类型组织', type: 'NOT_A_TYPE' }
    })
    verify('非法 type 被 express-validator 拦截（400）', bad.status === 400, `实际 ${bad.status}`)

    const bad2 = await call('POST', '/api/organizations', {
      token: adminToken,
      body: { name: 'x', type: 'COMPANY', email: 'not-an-email' }
    })
    verify('非法邮箱格式被拦截（400）', bad2.status === 400, `实际 ${bad2.status}`)

    const noPerm = await call('POST', '/api/organizations', {
      token: testerToken,
      body: { name: '无权限创建', type: 'COMPANY' }
    })
    // testuser 拥有 crm:organization:add，应成功；此测试确认权限授予生效
    verify('拥有 add 权限的用户可创建组织（201）', noPerm.status === 201, `实际 ${noPerm.status} ${JSON.stringify(noPerm.json)}`)

    const created = await call('POST', '/api/organizations', {
      token: adminToken,
      body: { name: '冒烟测试集团CRUD', type: 'GROUP', address: '原始地址', phone: '010-12345678' }
    })
    verify('创建组织返回 201', created.status === 201, `实际 ${created.status} ${JSON.stringify(created.json)}`)
    verify('创建者自动成为 owner', created.json?.ownerId === adminId, `ownerId=${created.json?.ownerId}, adminId=${adminId}`)
    crudOrgId = created.json?.id

    const got = await call('GET', `/api/organizations/${crudOrgId}`, { token: adminToken })
    verify('按 id 查询组织返回 200', got.status === 200, `实际 ${got.status}`)
    verify('查询结果名称一致', got.json?.name === '冒烟测试集团CRUD', JSON.stringify(got.json?.name))

    const upd = await call('PUT', `/api/organizations/${crudOrgId}`, {
      token: adminToken,
      body: { name: '冒烟测试集团CRUD', type: 'GROUP', address: '更新后的地址' }
    })
    verify('更新组织返回 200', upd.status === 200, `实际 ${upd.status}`)
    verify('更新生效', upd.json?.address === '更新后的地址', JSON.stringify(upd.json?.address))

    const del = await call('DELETE', `/api/organizations/${crudOrgId}`, { token: adminToken })
    verify('删除组织返回 200', del.status === 200, `实际 ${del.status}`)

    const got2 = await call('GET', `/api/organizations/${crudOrgId}`, { token: adminToken })
    verify('软删除后按 id 查询返回 404', got2.status === 404, `实际 ${got2.status}`)

    const list = await call('GET', '/api/organizations?search=冒烟测试集团CRUD', { token: adminToken })
    const stillThere = (list.json?.data || []).some(o => o.id === crudOrgId)
    verify('软删除后列表不再返回该记录', !stillThere)
  }

  // ════════════════ G6 数据范围（dataScope）对比测试 ════════════════
  console.log('── G6 数据范围（SELF 用户 vs 管理员）──')
  {
    // 两个用户各建一个组织
    const orgA = await call('POST', '/api/organizations', {
      token: adminToken, body: { name: '范围测试-管理员客户', type: 'COMPANY' }
    })
    const orgB = await call('POST', '/api/organizations', {
      token: testerToken, body: { name: '范围测试-普通用户客户', type: 'COMPANY' }
    })
    verify('管理员创建组织成功', orgA.status === 201)
    verify('普通用户创建组织成功', orgB.status === 201)

    // 客户为公司公共资产（2026-08-24 起）：客户模块不做数据范围过滤，权限即全量
    const listAsTester = await call('GET', '/api/organizations?search=范围测试-', { token: testerToken })
    const testerSees = (listAsTester.json?.data || []).map(o => o.name)
    const seesAdminOrg = testerSees.includes('范围测试-管理员客户')
    const seesOwnOrg = testerSees.includes('范围测试-普通用户客户')
    verify('客户权限即全量：SELF 用户能看到自己的组织', seesOwnOrg, JSON.stringify(testerSees))
    verify('客户权限即全量：SELF 用户也能看到管理员创建的组织', seesAdminOrg, JSON.stringify(testerSees))

    // 对照组：项目路由挂了 applyDataScope，应正确过滤
    const p1 = await call('POST', '/api/projects', {
      token: adminToken, body: { name: '范围测试-管理员项目', organizationId: orgA.json?.id }
    })
    const p2 = await call('POST', '/api/projects', {
      token: testerToken, body: { name: '范围测试-普通用户项目', organizationId: orgB.json?.id }
    })
    verify('管理员创建项目成功', p1.status === 201, `实际 ${p1.status} ${JSON.stringify(p1.json)}`)
    verify('普通用户创建项目成功', p2.status === 201, `实际 ${p2.status}`)

    const projListTester = await call('GET', '/api/projects', { token: testerToken })
    const testerProjects = (projListTester.json?.data || []).map(p => p.name)
    verify('SELF 用户项目列表只含自己的项目', testerProjects.includes('范围测试-普通用户项目') && !testerProjects.includes('范围测试-管理员项目'), JSON.stringify(testerProjects))

    const projListAdmin = await call('GET', '/api/projects', { token: adminToken })
    const adminProjects = (projListAdmin.json?.data || []).map(p => p.name)
    verify('ALL 范围管理员能看到全部项目', adminProjects.includes('范围测试-管理员项目') && adminProjects.includes('范围测试-普通用户项目'), JSON.stringify(adminProjects))

    const crossRead = await call('GET', `/api/projects/${p1.json?.id}`, { token: testerToken })
    verify('SELF 用户读取他人项目详情返回 404（applyDataScope 生效）', crossRead.status === 404, `实际 ${crossRead.status}`)

    // PUT /api/projects/:id 无属主校验（代码审查发现）
    const crossEdit = await call('PUT', `/api/projects/${p1.json?.id}`, {
      token: testerToken, body: { name: '范围测试-被越权改名' }
    })
    observe(
      '项目越权编辑（PUT /api/projects/:id 无属主校验）',
      crossEdit.status === 200,
      `⚠️ 复现：SELF 用户成功修改管理员的项目（status=${crossEdit.status}）`,
      `✅ 越权编辑被拒绝（status=${crossEdit.status}）`
    )
    if (crossEdit.status === 200) {
      const check = await call('GET', `/api/projects/${p1.json?.id}`, { token: adminToken })
      observe('越权改名实际生效', check.json?.name === '范围测试-被越权改名', '⚠️ 管理员项目名已被普通用户改掉', '名称未变化')
    }

    // 部分更新数据丢失测试（startDate 未传时被置 null）
    const withDate = await call('POST', '/api/projects', {
      token: adminToken,
      body: { name: '日期保护测试项目', organizationId: orgA.json?.id, startDate: '2026-01-15', endDate: '2026-06-30' }
    })
    verify('带日期创建项目成功', withDate.status === 201)
    verify('创建后 startDate 已保存', !!withDate.json?.startDate, JSON.stringify(withDate.json?.startDate))

    const partial = await call('PUT', `/api/projects/${withDate.json?.id}`, {
      token: adminToken, body: { name: '日期保护测试项目-改名' }
    })
    verify('部分更新返回 200', partial.status === 200, `实际 ${partial.status}`)
    observe(
      '部分更新是否丢失日期字段（PUT 未传 startDate 时被置 null）',
      !partial.json?.startDate || !partial.json?.endDate,
      '⚠️ 复现：仅改名导致 startDate/endDate 被清空（数据丢失）',
      '✅ 未传字段保持原值'
    )

    // 状态机：非法流转应被拒绝
    const badTransition = await call('PUT', `/api/projects/${p2.json?.id}`, {
      token: testerToken, body: { status: 'IN_PROGRESS' } // 假设 P2 当前 IN_PROGRESS，同值允许
    })
    // 先把 P2 置为 COMPLETED，再尝试改回 IN_PROGRESS
    const complete = await call('PUT', `/api/projects/${p2.json?.id}`, {
      token: testerToken, body: { status: 'COMPLETED' }
    })
    verify('合法流转 IN_PROGRESS→COMPLETED 成功', complete.status === 200, `实际 ${complete.status}`)
    const revert = await call('PUT', `/api/projects/${p2.json?.id}`, {
      token: testerToken, body: { status: 'IN_PROGRESS' }
    })
    // COMPLETED 会自动归档，归档守卫（403）或状态机校验（400）都会拦截，均为安全行为
    verify('非法流转 COMPLETED→IN_PROGRESS 被拦截', revert.status === 400 || revert.status === 403, `实际 ${revert.status}`)

    // 删除权限：testuser 对 admin 的项目执行删除（DELETE 有属主校验）
    const crossDelete = await call('DELETE', `/api/projects/${p1.json?.id}`, { token: testerToken })
    verify('SELF 用户删除他人项目被拒绝（403）', crossDelete.status === 403, `实际 ${crossDelete.status} ${JSON.stringify(crossDelete.json)}`)

    const selfDelete = await call('DELETE', `/api/projects/${p2.json?.id}`, { token: testerToken })
    observe(
      '已完成归档项目的删除保护',
      selfDelete.status === 403,
      '✅ 已归档（COMPLETED 自动归档）项目禁止删除',
      `⚠️ 归档项目仍可被删除（status=${selfDelete.status}）`
    )
  }

  // ════════════════ G7 越权提权链 + 无权限端点 ════════════════
  console.log('── G7 越权提权链（H5）与无权限端点（M1）──')
  {
    // 管理员新建组织 + 项目作为越权目标
    const targetOrg = await call('POST', '/api/organizations', {
      token: adminToken, body: { name: `提权测试组织-${Date.now()}`, type: 'COMPANY' }
    })
    const target = await call('POST', '/api/projects', {
      token: adminToken, body: { name: '提权测试-管理员私有项目', organizationId: targetOrg.json?.id }
    })
    verify('管理员创建目标项目成功', target.status === 201, `实际 ${target.status} ${JSON.stringify(target.json)}`)

    // 提权前：testuser 看不到该项目（applyDataScope 生效）
    const before = await call('GET', `/api/projects/${target.json?.id}`, { token: testerToken })
    verify('提权前 SELF 用户无法读取该项目（404）', before.status === 404, `实际 ${before.status}`)

    // H5：POST /api/projects/:id/team 无属主校验 → testuser 把自己加进他人项目团队
    const testerId = testerUserId
    const selfAdd = await call('POST', `/api/projects/${target.json?.id}/team`, {
      token: testerToken, body: { userId: testerId, projectRole: 'DEVELOPER' }
    })
    observe(
      '越权添加团队成员（POST /:id/team 无属主校验）',
      selfAdd.status === 201,
      `⚠️ 复现：普通用户将自己加入管理员的项目团队（status=${selfAdd.status}）`,
      `✅ 越权添加被拒绝（status=${selfAdd.status}）`
    )

    if (selfAdd.status === 201) {
      const after = await call('GET', `/api/projects/${target.json?.id}`, { token: testerToken })
      observe(
        '提权后数据范围扩张（TEAM 范围/详情可见性）',
        after.status === 200,
        '⚠️ 复现：加入团队后立即可见该项目详情（完整的权限自我提升链）',
        `仍不可见（status=${after.status}）— SELF 范围不含 TEAM 条件，读可见性未扩张`
      )

      // DELETE 的属主检查直接认"团队成员"（不走 dataScope）→ 验证破坏性提权
      const escDelete = await call('DELETE', `/api/projects/${target.json?.id}`, { token: testerToken })
      observe(
        '提权后删除权（DELETE 属主检查认团队成员）',
        escDelete.status === 200,
        '⚠️ 复现：SELF 用户越权入队后可删除管理员的项目（破坏性提权闭环）',
        `不可删除（status=${escDelete.status}）`
      )
    }

    // M1：采购付款列表无权限检查
    const payments = await call('GET', '/api/procurement-payments?procurementId=1', { token: testerToken })
    observe(
      '采购付款列表权限（GET /api/procurement-payments 无 checkPermission）',
      payments.status === 200,
      `⚠️ 复现：无任何业务权限的用户可访问付款记录接口（status=200）`,
      `✅ 被拒绝（status=${payments.status}）`
    )
  }

  // ════════════════ G8 越权 id 探测 ════════════════
  console.log('── G7 其他越权探测 ──')
  {
    // 不存在的资源应 404 而非 500
    const r1 = await call('GET', '/api/organizations/999999', { token: adminToken })
    verify('不存在组织返回 404（非 500）', r1.status === 404, `实际 ${r1.status}`)

    const r2 = await call('GET', '/api/projects/999999', { token: adminToken })
    verify('不存在项目返回 404（非 500）', r2.status === 404, `实际 ${r2.status}`)

    const r3 = await call('PUT', '/api/organizations/999999', {
      token: adminToken, body: { name: 'x', type: 'COMPANY' }
    })
    verify('更新不存在组织返回 404（非 500）', r3.status === 404, `实际 ${r3.status}`)

    // 非数字 id 的健壮性
    const r4 = await call('GET', '/api/organizations/abc', { token: adminToken })
    verify('非数字 id 不返回 500', r4.status !== 500, `实际 ${r4.status}`)

    // 未知路由
    const r5 = await call('GET', '/api/no-such-module', { token: adminToken })
    verify('未知路由返回 404', r5.status === 404, `实际 ${r5.status}`)
  }

  // ════════════════ G9 报价单审批流（状态机/权限/留痕）════════════════
  console.log('── G9 报价单审批流 ──')
  {
    // approver 登录（G2 已用满限流窗口，429 则等窗口过期重试一次）
    {
      let r = await login('testapprover', 'Test123456!')
      if (r.status === 429) {
        console.log('  [G9] approver 登录撞限流窗口，等待 65s 重试')
        await new Promise((res) => setTimeout(res, 65_000))
        r = await login('testapprover', 'Test123456!')
      }
      verify('审批人登录返回 200', r.status === 200, `实际 ${r.status}`)
      approverToken = r.json?.token
    }
    if (!approverToken) {
      console.log('  ⛠ 跳过 G9（无法获取 approver token，请先运行 test/seed-test-data.mjs）')
    } else {
      // 前置：组织 + 商机（报价单必填 opportunityId + organizationId）
      const org = await call('POST', '/api/organizations', { token: adminToken, body: { name: `冒烟审批客户-${Date.now()}`, type: 'COMPANY' } })
      const opp = await call('POST', '/api/opportunities', { token: adminToken, body: { name: `冒烟审批商机-${Date.now()}`, organizationId: org.json?.id } })
      verify('前置商机创建成功', opp.status === 201, `实际 ${opp.status} ${JSON.stringify(opp.json)}`)

      // ── 状态机：草稿 ──
      const q1 = await call('POST', '/api/quotations', {
        token: adminToken,
        body: { name: `冒烟状态机-${Date.now()}`, opportunityId: opp.json?.id, organizationId: org.json?.id, totalAmount: 10,
          items: [{ name: '冒烟项', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
      })
      verify('管理员创建报价单 201', q1.status === 201, `实际 ${q1.status} ${JSON.stringify(q1.json)}`)
      verify('初始状态为 DRAFT', q1.json?.status === 'DRAFT')
      const qid = q1.json?.id

      verify('草稿直接审批被拦截 400', (await call('POST', `/api/quotations/${qid}/approve`, { token: adminToken, body: {} })).status === 400)
      verify('草稿直接驳回被拦截 400', (await call('POST', `/api/quotations/${qid}/reject`, { token: adminToken, body: { reason: 'x' } })).status === 400)

      // ── 状态机：提交 ──
      verify('管理员提交自己的草稿 200', (await call('POST', `/api/quotations/${qid}/submit`, { token: adminToken })).status === 200)
      verify('重复提交被拦截 400', (await call('POST', `/api/quotations/${qid}/submit`, { token: adminToken })).status === 400)
      verify('已提交后编辑被拦截 400', (await call('PUT', `/api/quotations/${qid}`, { token: adminToken, body: { name: 'x' } })).status === 400)
      verify('已提交后删除被拦截 400', (await call('DELETE', `/api/quotations/${qid}`, { token: adminToken })).status === 400)
      verify('驳回原因为空白被拦截 400', (await call('POST', `/api/quotations/${qid}/reject`, { token: adminToken, body: { reason: '   ' } })).status === 400)

      // ── 管理员豁免防自审批 + 留痕 ──
      const ap = await call('POST', `/api/quotations/${qid}/approve`, { token: adminToken, body: { remark: '冒烟-管理员豁免备注' } })
      verify('管理员可批准自己提交的（豁免）', ap.status === 200, `实际 ${ap.status}`)
      verify('批准后状态 APPROVED', ap.json?.status === 'APPROVED')
      verify('审批意见落库', ap.json?.approvalNote === '冒烟-管理员豁免备注', JSON.stringify(ap.json?.approvalNote))
      verify('审批人 id 落库', !!ap.json?.approvedBy)
      verify('审批时间落库', !!ap.json?.approvedAt)
      const det = await call('GET', `/api/quotations/${qid}`, { token: adminToken })
      verify('详情返回审批人姓名（approver include）', det.json?.approver?.name === '测试管理员', JSON.stringify(det.json?.approver))

      // ── 权限：TESTER 无审批权 / 防自审批 / 所有权 ──
      const q2 = await call('POST', '/api/quotations', {
        token: approverToken,
        body: { name: `冒烟权限-${Date.now()}`, opportunityId: opp.json?.id, organizationId: org.json?.id, totalAmount: 10,
          items: [{ name: '冒烟项', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
      })
      verify('审批人可创建报价单 201', q2.status === 201, `实际 ${q2.status}`)
      verify('审批人提交自己的草稿 200', (await call('POST', `/api/quotations/${q2.json?.id}/submit`, { token: approverToken })).status === 200)

      verify('无审批权用户 approve 被拒 403', (await call('POST', `/api/quotations/${q2.json?.id}/approve`, { token: testerToken, body: {} })).status === 403)
      verify('无审批权用户 reject 被拒 403', (await call('POST', `/api/quotations/${q2.json?.id}/reject`, { token: testerToken, body: { reason: 'x' } })).status === 403)
      verify('非管理员审批自己提交的被拒 403（防自审批）', (await call('POST', `/api/quotations/${q2.json?.id}/approve`, { token: approverToken, body: {} })).status === 403)
      verify('非管理员驳回自己提交的被拒 403（防自驳回）', (await call('POST', `/api/quotations/${q2.json?.id}/reject`, { token: approverToken, body: { reason: '自己驳回自己' } })).status === 403)

      // 所有权：TESTER 提交管理员的草稿 → 403
      const q3 = await call('POST', '/api/quotations', {
        token: adminToken,
        body: { name: `冒烟所有权-${Date.now()}`, opportunityId: opp.json?.id, organizationId: org.json?.id, totalAmount: 10,
          items: [{ name: '冒烟项', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
      })
      verify('非本人提交他人草稿被拒 403', (await call('POST', `/api/quotations/${q3.json?.id}/submit`, { token: testerToken })).status === 403)

      // ── 真实跨用户驳回落库 ──
      const q4 = await call('POST', '/api/quotations', {
        token: testerToken,
        body: { name: `冒烟跨用户驳回-${Date.now()}`, opportunityId: opp.json?.id, organizationId: org.json?.id, totalAmount: 10,
          items: [{ name: '冒烟项', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
      })
      verify('普通用户可创建报价单 201', q4.status === 201, `实际 ${q4.status} ${JSON.stringify(q4.json)}`)
      verify('普通用户提交自己的草稿 200', (await call('POST', `/api/quotations/${q4.json?.id}/submit`, { token: testerToken })).status === 200)
      const rj = await call('POST', `/api/quotations/${q4.json?.id}/reject`, { token: approverToken, body: { reason: '冒烟-跨用户驳回原因' } })
      verify('审批人驳回他人报价单 200', rj.status === 200, `实际 ${rj.status}`)
      verify('驳回后状态 REJECTED', rj.json?.status === 'REJECTED')
      verify('驳回原因落库', rj.json?.approvalNote === '冒烟-跨用户驳回原因', JSON.stringify(rj.json?.approvalNote))
      const rjDet = await call('GET', `/api/quotations/${q4.json?.id}`, { token: adminToken })
      verify('被驳回单详情返回审批人姓名', rjDet.json?.approver?.name === '测试审批人', JSON.stringify(rjDet.json?.approver))
    }
  }

  // ════════════════ G10 附件流（上传/列表/下载/越权/删除）════════════════
  console.log('── G10 附件流 ──')
  {
    // 前置：TESTER 自建客户+商机+草稿报价单（附件下载/预览仅 owner/admin）
    const tOrg = await call('POST', '/api/organizations', { token: testerToken, body: { name: `冒烟附件客户-${Date.now()}`, type: 'COMPANY' } })
    const tOpp = await call('POST', '/api/opportunities', { token: testerToken, body: { name: `冒烟附件商机-${Date.now()}`, organizationId: tOrg.json?.id } })
    const tQuote = await call('POST', '/api/quotations', {
      token: testerToken,
      body: { name: `冒烟附件单-${Date.now()}`, opportunityId: tOpp.json?.id, organizationId: tOrg.json?.id, totalAmount: 10,
        items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
    })
    verify('TESTER 创建附件宿主报价单 201', tQuote.status === 201, `实际 ${tQuote.status}`)
    const qid = tQuote.json?.id

    // multipart 上传（字段名 files）
    const fd = new FormData()
    fd.append('files', new Blob(['smoke attachment content'], { type: 'text/plain' }), `冒烟附件-${Date.now()}.txt`)
    let up = await fetch(`${BASE}/api/quotations/${qid}/files`, { method: 'POST', headers: { Authorization: `Bearer ${testerToken}` }, body: fd })
    let upJson = await up.json().catch(() => null)
    verify('上传 txt 附件 201', up.status === 201, `实际 ${up.status} ${JSON.stringify(upJson)}`)
    verify('上传响应含文件名', !!upJson?.files?.[0]?.fileName, JSON.stringify(upJson?.files?.[0]))
    const fileId = upJson?.files?.[0]?.id

    // 空文件列表 → 400
    const emptyFd = new FormData()
    const upEmpty = await fetch(`${BASE}/api/quotations/${qid}/files`, { method: 'POST', headers: { Authorization: `Bearer ${testerToken}` }, body: emptyFd })
    verify('未选文件上传返回 400', upEmpty.status === 400, `实际 ${upEmpty.status}`)

    // 非白名单扩展名被拒
    const badFd = new FormData()
    badFd.append('files', new Blob(['MZ'], { type: 'application/x-msdownload' }), `evil-${Date.now()}.exe`)
    const upBad = await fetch(`${BASE}/api/quotations/${qid}/files`, { method: 'POST', headers: { Authorization: `Bearer ${testerToken}` }, body: badFd })
    verify('非白名单扩展名(.exe)被拒绝', upBad.status === 400 || upBad.status === 500, `实际 ${upBad.status}`)

    // 列表可见
    const flist = await call('GET', `/api/quotations/${qid}/files`, { token: testerToken })
    verify('附件列表含已上传文件', (flist.json || []).some(f => f.id === fileId), JSON.stringify(flist.json?.map(f => f.id)))

    // owner 下载 200
    const dl = await fetch(`${BASE}/api/quotations/files/${fileId}/download`, { headers: { Authorization: `Bearer ${testerToken}` } })
    verify('owner 下载附件 200', dl.status === 200, `实际 ${dl.status}`)
    const dlText = await dl.text().catch(() => '')
    verify('下载内容与上传一致', dlText.includes('smoke attachment content'))

    // 非 owner 下载 → 403
    const dl2 = await fetch(`${BASE}/api/quotations/files/${fileId}/download`, { headers: { Authorization: `Bearer ${approverToken}` } })
    verify('非 owner 下载他人附件被拒 403', dl2.status === 403, `实际 ${dl2.status}`)

    // 删除 → 列表清空
    const del = await call('DELETE', `/api/quotations/${qid}/files/${fileId}`, { token: testerToken })
    verify('删除附件 200', del.status === 200, `实际 ${del.status}`)
    const flist2 = await call('GET', `/api/quotations/${qid}/files`, { token: testerToken })
    verify('删除后列表不再包含该文件', !(flist2.json || []).some(f => f.id === fileId))
  }

  // ════════════════ G11 报价单导入导出 ════════════════
  console.log('── G11 报价单导入导出 ──')
  {
    // 导出 CSV（ADMIN）：BOM + 列头
    const csvRes = await fetch(`${BASE}/api/quotations/export/csv`, { headers: { Authorization: `Bearer ${adminToken}` } })
    verify('导出 CSV 200', csvRes.status === 200, `实际 ${csvRes.status}`)
    verify('CSV Content-Type 正确', (csvRes.headers.get('content-type') || '').includes('text/csv'))
    // 注意：fetch 的 text() 会剥掉 BOM，必须从原始字节判断
    const csvBuf = new Uint8Array(await csvRes.arrayBuffer())
    verify('CSV 含 UTF-8 BOM', csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF, `前3字节: ${csvBuf[0]},${csvBuf[1]},${csvBuf[2]}`)
    const csvText = new TextDecoder('utf-8').decode(csvBuf)
    verify('CSV 列头完整', csvText.includes('报价单') && csvText.includes('报价总额') && csvText.includes('状态'))

    // 导出 Excel
    const xlsRes = await fetch(`${BASE}/api/quotations/export/excel`, { headers: { Authorization: `Bearer ${adminToken}` } })
    verify('导出 Excel 200', xlsRes.status === 200, `实际 ${xlsRes.status}`)
    verify('Excel MIME 正确', (xlsRes.headers.get('content-type') || '').includes('spreadsheetml'))

    // 无金额权限用户（TESTER）导出：金额列为空
    const tOrg = await call('POST', '/api/organizations', { token: testerToken, body: { name: `冒烟脱敏客户-${Date.now()}`, type: 'COMPANY' } })
    const tOpp = await call('POST', '/api/opportunities', { token: testerToken, body: { name: `冒烟脱敏商机-${Date.now()}`, organizationId: tOrg.json?.id } })
    const moneyName = `冒烟脱敏单${Date.now()}`
    await call('POST', '/api/quotations', {
      token: testerToken,
      body: { name: moneyName, opportunityId: tOpp.json?.id, organizationId: tOrg.json?.id, totalAmount: 100,
        items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 100, totalPrice: 100 }] }
    })
    const maskedRes = await fetch(`${BASE}/api/quotations/export/csv`, { headers: { Authorization: `Bearer ${testerToken}` } })
    const maskedCsv = await maskedRes.text()
    const maskedRow = maskedCsv.split(/\r?\n/).find(l => l.includes(moneyName)) || ''
    verify('无金额权限导出：金额列被脱敏为空', maskedRow.includes(`${moneyName}`) && !maskedRow.includes(',100,'), maskedRow.slice(0, 80))

    // 导入 CSV（ADMIN，显式带 opportunityId）
    const aOrg = await call('POST', '/api/organizations', { token: adminToken, body: { name: `冒烟导入客户-${Date.now()}`, type: 'COMPANY' } })
    const aOpp = await call('POST', '/api/opportunities', { token: adminToken, body: { name: `冒烟导入商机-${Date.now()}`, organizationId: aOrg.json?.id } })
    const impName = `冒烟导入单${Date.now()}`
    const impCsvBuf = Buffer.from(`﻿报价单,报价总额,状态\r\n${impName},100,DRAFT\r\n`, 'utf-8')
    const impFd = new FormData()
    impFd.append('file', new Blob([impCsvBuf], { type: 'text/csv' }), 'import.csv')
    const impRes = await fetch(`${BASE}/api/quotations/import`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: impFd })
    const impJson = await impRes.json().catch(() => null)
    verify('导入 CSV 成功', impRes.status === 200 && impJson?.success >= 1, `实际 ${impRes.status} ${JSON.stringify(impJson)}`)
    const after = await call('GET', `/api/quotations?search=${encodeURIComponent(impName)}`, { token: adminToken })
    verify('导入的报价单出现在列表', (after.json?.data || []).some(q => q.name === impName))

    // 导入：不支持的格式（.md 不在后端白名单，multer 层即被拒）
    const badFd2 = new FormData()
    badFd2.append('file', new Blob(['x'], { type: 'text/markdown' }), 'import.md')
    const impBad = await fetch(`${BASE}/api/quotations/import`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: badFd2 })
    verify('导入不支持格式被拒绝(400/500)', impBad.status === 400 || impBad.status === 500, `实际 ${impBad.status}`)
  }

  // ════════════════ G12 WebSocket 通知 ════════════════
  console.log('── G12 WebSocket 通知 ──')
  {
    const { default: WebSocket } = await import('ws')

    // 无 token 连接被拒（服务端先完成握手再验证，open 后才会收到 close(1008)）
    let noAuthGotMessage = false
    const noAuth = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:5000/ws`)
      ws.on('message', () => { noAuthGotMessage = true })
      ws.on('close', (code) => resolve(code))
      ws.on('open', () => { /* open 不代表通过认证，等服务端 close */ })
      ws.on('error', () => resolve(0))
      setTimeout(() => resolve(-1), 5000)
    })
    verify('无 token WS 连接被拒绝', [0, 1006, 1008].includes(noAuth) && !noAuthGotMessage, `close code ${noAuth}, 收到消息 ${noAuthGotMessage}`)

    // TESTER 建立 WS 连接 → CONNECTED
    const wsMessages = []
    const testerWs = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:5000/ws?token=${testerToken}`)
      ws.on('message', (d) => { wsMessages.push(JSON.parse(d.toString())); })
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
      setTimeout(() => reject(new Error('ws connect timeout')), 5000)
    })

    // ADMIN 创建任务指派 TESTER → 触发 TASK_ASSIGNED 通知 + WS 推送
    const taskTitle = `冒烟通知任务-${Date.now()}`
    const task = await call('POST', '/api/tasks', { token: adminToken, body: { title: taskTitle, assigneeIds: [testerUserId] } })
    verify('创建指派任务 201', task.status === 201, `实际 ${task.status} ${JSON.stringify(task.json)}`)

    // WS 收到推送
    const pushed = await new Promise((resolve) => {
      const started = Date.now()
      const check = () => {
        const hit = wsMessages.find(m => m.type === 'TASK_ASSIGNED')
        if (hit) return resolve(hit)
        if (Date.now() - started > 8000) return resolve(null)
        setTimeout(check, 200)
      }
      check()
    })
    verify('WS 实时收到 TASK_ASSIGNED 推送', !!pushed, JSON.stringify(wsMessages.slice(0, 3)))
    verify('推送内容含任务标题', !!pushed && String(pushed.title || pushed.message || '').includes(taskTitle), JSON.stringify(pushed))
    testerWs.close()

    // 通知列表 + 未读数
    const notes = await call('GET', '/api/notifications', { token: testerToken })
    verify('通知列表含新任务通知', (notes.json?.data || []).some(n => n.type === 'TASK_ASSIGNED' && (n.message || '').includes(taskTitle)))
    verify('未读数 ≥1', (notes.json?.unreadCount || 0) >= 1, `实际 ${notes.json?.unreadCount}`)

    // 全部已读
    const readAll = await call('PUT', '/api/notifications/read-all', { token: testerToken })
    verify('全部已读返回 200', readAll.status === 200, `实际 ${readAll.status}`)
    const notes2 = await call('GET', '/api/notifications', { token: testerToken })
    verify('已读后未读数归零', notes2.json?.unreadCount === 0, `实际 ${notes2.json?.unreadCount}`)

    // 他人通知不可操作
    const foreign = await call('PUT', `/api/notifications/999999/read`, { token: testerToken })
    verify('操作他人通知返回 403/404', foreign.status === 403 || foreign.status === 404, `实际 ${foreign.status}`)
  }

  // ════════════════ G13 财务模块（合同/发票/采购/付款）════════════════
  console.log('── G13 财务模块 ──')
  {
    // TESTER 无财务权限 → 全部 403（发票还缺权限点，非管理员一律 403）
    verify('TESTER 访问合同列表 403', (await call('GET', '/api/contracts', { token: testerToken })).status === 403)
    verify('TESTER 访问采购列表 403', (await call('GET', '/api/procurements', { token: testerToken })).status === 403)
    verify('TESTER 访问发票列表 403（权限点缺失）', (await call('GET', '/api/invoices', { token: testerToken })).status === 403)
    verify('TESTER 访问付款列表 403', (await call('GET', '/api/procurement-payments', { token: testerToken })).status === 403)

    // ── 合同状态机（APPROVER 建 + 审，ADMIN 突破防自审批）──
    const cOrg = await call('POST', '/api/organizations', { token: adminToken, body: { name: `冒烟合同客户-${Date.now()}`, type: 'COMPANY' } })
    const c1 = await call('POST', '/api/contracts', { token: approverToken, body: { name: `冒烟合同-${Date.now()}`, organizationId: cOrg.json?.id, amount: 10000, status: 'ACTIVE' } })
    verify('APPROVER 创建合同 201', c1.status === 201, `实际 ${c1.status} ${JSON.stringify(c1.json)}`)
    verify('合同创建直选状态被锁死（恒为 DRAFT）', c1.json?.status === 'DRAFT', `实际 ${c1.json?.status}`)
    const cid = c1.json?.id

    verify('合同创建必填校验 400', (await call('POST', '/api/contracts', { token: adminToken, body: { name: 'x' } })).status === 400)
    verify('合同非法流转 DRAFT→ACTIVE 400', (await call('POST', `/api/contracts/${cid}/approve`, { token: adminToken, body: { status: 'ACTIVE' } })).status === 400)
    verify('合同 DRAFT→PENDING 200', (await call('POST', `/api/contracts/${cid}/approve`, { token: approverToken, body: { status: 'PENDING' } })).status === 200)
    verify('合同提交后内容锁定（PUT 编辑 400）', (await call('PUT', `/api/contracts/${cid}`, { token: approverToken, body: { name: '篡改' } })).status === 400)
    verify('合同防自审批：APPROVER 审自己 403', (await call('POST', `/api/contracts/${cid}/approve`, { token: approverToken, body: { status: 'ACTIVE' } })).status === 403)
    const cAp = await call('POST', `/api/contracts/${cid}/approve`, { token: adminToken, body: { status: 'ACTIVE', remark: '冒烟-合同生效' } })
    verify('合同 PENDING→ACTIVE 由管理员完成 200', cAp.status === 200, `实际 ${cAp.status}`)
    verify('合同审批意见落库', cAp.json?.approvalNote === '冒烟-合同生效', JSON.stringify(cAp.json?.approvalNote))
    verify('合同审批人/时间落库', !!cAp.json?.approvedBy && !!cAp.json?.approvedAt)
    verify('合同 PUT 直改状态被拒 400', (await call('PUT', `/api/contracts/${cid}`, { token: adminToken, body: { status: 'CANCELLED' } })).status === 400)
    verify('非草稿合同删除被拒 400', (await call('DELETE', `/api/contracts/${cid}`, { token: adminToken })).status === 400)

    // ── 发票（无审批流，税额自动计算）──
    const invNo = `SMK-${Date.now()}`
    const inv = await call('POST', '/api/invoices', { token: adminToken, body: { invoiceNo: invNo, invoiceType: 'INCOME', amount: 100, taxRate: 13 } })
    verify('创建发票 201', inv.status === 201, `实际 ${inv.status} ${JSON.stringify(inv.json)}`)
    verify('税额 = 金额×税率', Number(inv.json?.taxAmount) === 13, `实际 ${inv.json?.taxAmount}`)
    verify('价税合计 = 金额+税额', Number(inv.json?.totalAmount) === 113, `实际 ${inv.json?.totalAmount}`)
    verify('发票必填校验 400', (await call('POST', '/api/invoices', { token: adminToken, body: { invoiceNo: 'x' } })).status === 400)
    const invCancel = await call('PUT', `/api/invoices/${inv.json?.id}`, { token: adminToken, body: { status: 'CANCELLED' } })
    verify('发票直接改状态作废 200（无审批流）', invCancel.status === 200 && invCancel.json?.status === 'CANCELLED', `实际 ${invCancel.status}`)

    // ── 采购状态机 + 防自审批（assignedTo=APPROVER 自己）──
    const pOrg = await call('POST', '/api/organizations', { token: adminToken, body: { name: `冒烟采购客户-${Date.now()}`, type: 'COMPANY' } })
    const pProj = await call('POST', '/api/projects', { token: adminToken, body: { name: `冒烟采购项目-${Date.now()}`, organizationId: pOrg.json?.id } })
    verify('前置项目创建 201', pProj.status === 201)
    const proc = await call('POST', '/api/procurements', { token: approverToken, body: { title: `冒烟采购-${Date.now()}`, vendor: '冒烟供应商', projectId: pProj.json?.id, assignedTo: testerUserId, status: 'RECEIVED' } })
    verify('APPROVER 创建采购单 201', proc.status === 201, `实际 ${proc.status} ${JSON.stringify(proc.json)}`)
    verify('采购创建直选状态被锁死（恒为 PLANNED）', proc.json?.status === 'PLANNED', `实际 ${proc.json?.status}`)
    const procId = proc.json?.id

    verify('采购必填校验 400', (await call('POST', '/api/procurements', { token: adminToken, body: { title: 'x' } })).status === 400)
    verify('采购非法流转 400', (await call('POST', `/api/procurements/${procId}/approve`, { token: adminToken, body: { status: 'RECEIVED' } })).status === 400)
    verify('TESTER 无采购审批权 403', (await call('POST', `/api/procurements/${procId}/approve`, { token: testerToken, body: { status: 'ORDERED' } })).status === 403)
    // 防自审批：assignedTo=TESTER 审 → 403（项目负责人 ADMIN 有豁免）
    const selfAppr = await call('POST', `/api/procurements/${procId}/approve`, { token: testerToken, body: { status: 'ORDERED' } })
    observe('采购防自审批（assignedTo 用户）', selfAppr.status === 403, '✅ 被拒绝（403）', `⚠️ 未按预期拒绝（${selfAppr.status}）`)
    const pAp = await call('POST', `/api/procurements/${procId}/approve`, { token: adminToken, body: { status: 'ORDERED', remark: '冒烟-已下单' } })
    verify('采购 PLANNED→ORDERED 200', pAp.status === 200, `实际 ${pAp.status}`)
    verify('采购流转备注落库', pAp.json?.approvalNote === '冒烟-已下单', JSON.stringify(pAp.json?.approvalNote))
    verify('采购 ORDERED→IN_TRANSIT 200', (await call('POST', `/api/procurements/${procId}/approve`, { token: adminToken, body: { status: 'IN_TRANSIT' } })).status === 200)
    verify('采购 IN_TRANSIT→RECEIVED 200', (await call('POST', `/api/procurements/${procId}/approve`, { token: adminToken, body: { status: 'RECEIVED' } })).status === 200)
    verify('采购终态再流转 400', (await call('POST', `/api/procurements/${procId}/approve`, { token: adminToken, body: { status: 'CANCELLED' } })).status === 400)

    // ── 采购付款（项目负责人或 admin；totalPaid 只计 CONFIRMED/RECEIVED）──
    const pay = await call('POST', '/api/procurement-payments', { token: adminToken, body: { procurementId: procId, amount: 500, paymentDate: new Date().toISOString().slice(0, 10), paymentType: 'ADVANCE', status: 'CONFIRMED' } })
    verify('创建付款记录 201', pay.status === 201, `实际 ${pay.status} ${JSON.stringify(pay.json)}`)
    const pays = await call('GET', `/api/procurement-payments?procurementId=${procId}`, { token: adminToken })
    verify('付款列表含记录且已确认金额计入汇总', (pays.json?.data || []).length >= 1 && Number(pays.json?.summary?.totalPaid) >= 500, JSON.stringify(pays.json?.summary))
    verify('TESTER 创建付款 403', (await call('POST', '/api/procurement-payments', { token: testerToken, body: { procurementId: procId, amount: 1, paymentDate: '2026-08-24' } })).status === 403)
  }

  // ════════════════ G14 日报审批 + 状态流转边界 ════════════════
  console.log('── G14 日报审批 + 状态流转边界 ──')
  {
    const today = new Date().toISOString().slice(0, 10)

    // ── 日报：TESTER 建+提交，APPROVER 审批/评分 ──
    const rep = await call('POST', '/api/daily-reports', { token: testerToken, body: { reportDate: today, entries: [{ content: '冒烟日报内容', hours: 2 }] } })
    verify('TESTER 创建日报 201', rep.status === 201, `实际 ${rep.status} ${JSON.stringify(rep.json)?.slice(0, 120)}`)
    const rid = rep.json?.id
    verify('日报初始 DRAFT', rep.json?.status === 'DRAFT')
    verify('日报工时汇总=条目之和', Number(rep.json?.hours) === 2, `实际 ${rep.json?.hours}`)

    verify('非本人提交他人日报 403', (await call('POST', `/api/daily-reports/${rid}/submit`, { token: adminToken })).status === 403)
    verify('本人提交日报 200', (await call('POST', `/api/daily-reports/${rid}/submit`, { token: testerToken })).status === 200)
    verify('重复提交日报 400', (await call('POST', `/api/daily-reports/${rid}/submit`, { token: testerToken })).status === 400)
    verify('TESTER 无日报审批权 403', (await call('POST', `/api/daily-reports/${rid}/approve`, { token: testerToken })).status === 403)
    // 日报可见性：ALL 范围角色看全部（管理员或 dataScope=ALL，如总经理/销售经理），普通用户只看自己
    const gmView = await call('GET', `/api/daily-reports?search=${encodeURIComponent('冒烟日报内容')}`, { token: approverToken })
    const gmRows = gmView.json?.data || gmView.json || []
    verify('ALL 范围角色（APPROVER）能看到他人日报', (Array.isArray(gmRows) ? gmRows : []).some(r => r.id === rid), `共 ${Array.isArray(gmRows) ? gmRows.length : -1} 条`)
    const selfView = await call('GET', `/api/daily-reports?search=${encodeURIComponent('冒烟采购')}`, { token: testerToken })
    const selfRows = selfView.json?.data || selfView.json || []
    verify('普通用户看不到他人的自动日报（仍只看自己）', (Array.isArray(selfRows) ? selfRows : []).every(r => r.userId === testerUserId), JSON.stringify(Array.isArray(selfRows) ? selfRows.length : -1))

    verify('APPROVER 批准他人日报 200', (await call('POST', `/api/daily-reports/${rid}/approve`, { token: approverToken })).status === 200)

    // 驳回链：另一单 TESTER 建已提交 → APPROVER 驳回（reason 落 issues）
    const rep2 = await call('POST', '/api/daily-reports', { token: testerToken, body: { reportDate: today, entries: [{ content: '冒烟日报内容2', hours: 1 }] } })
    await call('POST', `/api/daily-reports/${rep2.json?.id}/submit`, { token: testerToken })
    const rj2 = await call('POST', `/api/daily-reports/${rep2.json?.id}/reject`, { token: approverToken, body: { reason: '冒烟-日报驳回原因' } })
    verify('APPROVER 驳回他人日报 200', rj2.status === 200, `实际 ${rj2.status}`)
    const rj2Det = await call('GET', `/api/daily-reports/${rep2.json?.id}`, { token: testerToken })
    verify('驳回原因记入 issues', (rj2Det.json?.issues || '').includes('冒烟-日报驳回原因'), JSON.stringify(rj2Det.json?.issues))

    // 评分：APPROVER 给 TESTER 日报评分 5；给自己评分被拒
    const rate = await call('POST', `/api/daily-reports/${rid}/rate`, { token: approverToken, body: { rating: 5 } })
    verify('审批人评分 200', rate.status === 200, `实际 ${rate.status}`)
    const rateSelf = await call('POST', `/api/daily-reports/${rid}/rate`, { token: testerToken, body: { rating: 5 } })
    verify('给自己评分被拒 403', rateSelf.status === 403, `实际 ${rateSelf.status}`)
    const rateBad = await call('POST', `/api/daily-reports/${rid}/rate`, { token: approverToken, body: { rating: 9 } })
    verify('评分超界 400', rateBad.status === 400, `实际 ${rateBad.status}`)

    // ── 报价单 WON/LOST：前后端均无流转接口 ──
    const qOrg = await call('POST', '/api/organizations', { token: testerToken, body: { name: `冒烟WL客户-${Date.now()}`, type: 'COMPANY' } })
    const qOpp = await call('POST', '/api/opportunities', { token: testerToken, body: { name: `冒烟WL商机-${Date.now()}`, organizationId: qOrg.json?.id } })
    const wlq = await call('POST', '/api/quotations', {
      token: testerToken, body: { name: `冒烟WL单-${Date.now()}`, opportunityId: qOpp.json?.id, organizationId: qOrg.json?.id, totalAmount: 10,
        items: [{ name: 'x', quantity: 1, unit: '套', unitPrice: 10, totalPrice: 10 }] }
    })
    verify('WON 路由不存在(404)', (await call('POST', `/api/quotations/${wlq.json?.id}/win`, { token: adminToken })).status === 404)
    verify('LOST 路由不存在(404)', (await call('POST', `/api/quotations/${wlq.json?.id}/lose`, { token: adminToken })).status === 404)

    // ── 商机状态流转（有入口的对照）──
    const o1 = await call('POST', '/api/opportunities', { token: testerToken, body: { name: `冒烟流转商机-${Date.now()}`, organizationId: qOrg.json?.id } })
    verify('商机 OPEN→FOLLOWING 200', (await call('PUT', `/api/opportunities/${o1.json?.id}`, { token: testerToken, body: { status: 'FOLLOWING' } })).status === 200)
    verify('商机 FOLLOWING→WON 200', (await call('PUT', `/api/opportunities/${o1.json?.id}`, { token: testerToken, body: { status: 'WON' } })).status === 200)
    verify('商机终态 WON 再流转 400', (await call('PUT', `/api/opportunities/${o1.json?.id}`, { token: testerToken, body: { status: 'OPEN' } })).status === 400)
  }

  // ════════════════ G15 任务工作流（状态流转 + 双视角 + 通知）════════════════
  console.log('── G15 任务工作流 ──')
  {
    // 委派任务必填校验
    verify('任务标题/指派人必填 400', (await call('POST', '/api/tasks', { token: adminToken, body: { title: 'x' } })).status === 400)

    // ADMIN 委派 TESTER
    const t1 = await call('POST', '/api/tasks', { token: adminToken, body: { title: `冒烟任务-${Date.now()}`, description: '冒烟任务描述', assigneeIds: [testerUserId], priority: 'HIGH' } })
    verify('创建任务 201', t1.status === 201, `实际 ${t1.status} ${JSON.stringify(t1.json)?.slice(0, 100)}`)
    verify('任务初始 PENDING', t1.json?.status === 'PENDING')
    const tid = t1.json?.id
    const tTitle = t1.json?.title

    // 无关用户（APPROVER）不可操作
    verify('局外人更新任务 403', (await call('PUT', `/api/tasks/${tid}`, { token: approverToken, body: { status: 'IN_PROGRESS' } })).status === 403)

    // 视角列表：TESTER 在 assigned，ADMIN 在 delegated
    const testerTasks = await call('GET', '/api/tasks?type=assigned&pageSize=100', { token: testerToken })
    const adminDelegated = await call('GET', '/api/tasks?type=delegated&pageSize=100', { token: adminToken })
    const pickList = (j) => Array.isArray(j) ? j : (j?.data || [])
    verify('被指派人视角(assigned)含任务', pickList(testerTasks.json).some(t => t.id === tid), JSON.stringify(pickList(testerTasks.json).slice(0, 2).map(t => t.id)))
    verify('委派人视角(delegated)含任务', pickList(adminDelegated.json).some(t => t.id === tid))

    // ── 被指派人：开始 → 提交 ──
    verify('被指派人开始任务 200', (await call('PUT', `/api/tasks/${tid}`, { token: testerToken, body: { status: 'IN_PROGRESS' } })).status === 200)
    const sub = await call('PUT', `/api/tasks/${tid}`, { token: testerToken, body: { status: 'SUBMITTED', completionNote: '冒烟-已完成开发' } })
    verify('被指派人提交任务 200', sub.status === 200, `实际 ${sub.status}`)
    verify('提交后状态 SUBMITTED', sub.json?.status === 'SUBMITTED')

    // 提交通知委派人（TASK_SUBMITTED）
    const adminNotes = await call('GET', '/api/notifications', { token: adminToken })
    verify('委派人收到 TASK_SUBMITTED 通知', (adminNotes.json?.data || []).some(n => n.type === 'TASK_SUBMITTED' && (n.message || '').includes(tTitle)))

    // ── 委派人：确认完成 ──
    const done = await call('PUT', `/api/tasks/${tid}`, { token: adminToken, body: { status: 'COMPLETED' } })
    verify('委派人确认完成 200', done.status === 200, `实际 ${done.status}`)
    verify('完成后状态 COMPLETED', done.json?.status === 'COMPLETED')
    const testerNotes = await call('GET', '/api/notifications', { token: testerToken })
    verify('被指派人收到 TASK_COMPLETED 通知', (testerNotes.json?.data || []).some(n => n.type === 'TASK_COMPLETED' && (n.message || '').includes(tTitle)))

    // 流转自动生成任务记录（START/SUBMIT/COMPLETE）
    const records = await call('GET', `/api/tasks/${tid}/records`, { token: adminToken })
    const recTypes = (records.json || Array.isArray(records.json) ? records.json : records.json?.data || []).map(r => r.type)
    verify('流转自动生成任务记录', recTypes.includes('SUBMIT') && recTypes.includes('COMPLETE'), JSON.stringify(recTypes))

    // 历史任务视角含已完成任务
    const testerHist = await call('GET', '/api/tasks?type=historical&pageSize=100', { token: testerToken })
    verify('历史任务视角含已完成任务', pickList(testerHist.json).some(t => t.id === tid))

    // ── 驳回链（驳回 = 打回重做：状态回 IN_PROGRESS + 驳回理由）──
    const t2 = await call('POST', '/api/tasks', { token: adminToken, body: { title: `冒烟驳回任务-${Date.now()}`, assigneeIds: [testerUserId] } })
    const t2id = t2.json?.id
    await call('PUT', `/api/tasks/${t2id}`, { token: testerToken, body: { status: 'IN_PROGRESS' } })
    await call('PUT', `/api/tasks/${t2id}`, { token: testerToken, body: { status: 'SUBMITTED', completionNote: '冒烟-提交被驳回的' } })
    const rj = await call('PUT', `/api/tasks/${t2id}`, { token: adminToken, body: { status: 'IN_PROGRESS', rejectionReason: '冒烟-驳回理由不通过' } })
    verify('委派人驳回（打回进行中）200', rj.status === 200 && rj.json?.status === 'IN_PROGRESS', `实际 ${rj.status} ${rj.json?.status}`)
    verify('驳回理由落库', (rj.json?.rejectionReason || '').includes('冒烟-驳回理由'), JSON.stringify(rj.json?.rejectionReason))
    const testerNotes2 = await call('GET', '/api/notifications', { token: testerToken })
    verify('被指派人收到 TASK_REJECTED 通知', (testerNotes2.json?.data || []).some(n => n.type === 'TASK_REJECTED' && (n.message || '').includes(t2.json?.title)))

    // 委派人删除任务
    verify('委派人删除任务 200', (await call('DELETE', `/api/tasks/${t2id}`, { token: adminToken })).status === 200)
    verify('删除后详情 404', (await call('GET', `/api/tasks/${t2id}`, { token: adminToken })).status === 404)
  }

  // ════════════════ G16 费用报销审批（提交/批准/驳回/重新提交/支付）════════════════
  console.log('── G16 费用报销审批 ──')
  {
    const today = new Date().toISOString().slice(0, 10)
    // 前置：TESTER 自己的客户+项目（费用必填关联项目）
    const eOrg = await call('POST', '/api/organizations', { token: testerToken, body: { name: `冒烟报销客户-${Date.now()}`, type: 'COMPANY' } })
    const eProj = await call('POST', '/api/projects', { token: testerToken, body: { name: `冒烟报销项目-${Date.now()}`, organizationId: eOrg.json?.id } })
    verify('前置项目创建 201', eProj.status === 201)

    const mkExpense = (title) => call('POST', '/api/expenses', {
      token: testerToken,
      body: { title, projectId: eProj.json?.id, totalAmount: 100,
        items: [{ category: '办公用品', amount: 100, expenseDate: today, description: '冒烟明细' }] }
    })

    // ── 流程1：提交 → 批准 → 支付 ──
    const e1 = await mkExpense(`冒烟报销A-${Date.now()}`)
    verify('TESTER 创建报销 201（有 finance:expense:add）', e1.status === 201, `实际 ${e1.status} ${JSON.stringify(e1.json)?.slice(0, 100)}`)
    const eid = e1.json?.id

    verify('草稿直接审批 400', (await call('POST', `/api/expenses/${eid}/approve`, { token: approverToken, body: {} })).status === 400)
    verify('草稿直接支付 400', (await call('POST', `/api/expenses/${eid}/pay`, { token: approverToken })).status === 400)
    verify('非本人提交他人报销 403', (await call('POST', `/api/expenses/${eid}/submit`, { token: approverToken })).status === 403)
    verify('本人提交 200', (await call('POST', `/api/expenses/${eid}/submit`, { token: testerToken })).status === 200)
    verify('重复提交 400', (await call('POST', `/api/expenses/${eid}/submit`, { token: testerToken })).status === 400)
    verify('无审批权用户 approve 403', (await call('POST', `/api/expenses/${eid}/approve`, { token: testerToken, body: {} })).status === 403)
    const ap1 = await call('POST', `/api/expenses/${eid}/approve`, { token: approverToken, body: { remark: '冒烟-同意报销' } })
    verify('APPROVER 批准 200', ap1.status === 200, `实际 ${ap1.status}`)
    verify('批准后 APPROVED + 审批人落库', ap1.json?.status === 'APPROVED' && !!ap1.json?.approvedBy && !!ap1.json?.approvedAt, JSON.stringify({ s: ap1.json?.status, by: ap1.json?.approvedBy }))
    const pay1 = await call('POST', `/api/expenses/${eid}/pay`, { token: approverToken })
    verify('标记已支付 200 → PAID', pay1.status === 200 && pay1.json?.status === 'PAID', `实际 ${pay1.status} ${pay1.json?.status}`)
    verify('PAID 后再提交 400', (await call('POST', `/api/expenses/${eid}/submit`, { token: testerToken })).status === 400)

    // ── 流程2：驳回 → 重新提交 → 再批准 ──
    const e2 = await mkExpense(`冒烟报销B-${Date.now()}`)
    const e2id = e2.json?.id
    await call('POST', `/api/expenses/${e2id}/submit`, { token: testerToken })
    verify('驳回空原因 400', (await call('POST', `/api/expenses/${e2id}/reject`, { token: approverToken, body: { reason: '' } })).status === 400)
    verify('无审批权用户驳回 403', (await call('POST', `/api/expenses/${e2id}/reject`, { token: testerToken, body: { reason: 'x' } })).status === 403)
    const rj2 = await call('POST', `/api/expenses/${e2id}/reject`, { token: approverToken, body: { reason: '冒烟-发票不合规' } })
    verify('APPROVER 驳回 200 → REJECTED', rj2.status === 200 && rj2.json?.status === 'REJECTED', `实际 ${rj2.status} ${rj2.json?.status}`)
    verify('REJECTED 后直接支付 400', (await call('POST', `/api/expenses/${e2id}/pay`, { token: approverToken })).status === 400)
    verify('重新提交 200 → SUBMITTED', (await call('POST', `/api/expenses/${e2id}/resubmit`, { token: testerToken })).status === 200)
    verify('重新提交后再批准 200', (await call('POST', `/api/expenses/${e2id}/approve`, { token: approverToken, body: {} })).status === 200)

    // ── 编辑权限：无 add 权限的 APPROVER 不可编辑 ──
    verify('无 finance:expense:add 用户编辑 403', (await call('PUT', `/api/expenses/${e2id}`, { token: approverToken, body: { title: '篡改' } })).status === 403)
  }

  // ════════════════ G17 出差审批（提交/批准/驳回/重新提交/完成）════════════════
  console.log('── G17 出差审批 ──')
  {
    const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
    // 前置：TESTER 自己的客户+联系人
    const tOrg = await call('POST', '/api/organizations', { token: testerToken, body: { name: `冒烟出差客户-${Date.now()}`, type: 'COMPANY' } })
    const tContact = await call('POST', `/api/organizations/${tOrg.json?.id}/contacts`, { token: testerToken, body: { name: `冒烟出差联系人-${Date.now()}`, phone: '13700003333' } })

    const mkTrip = (title) => call('POST', '/api/business-trips', {
      token: testerToken,
      body: { title, destination: '上海', purpose: '冒烟出差目的', contactId: tContact.json?.id, startDate: day(1), endDate: day(3), days: 3 }
    })

    // ── 流程1：提交 → 批准 → 完成 ──
    const t1 = await mkTrip(`冒烟出差A-${Date.now()}`)
    verify('TESTER 创建出差 201', t1.status === 201, `实际 ${t1.status} ${JSON.stringify(t1.json)?.slice(0, 100)}`)
    const tid = t1.json?.id
    verify('出差必填校验 400', (await call('POST', '/api/business-trips', { token: testerToken, body: { title: 'x' } })).status === 400)
    verify('草稿直接审批 400', (await call('POST', `/api/business-trips/${tid}/approve`, { token: approverToken })).status === 400)
    verify('无 add 权限用户提交 403', (await call('POST', `/api/business-trips/${tid}/submit`, { token: approverToken })).status === 403)
    verify('本人提交 200', (await call('POST', `/api/business-trips/${tid}/submit`, { token: testerToken })).status === 200)
    verify('重复提交 400', (await call('POST', `/api/business-trips/${tid}/submit`, { token: testerToken })).status === 400)
    verify('无审批权用户 approve 403', (await call('POST', `/api/business-trips/${tid}/approve`, { token: testerToken })).status === 403)
    const ap1 = await call('POST', `/api/business-trips/${tid}/approve`, { token: approverToken })
    verify('APPROVER 批准 200 → APPROVED', ap1.status === 200 && ap1.json?.status === 'APPROVED', `实际 ${ap1.status} ${ap1.json?.status}`)
    const cp1 = await call('POST', `/api/business-trips/${tid}/complete`, { token: testerToken })
    verify('完成后 200 → COMPLETED', cp1.status === 200 && cp1.json?.status === 'COMPLETED', `实际 ${cp1.status} ${cp1.json?.status}`)
    verify('完成后不能再审批 400', (await call('POST', `/api/business-trips/${tid}/approve`, { token: approverToken })).status === 400)

    // ── 流程2：驳回（原因必填）→ 重新提交 ──
    const t2 = await mkTrip(`冒烟出差B-${Date.now()}`)
    const t2id = t2.json?.id
    await call('POST', `/api/business-trips/${t2id}/submit`, { token: testerToken })
    verify('驳回空原因 400', (await call('POST', `/api/business-trips/${t2id}/reject`, { token: approverToken, body: { reason: '' } })).status === 400)
    const rj2 = await call('POST', `/api/business-trips/${t2id}/reject`, { token: approverToken, body: { reason: '冒烟-行程冲突' } })
    verify('APPROVER 驳回 200 → REJECTED', rj2.status === 200 && rj2.json?.status === 'REJECTED', `实际 ${rj2.status} ${rj2.json?.status}`)
    verify('重新提交 200 → SUBMITTED', (await call('POST', `/api/business-trips/${t2id}/resubmit`, { token: testerToken })).status === 200)
  }

  summary()
}

function summary() {
  console.log('\n════════════════ 测试结果汇总 ════════════════')
  console.log(`硬断言: ${passed} 通过, ${failed} 失败`)
  if (failures.length > 0) {
    console.log('\n失败项:')
    failures.forEach(f => console.log(`  ❌ ${f.name}${f.detail ? ' — ' + f.detail : ''}`))
  }
  if (observations.length > 0) {
    console.log('\n行为观察（疑似问题/待确认）:')
    observations.forEach(o => console.log(`  🔎 ${o.name}: ${o.verdict}`))
  }
  console.log('══════════════════════════════════════════════')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('测试执行异常:', err)
  process.exit(1)
})
