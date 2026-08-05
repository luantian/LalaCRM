/**
 * 动态路由配置
 * 基于若依模式：从后端菜单数据动态生成前端路由
 */

import { lazy } from 'react'

// 路由级代码分割 — 所有页面组件懒加载
export const routeComponents: Record<string, React.LazyExoticComponent<any>> = {
  // 工作总览
  '/': lazy(() => import('../pages/Dashboard')),
  
  // 客户管理
  '/organizations': lazy(() => import('../pages/OrganizationList')),
  
  // 售前管理
  '/opportunities': lazy(() => import('../pages/OpportunityList')),
  '/opportunities/:id': lazy(() => import('../pages/OpportunityDetail')),
  
  // 报价单
  '/quotations': lazy(() => import('../pages/QuotationList')),
  '/quotations/:id': lazy(() => import('../pages/QuotationDetail')),
  
  // 项目管理
  '/projects': lazy(() => import('../pages/ProjectList')),
  '/projects/:id': lazy(() => import('../pages/ProjectDetail')),
  
  // 项目归档
  '/sales': lazy(() => import('../pages/SaleList')),
  
  // 费用报销
  '/expenses': lazy(() => import('../pages/ExpenseList')),
  '/expenses/:id': lazy(() => import('../pages/ExpenseDetail')),
  
  // 日常办公
  '/daily-reports': lazy(() => import('../pages/DailyReportList')),
  '/business-trips': lazy(() => import('../pages/BusinessTripList')),
  '/business-trips/:id': lazy(() => import('../pages/BusinessTripDetail')),
  '/check-ins': lazy(() => import('../pages/CheckInList')),
  
  // 系统管理
  '/users': lazy(() => import('../pages/UserManagement')),
  '/roles': lazy(() => import('../pages/RoleManagement')),
  '/menus': lazy(() => import('../pages/MenuManagement')),
  '/departments': lazy(() => import('../pages/DepartmentManagement')),
  '/dicts': lazy(() => import('../pages/DictManagement')),
  
  // 日志审计
  '/operation-logs': lazy(() => import('../pages/OperationLogList')),
  '/login-logs': lazy(() => import('../pages/LoginLogList')),
}

// 权限标识与路由路径的映射
export const routePermissionMap: Record<string, string> = {
  '/': 'portal:dashboard:view',
  '/organizations': 'crm:organization:list',
  '/opportunities': 'crm:opportunity:list',
  '/quotations': 'crm:quotation:list',
  '/projects': 'project:project:list',
  '/sales': 'project:archive:list',
  '/expenses': 'finance:expense:list',
  '/daily-reports': 'office:dailyreport:list',
  '/business-trips': 'office:trip:list',
  '/check-ins': 'office:checkin:list',
  '/users': 'system:user:list',
  '/roles': 'system:role:list',
  '/menus': 'system:menu:list',
  '/departments': 'system:dept:list',
  '/dicts': 'system:dict:list',
  '/operation-logs': 'monitor:operlog:list',
  '/login-logs': 'monitor:loginlog:list',
}

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
  // 管理员拥有所有路由权限
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      if (user.role === 'ADMIN' || user.roleKey === 'admin') {
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
