import { useState, useCallback, useEffect } from 'react'

/**
 * 从 localStorage 读取权限列表
 */
function readPermissions(): string[] {
  try {
    const userStr = localStorage.getItem('user')
    if (!userStr) return []
    const user = JSON.parse(userStr)
    return user.permissions || []
  } catch {
    return []
  }
}

/**
 * 权限检查 Hook
 * 提供权限判断方法，用于组件中控制按钮/元素的显示
 *
 * 使用 useState + storage event 监听，确保切换账号后权限立即更新
 */
export const usePermission = () => {
  const [permissions, setPermissions] = useState<string[]>(readPermissions)

  // 监听 storage 事件（跨标签页同步）和自定义事件（同标签页同步）
  useEffect(() => {
    const sync = () => setPermissions(readPermissions())
    window.addEventListener('storage', sync)
    window.addEventListener('user-permissions-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('user-permissions-changed', sync)
    }
  }, [])

  /**
   * 检查是否有指定权限
   * @param perm 权限标识，如 'crm:organization:add'
   * @returns 是否有权限
   */
  const checkPermission = useCallback((perm: string): boolean => {
    if (!perm) return true
    if (permissions.includes('*')) return true
    return permissions.includes(perm)
  }, [permissions])

  /**
   * 检查是否有任意一个权限
   * @param perms 权限标识数组
   * @returns 是否有任意一个权限
   */
  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    if (!perms || perms.length === 0) return true
    if (permissions.includes('*')) return true
    return perms.some(perm => permissions.includes(perm))
  }, [permissions])

  /**
   * 检查是否同时拥有所有权限
   * @param perms 权限标识数组
   * @returns 是否拥有所有权限
   */
  const hasAllPermissions = useCallback((perms: string[]): boolean => {
    if (!perms || perms.length === 0) return true
    if (permissions.includes('*')) return true
    return perms.every(perm => permissions.includes(perm))
  }, [permissions])

  return {
    permissions,
    checkPermission,
    hasAnyPermission,
    hasAllPermissions,
  }
}
