import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /* P2 性能：vendor 拆分——TipTap/ProseMirror 全家桶独立 chunk（仅记录详情页加载时拉取），
           react 运行时独立 chunk（所有页面共享，长期缓存命中率高） */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/]@tiptap[\\/]|node_modules[\\/]prosemirror-/.test(id))
            return "vendor-tiptap";
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id))
            return "vendor-react";
          return undefined;
        },
      },
    },
  },
});
