import { body, param, query, validationResult } from 'express-validator'
import { Request, Response, NextFunction } from 'express'

// 验证结果处理中间件
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: '输入验证失败',
      details: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : err.type,
        message: err.msg
      }))
    })
  }
  next()
}

/**
 * 排序字段白名单验证中间件
 * 防止排序字段注入攻击
 */
export function sortValidation(allowedFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sortBy = (req.query.sortBy as string) || 'createdAt'
    const sortOrder = (req.query.sortOrder as string) || 'desc'

    if (!allowedFields.includes(sortBy)) {
      return res.status(400).json({
        error: `不支持的排序字段: ${sortBy}，允许的字段: ${allowedFields.join(', ')}`
      })
    }

    if (!['asc', 'desc', 'ASC', 'DESC'].includes(sortOrder)) {
      return res.status(400).json({
        error: `排序方向必须是 asc 或 desc`
      })
    }

    next()
  }
}

/**
 * 安全解析整数，带 NaN 检查和范围限制
 */
export function safeParseInt(value: any, min: number = 1, fallback?: number): number | undefined {
  const num = parseInt(value)
  if (isNaN(num)) return fallback
  if (num < min) return fallback
  return num
}

/**
 * 分页参数钳制中间件
 * 确保 page >= 1, 1 <= pageSize <= 200
 */
export function clampPagination() {
  return (req: Request, res: Response, next: NextFunction) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 10))
    req.query.page = String(page)
    req.query.pageSize = String(pageSize)
    next()
  }
}

/**
 * 验证日期字符串有效性
 */
export function isValidDate(value: any): boolean {
  if (!value) return true // 可选字段
  const d = new Date(value)
  return !isNaN(d.getTime())
}

/**
 * 日期验证中间件
 * 检查指定 body 字段是否为有效日期
 */
export function dateValidation(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const field of fields) {
      const value = req.body[field]
      if (value && !isValidDate(value)) {
        return res.status(400).json({ error: `无效的日期格式: ${field}` })
      }
    }
    next()
  }
}

// 通用验证规则
export const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 1000 }).withMessage('每页数量必须是1-1000的整数')
]

export const idValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数')
]

// 用户验证规则
export const createUserValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('用户名长度必须是3-20个字符')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码长度至少6个字符'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('邮箱格式不正确'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('姓名长度必须是1-50个字符'),
  validate
]

// 客户验证规则
export const createCustomerValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('客户名称长度必须是1-100个字符'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('邮箱格式不正确'),
  body('phone')
    .optional()
    .trim()
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('手机号格式不正确'),
  validate
]

export const updateCustomerValidation = [
  ...idValidation,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('客户名称长度必须是1-100个字符'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('邮箱格式不正确'),
  body('phone')
    .optional()
    .trim()
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('手机号格式不正确'),
  validate
]

// 项目验证规则
export const createProjectValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('项目名称长度必须是1-200个字符'),
  body('customerId')
    .isInt({ min: 1 })
    .withMessage('客户ID必须是正整数'),
  validate
]

// 合同验证规则
export const createContractValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('合同名称长度必须是1-200个字符'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('合同金额必须是非负数'),
  body('projectId')
    .isInt({ min: 1 })
    .withMessage('项目ID必须是正整数'),
  validate
]
