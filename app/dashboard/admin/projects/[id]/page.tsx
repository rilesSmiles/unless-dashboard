'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import MeetingNoteEditor from '@/components/MeetingNoteEditor'

// ─── Types ────────────────────────────────────────────────────────────────────
type Task = {
  id: string; project_id: string; project_step_id: string
  title: string; is_done: boolean; due_date: string | null
  created_at: string; updated_at: string
}
type Step = { id: string; title: string; step_order: number; project_step_tasks: Task[] }
type ProjectDoc = {
  id: string; project_id: string; title: string; storage_path: string | null
  embed_url: string | null; file_type: string | null; size_bytes: number | null
  created_at: string; updated_at: string
}
type MeetingNote = {
  id: string; project_id: string; title: string; meeting_date: string | null
  status: 'draft' | 'published'; content: any; created_at: string; updated_at: string
}
type InterviewQuestion = {
  question: string; category: string; why: string; watch_for: string
  probes: string[]; guidance: string
}
type InterviewNote = {
  id?: string; project_id: string; leader_index: number
  question_index: number; note_text: string
}
type GapMap = { id: string; title: string; status: string; created_at: string }
type ClientDeliverable = {
id: string; project_id: string; project_step_id: string
title: string; description: string | null; is_done: boolean; sort_order: number
}
type ClientUpload = {
  id: string; project_id: string; uploaded_by: string; title: string
  storage_path: string; file_type: string | null; file_size_bytes: number | null
  note: string | null; created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ['Mission','Positioning','Value Proposition','Audience','Voice & Tone','Internal vs. External']

const CAT_COLOR: Record<string, string> = {
  'Positioning':           'bg-blue-100 text-blue-800',
  'Mission':               'bg-purple-100 text-purple-800',
  'Audience':              'bg-green-100 text-green-800',
  'Value Proposition':     'bg-orange-100 text-orange-800',
  'Voice & Tone':          'bg-pink-100 text-pink-800',
  'Internal vs. External': 'bg-red-100 text-red-800',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function useDebounce<T>(v: T, ms: number): T {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  // core data
  const [project, setProject] = useState<any>(null)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([])
  const [interviewNotes, setInterviewNotes] = useState<InterviewNote[]>([])
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([])
  const [linkedGapMaps, setLinkedGapMaps] = useState<GapMap[]>([])
  const [clientDeliverables, setClientDeliverables] = useState<ClientDeliverable[]>([])
  const [clientUploads, setClientUploads] = useState<ClientUpload[]>([])
  const [loading, setLoading] = useState(true)

  // tabs
  const [tab, setTab] = useState<'overview' | 'phases' | 'interviews' | 'notes'>('overview')

  // leaders (editable)
  const [leaders, setLeaders] = useState<string[]>([])
  const [leaderTab, setLeaderTab] = useState(0)
  const [savingLeaders, setSavingLeaders] = useState(false)
  const debouncedLeaders = useDebounce(leaders, 800)
  const didMountLeaders = useRef(false)

  // project name
  const [editName, setEditName] = useState('')
  const debouncedName = useDebounce(editName, 700)
  const didMountName = useRef(false)

  // phases
  const [newTaskByStep, setNewTaskByStep] = useState<Record<string, string>>({})
  const [addingStep, setAddingStep] = useState<string | null>(null)
  const [updatingTask, setUpdatingTask] = useState<string | null>(null)

  // client deliverables
  const [newDelivByStep, setNewDelivByStep] = useState<Record<string, string>>({})
  const [addingDeliv, setAddingDeliv] = useState<string | null>(null)
  const [updatingDeliv, setUpdatingDeliv] = useState<string | null>(null)

  // client_description per step — draft + published state
  const [clientDescDraft, setClientDescDraft] = useState<Record<string, string>>({})
  const [clientDescSaved, setClientDescSaved] = useState<Record<string, string>>({})
  const [publishingDesc, setPublishingDesc] = useState<string | null>(null)
  const [publishedDesc, setPublishedDesc] = useState<string | null>(null)

  // docs
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [docAddOpen, setDocAddOpen] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [addingDoc, setAddingDoc] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [pickedFile, setPickedFile] = useState<string | null>(null)
  const [docThumbs, setDocThumbs] = useState<Record<string, string>>({})
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // meeting notes
  const [activeMeetingNote, setActiveMeetingNote] = useState<MeetingNote | null>(null)
  const [creatingNote, setCreatingNote] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteDate, setNewNoteDate] = useState('')

  // gap map creation
  const [creatingGapMap, setCreatingGapMap] = useState(false)
  const [gapMapCreated, setGapMapCreated] = useState(false)

  // ── interview auto-save ────────────────────────────────────────────────────
  const saveInterviewNote = useCallback(
    (() => {
      const timers: Record<string, ReturnType<typeof setTimeout>> = {}
      return (note: InterviewNote) => {
        const key = `${note.leader_index}-${note.question_index}`
        if (timers[key]) clearTimeout(timers[key])
        timers[key] = setTimeout(async () => {
          await supabase.from('interview_notes').upsert(
            { project_id: id, leader_index: note.leader_index, question_index: note.question_index, note_text: note.note_text, updated_at: new Date().toISOString() },
            { onConflict: 'project_id,leader_index,question_index' }
          )
        }, 600)
      }
    })(), []
  )

  // ── load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const load = async () => {
      const [{ data: pData }, { data: docData }, { data: mnData }, { data: inData }, { data: gmData }, { data: delivData }, { data: cuData }] = await Promise.all([
        supabase.from('projects').select(`id,name,project_type,client_id,brief_content,leaders,created_at,updated_at,project_steps(id,title,step_order,client_description,project_step_tasks(id,project_id,project_step_id,title,is_done,due_date,created_at,updated_at)),profiles:client_id(business_name)`).eq('id', id).single(),
        supabase.from('project_documents').select('*').eq('project_id', id).order('created_at'),
        supabase.from('meeting_notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('interview_notes').select('*').eq('project_id', id),
        supabase.from('gap_maps').select('id,title,status,created_at').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('client_deliverables').select('id,project_id,project_step_id,title,description,is_done,sort_order').eq('project_id', id).order('sort_order'),
        supabase.from('client_uploads').select('id,project_id,uploaded_by,title,storage_path,file_type,file_size_bytes,note,created_at').eq('project_id', id).order('created_at', { ascending: false }),
      ])

      if (pData) {
        setProject(pData)
        setEditName(pData.name ?? '')
        const savedLeaders = pData.leaders ?? ['CEO / Founder','Leader 2','Leader 3','Leader 4','Leader 5','Leader 6']
        setLeaders(savedLeaders)

        // seed client_description draft + saved state from loaded steps
        const descMap: Record<string, string> = {}
        for (const s of (pData.project_steps ?? [])) {
          descMap[s.id] = s.client_description ?? ''
        }
        setClientDescDraft(descMap)
        setClientDescSaved(descMap)

        const isBAI = pData.project_type?.toLowerCase().includes('alignment') || pData.project_type?.toLowerCase().includes('intensive')
        if (isBAI) {
          const { data: tplData } = await supabase.from('service_templates').select('interview_questions').eq('slug', 'brand-alignment-intensive').single()
          if (tplData?.interview_questions) setInterviewQuestions(tplData.interview_questions)
        }
      }
      setDocs(docData ?? [])
      setMeetingNotes((mnData ?? []) as MeetingNote[])
      setInterviewNotes(inData ?? [])
      setLinkedGapMaps((gmData ?? []) as GapMap[])
      setClientDeliverables((delivData ?? []) as ClientDeliverable[])
      setClientUploads((cuData ?? []) as ClientUpload[])
      setLoading(false)
    }
    load()
  }, [id])

  // ── auto-save name ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!didMountName.current) { didMountName.current = true; return }
    if (!debouncedName.trim()) return
    supabase.from('projects').update({ name: debouncedName.trim() }).eq('id', id)
  }, [debouncedName])

  // ── auto-save leaders ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!didMountLeaders.current) { didMountLeaders.current = true; return }
    setSavingLeaders(true)
    supabase.from('projects').update({ leaders: debouncedLeaders }).eq('id', id)
      .then(() => setSavingLeaders(false))
  }, [debouncedLeaders])

  // ── publish client_description for a step ────────────────────────────────
  const publishClientDesc = async (stepId: string) => {
    const desc = clientDescDraft[stepId] ?? ''
    setPublishingDesc(stepId)
    const { error } = await supabase
      .from('project_steps')
      .update({ client_description: desc || null })
      .eq('id', stepId)
    setPublishingDesc(null)
    if (!error) {
      setClientDescSaved((p) => ({ ...p, [stepId]: desc }))
      setPublishedDesc(stepId)
      setTimeout(() => setPublishedDesc((prev) => prev === stepId ? null : prev), 3000)
    }
  }

  // ── doc thumbnails ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const targets = docs.filter((d) => d.storage_path && !docThumbs[d.id])
      const next: Record<string, string> = {}
      for (const d of targets) {
        const { data } = await supabase.storage.from('project-files').createSignedUrl(d.storage_path!, 600)
        if (data?.signedUrl) next[d.id] = data.signedUrl
      }
      if (Object.keys(next).length) setDocThumbs((p) => ({ ...p, ...next }))
    }
    load()
  }, [docs])

  // ─── Computed ────────────────────────────────────────────────────────────────
  const steps: Step[] = ((project?.project_steps ?? []) as any[])
    .map((s: any) => ({ ...s, project_step_tasks: s.project_step_tasks ?? [] }))
    .sort((a: Step, b: Step) => a.step_order - b.step_order)

  const allTasks = steps.flatMap((s) => s.project_step_tasks)
  const doneTasks = allTasks.filter((t) => t.is_done).length
  const pct = allTasks.length === 0 ? 0 : Math.round((doneTasks / allTasks.length) * 100)

  const isBAI = interviewQuestions.length > 0

  const getInterviewNote = (li: number, qi: number) =>
    interviewNotes.find((n) => n.leader_index === li && n.question_index === qi)?.note_text ?? ''

  const updateInterviewNote = (li: number, qi: number, text: string) => {
    setInterviewNotes((prev) => {
      const without = prev.filter((n) => !(n.leader_index === li && n.question_index === qi))
      return [...without, { project_id: id, leader_index: li, question_index: qi, note_text: text }]
    })
    saveInterviewNote({ project_id: id, leader_index: li, question_index: qi, note_text: text })
  }

  // leaders with at least one note filled
  const leadersWithNotes = leaders.filter((_, li) =>
    interviewQuestions.some((_, qi) => getInterviewNote(li, qi).trim() !== '')
  ).length
  const canCreateGapMap = leadersWithNotes >= 2 && !gapMapCreated && linkedGapMaps.length === 0

  // ─── Leader helpers ───────────────────────────────────────────────────────────
  const updateLeaderName = (idx: number, name: string) => {
    setLeaders((prev) => prev.map((l, i) => i === idx ? name : l))
  }

  const addLeader = () => {
    if (leaders.length >= 8) return
    setLeaders((prev) => [...prev, `Leader ${prev.length + 1}`])
  }

  const removeLeader = (idx: number) => {
    if (leaders.length <= 1) return
    setLeaders((prev) => prev.filter((_, i) => i !== idx))
    setLeaderTab((prev) => (prev >= idx && prev > 0) ? prev - 1 : prev)
  }

  // ─── Gap Map creation ─────────────────────────────────────────────────────────
  const createGapMap = async () => {
    setCreatingGapMap(true)
    try {
      const clientName = Array.isArray(project.profiles)
        ? project.profiles[0]?.business_name
        : project.profiles?.business_name

      // 1. Create gap map
      const { data: mapData, error: mapErr } = await supabase
        .from('gap_maps')
        .insert({
          project_id: id,
          title: `${project.name} — Alignment Gap Map`,
          client_name: clientName ?? null,
          status: 'draft',
          leaders: leaders.filter((l) => l.trim()),
        })
        .select('id')
        .single()
      if (mapErr || !mapData) throw mapErr

      // 2. Seed 6 categories
      const { data: catData, error: catErr } = await supabase
        .from('gap_map_categories')
        .insert(CATEGORY_ORDER.map((name, i) => ({ gap_map_id: mapData.id, category_name: name, sort_order: i })))
        .select('id, category_name')
      if (catErr) throw catErr

      // 3. Build category → question index map
      const catToQuestions: Record<string, number[]> = {}
      interviewQuestions.forEach((q, qi) => {
        if (!catToQuestions[q.category]) catToQuestions[q.category] = []
        catToQuestions[q.category].push(qi)
      })

      // 4. Populate leader notes by aggregating interview notes per category
      const leaderNoteRows: { gap_map_id: string; gap_map_category_id: string; leader_index: number; note_text: string }[] = []
      for (const cat of (catData ?? [])) {
        const qIndices = catToQuestions[cat.category_name] ?? []
        for (let li = 0; li < leaders.length; li++) {
          const combined = qIndices
            .map((qi) => {
              const note = getInterviewNote(li, qi)
              if (!note.trim()) return null
              return `Q: "${interviewQuestions[qi].question}"\n${note}`
            })
            .filter(Boolean)
            .join('\n\n')
          if (combined) {
            leaderNoteRows.push({
              gap_map_id: mapData.id,
              gap_map_category_id: cat.id,
              leader_index: li,
              note_text: combined,
            })
          }
        }
      }

      if (leaderNoteRows.length) {
        await supabase.from('gap_map_leader_notes').insert(leaderNoteRows)
      }

      setLinkedGapMaps([{ id: mapData.id, title: `${project.name} — Alignment Gap Map`, status: 'draft', created_at: new Date().toISOString() }])
      setGapMapCreated(true)

      // Navigate to the gap map
      router.push(`/dashboard/admin/gap-maps/${mapData.id}`)
    } catch (e: any) {
      console.error('Create gap map error:', e)
    } finally {
      setCreatingGapMap(false)
    }
  }

  // ─── Client Deliverable actions ───────────────────────────────────────────────
  const addDeliverable = async (stepId: string) => {
    const text = (newDelivByStep[stepId] || '').trim()
    if (!text) return
    setAddingDeliv(stepId)
    const currentMax = clientDeliverables.filter((d) => d.project_step_id === stepId).length
    const { data } = await supabase.from('client_deliverables')
      .insert({ project_id: id, project_step_id: stepId, title: text, is_done: false, sort_order: currentMax })
      .select('id,project_id,project_step_id,title,description,is_done,sort_order').single()
    setAddingDeliv(null)
    if (!data) return
    setClientDeliverables((p) => [...p, data as ClientDeliverable])
    setNewDelivByStep((p) => ({ ...p, [stepId]: '' }))
  }

  const toggleDeliverable = async (delivId: string) => {
    const deliv = clientDeliverables.find((d) => d.id === delivId)
    if (!deliv) return
    const next = !deliv.is_done
    setClientDeliverables((p) => p.map((d) => d.id === delivId ? { ...d, is_done: next } : d))
    setUpdatingDeliv(delivId)
    await supabase.from('client_deliverables').update({ is_done: next }).eq('id', delivId)
    setUpdatingDeliv(null)
  }

  const deleteDeliverable = async (delivId: string) => {
    if (!confirm('Remove this client deliverable?')) return
    setClientDeliverables((p) => p.filter((d) => d.id !== delivId))
    await supabase.from('client_deliverables').delete().eq('id', delivId)
  }

  // ─── Task actions ──────────────────────────────────────────────────────────────
  const addTask = async (stepId: string) => {
    const text = (newTaskByStep[stepId] || '').trim()
    if (!text) return
    setAddingStep(stepId)
    const { data } = await supabase.from('project_step_tasks')
      .insert({ project_id: id, project_step_id: stepId, title: text, is_done: false })
      .select('id,project_id,project_step_id,title,is_done,due_date,created_at,updated_at').single()
    setAddingStep(null)
    if (!data) return
    setProject((p: any) => ({ ...p, project_steps: p.project_steps.map((s: any) => s.id === stepId ? { ...s, project_step_tasks: [...(s.project_step_tasks ?? []), data] } : s) }))
    setNewTaskByStep((p) => ({ ...p, [stepId]: '' }))
  }

  const toggleTask = async (stepId: string, taskId: string) => {
    let next = false
    setProject((p: any) => ({ ...p, project_steps: p.project_steps.map((s: any) => s.id !== stepId ? s : { ...s, project_step_tasks: s.project_step_tasks.map((t: Task) => { if (t.id !== taskId) return t; next = !t.is_done; return { ...t, is_done: next } }) }) }))
    setUpdatingTask(taskId)
    await supabase.from('project_step_tasks').update({ is_done: next }).eq('id', taskId)
    setUpdatingTask(null)
  }

  const deleteTask = async (stepId: string, taskId: string) => {
    if (!confirm('Delete this task?')) return
    setProject((p: any) => ({ ...p, project_steps: p.project_steps.map((s: any) => s.id !== stepId ? s : { ...s, project_step_tasks: s.project_step_tasks.filter((t: Task) => t.id !== taskId) }) }))
    await supabase.from('project_step_tasks').delete().eq('id', taskId)
  }

  // ─── Doc actions ──────────────────────────────────────────────────────────────
  const addDocLink = async () => {
    const title = newDocTitle.trim(); const url = newDocUrl.trim()
    if (!title || !url) return
    setAddingDoc(true)
    const { data } = await supabase.from('project_documents').insert({ project_id: id, title, embed_url: url, file_type: 'link' }).select('*').single()
    setAddingDoc(false)
    if (data) { setDocs((p) => [...p, data as ProjectDoc]); setNewDocTitle(''); setNewDocUrl(''); setDocAddOpen(false) }
  }

  const uploadDoc = async (file: File) => {
    setUploadingDoc(true)
    const path = `${id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`
    const { error: upErr } = await supabase.storage.from('project-files').upload(path, file, { contentType: file.type })
    if (upErr) { setUploadingDoc(false); return }
    const { data } = await supabase.from('project_documents').insert({ project_id: id, title: file.name, storage_path: path, file_type: file.type, size_bytes: file.size }).select('*').single()
    if (data) setDocs((p) => [...p, data as ProjectDoc])
    setUploadingDoc(false); setPickedFile(null); setDocAddOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const deleteDoc = async (doc: ProjectDoc) => {
    if (!confirm(`Delete "${doc.title}"?`)) return
    if (doc.storage_path) await supabase.storage.from('project-files').remove([doc.storage_path])
    await supabase.from('project_documents').delete().eq('id', doc.id)
    setDocs((p) => p.filter((d) => d.id !== doc.id))
  }

  const openPreview = async (doc: ProjectDoc) => {
    setPreviewDoc(doc)
    if (doc.embed_url) { setPreviewUrl(doc.embed_url); return }
    if (doc.storage_path) {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.storage_path, 600)
      setPreviewUrl(data?.signedUrl ?? null)
    }
  }

  // ─── Meeting note actions ──────────────────────────────────────────────────────
  const createMeetingNote = async () => {
    if (!newNoteTitle.trim()) return
    setCreatingNote(true)
    const { data } = await supabase.from('meeting_notes').insert({ project_id: id, title: newNoteTitle.trim(), meeting_date: newNoteDate || null, status: 'draft' }).select('*').single()
    setCreatingNote(false)
    if (data) {
      const note = data as MeetingNote
      setMeetingNotes((p) => [note, ...p])
      setActiveMeetingNote(note)
      setNewNoteTitle(''); setNewNoteDate('')
    }
  }

  const togglePublish = async (note: MeetingNote) => {
    const next = note.status === 'draft' ? 'published' : 'draft'
    await supabase.from('meeting_notes').update({ status: next }).eq('id', note.id)
    setMeetingNotes((p) => p.map((n) => n.id === note.id ? { ...n, status: next } : n))
    if (activeMeetingNote?.id === note.id) setActiveMeetingNote({ ...activeMeetingNote, status: next })
  }

  const deleteMeetingNote = async (noteId: string) => {
    if (!confirm('Delete this meeting note?')) return
    await supabase.from('meeting_notes').delete().eq('id', noteId)
    setMeetingNotes((p) => p.filter((n) => n.id !== noteId))
    if (activeMeetingNote?.id === noteId) setActiveMeetingNote(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading project…</div>
  if (!project) return <div className="p-8 text-red-400 text-sm">Project not found.</div>

  const clientName = Array.isArray(project.profiles)
    ? project.profiles[0]?.business_name
    : project.profiles?.business_name

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'phases',     label: `Phases (${steps.length})` },
    ...(isBAI ? [{ id: 'interviews' as typeof tab, label: 'Interviews' }] : []),
    { id: 'notes',      label: `Meeting Notes (${meetingNotes.length})` },
  ]

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* ── Header ── */}
      <div className="px-6 pt-8 pb-0" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 55%)' }}>
        <div className="max-w-5xl mx-auto">
          <button onClick={() => router.push('/dashboard/admin/projects')}
            className="text-[#7EC8A0] hover:text-white text-sm transition mb-4 flex items-center gap-1">
            ← Projects
          </button>
          <div className="flex items-start justify-between gap-4 pb-5">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                {project.project_type && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#1A3428]/80 text-[#7EC8A0] border border-[#7EC8A0]/30">
                    {project.project_type}
                  </span>
                )}
                {clientName && <span className="text-xs text-neutral-500">{clientName}</span>}
              </div>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-transparent text-white text-2xl font-bold outline-none border-b border-transparent focus:border-neutral-700 pb-1 transition w-full max-w-xl"
              />
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-bold text-[#F04D3D]">{pct}%</p>
              <p className="text-xs text-neutral-500">complete</p>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto flex gap-0">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id ? 'border-[#F04D3D] text-[#F04D3D]' : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-6">

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">

            {/* Gap Map link (if exists) */}
            {linkedGapMaps.length > 0 && (
              <div className="md:col-span-2">
                {linkedGapMaps.map((gm) => (
                  <button key={gm.id} onClick={() => router.push(`/dashboard/admin/gap-maps/${gm.id}`)}
                    className="w-full text-left bg-black border border-neutral-800 rounded-2xl px-6 py-4 flex items-center justify-between gap-4 hover:border-[#F04D3D]/50 transition group">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#F04D3D]/20 flex items-center justify-center shrink-0">
                        <span className="text-[#F04D3D] text-sm">◆</span>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-[#F04D3D] uppercase tracking-widest mb-0.5">Alignment Gap Map</p>
                        <p className="text-white font-semibold">{gm.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${gm.status === 'complete' ? 'bg-green-900 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {gm.status === 'complete' ? '✓ Complete' : 'Draft'}
                      </span>
                      <span className="text-neutral-500 group-hover:text-[#F04D3D] transition text-sm">→</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Documents */}
            <div className="md:col-span-2 bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900">Documents</h2>
                <button onClick={() => setDocAddOpen(!docAddOpen)}
                  className="text-xs font-medium px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition">
                  {docAddOpen ? 'Close' : '+ Add'}
                </button>
              </div>

              {docAddOpen && (
                <div className="grid sm:grid-cols-2 gap-4 p-4 bg-neutral-50 rounded-xl">
                  <div className="border-2 border-dashed border-neutral-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                    <input ref={fileInputRef} type="file" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPickedFile(f.name); uploadDoc(f) } }} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc}
                      className="text-sm font-medium text-neutral-600 hover:text-black transition disabled:opacity-50">
                      {uploadingDoc ? 'Uploading…' : '⬆ Upload file'}
                    </button>
                    {pickedFile && <p className="text-xs text-neutral-400 truncate max-w-full">{pickedFile}</p>}
                  </div>
                  <div className="space-y-2">
                    <input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)}
                      placeholder="Title (e.g. Brand Strategy)" className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10" />
                    <input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)}
                      placeholder="URL (Figma / Google Doc / etc.)" className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                      onKeyDown={(e) => e.key === 'Enter' && addDocLink()} />
                    <button onClick={addDocLink} disabled={addingDoc || !newDocTitle.trim() || !newDocUrl.trim()}
                      className="w-full bg-black text-white text-sm rounded-lg py-2 hover:bg-neutral-800 transition disabled:opacity-50">
                      {addingDoc ? 'Adding…' : 'Add Link'}
                    </button>
                  </div>
                </div>
              )}

              {docs.length === 0 ? (
                <p className="text-sm text-neutral-400">No documents yet.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {docs.map((d) => {
                    const thumb = d.storage_path ? docThumbs[d.id] : null
                    const isLink = !!d.embed_url
                    return (
                      <div key={d.id} className="group shrink-0 w-48 rounded-2xl border border-neutral-200 hover:border-neutral-400 transition overflow-hidden cursor-pointer"
                        onClick={() => openPreview(d)}>
                        <div className="h-24 bg-neutral-50 border-b border-neutral-100 relative">
                          {isLink && d.embed_url && <iframe src={d.embed_url} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} loading="lazy" title="preview" referrerPolicy="no-referrer" sandbox="allow-same-origin" />}
                          {!isLink && thumb && d.file_type?.startsWith('image/') && <img src={thumb} alt={d.title} className="absolute inset-0 w-full h-full object-cover" />}
                          {!isLink && thumb && d.file_type?.includes('pdf') && <iframe src={thumb} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} loading="lazy" title="pdf" />}
                          {!thumb && !isLink && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs text-neutral-400 bg-white border rounded px-2 py-1">{(d.file_type ?? 'FILE').toUpperCase().slice(0,8)}</span></div>}
                          <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/90 border text-neutral-500">{isLink ? 'LINK' : 'FILE'}</span>
                          <button onClick={(e) => { e.stopPropagation(); deleteDoc(d) }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-white/90 border rounded-full w-6 h-6 flex items-center justify-center text-xs hover:text-red-600">✕</button>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-xs font-medium text-neutral-800 line-clamp-1">{d.title}</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">{fmtDateTime(d.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Client Uploads */}
            <div className="md:col-span-2 bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-neutral-900">Client Uploads</h2>
                  <p className="text-xs text-neutral-400 mt-0.5">Files and links sent to you by the client.</p>
                </div>
                {clientUploads.length > 0 && (
                  <span className="text-xs text-neutral-400">{clientUploads.length} item{clientUploads.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {clientUploads.length === 0 ? (
                <p className="text-sm text-neutral-400">No uploads yet — files and links from the client will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {clientUploads.map((upload) => {
                    const isLink = upload.file_type === 'link'
                    return (
                      <div key={upload.id} className="flex items-start gap-3 p-3 border border-neutral-100 rounded-xl hover:border-neutral-200 transition group">
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: isLink ? '#1A342815' : '#F04D3D10', color: isLink ? '#1A3428' : '#F04D3D' }}>
                          {isLink ? '↗' : '↑'}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            {isLink ? (
                              <a href={upload.storage_path} target="_blank" rel="noreferrer"
                                className="text-sm font-medium text-neutral-800 hover:text-[#F04D3D] truncate underline-offset-2 hover:underline">
                                {upload.title}
                              </a>
                            ) : (
                              <p className="text-sm font-medium text-neutral-800 truncate">{upload.title}</p>
                            )}
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono bg-neutral-100 text-neutral-500">
                              {isLink ? 'LINK' : (upload.file_type?.split('/').pop()?.toUpperCase() ?? 'FILE')}
                            </span>
                          </div>
                          {upload.note && (
                            <p className="text-xs text-neutral-500 mt-0.5 italic">"{upload.note}"</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-neutral-400">
                              {new Date(upload.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                            {upload.file_size_bytes && (
                              <span className="text-[10px] text-neutral-400">
                                {upload.file_size_bytes < 1024 * 1024
                                  ? `${(upload.file_size_bytes / 1024).toFixed(0)} KB`
                                  : `${(upload.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`}
                              </span>
                            )}
                            {!isLink && (
                              <button
                                onClick={async () => {
                                  const { data } = await supabase.storage.from('client-uploads').createSignedUrl(upload.storage_path, 120)
                                  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noreferrer')
                                }}
                                className="text-[10px] text-neutral-400 hover:text-[#F04D3D] underline transition">
                                Open ↗
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Internal notes */}
            <InternalNotes projectId={id} />

            {/* Project info */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-neutral-900">Project Info</h2>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Type', value: project.project_type ?? '—' },
                  { label: 'Client', value: clientName ?? '—' },
                  { label: 'Phases', value: steps.length },
                  { label: 'Tasks done', value: `${doneTasks}/${allTasks.length}` },
                  { label: 'Created', value: fmtDateTime(project.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-neutral-500">{label}</span>
                    <span className="font-medium text-neutral-900">{value}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-neutral-100">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                  <span>Overall progress</span><span>{pct}%</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-2">
                  <div className="bg-black h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button onClick={async () => { if (!confirm(`Delete "${project.name}"?`)) return; await supabase.from('projects').delete().eq('id', id); router.push('/dashboard/admin/projects') }}
                className="w-full mt-2 text-xs text-neutral-400 hover:text-red-600 transition py-1">
                Delete project
              </button>
            </div>
          </div>
        )}

        {/* ══ PHASES ══ */}
        {tab === 'phases' && (
          <div className="space-y-4">
            {steps.length === 0 ? (
              <div className="border border-dashed border-neutral-200 rounded-2xl p-12 text-center text-neutral-400">No phases yet.</div>
            ) : (
              steps.map((step) => {
                const tasks = step.project_step_tasks
                const done = tasks.filter((t) => t.is_done).length
                const stepPct = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100)
                const stepDeliverables = clientDeliverables.filter((d) => d.project_step_id === step.id)
                const delivDone = stepDeliverables.filter((d) => d.is_done).length

                return (
                  <div key={step.id} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">

                    {/* Phase header */}
                    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-neutral-400">{String(step.step_order).padStart(2,'0')}</span>
                          <h3 className="font-semibold text-neutral-900 text-base">{step.title}</h3>
                        </div>
                        <p className="text-xs text-neutral-400">
                          {tasks.length === 0 ? 'No tasks' : `${done}/${tasks.length} Riley tasks`}
                          {stepDeliverables.length > 0 && <span className="ml-2">· {delivDone}/{stepDeliverables.length} client items</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-neutral-900">{stepPct}%</p>
                        <div className="w-20 bg-neutral-100 rounded-full h-1.5 mt-1">
                          <div className="bg-black h-1.5 rounded-full" style={{ width: `${stepPct}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* ── Riley's Tasks ── */}
                    <div className="px-6 pb-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Riley's Tasks</p>

                      {tasks.length > 0 && (
                        <div className="space-y-2">
                          {tasks.map((task) => (
                            <div key={task.id} className={`flex items-center gap-3 p-3 border border-neutral-100 rounded-xl group ${updatingTask === task.id ? 'opacity-60' : ''}`}>
                              <input type="checkbox" checked={task.is_done} onChange={() => toggleTask(step.id, task.id)}
                                className="w-4 h-4 rounded accent-black shrink-0" />
                              <span className={`flex-1 text-sm ${task.is_done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>{task.title}</span>
                              <input type="date" value={task.due_date ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setProject((p: any) => ({ ...p, project_steps: p.project_steps.map((s: any) => s.id !== step.id ? s : { ...s, project_step_tasks: s.project_step_tasks.map((t: Task) => t.id !== task.id ? t : { ...t, due_date: v || null }) }) }))
                                  supabase.from('project_step_tasks').update({ due_date: v || null }).eq('id', task.id)
                                }}
                                className="text-xs border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none" />
                              <button onClick={() => deleteTask(step.id, task.id)}
                                className="text-xs text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition px-1">✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          value={newTaskByStep[step.id] ?? ''}
                          onChange={(e) => setNewTaskByStep((p) => ({ ...p, [step.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && addTask(step.id)}
                          placeholder="+ Add Riley task…"
                          className="flex-1 text-sm border border-neutral-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                        />
                        <button onClick={() => addTask(step.id)} disabled={addingStep === step.id}
                          className="bg-black text-white text-sm px-4 rounded-xl disabled:opacity-50 hover:bg-neutral-800 transition">
                          {addingStep === step.id ? '…' : 'Add'}
                        </button>
                      </div>
                    </div>

                    {/* ── Client Deliverables ── */}
                    <div className="px-6 pb-4 pt-1 space-y-3 border-t border-neutral-100 mt-1">
                      <div className="flex items-center justify-between pt-3">
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#7EC8A0' }}>Client Deliverables</p>
                        {stepDeliverables.length > 0 && (
                          <span className="text-xs text-neutral-400">{delivDone}/{stepDeliverables.length} complete</span>
                        )}
                      </div>

                      {stepDeliverables.length > 0 && (
                        <div className="space-y-2">
                          {stepDeliverables.map((deliv) => (
                            <div key={deliv.id} className={`flex items-center gap-3 p-3 border rounded-xl group ${updatingDeliv === deliv.id ? 'opacity-60' : ''} ${deliv.is_done ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-200'}`}>
                              <input type="checkbox" checked={deliv.is_done} onChange={() => toggleDeliverable(deliv.id)}
                                className="w-4 h-4 rounded shrink-0" style={{ accentColor: '#7EC8A0' }} />
                              <span className={`flex-1 text-sm ${deliv.is_done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>{deliv.title}</span>
                              {deliv.is_done && <span className="text-xs font-bold shrink-0" style={{ color: '#7EC8A0' }}>✓</span>}
                              <button onClick={() => deleteDeliverable(deliv.id)}
                                className="text-xs text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition px-1">✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          value={newDelivByStep[step.id] ?? ''}
                          onChange={(e) => setNewDelivByStep((p) => ({ ...p, [step.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && addDeliverable(step.id)}
                          placeholder="+ Add client deliverable…"
                          className="flex-1 text-sm border border-neutral-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
                        />
                        <button onClick={() => addDeliverable(step.id)} disabled={addingDeliv === step.id}
                          className="text-white text-sm px-4 rounded-xl disabled:opacity-50 transition"
                          style={{ background: '#1A3428' }}>
                          {addingDeliv === step.id ? '…' : 'Add'}
                        </button>
                      </div>
                    </div>

                    {/* ── What Riley's Working On (client_description) ── */}
                    <div className="px-6 pb-5 pt-1 space-y-3 border-t border-neutral-100">
                      <div className="pt-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-0.5">"What Riley's Working On" — Client-facing</p>
                          <p className="text-xs text-neutral-400">Publish to make visible in the client portal.</p>
                        </div>
                        {/* Publish status badge */}
                        {clientDescSaved[step.id] ? (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">● Live</span>
                        ) : (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-400">Not published</span>
                        )}
                      </div>
                      <textarea
                        value={clientDescDraft[step.id] ?? ''}
                        onChange={(e) => setClientDescDraft((p) => ({ ...p, [step.id]: e.target.value }))}
                        rows={3}
                        placeholder="e.g. Riley is conducting individual 60-minute interviews with each member of your leadership team…"
                        className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 placeholder-neutral-300"
                      />
                      <div className="flex items-center justify-between gap-3">
                        {publishedDesc === step.id ? (
                          <span className="text-xs font-semibold" style={{ color: '#7EC8A0' }}>✓ Published — client can see this now</span>
                        ) : clientDescDraft[step.id] !== clientDescSaved[step.id] ? (
                          <span className="text-xs text-neutral-400">Unsaved changes</span>
                        ) : <span />}
                        <button
                          onClick={() => publishClientDesc(step.id)}
                          disabled={publishingDesc === step.id || clientDescDraft[step.id] === clientDescSaved[step.id]}
                          className="text-xs font-semibold px-4 py-2 rounded-xl text-white transition disabled:opacity-40"
                          style={{ background: '#1A3428' }}
                        >
                          {publishingDesc === step.id ? 'Publishing…' : '↑ Publish to Client'}
                        </button>
                      </div>
                    </div>

                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ══ INTERVIEWS ══ */}
        {tab === 'interviews' && isBAI && (
          <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              {/* Leader tabs — editable */}
              <div className="border-b border-neutral-100 bg-neutral-50 px-6 pt-3 overflow-x-auto">
                <div className="flex items-center gap-0">
                  {leaders.map((name, i) => (
                    <div key={i} className={`relative group/tab flex items-center -mb-px ${leaderTab === i ? 'z-10' : ''}`}>
                      {leaderTab === i ? (
                        // Active tab — editable input
                        <div className="flex items-center border-b-2 border-black">
                          <input
                            value={name}
                            onChange={(e) => updateLeaderName(i, e.target.value)}
                            className="bg-transparent text-sm font-semibold text-black outline-none px-3 py-3 w-[120px] min-w-0"
                            placeholder={`Leader ${i + 1}`}
                          />
                          {leaders.length > 1 && (
                            <button onClick={() => removeLeader(i)}
                              className="text-neutral-400 hover:text-red-500 transition text-xs px-1 pb-1"
                              title="Remove leader">✕</button>
                          )}
                        </div>
                      ) : (
                        // Inactive tab
                        <button onClick={() => setLeaderTab(i)}
                          className="px-4 py-3 text-sm text-neutral-500 hover:text-neutral-700 border-b-2 border-transparent transition whitespace-nowrap">
                          {name || `Leader ${i + 1}`}
                        </button>
                      )}
                      {/* Note indicator dot */}
                      {interviewQuestions.some((_, qi) => getInterviewNote(i, qi).trim()) && (
                        <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-[#F04D3D]" />
                      )}
                    </div>
                  ))}

                  {/* Add leader */}
                  {leaders.length < 8 && (
                    <button onClick={addLeader}
                      className="px-3 py-3 text-sm text-neutral-400 hover:text-black border-b-2 border-transparent transition whitespace-nowrap">
                      + Add
                    </button>
                  )}

                  {/* Saving indicator */}
                  {savingLeaders && (
                    <span className="ml-auto text-xs text-neutral-400 pb-1 px-2 shrink-0">Saving…</span>
                  )}
                </div>
              </div>

              {/* Questions */}
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-neutral-900">{leaders[leaderTab] || `Leader ${leaderTab + 1}`}</h3>
                  <span className="text-xs text-neutral-400">{interviewQuestions.length} anchor questions</span>
                </div>

                {interviewQuestions.map((q, qi) => {
                  const catStyle = CAT_COLOR[q.category] ?? 'bg-neutral-100 text-neutral-700'
                  const note = getInterviewNote(leaderTab, qi)
                  const hasPush = q.guidance?.toUpperCase().includes('PUSH')
                  const hasBreathe = q.guidance?.toUpperCase().includes('BREATHE')
                  return (
                    <div key={qi} className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-mono text-neutral-300 pt-0.5 w-5 shrink-0">{String(qi + 1).padStart(2,'0')}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-neutral-900 leading-snug">&ldquo;{q.question}&rdquo;</p>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catStyle}`}>{q.category}</span>
                            {hasPush && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">PUSH</span>}
                            {hasBreathe && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">BREATHE</span>}
                          </div>
                          {q.watch_for && (
                            <p className="mt-1.5 text-xs text-[#1A3428] bg-[#1A3428]/5 border border-[#1A3428]/15 rounded-lg px-3 py-1.5">
                              <span className="font-semibold">Watch for:</span> {q.watch_for}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-8">
                        <textarea
                          value={note}
                          onChange={(e) => updateInterviewNote(leaderTab, qi, e.target.value)}
                          rows={3}
                          placeholder={`What ${leaders[leaderTab] || 'this leader'} said…`}
                          className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 placeholder-neutral-300 bg-white"
                        />
                      </div>
                      {qi < interviewQuestions.length - 1 && <div className="ml-8 border-b border-neutral-100" />}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Create Gap Map button ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h3 className="font-semibold text-neutral-900">Ready to synthesize?</h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {linkedGapMaps.length > 0
                      ? 'A Gap Map has already been created from these interviews.'
                      : leadersWithNotes < 2
                        ? `Fill out at least 2 leaders to unlock — ${leadersWithNotes}/2 done.`
                        : `${leadersWithNotes} leaders have notes. Create a Gap Map and all interview notes will be translated across automatically.`
                    }
                  </p>
                  {linkedGapMaps.length > 0 && (
                    <button onClick={() => router.push(`/dashboard/admin/gap-maps/${linkedGapMaps[0].id}`)}
                      className="mt-3 text-sm font-medium text-[#F04D3D] hover:opacity-80 transition underline">
                      Open Gap Map →
                    </button>
                  )}
                </div>

                {linkedGapMaps.length === 0 && (
                  <div className="shrink-0">
                    {/* Progress dots */}
                    <div className="flex gap-1.5 justify-end mb-3">
                      {leaders.map((_, li) => (
                        <div key={li} className={`w-2 h-2 rounded-full transition ${
                          interviewQuestions.some((_, qi) => getInterviewNote(li, qi).trim())
                            ? 'bg-[#F04D3D]'
                            : 'bg-neutral-200'
                        }`} />
                      ))}
                    </div>
                    <button
                      onClick={createGapMap}
                      disabled={!canCreateGapMap || creatingGapMap}
                      className={`text-sm font-semibold px-6 py-3 rounded-xl transition ${
                        canCreateGapMap && !creatingGapMap
                          ? 'bg-black text-white hover:bg-neutral-800'
                          : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {creatingGapMap ? 'Creating…' : '◆ Create Gap Map'}
                    </button>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {linkedGapMaps.length === 0 && (
                <div className="mt-4 pt-4 border-t border-neutral-100">
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                    <span>Leaders with notes</span>
                    <span>{leadersWithNotes} of {leaders.length}</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${leadersWithNotes >= 2 ? 'bg-[#F04D3D]' : 'bg-neutral-300'}`}
                      style={{ width: `${Math.min(100, (leadersWithNotes / leaders.length) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ MEETING NOTES ══ */}
        {tab === 'notes' && (
          <div className="grid md:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-3">
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-neutral-900">New Note</h3>
                <input value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Meeting title…"
                  className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10" />
                <input type="date" value={newNoteDate} onChange={(e) => setNewNoteDate(e.target.value)}
                  className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10" />
                <button onClick={createMeetingNote} disabled={creatingNote || !newNoteTitle.trim()}
                  className="w-full bg-black text-white text-sm py-2 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
                  {creatingNote ? 'Creating…' : '+ Create Note'}
                </button>
              </div>

              <div className="space-y-2">
                {meetingNotes.length === 0 && <p className="text-sm text-neutral-400 text-center py-4">No notes yet</p>}
                {meetingNotes.map((note) => (
                  <button key={note.id} onClick={() => setActiveMeetingNote(note)}
                    className={`w-full text-left p-4 rounded-2xl border transition ${activeMeetingNote?.id === note.id ? 'border-black bg-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900 line-clamp-2">{note.title}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${note.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                        {note.status === 'published' ? 'Live' : 'Draft'}
                      </span>
                    </div>
                    {note.meeting_date && <p className="text-xs text-neutral-400 mt-1">{fmtDate(note.meeting_date)}</p>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {!activeMeetingNote ? (
                <div className="bg-white border border-dashed border-neutral-200 rounded-2xl p-16 text-center">
                  <p className="text-neutral-400 text-sm">Select a note or create a new one</p>
                </div>
              ) : (
                <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-neutral-900 text-lg">{activeMeetingNote.title}</h2>
                      {activeMeetingNote.meeting_date && (
                        <p className="text-sm text-neutral-400">{fmtDate(activeMeetingNote.meeting_date)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => togglePublish(activeMeetingNote)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                          activeMeetingNote.status === 'published'
                            ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                            : 'border-neutral-200 text-neutral-600 hover:border-black hover:text-black'
                        }`}>
                        {activeMeetingNote.status === 'published' ? '✓ Published' : 'Publish'}
                      </button>
                      <button onClick={() => deleteMeetingNote(activeMeetingNote.id)}
                        className="text-xs text-neutral-400 hover:text-red-600 transition px-2 py-1.5">Delete</button>
                    </div>
                  </div>
                  <MeetingNoteEditor
                    key={activeMeetingNote.id}
                    noteId={activeMeetingNote.id}
                    initialData={activeMeetingNote.content}
                    onSaved={() => setMeetingNotes((p) => p.map((n) => n.id === activeMeetingNote.id ? { ...n, updated_at: new Date().toISOString() } : n))}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Doc Preview Modal ── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setPreviewDoc(null); setPreviewUrl(null) } }}>
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-neutral-400">Preview</p>
                <p className="font-semibold text-neutral-900">{previewDoc.title}</p>
              </div>
              <div className="flex items-center gap-3">
                {previewUrl && <button onClick={() => window.open(previewUrl, '_blank', 'noreferrer')} className="text-sm underline text-neutral-500 hover:text-black">Open ↗</button>}
                <button onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }} className="text-sm text-neutral-400 hover:text-black">✕</button>
              </div>
            </div>
            <div className="p-4">
              {!previewUrl ? <p className="text-sm text-neutral-400">Loading…</p>
                : previewDoc.embed_url || previewDoc.file_type?.includes('pdf')
                  ? <iframe src={previewUrl} className="w-full h-[65vh] rounded-xl border" title="preview" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
                  : previewDoc.file_type?.startsWith('image/')
                    ? <img src={previewUrl} alt={previewDoc.title} className="max-h-[65vh] w-auto mx-auto rounded-xl border" />
                    : <div className="text-sm text-neutral-500 p-4"><p>No inline preview.</p><button onClick={() => window.open(previewUrl, '_blank')} className="underline mt-2">Open file ↗</button></div>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Internal Notes ───────────────────────────────────────────────────────────
function InternalNotes({ projectId }: { projectId: string }) {
  const [todos, setTodos] = useState<{ id: string; text: string; created_at: string }[]>([])
  const [newTodo, setNewTodo] = useState('')

  useEffect(() => {
    supabase.from('project_todos').select('id,text,created_at').eq('project_id', projectId).order('created_at')
      .then(({ data }) => setTodos(data ?? []))
  }, [projectId])

  const add = async () => {
    if (!newTodo.trim()) return
    const { data } = await supabase.from('project_todos').insert({ project_id: projectId, text: newTodo.trim() }).select('id,text,created_at').single()
    if (data) { setTodos((p) => [...p, data]); setNewTodo('') }
  }

  const del = async (id: string) => {
    setTodos((p) => p.filter((t) => t.id !== id))
    await supabase.from('project_todos').delete().eq('id', id)
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
      <h2 className="font-semibold text-neutral-900">Internal Notes</h2>
      <div className="space-y-2">
        {todos.length === 0 && <p className="text-sm text-neutral-400">No notes yet</p>}
        {todos.map((t) => (
          <div key={t.id} className="flex items-start gap-3 group">
            <span className="text-[#F04D3D] mt-0.5 shrink-0 text-xs">◆</span>
            <p className="flex-1 text-sm text-neutral-700">{t.text}</p>
            <button onClick={() => del(t.id)} className="text-xs text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a note…"
          className="flex-1 text-sm border border-neutral-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/10" />
        <button onClick={add} className="bg-black text-white text-sm px-4 rounded-xl hover:bg-neutral-800 transition">Add</button>
      </div>
    </div>
  )
}
