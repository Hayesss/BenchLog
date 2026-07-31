import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { hashPassword, verifyPassword } from "./lib/password";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";
import type { TrpcContext } from "./context";

// 本地账号的用户名规则；unionId 用 local: 前缀合成，与 Kimi OAuth 用户天然隔离
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const localUnionId = (username: string) => `local:${username.trim().toLowerCase()}`;

// 签发与 OAuth 回调一致的会话 cookie（JWT HS256，httpOnly）
async function issueSession(ctx: TrpcContext, unionId: string) {
  const token = await signSessionToken({ unionId, clientId: env.appId });
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

export const authRouter = createRouter({
  me: authedQuery.query((opts) => {
    // 剥离密码哈希，绝不下发到前端（解构-rest 为 TS 认可的剔除写法）
    const { passwordHash: _, ...safeUser } = opts.ctx.user;
    return safeUser;
  }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),

  // 注册开关（前端据此决定是否展示注册入口）
  registrationEnabled: publicQuery.query(() => ({
    enabled: env.registrationEnabled,
  })),

  // 本地账号注册：用户名 + 密码，成功后直接种下会话（与 OAuth 登录等价）
  register: publicQuery
    .input(
      z.object({
        username: z
          .string()
          .regex(USERNAME_RE, "用户名需为 3-32 位字母、数字、下划线或短横线"),
        password: z.string().min(8, "密码至少 8 位").max(72, "密码最长 72 位"),
        name: z.string().trim().max(64).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!env.registrationEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "当前未开放注册，请联系管理员",
        });
      }
      const unionId = localUnionId(input.username);
      const exists = await findUserByUnionId(unionId);
      if (exists) {
        throw new TRPCError({ code: "CONFLICT", message: "该用户名已被注册" });
      }
      await upsertUser({
        unionId,
        name: input.name?.trim() || input.username.trim(),
        passwordHash: hashPassword(input.password),
        lastSignInAt: new Date(),
      });
      await issueSession(ctx, unionId);
      return { success: true };
    }),

  // 本地账号密码登录
  loginPassword: publicQuery
    .input(
      z.object({
        username: z.string().min(1, "请输入用户名"),
        password: z.string().min(1, "请输入密码"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const unionId = localUnionId(input.username);
      const user = await findUserByUnionId(unionId);
      // 用户不存在 / 非本地账号（无密码哈希）统一报同一句话，不泄露账号是否存在
      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "用户名或密码不正确",
        });
      }
      if (!verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "用户名或密码不正确",
        });
      }
      await upsertUser({ unionId, lastSignInAt: new Date() });
      await issueSession(ctx, unionId);
      return { success: true };
    }),
});
