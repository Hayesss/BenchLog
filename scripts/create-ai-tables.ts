import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

// AI 助手（LLM 副驾）三张表：幂等建表（CREATE TABLE IF NOT EXISTS），
// 对 DATABASE_URL 实跑后用 information_schema 验证打印。

const TABLES = ["ai_settings", "ai_conversations", "ai_messages"] as const;

async function main() {
  const db = getDb();

  // 1) AI 设置：一人一条（userId 主键）
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_settings (
      userId bigint unsigned NOT NULL,
      baseUrl varchar(255) NOT NULL DEFAULT 'https://api.moonshot.cn/v1',
      apiKey text NULL,
      model varchar(64) NOT NULL DEFAULT 'kimi-k2-0711-preview',
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (userId)
    )
  `);

  // 2) AI 会话：projectId 可空（null = 未归档/副驾快聊）
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      projectId bigint unsigned NULL,
      title varchar(120) NOT NULL DEFAULT '',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ai_conversations_user_project_idx (userId, projectId)
    )
  `);

  // 3) AI 消息
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      conversationId bigint unsigned NOT NULL,
      role varchar(12) NOT NULL,
      content text NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ai_messages_conversation_idx (conversationId)
    )
  `);

  // 4) information_schema 验证打印
  for (const table of TABLES) {
    const exists = await db.execute(sql`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
    `);
    console.log(`建表结果 ${table}:`, JSON.stringify(exists[0]));
    const cols = await db.execute(sql`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
      ORDER BY ORDINAL_POSITION
    `);
    console.log(`表结构 ${table}:`, JSON.stringify(cols[0]));
    const idx = await db.execute(sql`
      SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    console.log(`索引 ${table}:`, JSON.stringify(idx[0]));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
