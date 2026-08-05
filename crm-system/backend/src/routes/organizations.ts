import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { body, param, query } from 'express-validator'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { validate } from '../middleware/validation'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import logger from '../utils/logger'
import { autoWriteOrganizationRecord } from '../utils/autoDailyReport'

const router = Router()
const prisma = new PrismaClient()

// ─── Validation rules ────────────────────────────────────────────────────────

const createOrgValidation = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('组织名称长度必须是1-200个字符'),
  body('type').isIn(['GROUP', 'COMPANY', 'BRANCH']).withMessage('类型必须是 GROUP/COMPANY/BRANCH'),
  body('parentId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('parentId必须是正整数'),
  body('address').optional().trim(),
  body('phone').optional().trim(),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('邮箱格式不正确'),
  body('taxNo').optional().trim(),
  body('website').optional().trim(),
  body('legalPerson').optional().trim(),
  body('registeredCapital').optional().trim(),
  body('description').optional().trim()
]

const updateOrgValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  body('name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('组织名称长度必须是1-200个字符'),
  body('type').optional().isIn(['GROUP', 'COMPANY', 'BRANCH']).withMessage('类型必须是 GROUP/COMPANY/BRANCH'),
  body('parentId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('parentId必须是正整数'),
  body('address').optional().trim(),
  body('phone').optional().trim(),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('邮箱格式不正确'),
  body('taxNo').optional().trim(),
  body('website').optional().trim(),
  body('legalPerson').optional().trim(),
  body('registeredCapital').optional().trim(),
  body('description').optional().trim(),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'PENDING']).withMessage('状态必须是 ACTIVE/INACTIVE/PENDING')
]

const createContactValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('联系人姓名长度必须是1-100个字符'),
  body('title').optional().trim(),
  body('department').optional().trim(),
  body('phone').optional().trim(),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('邮箱格式不正确'),
  body('wechat').optional().trim(),
  body('isPrimary').optional().isBoolean().withMessage('isPrimary必须是布尔值'),
  body('notes').optional().trim()
]

const updateContactValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  param('contactId').isInt({ min: 1 }).withMessage('contactId必须是正整数'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('联系人姓名长度必须是1-100个字符'),
  body('title').optional().trim(),
  body('department').optional().trim(),
  body('phone').optional().trim(),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('邮箱格式不正确'),
  body('wechat').optional().trim(),
  body('isPrimary').optional().isBoolean().withMessage('isPrimary必须是布尔值'),
  body('notes').optional().trim()
]

// ─── Helper: collect all descendant IDs (for circular check & cascade delete) ─

async function getDescendantIds(orgId: number): Promise<number[]> {
  const ids: number[] = []
  const children = await prisma.organization.findMany({
    where: { parentId: orgId, deletedAt: null },
    select: { id: true }
  })
  for (const child of children) {
    ids.push(child.id)
    const subIds = await getDescendantIds(child.id)
    ids.push(...subIds)
  }
  return ids
}

// ─── Helper: build tree recursively ──────────────────────────────────────────

interface OrgTreeNode {
  id: number
  name: string
  type: string
  parentId: number | null
  address: string | null
  phone: string | null
  email: string | null
  taxNo: string | null
  website: string | null
  legalPerson: string | null
  registeredCapital: string | null
  description: string | null
  status: string
  ownerId: number
  createdAt: Date
  updatedAt: Date
  children: OrgTreeNode[]
}

function buildTree(orgs: any[], parentId: number | null = null): OrgTreeNode[] {
  return orgs
    .filter(org => org.parentId === parentId)
    .map(org => ({
      ...org,
      children: buildTree(orgs, org.id)
    }))
}

// 获取用户的所有角色 ID
async function getUserRoleIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { select: { roleId: true } },
      roleRef: { select: { id: true } }
    }
  })
  if (!user) return []
  const ids: number[] = []
  if (user.roleRef?.id) ids.push(user.roleRef.id)
  user.userRoles?.forEach(ur => {
    if (ur.roleId) ids.push(ur.roleId)
  })
  return [...new Set(ids)]
}

// 判断当前用户是否有权查看联系方式（完全依赖 SystemConfig 配置）
async function canViewContactInfo(req: AuthRequest): Promise<boolean> {
  if (!req.user?.id) return false

  // 从 SystemConfig 读取允许查看联系方式的角色 ID
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'contact_info_viewable_roles' }
  })
  if (!config) return false

  const allowedRoleIds: number[] = JSON.parse(config.value)
  if (allowedRoleIds.length === 0) return false

  const userRoleIds = await getUserRoleIds(req.user.id)
  return userRoleIds.some(id => allowedRoleIds.includes(id))
}

