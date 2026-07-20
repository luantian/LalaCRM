import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import http from 'http'
import dotenv from 'dotenv'
import logger from './utils/logger'
import { utf8Sanitizer } from './middleware/utf8Sanitizer'
import { initWebSocket } from './websocket'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import roleRoutes from './routes/roles'
import menuRoutes from './routes/menus'
import customerRoutes from './routes/customers'
import saleRoutes from './routes/sales'
import projectRoutes from './routes/projects'
import contractRoutes from './routes/contracts'
import contractOrderItemRoutes from './routes/contractOrderItems'
import contractPaymentRoutes from './routes/contractPayments'
import contractShipmentRoutes from './routes/contractShipments'
import expenseFileRoutes from './routes/expenseFiles'
import businessTripRoutes from './routes/businessTrips'
import expenseRoutes from './routes/expenses'
import dashboardRoutes from './routes/dashboard'
import opportunityRoutes from './routes/opportunities'
import procurementRoutes from './routes/procurements'
import procurementPaymentRoutes from './routes/procurementPayments'
import dailyReportRoutes from './routes/dailyReports'
import roleMenuRoutes from './routes/roleMenus'
import departmentRoutes from './routes/departments'
import dictRoutes from './routes/dicts'
import operationLogRoutes from './routes/operationLogs'
import loginLogRoutes from './routes/loginLogs'
import projectNoteRoutes from './routes/projectNotes'
import customerContactRoutes from './routes/customerContacts'
import projectCostRoutes from './routes/projectCosts'
import customerFollowUpRoutes from './routes/customerFollowUps'
import dailyReportTemplateRoutes from './routes/dailyReportTemplates'
import weeklyReportRoutes from './routes/weeklyReports'
import monthlyReportRoutes from './routes/monthlyReports'
import dailyReportReminderRoutes from './routes/dailyReportReminders'
import invoiceRoutes from './routes/invoices'
import quotationRoutes from './routes/quotations'
import checkInRoutes from './routes/checkIns'
import taskRoutes from './routes/tasks'
import notificationRoutes from './routes/notifications'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// 安全中间件
app.use(helmet()) // 设置安全 HTTP 头部

// CORS 配置 - 限制允许的域名
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
app.use(cors(corsOptions))

// 中间件
app.use(express.json({ limit: '10mb' }))
app.use(utf8Sanitizer) // UTF-8 编码保护

// 请求日志
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// 设置所有响应的字符编码为UTF-8
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  next()
})

// 路由 - 认证接口使用限流
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/roles', roleRoutes)
app.use('/api/menus', menuRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/contracts', contractRoutes)
app.use('/api/contract-order-items', contractOrderItemRoutes)
app.use('/api/contract-payments', contractPaymentRoutes)
app.use('/api/contract-shipments', contractShipmentRoutes)
app.use('/api/expense-files', expenseFileRoutes)
app.use('/api/business-trips', businessTripRoutes)
app.use('/api/expenses', expenseRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/opportunities', opportunityRoutes)
app.use('/api/procurements', procurementRoutes)
app.use('/api/procurement-payments', procurementPaymentRoutes)
app.use('/api/daily-reports', dailyReportRoutes)
app.use('/api/role-menus', roleMenuRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/dicts', dictRoutes)
app.use('/api/operation-logs', operationLogRoutes)
app.use('/api/login-logs', loginLogRoutes)
app.use('/api/project-notes', projectNoteRoutes)
app.use('/api/customer-contacts', customerContactRoutes)
app.use('/api/project-costs', projectCostRoutes)
app.use('/api/customer-follow-ups', customerFollowUpRoutes)
app.use('/api/daily-report-templates', dailyReportTemplateRoutes)
app.use('/api/weekly-reports', weeklyReportRoutes)
app.use('/api/monthly-reports', monthlyReportRoutes)
app.use('/api/daily-report-reminders', dailyReportReminderRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/quotations', quotationRoutes)
app.use('/api/check-ins', checkInRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/notifications', notificationRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CRM API is running' })
})

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, {
    stack: err.stack,
    body: req.body
  })

  // Prisma 错误处理
  if (err.code === 'P2002') {
    return res.status(400).json({ error: '数据已存在' })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: '数据不存在' })
  }

  // JWT 错误处理
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: '无效的认证令牌' })
  }

  // 默认错误
  const statusCode = err.statusCode || 500
  const message = process.env.NODE_ENV === 'production'
    ? '服务器内部错误'
    : err.message

  res.status(statusCode).json({ error: message })
})

const server = http.createServer(app)

// 初始化 WebSocket
initWebSocket(server)

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`WebSocket available at ws://localhost:${PORT}/ws?userId=xxx`)
})
