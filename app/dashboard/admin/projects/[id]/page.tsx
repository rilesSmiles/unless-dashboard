// app/dashboard/admin/projects/[id]/page.tsx
'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BriefEditor from '@/components/BriefEditor'

type Task = {
  id: string
  project_id: string
  project_step_id: string
  title: string
  is_done: boolean
  due_date: string | null
  created_at: string
  updated_at: string
}

type StepRaw = {
  id: string
  title: string
  step_order: number
  project_step_tasks: Task[] | null
}

type StepUI = Omit<StepRaw, 'project_step_tasks'> & {
  project_step_tasks: Task[]
}

type Todo = {
  id: string
  text: string
  created_at?: string
}

type ProjectDoc = {
  id: string
  project_id: string
  title: string
  storage_path: string | null
  embed_url: string | null
  file_type: string | null
  size_bytes: number | null
  created_at: string
  updated_at: string
}

function formatDateShort(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T00:00:00`)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDateTimeShort(ts: string) {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ts
  }
}

export default function AdminProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')

  const [deleting, setDeleting] = useState(false)

  // ✅ task input state MUST be up here (hooks rule)
  const [newTaskByStep, setNewTaskByStep] = useState<Record<string, string>>({})
  const [addingTaskStepId, setAddingTaskStepId] = useState<string | null>(null)

  // tiny per-task action busy states
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)

  // 📎 docs state
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [docAddOpen, setDocAddOpen] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [addingDoc, setAddingDoc] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pickedFileName, setPickedFileName] = useState<string | null>(null)

  // ✅ file picker handlers (MUST be in component scope)
  const onPickFileClick = () => {
    fileInputRef.current?.click()
  }

  const onFileSelected = (file: File | null) => {
    if (!file) return
    setPickedFileName(file.name)

    console.log('Selected file:', {
      name: file.name,
      type: file.type,
      size: file.size,
    })

    // allow selecting the same file again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Steps are phase headers
  const steps: StepUI[] = ((project?.project_steps ?? []) as StepRaw[]).map((s) => ({
    ...s,
    project_step_tasks: s.project_step_tasks ?? [],
  }))

  const stepsSorted = useMemo(() => {
    return [...steps].sort((a, b) => a.step_order - b.step_order)
  }, [steps])

  const allTasks = useMemo(() => {
    const arr: Task[] = []
    for (const s of stepsSorted) {
      for (const t of s.project_step_tasks || []) arr.push(t)
    }
    return arr
  }, [stepsSorted])

  const totalTasks = allTasks.length
  const doneTasks = allTasks.filter((t) => t.is_done).length
  const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)

      // 1) Load project + steps + tasks
      const { data: projectData, error } = await supabase
        .from('projects')
        .select(
          `
          id,
          name,
          brief_content,
          client_id,
          project_steps (
            id,
            title,
            step_order,
            project_step_tasks (
              id,
              project_id,
              project_step_id,
              title,
              is_done,
              due_date,
              created_at,
              updated_at
            )
          )
        `
        )
        .eq('id', projectId)
        .single()

      if (error || !projectData) {
        console.error('Load project error:', error, JSON.stringify(error))
        setProject(null)
        setLoading(false)
        return
      }

      setProject({
        ...projectData,
        project_steps: (projectData.project_steps || []) as StepRaw[],
      })

      // 2) Load todos
      const { data: todosData, error: todoErr } = await supabase
        .from('project_todos')
        .select('id, text, created_at')
        .eq('project_id', projectId)
        .order('created_at')

      if (todoErr) {
        console.error('Load todos error:', todoErr, JSON.stringify(todoErr))
      }
      setTodos((todosData || []) as Todo[])

      // 3) Load docs
      const { data: docsData, error: docsErr } = await supabase
        .from('project_documents')
        .select(
          'id, project_id, title, storage_path, embed_url, file_type, size_bytes, created_at, updated_at'
        )
        .eq('project_id', projectId)
        .order('created_at')

      if (docsErr) {
        console.error('Load docs error:', docsErr, JSON.stringify(docsErr))
      }
      setDocs((docsData || []) as ProjectDoc[])

      setLoading(false)
    }

    loadData()
  }, [projectId])

  // ✅ Early returns AFTER all hooks
  if (loading) return <p className="p-8">Loading…</p>
  if (!project) return <p className="p-8">Project not found</p>

  const addTodo = async () => {
    if (!newTodo.trim()) return

    const { data, error } = await supabase
      .from('project_todos')
      .insert({ project_id: projectId, text: newTodo.trim() })
      .select('id, text, created_at')
      .single()

    if (error || !data) {
      console.error('Add todo error:', error, JSON.stringify(error))
      return
    }

    setTodos((prev) => [...prev, data as Todo])
    setNewTodo('')
  }

  const deleteProject = async () => {
    const typed = prompt(`Type DELETE to permanently delete "${project.name}"`)
    if (typed !== 'DELETE') return

    setDeleting(true)
    const { error } = await supabase.from('projects').delete().eq('id', projectId)
    setDeleting(false)

    if (error) {
      alert('Failed to delete project')
      console.error('Delete project error:', error, JSON.stringify(error))
      return
    }

    router.push('/dashboard/admin/projects')
  }

  const addTask = async (stepId: string) => {
    const text = (newTaskByStep[stepId] || '').trim()
    if (!text) return

    setAddingTaskStepId(stepId)

    const { data, error } = await supabase
      .from('project_step_tasks')
      .insert({
        project_id: projectId,
        project_step_id: stepId,
        title: text,
        is_done: false,
        due_date: null,
      })
      .select('id, project_id, project_step_id, title, is_done, due_date, created_at, updated_at')
      .single()

    setAddingTaskStepId(null)

    if (error || !data) {
      console.error('Add task error:', error, JSON.stringify(error))
      return
    }

    setProject((prev: any) => ({
      ...prev,
      project_steps: (prev.project_steps || []).map((s: StepRaw) =>
        s.id === stepId
          ? { ...s, project_step_tasks: [...(s.project_step_tasks || []), data] }
          : s
      ),
    }))

    setNewTaskByStep((prev) => ({ ...prev, [stepId]: '' }))
  }

  const toggleTask = async (stepId: string, taskId: string) => {
    let nextValue = false

    setProject((prev: any) => {
      const updatedSteps = (prev.project_steps || []).map((s: StepRaw) => {
        if (s.id !== stepId) return s
        const updatedTasks = (s.project_step_tasks || []).map((t: Task) => {
          if (t.id !== taskId) return t
          nextValue = !t.is_done
          return { ...t, is_done: nextValue }
        })
        return { ...s, project_step_tasks: updatedTasks }
      })
      return { ...prev, project_steps: updatedSteps }
    })

    setUpdatingTaskId(taskId)
    const { data, error } = await supabase
      .from('project_step_tasks')
      .update({ is_done: nextValue })
      .eq('id', taskId)
      .select('id, updated_at')
      .single()
    setUpdatingTaskId(null)

    if (error) {
      console.error('Toggle task error:', error, JSON.stringify(error))
      return
    }

    if (data?.updated_at) {
      setProject((prev: any) => ({
        ...prev,
        project_steps: (prev.project_steps || []).map((s: StepRaw) => ({
          ...s,
          project_step_tasks: (s.project_step_tasks || []).map((t: Task) =>
            t.id === taskId ? { ...t, updated_at: data.updated_at } : t
          ),
        })),
      }))
    }
  }

  const setTaskDueDate = async (stepId: string, taskId: string, due_date: string | null) => {
    setProject((prev: any) => ({
      ...prev,
      project_steps: (prev.project_steps || []).map((s: StepRaw) => {
        if (s.id !== stepId) return s
        return {
          ...s,
          project_step_tasks: (s.project_step_tasks || []).map((t: Task) =>
            t.id === taskId ? { ...t, due_date } : t
          ),
        }
      }),
    }))

    setUpdatingTaskId(taskId)
    const { data, error } = await supabase
      .from('project_step_tasks')
      .update({ due_date })
      .eq('id', taskId)
      .select('id, due_date, updated_at')
      .single()
    setUpdatingTaskId(null)

    if (error) {
      console.error('Update due date error:', error, JSON.stringify(error))
      return
    }

    if (data?.updated_at) {
      setProject((prev: any) => ({
        ...prev,
        project_steps: (prev.project_steps || []).map((s: StepRaw) => ({
          ...s,
          project_step_tasks: (s.project_step_tasks || []).map((t: Task) =>
            t.id === taskId ? { ...t, updated_at: data.updated_at, due_date: data.due_date } : t
          ),
        })),
      }))
    }
  }

  const deleteTask = async (stepId: string, taskId: string) => {
    const ok = confirm('Delete this task?')
    if (!ok) return

    setProject((prev: any) => ({
      ...prev,
      project_steps: (prev.project_steps || []).map((s: StepRaw) => {
        if (s.id !== stepId) return s
        return {
          ...s,
          project_step_tasks: (s.project_step_tasks || []).filter((t: Task) => t.id !== taskId),
        }
      }),
    }))

    setDeletingTaskId(taskId)
    const { error } = await supabase.from('project_step_tasks').delete().eq('id', taskId)
    setDeletingTaskId(null)

    if (error) console.error('Delete task error:', error, JSON.stringify(error))
  }

  // ✅ MVP: add an embedded link doc (later we’ll add uploads too)
  const addDocLink = async () => {
    const title = newDocTitle.trim()
    const url = newDocUrl.trim()
    if (!title || !url) return

    setAddingDoc(true)
    const { data, error } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        title,
        embed_url: url,
        storage_path: null,
        file_type: 'link',
        size_bytes: null,
      })
      .select('id, project_id, title, storage_path, embed_url, file_type, size_bytes, created_at, updated_at')
      .single()
    setAddingDoc(false)

    if (error || !data) {
      console.error('Add doc link error:', error, JSON.stringify(error))
      return
    }

    setDocs((prev) => [...prev, data as ProjectDoc])
    setNewDocTitle('')
    setNewDocUrl('')
    setDocAddOpen(false)
    setPickedFileName(null)
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-sm text-gray-500">Project</p>
          <h1 className="text-3xl font-bold">{project.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/admin/projects')}
            className="text-sm underline text-neutral-600 hover:text-black"
          >
            Back to Projects
          </button>

          <button
            onClick={deleteProject}
            disabled={deleting}
            className="border border-red-500 text-red-600 px-4 py-2 rounded-lg disabled:opacity-60"
            title="Delete project"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Brief + Todos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Brief */}
        <div className="border rounded-2xl p-5 space-y-2">
          <h3 className="font-semibold">Project Brief</h3>
          <BriefEditor projectId={projectId} initialData={project.brief_content} />
        </div>

        {/* Todos */}
        <div className="border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold">Client Notes / To-Dos</h3>

          <div className="space-y-1 text-sm">
            {todos.length === 0 ? (
              <p className="text-gray-400">No notes yet</p>
            ) : (
              todos.map((t) => <p key={t.id}>• {t.text}</p>)
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <input
              className="border rounded p-2 w-full"
              placeholder="Add note…"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
            />
            <button onClick={addTodo} className="bg-black text-white px-3 rounded">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* 📎 Documents */}
      <div className="border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Documents</h3>

          {docAddOpen ? (
            <button
              onClick={() => {
                setDocAddOpen(false)
                setNewDocTitle('')
                setNewDocUrl('')
                setPickedFileName(null)
              }}
              className="text-sm underline text-neutral-600 hover:text-black"
            >
              Close
            </button>
          ) : null}
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {!docAddOpen ? (
            <button
              onClick={() => setDocAddOpen(true)}
              className="shrink-0 w-28 h-28 rounded-2xl border flex flex-col items-center justify-center text-sm text-gray-600 hover:text-black hover:border-black transition"
              title="Add documents"
            >
              <div className="text-2xl leading-none">+</div>
              <div className="pt-1">Add docs</div>
            </button>
          ) : (
            <div className="shrink-0 w-[520px] rounded-2xl border p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* FILE SLOT (picker now) */}
                <div className="h-fill rounded-2xl border border-dashed p-3 flex flex-col justify-between">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                  />

                  <button
                    type="button"
                    onClick={onPickFileClick}
                    className="flex-1 rounded-xl flex flex-col items-center justify-center text-sm text-gray-600 hover:text-black transition"
                    title="Upload a file"
                  >
                    <div className="text-lg">⬆️</div>
                    <div className="pt-1 font-medium">Choose a file</div>
                    <div className="text-xs text-gray-400 pt-1">PDF, PNG, JPG, etc.</div>
                  </button>

                  <div className="pt-2 text-xs text-gray-500">
                    {pickedFileName ? (
                      <span className="line-clamp-1">Selected: {pickedFileName}</span>
                    ) : (
                      <span>Nothing selected yet</span>
                    )}
                  </div>
                </div>

                {/* LINK SLOT (works now) */}
                <div className="h-fit rounded-2xl border flex flex-col justify-between p-3">
                  <div className="text-sm font-medium">Paste link</div>

                  <div className="space-y-2">
                    <input
                      className="border rounded p-2 w-full text-sm"
                      placeholder="Title (e.g. Brand Strategy PDF)"
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                    />
                    <input
                      className="border rounded p-2 w-full text-sm"
                      placeholder="Share URL (Figma / Google Doc / etc.)"
                      value={newDocUrl}
                      onChange={(e) => setNewDocUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addDocLink()
                      }}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={addDocLink}
                      disabled={addingDoc}
                      className="bg-black text-white px-3 py-2 rounded text-sm disabled:opacity-60"
                    >
                      {addingDoc ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 pt-2">
                Uploads are next — this panel is already built to support both.
              </p>
            </div>
          )}

          {/* Existing docs */}
          {docs.map((d) => (
            <a
              key={d.id}
              href={d.embed_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 w-52 rounded-2xl border p-3 hover:border-black transition"
              title={d.title}
            >
              <div className="text-sm font-medium line-clamp-2">{d.title}</div>
              <div className="pt-2 text-xs text-gray-500">
                {d.file_type ?? 'doc'} • Added {formatDateTimeShort(d.created_at)}
              </div>
              <div className="pt-2 text-xs text-gray-400 line-clamp-1">
                {d.embed_url ?? d.storage_path ?? ''}
              </div>
            </a>
          ))}
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-gray-400">No documents yet — add links or uploads for client review.</p>
        ) : null}
      </div>

      {/* Progress + Tasks */}
      <div className="border rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span>{percent}%</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="bg-black h-3 rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>

        <div className="space-y-6 pt-2">
          {stepsSorted.map((step) => {
            const tasks = step.project_step_tasks || []
            const stepTotal = tasks.length
            const stepDone = tasks.filter((t) => t.is_done).length
            const stepPercent = stepTotal === 0 ? 0 : Math.round((stepDone / stepTotal) * 100)

            return (
              <div key={step.id} className="border rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-lg">{step.title}</h3>
                    <p className="text-sm text-gray-500">
                      {stepTotal === 0 ? 'No tasks yet' : `${stepDone}/${stepTotal} complete`}
                    </p>
                  </div>

                  <div className="w-[180px]">
                    <div className="flex justify-between text-xs text-gray-500 pb-1">
                      <span>Phase</span>
                      <span>{stepPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-black h-2 rounded-full transition-all" style={{ width: `${stepPercent}%` }} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-sm text-gray-400">Add your first task below ✍️</p>
                  ) : (
                    tasks.map((task) => {
                      const busy = updatingTaskId === task.id || deletingTaskId === task.id
                      return (
                        <div key={task.id} className={`border rounded-xl p-3 ${busy ? 'opacity-70' : ''}`}>
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={task.is_done}
                              onChange={() => toggleTask(step.id, task.id)}
                              disabled={busy}
                            />

                            <span className={task.is_done ? 'line-through text-gray-400' : ''}>
                              {task.title}
                            </span>

                            <div className="ml-auto flex items-center gap-2">
                              <input
                                type="date"
                                value={task.due_date ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setTaskDueDate(step.id, task.id, v ? v : null)
                                }}
                                disabled={busy}
                                className="text-xs border rounded px-2 py-1"
                                title="Due date"
                              />

                              <button
                                onClick={() => deleteTask(step.id, task.id)}
                                disabled={busy}
                                className="text-xs text-red-600 hover:text-red-800 px-2"
                                title="Delete task"
                                aria-label="Delete task"
                              >
                                🗑
                              </button>
                            </div>
                          </div>

                          <div className="pt-2 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                            <span>{task.due_date ? `Due ${formatDateShort(task.due_date)}` : 'No due date'}</span>
                            <span>•</span>
                            <span>Created {formatDateTimeShort(task.created_at)}</span>
                            <span>•</span>
                            <span>Updated {formatDateTimeShort(task.updated_at)}</span>
                            <span className="ml-auto text-gray-400">id: {task.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    className="border rounded p-2 w-full"
                    placeholder="+ Add task…"
                    value={newTaskByStep[step.id] || ''}
                    onChange={(e) =>
                      setNewTaskByStep((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTask(step.id)
                    }}
                  />

                  <button
                    onClick={() => addTask(step.id)}
                    disabled={addingTaskStepId === step.id}
                    className="bg-black text-white px-3 rounded disabled:opacity-60"
                  >
                    {addingTaskStepId === step.id ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}