import { useMemo } from 'react'

/**
 * 权限检查 Hook
 * 提供权限判断方法，用于组件中控制按钮/元素的显示
 */
export const usePermission = () => {
  const permissions = useMemo(() => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) return []
      const user = JSON.parse(userStr)
      return user.permissions || []
    } catch {
      return []
    }
  }, [])

  /**
   * 检查是否有指定权限
   * @param perm 权限标识，如 'crm:organization:add'
   * @returns 是否有权限
   */
  const checkPermission = (perm: string): boolean => {
    if (!perm) return true
    if (permissions.includes('*')) return true
    return permissions.includes(perm)
  }

  /**
   * 检查是否有任意一个权限
   * @param perms 权限标识数组
   * @returns 是否有任意一个权限
   */
  const hasAnyPermission = (perms: string[]): boolean => {
    if (!perms || perms.length === 0) return true
    if (permissions.includes('*')) return true
    return perms.some(perm => permissions.includes(perm))
  }

  /**
   * 检查是否同时拥有所有权限
   * @param perms 权限标识数组
   * @returns 是否拥有所有权限
   */
  const hasAllPermissions = (perms: string[]): boolean => {
    if (!perms || perms.length === 0) return true
    if (permissions.includes('*')) return true
    return perms.every(perm => permissions.includes(perm))
  }

  return {
    permissions,
    checkPermission,
    hasAnyPermission,
    hasAllPermissions,
  }
}
