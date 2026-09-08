/**
 * 动态路由配置
 * 基于若依模式：从后端菜单数据动态生成前端路由
 */

import { lazy } from 'react'
import { ROLE_ADMIN } from '../constants'

// 发版后旧 hash chunk 404 / 网络闪断会让懒加载抛错且无 ErrorBoundary 兜底，整树白屏。
// 失败时整页刷新一次以换取最新 index.html 的 chunk 引用；
// 60 秒窗口内只自动刷一次，防止资源持续不可用时刷新死循环。
const CHUNK_RELOAD_KEY = 'chunk_reload_ts'
const CHUNK_RELOAD_WINDOW_MS = 60_000

function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      let last = 0
      try {
        last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
      } catch { /* 隐私模式等场景 sessionStorage 不可用，跳过防抖直接抛 */ }
      if (Date.now() - last > CHUNK_RELOAD_WINDOW_MS) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())) } catch { /* 同上 */ }
        window.location.reload()
      }
      throw err
    })
  )
}

// 路由级代码分割 — 所有页面组件懒加载
export const routeComponents: Record<string, React.LazyExoticComponent<any>> = {
  // 工作总览
  '/': lazyWithRetry(() => import('../pages/Dashboard')),
  
  // 客户管理
  '/organizations': lazyWithRetry(() => import('../pages/OrganizationList')),
  
  // 售前管理
  '/opportunities': lazyWithRetry(() => import('../pages/OpportunityList')),
  '/opportunities/:id': lazyWithRetry(() => import('../pages/OpportunityDetail')),
  
  // 报价单
  '/quotations': lazyWithRetry(() => import('../pages/QuotationList')),
  '/quotations/:id': lazyWithRetry(() => import('../pages/QuotationDetail')),
  
  // 项目管理
  '/projects': lazyWithRetry(() => import('../pages/ProjectList')),
  '/projects/archived': lazyWithRetry(() => import('../pages/ProjectArchive')),
  '/projects/:id': lazyWithRetry(() => import('../pages/ProjectDetail')),
  '/sales': lazyWithRetry(() => import('../pages/ProjectArchive')),
  
  // 费用报销
  '/expenses': lazyWithRetry(() => import('../pages/ExpenseList')),
  '/expenses/:id': lazyWithRetry(() => import('../pages/ExpenseDetail')),
  
  // 日常办公
  '/daily-reports': lazyWithRetry(() => import('../pages/DailyReportList')),
  '/business-trips': lazyWithRetry(() => import('../pages/BusinessTripList')),
  '/business-trips/:id': lazyWithRetry(() => import('../pages/BusinessTripDetail')),
  '/check-ins': lazyWithRetry(() => import('../pages/CheckInList')),
  '/attendance-stats': lazyWithRetry(() => import('../pages/AttendanceStats')),

  // 系统管理
  '/users': lazyWithRetry(() => import('../pages/UserManagement')),
  '/roles': lazyWithRetry(() => import('../pages/RoleManagement')),
  '/menus': lazyWithRetry(() => import('../pages/MenuManagement')),
  '/departments': lazyWithRetry(() => import('../pages/DepartmentManagement')),
  '/dicts': lazyWithRetry(() => import('../pages/DictManagement')),
  '/database-backup': lazyWithRetry(() => import('../pages/DatabaseBackup')),
  '/settings': lazyWithRetry(() => import('../pages/SystemSettings')),
  
  // 日志审计
  '/operation-logs': lazyWithRetry(() => import('../pages/OperationLogList')),
  '/login-logs': lazyWithRetry(() => import('../pages/LoginLogList')),
}

// 权限标识与路由路径的映射
// 注意：此 map 已废弃（死代码），canAccessRoute 走菜单 path 匹配，不读此 map。
// 如需维护权限标识，请以后端 routes/*.ts 的 checkPermission(...) 和数据库 MenuItem.perm 为准。
// export const routePermissionMap: Record<string, string> = { ... }

/**
 * 从 localStorage 获取用户可见的路由
 */
export function getVisibleRoutes(): string[] {
  const menusStr = localStorage.getItem('menus')
  if (!menusStr) return []
  
  try {
    const menus = JSON.parse(menusStr)
    const visiblePaths: string[] = []
    
    // 遍历菜单树，提取所有可见的路由路径
    const extractPaths = (menuList: any[]) => {
      for (const menu of menuList) {
        if (menu.path && menu.isVisible !== false && menu.menuType !== 'BUTTON') {
          visiblePaths.push(menu.path)
        }
        if (menu.children && menu.children.length > 0) {
          extractPaths(menu.children)
        }
      }
    }
    
    extractPaths(menus)
    return visiblePaths
  } catch (error) {
    console.error('解析菜单数据失败:', error)
    return []
  }
}

/**
 * 检查用户是否有权访问指定路由
 */
export function canAccessRoute(path: string): boolean {
  // 管理员拥有所有路由权限（统一逻辑：permissions 含 '*' 或 role/roleKey 为 ADMIN）
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      if (user.permissions && user.permissions.includes('*')) return true
      if (user.role === ROLE_ADMIN || user.roleKey === ROLE_ADMIN) {
        return true
      }
    } catch (error) {
      console.error('解析用户数据失败:', error)
    }
  }
  
  // 检查路由是否在可见列表中
  const visibleRoutes = getVisibleRoutes()
  return visibleRoutes.includes(path)
}
