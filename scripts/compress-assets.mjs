// 构建后预压缩：为静态产物中的文本类资产生成同路径 .br / .gz
// 服务端（api/lib/vite.ts）按请求 Accept-Encoding 择优返回预压缩文件，免运行时压缩 CPU
// 用法：node scripts/compress-assets.mjs [目录]，默认 dist/public
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { join, extname } from "node:path";

const root = process.argv[2] ?? "dist/public";
const EXTS = new Set([".js", ".css", ".html", ".svg", ".json", ".txt"]);
const MIN_SIZE = 1024; // 小于 1KB 不值得压缩

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let count = 0;
let raw = 0;
let savedGz = 0;
let savedBr = 0;
for (const file of walk(root)) {
  if (file.endsWith(".br") || file.endsWith(".gz")) continue;
  if (!EXTS.has(extname(file).toLowerCase())) continue;
  const buf = readFileSync(file);
  if (buf.length < MIN_SIZE) continue;
  const gz = gzipSync(buf, { level: 9 });
  const br = brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  writeFileSync(file + ".gz", gz);
  writeFileSync(file + ".br", br);
  count += 1;
  raw += buf.length;
  savedGz += gz.length;
  savedBr += br.length;
}
const kb = (n) => (n / 1024).toFixed(0);
console.log(`[compress] ${count} 个文件：原始 ${kb(raw)}KB → gzip ${kb(savedGz)}KB / brotli ${kb(savedBr)}KB`);
