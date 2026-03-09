'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type Task = {
  id: string; project_id: string; project_step_id: string
  title: string; is_done: boolean; due_date: string | null; updated_at: string
}
type Step = {
  id: string; title: string; step_order: number
  client_description: string | null; project_step_tasks: Task[]
}
type ClientDeliverable = {
  id: string; project_id: string; project_step_id: string
  title: string; description: string | null; is_done: boolean; sort_order: number
}
type ClientUpload = {
  id: string; project_id: string; title: string
  storage_path: string; file_type: string | null; file_size_bytes: number | null
  note: string | null; created_at: string
}
type ProjectDoc = {
  id: string; title: string; storage_path: string | null
  embed_url: string | null; file_type: string | null; created_at: string
}
type MeetingNote = {
  id: string; title: string; meeting_date: string | null
  content: any; status: string; created_at: string
}
type Project = {
  id: string; name: string; project_type: string | null
  brief_content: string | null; project_steps: Step[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(ts: string | null) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return ts }
}
function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    if (u.hostname.includes('docs.google.com')) { u.pathname = u.pathname.replace(/\/(edit|view|copy).*$/, '/preview'); return u.toString() }
    if (u.hostname.includes('drive.google.com')) { u.pathname = u.pathname.replace(/\/view.*$/, '/preview'); return u.toString() }
    if (u.hostname.includes('figma.com')) {
      if (u.pathname.startsWith('/embed')) return u.toString()
      return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    }
    return url
  } catch { return url }
}
function renderNoteContent(content: any): React.ReactNode {
  if (!content) return null
  if (typeof content === 'string') return <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{content}</p>
  if (typeof content === 'object' && Array.isArray(content?.blocks)) {
    const blocks = content.blocks as any[]
    return (
      <div className="text-sm text-neutral-600 leading-relaxed space-y-2">
        {blocks.filter((b) => b.type === 'paragraph' || b.type === 'header').map((b, i) => (
          <p key={i} className={b.type === 'header' ? 'font-semibold text-neutral-800' : ''}>{String(b.data?.text ?? '')}</p>
        ))}
      </div>
    )
  }
  return null
}
function renderBriefContent(raw: any): React.ReactNode {
  if (!raw) return null
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as any).blocks)) {
    const text = (raw as any).blocks.filter((b: any) => b.type === 'paragraph' || b.type === 'header').map((b: any) => String(b.data?.text ?? '')).filter(Boolean).join('\n\n')
    return text ? <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{text}</p> : null
  }
  if (typeof raw === 'string' && raw.trim()) return <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{raw}</p>
  return null
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientProjectPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [project, setProject] = useState<Project | null>(null)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([])
  const [deliverables, setDeliverables] = useState<ClientDeliverable[]>([])
  const [clientUploads, setClientUploads] = useState<ClientUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'docs' | 'notes' | 'uploads'>('overview')

  // Doc preview
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docThumbs, setDocThumbs] = useState<Record<string, string>>({})

  // Client upload state
  const [uploading, setUploading] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadNote, setUploadNote] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file')
  const [uploadLinkUrl, setUploadLinkUrl] = useState('')

  // Deliverable updating
  const [updatingDelivId, setUpdatingDelivId] = useState<string | null>(null)

  // Accordion state for All Phases
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = searchParams.get('tab') as typeof activeTab | null
    if (tab) setActiveTab(tab)
  }, [searchParams])

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setLoading(false); return }

      const [{ data: projData }, { data: docsData }, { data: notesData }, { data: delivData }, { data: uploadData }] = await Promise.all([
        supabase.from('projects').select(`
          id, name, project_type, brief_content,
          project_steps(id, title, step_order, client_description,
            project_step_tasks(id, project_id, project_step_id, title, is_done, due_date, updated_at))
        `).eq('id', projectId).single(),

        supabase.from('project_documents')
          .select('id, title, storage_path, embed_url, file_type, created_at')
          .eq('project_id', projectId).order('created_at', { ascending: false }),

        supabase.from('meeting_notes')
          .select('id, title, meeting_date, content, status, created_at')
          .eq('project_id', projectId).eq('status', 'published')
          .order('meeting_date', { ascending: false }),

        supabase.from('client_deliverables')
          .select('id, project_id, project_step_id, title, description, is_done, sort_order')
          .eq('project_id', projectId).order('sort_order'),

        supabase.from('client_uploads')
          .select('id, project_id, title, storage_path, file_type, file_size_bytes, note, created_at')
          .eq('project_id', projectId).order('created_at', { ascending: false }),
      ])

      if (projData) {
        const steps = ((projData.project_steps ?? []) as any[]).map((s: any) => ({
          ...s, client_description: s.client_description ?? null,
          project_step_tasks: (s.project_step_tasks ?? []) as Task[],
        })) as Step[]
        setProject({ ...projData as any, project_steps: steps })
      }
      setDocs((docsData ?? []) as ProjectDoc[])
      setMeetingNotes((notesData ?? []) as MeetingNote[])
      setDeliverables((delivData ?? []) as ClientDeliverable[])
      setClientUploads((uploadData ?? []) as ClientUpload[])
      setLoading(false)
    }
    load()
  }, [projectId])

  useEffect(() => {
    const loadThumbs = async () => {
      const missing = docs.filter((d) => d.storage_path && !docThumbs[d.id])
      if (!missing.length) return
      const next: Record<string, string> = {}
      for (const d of missing) {
        const { data } = await supabase.storage.from('project-files').createSignedUrl(d.storage_path!, 600)
        if (data?.signedUrl) next[d.id] = data.signedUrl
      }
      if (Object.keys(next).length) setDocThumbs((p) => ({ ...p, ...next }))
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
    for (const s of stepsSorted) for (const t of s.project_step_tasks) { total++; if (t.is_done) done++ }
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    const currentStep = stepsSorted.find((s) => s.project_step_tasks.some((t) => !t.is_done)) ?? stepsSorted[stepsSorted.length - 1] ?? null
    return { total, done, percent, currentStep }
  }, [stepsSorted])

  const currentDeliverables = useMemo(() =>
    deliverables.filter((d) => d.project_step_id === currentStep?.id),
    [deliverables, currentStep])

  // ─── Deliverable toggle ───────────────────────────────────────────────────
  const toggleDeliverable = async (deliv: ClientDeliverable) => {
    const next = !deliv.is_done
    setUpdatingDelivId(deliv.id)
    setDeliverables((prev) => prev.map((d) => d.id === deliv.id ? { ...d, is_done: next } : d))
    await supabase.from('client_deliverables').update({ is_done: next }).eq('id', deliv.id)
    setUpdatingDelivId(null)
  }

  // ─── Doc preview ──────────────────────────────────────────────────────────
  const openPreview = async (doc: ProjectDoc) => {
    setPreviewDoc(doc)
    setPreviewLoading(true)
    setPreviewUrl(null)
    if (doc.embed_url) setPreviewUrl(normalizeEmbedUrl(doc.embed_url))
    else if (doc.storage_path) {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.storage_path, 600)
      setPreviewUrl(data?.signedUrl ?? null)
    }
    setPreviewLoading(false)
  }
  const isImage = (d: ProjectDoc) => (d.file_type ?? '').toLowerCase().startsWith('image/')
  const isPdf = (d: ProjectDoc) => (d.file_type ?? '').toLowerCase().includes('pdf')

  // ─── Client upload ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadTitle.trim()) { setUploadError('Please add a title.'); return }
    if (uploadMode === 'file' && !uploadFile) { setUploadError('Please select a file.'); return }
    if (uploadMode === 'link' && !uploadLinkUrl.trim()) { setUploadError('Please enter a URL.'); return }
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) { setUploadError('Not signed in.'); setUploading(false); return }

    let rowData: ClientUpload | null = null

    if (uploadMode === 'link') {
      // Link — no storage upload needed, store URL as storage_path with type 'link'
      const { data, error: dbErr } = await supabase
        .from('client_uploads')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          title: uploadTitle.trim(),
          storage_path: uploadLinkUrl.trim(),
          file_type: 'link',
          file_size_bytes: null,
          note: uploadNote.trim() || null,
        })
        .select()
        .single()
      if (dbErr || !data) { setUploadError('Could not save link.'); setUploading(false); return }
      rowData = data as ClientUpload
    } else {
      const ext = uploadFile!.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${userId}/${projectId}/${Date.now()}.${ext}`

      const { error: storageErr } = await supabase.storage
        .from('client-uploads')
        .upload(path, uploadFile!, { upsert: false, contentType: uploadFile!.type })

      if (storageErr) { setUploadError('Upload failed. Please try again.'); setUploading(false); return }

      const { data, error: dbErr } = await supabase
        .from('client_uploads')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          title: uploadTitle.trim(),
          storage_path: path,
          file_type: uploadFile!.type,
          file_size_bytes: uploadFile!.size,
          note: uploadNote.trim() || null,
        })
        .select()
        .single()

      if (dbErr || !data) { setUploadError('Saved to storage but could not record the file.'); setUploading(false); return }
      rowData = data as ClientUpload
    }

    setClientUploads((prev) => [rowData!, ...prev])
    setUploadTitle('')
    setUploadNote('')
    setUploadFile(null)
    setUploadLinkUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploadSuccess(true)
    setTimeout(() => setUploadSuccess(false), 4000)
    setUploading(false)
  }

  const deleteClientUpload = async (upload: ClientUpload) => {
    if (!confirm(`Delete "${upload.title}"?`)) return
    await supabase.storage.from('client-uploads').remove([upload.storage_path])
    await supabase.from('client_uploads').delete().eq('id', upload.id)
    setClientUploads((prev) => prev.filter((u) => u.id !== upload.id))
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>
  if (!project) return <div className="p-8 text-sm text-red-400">Project not found.</div>

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'docs' as const, label: `Documents${docs.length ? ` (${docs.length})` : ''}` },
    { id: 'notes' as const, label: `Notes${meetingNotes.length ? ` (${meetingNotes.length})` : ''}` },
    { id: 'uploads' as const, label: `My Uploads${clientUploads.length ? ` (${clientUploads.length})` : ''}` },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 pb-28">

      {/* ── Header ── */}
      <div className="px-6 pt-8 pb-6" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 55%)' }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => router.push('/dashboard/client')} className="text-xs mb-4 flex items-center gap-1 transition" style={{ color: '#7EC8A0' }}>
            ← Dashboard
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              {project.project_type && (
                <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2" style={{ background: '#F04D3D20', color: '#F04D3D' }}>
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
                      <div className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: allDone ? '#7EC8A0' : isActive ? '#F04D3D' : '#333', outline: isActive ? '3px solid #F04D3D40' : 'none' }} />
                      {!isLast && <div className="h-px flex-1" style={{ background: allDone ? '#7EC8A0' : '#333' }} />}
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
      <div className="bg-black border-b border-neutral-800 px-6 overflow-x-auto">
        <div className="max-w-2xl mx-auto flex">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition -mb-px"
              style={{ borderColor: activeTab === tab.id ? '#F04D3D' : 'transparent', color: activeTab === tab.id ? '#F04D3D' : '#666' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <>
            {/* What Riley's Working On */}
            {currentStep?.client_description && (
              <div className="rounded-2xl p-5 border" style={{ background: '#1A342808', borderColor: '#1A342820' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold" style={{ color: '#7EC8A0' }}>✦</span>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#1A3428' }}>
                    What Riley's Working On
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-neutral-700">{currentStep.client_description}</p>
              </div>
            )}

            {/* Your To-Dos (client deliverables) */}
            {currentDeliverables.length > 0 && (
              <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-0.5">Your To-Dos</p>
                    <h3 className="font-bold text-neutral-900">Action items for you this phase</h3>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {currentDeliverables.filter((d) => d.is_done).length}/{currentDeliverables.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {currentDeliverables.map((deliv) => {
                    const busy = updatingDelivId === deliv.id
                    return (
                      <label key={deliv.id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition cursor-pointer ${
                          deliv.is_done ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                        } ${busy ? 'opacity-60' : ''}`}>
                        <input type="checkbox" checked={deliv.is_done} disabled={busy}
                          onChange={() => toggleDeliverable(deliv)}
                          className="mt-0.5 shrink-0 accent-[#F04D3D]" />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${deliv.is_done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                            {deliv.title}
                          </p>
                          {deliv.description && !deliv.is_done && (
                            <p className="text-xs text-neutral-500 mt-0.5">{deliv.description}</p>
                          )}
                        </div>
                        {deliv.is_done && <span className="text-xs font-bold shrink-0" style={{ color: '#7EC8A0' }}>✓</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All Phases — Accordion */}
            {stepsSorted.length > 0 && (
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <h3 className="font-bold text-neutral-900">All Phases</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Tap any phase to see what's involved.</p>
                </div>
                <div className="divide-y divide-neutral-100">
                  {stepsSorted.map((step, i) => {
                    const tasks = step.project_step_tasks
                    const allDone = tasks.length > 0 && tasks.every((t) => t.is_done)
                    const isActive = step.id === currentStep?.id
                    const isExpanded = expandedPhase === step.id
                    const stepDone = tasks.filter((t) => t.is_done).length

                    return (
                      <div key={step.id}>
                        <button
                          onClick={() => setExpandedPhase(isExpanded ? null : step.id)}
                          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-neutral-50 transition text-left"
                        >
                          {/* Phase number dot */}
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background: allDone ? '#1A342815' : isActive ? '#F04D3D' : '#f3f3f3',
                              color: allDone ? '#1A3428' : isActive ? '#fff' : '#ccc'
                            }}>
                            {allDone ? '✓' : String(i + 1).padStart(2, '0')}
                          </div>

                          {/* Title + subtitle */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold leading-snug ${
                              isActive ? 'text-neutral-900' : allDone ? 'text-neutral-500' : 'text-neutral-400'
                            }`}>{step.title}</p>
                            {!isExpanded && (
                              <p className="text-xs text-neutral-400 mt-0.5">
                                {allDone ? 'Complete' : isActive ? `${stepDone}/${tasks.length} tasks in progress` : 'Coming up'}
                              </p>
                            )}
                          </div>

                          {/* Right side: Active badge + chevron */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isActive && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#F04D3D15', color: '#F04D3D' }}>Active</span>
                            )}
                            <span className="text-neutral-300 text-xs transition-transform" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                          </div>
                        </button>

                        {/* Expanded body */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-0">
                            <div className="ml-12 space-y-3">
                              {/* Description — Riley's published update, or a sensible default */}
                              <p className="text-sm text-neutral-600 leading-relaxed">
                                {step.client_description ||
                                  (isActive
                                    ? 'This phase is currently in progress. Riley will share a detailed update here shortly.'
                                    : allDone
                                      ? 'This phase has been completed.'
                                      : 'This phase is coming up. Riley will share more details as your project progresses.'
                                  )}
                              </p>

                              {/* Task progress bar (visible if there are tasks) */}
                              {tasks.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                                    <span>Progress</span>
                                    <span>{stepDone}/{tasks.length}</span>
                                  </div>
                                  <div className="w-full rounded-full h-1.5" style={{ background: '#f3f3f3' }}>
                                    <div className="h-1.5 rounded-full transition-all"
                                      style={{
                                        width: `${tasks.length === 0 ? 0 : Math.round((stepDone / tasks.length) * 100)}%`,
                                        background: allDone ? '#7EC8A0' : isActive ? '#F04D3D' : '#ddd'
                                      }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Brief */}
            {project.brief_content && (() => {
              const content = renderBriefContent(project.brief_content)
              if (!content) return null
              return (
                <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                  <h3 className="font-bold text-neutral-900 mb-3">Project Brief</h3>
                  {content}
                </div>
              )
            })()}
          </>
        )}

        {/* ══ DOCUMENTS ══ */}
        {activeTab === 'docs' && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <h3 className="font-bold text-neutral-900 mb-4">Documents</h3>
            {docs.length === 0 ? (
              <p className="text-sm text-neutral-400">No documents yet — files will appear here as Riley shares them.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {docs.map((doc) => {
                  const thumbUrl = docThumbs[doc.id] ?? null
                  const isLink = !!doc.embed_url
                  return (
                    <button key={doc.id} onClick={() => openPreview(doc)}
                      className="text-left rounded-2xl border border-neutral-200 overflow-hidden hover:border-neutral-400 hover:shadow-sm transition group">
                      <div className="h-24 bg-neutral-50 border-b border-neutral-100 relative overflow-hidden">
                        {isLink && <iframe src={normalizeEmbedUrl(doc.embed_url!)} className="absolute inset-0 w-full h-full" loading="lazy" style={{ pointerEvents: 'none' }} sandbox="allow-same-origin allow-scripts" />}
                        {!isLink && thumbUrl && isImage(doc) && <img src={thumbUrl} alt={doc.title} className="absolute inset-0 w-full h-full object-cover" />}
                        {!isLink && thumbUrl && isPdf(doc) && <iframe src={thumbUrl} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />}
                        {!isLink && !thumbUrl && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-neutral-300 uppercase">{doc.file_type ?? 'File'}</span></div>}
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
                    {note.meeting_date && <p className="text-xs text-neutral-400 shrink-0">{formatDate(note.meeting_date)}</p>}
                  </div>
                  {renderNoteContent(note.content)}
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ MY UPLOADS ══ */}
        {activeTab === 'uploads' && (
          <div className="space-y-4">

            {/* Upload form */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-0.5">Send Assets to Riley</p>
                <h3 className="font-bold text-neutral-900">Upload a File</h3>
                <p className="text-xs text-neutral-500 mt-1">Brand guidelines, logos, photography, existing collateral — anything Riley should have.</p>
              </div>

              <div className="space-y-3">
                {/* Mode toggle */}
                <div className="flex rounded-xl border border-neutral-200 overflow-hidden">
                  <button
                    onClick={() => setUploadMode('file')}
                    className="flex-1 text-sm font-medium py-2.5 transition"
                    style={{ background: uploadMode === 'file' ? '#1A3428' : 'transparent', color: uploadMode === 'file' ? '#fff' : '#666' }}
                  >
                    ⬆ Upload File
                  </button>
                  <button
                    onClick={() => setUploadMode('link')}
                    className="flex-1 text-sm font-medium py-2.5 transition"
                    style={{ background: uploadMode === 'link' ? '#1A3428' : 'transparent', color: uploadMode === 'link' ? '#fff' : '#666' }}
                  >
                    ↗ Attach Link
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                    {uploadMode === 'link' ? 'Link title' : 'File title'} <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder={uploadMode === 'link' ? 'e.g. Current website, Brand inspiration board' : 'e.g. Current logo package, Brand guidelines PDF'}
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>

                {uploadMode === 'link' ? (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1">URL <span className="text-red-400">*</span></label>
                    <input
                      value={uploadLinkUrl}
                      onChange={(e) => setUploadLinkUrl(e.target.value)}
                      placeholder="https://www.figma.com/… or any link"
                      className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1">File <span className="text-red-400">*</span></label>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-neutral-200 rounded-xl px-4 py-4 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition text-left"
                    >
                      {uploadFile ? (
                        <span className="font-medium text-neutral-800">
                          {uploadFile.name} <span className="font-normal text-neutral-400">({formatBytes(uploadFile.size)})</span>
                        </span>
                      ) : '+ Choose file — images, PDFs, ZIP, fonts, and more'}
                    </button>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 block mb-1">Note (optional)</label>
                  <input
                    value={uploadNote}
                    onChange={(e) => setUploadNote(e.target.value)}
                    placeholder="e.g. This is our current logo, please treat it as a starting point"
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>

                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                {uploadSuccess && (
                  <p className="text-xs font-semibold" style={{ color: '#7EC8A0' }}>✓ Sent! Riley will have it waiting for her.</p>
                )}

                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadTitle.trim() || (uploadMode === 'file' && !uploadFile) || (uploadMode === 'link' && !uploadLinkUrl.trim())}
                  className="w-full text-sm font-semibold py-3 rounded-xl text-white transition disabled:opacity-40"
                  style={{ background: '#F04D3D' }}
                >
                  {uploading ? (uploadMode === 'link' ? 'Saving…' : 'Uploading…') : 'Send to Riley →'}
                </button>
              </div>
            </div>

            {/* Previously uploaded */}
            {clientUploads.length > 0 && (
              <div className="bg-white border border-neutral-200 rounded-2xl p-5">
                <h3 className="font-bold text-neutral-900 mb-4">Previously Sent ({clientUploads.length})</h3>
                <div className="space-y-2">
                  {clientUploads.map((upload) => (
                    <div key={upload.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-100">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{ background: '#F04D3D10', color: '#F04D3D' }}>
                        ◆
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate">{upload.title}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {upload.file_type === 'link' ? 'LINK' : upload.file_type?.split('/').pop()?.toUpperCase() ?? 'FILE'}
                          {upload.file_size_bytes ? ` · ${formatBytes(upload.file_size_bytes)}` : ''}
                          {' · '}{formatDate(upload.created_at)}
                        </p>
                        {upload.note && <p className="text-xs text-neutral-500 mt-0.5 italic">"{upload.note}"</p>}
                      </div>
                      <button
                        onClick={() => deleteClientUpload(upload)}
                        className="text-xs text-neutral-300 hover:text-red-400 transition shrink-0"
                        title="Remove"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Doc Preview Modal ── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setPreviewDoc(null); setPreviewUrl(null) } }}>
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div><p className="text-xs text-neutral-400">Document</p><p className="font-semibold text-neutral-900">{previewDoc.title}</p></div>
              <button onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }} className="text-sm text-neutral-400 hover:text-black transition">Close</button>
            </div>
            <div className="p-4">
              {previewLoading ? (
                <p className="text-sm text-neutral-400 py-8 text-center">Loading…</p>
              ) : !previewUrl ? (
                <p className="text-sm text-neutral-400 py-8 text-center">No preview available.</p>
              ) : previewDoc.embed_url || isPdf(previewDoc) ? (
                <iframe src={previewUrl} className="w-full rounded-xl border border-neutral-100" style={{ height: '65vh' }} title={previewDoc.title} sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
              ) : isImage(previewDoc) ? (
                <img src={previewUrl} alt={previewDoc.title} className="max-h-[65vh] w-auto mx-auto rounded-xl" />
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500 mb-3">This file type does not support inline preview.</p>
                  <button onClick={() => window.open(previewUrl, '_blank', 'noreferrer')} className="text-sm font-medium underline" style={{ color: '#F04D3D' }}>Open file</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
