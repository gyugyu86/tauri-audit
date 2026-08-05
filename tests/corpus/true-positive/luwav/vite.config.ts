import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 防止 vite 遮挡 Rust 错误
  clearScreen: false,
  // Tauri 期望固定端口，如果端口不可用则中止
  server: {
    strictPort: true,
    fs: {
      strict: false
    }
  },
  // 为 Tauri 的 `tauri dev` 命令设置环境变量
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri 在 Windows 上使用 Chromium，在 macOS 和 Linux 上使用 WebKit
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // 不要压缩调试版本
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // 为调试版本生成源代码映射
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        }
      }
    }
  },
  
})