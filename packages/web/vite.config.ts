import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

// ESM 下用 import.meta.url 推导 __dirname 等价物
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 把 @personax/contracts 指向 shared 包的源码入口
      '@personax/contracts': path.resolve(__dirname, '../contracts/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        // 去掉 /api 前缀,后端路由在根路径
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
