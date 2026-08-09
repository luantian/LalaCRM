import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 检查用户是否有查看项目金额的权限
 */
export async function hasAmountPermission(userId: number): Promise<boolean> {
  try {
    // 获取用户角色
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true }
    })

    const userRoleIds = userRoles.map(ur => ur.roleId)

    // 获取配置的可查看角色
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'project_amount_viewable_roles' }
    })

    const allowedRoleIds: number[] = config ? JSON.parse(config.value) : []

    // 管理员默认可查看
    if (userRoleIds.includes(1)) return true

    // 检查用户角色是否在允许列表中
    return userRoleIds.some(roleId => allowedRoleIds.includes(roleId))
  } catch (error) {
    console.error('Check amount permission error:', error)
    return false
  }
}

/**
 * 过滤项目数据的金额字段
 */
export function filterProjectAmount(project: any): any {
  return {
    ...project,
    budget: null,
    actualCost: null,
    contractAmount: null,
    paymentAmount: null,
    paidAmount: null,
    unpaidAmount: null,
  }
}

/**
 * 过滤售前数据的金额字段
 */
export function filterOpportunityAmount(opportunity: any): any {
  return {
    ...opportunity,
    estimatedAmount: null,
    contractAmount: null,
  }
}

/**
 * 过滤报价单数据的金额字段
 */
export function filterQuotationAmount(quotation: any): any {
  return {
    ...quotation,
    totalAmount: null,
    taxAmount: null,
    finalAmount: null,
  }
}

/**
 * 过滤合同数据的金额字段
 */
export function filterContractAmount(contract: any): any {
  return {
    ...contract,
    amount: null,
  }
}
