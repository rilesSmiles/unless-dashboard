'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Step = {
  id: string
  title: string
  step_order: number
  project_progress: {
    id: string
    completed: boolean
  } | null
}

type Todo = {
  id: string
  text: string
}

export default function AdminProjectPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // ✅ Todos state
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')

  useEffect(() => {
    const loadData = async () => {
      /* Load project */
      const { data: projectData, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          brief_url,
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

      setProject(projectData)

      /* Load todos */
      const { data: todosData } = await supabase
        .from('project_todos')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at')

      setTodos(todosData || [])

      setLoading(false)
    }

    loadData()
  }, [projectId])

  if (loading) return <p className="p-8">Loading…</p>
  if (!project) return <p className="p-8">Project not found</p>

  const steps: Step[] = project.project_steps ?? []

  const total = steps.length
  const done = steps.filter(
    (s) => s.project_progress?.completed
  ).length

  const percent =
    total === 0 ? 0 : Math.round((done / total) * 100)

  /* ✅ Add todo handler */
  const addTodo = async () => {
    if (!newTodo.trim()) return

    const { data, error } = await supabase
      .from('project_todos')
      .insert({
        project_id: projectId,
        text: newTodo,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    setTodos([...todos, data])
    setNewTodo('')
  }

  return (
    <div className="p-8 space-y-6">

      {/* Title */}
      <h1 className="text-3xl font-bold">{project.name}</h1>

      {/* Brief + Todos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Project Brief */}
        <div className="border rounded-xl p-4">
          <h3 className="font-semibold mb-2">Project Brief</h3>

          {project.brief_url ? (
            <a
              href={project.brief_url}
              target="_blank"
              className="underline"
            >
              Open Brief
            </a>
          ) : (
            <p className="text-gray-400">No brief added</p>
          )}
        </div>

        {/* Client To-Dos */}
        <div className="border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Client Notes / To-Dos</h3>

          {/* List */}
          <div className="space-y-1 text-sm">
            {todos.length === 0 && (
              <p className="text-gray-400">
                No notes yet
              </p>
            )}

            {todos.map((todo) => (
              <p key={todo.id}>• {todo.text}</p>
            ))}
          </div>

          {/* Add */}
          <div className="flex gap-2 pt-2">
            <input
              className="border rounded p-2 w-full"
              placeholder="Add note…"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
            />

            <button
              onClick={addTodo}
              className="bg-black text-white px-3 rounded"
            >
              Add
            </button>
          </div>
        </div>

      </div>

      {/* Progress */}
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

                    /* Optimistic UI */
                    setProject((prev: any) => ({
                      ...prev,
                      project_steps: prev.project_steps.map((s: any) =>
                        s.id === step.id
                          ? {
                              ...s,
                              project_progress: {
                                ...s.project_progress,
                                completed: newValue,
                              },
                            }
                          : s
                      ),
                    }))

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