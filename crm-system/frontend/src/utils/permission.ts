/**
 * 权限工具函数
 * 基于若依模式的前端权限控制
 */

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
    
    // 管理员拥有所有权限
    if (user.role === 'ADMIN' || user.roleKey === 'admin') {
      return true
    }

    // 检查权限列表
    const permissions: string[] = user.permissions || []
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
 * @returns boolean
 */
export const isAdmin = (): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false

  try {
    const user = JSON.parse(userStr)
    return user.role === 'ADMIN' || user.roleKey === 'admin'
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
