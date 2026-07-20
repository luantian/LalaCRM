import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: any) => void

export function useWebSocket(onMessage: MessageHandler, enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<any>(null)
  const onMessageRef = useRef(onMessage)

  // 保持 onMessage 引用最新
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!enabled) return

    const token = localStorage.getItem('token')
    const user = JSON.parse(localStorage.getItem('user') || '{}')

    if (!token || !user.id) {
      console.log('WebSocket: No token or user ID, skipping connection')
      return
    }

    // 使用 ws:// 或 wss:// 根据当前协议
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:5000/ws?userId=${user.id}`

    console.log('WebSocket: Connecting to', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
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
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason)
        // 3秒后重连
        if (enabled) {
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        // 不要在这里 close，让 onclose 处理重连
      }
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      // 连接失败，3秒后重试
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, enabled])
}
