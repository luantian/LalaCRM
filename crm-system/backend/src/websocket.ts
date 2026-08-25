import { WebSocketServer, WebSocket } from 'ws'
import { Server, IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import logger from './utils/logger'

// 存储所有连接的客户端: userId -> WebSocket[]
const clients = new Map<number, WebSocket[]>()

// 每个用户最大连接数
const MAX_CONNECTIONS_PER_USER = 5

let wss: WebSocketServer | null = null
let heartbeatInterval: NodeJS.Timeout | null = null

// 获取 JWT 密钥
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set')
  }
  return secret
}

// 初始化 WebSocket 服务
export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost')
    // 支持两种方式获取 token：Protocol header 或 URL 参数
    const protocols = (req.headers['sec-websocket-protocol'] || '').split(',').map((p: any) => p.trim())
    const authProtocol = protocols.find(p => p.startsWith('auth.'))
    const token = authProtocol ? authProtocol.slice(5) : (url.searchParams.get('token') || '')
    const userIdParam = parseInt(url.searchParams.get('userId') || '0')

    logger.info(`WebSocket connection attempt from: ${req.socket.remoteAddress}`)

    // 如果通过 Protocol header 认证，回复协议让浏览器保持连接
    if (authProtocol) {
      // 注意：ws 库在 connection 事件中无法直接回复协议
      // 需要通过 handleUpgrade 处理，这里简化为允许 URL 参数方式
    }

    // 验证 JWT token
    if (!token) {
      logger.warn('WebSocket connection rejected: Missing token')
      ws.close(1008, 'Missing authentication token')
      return
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, getJwtSecret()) as any
    } catch (err) {
      logger.warn('WebSocket connection rejected: Invalid token')
      ws.close(1008, 'Invalid authentication token')
      return
    }

    const userId = decoded.id

    // 验证 token 中的 userId 与参数一致
    if (!userId || (userIdParam && userIdParam !== userId)) {
      logger.warn(`WebSocket connection rejected: userId mismatch (token=${userId}, param=${userIdParam})`)
      ws.close(1008, 'User ID mismatch')
      return
    }

    // 初始化 isAlive
    ;(ws as any).isAlive = true

    // 检查连接数限制
    const userClients = clients.get(userId) || []
    if (userClients.length >= MAX_CONNECTIONS_PER_USER) {
      logger.warn(`WebSocket connection rejected: Max connections reached for userId=${userId}`)
      ws.close(1008, 'Maximum connections reached')
      return
    }

    // 将客户端添加到对应 userId 的连接列表
    if (!clients.has(userId)) {
      clients.set(userId, [])
    }
    clients.get(userId)!.push(ws)

    logger.info(`WebSocket connected: userId=${userId}, total=${clients.get(userId)!.length}`)

    // 发送连接成功消息
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'WebSocket 连接成功' }))

    // 心跳检测
    ws.on('pong', () => {
      (ws as any).isAlive = true
    })

    ws.on('close', () => {
      const currentClients = clients.get(userId) || []
      const index = currentClients.indexOf(ws)
      if (index > -1) {
        currentClients.splice(index, 1)
      }
      if (currentClients.length === 0) {
        clients.delete(userId)
      }
      logger.info(`WebSocket disconnected: userId=${userId}`)
    })

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', error)
    })
  })

  // 心跳检测定时器（每 30 秒）
  heartbeatInterval = setInterval(() => {
    if (!wss) return
    wss.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        return ws.terminate()
      }
      (ws as any).isAlive = false
      ws.ping()
    })
  }, 30000)

  logger.info('WebSocket server initialized on /ws')
}

// 清理 WebSocket 资源（用于优雅关闭）
export function cleanupWebSocket() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  if (wss) {
    wss.close()
    wss = null
  }
  clients.clear()
  logger.info('WebSocket server cleaned up')
}

// 向指定用户推送消息
export function sendToUser(userId: number, data: any) {
  const userClients = clients.get(userId) || []
  const message = JSON.stringify(data)

  userClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })

  if (userClients.length > 0) {
    logger.info(`WebSocket message sent to userId=${userId}: ${data.type}`)
  }
}

/**
 * 用户当前是否在线（至少一条 OPEN 状态的 WebSocket 连接，即 CRM 页面开着）。
 * 供外发提醒做"在线抑制"：接收人都在线时跳过群消息（站内通知/WS弹窗已覆盖）。
 */
export function isUserOnline(userId: number): boolean {
  const userClients = clients.get(userId) || []
  return userClients.some(ws => ws.readyState === WebSocket.OPEN)
}

// 向多个用户推送消息
export function sendToUsers(userIds: number[], data: any) {
  userIds.forEach((userId) => sendToUser(userId, data))
}

// 广播给所有连接的用户（调试用）
export function broadcast(data: any) {
  if (!wss) return
  const message = JSON.stringify(data)
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })
}
