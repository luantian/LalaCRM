import { Navigate } from 'react-router-dom'
import { canAccessRoute } from '../utils/routeConfig'

interface PermissionRouteProps {
  path: string
  children: React.ReactElement
}

/**
 * 权限路由守卫组件
 * 检查用户是否有权限访问指定路由
 */
export function PermissionRoute({ path, children }: PermissionRouteProps) {
  const hasPermission = canAccessRoute(path)
  
  if (!hasPermission) {
    // 无权限，重定向到首页
    return <Navigate to="/" replace />
  }
  
  return children
}
