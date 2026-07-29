/**
 * 用户每日活动打点（活跃日历格子数据源）。
 * 全部 fire-and-forget：不阻塞请求、失败静默（打点丢失不影响业务）。
 * date 统一用 MySQL CURDATE()，与 records.createdAt 的 DATE() 聚合同时区自洽。
 */
import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";

/** 每日活跃打点：当日首次认证请求起累计 logins（≥1 即视为当日活跃登录） */
export function bumpActive(userId: number): void {
  void getDb()
    .execute(
      sql`INSERT INTO user_activity (userId, date, logins, protocolsUsed, exports, updatedAt)
          VALUES (${userId}, CURDATE(), 1, 0, 0, NOW())
          ON DUPLICATE KEY UPDATE logins = logins + 1, updatedAt = NOW()`,
    )
    .catch(() => {});
}

/** 协议使用打点：incrementUse 时累计当日 protocolsUsed */
export function bumpProtocolUse(userId: number): void {
  void getDb()
    .execute(
      sql`INSERT INTO user_activity (userId, date, logins, protocolsUsed, exports, updatedAt)
          VALUES (${userId}, CURDATE(), 0, 1, 0, NOW())
          ON DUPLICATE KEY UPDATE protocolsUsed = protocolsUsed + 1, updatedAt = NOW()`,
    )
    .catch(() => {});
}