// 脱敏电话号码：只显示后4位，其余用 * 代替
function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  if (phone.length <= 4) return phone
  return '***' + phone.slice(-4)
}

// 脱敏邮箱：保留首字母和域名，其余用 * 代替
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const atIdx = email.indexOf('@')
  if (atIdx < 0) return email
  const name = email.substring(0, atIdx)
  const domain = email.substring(atIdx)
  if (name.length <= 1) return name + domain
  return name[0] + '***' + domain
}

// 脱敏微信：保留首尾字符，中间用 * 代替
function maskWechat(wechat: string | null): string | null {
  if (!wechat) return null
  if (wechat.length <= 2) return wechat
  return wechat[0] + '*'.repeat(wechat.length - 2) + wechat[wechat.length - 1]
}

// 脱敏组织联系方式
function maskOrgContact(org: any): any {
  return {
    ...org,
    phone: maskPhone(org.phone),
    email: maskEmail(org.email),
    contacts: org.contacts
      ? org.contacts.map((c: any) => ({
          ...c,
          phone: maskPhone(c.phone),
          email: maskEmail(c.email),
          wechat: maskWechat(c.wechat)
        }))
      : org.contacts
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// 0. GET /simple - 精简客户列表（用于下拉选择，无需客户管理权限）
router.get(
  '/simple',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const organizations = await prisma.organization.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
      res.json(organizations)
    } catch (error) {
      logger.error('Get simple organizations error:', error)
      res.status(500).json({ error: '获取客户列表失败' })
    }
  }
)

// 1. GET / - List organizations (flat list with tree support)
router.get(
  '/',
  authenticateToken,
  checkPermission('crm:organization:list'),
  applyDataScope('ownerId'),
  async (req: AuthRequest, res: Response) => {
    try {
      const canView = await canViewContactInfo(req)
      const { parentId, type, search } = req.query
      const dataScopeWhere = (req as any).dataScopeWhere || {}

      const conditions: any[] = [{ deletedAt: null }]

      if (Object.keys(dataScopeWhere).length > 0) {
        conditions.push(dataScopeWhere)
      }
      if (parentId !== undefined) {
        conditions.push({
          parentId: parentId === 'null' ? null : Number(parentId)
        })
      }
      if (type && typeof type === 'string') {
        conditions.push({ type: type as any })
      }
      if (search && typeof search === 'string' && search.trim()) {
        conditions.push({
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } }
          ]
        })
      }

      const where = conditions.length === 1
        ? conditions[0]
        : { AND: conditions }

      const [data, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          include: {
            parent: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true } },
            _count: { select: { children: true, contacts: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.organization.count({ where })
      ])

      // 对组织列表的联系方式进行脱敏处理
      const maskedData = canView ? data : data.map(org => ({
        ...org,
        phone: maskPhone(org.phone),
        email: maskEmail(org.email)
      }))

      res.json({ data: maskedData, total })
    } catch (error) {
      logger.error('Get organizations error:', error)
      res.status(500).json({ error: '获取组织列表失败' })
    }
  }
)

// 2. GET /tree - Get full organization tree
router.get(
  '/tree',
  authenticateToken,
  checkPermission('crm:organization:list'),
  async (req: AuthRequest, res: Response) => {
    try {
      const canView = await canViewContactInfo(req)

      const orgs = await prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' }
      })

      // 对组织节点进行脱敏
      const maskedOrgs = canView ? orgs : orgs.map(org => ({
        ...org,
        phone: maskPhone(org.phone),
        email: maskEmail(org.email)
      }))

      const tree = buildTree(maskedOrgs, null)
      res.json({ tree })
    } catch (error) {
      logger.error('Get organization tree error:', error)
      res.status(500).json({ error: '获取组织树失败' })
    }
  }
)

