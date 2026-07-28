/**
 * Local-date helpers for the Schedule page.
 * All domain dates are local 'YYYY-MM-DD' strings — never use toISOString()
 * (it converts to UTC and shifts the day in non-UTC timezones).
 */

export const DAY_MS = 24 * 60 * 60 * 1000

const RE_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isDayStr(s: string): boolean {
  return RE_DAY.test(s)
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date. */
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Format a Date as a local 'YYYY-MM-DD' string. */
export function fmtDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return fmtDay(new Date())
}

export function addDaysStr(s: string, n: number): string {
  return fmtDay(new Date(parseDay(s).getTime() + n * DAY_MS))
}

/** Whole days from b to a (a - b). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / DAY_MS)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'] as const
export const WEEKDAY_FULL_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(s: string): number {
  return (parseDay(s).getDay() + 6) % 7
}

export function weekdayLabel(s: string): string {
  return WEEKDAY_FULL_CN[weekdayIndex(s)]
}

/** '2025-06-16' -> '06-16' */
export function shortDay(s: string): string {
  return s.slice(5)
}

/** '2025-06-16' -> '6 月 16 日 周一' */
export function longDayLabel(s: string): string {
  const d = parseDay(s)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAY_FULL_CN[weekdayIndex(s)]}`
}

/** Monday of the week containing the given day. */
export function weekStart(s: string): string {
  return addDaysStr(s, -weekdayIndex(s))
}

/**
 * 42 day strings (6 weeks, Monday-first) covering the given month —
 * includes leading/trailing days from adjacent months.
 */
export function monthGridDays(year: number, month0: number): string[] {
  const first = fmtDay(new Date(year, month0, 1))
  const start = weekStart(first)
  return Array.from({ length: 42 }, (_, i) => addDaysStr(start, i))
}

/** Days covered by a view: month view -> 42 grid days; week view -> 7 days. */
export function viewRangeDays(
  view: 'month' | 'week',
  cursorYear: number,
  cursorMonth0: number,
  cursorDay: string,
): string[] {
  if (view === 'week') {
    const start = weekStart(cursorDay)
    return Array.from({ length: 7 }, (_, i) => addDaysStr(start, i))
  }
  return monthGridDays(cursorYear, cursorMonth0)
}

export function monthLabel(year: number, month0: number): string {
  return `${year} 年 ${month0 + 1} 月`
}
