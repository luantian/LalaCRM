/**
 * 权限工具函数
 * 基于若依模式的前端权限控制
 * 
 * 注意：此文件为纯函数版（非Hook），供无法使用Hook的场景调用。
 * 管理员判断统一为：permissions 含 '*' 或 role/roleKey 为 ADMIN（两者取并集）
 */

import { ROLE_ADMIN } from '../constants'

/**
 * 检查用户是否拥有指定权限
 * @param permission 权限标识（三段式），如 'office:dailyreport:list'
 * @returns boolean
 */
export const checkPermission = (permission: string): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  try {
    const user = JSON.parse(userStr)
    
    // 检查权限列表（管理员在 permissions 中以 '*' 表示）
    const permissions: string[] = user.permissions || []
    if (permissions.includes('*')) return true

    // 兼容旧逻辑：role/roleKey 为 ADMIN 也视为有全部权限
    if (user.role === ROLE_ADMIN || user.roleKey === ROLE_ADMIN) {
      return true
    }

    return permissions.includes(permission)
  } catch (error) {
    console.error('权限检查失败:', error)
    return false
  }
}

/**
 * 检查用户是否拥有任一权限
 * @param permissions 权限标识数组
 * @returns boolean
 */
export const checkAnyPermission = (permissions: string[]): boolean => {
  if (!permissions || permissions.length === 0) return true
  return permissions.some(perm => checkPermission(perm))
}

/**
 * 检查用户是否拥有所有权限
 * @param permissions 权限标识数组
 * @returns boolean
 */
export const checkAllPermissions = (permissions: string[]): boolean => {
  if (!permissions || permissions.length === 0) return true
  return permissions.every(perm => checkPermission(perm))
}

/**
 * 检查用户是否是管理员
 * 统一逻辑：permissions 含 '*' 或 role/roleKey 为 ADMIN
 * @returns boolean
 */
export const isAdmin = (): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  try {
    const user = JSON.parse(userStr)
    if (user.permissions && user.permissions.includes('*')) return true
    return user.role === ROLE_ADMIN || user.roleKey === ROLE_ADMIN
  } catch (error) {
    console.error('管理员检查失败:', error)
    return false
  }
}

/**
 * 检查用户是否拥有指定角色
 * @param roleKey 角色标识
 * @returns boolean
 */
export const hasRole = (roleKey: string): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  try {
    const user = JSON.parse(userStr)
    
    // 检查角色列表（多角色支持）
    const roles: string[] = user.roles || []
    return roles.includes(roleKey)
  } catch (error) {
    console.error('角色检查失败:', error)
    return false
  }
}

/**
 * 检查用户是否拥有任一角色
 * @param roleKeys 角色标识数组
 * @returns boolean
 */
export const hasAnyRole = (roleKeys: string[]): boolean => {
  if (!roleKeys || roleKeys.length === 0) return true
  return roleKeys.some(role => hasRole(role))
}
