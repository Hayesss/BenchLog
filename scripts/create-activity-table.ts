import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_activity (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      date varchar(10) NOT NULL,
      logins int NOT NULL DEFAULT 0,
      protocolsUsed int NOT NULL DEFAULT 0,
      exports int NOT NULL DEFAULT 0,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY user_activity_user_date_uidx (userId, date)
    )
  `);
  const rows = await db.execute(sql`SHOW TABLES LIKE 'user_activity'`);
  console.log("建表结果:", JSON.stringify(rows[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
