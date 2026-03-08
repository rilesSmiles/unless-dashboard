'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SEVERITY_STYLE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  aligned:      { label: 'Aligned',             bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500' },
  minor_drift:  { label: 'Minor Drift',          bg: 'bg-yellow-50',  text: 'text-yellow-700', dot: 'bg-yellow-500' },
  tension:      { label: 'Active Tension',       bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500' },
  critical:     { label: 'Critical Misalignment',bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500' },
}

type GapMap = {
  id: string
  title: string
  client_name: string | null
  status: string
  created_at: string
  updated_at: string
  project_id: string | null
}

const DEFAULT_CATEGORIES = [
  'Mission',
  'Positioning',
  'Value Proposition',
  'Audience',
  'Voice & Tone',
  'Internal vs. External',
]

export default function GapMapsPage() {
  const router = useRouter()
  const [maps, setMaps] = useState<GapMap[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('gap_maps')
        .select('id, title, client_name, status, created_at, updated_at, project_id')
        .order('updated_at', { ascending: false })
      if (error) console.error(error)
      setMaps(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const createNew = async () => {
    setCreating(true)

    // 1. Create the gap map
    const { data: mapData, error: mapError } = await supabase
      .from('gap_maps')
      .insert({ title: 'Untitled Gap Map', status: 'draft' })
      .select('id')
      .single()

    if (mapError || !mapData) {
      console.error('Create gap map error:', mapError)
      setCreating(false)
      return
    }

    // 2. Seed the 6 default categories
    const categoryInserts = DEFAULT_CATEGORIES.map((name, i) => ({
      gap_map_id: mapData.id,
      category_name: name,
      severity: null,
      sort_order: i,
    }))

    const { error: catError } = await supabase
      .from('gap_map_categories')
      .insert(categoryInserts)

    if (catError) {
      console.error('Create categories error:', catError)
    }

    setCreating(false)
    router.push(`/dashboard/admin/gap-maps/${mapData.id}`)
  }

  const deleteMap = async (e: React.MouseEvent, map: GapMap) => {
    e.stopPropagation()
    if (!confirm(`Delete "${map.title}"? This cannot be undone.`)) return
    setDeletingId(map.id)
    await supabase.from('gap_map_leader_notes').delete().eq('gap_map_id', map.id)
    await supabase.from('gap_map_categories').delete().eq('gap_map_id', map.id)
    await supabase.from('gap_maps').delete().eq('id', map.id)
    setMaps((prev) => prev.filter((m) => m.id !== map.id))
    setDeletingId(null)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

  const getWorstSeverity = (map: GapMap) => {
    // We don't load categories on the list — just show status
    return map.status
  }

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading gap maps…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      {/* Header */}
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-4xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-2">Unless Creative</p>
            <h1 className="text-3xl text-white leading-tight">Gap Maps</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Phase 03 of the Brand Alignment Intensive — capture, score, and synthesize.
            </p>
          </div>
          <button
            onClick={createNew}
            disabled={creating}
            className="bg-[#F04D3D] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#d43c2d] transition disabled:opacity-50 shrink-0"
          >
            {creating ? 'Creating…' : '+ New Gap Map'}
          </button>
        </div>
      </div>
      <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* List */}
      {maps.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-2xl p-16 text-center">
          <p className="text-neutral-400 text-lg font-medium mb-2">No gap maps yet</p>
          <p className="text-neutral-400 text-sm mb-6">Create your first one to start capturing alignment data.</p>
          <button
            onClick={createNew}
            disabled={creating}
            className="bg-[#F04D3D] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#d43c2d] transition"
          >
            {creating ? 'Creating…' : '+ New Gap Map'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {maps.map((map) => (
            <div
              key={map.id}
              className="relative w-full text-left bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 hover:shadow-sm transition-all group cursor-pointer"
              onClick={() => router.push(`/dashboard/admin/gap-maps/${map.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                      map.status === 'complete'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-[#F04D3D]/10 text-[#F04D3D]'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${map.status === 'complete' ? 'bg-green-500' : 'bg-[#F04D3D]'}`} />
                      {map.status === 'complete' ? 'Complete' : 'Draft'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-neutral-900 text-lg leading-snug group-hover:text-black">
                    {map.title}
                  </h3>
                  {map.client_name && (
                    <p className="text-sm text-neutral-500 mt-0.5">{map.client_name}</p>
                  )}
                </div>
                <div className="flex items-start gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-neutral-400">{formatDate(map.updated_at)}</p>
                    <p className="text-xs text-neutral-300 mt-0.5">updated</p>
                  </div>
                  <button
                    onClick={(e) => deleteMap(e, map)}
                    disabled={deletingId === map.id}
                    className="opacity-0 group-hover:opacity-100 transition text-neutral-300 hover:text-red-500 text-xs px-1.5 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 mt-0.5"
                    title="Delete gap map"
                  >
                    {deletingId === map.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
