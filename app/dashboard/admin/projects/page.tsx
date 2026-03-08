'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export type Project = {
  id: string; name: string; project_type: string | null
  status: string | null; created_at: string; last_viewed_at: string | null
  client_id: string | null; business_name: string | null
}

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  'Brand Alignment Intensive': { bg: 'bg-[#F04D3D]/10', text: 'text-[#F04D3D]' },
  'Brand System Build':        { bg: 'bg-stone-100', text: 'text-stone-700'  },
  'Brand Stewardship Retainer':{ bg: 'bg-neutral-100',text:'text-neutral-700'},
}

function typeBadge(type: string | null) {
  if (!type) return null
  const style = TYPE_BADGE[type] ?? { bg: 'bg-neutral-100', text: 'text-neutral-600' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      {type}
    </span>
  )
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('projects')
        .select('id,name,project_type,status,created_at,last_viewed_at,client_id,profiles:client_id(business_name)')
        .order('created_at', { ascending: false })
      const formatted: Project[] = (data ?? []).map((p: any) => ({
        id: p.id, name: p.name, project_type: p.project_type ?? null,
        status: p.status ?? null, created_at: p.created_at, last_viewed_at: p.last_viewed_at ?? null,
        client_id: p.client_id ?? null,
        business_name: (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.business_name ?? null,
      }))
      setProjects(formatted)
      setLoading(false)
    }
    load()
  }, [])

  const openProject = async (id: string) => {
    await supabase.from('projects').update({ last_viewed_at: new Date().toISOString() }).eq('id', id)
    router.push(`/dashboard/admin/projects/${id}`)
  }

  const filterTypes = ['All', 'Brand Alignment Intensive', 'Brand System Build', 'Brand Stewardship Retainer']

  const filtered = useMemo(() => {
    let list = filter === 'All' ? projects : projects.filter((p) => p.project_type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.business_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [projects, filter, search])

  const recent = useMemo(() =>
    [...projects].filter((p) => p.last_viewed_at)
      .sort((a, b) => new Date(b.last_viewed_at!).getTime() - new Date(a.last_viewed_at!).getTime())
      .slice(0, 6),
    [projects]
  )

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading projects…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-28">
      {/* Header */}
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-5xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-2">Unless Creative</p>
            <h1 className="text-3xl text-white leading-tight">Projects</h1>
            <p className="text-neutral-400 text-sm mt-1">
              {projects.length === 0 ? 'No projects yet' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/admin/projects/new')}
            className="bg-[#F04D3D] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#d43c2d] transition shrink-0"
          >
            + New Project
          </button>
        </div>
      </div>
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Recently viewed */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Recently Viewed</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {recent.map((p) => (
              <button key={p.id} onClick={() => openProject(p.id)}
                className="text-left bg-white border border-neutral-200 rounded-2xl px-5 py-4 hover:border-neutral-400 hover:shadow-sm transition-all group">
                <div className="mb-2">{typeBadge(p.project_type)}</div>
                <p className="font-semibold text-neutral-900 text-sm leading-snug group-hover:text-black line-clamp-2">{p.name}</p>
                {p.business_name && <p className="text-xs text-neutral-400 mt-1">{p.business_name}</p>}
                <p className="text-xs text-neutral-300 mt-2">
                  viewed {fmtDate(p.last_viewed_at!)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {recent.length > 0 && <div className="border-t border-neutral-100" />}

      {/* Filter + search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {filterTypes.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                filter === f ? 'bg-[#F04D3D] text-white border-[#F04D3D]' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
              }`}>
              {f === 'All' ? `All (${projects.length})` : f.replace('Brand ', '').replace(' Intensive', '').replace(' Build', '').replace(' Retainer', '')}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="sm:ml-auto text-sm border border-neutral-200 rounded-xl px-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-black/10 w-full sm:w-56"
        />
      </div>

      {/* All projects */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-neutral-200 rounded-2xl p-16 text-center">
          <p className="text-neutral-400 text-sm">
            {search ? `No results for "${search}"` : 'No projects yet — create one to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => openProject(p.id)}
              className="w-full text-left bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 hover:shadow-sm transition-all group flex items-center gap-5">
              {/* Color pip */}
              <div className={`w-1.5 h-10 rounded-full shrink-0 ${
                p.project_type === 'Brand Alignment Intensive' ? 'bg-[#F04D3D]' :
                p.project_type === 'Brand System Build' ? 'bg-stone-400' : 'bg-neutral-300'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  {typeBadge(p.project_type)}
                  {p.business_name && <span className="text-xs text-neutral-400">{p.business_name}</span>}
                </div>
                <p className="font-semibold text-neutral-900 group-hover:text-black">{p.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-neutral-400">{fmtDate(p.created_at)}</p>
                <p className="text-xs text-neutral-300 mt-0.5">created</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
    </div>
  )
}
