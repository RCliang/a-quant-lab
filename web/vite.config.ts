import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署到子路径（如 GitHub Pages 项目页 username.github.io/repo/）时：
//   VITE_BASE=/repo-name/ npm run build
// 根路径/自定义域名/IP端口 部署保持默认即可（站点用 HashRouter，无 rewrite 需求）。
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
})
