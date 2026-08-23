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
    // antd + rc-* + icons 存在双向依赖，强行拆分会触发 rollup 循环 chunk
    // 警告（有运行时初始化顺序风险），因此整块打包为 vendor-antd。
    // 该 chunk 内容稳定、浏览器长缓存，且 gzip 后约 360kB，非首屏瓶颈
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 将大型第三方库单独打包，利用浏览器缓存。
        // 图表库（recharts/d3）仅 Dashboard 异步引用，自动进入异步 chunk，不阻塞首屏
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-utils': ['axios', 'dayjs'],
          'vendor-charts': ['recharts']
        }
      }
    }
  }
})
