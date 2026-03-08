'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type Task = {
  id: string
  project_id: string
  project_step_id: string
  title: string
  is_done: boolean
  due_date: string | null
  updated_at: string
}

type Step = {
  id: string
  title: string
  step_order: number
  project_step_tasks: Task[]
}

type ProjectDoc = {
  id: string
  title: string
  storage_path: string | null
  embed_url: string | null
  file_type: string | null
  created_at: string
}

type MeetingNote = {
  id: string
  title: string
  meeting_date: string | null
  content: any
  status: string
  created_at: string
}

type Project = {
  id: string
  name: string
  project_type: string | null
  brief_content: string | null
  project_steps: Step[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return ts }
}

function typeLabel(type: string | null) {
  if (!type) return null
  if (type === 'brand-alignment-intensive' || type === 'BAI') return 'BAI'
  if (type === 'brand-system-build' || type === 'BSB') return 'BSB'
  if (type === 'brand-stewardship-retainer' || type === 'BSR') return 'BSR'
  return type
}

function typeLabelFull(type: string | null) {
  if (!type) return null
  if (type === 'brand-alignment-intensive' || type === 'BAI') return 'Brand Alignment Intensive'
  if (type === 'brand-system-build' || type === 'BSB') return 'Brand System Build'
  if (type === 'brand-stewardship-retainer' || type === 'BSR') return 'Brand Stewardship Retainer'
  return type
}

