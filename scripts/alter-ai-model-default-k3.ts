/**
 * ai_settings.model 列默认值改为 kimi-k3（幂等；只改默认值，不动已有行的值——用户可在设置页自行切换）
 * 运行：npx tsx scripts/alter-ai-model-default-k3.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function currentDefault(): Promise<string | null> {
  const rows = await getDb().execute(sql`
    SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_settings' AND COLUMN_NAME = 'model'
  `);
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ d: string | null }>;
  return list[0]?.d ?? null;
}

async function main() {
  const d = await currentDefault();
  if (d === "kimi-k3") {
    console.log("SKIP: ai_settings.model 默认值已是 kimi-k3");
  } else {
    await getDb().execute(
      sql`ALTER TABLE ai_settings MODIFY COLUMN model varchar(64) NOT NULL DEFAULT 'kimi-k3'`,
    );
    console.log(`ALTER: ai_settings.model 默认值 ${d} → kimi-k3`);
  }
  const now = await currentDefault();
  console.log("验证 information_schema:", now === "kimi-k3" ? "默认值正确" : `异常: ${now}`);
  process.exit(now === "kimi-k3" ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
