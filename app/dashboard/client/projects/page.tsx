'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Project = {
  id: string
  name: string
  created_at?: string
}

export default function ClientProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // NOTE: if you have auth + client_id filtering, filter here.
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Load projects error:', error)
        setProjects([])
        setLoading(false)
        return
      }

      setProjects((data || []) as Project[])
      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 space-y-4 max-w-[1100px] mx-auto">
      <div>
        <p className="text-sm text-gray-500">Client Portal</p>
        <h1 className="text-3xl font-bold">Projects</h1>
      </div>

      {projects.length === 0 ? (
        <div className="border rounded-2xl p-6 text-sm text-gray-500">
          No projects yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/dashboard/client/projects/${p.id}`)}
              className="text-left border rounded-2xl p-5 hover:border-black transition"
            >
              <div className="font-semibold">{p.name}</div>
              {p.created_at ? (
                <div className="pt-1 text-xs text-gray-500">
                  Created {new Date(p.created_at).toLocaleDateString()}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}