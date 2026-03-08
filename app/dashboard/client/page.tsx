'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type StepTask = {
  id: string
  is_done: boolean
}

type Step = {
  id: string
  title: string
  step_order: number
  project_step_tasks: StepTask[]
}

type Project = {
  id: string
  name: string
  project_type: string | null
  created_at: string
  project_steps: Step[]
}

type RecentDoc = {
  id: string
  project_id: string
  title: string
  file_type: string | null
  embed_url: string | null
  created_at: string
}

type Invoice = {
  id: string
  status: string | null
  amount_cents: number | null
  currency: string | null
  due_date: string | null
}

function formatMoney(cents: number | null, currency: string | null) {
  if (cents == null) return '$0'
  try {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: (currency || 'CAD').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(0)}`
  }
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function typeLabel(type: string | null) {
  if (!type) return null
  if (type === 'brand-alignment-intensive' || type === 'BAI') return 'Brand Alignment Intensive'
  if (type === 'brand-system-build' || type === 'BSB') return 'Brand System Build'
  if (type === 'brand-stewardship-retainer' || type === 'BSR') return 'Brand Stewardship Retainer'
  return type
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ name: string | null } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setErrorMsg('Not signed in.'); setLoading(false); return }

      // Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, last_seen_at')
        .eq('id', userId)
        .single()

      setProfile({ name: profileData?.name ?? null })

      // Projects with steps + tasks
      const { data: projData } = await supabase
        .from('projects')
        .select(`
          id, name, project_type, created_at,
          project_steps (
            id, title, step_order,
            project_step_tasks ( id, is_done )
          )
        `)
        .eq('client_id', userId)
        .order('created_at', { ascending: false })

      const loadedProjects = (projData ?? []) as Project[]
      setProjects(loadedProjects)

      const projectIds = loadedProjects.map((p) => p.id)

      // Recent uploads (always show last 5 for review)
      if (projectIds.length > 0) {
        const { data: docData } = await supabase
          .from('project_documents')
          .select('id, project_id, title, file_type, embed_url, created_at')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
          .limit(5)
        setRecentDocs((docData ?? []) as RecentDoc[])
      }

      // Invoices
      const { data: invData } = await supabase
        .from('invoices')
        .select('id, status, amount_cents, currency, due_date')
        .eq('client_id', userId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20)
      setInvoices((invData ?? []) as Invoice[])

      // Update last_seen_at
      await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId)

      setLoading(false)
    }
    load()
  }, [])

  const activeProject = useMemo(() => projects[0] ?? null, [projects])

  const projectProgress = useMemo(() => {
    if (!activeProject) return { total: 0, done: 0, percent: 0, currentStep: null, steps: [] }
    const steps = [...(activeProject.project_steps ?? [])].sort((a, b) => a.step_order - b.step_order)
    let total = 0, done = 0
    for (const s of steps) {
      for (const t of s.project_step_tasks ?? []) {
        total++
        if (t.is_done) done++
      }
    }
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    const currentStep = steps.find((s) => (s.project_step_tasks ?? []).some((t) => !t.is_done)) ?? steps[steps.length - 1] ?? null
    return { total, done, percent, currentStep, steps }
  }, [activeProject])

  const outstandingInvoices = useMemo(() =>
    invoices.filter((i) => {
      const s = (i.status ?? '').toLowerCase()
      return s !== 'paid' && s !== 'void' && s !== 'uncollectible'
    }), [invoices])

  const outstandingTotal = useMemo(() => {
    const sum = outstandingInvoices.reduce((acc, i) => acc + (i.amount_cents ?? 0), 0)
    const currency = invoices.find((i) => i.currency)?.currency ?? 'CAD'
    return formatMoney(sum, currency)
  }, [outstandingInvoices, invoices])

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading your portal…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">

      {/* ── Header ── */}
      <div
        className="px-6 pt-10 pb-8"
        style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}
      >
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7EC8A0' }}>
            Unless Creative — Client Portal
          </p>
          <h1 className="text-3xl text-white">
            {profile?.name ? `Welcome back, ${profile.name.split(' ')[0]}.` : 'Welcome back.'}
          </h1>
          {activeProject && (
            <p className="text-sm mt-1" style={{ color: '#888' }}>
              {typeLabel(activeProject.project_type) ?? 'Your project'} is in progress.
            </p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">

        {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

        {/* ── Active Project: Phase Progress ── */}
        {activeProject ? (
          <button
            onClick={() => router.push(`/dashboard/client/projects/${activeProject.id}`)}
            className="w-full text-left bg-white border border-neutral-200 rounded-2xl p-6 hover:border-neutral-400 hover:shadow-sm transition-all group"
          >
            {/* Project name + type */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#7EC8A0' }}>
                  Active Project
                </p>
                <h2 className="text-xl font-bold text-neutral-900 group-hover:text-black leading-snug">
                  {activeProject.name}
                </h2>
                {activeProject.project_type && (
                  <p className="text-xs text-neutral-500 mt-0.5">{typeLabel(activeProject.project_type)}</p>
                )}
              </div>
              <span className="text-neutral-300 text-lg mt-1 group-hover:text-neutral-500 transition">→</span>
            </div>

            {/* Phase stepper */}
            {projectProgress.steps.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-0">
                  {projectProgress.steps.map((step, i) => {
                    const tasks = step.project_step_tasks ?? []
                    const allDone = tasks.length > 0 && tasks.every((t) => t.is_done)
                    const isActive = step.id === projectProgress.currentStep?.id
                    const isLast = i === projectProgress.steps.length - 1

                    return (
                      <div key={step.id} className="flex items-center" style={{ flex: isLast ? '0 0 auto' : 1 }}>
                        {/* Dot */}
                        <div
                          className="w-3 h-3 rounded-full shrink-0 transition-all"
                          style={{
                            background: allDone ? '#1A3428' : isActive ? '#F04D3D' : '#e5e5e5',
                            outline: isActive ? '3px solid #F04D3D30' : 'none',
                          }}
                        />
                        {/* Connector */}
                        {!isLast && (
                          <div
                            className="h-0.5 flex-1"
                            style={{ background: allDone ? '#1A3428' : '#e5e5e5' }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-800">{projectProgress.currentStep?.title}</span>
                    {' '}— Phase {(projectProgress.steps.findIndex(s => s.id === projectProgress.currentStep?.id) + 1)} of {projectProgress.steps.length}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: '#F04D3D' }}>
                    {projectProgress.percent}%
                  </p>
                </div>
              </div>
            )}

            {/* Progress bar */}
            <div className="w-full bg-neutral-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${projectProgress.percent}%`, background: '#F04D3D' }}
              />
            </div>
            <p className="text-xs text-neutral-400 mt-2">
              {projectProgress.done} of {projectProgress.total} tasks complete — tap to view full project
            </p>
          </button>
        ) : (
          <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
            <p className="text-neutral-400 text-sm">No active project yet. Riley will set one up for you.</p>
          </div>
        )}

        {/* ── Recent Uploads ── */}
        {recentDocs.length > 0 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-neutral-900">Recent Uploads</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Files ready for your review</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/client/documents')}
                className="text-xs font-semibold transition"
                style={{ color: '#F04D3D' }}
              >
                View all →
              </button>
            </div>
            <div className="space-y-2">
              {recentDocs.map((doc) => {
                const isLink = !!doc.embed_url
                const ext = doc.file_type?.split('/').pop()?.toUpperCase() ?? (isLink ? 'LINK' : 'FILE')
                return (
                  <button
                    key={doc.id}
                    onClick={() => router.push('/dashboard/client/documents')}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-100 hover:border-neutral-300 transition group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: '#F04D3D10', color: '#F04D3D' }}
                    >
                      {isLink ? '↗' : '◆'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{doc.title}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {ext} · {formatDate(doc.created_at)}
                      </p>
                    </div>
                    <span className="text-neutral-300 text-sm group-hover:text-neutral-500 transition">→</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Invoices Snapshot ── */}
        <button
          onClick={() => router.push('/dashboard/client/invoices')}
          className="w-full text-left bg-white border border-neutral-200 rounded-2xl p-5 hover:border-neutral-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1">Billing</p>
              {outstandingInvoices.length > 0 ? (
                <>
                  <p className="text-2xl font-bold" style={{ color: '#F04D3D' }}>{outstandingTotal}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {outstandingInvoices.length} outstanding invoice{outstandingInvoices.length !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-neutral-800">All paid up ✓</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} on file</p>
                </>
              )}
            </div>
            <span className="text-neutral-300 text-lg group-hover:text-neutral-500 transition">→</span>
          </div>
        </button>

        {/* ── All Projects (if multiple) ── */}
        {projects.length > 1 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">All Projects</h3>
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/dashboard/client/projects/${p.id}`)}
                  className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border border-neutral-100 hover:border-neutral-300 transition group"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">{p.name}</p>
                    {p.project_type && <p className="text-xs text-neutral-400 mt-0.5">{typeLabel(p.project_type)}</p>}
                  </div>
                  <span className="text-neutral-300 text-sm group-hover:text-neutral-500 transition">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
