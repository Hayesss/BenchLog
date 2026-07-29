import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ProtocolTagChip, { useProtocolTagColors } from './ProtocolTagChip'
import {
  CATEGORY_HUES,
  CATEGORY_OPTIONS,
  bumpVersion,
  wash,
  type ProtocolData,
  type ProtocolMaterial,
  type ProtocolParam,
  type ProtocolStepGroup,
} from './protocolShared'
import { cn } from '@/lib/utils'

export type ProtocolEditorMode = 'create' | 'edit' | 'publish'

interface Draft {
  name: string
  category: string
  color: string
  description: string
  tags: string[]
  materials: ProtocolMaterial[]
  params: ProtocolParam[]
  stepGroups: ProtocolStepGroup[]
}

const EMPTY_DRAFT: Draft = {
  name: '',
  category: '其他',
  color: CATEGORY_HUES[0],
  description: '',
  tags: [],
  materials: [],
  params: [],
  stepGroups: [],
}

function draftFrom(p: ProtocolData): Draft {
  return {
    name: p.name,
    category: p.category,
    color: p.color,
    description: p.description ?? '',
    tags: [...p.tags],
    materials: p.materials.map((m) => ({ ...m })),
    params: p.params.map((x) => ({ ...x })),
    stepGroups: p.stepGroups.map((g) => ({ title: g.title, steps: g.steps.map((s) => ({ ...s })) })),
  }
}

const INPUT =
  'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench'
const LABEL = 'mb-1 block text-[11.5px] font-medium tracking-[0.04em] text-ink-mute'
const SECTION = 'border-t border-line pt-4'

const TITLES: Record<ProtocolEditorMode, string> = {
  create: '新建方法',
  edit: '编辑方法',
  publish: '发布新版本',
}
const SUBTITLES: Record<ProtocolEditorMode, string> = {
  create: '从零记录一套实验流程，保存后自动生成 v1.0 初始版本。',
  edit: '直接修改当前版本内容，不产生历史版本快照。',
  publish: '先把当前内容存入版本历史，再以新版本号保存修改。',
}

