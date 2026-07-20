import { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger'

/**
 * UTF-8 编码保护中间件
 * 检测并清理请求体中的非 UTF-8 字符（防止 GBK 等编码的中文被错误存储）
 */

// 检测字符串中是否包含 UTF-8 替换字符 (U+FFFD) 或其他异常字符
function containsInvalidUtf8(str: string): boolean {
  // U+FFFD 是 UTF-8 替换字符，表示原始字节不是有效 UTF-8
  return str.includes('�')
}

// 递归清理对象中的所有字符串字段
function sanitizeObject(obj: any): { cleaned: any; hadIssues: boolean } {
  if (obj === null || obj === undefined) return { cleaned: obj, hadIssues: false }
  if (typeof obj === 'string') {
    const hadIssues = containsInvalidUtf8(obj)
    // 移除替换字符
    const cleaned = obj.replace(/�/g, '')
    return { cleaned, hadIssues }
  }
  if (Array.isArray(obj)) {
    let hadIssues = false
    const cleaned = obj.map(item => {
      const result = sanitizeObject(item)
      if (result.hadIssues) hadIssues = true
      return result.cleaned
    })
    return { cleaned, hadIssues }
  }
  if (typeof obj === 'object') {
    let hadIssues = false
    const cleaned: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const result = sanitizeObject(value)
      if (result.hadIssues) hadIssues = true
      cleaned[key] = result.cleaned
    }
    return { cleaned, hadIssues }
  }
  return { cleaned: obj, hadIssues: false }
}

export function utf8Sanitizer(req: Request, res: Response, next: NextFunction) {
  // 只检查有 body 的请求
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    const { cleaned, hadIssues } = sanitizeObject(req.body)
    if (hadIssues) {
      logger.warn(`UTF-8 encoding issue detected in ${req.method} ${req.originalUrl} from IP: ${req.ip}. Request contained invalid UTF-8 characters (likely GBK encoding from terminal).`)
      req.body = cleaned
    }
  }
  next()
}
