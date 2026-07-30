import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quick_notes (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      kind varchar(8) NOT NULL,
      content text NOT NULL,
      projectId bigint unsigned NULL,
      recordId bigint unsigned NULL,
      status varchar(12) NOT NULL DEFAULT 'inbox',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY quick_notes_user_status_idx (userId, status)
    )
  `);
  const rows = await db.execute(sql`SHOW TABLES LIKE 'quick_notes'`);
  console.log("建表结果:", JSON.stringify(rows[0]));
  const cols = await db.execute(sql`
    SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'quick_notes' ORDER BY ORDINAL_POSITION
  `);
  console.log("表结构:", JSON.stringify(cols[0]));
  const idx = await db.execute(sql`
    SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS
    WHERE TABLE_NAME = 'quick_notes' ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `);
  console.log("索引:", JSON.stringify(idx[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
