/**
 * ai_model_profiles 表（LLM 多模型档案，参照 wisp-science ModelProfile）：幂等建表 +
 * 存量数据迁移——把 ai_settings 里已配置 apiKey 的用户转成首个档案（active=true）。
 * 运行：npx tsx scripts/create-ai-model-profiles.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function tableExists(name: string): Promise<boolean> {
  const rows = await getDb().execute(sql`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}
  `);
  const list = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ t: string }>;
  return list.length > 0;
}

async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_model_profiles (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      label varchar(128) NOT NULL,
      provider varchar(32) NOT NULL DEFAULT 'openai',
      apiUrl varchar(255) NOT NULL,
      model varchar(128) NOT NULL,
      apiKey text NULL,
      maxTokens int NOT NULL DEFAULT 8192,
      contextWindow int NOT NULL DEFAULT 128000,
      reasoningEffort varchar(16) NOT NULL DEFAULT '',
      active tinyint(1) NOT NULL DEFAULT 0,
      sortOrder int NOT NULL DEFAULT 0,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ai_model_profiles_user_idx (userId, active)
    )
  `);
  console.log("CREATE TABLE IF NOT EXISTS ai_model_profiles: OK");

  // 存量迁移：ai_settings 有 key 且尚无档案的用户 → 生成首个 active 档案（幂等：有档案则跳过）
  const legacy = await db.execute(sql`
    SELECT s.userId AS userId, s.baseUrl AS baseUrl, s.model AS model, s.apiKey AS apiKey
    FROM ai_settings s
    WHERE s.apiKey IS NOT NULL AND s.apiKey != ''
      AND NOT EXISTS (SELECT 1 FROM ai_model_profiles p WHERE p.userId = s.userId)
  `);
  const rows = (Array.isArray(legacy) ? legacy[0] : legacy) as unknown as Array<{
    userId: number;
    baseUrl: string;
    model: string;
    apiKey: string;
  }>;
  let migrated = 0;
  for (const r of rows) {
    // 已知模型给一个友好档案名；未知模型直接用模型 id
    const label = r.model === "kimi-k3" ? "Kimi K3" : r.model.slice(0, 60);
    await db.execute(sql`
      INSERT INTO ai_model_profiles (userId, label, provider, apiUrl, model, apiKey, maxTokens, contextWindow, active, sortOrder)
      VALUES (${r.userId}, ${label}, 'openai', ${r.baseUrl}, ${r.model}, ${r.apiKey},
              ${r.model === "kimi-k3" ? 131072 : 8192}, ${r.model === "kimi-k3" ? 1000000 : 128000}, 1, 0)
    `);
    migrated += 1;
  }
  console.log(`存量迁移：${migrated} 个用户的 ai_settings → 首个 active 档案`);

  const ok = await tableExists("ai_model_profiles");
  const cnt = await db.execute(sql`SELECT COUNT(*) AS n FROM ai_model_profiles`);
  const n = ((Array.isArray(cnt) ? cnt[0] : cnt) as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  console.log(`验证：表存在=${ok}，档案总数=${n}`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
