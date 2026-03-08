'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Project = {
  id: string
  name: string
  project_type: string | null
  created_at: string
}

function typeLabelFull(type: string | null) {
  if (!type) return null
  if (type === 'brand-alignment-intensive' || type === 'BAI') return 'Brand Alignment Intensive'
  if (type === 'brand-system-build' || type === 'BSB') return 'Brand System Build'
  if (type === 'brand-stewardship-retainer' || type === 'BSR') return 'Brand Stewardship Retainer'
  return type
}

export default function ClientProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setLoading(false); return }

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_type, created_at')
        .eq('client_id', userId)
        .order('created_at', { ascending: false })

      if (error) console.error('Load projects error:', error)
      setProjects((data ?? []) as Project[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <div
        className="px-6 pt-10 pb-8"
        style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}
      >
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7EC8A0' }}>
            Unless Creative — Client Portal
          </p>
          <h1 className="text-3xl text-white">Your Projects</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-3">
        {projects.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
            <p className="text-neutral-400 text-sm">No projects yet — Riley will set one up for you.</p>
          </div>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/dashboard/client/projects/${p.id}`)}
              className="w-full text-left bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  {p.project_type && (
                    <span
                      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5"
                      style={{ background: '#F04D3D15', color: '#F04D3D' }}
                    >
                      {typeLabelFull(p.project_type)}
                    </span>
                  )}
                  <p className="font-bold text-neutral-900 group-hover:text-black">{p.name}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Started {new Date(p.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className="text-neutral-300 group-hover:text-neutral-500 transition text-lg">→</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
