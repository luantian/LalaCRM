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

// 加载占位组件
const PageLoading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" tip="加载中..." />
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
          colorPrimary: '#4f46e5',
          borderRadius: 8,
          colorBgContainer: '#ffffff',
          colorBorderSecondary: '#e5e7eb',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          controlHeight: 36,
        },
        components: {
          Card: { borderRadiusLG: 12 },
          Table: { headerBg: '#f8fafc', headerColor: '#374151', borderColor: '#f1f5f9', rowHoverBg: '#f8fafc' },
          Button: { primaryShadow: '0 2px 4px rgba(79, 70, 229, 0.2)' },
          Input: { activeShadow: '0 0 0 2px rgba(79, 70, 229, 0.1)' },
          Select: { optionSelectedBg: '#eef2ff' },
          Menu: { itemBorderRadius: 8, itemMarginInline: 8 },
          Modal: { borderRadiusLG: 12 },
          Tag: { defaultBg: '#f1f5f9' },
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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