export default function ProtocolEditorDialog({
  open,
  onOpenChange,
  mode,
  protocol,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: ProtocolEditorMode
  protocol?: ProtocolData | null
  onCreated?: (id: number) => void
}) {
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [version, setVersion] = useState('v1.0')
  const [note, setNote] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  const tagColors = useProtocolTagColors()
  const tagListQuery = trpc.tag.list.useQuery()
  const tagCreate = trpc.tag.create.useMutation({
    onSuccess: () => utils.tag.list.invalidate(),
  })

  useEffect(() => {
    if (!open) return
    if ((mode === 'edit' || mode === 'publish') && protocol) {
      setDraft(draftFrom(protocol))
      setVersion(mode === 'publish' ? bumpVersion(protocol.version) : protocol.version)
    } else {
      setDraft(EMPTY_DRAFT)
      setVersion('v1.0')
    }
    setNote('')
    setTagInput('')
  }, [open, mode, protocol])

  const createMut = trpc.protocol.create.useMutation()
  const updateMut = trpc.protocol.update.useMutation()
  const saveVersionMut = trpc.protocol.saveVersion.useMutation()

  const tagSuggestions = useMemo(() => {
    const existing = (tagListQuery.data ?? []).map((t) => t.name)
    const q = tagInput.trim().replace(/^#/, '')
    return existing
      .filter((n) => !draft.tags.includes(n) && (q === '' || n.toLowerCase().includes(q.toLowerCase())))
      .slice(0, 6)
  }, [tagListQuery.data, tagInput, draft.tags])

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function addTag(raw: string) {
    const name = raw.replace(/^#/, '').trim()
    if (!name || draft.tags.includes(name)) return
    patch('tags', [...draft.tags, name])
    if (!tagListQuery.data?.some((t) => t.name === name)) {
      tagCreate.mutate({ name })
    }
    setTagInput('')
  }

  async function submit() {
    if (!draft.name.trim()) {
      toast.error('请填写方法名称')
      return
    }
    const clean = {
      name: draft.name.trim(),
      category: draft.category,
      color: draft.color,
      description: draft.description.trim() || undefined,
      materials: draft.materials.filter((m) => m.name.trim()),
      stepGroups: draft.stepGroups
        .map((g) => ({ title: g.title.trim() || '步骤', steps: g.steps.filter((s) => s.text.trim()) }))
        .filter((g) => g.steps.length > 0),
      params: draft.params.filter((p) => p.name.trim() && p.value.trim()),
      tags: draft.tags,
    }
    setSaving(true)
    try {
      if (mode === 'create') {
        const { id } = await createMut.mutateAsync({ ...clean, version: version.trim() || 'v1.0' })
        await utils.protocol.list.invalidate()
        toast.success('方法已创建，初始版本 v1.0 已快照')
        onOpenChange(false)
        onCreated?.(id)
      } else if (mode === 'edit' && protocol) {
        await updateMut.mutateAsync({ id: protocol.id, ...clean })
        await Promise.all([utils.protocol.list.invalidate(), utils.protocol.byId.invalidate({ id: protocol.id })])
        toast.success('方法已更新')
        onOpenChange(false)
      } else if (mode === 'publish' && protocol) {
        await saveVersionMut.mutateAsync({ id: protocol.id, note: note.trim() || undefined })
        await updateMut.mutateAsync({ id: protocol.id, version: version.trim() || bumpVersion(protocol.version), ...clean })
        await Promise.all([
          utils.protocol.list.invalidate(),
          utils.protocol.byId.invalidate({ id: protocol.id }),
          utils.protocol.listVersions.invalidate({ protocolId: protocol.id }),
        ])
        toast.success(`已发布 ${version.trim()}，旧版已存入历史`)
        onOpenChange(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-line p-0">
        <DialogHeader className="border-b border-line px-5 py-4 text-left">
          <DialogTitle className="font-display text-[20px] font-semibold text-ink">{TITLES[mode]}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-ink-mute">{SUBTITLES[mode]}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 版本信息 */}
          {mode !== 'edit' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>版本号</label>
                <input
                  className={cn(INPUT, 'font-mono')}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="v1.0"
                />
              </div>
              {mode === 'publish' && (
                <div>
                  <label className={LABEL}>变更说明（写入版本历史）</label>
                  <input
                    className={INPUT}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="如：PEI 比例 3:1 → 2.5:1"
                  />
                </div>
              )}
            </div>
          )}

          {/* 基本信息 */}
          <div className="space-y-3">
            <div>
              <label className={LABEL}>方法名称 *</label>
              <input
                className={INPUT}
                value={draft.name}
                onChange={(e) => patch('name', e.target.value)}
                placeholder="如：慢病毒包装（293T · 三质粒）"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>分类</label>
                <Select value={draft.category} onValueChange={(v) => patch('category', v)}>
                  <SelectTrigger className="h-9 border-line-strong text-[13px] shadow-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...CATEGORY_OPTIONS, draft.category]
                      .filter((c, i, a) => a.indexOf(c) === i)
                      .map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={LABEL}>项目色</label>
                <div className="flex h-9 items-center gap-2">
                  {CATEGORY_HUES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`选择颜色 ${c}`}
                      onClick={() => patch('color', c)}
                      className={cn(
                        'h-6 w-6 rounded-full transition-transform duration-150',
                        draft.color === c ? 'scale-110 ring-2 ring-ink/30 ring-offset-2 ring-offset-surface' : 'hover:scale-110',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={LABEL}>简介</label>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
                value={draft.description}
                onChange={(e) => patch('description', e.target.value)}
                placeholder="原理概述 + 适用场景…"
              />
            </div>
            <div>
              <label className={LABEL}>标签（回车添加）</label>
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 shadow-card focus-within:border-bench">
                {draft.tags.map((t) => (
                  <ProtocolTagChip
                    key={t}
                    name={t}
                    color={tagColors.get(t)}
                    onRemove={() => patch('tags', draft.tags.filter((x) => x !== t))}
                  />
                ))}
                <input
                  className="h-6 min-w-[120px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-mute"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag(tagInput)
                    }
                  }}
                  placeholder={draft.tags.length === 0 ? '如 293T、慢病毒…' : ''}
                />
              </div>
              {tagInput.trim() && tagSuggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tagSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addTag(s)}
                      className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
                    >
                      #{s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 材料清单 */}
          <div className={SECTION}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">材料清单</h3>
              <button
                type="button"
                onClick={() => patch('materials', [...draft.materials, { name: '', catalog: '', amount: '' }])}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
              >
                <Plus className="h-3.5 w-3.5" /> 添加材料
              </button>
            </div>
            <div className="space-y-2">
              {draft.materials.length === 0 && (
                <p className="text-[12.5px] text-ink-mute">暂无材料，点击右上角添加。</p>
              )}
              {draft.materials.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={cn(INPUT, 'flex-[3]')}
                    value={m.name}
                    onChange={(e) =>
                      patch('materials', draft.materials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="材料名称"
                  />
                  <input
                    className={cn(INPUT, 'flex-[2] font-mono !text-[12px]')}
                    value={m.catalog ?? ''}
                    onChange={(e) =>
                      patch('materials', draft.materials.map((x, j) => (j === i ? { ...x, catalog: e.target.value } : x)))
                    }
                    placeholder="货号"
                  />
                  <input
                    className={cn(INPUT, 'flex-[1.5]')}
                    value={m.amount ?? ''}
                    onChange={(e) =>
                      patch('materials', draft.materials.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                    }
                    placeholder="用量"
                  />
                  <button
                    type="button"
                    aria-label="删除材料"
                    onClick={() => patch('materials', draft.materials.filter((_, j) => j !== i))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 关键参数 */}
          <div className={SECTION}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">关键参数</h3>
              <button
                type="button"
                onClick={() => patch('params', [...draft.params, { name: '', value: '', unit: '', note: '' }])}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
              >
                <Plus className="h-3.5 w-3.5" /> 添加参数
              </button>
            </div>
            <div className="space-y-2">
              {draft.params.length === 0 && <p className="text-[12.5px] text-ink-mute">暂无参数，点击右上角添加。</p>}
              {draft.params.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={cn(INPUT, 'flex-[2]')}
                    value={p.name}
                    onChange={(e) =>
                      patch('params', draft.params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="参数名"
                  />
                  <input
                    className={cn(INPUT, 'flex-[1.5] font-mono !text-[12px]')}
                    value={p.value}
                    onChange={(e) =>
                      patch('params', draft.params.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                    placeholder="默认值"
                  />
                  <input
                    className={cn(INPUT, 'w-16')}
                    value={p.unit ?? ''}
                    onChange={(e) =>
                      patch('params', draft.params.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
                    }
                    placeholder="单位"
                  />
                  <input
                    className={cn(INPUT, 'flex-[2]')}
                    value={p.note ?? ''}
                    onChange={(e) =>
                      patch('params', draft.params.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                    }
                    placeholder="备注"
                  />
                  <button
                    type="button"
                    aria-label="删除参数"
                    onClick={() => patch('params', draft.params.filter((_, j) => j !== i))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 操作步骤 */}
          <div className={SECTION}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">操作步骤</h3>
              <button
                type="button"
                onClick={() => patch('stepGroups', [...draft.stepGroups, { title: `阶段 ${draft.stepGroups.length + 1}`, steps: [{ text: '', duration: '' }] }])}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
              >
                <Plus className="h-3.5 w-3.5" /> 添加步骤组
              </button>
            </div>
            <div className="space-y-3">
              {draft.stepGroups.length === 0 && (
                <p className="text-[12.5px] text-ink-mute">暂无步骤，点击右上角添加步骤组。</p>
              )}
              {draft.stepGroups.map((g, gi) => (
                <div key={gi} className="rounded-lg border border-line p-3" style={{ backgroundColor: wash(draft.color, '0A') }}>
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      className={cn(INPUT, 'h-8 flex-1 font-medium')}
                      value={g.title}
                      onChange={(e) =>
                        patch('stepGroups', draft.stepGroups.map((x, j) => (j === gi ? { ...x, title: e.target.value } : x)))
                      }
                      placeholder="组名，如 Day 0 · 铺板"
                    />
                    <button
                      type="button"
                      aria-label="删除步骤组"
                      onClick={() => patch('stepGroups', draft.stepGroups.filter((_, j) => j !== gi))}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {g.steps.map((s, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right font-mono text-[12px] text-ink-mute">{si + 1}</span>
                        <input
                          className={cn(INPUT, 'h-8 flex-1')}
                          value={s.text}
                          onChange={(e) =>
                            patch(
                              'stepGroups',
                              draft.stepGroups.map((x, j) =>
                                j === gi
                                  ? { ...x, steps: x.steps.map((y, k) => (k === si ? { ...y, text: e.target.value } : y)) }
                                  : x,
                              ),
                            )
                          }
                          placeholder="步骤内容"
                        />
                        <input
                          className={cn(INPUT, 'h-8 w-24 font-mono !text-[12px]')}
                          value={s.duration ?? ''}
                          onChange={(e) =>
                            patch(
                              'stepGroups',
                              draft.stepGroups.map((x, j) =>
                                j === gi
                                  ? { ...x, steps: x.steps.map((y, k) => (k === si ? { ...y, duration: e.target.value } : y)) }
                                  : x,
                              ),
                            )
                          }
                          placeholder="时长"
                        />
                        <button
                          type="button"
                          aria-label="删除步骤"
                          onClick={() =>
                            patch(
                              'stepGroups',
                              draft.stepGroups.map((x, j) =>
                                j === gi ? { ...x, steps: x.steps.filter((_, k) => k !== si) } : x,
                              ),
                            )
                          }
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        patch(
                          'stepGroups',
                          draft.stepGroups.map((x, j) =>
                            j === gi ? { ...x, steps: [...x.steps, { text: '', duration: '' }] } : x,
                          ),
                        )
                      }
                      className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:text-bench"
                    >
                      <Plus className="h-3 w-3" /> 添加步骤
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="h-9 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:opacity-60"
          >
            {saving ? '保存中…' : mode === 'publish' ? `发布 ${version}` : mode === 'create' ? '创建方法' : '保存修改'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
