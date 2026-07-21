import axios from 'axios'

// 安全解析 JSON，防止 localStorage 损坏导致崩溃
export function safeJsonParse(value: string | null, fallback: any): any {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  }
})

// 添加请求拦截器，自动添加token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 返回response.data
api.interceptors.response.use(
  (response) => response.data as any,
  (error) => {
    const status = error.response?.status
    const msg = error.response?.data?.error || ''

    // 401 或 403（令牌无效/过期）→ 清除登录信息并跳转登录页
    if (status === 401 || (status === 403 && (msg.includes('认证令牌') || msg.includes('登录')))) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('menus')
      // 避免在登录页重复跳转
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // 保留 error.response?.data?.error 的访问路径，同时保留 e?.error 的向后兼容
    if (error.response?.data) {
      error.response.data.error = error.response.data.error || msg
      return Promise.reject(error.response.data)
    }
    return Promise.reject(error)
  }
)

// 认证
export const login = (data: { username: string; password: string }) =>
  api.post('/auth/login', data)

// 客户
export const getCustomers = (params?: any) => api.get('/customers', { params })
export const getCustomerDetail = (id: number) => api.get(`/customers/${id}`)
export const createCustomer = (data: any) => api.post('/customers', data)
export const updateCustomer = (id: number, data: any) => api.put(`/customers/${id}`, data)
export const deleteCustomer = (id: number) => api.delete(`/customers/${id}`)
export const batchDeleteCustomers = (ids: number[]) => api.post('/customers/batch-delete', { ids })
export const exportCustomers = () => api.get('/customers/export/csv', { responseType: 'blob' })
export const getCustomerStats = () => api.get('/customers/stats/overview')

// 销售
export const getSales = (params?: any) => api.get('/sales', { params })
export const getSaleDetail = (id: number) => api.get(`/sales/${id}`)
export const createSale = (data: any) => api.post('/sales', data)
export const updateSale = (id: number, data: any) => api.put(`/sales/${id}`, data)
export const deleteSale = (id: number) => api.delete(`/sales/${id}`)
export const getSalesStats = () => api.get('/sales/stats/overview')
export const exportSales = () => api.get('/sales/export/csv', { responseType: 'blob' })

