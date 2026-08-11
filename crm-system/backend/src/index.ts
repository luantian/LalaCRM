import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import logger from './utils/logger'
import prisma from './lib/prisma'
import { authenticateToken } from './middleware/auth'
import { utf8Sanitizer } from './middleware/utf8Sanitizer'
import { initWebSocket } from './websocket'

// 导入路由
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import departmentRoutes from './routes/departments'
import roleRoutes from './routes/roles'
import roleMenuRoutes from './routes/roleMenus'
import menuRoutes from './routes/menus'
import dictRoutes from './routes/dicts'
import organizationRoutes from './routes/organizations'
import opportunityRoutes from './routes/opportunities'
import projectRoutes from './routes/projects'
import contractRoutes from './routes/contracts'
import contractOrderItemRoutes from './routes/contractOrderItems'
import contractReceiptRoutes from './routes/contractReceipts'
import contractShipmentRoutes from './routes/contractShipments'
import quotationRoutes from './routes/quotations'
import procurementRoutes from './routes/procurements'
import procurementPaymentRoutes from './routes/procurementPayments'
import invoiceRoutes from './routes/invoices'
import expenseRoutes from './routes/expenses'
import expenseFileRoutes from './routes/expenseFiles'
import taskRoutes from './routes/tasks'
import dailyReportRoutes from './routes/dailyReports'
import dailyReportTemplateRoutes from './routes/dailyReportTemplates'
import dailyReportReminderRoutes from './routes/dailyReportReminders'
import weeklyReportRoutes from './routes/weeklyReports'
import monthlyReportRoutes from './routes/monthlyReports'
import checkInRoutes from './routes/checkIns'
import businessTripRoutes from './routes/businessTrips'
import projectCostRoutes from './routes/projectCosts'
import projectNoteRoutes from './routes/projectNotes'
import dashboardRoutes from './routes/dashboard'
import notificationRoutes from './routes/notifications'
import settingRoutes from './routes/settings'
import loginLogRoutes from './routes/loginLogs'
import operationLogRoutes from './routes/operationLogs'
import databaseRoutes from './routes/database'

const app = express()
const server = createServer(app)
const PORT = parseInt(process.env.PORT || '5000', 10)

// 中间件
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(utf8Sanitizer)

// 健康检查（不需要认证）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 登录接口（不需要认证）
app.use('/api/auth', authRoutes)

// 其他接口都需要认证
app.use('/api/users', authenticateToken, userRoutes)
app.use('/api/departments', authenticateToken, departmentRoutes)
app.use('/api/roles', authenticateToken, roleRoutes)
app.use('/api/role-menus', authenticateToken, roleMenuRoutes)
app.use('/api/menus', authenticateToken, menuRoutes)
app.use('/api/dicts', authenticateToken, dictRoutes)
app.use('/api/organizations', authenticateToken, organizationRoutes)
app.use('/api/opportunities', authenticateToken, opportunityRoutes)
app.use('/api/projects', authenticateToken, projectRoutes)
app.use('/api/contracts', authenticateToken, contractRoutes)
app.use('/api/contract-order-items', authenticateToken, contractOrderItemRoutes)
app.use('/api/contract-receipts', authenticateToken, contractReceiptRoutes)
app.use('/api/contract-shipments', authenticateToken, contractShipmentRoutes)
app.use('/api/quotations', authenticateToken, quotationRoutes)
app.use('/api/procurements', authenticateToken, procurementRoutes)
app.use('/api/procurement-payments', authenticateToken, procurementPaymentRoutes)
app.use('/api/invoices', authenticateToken, invoiceRoutes)
app.use('/api/expenses', authenticateToken, expenseRoutes)
app.use('/api/expense-files', authenticateToken, expenseFileRoutes)
app.use('/api/tasks', authenticateToken, taskRoutes)
app.use('/api/daily-reports', authenticateToken, dailyReportRoutes)
app.use('/api/daily-report-templates', authenticateToken, dailyReportTemplateRoutes)
app.use('/api/daily-report-reminders', authenticateToken, dailyReportReminderRoutes)
app.use('/api/weekly-reports', authenticateToken, weeklyReportRoutes)
app.use('/api/monthly-reports', authenticateToken, monthlyReportRoutes)
app.use('/api/check-ins', authenticateToken, checkInRoutes)
app.use('/api/business-trips', authenticateToken, businessTripRoutes)
app.use('/api/project-costs', authenticateToken, projectCostRoutes)
app.use('/api/project-notes', authenticateToken, projectNoteRoutes)
app.use('/api/dashboard', authenticateToken, dashboardRoutes)
app.use('/api/notifications', authenticateToken, notificationRoutes)
app.use('/api/settings', authenticateToken, settingRoutes)
app.use('/api/login-logs', authenticateToken, loginLogRoutes)
app.use('/api/operation-logs', authenticateToken, operationLogRoutes)
app.use('/api/database', authenticateToken, databaseRoutes)

// 静态文件服务（上传的文件）
app.use('/uploads', express.static('uploads'))

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 全局错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({ 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// 测试数据库连接
async function testDatabaseConnection() {
  try {
    await prisma.$connect()
    logger.info('✅ 数据库连接成功')
    
    // 测试查询
    const userCount = await prisma.user.count()
    logger.info(`📊 数据库中有 ${userCount} 个用户`)
    
    return true
  } catch (error) {
    logger.error('❌ 数据库连接失败:', error)
    return false
  }
}

// 启动服务器
async function startServer() {
  const dbConnected = await testDatabaseConnection()
  
  if (!dbConnected) {
    logger.error('数据库连接失败，服务器无法启动')
    process.exit(1)
  }

  server.listen(PORT, () => {
    logger.info(`🚀 服务器已启动: http://localhost:${PORT}`)
    logger.info(`📡 WebSocket 服务: ws://localhost:${PORT}/ws`)
  })

  // 初始化 WebSocket
  initWebSocket(server)
}

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('SIGTERM 信号接收，正在关闭服务器...')
  await prisma.$disconnect()
  server.close(() => {
    logger.info('服务器已关闭')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  logger.info('SIGINT 信号接收，正在关闭服务器...')
  await prisma.$disconnect()
  server.close(() => {
    logger.info('服务器已关闭')
    process.exit(0)
  })
})

startServer().catch((error) => {
  logger.error('启动服务器失败:', error)
  process.exit(1)
})
