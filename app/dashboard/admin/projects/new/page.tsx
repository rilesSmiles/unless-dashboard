'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = { id: string; name: string | null; business_name: string | null }
type SopPhase = {
  number: string; name: string; tag: string; duration: string; who: string
  description: string; riley_does: string[]; client_does: string[]
  produces: string; riley_note: string
}
type ServiceTemplate = {
  id: string; slug: string; name: string; category: string
  description: string | null; duration: string | null
  phases: string[] | null; sop_phases: SopPhase[] | null
}

const TEMPLATE_STYLE: Record<string, { border: string; badge: string; accent: string }> = {
  intensive:    { border: 'border-[#F04D3D]/50', badge: 'bg-[#F04D3D]/10 text-[#b33628] border-[#F04D3D]/30', accent: 'bg-[#F04D3D]' },
  system_build: { border: 'border-stone-300',   badge: 'bg-stone-50 text-stone-800 border-stone-200',    accent: 'bg-stone-500'   },
  stewardship:  { border: 'border-neutral-300', badge: 'bg-neutral-50 text-neutral-700 border-neutral-200', accent: 'bg-neutral-500' },
}

const DEFAULT_LEADERS = ['CEO / Founder', 'Leader 2', 'Leader 3', 'Leader 4', 'Leader 5', 'Leader 6']

