import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS record_attachments (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      recordId bigint unsigned NOT NULL,
      name varchar(255) NOT NULL,
      mime varchar(64) NOT NULL,
      size int NOT NULL,
      data longtext NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY recordAttachments_record_idx (recordId)
    )
  `);
  const rows = await db.execute(sql`SHOW TABLES LIKE 'record_attachments'`);
  console.log("建表结果:", JSON.stringify(rows[0]));
  const cols = await db.execute(sql`
    SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'record_attachments' ORDER BY ORDINAL_POSITION
  `);
  console.log("表结构:", JSON.stringify(cols[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
