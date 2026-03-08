'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type GapMap = {
  id: string
  title: string
  status: string
  client_name: string
  leaders: string[]
  project_id: string | null
  created_at: string
  updated_at: string
}

type GapCategory = {
  id: string
  gap_map_id: string
  category_name: string
  severity: string | null
  key_divergence: string
  recommendation: string
  sort_order: number
}

type LeaderNote = {
  id?: string
  gap_map_id: string
  gap_map_category_id: string
  leader_index: number
  note_text: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORY_ORDER = [
  'Mission',
  'Positioning',
  'Value Proposition',
  'Audience',
  'Voice & Tone',
  'Internal vs. External',
]

const SEVERITY_OPTIONS = [
  { value: 'aligned',     label: 'Aligned',              symbol: '✓', ring: 'border-green-400  bg-green-50  text-green-700',  badge: 'bg-green-100  text-green-800'  },
  { value: 'minor_drift', label: 'Minor Drift',           symbol: '~', ring: 'border-yellow-400 bg-yellow-50 text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  { value: 'tension',     label: 'Active Tension',        symbol: '!', ring: 'border-orange-400 bg-orange-50 text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  { value: 'critical',    label: 'Critical Misalignment', symbol: '✕', ring: 'border-red-400    bg-red-50    text-red-700',    badge: 'bg-red-100    text-red-800'    },
]

const SEVERITY_RANK: Record<string, number> = {
  critical: 0, tension: 1, minor_drift: 2, aligned: 3,
}

function severityBadge(value: string | null) {
  const opt = SEVERITY_OPTIONS.find((s) => s.value === value)
  if (!opt) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${opt.badge}`}>
      {opt.symbol} {opt.label}
    </span>
  )
}

// ─── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GapMapEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [map, setMap] = useState<GapMap | null>(null)
  const [categories, setCategories] = useState<GapCategory[]>([])
  const [notes, setNotes] = useState<LeaderNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<'setup' | 'capture' | 'map'>('capture')
  const [openCatId, setOpenCatId] = useState<string | null>(null)

  // ─── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const load = async () => {
      const [{ data: mapData }, { data: catData }, { data: noteData }] = await Promise.all([
        supabase.from('gap_maps').select('*').eq('id', id).single(),
        supabase.from('gap_map_categories').select('*').eq('gap_map_id', id).order('sort_order'),
        supabase.from('gap_map_leader_notes').select('*').eq('gap_map_id', id),
      ])

      if (mapData) {
        setMap({
          ...mapData,
          client_name: mapData.client_name ?? '',
          leaders: mapData.leaders ?? ['CEO / Founder', 'Leader 2', 'Leader 3', 'Leader 4', 'Leader 5', 'Leader 6'],
        })
      }
      if (catData) {
        // Sort by CATEGORY_ORDER
        const sorted = [...catData].sort(
          (a, b) => CATEGORY_ORDER.indexOf(a.category_name) - CATEGORY_ORDER.indexOf(b.category_name)
        )
        setCategories(sorted.map((c) => ({
          ...c,
          key_divergence: c.key_divergence ?? '',
          recommendation: c.recommendation ?? '',
        })))
        if (sorted.length > 0 && !openCatId) setOpenCatId(sorted[0].id)
      }
      if (noteData) setNotes(noteData.map((n) => ({ ...n, note_text: n.note_text ?? '' })))
      setLoading(false)
    }
    load()
  }, [id])

  // ─── Save map header ─────────────────────────────────────────────────────────
  const debouncedMap = useDebounce(map, 800)
  const didMountMap = useRef(false)
  useEffect(() => {
    if (!didMountMap.current) { didMountMap.current = true; return }
    if (!debouncedMap) return
    setSaving(true)
    supabase
      .from('gap_maps')
      .update({
        title: debouncedMap.title,
        client_name: debouncedMap.client_name,
        leaders: debouncedMap.leaders,
        status: debouncedMap.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .then(() => { setSaving(false); setSavedAt(new Date()) })
  }, [debouncedMap])

  // ─── Save category ───────────────────────────────────────────────────────────
  const saveCategoryDebounced = useCallback(
    (() => {
      const timers: Record<string, ReturnType<typeof setTimeout>> = {}
      return (cat: GapCategory) => {
        if (timers[cat.id]) clearTimeout(timers[cat.id])
        timers[cat.id] = setTimeout(async () => {
          setSaving(true)
          await supabase
            .from('gap_map_categories')
            .update({
              severity: cat.severity,
              key_divergence: cat.key_divergence,
              recommendation: cat.recommendation,
              updated_at: new Date().toISOString(),
            })
            .eq('id', cat.id)
          setSaving(false)
          setSavedAt(new Date())
        }, 600)
      }
    })(),
    []
  )

  // ─── Save leader note ─────────────────────────────────────────────────────────
  const saveNoteDebounced = useCallback(
    (() => {
      const timers: Record<string, ReturnType<typeof setTimeout>> = {}
      return (note: LeaderNote) => {
        const key = `${note.gap_map_category_id}-${note.leader_index}`
        if (timers[key]) clearTimeout(timers[key])
        timers[key] = setTimeout(async () => {
          setSaving(true)
          await supabase
            .from('gap_map_leader_notes')
            .upsert(
              {
                gap_map_id: note.gap_map_id,
                gap_map_category_id: note.gap_map_category_id,
                leader_index: note.leader_index,
                note_text: note.note_text,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'gap_map_category_id,leader_index' }
            )
          setSaving(false)
          setSavedAt(new Date())
        }, 600)
      }
    })(),
    []
  )

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const updateMap = (patch: Partial<GapMap>) => setMap((m) => m ? { ...m, ...patch } : m)

  const updateCategory = (catId: string, patch: Partial<GapCategory>) => {
    setCategories((prev) => {
      const updated = prev.map((c) => c.id === catId ? { ...c, ...patch } : c)
      const cat = updated.find((c) => c.id === catId)
      if (cat) saveCategoryDebounced(cat)
      return updated
    })
  }

  const getNote = (catId: string, leaderIdx: number): string => {
    return notes.find((n) => n.gap_map_category_id === catId && n.leader_index === leaderIdx)?.note_text ?? ''
  }

  const updateNote = (catId: string, leaderIdx: number, text: string) => {
    const existing = notes.find((n) => n.gap_map_category_id === catId && n.leader_index === leaderIdx)
    const updated: LeaderNote = existing
      ? { ...existing, note_text: text }
      : { gap_map_id: id, gap_map_category_id: catId, leader_index: leaderIdx, note_text: text }

    setNotes((prev) => {
      const without = prev.filter((n) => !(n.gap_map_category_id === catId && n.leader_index === leaderIdx))
      return [...without, updated]
    })
    saveNoteDebounced(updated)
  }

  const markComplete = async () => {
    updateMap({ status: 'complete' })
  }

  const deleteGapMap = async () => {
    if (!map) return
    if (!confirm(`Delete "${map.title}"? This cannot be undone.`)) return
    await supabase.from('gap_map_leader_notes').delete().eq('gap_map_id', id)
    await supabase.from('gap_map_categories').delete().eq('gap_map_id', id)
    await supabase.from('gap_maps').delete().eq('id', id)
    router.push('/dashboard/admin/gap-maps')
  }

  // ─── Sorted for gap map view ─────────────────────────────────────────────────
  const sortedByPriority = [...categories].sort((a, b) =>
    (SEVERITY_RANK[a.severity ?? ''] ?? 99) - (SEVERITY_RANK[b.severity ?? ''] ?? 99)
  )

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading gap map…</div>
  if (!map) return <div className="p-8 text-red-400 text-sm">Gap map not found.</div>

  const tabs = [
    { id: 'setup'   as const, label: 'Setup' },
    { id: 'capture' as const, label: 'Capture' },
    { id: 'map'     as const, label: 'Gap Map' },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">
      {/* ── Page Header ── */}
      <div className="px-6 pt-8 pb-6" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 55%)' }}>
        <div className="max-w-4xl mx-auto">
          {/* Back + save indicator */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.push('/dashboard/admin/gap-maps')}
              className="text-[#7EC8A0] hover:text-white text-sm transition flex items-center gap-1">
              ← Gap Maps
            </button>
            <div className="flex items-center gap-3">
              {saving && <span className="text-xs text-neutral-500">Saving…</span>}
              {!saving && savedAt && (
                <span className="text-xs text-neutral-600">
                  Saved {savedAt.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {map.status !== 'complete' && (
                <button
                  onClick={markComplete}
                  className="text-xs font-medium px-3 py-1.5 bg-[#F04D3D] text-white rounded-lg hover:bg-[#d43f30] transition"
                >
                  Mark Complete
                </button>
              )}
              {map.status === 'complete' && (
                <span className="text-xs font-semibold px-3 py-1.5 bg-green-600 text-white rounded-lg">
                  ✓ Complete
                </span>
              )}
              <button
                onClick={deleteGapMap}
                className="text-xs text-neutral-500 hover:text-red-400 transition px-2 py-1.5"
                title="Delete gap map"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Title (inline editable) */}
          <input
            value={map.title}
            onChange={(e) => updateMap({ title: e.target.value })}
            className="w-full bg-transparent text-white text-2xl font-bold placeholder-neutral-600 outline-none border-b border-transparent focus:border-neutral-700 pb-1 transition"
            placeholder="Gap Map Title"
          />
          {map.client_name && (
            <p className="text-neutral-400 text-sm mt-1">{map.client_name}</p>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-black border-b border-neutral-800 px-6">
        <div className="max-w-4xl mx-auto flex gap-0">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                activeTab === tab.id
                  ? 'border-[#F04D3D] text-[#F04D3D]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-6 pt-6">

        {/* ══ SETUP TAB ══ */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
              <h2 className="font-semibold text-neutral-900">Map Details</h2>

              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Title</label>
                <input
                  value={map.title}
                  onChange={(e) => updateMap({ title: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. Sheni's Auto Trend — Alignment Map"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Client / Company Name</label>
                <input
                  value={map.client_name}
                  onChange={(e) => updateMap({ client_name: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. Sheni's Auto Trend"
                />
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-neutral-900">Leader Names</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Name the 1–6 leaders you interviewed. These appear as column headers in Capture mode.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {map.leaders.map((name, i) => (
                  <div key={i}>
                    <label className="text-xs font-medium text-neutral-400">Leader {i + 1}</label>
                    <input
                      value={name}
                      onChange={(e) => {
                        const updated = [...map.leaders]
                        updated[i] = e.target.value
                        updateMap({ leaders: updated })
                      }}
                      className="mt-1 w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      placeholder={`Leader ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveTab('capture')}
                className="bg-black text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-neutral-800 transition"
              >
                Go to Capture →
              </button>
            </div>
          </div>
        )}

        {/* ══ CAPTURE TAB ══ */}
        {activeTab === 'capture' && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 mb-4">
              Work through each category. Enter what each leader said, score the severity, note the key divergence and your recommendation.
            </p>

            {categories.map((cat) => {
              const isOpen = openCatId === cat.id
              const sev = SEVERITY_OPTIONS.find((s) => s.value === cat.severity)
              const activeLeaders = map.leaders.filter((l) => l.trim() !== '')

              return (
                <div key={cat.id} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                  {/* Category header */}
                  <button
                    onClick={() => setOpenCatId(isOpen ? null : cat.id)}
                    className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="text-xs font-mono text-neutral-400 w-4 shrink-0">
                      {String(CATEGORY_ORDER.indexOf(cat.category_name) + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-neutral-900">{cat.category_name}</span>
                      {cat.severity && severityBadge(cat.severity)}
                    </div>
                    <span className={`text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-neutral-100 px-6 pb-6 pt-5 space-y-6">

                      {/* Severity selector */}
                      <div>
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Severity</p>
                        <div className="flex flex-wrap gap-2">
                          {SEVERITY_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => updateCategory(cat.id, { severity: opt.value })}
                              className={`text-xs font-semibold px-4 py-2 rounded-xl border-2 transition ${
                                cat.severity === opt.value ? opt.ring : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                              }`}
                            >
                              {opt.symbol} {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Leader notes */}
                      <div>
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                          Leader Notes <span className="font-normal normal-case text-neutral-400">— what each person actually said</span>
                        </p>
                        <div className="space-y-3">
                          {map.leaders.map((leaderName, idx) => (
                            <div key={idx} className="flex gap-3">
                              <div className="w-28 shrink-0 pt-2">
                                <p className="text-xs font-medium text-neutral-500 truncate" title={leaderName}>
                                  {leaderName || `Leader ${idx + 1}`}
                                </p>
                              </div>
                              <textarea
                                value={getNote(cat.id, idx)}
                                onChange={(e) => updateNote(cat.id, idx, e.target.value)}
                                rows={2}
                                placeholder={`What ${leaderName || `Leader ${idx + 1}`} said…`}
                                className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 placeholder-neutral-300"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Key divergence */}
                      <div>
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Key Divergence</label>
                        <p className="text-xs text-neutral-400 mb-2">What's the core tension or misalignment you observed?</p>
                        <textarea
                          value={cat.key_divergence}
                          onChange={(e) => updateCategory(cat.id, { key_divergence: e.target.value })}
                          rows={2}
                          placeholder="e.g. CEO defines the audience as enterprise buyers; two leaders described SMB customers as the primary target…"
                          className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 placeholder-neutral-300"
                        />
                      </div>

                      {/* Recommendation */}
                      <div>
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Recommendation</label>
                        <p className="text-xs text-neutral-400 mb-2">What should happen next to resolve this?</p>
                        <textarea
                          value={cat.recommendation}
                          onChange={(e) => updateCategory(cat.id, { recommendation: e.target.value })}
                          rows={2}
                          placeholder="e.g. Facilitate an ICP alignment session with full leadership team before any outbound messaging is updated…"
                          className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 placeholder-neutral-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveTab('map')}
                className="bg-black text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-neutral-800 transition"
              >
                View Gap Map →
              </button>
            </div>
          </div>
        )}

        {/* ══ GAP MAP TAB ══ */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* Summary grid */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="bg-black px-6 py-4">
                <h2 className="text-white font-bold">Alignment Gap Map</h2>
                <p className="text-neutral-400 text-xs mt-0.5">{map.client_name || map.title}</p>
              </div>

              <div className="divide-y divide-neutral-100">
                {categories.map((cat) => (
                  <div key={cat.id} className="px-6 py-4 flex items-start gap-4">
                    <div className="w-40 shrink-0">
                      <p className="text-sm font-semibold text-neutral-800">{cat.category_name}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {cat.key_divergence ? (
                        <p className="text-sm text-neutral-600 leading-snug">{cat.key_divergence}</p>
                      ) : (
                        <p className="text-sm text-neutral-300 italic">No divergence noted</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {cat.severity ? severityBadge(cat.severity) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority order */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-100">
                <h2 className="font-bold text-neutral-900">Priority Order</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Sorted by severity — highest priority first</p>
              </div>
              <div className="divide-y divide-neutral-100">
                {sortedByPriority.map((cat, i) => (
                  <div key={cat.id} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-neutral-400 w-5">{String(i + 1).padStart(2, '0')}</span>
                        <span className="font-semibold text-neutral-900">{cat.category_name}</span>
                      </div>
                      {severityBadge(cat.severity)}
                    </div>

                    {cat.key_divergence && (
                      <div className="ml-8 mb-2">
                        <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-0.5">Divergence</p>
                        <p className="text-sm text-neutral-700">{cat.key_divergence}</p>
                      </div>
                    )}

                    {cat.recommendation && (
                      <div className="ml-8 p-3 bg-[#1A3428]/8 border border-[#1A3428]/20 rounded-xl mt-2">
                        <p className="text-xs text-[#1A3428] font-medium uppercase tracking-wider mb-0.5">Recommendation</p>
                        <p className="text-sm text-[#1A3428]">{cat.recommendation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Back to capture */}
            <div className="flex justify-between">
              <button
                onClick={() => setActiveTab('capture')}
                className="text-sm text-neutral-500 hover:text-black transition"
              >
                ← Back to Capture
              </button>
              {map.status !== 'complete' && (
                <button
                  onClick={markComplete}
                  className="bg-[#F04D3D] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#d43f30] transition"
                >
                  Mark as Complete ✓
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
