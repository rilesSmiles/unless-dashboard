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

type ProjectRow = {
  id: string
  name: string
  client_id: string | null
}

type ProfileClient = {
  id: string
  name: string | null
  business_name: string | null
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
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null)

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

  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

    // 🧩 thumbnail cache (docId -> signed url)
  const [docThumbs, setDocThumbs] = useState<Record<string, string>>({})

    // 👀 preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // ⚙️ Settings modal
const [settingsOpen, setSettingsOpen] = useState(false)
const [savingSettings, setSavingSettings] = useState(false)
const [settingsError, setSettingsError] = useState<string | null>(null)

// project fields
const [editProjectName, setEditProjectName] = useState('')
const [editClientId, setEditClientId] = useState<string>('')

// clients list (for dropdown)
const [clientOptions, setClientOptions] = useState<ProfileClient[]>([])

// steps editing (local copy)
type StepEdit = { id: string; title: string; step_order: number; _status?: 'keep' | 'new' | 'delete' }
const [editSteps, setEditSteps] = useState<StepEdit[]>([])

const stepHasTasks = (stepId: string) => {
  const step = stepsSorted.find((s) => s.id === stepId)
  return (step?.project_step_tasks?.length ?? 0) > 0
}

const openSettings = async () => {
  setSettingsError(null)

  // hydrate fields from current project in state
  setEditProjectName(project.name ?? '')
  setEditClientId(project.client_id ?? '')

  // copy steps into editable list
  const existingSteps = ((project.project_steps ?? []) as StepRaw[]).map((s) => ({
    id: s.id,
    title: s.title,
    step_order: s.step_order,
    _status: 'keep' as const,
  }))
  existingSteps.sort((a, b) => a.step_order - b.step_order)
  setEditSteps(existingSteps)

  // load clients for dropdown (optional)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, business_name')
    .eq('role', 'client')
    .order('business_name', { ascending: true })

  if (!error) setClientOptions((data || []) as ProfileClient[])

  setSettingsOpen(true)
}

const closeSettings = () => {
  setSettingsOpen(false)
  setSettingsError(null)
}

const addStepRow = () => {
  setEditSteps((prev) => {
    const maxOrder = prev.reduce((m, s) => Math.max(m, s.step_order), 0)
    return [
      ...prev,
      {
        id: `new-${Date.now()}`,
        title: 'New step',
        step_order: maxOrder + 1,
        _status: 'new',
      },
    ]
  })
}

const moveStep = (id: string, dir: 'up' | 'down') => {
  setEditSteps((prev) => {
    const sorted = [...prev].sort((a, b) => a.step_order - b.step_order)
    const idx = sorted.findIndex((s) => s.id === id)
    if (idx === -1) return prev

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return prev

    const a = sorted[idx]
    const b = sorted[swapIdx]
    const next = sorted.map((s) => ({ ...s }))

    // swap step_order
    const aOrder = a.step_order
    a.step_order = b.step_order
    b.step_order = aOrder

    return next.sort((x, y) => x.step_order - y.step_order)
  })
}

const deleteStepRow = (id: string) => {
  // If it's an existing step AND it has tasks, block deletion.
  const isNew = id.startsWith('new-')
  if (!isNew && stepHasTasks(id)) {
    alert("You can't delete a step that still has tasks. Move or delete the tasks first.")
    return
  }

  // For brand-new steps, just remove from the list.
  setEditSteps((prev) =>
    prev
      .map((s) => {
        if (s.id !== id) return s
        if (s._status === 'new' || isNew) return null
        return { ...s, _status: 'delete' as const }
      })
      .filter(Boolean as any)
  )
}

