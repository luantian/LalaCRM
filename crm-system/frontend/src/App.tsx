import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Login from './pages/Login'
import Layout from './components/Layout'
import './App.css'

// 路由级代码分割 — 每个页面按需加载，减小初始 bundle 大小
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CustomerList = lazy(() => import('./pages/CustomerList'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const SaleList = lazy(() => import('./pages/SaleList'))
const ProjectList = lazy(() => import('./pages/ProjectList'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const OpportunityList = lazy(() => import('./pages/OpportunityList'))
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'))
const DailyReportList = lazy(() => import('./pages/DailyReportList'))
const BusinessTripList = lazy(() => import('./pages/BusinessTripList'))
const BusinessTripDetail = lazy(() => import('./pages/BusinessTripDetail'))
const ExpenseList = lazy(() => import('./pages/ExpenseList'))
const ExpenseDetail = lazy(() => import('./pages/ExpenseDetail'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const RoleManagement = lazy(() => import('./pages/RoleManagement'))
const MenuManagement = lazy(() => import('./pages/MenuManagement'))
const DepartmentManagement = lazy(() => import('./pages/DepartmentManagement'))
const DictManagement = lazy(() => import('./pages/DictManagement'))
const OperationLogList = lazy(() => import('./pages/OperationLogList'))
const LoginLogList = lazy(() => import('./pages/LoginLogList'))
const QuotationList = lazy(() => import('./pages/QuotationList'))
const QuotationDetail = lazy(() => import('./pages/QuotationDetail'))
const CheckInList = lazy(() => import('./pages/CheckInList'))
const OrganizationList = lazy(() => import('./pages/OrganizationList'))

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
            <Route index element={<Suspense fallback={<PageLoading />}><Dashboard /></Suspense>} />
            <Route path="customers" element={<Suspense fallback={<PageLoading />}><CustomerList /></Suspense>} />
            <Route path="customers/:id" element={<Suspense fallback={<PageLoading />}><CustomerDetail /></Suspense>} />
            <Route path="sales" element={<Suspense fallback={<PageLoading />}><SaleList /></Suspense>} />
            <Route path="projects" element={<Suspense fallback={<PageLoading />}><ProjectList /></Suspense>} />
            <Route path="projects/:id" element={<Suspense fallback={<PageLoading />}><ProjectDetail /></Suspense>} />
            <Route path="opportunities" element={<Suspense fallback={<PageLoading />}><OpportunityList /></Suspense>} />
            <Route path="opportunities/:id" element={<Suspense fallback={<PageLoading />}><OpportunityDetail /></Suspense>} />
            <Route path="daily-reports" element={<Suspense fallback={<PageLoading />}><DailyReportList /></Suspense>} />
            <Route path="business-trips" element={<Suspense fallback={<PageLoading />}><BusinessTripList /></Suspense>} />
            <Route path="business-trips/:id" element={<Suspense fallback={<PageLoading />}><BusinessTripDetail /></Suspense>} />
            <Route path="expenses" element={<Suspense fallback={<PageLoading />}><ExpenseList /></Suspense>} />
            <Route path="expenses/:id" element={<Suspense fallback={<PageLoading />}><ExpenseDetail /></Suspense>} />
            <Route path="users" element={<Suspense fallback={<PageLoading />}><UserManagement /></Suspense>} />
            <Route path="roles" element={<Suspense fallback={<PageLoading />}><RoleManagement /></Suspense>} />
            <Route path="menus" element={<Suspense fallback={<PageLoading />}><MenuManagement /></Suspense>} />
            <Route path="departments" element={<Suspense fallback={<PageLoading />}><DepartmentManagement /></Suspense>} />
            <Route path="dicts" element={<Suspense fallback={<PageLoading />}><DictManagement /></Suspense>} />
            <Route path="operation-logs" element={<Suspense fallback={<PageLoading />}><OperationLogList /></Suspense>} />
            <Route path="login-logs" element={<Suspense fallback={<PageLoading />}><LoginLogList /></Suspense>} />
            <Route path="quotations" element={<Suspense fallback={<PageLoading />}><QuotationList /></Suspense>} />
            <Route path="quotations/:id" element={<Suspense fallback={<PageLoading />}><QuotationDetail /></Suspense>} />
            <Route path="check-ins" element={<Suspense fallback={<PageLoading />}><CheckInList /></Suspense>} />
            <Route path="organizations" element={<Suspense fallback={<PageLoading />}><OrganizationList /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
