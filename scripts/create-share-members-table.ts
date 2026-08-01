/**
 * share_members 表（#20-II 对象级共享角色）：幂等建表 + information_schema 验证。
 * 运行：npx tsx scripts/create-share-members-table.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS share_members (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      ownerId bigint unsigned NOT NULL,
      kind enum('record','protocol','analysis') NOT NULL,
      targetId bigint unsigned NOT NULL,
      memberId bigint unsigned NOT NULL,
      role enum('viewer','editor') NOT NULL DEFAULT 'viewer',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY share_members_unique (kind, targetId, memberId),
      KEY share_members_member_idx (memberId),
      KEY share_members_owner_idx (ownerId)
    )
  `);
  const rows = await db.execute(sql`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'share_members'
  `);
  const ok = ((Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ t: string }>).length > 0;
  if (!ok) throw new Error("share_members 建表验证失败");
  console.log("share_members 表就绪");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
