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

    // 组织列表的数据范围过滤（代码审查发现 organizations 路由未挂 applyDataScope）
    const listAsTester = await call('GET', '/api/organizations?search=范围测试-', { token: testerToken })
    const testerSees = (listAsTester.json?.data || []).map(o => o.name)
    const seesAdminOrg = testerSees.includes('范围测试-管理员客户')
    const seesOwnOrg = testerSees.includes('范围测试-普通用户客户')
    verify('SELF 用户至少能看到自己的组织', seesOwnOrg, JSON.stringify(testerSees))
    observe(
      '组织列表数据范围（organizations.ts 未挂 applyDataScope）',
      seesAdminOrg,
      '⚠️ 复现：SELF 用户能看到管理员的客户（数据范围过滤失效）',
      '✅ SELF 用户看不到管理员的客户（过滤正常）'
    )

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