// 2b-0. GET /contacts/simple - 精简联系人列表（用于下拉选择，无需联系人管理权限）
router.get(
  '/contacts/simple',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { orgId } = req.query
      const where: any = { deletedAt: null }
      if (orgId && typeof orgId === 'string') {
        where.organizationId = Number(orgId)
      }

      const contacts = await prisma.orgContact.findMany({
        where,
        select: {
          id: true,
          name: true,
          title: true,
          organizationId: true,
          organization: { select: { id: true, name: true } }
        },
        orderBy: { name: 'asc' }
      })

      const result = contacts.map(c => ({
        id: c.id,
        name: c.name,
        title: c.title,
        organizationId: c.organizationId,
        organizationName: c.organization?.name || ''
      }))

      res.json(result)
    } catch (error) {
      logger.error('Get simple contacts error:', error)
      res.status(500).json({ error: '获取联系人列表失败' })
    }
  }
)

// 2b. GET /contacts - Get all contacts across organizations (for client selector)
router.get(
  '/contacts',
  authenticateToken,
  checkPermission('crm:organization:contact:list'),
  async (req: AuthRequest, res: Response) => {
    try {
      const canView = await canViewContactInfo(req)
      
      const contacts = await prisma.orgContact.findMany({
        where: { deletedAt: null },
        include: {
          organization: { select: { id: true, name: true } }
        },
        orderBy: { name: 'asc' }
      })

      const result = contacts.map(c => ({
        id: c.id,
        name: c.name,
        title: c.title,
        phone: canView ? c.phone : maskPhone(c.phone),
        email: canView ? c.email : maskEmail(c.email),
        wechat: canView ? c.wechat : maskWechat(c.wechat),
        organizationId: c.organizationId,
        organizationName: c.organization?.name || ''
      }))

      res.json(result)
    } catch (error) {
      logger.error('Get all contacts error:', error)
      res.status(500).json({ error: '获取联系人列表失败' })
    }
  }
)

// 2c. GET /contacts/:id - Get single contact
router.get(
  '/contacts/:id',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string)
      const canView = await canViewContactInfo(req)
      
      const contact = await prisma.orgContact.findFirst({
        where: { id, deletedAt: null },
        include: { organization: { select: { id: true, name: true } } }
      })
      if (!contact) {
        return res.status(404).json({ error: '联系人不存在' })
      }
      res.json({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        phone: canView ? contact.phone : maskPhone(contact.phone),
        email: canView ? contact.email : maskEmail(contact.email),
        wechat: canView ? contact.wechat : maskWechat(contact.wechat),
        organizationId: contact.organizationId,
        organizationName: contact.organization?.name || ''
      })
    } catch (error) {
      logger.error('Get contact error:', error)
      res.status(500).json({ error: '获取联系人失败' })
    }
  }
)

// 3. GET /:id - Get organization detail
router.get(
  '/:id',
  authenticateToken,
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  validate,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const canView = await canViewContactInfo(req)

      const org = await prisma.organization.findFirst({
        where: { id, deletedAt: null },
        include: {
          parent: { select: { id: true, name: true } },
          children: {
            where: { deletedAt: null },
            select: { id: true, name: true }
          },
          contacts: {
            where: { deletedAt: null }
          },
          owner: { select: { id: true, name: true } }
        }
      })

      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      // 对联系方式进行脱敏处理
      const orgData = { ...org }
      if (!canView) {
        // 组织本身的 phone/email 脱敏
        orgData.phone = maskPhone(orgData.phone)
        orgData.email = maskEmail(orgData.email)
        // 联系人的 phone/email/wechat 脱敏
        if (orgData.contacts) {
          orgData.contacts = orgData.contacts.map(c => ({
            ...c,
            phone: maskPhone(c.phone),
            email: maskEmail(c.email),
            wechat: maskWechat(c.wechat)
          }))
        }
      }

      res.json(orgData)
    } catch (error) {
      logger.error('Get organization detail error:', error)
      res.status(500).json({ error: '获取组织详情失败' })
    }
  }
)

// 4. POST / - Create organization
router.post(
  '/',
  authenticateToken,
  checkPermission('crm:organization:add'),
  createOrgValidation,
  validate,
  logOperation('组织管理', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, type, parentId, address, phone, email,
        taxNo, website, legalPerson, registeredCapital, description
      } = req.body

      // If parentId provided, verify parent exists
      if (parentId) {
        const parent = await prisma.organization.findFirst({
          where: { id: parentId, deletedAt: null }
        })
        if (!parent) {
          return res.status(400).json({ error: '父组织不存在' })
        }
      }

      const org = await prisma.organization.create({
        data: {
          name,
          type,
          parentId: parentId || null,
          address,
          phone,
          email,
          taxNo,
          website,
          legalPerson,
          registeredCapital,
          description,
          ownerId: req.user!.id
        },
        include: {
          parent: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } }
        }
      })

      logger.info(`Organization created: ${org.name} by user ${req.user?.username}`)
      if (req.user?.id) {
        autoWriteOrganizationRecord(req.user.id, org.name, 'CREATE', org.id).catch(() => {})
      }
      res.status(201).json(org)
    } catch (error) {
      logger.error('Create organization error:', error)
      res.status(500).json({ error: '创建组织失败' })
    }
  }
)

