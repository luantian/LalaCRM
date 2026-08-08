import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // 防止空闲时 WebSocket 连接断开
    hmr: {
      // 开发服务器空闲时保持心跳，防止浏览器断开连接
      timeout: 0,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // 代理连接保活
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err)
          })
        }
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
        // WebSocket 代理心跳保活
        timeout: 0,
        pingTimeout: 0,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('ws proxy error', err)
          })
        }
      }
    }
  },
  build: {
    // 提高 chunk 大小 警告阈值（antd 本身很大）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 将大型第三方库单独打包，利用浏览器缓存
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-utils': ['axios', 'dayjs', 'recharts']
        }
      }
    }
  }
})
