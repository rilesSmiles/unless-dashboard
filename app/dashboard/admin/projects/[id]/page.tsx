'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Step = {
  id: string
  title: string
  step_order: number
  project_progress: {
    id: string
    completed: boolean
  } | null
}

export default function AdminProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProject = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          project_steps (
            id,
            title,
            step_order,
            project_progress (
              id,
              completed
            )
          )
        `)
        .eq('id', projectId)
        .single()

      if (error) {
        console.error(error)
        return
      }

      setProject(data)
      setLoading(false)
    }

    loadProject()
  }, [projectId])

  if (loading) return <p className="p-8">Loading…</p>
  if (!project) return <p className="p-8">Project not found</p>

  const steps: Step[] = project.project_steps ?? []

  const total = steps.length
  const done = steps.filter(
    (s) => s.project_progress?.completed
  ).length

  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">{project.name}</h1>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Progress</span>
          <span>{percent}%</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-black h-3 rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps
          .sort((a, b) => a.step_order - b.step_order)
          .map((step) => {
            const progress = step.project_progress

            return (
              <label
                key={step.id}
                className="flex items-center gap-3 border rounded-lg p-3"
              >
                <input
                  type="checkbox"
                  checked={progress?.completed ?? false}
                  onChange={async () => {
    const newValue = !progress?.completed

  // 1. Update UI immediately
  setProject((prev: any) => {
    return {
      ...prev,
      project_steps: prev.project_steps.map((s: any) => {
        if (s.id === step.id) {
          return {
            ...s,
            project_progress: {
              ...s.project_progress,
              completed: newValue,
            },
          }
        }

        return s
      }),
    }
  })

  // 2. Update database in background
  await supabase
    .from('project_progress')
    .update({
      completed: newValue,
      completed_at: new Date(),
    })
    .eq('id', progress?.id)
}}
                />

                <span
                  className={
                    progress?.completed
                      ? 'line-through text-gray-400'
                      : ''
                  }
                >
                  {step.title}
                </span>
              </label>
            )
          })}
      </div>
    </div>
  )
}