/**
 * Entity types for the Schedule page, derived from tRPC type inference
 * (type-only — erased at build; no runtime coupling to the backend).
 */
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../api/router'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type ScheduleFlow = RouterOutputs['flow']['list'][number]
export type FlowNode = ScheduleFlow['nodes'][number]
export type ScheduleTodo = RouterOutputs['todo']['listByRange'][number]
export type ScheduleProject = RouterOutputs['project']['list'][number]
export type ScheduleProtocol = RouterOutputs['protocol']['list'][number]

/** Muted category hues from design.md §3 — flow / project color swatches. */
export const FLOW_COLOR_SWATCHES = [
  '#3E7C6B', // teal · 慢病毒 / 默认
  '#5B7C99', // slate blue · 流式
  '#B08D57', // amber · WB / 蛋白
  '#B0707C', // rose · 转染优化
  '#8A7CA8', // violet · 单细胞
  '#7C9161', // sage · 细胞培养
] as const

/** 15% opacity wash of a hex color (design.md §3 wash rule). */
export function wash(hex: string, alpha = '26'): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex
}

/** Effective display color of a flow: project color wins, then flow color. */
export function flowColor(flow: ScheduleFlow): string {
  return flow.project?.color || flow.color || '#3E7C6B'
}
