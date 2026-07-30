/** 小鼠模块共享元数据与工具 */

export const GENDER_META: Record<string, { label: string; short: string; color: string }> = {
  male: { label: '雄性', short: '♂', color: '#5B7C99' },
  female: { label: '雌性', short: '♀', color: '#B0707C' },
  unknown: { label: '未知', short: '?', color: '#8A9099' },
}

export const MOUSE_STATUS: Record<string, { label: string; color: string; chip: string }> = {
  alive: { label: '存活', color: '#4C8C6B', chip: 'bg-success/10 text-success' },
  sacrificed: { label: '处死', color: '#8A9099', chip: 'bg-ink/8 text-ink-mute' },
  dead: { label: '死亡', color: '#B4564E', chip: 'bg-danger/10 text-danger' },
  culled: { label: '淘汰', color: '#B98A3E', chip: 'bg-warning/10 text-warning' },
}

/** 周龄：birthDate(YYYY-MM-DD) 到今天满几周；空返回 null */
export function ageWeeks(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const d = new Date(birthDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 0) return null
  return Math.floor(days / 7)
}

/** 日龄友好展示：<2 周显示天数，否则周数 */
export function ageLabel(birthDate: string | null | undefined): string {
  if (!birthDate) return '—'
  const d = new Date(birthDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 0) return '—'
  if (days < 14) return `${days} 天`
  return `${Math.floor(days / 7)} 周`
}

export const SOURCES = ['自繁', '购入', '赠送'] as const
