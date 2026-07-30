import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'

/* ------------------------------------------------------------------ */
/* 移植自 wisp-science（ui/src/settings_view.rs）的模型档案常量表          */
/* ------------------------------------------------------------------ */

/** 一键预设（#334）：label / apiUrl / model——用户只需粘贴 API Key */
const MODEL_PRESETS = [
  { label: 'Kimi', apiUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  { label: 'GLM', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5' },
  { label: 'DeepSeek', apiUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' },
  { label: 'Kimi Coding', apiUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-coding' },
  { label: 'GLM Coding', apiUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', model: 'glm-5.2' },
] as const

/** 已知模型家族 → (最大输出 tokens, 上下文窗口)，前缀匹配、先中先得（长前缀在前） */
const MODEL_LIMITS: [string, number, number][] = [
  ['claude-opus-4-5', 64000, 200000],
  ['claude-opus-4', 128000, 1000000],
  ['claude-sonnet-4-5', 64000, 200000],
  ['claude-sonnet-4', 128000, 1000000],
  ['claude-sonnet-5', 128000, 1000000],
  ['claude-haiku-4-5', 64000, 200000],
  ['claude-fable-5', 128000, 1000000],
  ['claude-mythos', 128000, 1000000],
  ['gpt-5.6', 128000, 1050000],
  ['gpt-5.5', 128000, 1000000],
  ['gpt-5', 128000, 400000],
  ['gpt-4.1', 32768, 1000000],
  ['gpt-4o', 16384, 128000],
  ['deepseek-v4', 384000, 1000000],
  ['kimi-k3', 131072, 1000000],
  ['glm-5.2', 131072, 1000000],
  ['glm-5', 131072, 200000],
  ['glm-4.6', 131072, 200000],
]

/** 模型 ID 命中已知家族时，自动把限额填到文档上限；未知模型保持当前值 */
function knownModelLimits(model: string): { maxTokens: number; contextWindow: number } | null {
  const m = model.trim().toLowerCase()
  const hit = MODEL_LIMITS.find(([prefix]) => m.startsWith(prefix))
  return hit ? { maxTokens: hit[1], contextWindow: hit[2] } : null
}

/** 任一服务商都认识的全部 effort 值（未知模型时展示） */
const ALL_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']

/** 按模型家族精选的 reasoning effort 取值；null = 未知模型（给全量+提示） */
function knownEffortValues(model: string): string[] | null {
  const m = model.trim().toLowerCase()
  if (m.includes('codex-max')) return ['low', 'medium', 'high', 'xhigh']
  if (m.includes('gpt-5.1')) return ['none', 'low', 'medium', 'high']
  if (m.includes('gpt-5')) return ['minimal', 'low', 'medium', 'high']
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return ['low', 'medium', 'high']
  if (m.includes('grok')) return ['low', 'high']
  return null
}

/* ------------------------------------------------------------------ */
/* 类型与表单状态                                                        */
/* ------------------------------------------------------------------ */

type Profile = {
  id: number
  label: string
  apiUrl: string
  model: string
  hasApiKey: boolean
  keyPreview: string | null
  maxTokens: number
  contextWindow: number
  reasoningEffort: string
  active: boolean
}

type FormState = {
  id: number | null
  label: string
  apiUrl: string
  model: string
  apiKey: string
  maxTokens: number
  contextWindow: number
  reasoningEffort: string
}

const inputCls =
  'h-10 rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-bench'
const labelCls = 'flex flex-col gap-1.5'

function blankForm(): FormState {
  return {
    id: null,
    label: '',
    apiUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
    apiKey: '',
    maxTokens: 131072,
    contextWindow: 1000000,
    reasoningEffort: '',
  }
}

function formFromProfile(p: Profile): FormState {
  return {
    id: p.id,
    label: p.label,
    apiUrl: p.apiUrl,
    model: p.model,
    apiKey: '',
    maxTokens: p.maxTokens,
    contextWindow: p.contextWindow,
    reasoningEffort: p.reasoningEffort,
  }
}

/* ------------------------------------------------------------------ */
/* 模型档案设置对话框（列表 ↔ 表单 双视图）                                */
/* ------------------------------------------------------------------ */

export function AiModelSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const utils = trpc.useUtils()
  const profilesQ = trpc.aiProfile.list.useQuery(undefined, { enabled: open })
  const [form, setForm] = useState<FormState | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

  useEffect(() => {
    if (open) {
      setForm(null)
      setTestMsg(null)
    }
  }, [open])

  const invalidate = () => {
    void utils.aiProfile.list.invalidate()
    void utils.ai.getSettings.invalidate()
  }

  const createMut = trpc.aiProfile.create.useMutation({
    onSuccess: () => {
      toast.success('模型档案已添加')
      invalidate()
      setForm(null)
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const updateMut = trpc.aiProfile.update.useMutation({
    onSuccess: () => {
      toast.success('模型档案已保存')
      invalidate()
      setForm(null)
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const removeMut = trpc.aiProfile.remove.useMutation({
    onSuccess: () => {
      toast.success('已删除')
      setDeleteTarget(null)
      invalidate()
    },
    onError: (e) => {
      toast.error(`删除失败：${e.message}`)
      setDeleteTarget(null)
    },
  })
  const setActiveMut = trpc.aiProfile.setActive.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(`切换失败：${e.message}`),
  })
  const reorderMut = trpc.aiProfile.reorder.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(`排序失败：${e.message}`),
  })
  const testMut = trpc.aiProfile.test.useMutation({
    onSuccess: (r) => setTestMsg({ ok: true, text: r.message }),
    onError: (e) => setTestMsg({ ok: false, text: e.message }),
  })

  const profiles = useMemo(() => (profilesQ.data ?? []) as Profile[], [profilesQ.data])

  const move = (index: number, dir: -1 | 1) => {
    const ids = profiles.map((p) => p.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderMut.mutate({ ids })
  }

  const openPreset = (preset: (typeof MODEL_PRESETS)[number]) => {
    const limits = knownModelLimits(preset.model)
    setTestMsg(null)
    setForm({
      ...blankForm(),
      label: preset.label,
      apiUrl: preset.apiUrl,
      model: preset.model,
      ...(limits ?? { maxTokens: 8192, contextWindow: 128000 }),
    })
  }

  const saveForm = () => {
    if (!form) return
    const apiUrl = form.apiUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//.test(apiUrl)) {
      toast.error('接口地址须以 http(s):// 开头')
      return
    }
    if (!form.model.trim()) {
      toast.error('模型 ID 必填')
      return
    }
    const payload = {
      label: form.label.trim() || undefined,
      apiUrl,
      model: form.model.trim(),
      apiKey: form.apiKey === '' ? undefined : form.apiKey.trim(),
      maxTokens: form.maxTokens,
      contextWindow: form.contextWindow,
      reasoningEffort: form.reasoningEffort,
    }
    if (form.id != null) updateMut.mutate({ id: form.id, ...payload })
    else createMut.mutate(payload)
  }

  const effortValues = form ? (knownEffortValues(form.model) ?? ALL_EFFORT_VALUES) : []
  const effortKnown = form ? knownEffortValues(form.model) != null : true

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[16px]">
              {form ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  {form.id != null ? '编辑模型档案' : '添加模型档案'}
                </span>
              ) : (
                'AI 模型档案'
              )}
            </DialogTitle>
          </DialogHeader>

          {form === null ? (
            /* ------------------------------ 列表视图 ------------------------------ */
            <div>
              <p className="text-[12.5px] leading-[19px] text-ink-mute">
                支持任意 OpenAI 兼容接口，可保存多套配置并一键切换。API Key 仅存储在你的数据库中，用于服务端调用。
              </p>

              <div className="mt-3 flex flex-col gap-1.5">
                {profiles.map((p, i) => (
                  <div
                    key={p.id}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors duration-150',
                      p.active ? 'border-bench bg-bench-wash' : 'border-line bg-surface hover:bg-paper',
                    )}
                    onClick={() => {
                      setTestMsg(null)
                      setForm(formFromProfile(p))
                    }}
                  >
                    {/* 排序 */}
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(i, -1)
                        }}
                        className="rounded p-0.5 text-ink-mute transition-colors hover:text-ink disabled:opacity-25"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === profiles.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(i, 1)
                        }}
                        className="rounded p-0.5 text-ink-mute transition-colors hover:text-ink disabled:opacity-25"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    {/* 主信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink">{p.label}</span>
                        {p.active && (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-bench px-2 py-0.5 text-[11px] font-medium text-white">
                            <Check className="h-3 w-3" />
                            使用中
                          </span>
                        )}
                        {!p.hasApiKey && (
                          <span className="shrink-0 rounded-full bg-[#B98A3E1F] px-2 py-0.5 text-[11px] font-medium text-[#B98A3E]">
                            缺 Key
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-mute">
                        {p.model} · {p.apiUrl.replace(/^https?:\/\//, '')}
                      </p>
                    </div>
                    {/* 操作 */}
                    <div className="flex shrink-0 items-center gap-1">
                      {!p.active && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveMut.mutate({ id: p.id })
                            }}
                            className="flex h-7 items-center rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-bench hover:text-bench"
                          >
                            使用
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(p)
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-[#B4564E1A] hover:text-[#B4564E]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {profiles.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-mute">
                    还没有模型档案——从下方快速预设添加，只需粘贴 API Key
                  </p>
                )}
              </div>

              {/* 快速添加预设 */}
              <div className="mt-4">
                <p className="caption-en mb-2">快速添加 QUICK ADD</p>
                <div className="flex flex-wrap gap-1.5">
                  {MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => openPreset(preset)}
                      className="flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setTestMsg(null)
                      setForm(blankForm())
                    }}
                    className="flex h-8 items-center gap-1 rounded-lg bg-bench px-3 text-[12.5px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    自定义档案
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ------------------------------ 表单视图 ------------------------------ */
            <div>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span className="caption-en">名称 LABEL</span>
                  <input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder={form.model || '留空用模型 ID'}
                    className={cn(inputCls, 'font-sans')}
                  />
                </label>
                <label className={labelCls}>
                  <span className="caption-en">模型 MODEL</span>
                  <input
                    value={form.model}
                    onChange={(e) => {
                      const model = e.target.value
                      const limits = knownModelLimits(model)
                      setForm({ ...form, model, ...(limits ?? {}) })
                    }}
                    placeholder="kimi-k3"
                    className={inputCls}
                  />
                </label>
                <label className={cn(labelCls, 'sm:col-span-2')}>
                  <span className="caption-en">接口地址 BASE URL</span>
                  <input
                    value={form.apiUrl}
                    onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                    placeholder="https://api.moonshot.cn/v1"
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  <span className="caption-en">最大输出 MAX TOKENS</span>
                  <input
                    type="number"
                    min={16}
                    value={form.maxTokens}
                    onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  <span className="caption-en">上下文窗口 CONTEXT</span>
                  <input
                    type="number"
                    min={4096}
                    step={1024}
                    value={form.contextWindow}
                    onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </label>
                <label className={cn(labelCls, 'sm:col-span-2')}>
                  <span className="caption-en">推理强度 REASONING EFFORT</span>
                  <select
                    value={form.reasoningEffort}
                    onChange={(e) => setForm({ ...form, reasoningEffort: e.target.value })}
                    className={cn(inputCls, 'font-sans')}
                  >
                    <option value="">默认（不传该参数）</option>
                    {effortValues.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                    {form.reasoningEffort !== '' && !effortValues.includes(form.reasoningEffort) && (
                      <option value={form.reasoningEffort}>{form.reasoningEffort}</option>
                    )}
                  </select>
                  <span className="text-[11.5px] leading-[16px] text-ink-mute">
                    {effortKnown
                      ? '该模型家族已确认的取值范围。'
                      : '未确认的模型：该参数可能被服务商拒绝，建议保持默认。'}
                  </span>
                </label>
                <label className={cn(labelCls, 'sm:col-span-2')}>
                  <span className="caption-en">API KEY</span>
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={
                      form.id != null && profiles.find((p) => p.id === form.id)?.hasApiKey
                        ? `已保存（${profiles.find((p) => p.id === form.id)?.keyPreview}），留空保持不变`
                        : 'sk-…'
                    }
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </label>
              </div>

              {testMsg && (
                <p
                  className={cn(
                    'mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-[18px]',
                    testMsg.ok ? 'bg-[#4C8C6B1A] text-[#4C8C6B]' : 'bg-[#B4564E1A] text-[#B4564E]',
                  )}
                >
                  {testMsg.text}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  disabled={testMut.isPending}
                  onClick={() => {
                    setTestMsg(null)
                    testMut.mutate({
                      id: form.id ?? undefined,
                      apiUrl: form.apiUrl.trim().replace(/\/+$/, ''),
                      model: form.model.trim(),
                      apiKey: form.apiKey === '' ? undefined : form.apiKey.trim(),
                      maxTokens: form.maxTokens,
                    })
                  }}
                  className="flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench disabled:opacity-50"
                >
                  {testMut.isPending ? '测试中…' : '测试连接'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="flex h-9 items-center rounded-lg px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-paper"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={saveForm}
                    disabled={createMut.isPending || updateMut.isPending}
                    className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
                  >
                    {createMut.isPending || updateMut.isPending ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型档案</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteTarget?.label}」吗？已保存的 API Key 会一并清除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger"
              onClick={() => deleteTarget && removeMut.mutate({ id: deleteTarget.id })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