// 5. PUT /:id - Update organization
router.put(
  '/:id',
  authenticateToken,
  checkPermission('crm:organization:edit'),
  updateOrgValidation,
  validate,
  logOperation('组织管理', 'UPDATE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const {
        name, type, parentId, address, phone, email,
        taxNo, website, legalPerson, registeredCapital, description, status
      } = req.body

      const org = await prisma.organization.findFirst({
        where: { id, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      // Circular reference check: prevent setting parentId to self or descendant
      if (parentId !== undefined && parentId !== null) {
        if (parentId === id) {
          return res.status(400).json({ error: '不能将父组织设置为自身' })
        }
        const descendantIds = await getDescendantIds(id)
        if (descendantIds.includes(parentId)) {
          return res.status(400).json({ error: '不能将父组织设置为下级组织，会产生循环引用' })
        }
        // Verify new parent exists
        const newParent = await prisma.organization.findFirst({
          where: { id: parentId, deletedAt: null }
        })
        if (!newParent) {
          return res.status(400).json({ error: '父组织不存在' })
        }
      }

      const updated = await prisma.organization.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(type !== undefined && { type }),
          ...(parentId !== undefined && { parentId: parentId || null }),
          ...(address !== undefined && { address }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(taxNo !== undefined && { taxNo }),
          ...(website !== undefined && { website }),
          ...(legalPerson !== undefined && { legalPerson }),
          ...(registeredCapital !== undefined && { registeredCapital }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status })
        },
        include: {
          parent: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } }
        }
      })

      logger.info(`Organization updated: ${updated.name} by user ${req.user?.username}`)
      if (req.user?.id) {
        autoWriteOrganizationRecord(req.user.id, updated.name, 'UPDATE', updated.id).catch(() => {})
      }
      res.json(updated)
    } catch (error) {
      logger.error('Update organization error:', error)
      res.status(500).json({ error: '更新组织失败' })
    }
  }
)

// 6. DELETE /:id - Soft delete organization (cascade to children & contacts)
router.delete(
  '/:id',
  authenticateToken,
  checkPermission('crm:organization:delete'),
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  validate,
  logOperation('组织管理', 'DELETE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      const org = await prisma.organization.findFirst({
        where: { id, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      // Collect all descendant IDs for cascade soft-delete
      const descendantIds = await getDescendantIds(id)
      const allIds = [id, ...descendantIds]

      // Soft-delete the organization and all its children
      await prisma.organization.updateMany({
        where: { id: { in: allIds } },
        data: { deletedAt: new Date() }
      })

      // Soft-delete contacts of the organization and all descendants
      await prisma.orgContact.updateMany({
        where: { organizationId: { in: allIds } },
        data: { deletedAt: new Date() }
      })

      logger.info(`Organization soft-deleted: ${org.name} (${allIds.length} total) by user ${req.user?.username}`)
      res.json({ message: '组织已删除' })
    } catch (error) {
      logger.error('Delete organization error:', error)
      res.status(500).json({ error: '删除组织失败' })
    }
  }
)