const saveSettings = async () => {
  setSavingSettings(true)
  setSettingsError(null)

  try {
    // 1) update project row
    const { error: projErr } = await supabase
      .from('projects')
      .update({
        name: editProjectName.trim(),
        client_id: editClientId || null,
      })
      .eq('id', projectId)

    if (projErr) throw projErr

    // normalize order: 1..n
    const kept = editSteps.filter((s) => s._status !== 'delete')
    const ordered = [...kept].sort((a, b) => a.step_order - b.step_order).map((s, i) => ({
      ...s,
      step_order: i + 1,
    }))

    const toDelete = editSteps.filter((s) => s._status === 'delete' && !s.id.startsWith('new-'))
    const toUpdate = ordered.filter((s) => s._status === 'keep' && !s.id.startsWith('new-'))
    const toInsert = ordered.filter((s) => s._status === 'new' || s.id.startsWith('new-'))

    // 2) deletes
    if (toDelete.length) {
      const { error } = await supabase.from('project_steps').delete().in(
        'id',
        toDelete.map((s) => s.id)
      )
      if (error) throw error
    }

    // 3) updates (title + order)
    for (const s of toUpdate) {
      const { error } = await supabase
        .from('project_steps')
        .update({ title: s.title.trim(), step_order: s.step_order })
        .eq('id', s.id)
      if (error) throw error
    }

    // 4) inserts
    if (toInsert.length) {
      const insertRows = toInsert.map((s) => ({
        project_id: projectId,
        title: s.title.trim(),
        step_order: s.step_order,
      }))
      const { data: inserted, error } = await supabase
        .from('project_steps')
        .insert(insertRows)
        .select('id, title, step_order')

      if (error) throw error

      // Merge inserted IDs into local state (optional)
      const insertedSteps = (inserted || []) as { id: string; title: string; step_order: number }[]
      // Re-fetch project is simplest + safest:
    }

    // ✅ easiest and safest: re-fetch project steps/tasks after save
    // (since deleting steps may affect UI assumptions)
    const { data: refreshed, error: refErr } = await supabase
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

    if (refErr || !refreshed) throw refErr

    setProject({
      ...refreshed,
      project_steps: (refreshed.project_steps || []) as StepRaw[],
    })

    setSettingsOpen(false)
  } catch (e: any) {
    console.error(e)
    setSettingsError(e?.message ?? 'Could not save settings.')
  } finally {
    setSavingSettings(false)
  }
}

  const deleteDoc = async (doc: ProjectDoc) => {
  const ok = confirm(`Delete "${doc.title}"?`)
  if (!ok) return

  // 1️⃣ delete storage file if exists
  if (doc.storage_path) {
    await supabase.storage
      .from('project-files')
      .remove([doc.storage_path])
  }

  // 2️⃣ delete database row
  const { error } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', doc.id)

  if (error) {
    console.error('Delete doc error:', error)
    return
  }

  // 3️⃣ update UI
  setDocs((prev) => prev.filter((d) => d.id !== doc.id))
  setDocThumbs((prev) => {
    const copy = { ...prev }
    delete copy[doc.id]
    return copy
  })
}

  const normalizeEmbedUrl = (url: string) => {
    // Google Docs/Sheets/Slides: /edit -> /preview
    try {
      const u = new URL(url)

      // Google Docs / Sheets / Slides
      if (u.hostname.includes('docs.google.com')) {
        // common patterns: .../edit, .../view, .../copy
        u.pathname = u.pathname.replace(/\/(edit|view|copy).*$/, '/preview')
        return u.toString()
      }

      // Google Drive file share: force "preview"
      if (u.hostname.includes('drive.google.com')) {
        // /file/d/<id>/view -> /file/d/<id>/preview
        u.pathname = u.pathname.replace(/\/view.*$/, '/preview')
        return u.toString()
      }

      // Figma: use embed endpoint if it's a normal file link
      if (u.hostname.includes('figma.com')) {
        // if already embed, leave it
        if (u.pathname.startsWith('/embed')) return u.toString()
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
      }

      return url
    } catch {
      return url
    }
  }

  const isProbablyImage = (doc: ProjectDoc) => {
    const t = (doc.file_type || '').toLowerCase()
    return t.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((x) => t.includes(x))
  }

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
      // Link-based docs
      if (doc.embed_url) {
        setPreviewUrl(normalizeEmbedUrl(doc.embed_url))
        return
      }

      // Uploaded docs -> signed URL
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

  // ==========
  // Upload helpers
  // ==========
  const sanitizeFileName = (name: string) => name.replace(/[^\w.\-]+/g, '_')

  const inferFileType = (file: File) => {
    if (file.type) return file.type
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext ? `.${ext}` : 'file'
  }

  const uploadDocFile = async (file: File) => {
    setUploadError(null)
    setUploadingDoc(true)

    try {
      const safeName = sanitizeFileName(file.name)
      const storagePath = `${projectId}/${Date.now()}_${safeName}`

      // 1) upload to Storage
      const { error: upErr } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })

      if (upErr) throw upErr

      // 2) insert row into project_documents
      const { data, error: dbErr } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          title: file.name,
          storage_path: storagePath,
          embed_url: null,
          file_type: inferFileType(file),
          size_bytes: file.size,
        })
        .select('id, project_id, title, storage_path, embed_url, file_type, size_bytes, created_at, updated_at')
        .single()

      if (dbErr || !data) throw dbErr

      // 3) update UI
      setDocs((prev) => [...prev, data as ProjectDoc])
      setPickedFileName(null)
      setDocAddOpen(false)
    } catch (e: any) {
      console.error('Upload doc error:', e)
      setUploadError(e?.message ?? 'Upload failed')
    } finally {
      setUploadingDoc(false)
      // allow selecting the same file again
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openDoc = async (doc: ProjectDoc) => {
    if (doc.embed_url) {
      window.open(doc.embed_url, '_blank', 'noreferrer')
      return
    }
    if (!doc.storage_path) return

    const { data, error } = await supabase.storage
      .from('project-files')
      .createSignedUrl(doc.storage_path, 60 * 10)

    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error)
      alert('Could not open file')
      return
    }

    window.open(data.signedUrl, '_blank', 'noreferrer')
  }

  // ✅ file picker handlers (MUST be in component scope)
  const onPickFileClick = () => {
    fileInputRef.current?.click()
  }

  const onFileSelected = (file: File | null) => {
    if (!file) return
    setPickedFileName(file.name)
    uploadDocFile(file)
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

      const { data: todosData, error: todoErr } = await supabase
        .from('project_todos')
        .select('id, text, created_at')
        .eq('project_id', projectId)
        .order('created_at')

      if (todoErr) console.error('Load todos error:', todoErr, JSON.stringify(todoErr))
      setTodos((todosData || []) as Todo[])

      const { data: docsData, error: docsErr } = await supabase
        .from('project_documents')
        .select('id, project_id, title, storage_path, embed_url, file_type, size_bytes, created_at, updated_at')
        .eq('project_id', projectId)
        .order('created_at')

      if (docsErr) console.error('Load docs error:', docsErr, JSON.stringify(docsErr))
      setDocs((docsData || []) as ProjectDoc[])

      setLoading(false)
    }

    loadData()
  }, [projectId])

    useEffect(() => {
    const loadThumbs = async () => {
      // only for uploaded files
      const targets = docs.filter((d) => d.storage_path)

      if (targets.length === 0) return

      const missing = targets.filter((d) => !docThumbs[d.id])
      if (missing.length === 0) return

      const next: Record<string, string> = {}

      for (const d of missing) {
        const { data, error } = await supabase.storage
          .from('project-files')
          .createSignedUrl(d.storage_path!, 60 * 10)

        if (!error && data?.signedUrl) next[d.id] = data.signedUrl
      }

      if (Object.keys(next).length > 0) {
        setDocThumbs((prev) => ({ ...prev, ...next }))
      }
    }

    loadThumbs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs])

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

  const deleteTodo = async (todoId: string) => {
  const ok = confirm('Delete this note?')
  if (!ok) return

  // optimistic UI
  setTodos((prev) => prev.filter((t) => t.id !== todoId))

  setDeletingTodoId(todoId)
  const { error } = await supabase.from('project_todos').delete().eq('id', todoId)
  setDeletingTodoId(null)

  if (error) {
    console.error('Delete todo error:', error, JSON.stringify(error))
    // optional: reload the todos if you want to recover
  }
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
        s.id === stepId ? { ...s, project_step_tasks: [...(s.project_step_tasks || []), data] } : s
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
  onClick={openSettings}
  className="border px-4 py-2 rounded-lg text-sm hover:border-black"
>
  ⚙️ Settings
</button>
          <button
            onClick={() => router.push('/dashboard/admin/projects')}
            className="border px-4 py-2 rounded-lg text-sm hover:border-black"
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
              todos.map((t) => {
  const busy = deletingTodoId === t.id

  return (
    <div
      key={t.id}
      className={`group flex items-start gap-2 text-sm ${busy ? 'opacity-60' : ''}`}
    >
      <span className="pt-[2px]">•</span>

      <span className="flex-1">{t.text}</span>

      <button
        type="button"
        onClick={() => deleteTodo(t.id)}
        disabled={busy}
        className="opacity-0 group-hover:opacity-100 transition text-xs text-red-600 hover:text-red-800 px-2"
        title="Delete note"
        aria-label="Delete note"
      >
        🗑
      </button>
    </div>
  )
})
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <input
              className="border rounded p-2 w-full"
              placeholder="Add note…"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTodo()}}
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
                setUploadError(null)
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
                {/* FILE SLOT (uploads now) */}
                <div className="h-28 rounded-2xl border border-dashed p-3 flex flex-col justify-between">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                  />

                  <button
                    type="button"
                    onClick={onPickFileClick}
                    disabled={uploadingDoc}
                    className="flex-1 rounded-xl flex flex-col items-center justify-center text-sm text-gray-600 hover:text-black transition disabled:opacity-60"
                    title="Upload a file"
                  >
                    <div className="text-lg">{uploadingDoc ? '⏳' : '⬆️'}</div>
                    <div className="pt-1 font-medium">
                      {uploadingDoc ? 'Uploading…' : 'Choose a file'}
                    </div>
                    <div className="text-xs text-gray-400 pt-1">PDF, PNG, JPG, etc.</div>
                  </button>

                  <div className="pt-2 text-xs text-gray-500">
                    {uploadError ? (
                      <span className="text-red-600 line-clamp-1">{uploadError}</span>
                    ) : pickedFileName ? (
                      <span className="line-clamp-1">Selected: {pickedFileName}</span>
                    ) : (
                      <span>Nothing selected yet</span>
                    )}
                  </div>
                </div>

                {/* LINK SLOT */}
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
                Uploads are live now 😤 — links + files both supported.
              </p>
            </div>
          )}

          {/* Existing docs */}
                    {docs.map((d) => {
            const thumbUrl = d.storage_path ? docThumbs[d.id] : null
            const isLink = !!d.embed_url

            // for link thumbnails, use your existing normalizeEmbedUrl helper
            const linkThumb = d.embed_url ? normalizeEmbedUrl(d.embed_url) : null

            return (
              <button
                key={d.id}
                type="button"
                onClick={() => openPreview(d)}
                className="group shrink-0 w-52 rounded-2xl border hover:border-black transition overflow-hidden text-left relative"
                title={d.title}
              >
                {/* THUMBNAIL AREA */}
                <div className="h-28 bg-gray-50 border-b relative">
                  {/* Link preview thumbnail (iframe) */}
                  {isLink && linkThumb ? (
                    <iframe
                      src={linkThumb}
                      className="absolute inset-0 w-full h-full"
                      title="Link thumbnail"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      style={{
                        pointerEvents: 'none', // so clicking hits the button
                      }}
                    />
                  ) : null}

                  {/* Uploaded image thumbnail */}
                  {!isLink && thumbUrl && d.file_type?.startsWith('image/') ? (
                    <img
                      src={thumbUrl}
                      alt={d.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : null}

                  {/* Uploaded PDF thumbnail */}
                  {!isLink && thumbUrl && (d.file_type?.includes('pdf') || d.file_type?.includes('.pdf')) ? (
                    <iframe
                      src={thumbUrl}
                      className="absolute inset-0 w-full h-full"
                      title="PDF thumbnail"
                      loading="lazy"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}

                  {/* Fallback tile */}
                  {(!isLink && !thumbUrl) || (!isLink && thumbUrl && !(d.file_type?.startsWith('image/') || d.file_type?.includes('pdf') || d.file_type?.includes('.pdf'))) ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                      <div className="px-2 py-1 rounded bg-white border">
                        {(d.file_type ?? 'FILE').toUpperCase()}
                      </div>
                    </div>
                  ) : null}

                  {/* Small corner badge */}
                  <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded-full bg-white/90 border text-gray-600">
                    {isLink ? 'LINK' : d.file_type?.includes('pdf') ? 'PDF' : d.file_type?.startsWith('image/') ? 'IMAGE' : 'FILE'}
                  </div>
                  {/* Delete icon (hover only) */}
                  <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteDoc(d)
                      }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-white/90 backdrop-blur border rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                    title="Delete document"
                    >
                    🗑
                  </button>
                </div>

                {/* META AREA */}
                <div className="p-3">
                  <div className="text-sm font-medium line-clamp-2">{d.title}</div>
                  <div className="pt-2 text-xs text-gray-500">
                    Added {formatDateTimeShort(d.created_at)}
                  </div>
                  <div className="pt-2 text-xs text-gray-400 line-clamp-1">
                    {d.embed_url ?? d.storage_path ?? ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-gray-400">No documents yet — add links or uploads for client review.</p>
        ) : null}
      </div>

            {/* 👀 Preview Modal */}
      {previewOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) closePreview()
          }}
        >
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">Preview</div>
                <div className="font-semibold">{previewDoc?.title ?? 'Document'}</div>
                <div className="text-xs text-gray-400 pt-1">
                  {previewDoc?.file_type ?? ''}{previewDoc?.created_at ? ` • Added ${formatDateTimeShort(previewDoc.created_at)}` : ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {previewDoc?.embed_url ? (
                  <button
                    onClick={() => window.open(previewDoc.embed_url!, '_blank', 'noreferrer')}
                    className="text-sm underline text-neutral-600 hover:text-black"
                  >
                    Open
                  </button>
                ) : previewDoc?.storage_path ? (
                  <button
                    onClick={() => {
                      if (previewUrl) window.open(previewUrl, '_blank', 'noreferrer')
                    }}
                    disabled={!previewUrl}
                    className="text-sm underline text-neutral-600 hover:text-black disabled:opacity-60"
                  >
                    Open
                  </button>
                ) : null}

                <button
                  onClick={closePreview}
                  className="text-sm underline text-neutral-600 hover:text-black"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4">
              {previewLoading ? (
                <div className="text-sm text-gray-500">Loading preview…</div>
              ) : previewError ? (
                <div className="text-sm text-red-600">{previewError}</div>
              ) : !previewUrl ? (
                <div className="text-sm text-gray-500">No preview available.</div>
              ) : (
                <div className="w-full">
                  {/* If link embed OR pdf -> iframe */}
                  {previewDoc?.embed_url || (previewDoc && isProbablyPdf(previewDoc)) ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-[70vh] rounded-xl border"
                      title="Document preview"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    />
                  ) : previewDoc && isProbablyImage(previewDoc) ? (
                    <img
                      src={previewUrl}
                      alt={previewDoc.title}
                      className="max-h-[70vh] w-auto mx-auto rounded-xl border"
                    />
                  ) : (
                    <div className="rounded-xl border p-4 text-sm text-gray-600">
                      This file type doesn’t support inline preview yet.
                      <div className="pt-2">
                        <button
                          className="underline"
                          onClick={() => window.open(previewUrl, '_blank', 'noreferrer')}
                        >
                          Open file
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
      {settingsOpen ? (
  <div
    className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) closeSettings()
    }}
  >
    <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border overflow-hidden">
      <div className="p-4 border-b flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">Project settings</div>
          <div className="font-semibold">Edit project + steps</div>
        </div>
        <button onClick={closeSettings} className="text-sm underline text-neutral-600 hover:text-black">
          Close
        </button>
      </div>

      <div className="p-4 space-y-5">
        {settingsError ? <div className="text-sm text-red-600">{settingsError}</div> : null}

        {/* Project fields */}
        <div className="border rounded-2xl p-4 space-y-3">
          <div className="font-semibold">Project</div>

          <div>
            <div className="text-xs text-gray-500 pb-1">Project name</div>
            <input
              className="border rounded p-2 w-full"
              value={editProjectName}
              onChange={(e) => setEditProjectName(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs text-gray-500 pb-1">Client</div>
            <select
              className="border rounded p-2 w-full"
              value={editClientId}
              onChange={(e) => setEditClientId(e.target.value)}
            >
              <option value="">No client</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.business_name ?? 'Client') + (c.name ? ` — ${c.name}` : '')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Steps editor */}
        <div className="border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Steps</div>
            <button onClick={addStepRow} className="text-sm underline text-neutral-600 hover:text-black">
              + Add step
            </button>
          </div>

          <div className="space-y-2">
            {editSteps
              .filter((s) => s._status !== 'delete')
              .sort((a, b) => a.step_order - b.step_order)
              .map((s) => (
                <div key={s.id} className="border rounded-xl p-3 flex items-center gap-2">
                  <div className="text-xs text-gray-500 w-10">#{s.step_order}</div>

                  <input
                    className="border rounded p-2 flex-1"
                    value={s.title}
                    onChange={(e) =>
                      setEditSteps((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => moveStep(s.id, 'up')}
                    className="text-xs border rounded px-2 py-2 hover:border-black"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(s.id, 'down')}
                    className="text-xs border rounded px-2 py-2 hover:border-black"
                    title="Move down"
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteStepRow(s.id)}
                    className="text-xs text-red-600 hover:text-red-800 px-2"
                    title="Delete step"
                    aria-label="Delete step"
                  >
                    🗑
                  </button>
                </div>
              ))}
          </div>

          <div className="text-xs text-gray-500">
            Heads up: deleting a step may orphan tasks in that step. If you want, we can auto-delete those tasks too.
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={closeSettings} className="text-sm underline text-neutral-600 hover:text-black">
            Cancel
          </button>

          <button
            onClick={saveSettings}
            disabled={savingSettings || !editProjectName.trim()}
            className="bg-black text-white px-4 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {savingSettings ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  </div>
) : null}
    </div>
  )
}