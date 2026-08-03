import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { mouseStrains, mouseCages, mice, mouseBreeding } from "@db/schema";
import { dateStr } from "./zodSchemas";
import { assertStockWritable, stockAccess, visibleStockOwnerIds } from "./lib/team";

/** 库存访问级别：read=可见即可；write=editor+/owner；own=仅库存所有者（物理删除） */
type AccessLevel = "read" | "write" | "own";

function checkAccess(
  access: "owner" | "editor" | "viewer" | null,
  level: AccessLevel,
  noun: string,
) {
  if (!access) throw new TRPCError({ code: "NOT_FOUND", message: `${noun}不存在或无权访问` });
  if (level === "own" && access !== "owner")
    throw new TRPCError({ code: "FORBIDDEN", message: "仅库存所有者可执行此操作" });
  if (level === "write" && access === "viewer")
    throw new TRPCError({ code: "FORBIDDEN", message: "你对此库存只有查看权限" });
}

// 性别：male/female/unknown
const genderEnum = z.enum(["male", "female", "unknown"]);
// 小鼠状态：alive 存活 / sacrificed 处死 / dead 死亡 / culled 淘汰
const statusEnum = z.enum(["alive", "sacrificed", "dead", "culled"]);
// 看板颜色：#RRGGBB
const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色须为 #RRGGBB 格式");

/** 协作感知品系校验（批次#21）：按 id 取行，再按库存所有者域断言访问级别 */
async function getAccessibleStrain(userId: number, id: number, level: AccessLevel = "read") {
  const rows = await getDb().select().from(mouseStrains).where(eq(mouseStrains.id, id));
  const strain = rows[0];
  if (!strain) throw new TRPCError({ code: "NOT_FOUND", message: "品系不存在" });
  checkAccess(await stockAccess(userId, strain.userId), level, "品系");
  return strain;
}

/** 协作感知笼位校验（批次#21） */
async function getAccessibleCage(userId: number, id: number, level: AccessLevel = "read") {
  const rows = await getDb().select().from(mouseCages).where(eq(mouseCages.id, id));
  const cage = rows[0];
  if (!cage) throw new TRPCError({ code: "NOT_FOUND", message: "笼位不存在" });
  checkAccess(await stockAccess(userId, cage.userId), level, "笼位");
  return cage;
}

/** 协作感知小鼠校验（批次#21） */
async function getAccessibleMouse(userId: number, id: number, level: AccessLevel = "read") {
  const rows = await getDb().select().from(mice).where(eq(mice.id, id));
  const mouse = rows[0];
  if (!mouse) throw new TRPCError({ code: "NOT_FOUND", message: "小鼠不存在" });
  checkAccess(await stockAccess(userId, mouse.userId), level, "小鼠");
  return mouse;
}

/** 同品系耳号唯一校验：重复时 BAD_REQUEST（excludeId 用于更新时排除自身） */
async function assertEarNoUnique(userId: number, strainId: number, earNo: string, excludeId?: number) {
  const rows = await getDb()
    .select({ id: mice.id })
    .from(mice)
    .where(
      and(eq(mice.userId, userId), eq(mice.strainId, strainId), eq(mice.earNo, earNo)),
    );
  if (rows.some((r) => r.id !== excludeId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `该品系下耳号 ${earNo} 已存在` });
  }
}

/**
 * 耳号连号分配：扫描该品系下「前缀 + 纯数字」形态的已用编号，
 * 从 earStart（缺省 1）起跳过已用号码，一次返回 n 个可用耳号（批次内也不会重复）。
 */
async function allocateEarNos(
  userId: number,
  strainId: number,
  prefix: string,
  earStart: number | undefined,
  n: number,
): Promise<string[]> {
  const rows = await getDb()
    .select({ earNo: mice.earNo })
    .from(mice)
    .where(and(eq(mice.userId, userId), eq(mice.strainId, strainId)));
  // 只统计「前缀 + 纯数字」形态的已用编号；其它形态的手动耳号不参与连号
  const usedNums = new Set<number>();
  for (const r of rows) {
    if (prefix && !r.earNo.startsWith(prefix)) continue;
    const rest = prefix ? r.earNo.slice(prefix.length) : r.earNo;
    if (/^\d{1,6}$/.test(rest)) usedNums.add(Number(rest));
  }
  const out: string[] = [];
  let next = earStart ?? 1;
  while (out.length < n) {
    if (!usedNums.has(next)) {
      usedNums.add(next);
      out.push(`${prefix}${next}`);
    }
    next++;
  }
  return out;
}

