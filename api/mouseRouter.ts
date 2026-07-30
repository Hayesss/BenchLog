import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { mouseStrains, mouseCages, mice } from "@db/schema";
import { dateStr } from "./zodSchemas";

// 性别：male/female/unknown
const genderEnum = z.enum(["male", "female", "unknown"]);
// 小鼠状态：alive 存活 / sacrificed 处死 / dead 死亡 / culled 淘汰
const statusEnum = z.enum(["alive", "sacrificed", "dead", "culled"]);
// 看板颜色：#RRGGBB
const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色须为 #RRGGBB 格式");

/** 归属校验：返回当前用户本人的品系，否则 NOT_FOUND */
async function getOwnedStrain(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(mouseStrains)
    .where(and(eq(mouseStrains.id, id), eq(mouseStrains.userId, userId)));
  const strain = rows[0];
  if (!strain) throw new TRPCError({ code: "NOT_FOUND", message: "品系不存在" });
  return strain;
}

/** 归属校验：返回当前用户本人的笼位，否则 NOT_FOUND */
async function getOwnedCage(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(mouseCages)
    .where(and(eq(mouseCages.id, id), eq(mouseCages.userId, userId)));
  const cage = rows[0];
  if (!cage) throw new TRPCError({ code: "NOT_FOUND", message: "笼位不存在" });
  return cage;
}

