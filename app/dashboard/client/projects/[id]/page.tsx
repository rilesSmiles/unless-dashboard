'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

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

type StepUI = Omit<StepRaw, 'project_step_tasks'> & { project_step_tasks: Task[] }

type Todo = {
  id: string
  project_id: string
  text: string
  is_done: boolean
  completed_at: string | null
  created_at: string
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

export default function ClientProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [todos, setTodos] = useState<Todo[]>([])
  const [docs, setDocs] = useState<ProjectDoc[]>([])

  // docs preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [docThumbs, setDocThumbs] = useState<Record<string, string>>({})

  // task completion note modal
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [pendingTask, setPendingTask] = useState<{ stepId: string; taskId: string; nextDone: boolean } | null>(null)
  const [savingNote, setSavingNote] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  const [showBrief, setShowBrief] = useState(false)

  const steps: StepUI[] = ((project?.project_steps ?? []) as StepRaw[]).map((s) => ({
    ...s,
    project_step_tasks: s.project_step_tasks ?? [],
  }))

  const stepsSorted = useMemo(
    () => [...steps].sort((a, b) => a.step_order - b.step_order),
    [steps]
  )

  const allTasks = useMemo(() => {
    const arr: Task[] = []
    for (const s of stepsSorted) for (const t of s.project_step_tasks || []) arr.push(t)
    return arr
  }, [stepsSorted])

  const totalTasks = allTasks.length
  const doneTasks = allTasks.filter((t) => t.is_done).length
  const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)

  const currentStep = useMemo(() => {
    if (stepsSorted.length === 0) return null
    const firstIncomplete = stepsSorted.find((s) => (s.project_step_tasks || []).some((t) => !t.is_done))
    return firstIncomplete ?? stepsSorted[stepsSorted.length - 1]
  }, [stepsSorted])

  const currentStepTasks = currentStep?.project_step_tasks ?? []
  const currentStepDone = currentStepTasks.filter((t) => t.is_done).length
  const currentStepTotal = currentStepTasks.length

  const normalizeEmbedUrl = (url: string) => {
    try {
      const u = new URL(url)

      if (u.hostname.includes('docs.google.com')) {
        u.pathname = u.pathname.replace(/\/(edit|view|copy).*$/, '/preview')
        return u.toString()
      }

      if (u.hostname.includes('drive.google.com')) {
        u.pathname = u.pathname.replace(/\/view.*$/, '/preview')
        return u.toString()
      }

      if (u.hostname.includes('figma.com')) {
        if (u.pathname.startsWith('/embed')) return u.toString()
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
      }

      return url
    } catch {
      return url
    }
  }

  const isProbablyImage = (doc: ProjectDoc) => (doc.file_type || '').toLowerCase().startsWith('image/')
  const isProbablyPdf = (doc: ProjectDoc) => {
    const t = (doc.file_type || '').toLowerCase()
    return t.includes('pdf') || t.includes('.pdf')
  }

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewDoc(null)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(false)
  }

  const openPreview = async (doc: ProjectDoc) => {
    setPreviewOpen(true)
    setPreviewDoc(doc)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)

    try {
      if (doc.embed_url) {
        setPreviewUrl(normalizeEmbedUrl(doc.embed_url))
        return
      }

      if (!doc.storage_path) {
        setPreviewError('No preview available')
        return
      }

      const { data, error } = await supabase.storage
        .from('project-files')
        .createSignedUrl(doc.storage_path, 60 * 10)

      if (error || !data?.signedUrl) {
        setPreviewError('Could not load preview')
        return
      }

      setPreviewUrl(data.signedUrl)
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)

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
        console.error('Load project error:', error)
        setProject(null)
        setLoading(false)
        return
      }

      setProject({
        ...projectData,
        project_steps: (projectData.project_steps || []) as StepRaw[],
      })

      const { data: todosData } = await supabase
        .from('project_todos')
        .select('id, project_id, text, is_done, completed_at, created_at')
        .eq('project_id', projectId)
        .order('created_at')

      setTodos((todosData || []) as Todo[])

      const { data: docsData } = await supabase
        .from('project_documents')
        .select('id, project_id, title, storage_path, embed_url, file_type, size_bytes, created_at, updated_at')
        .eq('project_id', projectId)
        .order('created_at')

      setDocs((docsData || []) as ProjectDoc[])
      setLoading(false)
    }

    loadData()
  }, [projectId])

  // thumbs for uploads
  useEffect(() => {
    const loadThumbs = async () => {
      const targets = docs.filter((d) => d.storage_path)
      const missing = targets.filter((d) => !docThumbs[d.id])
      if (missing.length === 0) return

      const next: Record<string, string> = {}
      for (const d of missing) {
        const { data, error } = await supabase.storage
          .from('project-files')
          .createSignedUrl(d.storage_path!, 60 * 10)

        if (!error && data?.signedUrl) next[d.id] = data.signedUrl
      }
      if (Object.keys(next).length > 0) setDocThumbs((prev) => ({ ...prev, ...next }))
    }

    loadThumbs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs])

  if (loading) return <p className="p-8">Loading…</p>
  if (!project) return <p className="p-8">Project not found</p>

  const toggleTodo = async (todoId: string) => {
    let next = false

    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== todoId) return t
        next = !t.is_done
        return { ...t, is_done: next, completed_at: next ? new Date().toISOString() : null }
      })
    )

    const { error } = await supabase
      .from('project_todos')
      .update({ is_done: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', todoId)

    if (error) console.error('Toggle todo error:', error)
  }

  const requestTaskToggle = (stepId: string, taskId: string, nextDone: boolean) => {
    // if they’re completing it -> prompt for optional note
    if (nextDone) {
      setPendingTask({ stepId, taskId, nextDone })
      setNoteText('')
      setNoteOpen(true)
      return
    }

    // unchecking: just toggle immediately
    void commitTaskToggle(stepId, taskId, nextDone, null)
  }

  const commitTaskToggle = async (stepId: string, taskId: string, nextDone: boolean, note: string | null) => {
    // optimistic
    setProject((prev: any) => ({
      ...prev,
      project_steps: (prev.project_steps || []).map((s: StepRaw) => {
        if (s.id !== stepId) return s
        return {
          ...s,
          project_step_tasks: (s.project_step_tasks || []).map((t: Task) =>
            t.id === taskId ? { ...t, is_done: nextDone } : t
          ),
        }
      }),
    }))

    setUpdatingTaskId(taskId)

    const { error: taskErr } = await supabase
      .from('project_step_tasks')
      .update({ is_done: nextDone })
      .eq('id', taskId)

    if (taskErr) {
      console.error('Toggle task error:', taskErr)
      setUpdatingTaskId(null)
      return
    }

    if (note && note.trim().length > 0) {
      const { error: noteErr } = await supabase.from('project_task_notes').insert({
        project_id: projectId,
        task_id: taskId,
        note: note.trim(),
        created_by: 'client',
      })
      if (noteErr) console.error('Insert task note error:', noteErr)
    }

    setUpdatingTaskId(null)
  }

  const submitNoteAndComplete = async (skip: boolean) => {
    if (!pendingTask) return
    setSavingNote(true)
    await commitTaskToggle(pendingTask.stepId, pendingTask.taskId, pendingTask.nextDone, skip ? null : noteText)
    setSavingNote(false)
    setNoteOpen(false)
    setPendingTask(null)
    setNoteText('')
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-sm text-gray-500">Project</p>
          <h1 className="text-3xl font-bold">{project.name}</h1>
        </div>

        <button
          onClick={() => router.push('/dashboard/client/projects')}
          className="text-sm underline text-neutral-600 hover:text-black"
        >
          Back
        </button>
      </div>

      {/* Current Phase Tasks (replaces brief at top) */}
      <div className="border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {currentStep ? `Current Phase: ${currentStep.title}` : 'Current Phase'}
            </h3>
            <p className="text-sm text-gray-500">
              {currentStep ? `${currentStepDone}/${currentStepTotal} complete` : 'No phases yet'}
            </p>
          </div>

          <button
            onClick={() => setShowBrief((v) => !v)}
            className="text-sm underline text-neutral-600 hover:text-black"
            title="Toggle brief"
          >
            {showBrief ? 'Hide brief' : 'Show brief'}
          </button>
        </div>

        {currentStepTasks.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks in this phase yet.</p>
        ) : (
          <div className="space-y-2">
            {currentStepTasks.map((t) => {
              const busy = updatingTaskId === t.id
              return (
                <label key={t.id} className={`flex items-start gap-3 border rounded-xl p-3 ${busy ? 'opacity-70' : ''}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={t.is_done}
                    disabled={busy}
                    onChange={() => requestTaskToggle(currentStep!.id, t.id, !t.is_done)}
                  />
                  <div className="flex-1">
                    <div className={t.is_done ? 'line-through text-gray-400' : 'text-gray-800'}>
                      {t.title}
                    </div>
                    <div className="text-xs text-gray-500 pt-1">
                      {t.due_date ? `Due ${formatDateShort(t.due_date)}` : 'No due date'}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {/* Brief lives here now (toggle) */}
        {showBrief ? (
          <div className="mt-3 border-t pt-3">
            <div className="text-sm font-medium">Project Brief</div>
            <div className="pt-2 whitespace-pre-wrap text-sm text-gray-800">
              {project.brief_content ?? ''}
            </div>
          </div>
        ) : null}
      </div>

      {/* Progress */}
      <div className="border rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span>{percent}%</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="bg-black h-3 rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>

        <div className="text-sm text-gray-600">
          {currentStep ? (
            <>
              <span className="font-medium">Current phase:</span> {currentStep.title}
            </>
          ) : (
            'No phases yet.'
          )}
        </div>
      </div>

      {/* Client Todos */}
      <div className="border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Your Notes</h3>

        {todos.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {todos.map((t) => (
              <label key={t.id} className="flex items-start gap-3 border rounded-xl p-3">
                <input type="checkbox" checked={t.is_done} onChange={() => toggleTodo(t.id)} className="mt-1" />
                <div className="flex-1">
                  <div className={t.is_done ? 'line-through text-gray-400' : 'text-gray-800'}>{t.text}</div>
                  <div className="text-xs text-gray-500 pt-1">
                    {t.is_done && t.completed_at
                      ? `Completed ${formatDateTimeShort(t.completed_at)}`
                      : `Added ${formatDateTimeShort(t.created_at)}`}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Documents</h3>

        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {docs.length === 0 ? <div className="text-sm text-gray-400">No documents yet.</div> : null}

          {docs.map((d) => {
            const thumbUrl = d.storage_path ? docThumbs[d.id] : null
            const isLink = !!d.embed_url
            const linkThumb = d.embed_url ? normalizeEmbedUrl(d.embed_url) : null

            return (
              <button
                key={d.id}
                type="button"
                onClick={() => openPreview(d)}
                className="group shrink-0 w-52 rounded-2xl border hover:border-black transition overflow-hidden text-left relative"
                title={d.title}
              >
                <div className="h-28 bg-gray-50 border-b relative">
                  {isLink && linkThumb ? (
                    <iframe
                      src={linkThumb}
                      className="absolute inset-0 w-full h-full"
                      title="Link thumbnail"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}

                  {!isLink && thumbUrl && isProbablyImage(d) ? (
                    <img src={thumbUrl} alt={d.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  ) : null}

                  {!isLink && thumbUrl && isProbablyPdf(d) ? (
                    <iframe
                      src={thumbUrl}
                      className="absolute inset-0 w-full h-full"
                      title="PDF thumbnail"
                      loading="lazy"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}

                  {(!isLink && !thumbUrl) ||
                  (!isLink && thumbUrl && !(isProbablyImage(d) || isProbablyPdf(d))) ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                      <div className="px-2 py-1 rounded bg-white border">{(d.file_type ?? 'FILE').toUpperCase()}</div>
                    </div>
                  ) : null}

                  <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded-full bg-white/90 border text-gray-600">
                    {isLink ? 'LINK' : isProbablyPdf(d) ? 'PDF' : isProbablyImage(d) ? 'IMAGE' : 'FILE'}
                  </div>
                </div>

                <div className="p-3">
                  <div className="text-sm font-medium line-clamp-2">{d.title}</div>
                  <div className="pt-2 text-xs text-gray-500">Added {formatDateTimeShort(d.created_at)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePreview()
          }}
        >
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">Preview</div>
                <div className="font-semibold">{previewDoc?.title ?? 'Document'}</div>
              </div>
              <button onClick={closePreview} className="text-sm underline text-neutral-600 hover:text-black">
                Close
              </button>
            </div>

            <div className="p-4">
              {previewLoading ? (
                <div className="text-sm text-gray-500">Loading preview…</div>
              ) : previewError ? (
                <div className="text-sm text-red-600">{previewError}</div>
              ) : !previewUrl ? (
                <div className="text-sm text-gray-500">No preview available.</div>
              ) : previewDoc?.embed_url || (previewDoc && isProbablyPdf(previewDoc)) ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh] rounded-xl border"
                  title="Document preview"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              ) : previewDoc && isProbablyImage(previewDoc) ? (
                <img src={previewUrl} alt={previewDoc.title} className="max-h-[70vh] w-auto mx-auto rounded-xl border" />
              ) : (
                <div className="rounded-xl border p-4 text-sm text-gray-600">
                  This file type doesn’t support inline preview yet.
                  <div className="pt-2">
                    <button className="underline" onClick={() => window.open(previewUrl, '_blank', 'noreferrer')}>
                      Open file
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Task Note Modal */}
      {noteOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingNote) {
              setNoteOpen(false)
              setPendingTask(null)
              setNoteText('')
            }
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 border-b">
              <div className="text-sm text-gray-500">Optional</div>
              <div className="font-semibold">Add a quick note?</div>
              <div className="text-xs text-gray-500 pt-1">
                Examples: “ok to proceed”, “I’ll call you”, “please tweak this”, “approved”
              </div>
            </div>

            <div className="p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type a quick note (optional)…"
                className="w-full border rounded-xl p-3 text-sm min-h-[110px]"
                disabled={savingNote}
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => submitNoteAndComplete(true)}
                  className="text-sm underline text-neutral-600 hover:text-black"
                  disabled={savingNote}
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={() => submitNoteAndComplete(false)}
                  className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60"
                  disabled={savingNote}
                >
                  {savingNote ? 'Saving…' : 'Save & complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}