import { Suspense, useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Login from './pages/Login'
import Layout from './components/Layout'
import { routeComponents } from './utils/routeConfig'
import { ROLE_ADMIN } from './constants'
import './App.css'

// 加载占位组件
const PageLoading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" />
  </div>
)

// 路由认证守卫：同步检查 token，未登录则重定向
function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  const [allowedRoutes, setAllowedRoutes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // 构建允许的路由
  const buildRoutes = useCallback(() => {
    const routes = new Set<string>(['/login']) // 登录页始终允许
    
    // 检查是否是管理员
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user.role === ROLE_ADMIN || user.roleKey === ROLE_ADMIN) {
          // 管理员：所有注册的路由都允许
          Object.keys(routeComponents).forEach(path => routes.add(path))
          setAllowedRoutes(routes)
          setLoading(false)
          return
        }
      } catch {}
    }

    // 普通用户：从菜单数据提取允许的路由
    const menusStr = localStorage.getItem('menus')
    if (menusStr) {
      try {
        const menus = JSON.parse(menusStr)
        const extractPaths = (items: any[]) => {
          for (const item of items) {
            if (item.path && item.menuType !== 'BUTTON') {
              routes.add(item.path)
            }
            if (item.children?.length) {
              extractPaths(item.children)
            }
          }
        }
        extractPaths(menus)
        
        // 自动补充详情页路由：如果列表页有权限，详情页也自动有权限
        // 例如 /projects → /projects/:id
        Object.keys(routeComponents).forEach(routePath => {
          if (routePath.includes('/:id')) {
            const parentPath = routePath.replace('/:id', '')
            if (routes.has(parentPath)) {
              routes.add(routePath)
            }
          }
        })
      } catch {}
    }
    
    setAllowedRoutes(routes)
    setLoading(false)
  }, [])

  useEffect(() => {
    // 初始构建
    buildRoutes()

    // 监听菜单更新事件（Layout 获取菜单后触发）
    const handleMenusUpdate = () => {
      buildRoutes()
    }

    window.addEventListener('menus-updated', handleMenusUpdate)
    return () => window.removeEventListener('menus-updated', handleMenusUpdate)
  }, [buildRoutes])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    )
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          // Primary color system
          colorPrimary: '#4f46e5',
          colorInfo: '#4f46e5',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',

          // Neutral color scale
          colorText: '#1f2937',
          colorTextSecondary: '#6b7280',
          colorTextTertiary: '#9ca3af',
          colorBorder: '#d1d5db',
          colorBorderSecondary: '#e5e7eb',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f9fafb',
          colorBgElevated: '#ffffff',

          // Shape & sizing
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,

          // Typography
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          fontSizeLG: 16,
          fontSizeSM: 12,
          lineHeight: 1.5714,

          // Control sizing
          controlHeight: 36,
          controlHeightLG: 44,
          controlHeightSM: 28,

          // Spacing
          padding: 16,
          paddingLG: 24,
          paddingSM: 12,
          margin: 16,
          marginLG: 24,
          marginSM: 12,

          // Shadows
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
          boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
          boxShadowTertiary: '0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.04)',

          // Motion
          motionDurationMid: '0.2s',
          motionDurationSlow: '0.3s',
          motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
        components: {
          Card: {
            borderRadiusLG: 12,
            boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
            headerBg: '#f9fafb',
            paddingLG: 24,
          },
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#64748b',
            headerSplitColor: '#e2e8f0',
            borderColor: '#f1f5f9',
            rowHoverBg: '#f1f5f9',
            headerBorderRadius: 8,
            fontSize: 14,
            cellPaddingBlock: 14,
            cellPaddingInline: 16,
            headerSortActiveBg: '#eef2ff',
            headerSortHoverBg: '#f1f5f9',
          },
          Form: {
            labelColor: '#374151',
            labelFontSize: 14,
            labelRequiredMarkColor: '#ef4444',
            itemMarginBottom: 20,
            verticalLabelPadding: '0 0 8px',
          },
          Button: {
            primaryShadow: '0 2px 4px rgba(79, 70, 229, 0.25)',
            defaultBorderColor: '#d1d5db',
            defaultColor: '#374151',
            defaultBg: '#ffffff',
            fontWeight: 500,
            controlHeight: 36,
            controlHeightLG: 44,
            controlHeightSM: 28,
            paddingInline: 16,
            borderRadius: 8,
            borderRadiusLG: 10,
            borderRadiusSM: 6,
          },
          Modal: {
            borderRadiusLG: 12,
            titleFontSize: 18,
            headerBg: '#ffffff',
            paddingContentHorizontalLG: 24,
            paddingMD: 24,
          },
          Tag: {
            defaultBg: '#f1f5f9',
            defaultColor: '#475569',
            borderRadiusSM: 6,
          },
          Badge: {
            colorError: '#ef4444',
            colorSuccess: '#10b981',
            colorWarning: '#f59e0b',
            colorInfo: '#4f46e5',
          },
          Select: {
            optionSelectedBg: '#eef2ff',
            optionActiveBg: '#f5f3ff',
            optionSelectedColor: '#4f46e5',
            borderRadius: 8,
            controlHeight: 36,
          },
          Input: {
            activeShadow: '0 0 0 3px rgba(79, 70, 229, 0.1)',
            hoverBorderColor: '#a5b4fc',
            activeBorderColor: '#4f46e5',
            borderRadius: 8,
            controlHeight: 36,
            controlHeightLG: 44,
            paddingInline: 12,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            itemPaddingInline: 16,
            itemHeight: 40,
            itemHoverBg: '#f5f3ff',
            itemSelectedBg: '#eef2ff',
            itemSelectedColor: '#4f46e5',
            itemHoverColor: '#4f46e5',
            iconSize: 18,
            subMenuItemBg: 'transparent',
          },
          Tooltip: {
            colorBgSpotlight: '#1f2937',
            colorTextLightSolid: '#ffffff',
            borderRadius: 8,
            fontSize: 13,
            paddingSM: 8,
          },
        },
      }}
    >
      <AntApp>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            {Object.entries(routeComponents)
              .filter(([path]) => allowedRoutes.has(path))
              .map(([path, Component]) => {
                const element = (
                  <Suspense fallback={<PageLoading />}>
                    <Component />
                  </Suspense>
                )
                // 根路径使用 index route，其他路径去掉前导 /
                return path === '/' 
                  ? <Route key={path} index element={element} />
                  : <Route key={path} path={path.slice(1)} element={element} />
              })}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
