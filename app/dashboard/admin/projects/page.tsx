// app/dashboard/admin/projects/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import ProjectGrid from '@/components/ProjectGrid'
import ProjectFilters from '@/components/ProjectFilters'
import RecentProjects from '@/components/RecentProjects'

export type Project = {
  id: string
  name: string
  project_type: string | null
  created_at: string
  last_viewed_at: string | null
  client_id: string | null
  business_name: string | null
}

export default function ProjectsPage() {
  const router = useRouter()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('projects')
        .select(
          `
          id,
          name,
          created_at,
          last_viewed_at,
          client_id,
          profiles:client_id (
            business_name
          )
        `
        )
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Load projects error:', error, JSON.stringify(error))
        setProjects([])
        setLoading(false)
        return
      }

      const formatted: Project[] = (data || []).map((p: any) => {
        const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles

        return {
          id: p.id,
          name: p.name,
          project_type: p.project_type ?? null,
          created_at: p.created_at,
          last_viewed_at: p.last_viewed_at ?? null,
          client_id: p.client_id ?? null,
          business_name: profile?.business_name ?? null,
        }
      })

      setProjects(formatted)
      setLoading(false)
    }

    loadProjects()
  }, [])

  const filteredProjects =
    filter === 'All'
      ? projects
      : projects.filter((p) => p.project_type === filter)

  const recentProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.last_viewed_at)
      .sort(
        (a, b) =>
          new Date(b.last_viewed_at as string).getTime() -
          new Date(a.last_viewed_at as string).getTime()
      )
      .slice(0, 8)
  }, [projects])

  const openProject = async (id: string) => {
    await supabase
      .from('projects')
      .update({ last_viewed_at: new Date() })
      .eq('id', id)

    router.push(`/dashboard/admin/projects/${id}`)
  }

  const deleteProject = async (id: string) => {
    const p = projects.find((x) => x.id === id)
    const typed = prompt(`Type DELETE to permanently delete "${p?.name ?? 'this project'}"`)

    if (typed !== 'DELETE') return

    setDeletingId(id)

    const { error } = await supabase.from('projects').delete().eq('id', id)

    setDeletingId(null)

    if (error) {
      alert('Failed to delete project')
      console.error('Delete project error:', error, JSON.stringify(error))
      return
    }

    setProjects((prev) => prev.filter((x) => x.id !== id))
  }

  if (loading) {
    return <p className="p-8 text-neutral-400">Loading projects…</p>
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recently viewed up top, everything else below.
          </p>
        </div>

        <button
          onClick={() => router.push('/dashboard/admin/projects/new')}
          className="bg-black text-white px-4 py-2 rounded-lg"
        >
          + New Project
        </button>
      </div>

      {/* Recently Viewed */}
      <RecentProjects projects={recentProjects} onOpen={openProject} />

      {/* Divider */}
      <div className="border-t border-neutral-800 my-2" />

      {/* All Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">All Projects</h2>

          <ProjectFilters value={filter} onChange={setFilter} />
        </div>

        {filteredProjects.length === 0 ? (
          <div className="border border-dashed rounded-xl p-10 text-center text-gray-400">
            No projects yet ✨
          </div>
        ) : (
          <ProjectGrid
            projects={filteredProjects}
            onOpen={openProject}
            onDelete={deleteProject}
            deletingId={deletingId}
          />
        )}
      </div>
    </div>
  )
}