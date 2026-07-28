/**
 * Manual "node completed" marks for flow nodes.
 * The backend FlowNode model is { date, name } with no done flag, so nodes
 * are auto-complete once their date passes; a manual early check-off (the
 * day panel's 勾选完成 button) is persisted per-browser in localStorage.
 */
import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'benchlog:flowNodeDone:v1'

let cache: Set<string> | null = null
const listeners = new Set<() => void>()

function load(): Set<string> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    cache = new Set()
  }
  return cache
}

function persist(next: Set<string>) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    /* storage unavailable — session-only */
  }
  listeners.forEach((l) => l())
}

export function nodeDoneKey(flowId: number, nodeIndex: number): string {
  return `${flowId}:${nodeIndex}`
}

export function setNodeDone(flowId: number, nodeIndex: number, done: boolean) {
  const next = new Set(load())
  const k = nodeDoneKey(flowId, nodeIndex)
  if (done) next.add(k)
  else next.delete(k)
  persist(next)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): string {
  return [...load()].sort().join('|')
}

/** Reactive access to the manual done-set. */
export function useNodeDoneSet() {
  useSyncExternalStore(subscribe, getSnapshot)
  const isDone = useCallback((flowId: number, nodeIndex: number) => load().has(nodeDoneKey(flowId, nodeIndex)), [])
  const markDone = useCallback((flowId: number, nodeIndex: number, done: boolean) => setNodeDone(flowId, nodeIndex, done), [])
  return { isDone, markDone }
}
