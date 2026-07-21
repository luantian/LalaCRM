import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true
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
