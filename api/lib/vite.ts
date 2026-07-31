import type { Context } from "hono";
import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".mp3": "audio/mpeg",
};

// 构建时预压缩（scripts/compress-assets.mjs）会生成同路径 .br / .gz，这里按 Accept-Encoding 择优回源
const COMPRESSIBLE = new Set([".js", ".css", ".html", ".svg", ".json", ".txt"]);

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");
  // index.html 启动时读入内存：SPA 回退不再每次读盘
  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

  const sendFile = (c: Context, relPath: string, cacheControl: string) => {
    const file = path.resolve(distPath, relPath);
    if (!file.startsWith(distPath + path.sep)) {
      return c.json({ error: "Not Found" }, 404);
    }
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const acceptEncoding = c.req.header("accept-encoding") ?? "";
    let buf: Buffer | null = null;
    let encoding: string | null = null;
    if (COMPRESSIBLE.has(ext)) {
      if (acceptEncoding.includes("br") && fs.existsSync(file + ".br")) {
        buf = fs.readFileSync(file + ".br");
        encoding = "br";
      } else if (acceptEncoding.includes("gzip") && fs.existsSync(file + ".gz")) {
        buf = fs.readFileSync(file + ".gz");
        encoding = "gzip";
      }
    }
    if (!buf) {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return c.json({ error: "Not Found" }, 404);
      }
      buf = fs.readFileSync(file);
    }
    c.header("Content-Type", mime);
    if (encoding) c.header("Content-Encoding", encoding);
    c.header("Vary", "Accept-Encoding");
    c.header("Cache-Control", cacheControl);
    // Buffer 与 hono Data 的 Uint8Array<ArrayBuffer> 泛型不匹配（TS 5.7+ 泛型化 ArrayBuffer），零拷贝断言绕过
    return c.body(buf as unknown as Uint8Array<ArrayBuffer>);
  };

  // 带内容 hash 的构建产物（Vite 输出）：一年强缓存，内容变则文件名变
  // hono 4.12 的 use 中间件要求返回 Promise，故用 async
  app.use("/assets/*", async (c): Promise<Response> => {
    const rel = c.req.path.replace(/^\/+/, "");
    return sendFile(c, rel, "public, max-age=31536000, immutable");
  });

  // 根级静态（favicon / logo / 背景图 / guide 等，文件名不带 hash）：一周缓存
  app.use("*", async (c, next) => {
    const p = c.req.path;
    if (p.startsWith("/api/")) return next();
    const rel = p.replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return next();
    const file = path.resolve(distPath, rel);
    if (file.startsWith(distPath + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      if (rel === "index.html") {
        c.header("Content-Type", "text/html; charset=utf-8");
        c.header("Cache-Control", "no-cache");
        return c.body(indexHtml);
      }
      return sendFile(c, rel, "public, max-age=604800");
    }
    return next();
  });

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    c.header("Cache-Control", "no-cache");
    return c.html(indexHtml);
  });
}