// 项目
export const getProjects = (params?: any) => api.get('/projects', { params })
export const getProjectDetail = (id: number) => api.get(`/projects/${id}`)
export const createProject = (data: any) => api.post('/projects', data)
export const updateProject = (id: number, data: any) => api.put(`/projects/${id}`, data)
export const deleteProject = (id: number) => api.delete(`/projects/${id}`)
export const archiveProject = (id: number, isArchived: boolean) => api.put(`/projects/${id}/archive`, { isArchived })
export const getProjectStats = () => api.get('/projects/stats/overview')
export const uploadProjectFiles = (projectId: number, files: FileList, phase?: string) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i])
  }
  if (phase) formData.append('phase', phase)
  return api.post(`/projects/${projectId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
export const getProjectFiles = (projectId: number, phase?: string) =>
  api.get(`/projects/${projectId}/files`, { params: phase ? { phase } : {} })
export const deleteProjectFile = (projectId: number, fileId: number) => api.delete(`/projects/${projectId}/files/${fileId}`)

// 合同（由项目详情调用）
export const createContract = (data: any) => api.post('/contracts', data)
export const updateContract = (id: number, data: any) => api.put(`/contracts/${id}`, data)
export const deleteContract = (id: number) => api.delete(`/contracts/${id}`)

// 合同订货明细
export const getOrderItems = (contractId: number) => api.get('/contract-order-items', { params: { contractId } })
export const createOrderItem = (data: any) => api.post('/contract-order-items', data)
export const updateOrderItem = (id: number, data: any) => api.put(`/contract-order-items/${id}`, data)
export const deleteOrderItem = (id: number) => api.delete(`/contract-order-items/${id}`)
export const uploadOrderItemFiles = (itemId: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/contract-order-items/${itemId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getOrderItemFiles = (itemId: number) => api.get(`/contract-order-items/${itemId}/files`)
export const deleteOrderItemFile = (itemId: number, fileId: number) => api.delete(`/contract-order-items/${itemId}/files/${fileId}`)
export const downloadOrderItemFileUrl = (fileId: number) => `${api.defaults.baseURL}/contract-order-items/files/${fileId}/download`

// 合同付款记录
export const getPayments = (contractId: number) => api.get('/contract-payments', { params: { contractId } })
export const createPayment = (data: any) => api.post('/contract-payments', data)
export const updatePayment = (id: number, data: any) => api.put(`/contract-payments/${id}`, data)
export const deletePayment = (id: number) => api.delete(`/contract-payments/${id}`)

// 合同发货记录
export const getShipments = (contractId: number) => api.get('/contract-shipments', { params: { contractId } })
export const createShipment = (data: any) => api.post('/contract-shipments', data)
export const updateShipment = (id: number, data: any) => api.put(`/contract-shipments/${id}`, data)
export const deleteShipment = (id: number) => api.delete(`/contract-shipments/${id}`)
export const downloadContractFile = (fileId: number) => `${api.defaults.baseURL}/contracts/files/${fileId}/download`

// 出差管理
export const getBusinessTrips = (params?: any) => api.get('/business-trips', { params })
export const getBusinessTripDetail = (id: number) => api.get(`/business-trips/${id}`)
export const createBusinessTrip = (data: any) => api.post('/business-trips', data)
export const updateBusinessTrip = (id: number, data: any) => api.put(`/business-trips/${id}`, data)
export const deleteBusinessTrip = (id: number) => api.delete(`/business-trips/${id}`)
export const submitBusinessTrip = (id: number) => api.post(`/business-trips/${id}/submit`)
export const approveBusinessTrip = (id: number, remark?: string) => api.post(`/business-trips/${id}/approve`, { remark })
export const rejectBusinessTrip = (id: number, reason: string) => api.post(`/business-trips/${id}/reject`, { reason })
export const resubmitBusinessTrip = (id: number) => api.post(`/business-trips/${id}/resubmit`)
export const completeBusinessTrip = (id: number) => api.post(`/business-trips/${id}/complete`)
export const getBusinessTripStats = () => api.get('/business-trips/stats/overview')

// 费用报销
export const getExpenses = (params?: any) => api.get('/expenses', { params })
export const getExpenseDetail = (id: number) => api.get(`/expenses/${id}`)
export const createExpense = (data: any) => api.post('/expenses', data)
export const updateExpense = (id: number, data: any) => api.put(`/expenses/${id}`, data)
export const deleteExpense = (id: number) => api.delete(`/expenses/${id}`)
export const approveExpense = (id: number, remark?: string) => api.post(`/expenses/${id}/approve`, { remark })
export const submitExpense = (id: number) => api.post(`/expenses/${id}/submit`)
export const rejectExpense = (id: number, reason: string) => api.post(`/expenses/${id}/reject`, { reason })
export const resubmitExpense = (id: number) => api.post(`/expenses/${id}/resubmit`)
export const payExpense = (id: number) => api.post(`/expenses/${id}/pay`)
export const getExpenseStats = () => api.get('/expenses/stats/overview')

// 报销附件
export const uploadExpenseFiles = (expenseId: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i])
  }
  return api.post(`/expense-files/${expenseId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
export const getExpenseFiles = (expenseId: number) => api.get(`/expense-files/${expenseId}/files`)
export const deleteExpenseFile = (expenseId: number, fileId: number) => api.delete(`/expense-files/${expenseId}/files/${fileId}`)

// ==================== 售前/商机管理 ====================
export const getOpportunities = (params?: any) => api.get('/opportunities', { params })
export const getOpportunityDetail = (id: number) => api.get(`/opportunities/${id}`)
export const createOpportunity = (data: any) => api.post('/opportunities', data)
export const updateOpportunity = (id: number, data: any) => api.put(`/opportunities/${id}`, data)
export const deleteOpportunity = (id: number) => api.delete(`/opportunities/${id}`)
export const getOpportunityStats = () => api.get('/opportunities/stats/overview')
export const convertOpportunity = (id: number) => api.post(`/opportunities/${id}/convert`)
// 商机团队
export const addOpportunityTeamMember = (oppId: number, data: any) => api.post(`/opportunities/${oppId}/team`, data)
export const removeOpportunityTeamMember = (oppId: number, memberId: number) => api.delete(`/opportunities/${oppId}/team/${memberId}`)
// 商机文件
export const uploadOpportunityFiles = (oppId: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/opportunities/${oppId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getOpportunityFiles = (oppId: number) => api.get(`/opportunities/${oppId}/files`)
export const deleteOpportunityFile = (oppId: number, fileId: number) => api.delete(`/opportunities/${oppId}/files/${fileId}`)

// 商机信息记录
export const getOpportunityRecords = (oppId: number) => api.get(`/opportunities/${oppId}/records`)
export const createOpportunityRecord = (oppId: number, data: any) => api.post(`/opportunities/${oppId}/records`, data)
export const updateOpportunityRecord = (oppId: number, recordId: number, data: any) => api.put(`/opportunities/${oppId}/records/${recordId}`, data)
export const deleteOpportunityRecord = (oppId: number, recordId: number) => api.delete(`/opportunities/${oppId}/records/${recordId}`)
// 商机信息记录附件
export const uploadOpportunityRecordFiles = (oppId: number, recordId: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/opportunities/${oppId}/records/${recordId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getOpportunityRecordFiles = (oppId: number, recordId: number) => api.get(`/opportunities/${oppId}/records/${recordId}/files`)
export const deleteOpportunityRecordFile = (oppId: number, recordId: number, fileId: number) => api.delete(`/opportunities/${oppId}/records/${recordId}/files/${fileId}`)
export const downloadOpportunityRecordFileUrl = (fileId: number) => `${api.defaults.baseURL}/opportunities/records/files/${fileId}/download`
export const previewOpportunityRecordFileUrl = (fileId: number) => `${api.defaults.baseURL}/opportunities/records/files/${fileId}/preview`

// ==================== 采购管理 ====================
export const getProcurements = (params?: any) => api.get('/procurements', { params })
export const getProcurementDetail = (id: number) => api.get(`/procurements/${id}`)
export const createProcurement = (data: any) => api.post('/procurements', data)
export const updateProcurement = (id: number, data: any) => api.put(`/procurements/${id}`, data)
export const deleteProcurement = (id: number) => api.delete(`/procurements/${id}`)
export const getProcurementItems = (procId: number) => api.get(`/procurements/${procId}/items`)
export const createProcurementItem = (procId: number, data: any) => api.post(`/procurements/${procId}/items`, data)
export const updateProcurementItem = (itemId: number, data: any) => api.put(`/procurements/items/${itemId}`, data)
export const deleteProcurementItem = (itemId: number) => api.delete(`/procurements/items/${itemId}`)
export const getProcurementStats = () => api.get('/procurements/stats/overview')
export const getProcurementPayments = (procurementId: number) => api.get('/procurement-payments', { params: { procurementId } })
export const createProcurementPayment = (data: any) => api.post('/procurement-payments', data)
export const updateProcurementPayment = (id: number, data: any) => api.put(`/procurement-payments/${id}`, data)
export const deleteProcurementPayment = (id: number) => api.delete(`/procurement-payments/${id}`)

// ==================== 工作日报 ====================
export const getDailyReports = (params?: any) => api.get('/daily-reports', { params })
export const getDailyReportDetail = (id: number) => api.get(`/daily-reports/${id}`)
export const createDailyReport = (data: any) => api.post('/daily-reports', data)
export const updateDailyReport = (id: number, data: any) => api.put(`/daily-reports/${id}`, data)
export const deleteDailyReport = (id: number) => api.delete(`/daily-reports/${id}`)
export const getDailyReportStats = () => api.get('/daily-reports/stats/overview')
export const exportDailyReports = (params?: any) => api.get('/daily-reports/export/csv', { params, responseType: 'blob' })

// 工作日报 - 工作条目
export const getDailyReportItems = (reportId: number) => api.get(`/daily-reports/${reportId}/items`)
export const createDailyReportItem = (reportId: number, data: any) => api.post(`/daily-reports/${reportId}/items`, data)
export const updateDailyReportItem = (reportId: number, itemId: number, data: any) => api.put(`/daily-reports/${reportId}/items/${itemId}`, data)
export const deleteDailyReportItem = (reportId: number, itemId: number) => api.delete(`/daily-reports/${reportId}/items/${itemId}`)

// 工作日报 - 工时条目
export const getDailyReportTimeEntries = (reportId: number) => api.get(`/daily-reports/${reportId}/time-entries`)
export const createDailyReportTimeEntry = (reportId: number, data: any) => api.post(`/daily-reports/${reportId}/time-entries`, data)
export const updateDailyReportTimeEntry = (reportId: number, entryId: number, data: any) => api.put(`/daily-reports/${reportId}/time-entries/${entryId}`, data)
export const deleteDailyReportTimeEntry = (reportId: number, entryId: number) => api.delete(`/daily-reports/${reportId}/time-entries/${entryId}`)
export const getHoursAnalysis = (params?: any) => api.get('/daily-reports/stats/hours-analysis', { params })

// 每日打卡
export const getCheckIns = (params?: any) => api.get('/check-ins', { params })
export const getTodayCheckIn = () => api.get('/check-ins/today')
export const checkIn = (data: { period?: 'MORNING' | 'EVENING' } = {}) => api.post('/check-ins', data)
export const makeupCheckIn = (data: { date: string; notes?: string }) => api.post('/check-ins/makeup', data)
export const getCheckInStats = (params?: any) => api.get('/check-ins/stats', { params })

// 用户和角色
export const getUsers = (params?: any) => api.get('/users', { params })
export const getUserDropdown = () => api.get('/users/dropdown')
export const getRoles = (params?: any) => api.get('/roles', { params })

// ==================== 角色菜单权限 ====================
export const getRoleMenus = (roleId: number) => api.get(`/role-menus/${roleId}`)
export const assignRoleMenus = (roleId: number, menuIds: number[]) => api.post(`/role-menus/${roleId}`, { menuIds })
export const getRolePerms = (roleId: number) => api.get(`/role-menus/${roleId}/perms`)
export const getUserMenus = (userId: number) => api.get(`/role-menus/user/${userId}/menus`)

// ==================== 项目备注/版本 ====================
export const getProjectNotes = (projectId: number, noteType?: string) => api.get('/project-notes/notes', { params: { projectId, noteType } })
export const createProjectNote = (data: any) => api.post('/project-notes/notes', data)
export const updateProjectNote = (id: number, data: any) => api.put(`/project-notes/notes/${id}`, data)
export const deleteProjectNote = (id: number) => api.delete(`/project-notes/notes/${id}`)
export const uploadProjectNoteFiles = (noteId: number, files: FileList | File[]) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/project-notes/notes/${noteId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const deleteProjectNoteFile = (noteId: number, fileId: number) => api.delete(`/project-notes/notes/${noteId}/files/${fileId}`)
export const downloadProjectNoteFileUrl = (fileId: number) => `${api.defaults.baseURL}/project-notes/notes/files/${fileId}/download`
export const previewProjectNoteFileUrl = (fileId: number) => `${api.defaults.baseURL}/project-notes/notes/files/${fileId}/preview`
export const getProjectVersions = (projectId: number) => api.get('/project-notes/versions', { params: { projectId } })
export const createProjectVersion = (data: any) => api.post('/project-notes/versions', data)
export const updateProjectVersion = (id: number, data: any) => api.put(`/project-notes/versions/${id}`, data)
export const deleteProjectVersion = (id: number) => api.delete(`/project-notes/versions/${id}`)

// ==================== 客户联系人 ====================
export const getCustomerContacts = (customerId: number) => api.get('/customer-contacts', { params: { customerId } })
export const createCustomerContact = (data: any) => api.post('/customer-contacts', data)
export const updateCustomerContact = (id: number, data: any) => api.put(`/customer-contacts/${id}`, data)
export const deleteCustomerContact = (id: number) => api.delete(`/customer-contacts/${id}`)
export const setPrimaryContact = (id: number) => api.post(`/customer-contacts/${id}/set-primary`)

// ==================== 项目费用汇总 ====================
export const getProjectCostSummary = (projectId: number) => api.get(`/project-costs/${projectId}/summary`)

// 仪表盘
export const getDashboardStats = () => api.get('/dashboard/stats')

// ==================== 发票管理 ====================
export const getInvoices = (params?: any) => api.get('/invoices', { params })
export const getInvoiceDetail = (id: number) => api.get(`/invoices/${id}`)
export const createInvoice = (data: any) => api.post('/invoices', data)
export const updateInvoice = (id: number, data: any) => api.put(`/invoices/${id}`, data)
export const deleteInvoice = (id: number) => api.delete(`/invoices/${id}`)
export const getInvoiceStats = () => api.get('/invoices/stats/overview')
export const getInvoiceReconciliation = (params?: any) => api.get('/invoices/stats/reconciliation', { params })
// 发票附件
export const uploadInvoiceFiles = (invoiceId: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/invoices/${invoiceId}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getInvoiceFiles = (invoiceId: number) => api.get(`/invoices/${invoiceId}/files`)
export const deleteInvoiceFile = (invoiceId: number, fileId: number) => api.delete(`/invoices/${invoiceId}/files/${fileId}`)
export const downloadInvoiceFile = (fileId: number) => `${api.defaults.baseURL}/invoices/files/${fileId}/download`

// ==================== 项目团队管理 ====================
export const getProjectTeam = (projectId: number) => api.get(`/projects/${projectId}/team`)
export const addProjectTeamMember = (projectId: number, data: any) => api.post(`/projects/${projectId}/team`, data)
export const updateProjectTeamMember = (projectId: number, memberId: number, data: any) => api.put(`/projects/${projectId}/team/${memberId}`, data)
export const removeProjectTeamMember = (projectId: number, memberId: number) => api.delete(`/projects/${projectId}/team/${memberId}`)

// ==================== 报价单管理 ====================
export const getQuotations = (params?: any) => api.get('/quotations', { params })
export const getQuotationDetail = (id: number) => api.get(`/quotations/${id}`)
export const createQuotation = (data: any) => api.post('/quotations', data)
export const updateQuotation = (id: number, data: any) => api.put(`/quotations/${id}`, data)
export const deleteQuotation = (id: number) => api.delete(`/quotations/${id}`)
export const getQuotationStats = () => api.get('/quotations/stats/overview')
export const submitQuotation = (id: number) => api.post(`/quotations/${id}/submit`)
export const approveQuotation = (id: number) => api.post(`/quotations/${id}/approve`)
export const rejectQuotation = (id: number) => api.post(`/quotations/${id}/reject`)
export const getQuotationVersions = (oppId: number) => api.get(`/quotations/opportunity/${oppId}/versions`)
// 报价单附件
export const uploadQuotationFiles = (id: number, files: FileList) => {
  const formData = new FormData()
  for (let i = 0; i < files.length; i++) { formData.append('files', files[i]) }
  return api.post(`/quotations/${id}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getQuotationFiles = (id: number) => api.get(`/quotations/${id}/files`)
export const deleteQuotationFile = (id: number, fileId: number) => api.delete(`/quotations/${id}/files/${fileId}`)
export const downloadQuotationFile = (fileId: number) => `${api.defaults.baseURL}/quotations/files/${fileId}/download`

// ==================== 任务管理 ====================
export const getTasks = (params?: any) => api.get('/tasks', { params })
export const createTask = (data: any) => api.post('/tasks', data)
export const updateTask = (id: number, data: any) => api.put(`/tasks/${id}`, data)
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`)

// ==================== 通知管理 ====================
export const getNotifications = (params?: any) => api.get('/notifications', { params })
export const markNotificationRead = (id: number) => api.put(`/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.put('/notifications/read-all')

export default api
