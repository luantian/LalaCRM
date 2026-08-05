import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: any) => void

function safeGetUser(): { id?: number } {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function useWebSocket(onMessage: MessageHandler, enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<any>(null)
  const onMessageRef = useRef(onMessage)
  const intentionalCloseRef = useRef(false) // 标记是否主动关闭

  // 保持 onMessage 引用最新
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!enabled) return

    const token = localStorage.getItem('token')
    const user = safeGetUser()

    if (!token || !user.id) {
      return
    }

    // 使用 ws:// 或 wss:// 根据当前协议
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // 开发环境连接后端 WebSocket 端口，生产环境通过 nginx 代理
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const wsHost = isDev ? `${window.location.hostname}:5000` : window.location.hostname
    const wsUrl = `${protocol}//${wsHost}/ws?token=${encodeURIComponent(token)}&userId=${user.id}`

    try {
      intentionalCloseRef.current = false // 重置标志
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // 连接成功，静默处理
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current?.(data)
        } catch (e) {
          console.error('WebSocket message parse error:', e)
        }
      }

      ws.onclose = (event) => {
        // 如果是主动关闭，不重连
        if (intentionalCloseRef.current) {
          return
        }
        
        // 1008 = 策略违反（如 Maximum connections reached），不应重连
        if (event.code === 1008) {
          console.warn('WebSocket rejected by server, not reconnecting')
          return
        }
        
        // 1000 = 正常关闭，不重连
        if (event.code === 1000) {
          return
        }

        // 其他异常情况，延迟重连
        if (enabled) {
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        // 错误事件后会自动触发 close，让 onclose 处理重连逻辑
      }
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      // 连接失败，延迟重试
      if (enabled) {
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      connect()
    }

    return () => {
      // 标记为主动关闭，防止 onclose 触发重连
      intentionalCloseRef.current = true
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, enabled])
}