function normalizeEmbedUrl(url: string) {
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
  } catch { return url }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientProjectPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'docs' | 'notes'>('overview')

  // Task toggle state
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [pendingTask, setPendingTask] = useState<{ stepId: string; taskId: string } | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  // Doc preview
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docThumbs, setDocThumbs] = useState<Record<string, string>>({})

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: projData } = await supabase
        .from('projects')
        .select(`
          id, name, project_type, brief_content,
          project_steps (
            id, title, step_order,
            project_step_tasks ( id, project_id, project_step_id, title, is_done, due_date, updated_at )
          )
        `)
        .eq('id', projectId)
        .single()

      if (projData) {
        const steps = ((projData.project_steps ?? []) as any[]).map((s: any) => ({
          ...s,
          project_step_tasks: (s.project_step_tasks ?? []) as Task[],
        })) as Step[]
        setProject({ ...projData as any, project_steps: steps })
      }

      const { data: docsData } = await supabase
        .from('project_documents')
        .select('id, title, storage_path, embed_url, file_type, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      setDocs((docsData ?? []) as ProjectDoc[])

      const { data: notesData } = await supabase
        .from('meeting_notes')
        .select('id, title, meeting_date, content, status, created_at')
        .eq('project_id', projectId)
        .eq('status', 'published')
        .order('meeting_date', { ascending: false })
      setMeetingNotes((notesData ?? []) as MeetingNote[])

      setLoading(false)
    }
    load()
  }, [projectId])

  // Signed URLs for uploaded docs
  useEffect(() => {
    const loadThumbs = async () => {
      const missing = docs.filter((d) => d.storage_path && !docThumbs[d.id])
      if (!missing.length) return
      const next: Record<string, string> = {}
      for (const d of missing) {
        const { data } = await supabase.storage
          .from('project-files')
          .createSignedUrl(d.storage_path!, 60 * 10)
        if (data?.signedUrl) next[d.id] = data.signedUrl
      }
      if (Object.keys(next).length) setDocThumbs((prev) => ({ ...prev, ...next }))
    }
    loadThumbs()
  }, [docs])

  // ─── Derived ──────────────────────────────────────────────────────────────
  const stepsSorted = useMemo(() => {
    if (!project) return []
    return [...project.project_steps].sort((a, b) => a.step_order - b.step_order)
  }, [project])

  const { total, done, percent, currentStep } = useMemo(() => {
    let total = 0, done = 0
    for (const s of stepsSorted) {
      for (const t of s.project_step_tasks) { total++; if (t.is_done) done++ }
    }
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    const currentStep = stepsSorted.find((s) => s.project_step_tasks.some((t) => !t.is_done)) ?? stepsSorted[stepsSorted.length - 1] ?? null
    return { total, done, percent, currentStep }
  }, [stepsSorted])

  const currentStepTasks = currentStep?.project_step_tasks ?? []

  // ─── Task toggle ───────────────────────────────────────────────────────────
  const requestTaskToggle = (stepId: string, taskId: string, nextDone: boolean) => {
    if (nextDone) {
      setPendingTask({ stepId, taskId })
      setNoteText('')
      setNoteOpen(true)
      return
    }
    commitTaskToggle(stepId, taskId, false, null)
  }

  const commitTaskToggle = async (stepId: string, taskId: string, nextDone: boolean, note: string | null) => {
    setProject((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        project_steps: prev.project_steps.map((s) =>
          s.id !== stepId ? s : {
            ...s,
            project_step_tasks: s.project_step_tasks.map((t) =>
              t.id !== taskId ? t : { ...t, is_done: nextDone }
            ),
          }
        ),
      }
    })
    setUpdatingTaskId(taskId)
    await supabase.from('project_step_tasks').update({ is_done: nextDone }).eq('id', taskId)
    if (note?.trim()) {
      await supabase.from('project_task_notes').insert({
        project_id: projectId, task_id: taskId, note: note.trim(), created_by: 'client',
      })
    }
    setUpdatingTaskId(null)
  }

  const submitNote = async (skip: boolean) => {
    if (!pendingTask) return
    setSavingNote(true)
    await commitTaskToggle(pendingTask.stepId, pendingTask.taskId, true, skip ? null : noteText)
    setSavingNote(false)
    setNoteOpen(false)
    setPendingTask(null)
    setNoteText('')
  }

  // ─── Doc preview ──────────────────────────────────────────────────────────
  const openPreview = async (doc: ProjectDoc) => {
    setPreviewDoc(doc)
    setPreviewLoading(true)
    setPreviewUrl(null)
    if (doc.embed_url) {
      setPreviewUrl(normalizeEmbedUrl(doc.embed_url))
    } else if (doc.storage_path) {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.storage_path, 600)
      setPreviewUrl(data?.signedUrl ?? null)
    }
    setPreviewLoading(false)
  }

  const isImage = (d: ProjectDoc) => (d.file_type ?? '').toLowerCase().startsWith('image/')
  const isPdf = (d: ProjectDoc) => (d.file_type ?? '').toLowerCase().includes('pdf')

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>
  if (!project) return <div className="p-8 text-sm text-red-400">Project not found.</div>

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'docs' as const, label: `Documents${docs.length ? ` (${docs.length})` : ''}` },
    { id: 'notes' as const, label: `Meeting Notes${meetingNotes.length ? ` (${meetingNotes.length})` : ''}` },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 pb-28">

      {/* ── Header ── */}
      <div className="px-6 pt-8 pb-6" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 55%)' }}>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/dashboard/client')}
            className="text-xs mb-4 flex items-center gap-1 transition"
            style={{ color: '#7EC8A0' }}
          >
            ← Dashboard
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              {project.project_type && (
                <span
                  className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2"
                  style={{ background: '#F04D3D20', color: '#F04D3D' }}
                >
                  {typeLabelFull(project.project_type)}
                </span>
              )}
              <h1 className="text-2xl text-white leading-tight">{project.name}</h1>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold" style={{ color: '#F04D3D' }}>{percent}%</p>
              <p className="text-xs" style={{ color: '#666' }}>{done}/{total} tasks</p>
            </div>
          </div>

          {/* Phase stepper */}
          {stepsSorted.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center">
                {stepsSorted.map((step, i) => {
                  const tasks = step.project_step_tasks
                  const allDone = tasks.length > 0 && tasks.every((t) => t.is_done)
                  const isActive = step.id === currentStep?.id
                  const isLast = i === stepsSorted.length - 1
                  return (
                    <div key={step.id} className="flex items-center" style={{ flex: isLast ? '0 0 auto' : 1 }}>
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: allDone ? '#7EC8A0' : isActive ? '#F04D3D' : '#333',
                          outline: isActive ? '3px solid #F04D3D40' : 'none',
                        }}
                      />
                      {!isLast && (
                        <div className="h-px flex-1" style={{ background: allDone ? '#7EC8A0' : '#333' }} />
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: '#7EC8A0' }}>
                Phase {stepsSorted.findIndex((s) => s.id === currentStep?.id) + 1} of {stepsSorted.length}
                {currentStep && <span className="text-neutral-500"> — {currentStep.title}</span>}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-black border-b border-neutral-800 px-6">
        <div className="max-w-2xl mx-auto flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px"
              style={{
                borderColor: activeTab === tab.id ? '#F04D3D' : 'transparent',
                color: activeTab === tab.id ? '#F04D3D' : '#666',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <>
            {/* Current phase tasks */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-0.5">Current Phase</p>
                  <h3 className="font-bold text-neutral-900">{currentStep?.title ?? 'No active phase'}</h3>
                </div>
                {currentStepTasks.length > 0 && (
                  <span className="text-xs text-neutral-500">
                    {currentStepTasks.filter((t) => t.is_done).length}/{currentStepTasks.length}
                  </span>
                )}
              </div>

              {currentStepTasks.length === 0 ? (
                <p className="text-sm text-neutral-400">No tasks in this phase yet.</p>
              ) : (
                <div className="space-y-2">
                  {currentStepTasks.map((task) => {
                    const busy = updatingTaskId === task.id
                    return (
                      <label
                        key={task.id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition cursor-pointer ${
                          task.is_done ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                        } ${busy ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={task.is_done}
                          disabled={busy}
                          onChange={() => requestTaskToggle(currentStep!.id, task.id, !task.is_done)}
                          className="mt-0.5 shrink-0 accent-[#F04D3D]"
                        />
                        <div className="flex-1">
                          <p className={`text-sm ${task.is_done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                            {task.title}
                          </p>
                          {task.due_date && !task.is_done && (
                            <p className="text-xs text-neutral-400 mt-0.5">Due {formatDate(task.due_date)}</p>
                          )}
                        </div>
                        {task.is_done && (
                          <span className="text-xs font-bold shrink-0" style={{ color: '#7EC8A0' }}>✓</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* All phases */}
            {stepsSorted.length > 1 && (
              <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                <h3 className="font-bold text-neutral-900 mb-4">All Phases</h3>
                <div className="space-y-3">
                  {stepsSorted.map((step, i) => {
                    const tasks = step.project_step_tasks
                    const allDone = tasks.length > 0 && tasks.every((t) => t.is_done)
                    const isActive = step.id === currentStep?.id
                    const stepDone = tasks.filter((t) => t.is_done).length
                    return (
                      <div key={step.id} className="flex items-center gap-4">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: allDone ? '#1A342820' : isActive ? '#F04D3D' : '#f5f5f5',
                            color: allDone ? '#1A3428' : isActive ? '#fff' : '#bbb',
                          }}
                        >
                          {allDone ? '✓' : String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isActive ? 'text-neutral-900' : allDone ? 'text-neutral-500' : 'text-neutral-400'}`}>
                            {step.title}
                          </p>
                          {tasks.length > 0 && (
                            <p className="text-xs text-neutral-400">{stepDone}/{tasks.length} tasks</p>
                          )}
                        </div>
                        {isActive && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F04D3D15', color: '#F04D3D' }}>
                            Active
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Brief */}
            {project.brief_content && (() => {
              const raw = project.brief_content
              // EditorJS object
              if (typeof raw === 'object' && raw !== null && Array.isArray((raw as any).blocks)) {
                const blocks = (raw as any).blocks as any[]
                const text = blocks
                  .filter((b) => b.type === 'paragraph' || b.type === 'header')
                  .map((b) => String(b.data?.text ?? ''))
                  .filter(Boolean)
                  .join('\n\n')
                if (!text) return null
                return (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                    <h3 className="font-bold text-neutral-900 mb-3">Project Brief</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{text}</p>
                  </div>
                )
              }
              // Plain string
              if (typeof raw === 'string' && raw.trim()) {
                return (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                    <h3 className="font-bold text-neutral-900 mb-3">Project Brief</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{raw}</p>
                  </div>
                )
              }
              return null
            })()}
          </>
        )}

        {/* ══ DOCUMENTS ══ */}
        {activeTab === 'docs' && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <h3 className="font-bold text-neutral-900 mb-4">Documents</h3>
            {docs.length === 0 ? (
              <p className="text-sm text-neutral-400">No documents yet — Riley will share files here as work progresses.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {docs.map((doc) => {
                  const thumbUrl = docThumbs[doc.id] ?? null
                  const isLink = !!doc.embed_url

                  return (
                    <button
                      key={doc.id}
                      onClick={() => openPreview(doc)}
                      className="text-left rounded-2xl border border-neutral-200 overflow-hidden hover:border-neutral-400 hover:shadow-sm transition group"
                    >
                      {/* Thumbnail */}
                      <div className="h-24 bg-neutral-50 border-b border-neutral-100 relative overflow-hidden">
                        {isLink && (
                          <iframe
                            src={normalizeEmbedUrl(doc.embed_url!)}
                            className="absolute inset-0 w-full h-full"
                            loading="lazy"
                            style={{ pointerEvents: 'none' }}
                            sandbox="allow-same-origin allow-scripts"
                          />
                        )}
                        {!isLink && thumbUrl && isImage(doc) && (
                          <img src={thumbUrl} alt={doc.title} className="absolute inset-0 w-full h-full object-cover" />
                        )}
                        {!isLink && thumbUrl && isPdf(doc) && (
                          <iframe src={thumbUrl} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
                        )}
                        {!isLink && !thumbUrl && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-neutral-300 uppercase">{doc.file_type ?? 'File'}</span>
                          </div>
                        )}
                        <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/90 text-neutral-500">
                          {isLink ? 'LINK' : isPdf(doc) ? 'PDF' : isImage(doc) ? 'IMG' : 'FILE'}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-neutral-800 line-clamp-2 group-hover:text-black">{doc.title}</p>
                        <p className="text-xs text-neutral-400 mt-1">{formatDate(doc.created_at)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ MEETING NOTES ══ */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            {meetingNotes.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
                <p className="text-sm text-neutral-400">No meeting notes published yet.</p>
              </div>
            ) : (
              meetingNotes.map((note) => (
                <div key={note.id} className="bg-white border border-neutral-200 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-0.5">Meeting Notes</p>
                      <h3 className="font-bold text-neutral-900">{note.title}</h3>
                    </div>
                    {note.meeting_date && (
                      <p className="text-xs text-neutral-400 shrink-0">{formatDate(note.meeting_date)}</p>
                    )}
                  </div>
                  {note.content && (() => {
                    const blocks = typeof note.content === 'string'
                      ? null
                      : Array.isArray(note.content?.blocks)
                        ? note.content.blocks
                        : null
                    if (typeof note.content === 'string') {
                      return <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    }
                    if (blocks) {
                      return (
                        <div className="text-sm text-neutral-600 leading-relaxed space-y-2">
                          {blocks
                            .filter((b: any) => b.type === 'paragraph' || b.type === 'header')
                            .map((b: any, i: number) => (
                              <p key={i} className={b.type === 'header' ? 'font-semibold text-neutral-800' : ''}>
                                {String(b.data?.text ?? '')}
                              </p>
                            ))}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Doc Preview Modal ── */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setPreviewDoc(null); setPreviewUrl(null) } }}
        >
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div>
                <p className="text-xs text-neutral-400">Document</p>
                <p className="font-semibold text-neutral-900">{previewDoc.title}</p>
              </div>
              <button
                onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }}
                className="text-sm text-neutral-400 hover:text-black transition"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              {previewLoading ? (
                <p className="text-sm text-neutral-400 py-8 text-center">Loading…</p>
              ) : !previewUrl ? (
                <p className="text-sm text-neutral-400 py-8 text-center">No preview available.</p>
              ) : previewDoc.embed_url || isPdf(previewDoc) ? (
                <iframe
                  src={previewUrl}
                  className="w-full rounded-xl border border-neutral-100"
                  style={{ height: '65vh' }}
                  title={previewDoc.title}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              ) : isImage(previewDoc) ? (
                <img src={previewUrl} alt={previewDoc.title} className="max-h-[65vh] w-auto mx-auto rounded-xl" />
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500 mb-3">This file type does not support inline preview.</p>
                  <button
                    onClick={() => window.open(previewUrl, '_blank', 'noreferrer')}
                    className="text-sm font-medium underline"
                    style={{ color: '#F04D3D' }}
                  >
                    Open file
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Task Note Modal ── */}
      {noteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !savingNote) { setNoteOpen(false); setPendingTask(null) } }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100">
              <p className="font-bold text-neutral-900">Add a quick note?</p>
              <p className="text-xs text-neutral-400 mt-0.5">Optional — e.g. "Approved", "Let's discuss", "Please tweak"</p>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type a quick note…"
                rows={3}
                disabled={savingNote}
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => submitNote(true)}
                  disabled={savingNote}
                  className="text-sm text-neutral-400 hover:text-black transition"
                >
                  Skip
                </button>
                <button
                  onClick={() => submitNote(false)}
                  disabled={savingNote}
                  className="text-sm font-semibold px-4 py-2 rounded-xl text-white transition"
                  style={{ background: '#F04D3D' }}
                >
                  {savingNote ? 'Saving…' : 'Save & complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
