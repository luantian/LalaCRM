import React from 'react'
import { usePermission } from '../hooks/usePermission'

interface HasPermissionProps {
  /** 权限标识，如 'crm:organization:add' */
  perm: string | string[]
  /** 权限检查模式：any=任意一个权限即可，all=需要所有权限 */
  mode?: 'any' | 'all'
  /** 有权限时显示的内容 */
  children: React.ReactNode
  /** 无权限时显示的内容（可选） */
  fallback?: React.ReactNode
}

/**
 * 权限包装组件
 * 根据用户权限控制子元素的显示/隐藏
 * 
 * @example
 * // 单个权限检查
 * <HasPermission perm="crm:organization:add">
 *   <Button>新增</Button>
 * </HasPermission>
 * 
 * @example
 * // 多个权限检查（任意一个）
 * <HasPermission perm={['crm:organization:add', 'crm:organization:edit']} mode="any">
 *   <Button>操作</Button>
 * </HasPermission>
 * 
 * @example
 * // 多个权限检查（全部需要）
 * <HasPermission perm={['crm:organization:add', 'crm:organization:edit']} mode="all">
 *   <Button>操作</Button>
 * </HasPermission>
 * 
 * @example
 * // 无权限时显示替代内容
 * <HasPermission perm="crm:organization:add" fallback={<span>无权限</span>}>
 *   <Button>新增</Button>
 * </HasPermission>
 */
export const HasPermission: React.FC<HasPermissionProps> = ({
  perm,
  mode = 'any',
  children,
  fallback = null,
}) => {
  const { checkPermission, hasAnyPermission, hasAllPermissions } = usePermission()

  const hasPermission = React.useMemo(() => {
    if (Array.isArray(perm)) {
      return mode === 'all' 
        ? hasAllPermissions(perm)
        : hasAnyPermission(perm)
    }
    return checkPermission(perm)
  }, [perm, mode, checkPermission, hasAnyPermission, hasAllPermissions])

  if (hasPermission) {
    return <>{children}</>
  }

  return <>{fallback}</>
}