/** 归属校验：返回当前用户本人的小鼠，否则 NOT_FOUND */
async function getOwnedMouse(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(mice)
    .where(and(eq(mice.id, id), eq(mice.userId, userId)));
  const mouse = rows[0];
  if (!mouse) throw new TRPCError({ code: "NOT_FOUND", message: "小鼠不存在" });
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
    const strains = await db
      .select()
      .from(mouseStrains)
      .where(eq(mouseStrains.userId, ctx.user.id))
      .orderBy(asc(mouseStrains.createdAt));
    if (strains.length === 0) return [];
    // 该用户全部存活小鼠，按品系聚合统计
    const aliveMice = await db
      .select({
        strainId: mice.strainId,
        gender: mice.gender,
        genotype: mice.genotype,
      })
      .from(mice)
      .where(and(eq(mice.userId, ctx.user.id), eq(mice.status, "alive")));
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(mouseStrains)
        .values({
          userId: ctx.user.id,
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
      await getOwnedStrain(ctx.user.id, input.id);
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
        await getDb()
          .update(mouseStrains)
          .set(patch)
          .where(and(eq(mouseStrains.id, input.id), eq(mouseStrains.userId, ctx.user.id)));
      }
      return { ok: true };
    }),

  /** 删除品系：该品系仍有小鼠时拒绝 */
  removeStrain: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedStrain(ctx.user.id, input.id);
      const db = getDb();
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(mice)
        .where(and(eq(mice.userId, ctx.user.id), eq(mice.strainId, input.id)));
      if (Number(cnt) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该品系下仍有小鼠，无法删除" });
      }
      await db
        .delete(mouseStrains)
        .where(and(eq(mouseStrains.id, input.id), eq(mouseStrains.userId, ctx.user.id)));
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
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(mice.userId, ctx.user.id)];
      if (input?.strainId != null) conds.push(eq(mice.strainId, input.strainId));
      if (input?.cageId != null) conds.push(eq(mice.cageId, input.cageId));
      if (input?.gender && input.gender !== "all") conds.push(eq(mice.gender, input.gender));
      if (input?.status && input.status !== "all") conds.push(eq(mice.status, input.status));
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
      await getOwnedStrain(ctx.user.id, input.strainId);
      if (input.cageId != null) await getOwnedCage(ctx.user.id, input.cageId);
      await assertEarNoUnique(ctx.user.id, input.strainId, input.earNo);
      const [{ id }] = await getDb()
        .insert(mice)
        .values({
          userId: ctx.user.id,
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
      await getOwnedStrain(ctx.user.id, input.strainId);
      if (input.cageId != null) await getOwnedCage(ctx.user.id, input.cageId);

      const prefix = (input.earPrefix ?? "").trim();
      const rows = await getDb()
        .select({ earNo: mice.earNo })
        .from(mice)
        .where(and(eq(mice.userId, ctx.user.id), eq(mice.strainId, input.strainId)));
      // 只统计「前缀 + 纯数字」形态的已用编号；其它形态的手动耳号不参与连号
      const usedNums = new Set<number>();
      for (const r of rows) {
        if (prefix && !r.earNo.startsWith(prefix)) continue;
        const rest = prefix ? r.earNo.slice(prefix.length) : r.earNo;
        if (/^\d{1,6}$/.test(rest)) usedNums.add(Number(rest));
      }
      let next = input.earStart ?? 1;
      const alloc = (n: number): string[] => {
        const out: string[] = [];
        while (out.length < n) {
          if (!usedNums.has(next)) {
            usedNums.add(next);
            out.push(`${prefix}${next}`);
          }
          next++;
        }
        return out;
      };
      const maleEarNos = alloc(input.maleCount);
      const femaleEarNos = alloc(input.femaleCount);

      const common = {
        userId: ctx.user.id,
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
      const mouse = await getOwnedMouse(ctx.user.id, input.id);
      const nextStrainId = input.strainId ?? mouse.strainId;
      const nextEarNo = input.earNo ?? mouse.earNo;
      if (input.strainId != null) await getOwnedStrain(ctx.user.id, input.strainId);
      if (input.cageId != null) await getOwnedCage(ctx.user.id, input.cageId);
      // 品系或耳号有变化时重新校验唯一性（排除自身）
      if (input.strainId != null || input.earNo != null) {
        await assertEarNoUnique(ctx.user.id, nextStrainId, nextEarNo, mouse.id);
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
          .where(and(eq(mice.id, input.id), eq(mice.userId, ctx.user.id)));
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
      await getOwnedMouse(ctx.user.id, input.id);
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
        .where(and(eq(mice.id, input.id), eq(mice.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 删除小鼠：误登记物理删除 */
  removeMouse: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedMouse(ctx.user.id, input.id);
      await getDb()
        .delete(mice)
        .where(and(eq(mice.id, input.id), eq(mice.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 笼位列表：每笼附存活数与居住个体（限 alive），按房间、笼号排序 */
  listCages: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const cages = await db
      .select()
      .from(mouseCages)
      .where(eq(mouseCages.userId, ctx.user.id))
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
      .where(and(eq(mice.userId, ctx.user.id), eq(mice.status, "alive")));
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(mouseCages)
        .values({
          userId: ctx.user.id,
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
      await getOwnedCage(ctx.user.id, input.id);
      const db = getDb();
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(mice)
        .where(and(eq(mice.userId, ctx.user.id), eq(mice.cageId, input.id), eq(mice.status, "alive")));
      if (Number(cnt) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "笼内仍有存活小鼠，无法删除" });
      }
      // 移出历史鼠（已处死/死亡/淘汰）的笼位引用，不受影响地保留台账
      await db
        .update(mice)
        .set({ cageId: null })
        .where(and(eq(mice.userId, ctx.user.id), eq(mice.cageId, input.id)));
      await db
        .delete(mouseCages)
        .where(and(eq(mouseCages.id, input.id), eq(mouseCages.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 总览：存活总数/品系数/笼位数/占用笼数/扩繁预警列表 */
  overview: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const strains = await db
      .select()
      .from(mouseStrains)
      .where(eq(mouseStrains.userId, ctx.user.id));
    const cages = await db
      .select({ id: mouseCages.id })
      .from(mouseCages)
      .where(eq(mouseCages.userId, ctx.user.id));
    const aliveMice = await db
      .select({ strainId: mice.strainId, cageId: mice.cageId })
      .from(mice)
      .where(and(eq(mice.userId, ctx.user.id), eq(mice.status, "alive")));
    const aliveByStrain = new Map<number, number>();
    const occupiedCages = new Set<number>();
    for (const m of aliveMice) {
      aliveByStrain.set(m.strainId, (aliveByStrain.get(m.strainId) ?? 0) + 1);
      if (m.cageId != null) occupiedCages.add(m.cageId);
    }
    // 扩繁预警：阈值 > 0 且存活低于阈值
    const alerts = strains
      .filter((s) => s.lowStockThreshold > 0 && (aliveByStrain.get(s.id) ?? 0) < s.lowStockThreshold)
      .map((s) => ({
        strainId: s.id,
        name: s.name,
        alive: aliveByStrain.get(s.id) ?? 0,
        threshold: s.lowStockThreshold,
      }));
    return {
      aliveTotal: aliveMice.length,
      strainTotal: strains.length,
      cageTotal: cages.length,
      cageOccupied: occupiedCages.size,
      alerts,
    };
  }),
});
