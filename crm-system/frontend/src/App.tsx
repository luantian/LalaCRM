import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CustomerList from './pages/CustomerList'
import CustomerDetail from './pages/CustomerDetail'
import SaleList from './pages/SaleList'
import ProjectList from './pages/ProjectList'
import ProjectDetail from './pages/ProjectDetail'
import OpportunityList from './pages/OpportunityList'
import OpportunityDetail from './pages/OpportunityDetail'
import DailyReportList from './pages/DailyReportList'
import BusinessTripList from './pages/BusinessTripList'
import BusinessTripDetail from './pages/BusinessTripDetail'
import ExpenseList from './pages/ExpenseList'
import UserManagement from './pages/UserManagement'
import RoleManagement from './pages/RoleManagement'
import MenuManagement from './pages/MenuManagement'
import DepartmentManagement from './pages/DepartmentManagement'
import DictManagement from './pages/DictManagement'
import OperationLogList from './pages/OperationLogList'
import LoginLogList from './pages/LoginLogList'
import QuotationList from './pages/QuotationList'
import QuotationDetail from './pages/QuotationDetail'
import CheckInList from './pages/CheckInList'
import Layout from './components/Layout'
import './App.css'

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
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<CustomerList />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="sales" element={<SaleList />} />
            <Route path="projects" element={<ProjectList />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="opportunities" element={<OpportunityList />} />
            <Route path="opportunities/:id" element={<OpportunityDetail />} />
            <Route path="daily-reports" element={<DailyReportList />} />
            <Route path="business-trips" element={<BusinessTripList />} />
            <Route path="business-trips/:id" element={<BusinessTripDetail />} />
            <Route path="expenses" element={<ExpenseList />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="roles" element={<RoleManagement />} />
            <Route path="menus" element={<MenuManagement />} />
            <Route path="departments" element={<DepartmentManagement />} />
            <Route path="dicts" element={<DictManagement />} />
            <Route path="operation-logs" element={<OperationLogList />} />
            <Route path="login-logs" element={<LoginLogList />} />
            <Route path="quotations" element={<QuotationList />} />
            <Route path="quotations/:id" element={<QuotationDetail />} />
            <Route path="check-ins" element={<CheckInList />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