/** 协作感知配种对校验（批次#21） */
async function getAccessiblePair(userId: number, id: number, level: AccessLevel = "read") {
  const rows = await getDb().select().from(mouseBreeding).where(eq(mouseBreeding.id, id));
  const pair = rows[0];
  if (!pair) throw new TRPCError({ code: "NOT_FOUND", message: "配种对不存在" });
  checkAccess(await stockAccess(userId, pair.userId), level, "配种对");
  return pair;
}

/** 品系统计：存活数/性别分布/未鉴定数/扩繁预警 */
type StrainStats = {
  alive: number;
  male: number;
  female: number;
  unknownGender: number;
  ungenotyped: number;
  alert: boolean;
};

function emptyStats(): StrainStats {
  return { alive: 0, male: 0, female: 0, unknownGender: 0, ungenotyped: 0, alert: false };
}

export const mouseRouter = createRouter({
  /** 品系列表：每品系附存活/性别/未鉴定统计与扩繁预警标记 */
  listStrains: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    // 批次#21：可见库存集合 = 自己 ∪ 我所在组被授权的库存（行带 userId 供前端按来源分组）
    const ids = await visibleStockOwnerIds(ctx.user.id);
    const strains = await db
      .select()
      .from(mouseStrains)
      .where(inArray(mouseStrains.userId, ids))
      .orderBy(asc(mouseStrains.createdAt));
    if (strains.length === 0) return [];
    // 可见库存全部存活小鼠，按品系聚合统计
    const aliveMice = await db
      .select({
        strainId: mice.strainId,
        gender: mice.gender,
        genotype: mice.genotype,
      })
      .from(mice)
      .where(and(inArray(mice.userId, ids), eq(mice.status, "alive")));
    const statsMap = new Map<number, StrainStats>();
    for (const m of aliveMice) {
      const s = statsMap.get(m.strainId) ?? emptyStats();
      s.alive += 1;
      if (m.gender === "male") s.male += 1;
      else if (m.gender === "female") s.female += 1;
      else s.unknownGender += 1;
      if (m.genotype == null) s.ungenotyped += 1;
      statsMap.set(m.strainId, s);
    }
    return strains.map((s) => {
      const stats = statsMap.get(s.id) ?? emptyStats();
      // 扩繁预警：阈值 > 0 且存活低于阈值
      stats.alert = s.lowStockThreshold > 0 && stats.alive < s.lowStockThreshold;
      return { ...s, stats };
    });
  }),

  /** 新建品系 */
  createStrain: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(80),
        background: z.string().max(80).optional(),
        genotypeDesc: z.string().max(200).optional(),
        maintenance: z.string().max(24).optional(),
        color: colorHex.optional(),
        lowStockThreshold: z.number().int().min(0).max(999).optional(),
        stockOwnerId: z.number().optional(), // 批次#21：目标库存（缺省自己；须 editor+）
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = input.stockOwnerId ?? ctx.user.id;
      await assertStockWritable(ctx.user.id, ownerId);
      const [{ id }] = await getDb()
        .insert(mouseStrains)
        .values({
          userId: ownerId,
          name: input.name,
          background: input.background ?? null,
          genotypeDesc: input.genotypeDesc ?? null,
          maintenance: input.maintenance ?? null,
          color: input.color ?? "#3E7C6B",
          lowStockThreshold: input.lowStockThreshold ?? 0,
        })
        .$returningId();
      return { id };
    }),

  /** 更新品系：全部字段可选 */
  updateStrain: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(80).optional(),
        background: z.string().max(80).nullish(),
        genotypeDesc: z.string().max(200).nullish(),
        maintenance: z.string().max(24).nullish(),
        color: colorHex.optional(),
        lowStockThreshold: z.number().int().min(0).max(999).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getAccessibleStrain(ctx.user.id, input.id, "write");
      const patch: Partial<{
        name: string;
        background: string | null;
        genotypeDesc: string | null;
        maintenance: string | null;
        color: string;
        lowStockThreshold: number;
      }> = {};
      if (input.name != null) patch.name = input.name;
      if (input.background !== undefined) patch.background = input.background || null;
      if (input.genotypeDesc !== undefined) patch.genotypeDesc = input.genotypeDesc || null;
      if (input.maintenance !== undefined) patch.maintenance = input.maintenance || null;
      if (input.color != null) patch.color = input.color;
      if (input.lowStockThreshold != null) patch.lowStockThreshold = input.lowStockThreshold;
      if (Object.keys(patch).length > 0) {
        // 权限已在 getAccessibleStrain 断言；drizzle undefined 跳过语义保证只写 patch 字段
        await getDb()
          .update(mouseStrains)
          .set(patch)
          .where(eq(mouseStrains.id, input.id));
      }
      return { ok: true };
    }),

  /** 删除品系：该品系仍有小鼠时拒绝 */
  removeStrain: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const strain = await getAccessibleStrain(ctx.user.id, input.id, "own");
      const db = getDb();
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(mice)
        .where(and(eq(mice.userId, strain.userId), eq(mice.strainId, input.id)));
      if (Number(cnt) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该品系下仍有小鼠，无法删除" });
      }
      await db.delete(mouseStrains).where(eq(mouseStrains.id, input.id));
      return { ok: true };
    }),

  /** 小鼠列表：多条件过滤，附品系名/笼号；周龄过滤仅对 birthDate 非空个体生效；createdAt desc，上限 500 */
  listMice: authedQuery
    .input(
      z
        .object({
          strainId: z.number().optional(),
          gender: z.enum(["male", "female", "unknown", "all"]).default("all"),
          status: z.enum(["alive", "sacrificed", "dead", "culled", "all"]).default("alive"),
          cageId: z.number().optional(),
          q: z.string().optional(),
          minAgeWeeks: z.number().int().min(0).max(200).optional(),
          maxAgeWeeks: z.number().int().min(0).max(200).optional(),
          ungenotyped: z.boolean().optional(), // true=仅存活未鉴定（基因型为空）
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // 批次#21：可见库存集合（行带 userId，前端按来源分组/筛选）
      const ids = await visibleStockOwnerIds(ctx.user.id);
      const conds = [inArray(mice.userId, ids)];
      if (input?.strainId != null) conds.push(eq(mice.strainId, input.strainId));
      if (input?.cageId != null) conds.push(eq(mice.cageId, input.cageId));
      if (input?.gender && input.gender !== "all") conds.push(eq(mice.gender, input.gender));
      if (input?.status && input.status !== "all") conds.push(eq(mice.status, input.status));
      if (input?.ungenotyped) conds.push(isNull(mice.genotype));
      if (input?.q) {
        const pattern = `%${input.q.toLowerCase()}%`;
        conds.push(sql`(
          lower(${mice.earNo}) like ${pattern}
          or lower(coalesce(${mice.genotype}, '')) like ${pattern}
          or lower(coalesce(${mice.notes}, '')) like ${pattern}
        )`);
      }
      // 周龄过滤：birthDate 非空时按 timestampdiff(week, birthDate, 当前日期) 计算
      if (input?.minAgeWeeks != null || input?.maxAgeWeeks != null) {
        conds.push(sql`${mice.birthDate} is not null`);
        if (input.minAgeWeeks != null) {
          conds.push(sql`timestampdiff(week, str_to_date(${mice.birthDate}, '%Y-%m-%d'), curdate()) >= ${input.minAgeWeeks}`);
        }
        if (input.maxAgeWeeks != null) {
          conds.push(sql`timestampdiff(week, str_to_date(${mice.birthDate}, '%Y-%m-%d'), curdate()) <= ${input.maxAgeWeeks}`);
        }
      }
      const rows = await getDb()
        .select({
          mouse: mice,
          strainName: mouseStrains.name,
          cageNo: mouseCages.cageNo,
        })
        .from(mice)
        .innerJoin(mouseStrains, eq(mouseStrains.id, mice.strainId))
        .leftJoin(mouseCages, eq(mouseCages.id, mice.cageId))
        .where(and(...conds))
        .orderBy(desc(mice.createdAt))
        .limit(500);
      return rows.map((r) => ({ ...r.mouse, strainName: r.strainName, cageNo: r.cageNo }));
    }),

  /** 登记小鼠：品系/笼位须为本人；同品系耳号重复时拒绝 */
  createMouse: authedQuery
    .input(
      z.object({
        strainId: z.number(),
        earNo: z.string().min(1).max(40),
        gender: genderEnum.default("unknown"),
        birthDate: dateStr.nullish(),
        genotype: z.string().max(40).optional(),
        cageId: z.number().optional(),
        source: z.string().max(24).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 批次#21：库存域由品系所有者决定；editor 代登记也归库存所有者域
      const strain = await getAccessibleStrain(ctx.user.id, input.strainId, "write");
      const ownerId = strain.userId;
      if (input.cageId != null) await getAccessibleCage(ctx.user.id, input.cageId, "write");
      await assertEarNoUnique(ownerId, input.strainId, input.earNo);
      const [{ id }] = await getDb()
        .insert(mice)
        .values({
          userId: ownerId,
          strainId: input.strainId,
          earNo: input.earNo,
          gender: input.gender,
          birthDate: input.birthDate ?? null,
          genotype: input.genotype ?? null,
          cageId: input.cageId ?? null,
          source: input.source ?? null,
          notes: input.notes ?? null,
        })
        .$returningId();
      return { id };
    }),

  /**
   * 按公母数量批量登记：一次登记 N 公 M 母（如购入一批/一窝分笼）。
   * 耳号按「前缀 + 数字」自动连号生成：服务端扫描该品系下同前缀已占用的纯数字编号，
   * 从 earStart（缺省 1）起跳过已用号码分配，杜绝唯一索引冲突。
   */
  batchCreateMice: authedQuery
    .input(
      z.object({
        strainId: z.number(),
        maleCount: z.number().int().min(0).max(200),
        femaleCount: z.number().int().min(0).max(200),
        earPrefix: z.string().max(32).optional(),
        earStart: z.number().int().min(1).max(999999).optional(),
        birthDate: dateStr.nullish(),
        genotype: z.string().max(40).optional(),
        cageId: z.number().optional(),
        source: z.string().max(24).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const total = input.maleCount + input.femaleCount;
      if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "公 / 母数量至少填一个" });
      const strain = await getAccessibleStrain(ctx.user.id, input.strainId, "write");
      const ownerId = strain.userId;
      if (input.cageId != null) await getAccessibleCage(ctx.user.id, input.cageId, "write");

      const prefix = (input.earPrefix ?? "").trim();
      // 一次分配 total 个再切分，避免公/母两次扫描互相看不见导致重号
      const allEarNos = await allocateEarNos(ownerId, input.strainId, prefix, input.earStart, total);
      const maleEarNos = allEarNos.slice(0, input.maleCount);
      const femaleEarNos = allEarNos.slice(input.maleCount);

      const common = {
        userId: ownerId,
        strainId: input.strainId,
        birthDate: input.birthDate ?? null,
        genotype: input.genotype ?? null,
        cageId: input.cageId ?? null,
        source: input.source ?? null,
        notes: input.notes ?? null,
      };
      await getDb()
        .insert(mice)
        .values([
          ...maleEarNos.map((earNo) => ({ ...common, earNo, gender: "male" })),
          ...femaleEarNos.map((earNo) => ({ ...common, earNo, gender: "female" })),
        ]);
      return { created: total, maleEarNos, femaleEarNos };
    }),

  /** 更新小鼠：createMouse 全字段可选版；耳号唯一冲突同样拦截 */
  updateMouse: authedQuery
    .input(
      z.object({
        id: z.number(),
        strainId: z.number().optional(),
        earNo: z.string().min(1).max(40).optional(),
        gender: genderEnum.optional(),
        birthDate: dateStr.nullish(),
        genotype: z.string().max(40).nullish(),
        cageId: z.number().nullish(),
        source: z.string().max(24).nullish(),
        notes: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mouse = await getAccessibleMouse(ctx.user.id, input.id, "write");
      const ownerId = mouse.userId;
      const nextStrainId = input.strainId ?? mouse.strainId;
      const nextEarNo = input.earNo ?? mouse.earNo;
      // 跨库存迁移品系不允许：目标品系须同库存域
      if (input.strainId != null) {
        const target = await getAccessibleStrain(ctx.user.id, input.strainId, "write");
        if (target.userId !== ownerId)
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能把小鼠迁移到其他所有者的库存" });
      }
      if (input.cageId != null) await getAccessibleCage(ctx.user.id, input.cageId, "write");
      // 品系或耳号有变化时重新校验唯一性（排除自身）
      if (input.strainId != null || input.earNo != null) {
        await assertEarNoUnique(ownerId, nextStrainId, nextEarNo, mouse.id);
      }
      const patch: Partial<{
        strainId: number;
        earNo: string;
        gender: string;
        birthDate: string | null;
        genotype: string | null;
        cageId: number | null;
        source: string | null;
        notes: string | null;
      }> = {};
      if (input.strainId != null) patch.strainId = input.strainId;
      if (input.earNo != null) patch.earNo = input.earNo;
      if (input.gender != null) patch.gender = input.gender;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate || null;
      if (input.genotype !== undefined) patch.genotype = input.genotype || null;
      if (input.cageId !== undefined) patch.cageId = input.cageId ?? null;
      if (input.source !== undefined) patch.source = input.source || null;
      if (input.notes !== undefined) patch.notes = input.notes || null;
      if (Object.keys(patch).length > 0) {
        await getDb()
          .update(mice)
          .set(patch)
          .where(eq(mice.id, input.id));
      }
      return { ok: true };
    }),

  /** 状态变更：处死/死亡/淘汰时 statusDate 取传入日期或今天；恢复 alive 时清空状态日期与原因 */
  setStatus: authedQuery
    .input(
      z.object({
        id: z.number(),
        status: statusEnum,
        date: dateStr.optional(),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getAccessibleMouse(ctx.user.id, input.id, "write");
      const today = new Date().toISOString().slice(0, 10);
      const patch =
        input.status === "alive"
          ? { status: "alive", statusDate: null, statusReason: null }
          : {
              status: input.status,
              statusDate: input.date ?? today,
              statusReason: input.reason ?? null,
            };
      await getDb()
        .update(mice)
        .set(patch)
        .where(eq(mice.id, input.id));
      return { ok: true };
    }),

  /** 删除小鼠：误登记物理删除（owner-only，批次#21） */
  removeMouse: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getAccessibleMouse(ctx.user.id, input.id, "own");
      await getDb().delete(mice).where(eq(mice.id, input.id));
      return { ok: true };
    }),

  /** 笼位列表：每笼附存活数与居住个体（限 alive），按房间、笼号排序 */
  listCages: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    // 批次#21：可见库存集合（行带 userId 供前端按来源分组）
    const ids = await visibleStockOwnerIds(ctx.user.id);
    const cages = await db
      .select()
      .from(mouseCages)
      .where(inArray(mouseCages.userId, ids))
      .orderBy(asc(mouseCages.room), asc(mouseCages.cageNo));
    if (cages.length === 0) return [];
    const occupants = await db
      .select({
        id: mice.id,
        earNo: mice.earNo,
        gender: mice.gender,
        cageId: mice.cageId,
        strainName: mouseStrains.name,
      })
      .from(mice)
      .innerJoin(mouseStrains, eq(mouseStrains.id, mice.strainId))
      .where(and(inArray(mice.userId, ids), eq(mice.status, "alive")));
    const occMap = new Map<number, { id: number; earNo: string; strainName: string; gender: string }[]>();
    for (const o of occupants) {
      if (o.cageId == null) continue;
      const list = occMap.get(o.cageId) ?? [];
      list.push({ id: o.id, earNo: o.earNo, strainName: o.strainName, gender: o.gender });
      occMap.set(o.cageId, list);
    }
    return cages.map((c) => {
      const list = occMap.get(c.id) ?? [];
      return { ...c, aliveCount: list.length, occupants: list };
    });
  }),

  /** 新建笼位 */
  createCage: authedQuery
    .input(
      z.object({
        cageNo: z.string().min(1).max(40),
        room: z.string().max(60).optional(),
        rack: z.string().max(60).optional(),
        stockOwnerId: z.number().optional(), // 批次#21：目标库存（缺省自己；须 editor+）
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = input.stockOwnerId ?? ctx.user.id;
      await assertStockWritable(ctx.user.id, ownerId);
      const [{ id }] = await getDb()
        .insert(mouseCages)
        .values({
          userId: ownerId,
          cageNo: input.cageNo,
          room: input.room ?? null,
          rack: input.rack ?? null,
        })
        .$returningId();
      return { id };
    }),

  /** 删除笼位：笼内有 alive 小鼠时拒绝；先把历史引用该笼的小鼠 cageId 置 null 再删 */
  removeCage: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cage = await getAccessibleCage(ctx.user.id, input.id, "own");
      const db = getDb();
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(mice)
        .where(and(eq(mice.userId, cage.userId), eq(mice.cageId, input.id), eq(mice.status, "alive")));
      if (Number(cnt) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "笼内仍有存活小鼠，无法删除" });
      }
      // 移出历史鼠（已处死/死亡/淘汰）的笼位引用，不受影响地保留台账
      await db
        .update(mice)
        .set({ cageId: null })
        .where(and(eq(mice.userId, cage.userId), eq(mice.cageId, input.id)));
      await db.delete(mouseCages).where(eq(mouseCages.id, input.id));
      return { ok: true };
    }),

  /** 总览：存活总数/品系数/笼位数/占用笼数/扩繁预警列表 */
  /** 配种对列表：附品系/亲本耳号/笼位标签；active 在前，按开始日期倒序 */
  listPairs: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    // 批次#21：可见库存集合（行带 userId 供前端按来源分组）
    const ids = await visibleStockOwnerIds(ctx.user.id);
    const pairs = await db
      .select()
      .from(mouseBreeding)
      .where(inArray(mouseBreeding.userId, ids))
      .orderBy(asc(mouseBreeding.status), desc(mouseBreeding.startDate), desc(mouseBreeding.createdAt));
    if (pairs.length === 0) return [];
    const strainIds = [...new Set(pairs.map((p) => p.strainId))];
    const mouseIds = [...new Set(pairs.flatMap((p) => [p.maleId, p.femaleId]))];
    const cageIds = [...new Set(pairs.map((p) => p.cageId).filter((v): v is number => v != null))];
    const [strainRows, mouseRows, cageRows] = await Promise.all([
      db.select({ id: mouseStrains.id, name: mouseStrains.name, color: mouseStrains.color })
        .from(mouseStrains)
        .where(inArray(mouseStrains.id, strainIds)),
      db.select({ id: mice.id, earNo: mice.earNo, status: mice.status })
        .from(mice)
        .where(inArray(mice.id, mouseIds)),
      cageIds.length
        ? db.select({ id: mouseCages.id, cageNo: mouseCages.cageNo })
            .from(mouseCages)
            .where(inArray(mouseCages.id, cageIds))
        : Promise.resolve([] as { id: number; cageNo: string }[]),
    ]);
    const sMap = new Map(strainRows.map((s) => [s.id, s]));
    const mMap = new Map(mouseRows.map((m) => [m.id, m]));
    const cMap = new Map(cageRows.map((c) => [c.id, c]));
    return pairs.map((p) => ({
      ...p,
      strain: sMap.get(p.strainId) ?? null,
      male: mMap.get(p.maleId) ?? null,
      female: mMap.get(p.femaleId) ?? null,
      cage: p.cageId != null ? (cMap.get(p.cageId) ?? null) : null,
    }));
  }),

  /** 建立配种对：同品系、♂/♀ 性别匹配、双方存活 */
  createPair: authedQuery
    .input(
      z.object({
        strainId: z.number(),
        maleId: z.number(),
        femaleId: z.number(),
        cageId: z.number().optional(),
        startDate: dateStr,
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.maleId === input.femaleId) throw new TRPCError({ code: "BAD_REQUEST", message: "公 / 母不能是同一只" });
      const strain = await getAccessibleStrain(ctx.user.id, input.strainId, "write");
      if (input.cageId != null) await getAccessibleCage(ctx.user.id, input.cageId, "write");
      const [male, female] = await Promise.all([
        getAccessibleMouse(ctx.user.id, input.maleId, "write"),
        getAccessibleMouse(ctx.user.id, input.femaleId, "write"),
      ]);
      // 批次#21：配种双方与品系须同属一个库存域（禁止跨库存组合）
      if (male.userId !== strain.userId || female.userId !== strain.userId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "配种双方与品系须属同一库存" });
      if (male.strainId !== input.strainId || female.strainId !== input.strainId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "配种双方须与所选品系一致" });
      }
      if (male.gender !== "male") throw new TRPCError({ code: "BAD_REQUEST", message: `#${male.earNo} 不是公鼠` });
      if (female.gender !== "female") throw new TRPCError({ code: "BAD_REQUEST", message: `#${female.earNo} 不是母鼠` });
      if (male.status !== "alive" || female.status !== "alive") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "配种双方须为存活状态" });
      }
      const [{ id }] = await getDb()
        .insert(mouseBreeding)
        .values({
          userId: strain.userId,
          strainId: input.strainId,
          maleId: input.maleId,
          femaleId: input.femaleId,
          cageId: input.cageId ?? null,
          startDate: input.startDate,
          notes: input.notes ?? null,
        })
        .$returningId();
      return { id };
    }),

  /** 结束配种：落结束日期与原因（亲本状态不受影响） */
  endPair: authedQuery
    .input(z.object({ id: z.number(), endDate: dateStr, endReason: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      await getAccessiblePair(ctx.user.id, input.id, "write");
      await getDb()
        .update(mouseBreeding)
        .set({ status: "ended", endDate: input.endDate, endReason: input.endReason ?? null })
        .where(eq(mouseBreeding.id, input.id));
      return { ok: true };
    }),

  /** 删除配种对记录（不影响小鼠台账） */
  removePair: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    // 批次#21：owner-only，并补存在性校验（原实现无行时静默成功）
    await getAccessiblePair(ctx.user.id, input.id, "own");
    await getDb().delete(mouseBreeding).where(eq(mouseBreeding.id, input.id));
    return { ok: true };
  }),

  /**
   * 幼崽批量登记（断奶分笼）：从配种对一次登记一胎
   * 品系沿用配种对、来源默认「自繁」、笼位缺省沿用配种笼；耳号连号避让；成功后胎次 +1
   */
  registerLitter: authedQuery
    .input(
      z.object({
        pairId: z.number(),
        maleCount: z.number().int().min(0).max(100),
        femaleCount: z.number().int().min(0).max(100),
        birthDate: dateStr,
        earPrefix: z.string().max(32).optional(),
        earStart: z.number().int().min(1).max(999999).optional(),
        cageId: z.number().optional(),
        genotype: z.string().max(40).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const total = input.maleCount + input.femaleCount;
      if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "公 / 母数量至少填一个" });
      const pair = await getAccessiblePair(ctx.user.id, input.pairId, "write");
      if (pair.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "该配种对已结束，不能登记幼崽" });
      const cageId = input.cageId ?? pair.cageId ?? null;
      if (cageId != null) await getAccessibleCage(ctx.user.id, cageId, "write");

      const prefix = (input.earPrefix ?? "").trim();
      const allEarNos = await allocateEarNos(pair.userId, pair.strainId, prefix, input.earStart, total);
      const maleEarNos = allEarNos.slice(0, input.maleCount);
      const femaleEarNos = allEarNos.slice(input.maleCount);
      const litterNo = pair.litters + 1;
      const common = {
        userId: pair.userId,
        strainId: pair.strainId,
        birthDate: input.birthDate,
        genotype: input.genotype ?? null,
        cageId,
        source: "自繁",
        notes: `配种对 #${pair.id} 第 ${litterNo} 胎`,
      };
      await getDb()
        .insert(mice)
        .values([
          ...maleEarNos.map((earNo) => ({ ...common, earNo, gender: "male" })),
          ...femaleEarNos.map((earNo) => ({ ...common, earNo, gender: "female" })),
        ]);
      await getDb()
        .update(mouseBreeding)
        .set({ litters: litterNo })
        .where(eq(mouseBreeding.id, pair.id));
      return { created: total, litterNo, maleEarNos, femaleEarNos };
    }),

  /**
   * 小鼠任务建议：从库存数据派生可执行事项（不入库，实时计算）
   * - alert：存活低于品系预警阈值 → 安排扩繁
   * - ungenotyped：存活但基因型为空 → 待鉴定（按品系聚合）
   * - wean：21-35 日龄且未分笼 → 断奶分笼
   * 前端一键转为全局待办（todos，text 前缀「【小鼠】」）
   */
  // 批次#21：任务建议仅针对自有库存派生（他人库存的任务应由其所有者处理，不越界生成）
  taskSuggestions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const strains = await db.select().from(mouseStrains).where(eq(mouseStrains.userId, ctx.user.id));
    const alive = await db
      .select({ strainId: mice.strainId, genotype: mice.genotype, birthDate: mice.birthDate, cageId: mice.cageId })
      .from(mice)
      .where(and(eq(mice.userId, ctx.user.id), eq(mice.status, "alive")));

    const byStrain = new Map<number, { alive: number; ungenotyped: number }>();
    let weanCount = 0;
    const nowMs = Date.now();
    for (const m of alive) {
      const e = byStrain.get(m.strainId) ?? { alive: 0, ungenotyped: 0 };
      e.alive++;
      if (!m.genotype) e.ungenotyped++;
      byStrain.set(m.strainId, e);
      if (m.birthDate && m.cageId == null) {
        const days = Math.floor((nowMs - new Date(`${m.birthDate}T00:00:00`).getTime()) / 86400000);
        if (days >= 21 && days <= 35) weanCount++;
      }
    }

    const suggestions: {
      kind: "alert" | "ungenotyped" | "wean" | "pairOverdue" | "pairAging";
      text: string;
      count: number;
    }[] = [];
    for (const s of strains) {
      const e = byStrain.get(s.id) ?? { alive: 0, ungenotyped: 0 };
      if (s.lowStockThreshold > 0 && e.alive < s.lowStockThreshold) {
        suggestions.push({
          kind: "alert",
          text: `${s.name} 库存不足（存活 ${e.alive}/阈值 ${s.lowStockThreshold}），安排扩繁`,
          count: s.lowStockThreshold - e.alive,
        });
      }
      if (e.ungenotyped > 0) {
        suggestions.push({
          kind: "ungenotyped",
          text: `${s.name} 有 ${e.ungenotyped} 只小鼠待鉴定基因型`,
          count: e.ungenotyped,
        });
      }
    }
    if (weanCount > 0) {
      suggestions.push({ kind: "wean", text: `${weanCount} 只小鼠到断奶周龄（3-5 周）且未分笼`, count: weanCount });
    }

    // 配种提醒：合笼超期未产（≥25 天且 0 胎）；老龄繁殖对（亲本任一方 ≥40 周龄）
    const activePairs = await db
      .select()
      .from(mouseBreeding)
      .where(and(eq(mouseBreeding.userId, ctx.user.id), eq(mouseBreeding.status, "active")));
    if (activePairs.length > 0) {
      const parentIds = [...new Set(activePairs.flatMap((p) => [p.maleId, p.femaleId]))];
      const parents = await db
        .select({ id: mice.id, earNo: mice.earNo, birthDate: mice.birthDate })
        .from(mice)
        .where(and(eq(mice.userId, ctx.user.id), inArray(mice.id, parentIds)));
      const pMap = new Map(parents.map((m) => [m.id, m]));
      const ageWeeksOf = (birthDate: string | null) =>
        birthDate ? Math.floor((nowMs - new Date(`${birthDate}T00:00:00`).getTime()) / (7 * 86400000)) : null;
      for (const p of activePairs) {
        const days = Math.floor((nowMs - new Date(`${p.startDate}T00:00:00`).getTime()) / 86400000);
        const label = `♂#${pMap.get(p.maleId)?.earNo ?? "?"} × ♀#${pMap.get(p.femaleId)?.earNo ?? "?"}`;
        if (p.litters === 0 && days >= 25) {
          suggestions.push({ kind: "pairOverdue", text: `配种对（${label}）合笼 ${days} 天未产仔，检查或更换`, count: 1 });
        }
        const ages = [ageWeeksOf(pMap.get(p.maleId)?.birthDate ?? null), ageWeeksOf(pMap.get(p.femaleId)?.birthDate ?? null)];
        const maxAge = Math.max(ages[0] ?? 0, ages[1] ?? 0);
        if (maxAge >= 40) {
          suggestions.push({ kind: "pairAging", text: `配种对（${label}）亲本已 ${maxAge} 周龄，建议安排更换繁殖对`, count: 1 });
        }
      }
    }
    return suggestions;
  }),

  /** 总览（批次#21 重构）：按库存来源分组聚合 stocks 数组；前端按「我的库存 / 各授权库存」分组渲染 */
  overview: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const ids = await visibleStockOwnerIds(ctx.user.id);
    const strains = await db
      .select()
      .from(mouseStrains)
      .where(inArray(mouseStrains.userId, ids));
    const cages = await db
      .select({ id: mouseCages.id, userId: mouseCages.userId })
      .from(mouseCages)
      .where(inArray(mouseCages.userId, ids));
    const aliveMice = await db
      .select({ strainId: mice.strainId, cageId: mice.cageId, userId: mice.userId })
      .from(mice)
      .where(and(inArray(mice.userId, ids), eq(mice.status, "alive")));
    const stocks = ids.map((ownerId) => {
      const myStrains = strains.filter((s) => s.userId === ownerId);
      const myCages = cages.filter((c) => c.userId === ownerId);
      const myMice = aliveMice.filter((m) => m.userId === ownerId);
      const aliveByStrain = new Map<number, number>();
      const occupiedCages = new Set<number>();
      for (const m of myMice) {
        aliveByStrain.set(m.strainId, (aliveByStrain.get(m.strainId) ?? 0) + 1);
        if (m.cageId != null) occupiedCages.add(m.cageId);
      }
      // 扩繁预警：阈值 > 0 且存活低于阈值
      const alerts = myStrains
        .filter((s) => s.lowStockThreshold > 0 && (aliveByStrain.get(s.id) ?? 0) < s.lowStockThreshold)
        .map((s) => ({
          strainId: s.id,
          name: s.name,
          alive: aliveByStrain.get(s.id) ?? 0,
          threshold: s.lowStockThreshold,
        }));
      return {
        ownerId,
        aliveTotal: myMice.length,
        strainTotal: myStrains.length,
        cageTotal: myCages.length,
        cageOccupied: occupiedCages.size,
        alerts,
      };
    });
    // 自有库存恒显示（空也显示「我的库存」）；授权库存仅在已有品系时显示
    return { stocks: stocks.filter((s) => s.ownerId === ctx.user.id || s.strainTotal > 0) };
  }),
});
