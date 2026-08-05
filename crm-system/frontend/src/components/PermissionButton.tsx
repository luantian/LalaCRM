import React from 'react'
import { Button, Tooltip } from 'antd'
import type { ButtonProps } from 'antd'
import { usePermission } from '../hooks/usePermission'

interface PermissionButtonProps extends ButtonProps {
  /** 权限标识 */
  permission: string
  /** 无权限时是否显示提示 */
  showTooltip?: boolean
  /** 自定义提示文本 */
  tooltipText?: string
  /** 子元素 */
  children: React.ReactNode
}

/**
 * 权限按钮组件
 * 根据权限控制按钮的显示/隐藏，或禁用状态
 * 
 * @example
 * // 基本用法：无权限时隐藏按钮
 * <PermissionButton permission="crm:organization:add">
 *   新增
 * </PermissionButton>
 * 
 * @example
 * // 无权限时禁用按钮并显示提示
 * <PermissionButton 
 *   permission="crm:organization:delete"
 *   showTooltip
 *   tooltipText="您没有删除权限"
 * >
 *   删除
 * </PermissionButton>
 */
export const PermissionButton: React.FC<PermissionButtonProps> = ({
  permission,
  showTooltip = false,
  tooltipText = '您没有权限执行此操作',
  children,
  ...buttonProps
}) => {
  const { checkPermission } = usePermission()
  const hasPermission = checkPermission(permission)

  if (!hasPermission) {
    if (showTooltip) {
      return (
        <Tooltip title={tooltipText}>
          <Button {...buttonProps} disabled>
            {children}
          </Button>
        </Tooltip>
      )
    }
    return null
  }

  return <Button {...buttonProps}>{children}</Button>
}
