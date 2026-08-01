/**
 * record_refs 表（批次F F4 Relevant Items 双向链接）：幂等建表 + information_schema 验证 + 存量回填。
 * 回填：扫全库 contentHtml 含 data-ref-chip 的记录，逐条 syncRecordRefs（先删后插，幂等可重复跑）。
 * 运行：npx tsx scripts/create-record-refs-table.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { syncRecordRefs } from "../api/lib/record-refs";

async function main() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS record_refs (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      userId bigint unsigned NOT NULL,
      recordId bigint unsigned NOT NULL,
      targetKind enum('record','protocol','sample') NOT NULL,
      targetId bigint unsigned NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY record_refs_unique (recordId, targetKind, targetId),
      KEY record_refs_target_idx (targetKind, targetId),
      KEY record_refs_user_idx (userId)
    )
  `);
  const rows = await db.execute(sql`
    SELECT TABLE_NAME AS t FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'record_refs'
  `);
  const ok = ((Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{ t: string }>).length > 0;
  if (!ok) throw new Error("record_refs 建表验证失败");
  console.log("record_refs 表就绪");

  // ---- 存量回填：contentHtml 含芯片的记录逐条重建索引（幂等） ----
  const recs = await db.execute(sql`
    SELECT id, userId, contentHtml FROM records
    WHERE contentHtml LIKE '%data-ref-chip%'
  `);
  const list = (Array.isArray(recs) ? recs[0] : recs) as unknown as Array<{
    id: number;
    userId: number;
    contentHtml: string | null;
  }>;
  let synced = 0;
  for (const r of list) {
    await syncRecordRefs(Number(r.userId), Number(r.id), r.contentHtml);
    synced += 1;
  }
  const cnt = await db.execute(sql`SELECT COUNT(*) AS c FROM record_refs`);
  const total = Number(
    ((Array.isArray(cnt) ? cnt[0] : cnt) as unknown as Array<{ c: number }>)[0]?.c ?? 0,
  );
  console.log(`回填完成：扫描命中 ${list.length} 条记录，重建 ${synced} 条，record_refs 现共 ${total} 行`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
