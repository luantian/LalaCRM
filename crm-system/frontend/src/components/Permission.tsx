import React from 'react'
import { checkPermission, checkAnyPermission } from '../utils/permission'

/**
 * 权限组件属性
 */
interface PermissionProps {
  /** 单个权限标识 */
  permission?: string
  /** 多个权限标识（满足任一即可） */
  permissions?: string[]
  /** 子元素 */
  children: React.ReactNode
  /** 无权限时的备选渲染 */
  fallback?: React.ReactNode
}

/**
 * 权限控制组件
 * 
 * 使用示例：
 * ```tsx
 * // 单个权限
 * <HasPermission permission="office:dailyreport:add">
 *   <Button>新增日报</Button>
 * </HasPermission>
 * 
 * // 多个权限（满足任一）
 * <HasPermission permissions={['office:dailyreport:add', 'office:dailyreport:edit']}>
 *   <Button>操作</Button>
 * </HasPermission>
 * 
 * // 带备选渲染
 * <HasPermission permission="system:user:delete" fallback={<span>无权限</span>}>
 *   <Button>删除</Button>
 * </HasPermission>
 * ```
 */
export const HasPermission: React.FC<PermissionProps> = ({
  permission,
  permissions,
  children,
  fallback = null
}) => {
  // 检查权限
  const hasPermission = permission 
    ? checkPermission(permission)
    : permissions 
      ? checkAnyPermission(permissions)
      : false

  if (!hasPermission) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * 按钮权限组件（简化版）
 */
interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  permission?: string
  permissions?: string[]
}

export const PermissionButton: React.FC<PermissionButtonProps> = ({
  permission,
  permissions,
  children,
  ...props
}) => {
  const hasPermission = permission 
    ? checkPermission(permission)
    : permissions 
      ? checkAnyPermission(permissions)
      : false

  if (!hasPermission) {
    return null
  }

  return <button {...props}>{children}</button>
}
