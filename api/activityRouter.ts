import { and, eq, gte, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { records, userActivity } from "@db/schema";

/** 近一年天数（53 周格子 = 371 天，含今天） */
const YEAR_DAYS = 371;

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const activityRouter = createRouter({
  /**
   * 活跃日历数据：近 371 天逐日 {date, records, protocolsUsed, logins}。
   * records 按 createdAt 实时聚合（全历史可回溯）；logins/protocolsUsed 自功能上线起累计。
   */
  yearly: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const from = new Date();
    from.setDate(from.getDate() - (YEAR_DAYS - 1));
    const fromStr = fmtDate(from);

    const [actRows, recRows] = await Promise.all([
      db
        .select()
        .from(userActivity)
        .where(and(eq(userActivity.userId, ctx.user.id), gte(userActivity.date, fromStr))),
      db
        .select({
          d: sql<string>`DATE_FORMAT(${records.createdAt}, '%Y-%m-%d')`,
          c: sql<number>`COUNT(*)`,
        })
        .from(records)
        .where(and(eq(records.userId, ctx.user.id), gte(records.createdAt, from)))
        .groupBy(sql`DATE_FORMAT(${records.createdAt}, '%Y-%m-%d')`),
    ]);

    const days = new Map<string, { date: string; records: number; protocolsUsed: number; logins: number }>();
    for (const r of actRows) {
      days.set(r.date, {
        date: r.date,
        records: 0,
        protocolsUsed: Number(r.protocolsUsed),
        logins: Number(r.logins),
      });
    }
    for (const r of recRows) {
      const cur = days.get(r.d) ?? { date: r.d, records: 0, protocolsUsed: 0, logins: 0 };
      cur.records = Number(r.c);
      days.set(r.d, cur);
    }

    const isActive = (d?: { records: number; protocolsUsed: number; logins: number }) =>
      !!d && (d.records > 0 || d.protocolsUsed > 0 || d.logins > 0);

    // 连续活跃：今天活跃则从今天回溯，否则从昨天回溯（今天还有时间补）
    let streak = 0;
    const cursor = new Date();
    if (!isActive(days.get(fmtDate(cursor)))) cursor.setDate(cursor.getDate() - 1);
    while (isActive(days.get(fmtDate(cursor)))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const all = [...days.values()];
    return {
      days: all.sort((a, b) => a.date.localeCompare(b.date)),
      streak,
      totalActiveDays: all.filter(isActive).length,
      totalRecords: all.reduce((n, d) => n + d.records, 0),
      totalProtocolsUsed: all.reduce((n, d) => n + d.protocolsUsed, 0),
    };
  }),
});