export default function NewProjectPage() {
  const router = useRouter()
  const [templates, setTemplates]   = useState<ServiceTemplate[]>([])
  const [clients, setClients]       = useState<Profile[]>([])
  const [selected, setSelected]     = useState<ServiceTemplate | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientId, setClientId]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [step, setStep]             = useState<'template' | 'details'>('template')

  useEffect(() => {
    const load = async () => {
      const [{ data: tplData }, { data: clientData }] = await Promise.all([
        supabase.from('service_templates')
          .select('id,slug,name,category,description,duration,phases,sop_phases')
          .order('created_at'),
        supabase.from('profiles')
          .select('id,name,business_name')
          .eq('role', 'client')
          .order('business_name'),
      ])
      setTemplates(tplData ?? [])
      setClients(clientData ?? [])
    }
    load()
  }, [])

  const pickTemplate = (tpl: ServiceTemplate) => {
    setSelected(tpl)
    setProjectName('')
    setStep('details')
  }

  const handleCreate = async () => {
    setError(null)
    if (!projectName.trim()) { setError('Please enter a project name'); return }
    setLoading(true)

    try {
      const isBAI = selected?.slug === 'brand-alignment-intensive'

      // 1. Create project
      const { data: project, error: pErr } = await supabase
        .from('projects')
        .insert({
          name: projectName.trim(),
          client_id: clientId || null,
          project_type: selected?.name ?? null,
          leaders: isBAI ? DEFAULT_LEADERS : null,
        })
        .select('id')
        .single()
      if (pErr || !project) throw pErr

      // 2. Create steps from template phases (with client_description from SOP)
      const phases = selected?.phases ?? ['Phase 1']
      const { data: insertedSteps, error: sErr } = await supabase
        .from('project_steps')
        .insert(phases.map((title, i) => ({
          project_id: project.id,
          title,
          step_order: i + 1,
          client_description: selected?.sop_phases?.[i]?.description ?? null,
        })))
        .select('id, title')
      if (sErr) throw sErr

      // 3. Seed Riley's tasks + client deliverables from sop_phases
      if (selected?.sop_phases?.length && insertedSteps?.length) {
        const taskRows: { project_id: string; project_step_id: string; title: string; is_done: boolean }[] = []
        const deliverableRows: { project_id: string; project_step_id: string; title: string; is_done: boolean; sort_order: number }[] = []

        insertedSteps.forEach((step, idx) => {
          const sopPhase = selected.sop_phases![idx]
          if (!sopPhase) return

          // Riley's tasks
          sopPhase.riley_does.forEach((taskTitle) => {
            taskRows.push({ project_id: project.id, project_step_id: step.id, title: taskTitle, is_done: false })
          })

          // Client deliverables
          ;(sopPhase.client_does ?? []).forEach((title, sortIdx) => {
            deliverableRows.push({ project_id: project.id, project_step_id: step.id, title, is_done: false, sort_order: sortIdx })
          })
        })

        const [taskResult, delivResult] = await Promise.all([
          taskRows.length ? supabase.from('project_step_tasks').insert(taskRows) : Promise.resolve({ error: null }),
          deliverableRows.length ? supabase.from('client_deliverables').insert(deliverableRows) : Promise.resolve({ error: null }),
        ])
        if (taskResult.error) console.error('Task seed error:', taskResult.error)
        if (delivResult.error) console.error('Deliverable seed error:', delivResult.error)
      }

      router.push(`/dashboard/admin/projects/${project.id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project')
      setLoading(false)
    }
  }

  // ── Template picker ─────────────────────────────────────────────────────────
  if (step === 'template') {
    return (
      <div className="min-h-screen bg-neutral-50 pb-24">
        <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-2">Unless Creative</p>
              <h1 className="text-3xl text-white leading-tight">New Project</h1>
              <p className="text-neutral-400 text-sm mt-1">Choose a service template to get started.</p>
            </div>
            <button onClick={() => router.push('/dashboard/admin/projects')}
              className="text-sm text-[#7EC8A0] hover:text-white transition mt-1">← Back</button>
          </div>
        </div>
      <div className="p-6 max-w-3xl mx-auto space-y-8">

        <div className="space-y-4">
          {templates.map((tpl) => {
            const style = TEMPLATE_STYLE[tpl.category] ?? TEMPLATE_STYLE['stewardship']
            const taskCount = tpl.sop_phases?.reduce((sum, p) => sum + (p.riley_does?.length ?? 0), 0) ?? 0
            return (
              <button key={tpl.id} onClick={() => pickTemplate(tpl)}
                className={`w-full text-left bg-white border-2 ${style.border} rounded-2xl p-6 hover:shadow-md transition-all group`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.badge}`}>
                        {tpl.category === 'intensive' ? 'Entry Point' : tpl.category === 'system_build' ? 'System Build' : 'Stewardship'}
                      </span>
                      {tpl.duration && <span className="text-xs text-neutral-400">{tpl.duration}</span>}
                      {taskCount > 0 && (
                        <span className="text-xs text-neutral-400">{taskCount} Riley tasks pre-seeded</span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-neutral-900 group-hover:text-black">{tpl.name}</h2>
                    {tpl.description && <p className="text-sm text-neutral-500 mt-1">{tpl.description}</p>}
                    {tpl.phases && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {tpl.phases.map((phase, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">{phase}</span>
                            {i < tpl.phases!.length - 1 && <span className="text-neutral-300 text-xs">→</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`w-8 h-8 rounded-full ${style.accent} flex items-center justify-center shrink-0`}>
                    <span className="text-white text-sm">→</span>
                  </div>
                </div>
              </button>
            )
          })}

          {/* Blank */}
          <button onClick={() => { setSelected(null); setStep('details') }}
            className="w-full text-left bg-white border-2 border-dashed border-neutral-200 rounded-2xl p-6 hover:border-neutral-400 transition group">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                <span className="text-neutral-500 text-sm">+</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-700 group-hover:text-black">Blank Project</h2>
                <p className="text-sm text-neutral-400">Start from scratch — no template phases or pre-seeded tasks</p>
              </div>
            </div>
          </button>
        </div>
      </div>
      </div>
    )
  }

  // ── Project details ──────────────────────────────────────────────────────────
  const style = selected ? TEMPLATE_STYLE[selected.category] ?? TEMPLATE_STYLE['stewardship'] : null
  const taskCount = selected?.sop_phases?.reduce((sum, p) => sum + (p.riley_does?.length ?? 0), 0) ?? 0

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-2">Unless Creative</p>
            <h1 className="text-3xl text-white leading-tight">Project Details</h1>
          </div>
          <button onClick={() => setStep('template')} className="text-sm text-[#7EC8A0] hover:text-white transition mt-1">← Back</button>
        </div>
      </div>
    <div className="p-6 max-w-xl mx-auto space-y-6">

      {selected && style && (
        <div className={`flex items-start gap-3 p-4 bg-white border-2 ${style.border} rounded-xl`}>
          <div className={`w-2 h-2 rounded-full ${style.accent} mt-1.5 shrink-0`} />
          <div className="flex-1">
            <p className="text-xs text-neutral-400 uppercase tracking-wider font-medium">Template</p>
            <p className="font-semibold text-neutral-900">{selected.name}</p>
            {taskCount > 0 && (() => {
                const clientCount = selected.sop_phases?.reduce((sum, p) => sum + (p.client_does?.length ?? 0), 0) ?? 0
                return (
                  <p className="text-xs text-neutral-400 mt-1">
                    Will auto-create {selected.phases?.length} phases with {taskCount} Riley tasks + {clientCount} client deliverables
                  </p>
                )
              })()}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
        <div>
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Project Name</label>
          <input
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            placeholder={selected ? `e.g. ${selected.name} — Sheni's Auto Trend` : 'Project name'}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Client <span className="font-normal normal-case text-neutral-400">(optional)</span>
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
          >
            <option value="">No client yet</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.business_name ?? 'Client') + (c.name ? ` — ${c.name}` : '')}
              </option>
            ))}
          </select>
        </div>

        {selected?.sop_phases && (
          <div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">What will be created</p>
            <div className="space-y-2">
              {selected.sop_phases.map((phase, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl">
                  <span className="text-xs font-mono text-neutral-400 w-5 shrink-0 pt-0.5">{phase.number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800">{phase.name}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{phase.riley_does.length} Riley tasks · {phase.client_does?.length ?? 0} client deliverables</p>
                  </div>
                  <span className="text-xs text-neutral-300">{phase.tag}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading || !projectName.trim()}
          className="w-full bg-[#F04D3D] text-white py-3 rounded-xl font-medium text-sm hover:bg-[#d43c2d] transition disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create Project →'}
        </button>
      </div>
      </div>
    </div>
  )
}
