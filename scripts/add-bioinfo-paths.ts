/**
 * bioinfo_analyses 表加数据存储路径列 dataPath / resultPath（幂等：先查 information_schema 再 ALTER）
 * 运行：npx tsx scripts/add-bioinfo-paths.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

const COLS: Array<{ name: string; ddl: string }> = [
  { name: "dataPath", ddl: "ADD COLUMN dataPath varchar(500) NULL" },
  { name: "resultPath", ddl: "ADD COLUMN resultPath varchar(500) NULL" },
];

async function columnExists(name: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bioinfo_analyses'
      AND COLUMN_NAME = ${name}
  `);
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ cnt: number | string }>;
  return Number(list[0]?.cnt ?? 0) > 0;
}

async function main() {
  const db = getDb();
  for (const c of COLS) {
    if (await columnExists(c.name)) {
      console.log(`SKIP: bioinfo_analyses.${c.name} 已存在，无需变更`);
    } else {
      await db.execute(sql.raw(`ALTER TABLE bioinfo_analyses ${c.ddl}`));
      console.log(`ALTER: bioinfo_analyses.${c.name} 已添加 (${c.ddl})`);
    }
  }
  // 验证：复读 information_schema
  let ok = true;
  for (const c of COLS) {
    const has = await columnExists(c.name);
    console.log(`验证 information_schema: ${c.name}`, has ? "列存在" : "列缺失（异常）");
    if (!has) ok = false;
  }
  const sample = await db.execute(sql`SELECT id, name, dataPath, resultPath FROM bioinfo_analyses LIMIT 3`);
  const rows = (Array.isArray(sample) ? sample[0] : sample) as unknown as unknown[];
  console.log("抽查数据:", JSON.stringify(rows));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
