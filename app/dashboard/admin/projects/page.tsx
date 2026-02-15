// app/dashboard/admin/projects/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'

import ProjectGrid from '@/components/ProjectGrid'
import ProjectFilters from '@/components/ProjectFilters'
import RecentProjects from '@/components/RecentProjects'

/* ----------------------------
   Types
-----------------------------*/
export type Project = {
  id: string
  name: string
  project_type: string | null
  created_at: string
  last_viewed_at: string | null
  client_id: string
  business_name: string | null
}

export default function ProjectsPage() {
  const router = useRouter()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const [filter, setFilter] = useState('All')

  /* ----------------------------
     Load Projects
  -----------------------------*/
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          project_type,
          created_at,
          last_viewed_at,
          client_id,
          profiles:client_id (
            business_name
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Load projects error:', error)
        setLoading(false)
        return
      }

      const formatted: Project[] = (data || []).map(
        (project: any) => ({
          id: project.id,
          name: project.name,
          project_type: project.project_type,
          created_at: project.created_at,
          last_viewed_at: project.last_viewed_at,
          client_id: project.client_id,

          // 👇 IMPORTANT: single object, not array
          business_name:
            project.profiles?.business_name ?? null,
        })
      )

      setProjects(formatted)
      setLoading(false)
    }

    loadProjects()
  }, [])

  /* ----------------------------
     Filtering
  -----------------------------*/
  const filteredProjects =
    filter === 'All'
      ? projects
      : projects.filter(
          (p) => p.project_type === filter
        )

  /* ----------------------------
     Open Project
  -----------------------------*/
  const openProject = async (id: string) => {
    await supabase
      .from('projects')
      .update({
        last_viewed_at: new Date(),
      })
      .eq('id', id)

    router.push(`/dashboard/admin/projects/${id}`)
  }

  /* ----------------------------
     Loading State
  -----------------------------*/
  if (loading) {
    return (
      <p className="p-8 text-neutral-400">
        Loading projects…
      </p>
    )
  }

  /* ----------------------------
     UI
  -----------------------------*/
  return (
    <div className="p-8 max-w-[1600px] mx-auto">

      {/* Recently Viewed */}
      <RecentProjects
        projects={projects}
        onOpen={openProject}
      />

      {/* Divider */}
      <div className="border-t border-neutral-800 my-10" />

      {/* All Projects */}
      <div>

        <h2 className="text-xl font-semibold mb-4">
          All Projects
        </h2>

        <ProjectFilters
          value={filter}
          onChange={setFilter}
        />

        <ProjectGrid
          projects={filteredProjects}
          onOpen={openProject}
        />

      </div>

    </div>
  )
}