// 7. POST /:id/contacts - Add contact to organization
router.post(
  '/:id/contacts',
  authenticateToken,
  checkPermission('crm:organization:contact:add'),
  createContactValidation,
  validate,
  logOperation('组织管理', 'ADD_CONTACT'),
  async (req: AuthRequest, res: Response) => {
    try {
      const orgId = Number(req.params.id)
      const { name, title, department, phone, email, wechat, isPrimary, notes } = req.body

      // Verify organization exists
      const org = await prisma.organization.findFirst({
        where: { id: orgId, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      const contact = await prisma.orgContact.create({
        data: {
          organizationId: orgId,
          name,
          title,
          department,
          phone,
          email,
          wechat,
          isPrimary: isPrimary ?? false,
          notes
        }
      })

      logger.info(`Contact added to organization ${orgId} by user ${req.user?.username}`)
      
      // 根据配置脱敏返回数据
      const canView = await canViewContactInfo(req)
      const result = canView ? contact : {
        ...contact,
        phone: maskPhone(contact.phone),
        email: maskEmail(contact.email),
        wechat: maskWechat(contact.wechat)
      }
      res.status(201).json(result)
    } catch (error) {
      logger.error('Add contact error:', error)
      res.status(500).json({ error: '添加联系人失败' })
    }
  }
)

// 8. GET /:id/contacts - List contacts for organization
router.get(
  '/:id/contacts',
  authenticateToken,
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  validate,
  async (req: AuthRequest, res: Response) => {
    try {
      const orgId = Number(req.params.id)
      const canView = await canViewContactInfo(req)

      const org = await prisma.organization.findFirst({
        where: { id: orgId, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      const contacts = await prisma.orgContact.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
      })

      // 对联系方式进行脱敏处理
      const result = canView ? contacts : contacts.map(c => ({
        ...c,
        phone: maskPhone(c.phone),
        email: maskEmail(c.email),
        wechat: maskWechat(c.wechat)
      }))

      res.json(result)
    } catch (error) {
      logger.error('Get organization contacts error:', error)
      res.status(500).json({ error: '获取联系人列表失败' })
    }
  }
)

// 9. PUT /:id/contacts/:contactId - Update contact
router.put(
  '/:id/contacts/:contactId',
  authenticateToken,
  checkPermission('crm:organization:contact:edit'),
  updateContactValidation,
  validate,
  logOperation('组织管理', 'UPDATE_CONTACT'),
  async (req: AuthRequest, res: Response) => {
    try {
      const orgId = Number(req.params.id)
      const contactId = Number(req.params.contactId)
      const { name, title, department, phone, email, wechat, isPrimary, notes } = req.body

      // Verify organization exists
      const org = await prisma.organization.findFirst({
        where: { id: orgId, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      // Verify contact exists and belongs to this organization
      const existing = await prisma.orgContact.findFirst({
        where: { id: contactId, organizationId: orgId, deletedAt: null }
      })
      if (!existing) {
        return res.status(404).json({ error: '联系人不存在' })
      }

      const contact = await prisma.orgContact.update({
        where: { id: contactId },
        data: {
          ...(name !== undefined && { name }),
          ...(title !== undefined && { title }),
          ...(department !== undefined && { department }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(wechat !== undefined && { wechat }),
          ...(isPrimary !== undefined && { isPrimary }),
          ...(notes !== undefined && { notes })
        }
      })

      logger.info(`Contact ${contactId} updated in organization ${orgId} by user ${req.user?.username}`)
      // 返回数据时进行脱敏处理
      const canView = await canViewContactInfo(req)
      const result = canView ? contact : {
        ...contact,
        phone: maskPhone(contact.phone),
        email: maskEmail(contact.email),
        wechat: maskWechat(contact.wechat)
      }
      res.json(result)
    } catch (error) {
      logger.error('Update contact error:', error)
      res.status(500).json({ error: '更新联系人失败' })
    }
  }
)

// 10. DELETE /:id/contacts/:contactId - Soft delete contact
router.delete(
  '/:id/contacts/:contactId',
  authenticateToken,
  checkPermission('crm:organization:contact:delete'),
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数'),
  param('contactId').isInt({ min: 1 }).withMessage('contactId必须是正整数'),
  validate,
  logOperation('组织管理', 'DELETE_CONTACT'),
  async (req: AuthRequest, res: Response) => {
    try {
      const orgId = Number(req.params.id)
      const contactId = Number(req.params.contactId)

      // Verify organization exists
      const org = await prisma.organization.findFirst({
        where: { id: orgId, deletedAt: null }
      })
      if (!org) {
        return res.status(404).json({ error: '组织不存在' })
      }

      // Verify contact exists and belongs to this organization
      const existing = await prisma.orgContact.findFirst({
        where: { id: contactId, organizationId: orgId, deletedAt: null }
      })
      if (!existing) {
        return res.status(404).json({ error: '联系人不存在' })
      }

      await prisma.orgContact.update({
        where: { id: contactId },
        data: { deletedAt: new Date() }
      })

      logger.info(`Contact ${contactId} deleted from organization ${orgId} by user ${req.user?.username}`)
      res.json({ message: '联系人已删除' })
    } catch (error) {
      logger.error('Delete contact error:', error)
      res.status(500).json({ error: '删除联系人失败' })
    }
  }
)

export default router
