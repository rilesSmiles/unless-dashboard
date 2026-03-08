'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SopPhase {
  number: string
  name: string
  tag: string
  duration: string
  who: string
  description: string
  riley_does: string[]
  client_does: string[]
  produces: string
  riley_note: string
}

interface IntakeQuestion {
  question: string
  category: string
  why: string
}

interface InterviewQuestion {
  question: string
  category: string
  why: string
  watch_for: string
  probes: string[]
  guidance: string
}

interface ServiceTemplate {
  id: string
  name: string
  slug: string
  description: string
  category: string
  phases: string[]
  duration: string
  sop_phases: SopPhase[] | null
  intake_questions: IntakeQuestion[] | null
  interview_questions: InterviewQuestion[] | null
}

const CATEGORY_LABELS: Record<string, string> = {
  intensive: 'Intensive',
  system_build: 'System Build',
  stewardship: 'Stewardship',
}

const GAP_CATEGORIES = [
  'Mission', 'Positioning', 'Value Proposition',
  'Audience', 'Voice & Tone', 'Internal vs. External',
]

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [selected, setSelected] = useState<ServiceTemplate | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'sop' | 'intake' | 'interview'>('overview')
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)
  const [expandedQ, setExpandedQ] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('service_templates')
        .select('*')
        .order('created_at')
      if (!error && data) setTemplates(data)
      setLoading(false)
    }
    load()
  }, [])

  const openTemplate = (t: ServiceTemplate) => {
    setSelected(t)
    setActiveTab('overview')
    setExpandedPhase(null)
    setExpandedQ(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F3EC' }}>
        <p style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a', opacity: 0.5 }}>Loading templates…</p>
      </div>
    )
  }

  if (selected) {
    return (
      <DetailView
        template={selected}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        expandedPhase={expandedPhase}
        setExpandedPhase={setExpandedPhase}
        expandedQ={expandedQ}
        setExpandedQ={setExpandedQ}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: '#F7F3EC' }}>
      <div className="px-8 pt-12 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.18em', color: '#7EC8A0', textTransform: 'uppercase', marginBottom: 8 }}>
          Unless Creative · Service Library
        </p>
        <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 36, fontWeight: 400, color: '#fff', lineHeight: 1.1, marginBottom: 12 }}>
          Templates
        </h1>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#9a9a8a', maxWidth: 520, lineHeight: 1.6 }}>
          The Unless service suite — each with its own delivery framework, SOP, and question guides. These are your repeatable systems.
        </p>
      </div>
      <div className="px-8 pt-8 space-y-4">
        {templates.map((t, i) => (
          <TemplateCard key={t.id} template={t} index={i} onClick={() => openTemplate(t)} />
        ))}
      </div>
    </div>
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template: t, index: i, onClick }: { template: ServiceTemplate; index: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hasSop = !!t.sop_phases
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left"
      style={{
        background: '#fff',
        border: '1px solid #1a1a1a15',
        borderRadius: 16,
        padding: '28px 32px',
        boxShadow: hovered ? '0 8px 32px #1a1a1a12' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'block',
        cursor: 'pointer',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: '#F04D3D18', color: '#b33628', border: '1px solid #F04D3D40', borderRadius: 20, padding: '3px 10px' }}>
              {CATEGORY_LABELS[t.category] ?? t.category}
            </span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: '#9a8a6a' }}>{t.duration}</span>
            {hasSop && (
              <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#1a1a1a', color: '#F7F3EC', borderRadius: 20, padding: '3px 10px' }}>
                SOP Ready
              </span>
            )}
          </div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, color: '#1a1a1a', marginBottom: 8 }}>{t.name}</h2>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#6a5a40', lineHeight: 1.6, maxWidth: 560 }}>{t.description}</p>
          {t.phases && (
            <div className="flex flex-wrap gap-2 mt-4">
              {t.phases.map((phase, idx) => (
                <span key={idx} style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: '#1a1a1a', background: '#F7F3EC', border: '1px solid #1a1a1a15', borderRadius: 20, padding: '3px 12px' }}>
                  {String(idx + 1).padStart(2, '0')} {phase}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F04D3D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
          <span style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>→</span>
        </div>
      </div>
    </button>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({ template: t, activeTab, setActiveTab, expandedPhase, setExpandedPhase, expandedQ, setExpandedQ, onBack }: {
  template: ServiceTemplate
  activeTab: 'overview' | 'sop' | 'intake' | 'interview'
  setActiveTab: (tab: 'overview' | 'sop' | 'intake' | 'interview') => void
  expandedPhase: string | null
  setExpandedPhase: (id: string | null) => void
  expandedQ: number | null
  setExpandedQ: (i: number | null) => void
  onBack: () => void
}) {
  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    ...(t.sop_phases ? [{ id: 'sop' as const, label: 'SOP · Phases' }] : []),
    ...(t.intake_questions ? [{ id: 'intake' as const, label: 'Intake Questions' }] : []),
    ...(t.interview_questions ? [{ id: 'interview' as const, label: 'Interview Guide' }] : []),
  ]

  return (
    <div className="min-h-screen pb-32" style={{ background: '#F7F3EC' }}>
      {/* Green gradient header */}
      <div className="px-8 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <button onClick={onBack} style={{ fontFamily: 'Georgia, serif', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7EC8A0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← All Templates
        </button>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: '#F04D3D30', color: '#ffb0a8', border: '1px solid #F04D3D40', borderRadius: 20, padding: '3px 10px' }}>
            {CATEGORY_LABELS[t.category] ?? t.category}
          </span>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#9a9a8a' }}>{t.duration}</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 32, fontWeight: 400, color: '#fff', lineHeight: 1.1, marginBottom: 10 }}>{t.name}</h1>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#9a9a8a', lineHeight: 1.65, maxWidth: 580 }}>{t.description}</p>

        <div className="flex gap-0 mt-8 border-b" style={{ borderColor: '#ffffff15' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: activeTab === tab.id ? '#fff' : '#7a9a8a', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #F04D3D' : '2px solid transparent', padding: '10px 20px 12px', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 pt-8">
        {activeTab === 'overview' && <OverviewTab template={t} />}
        {activeTab === 'sop' && t.sop_phases && <SopTab phases={t.sop_phases} expanded={expandedPhase} setExpanded={setExpandedPhase} />}
        {activeTab === 'intake' && t.intake_questions && <IntakeTab questions={t.intake_questions} expanded={expandedQ} setExpanded={setExpandedQ} />}
        {activeTab === 'interview' && t.interview_questions && <InterviewTab questions={t.interview_questions} expanded={expandedQ} setExpanded={setExpandedQ} />}
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ template: t }: { template: ServiceTemplate }) {
  return (
    <div className="space-y-8 max-w-2xl">
      {t.phases && (
        <div>
          <SectionLabel>Delivery Phases</SectionLabel>
          <div className="space-y-2 mt-4">
            {t.phases.map((phase, i) => (
              <div key={i} className="flex items-center gap-4" style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', border: '1px solid #1a1a1a10' }}>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, color: '#F04D3D', letterSpacing: '0.1em', minWidth: 24 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#1a1a1a' }}>{phase}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {t.slug === 'brand-alignment-intensive' && (
        <div>
          <SectionLabel>Gap Map Categories</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {GAP_CATEGORIES.map((cat, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #1a1a1a10', fontFamily: 'Georgia, serif', fontSize: 14, color: '#1a1a1a' }}>{cat}</div>
            ))}
          </div>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#8a7a5a', marginTop: 10, lineHeight: 1.6 }}>
            Each interview is scored across these six categories. Together they form the Alignment Gap Map — the centrepiece deliverable of the Intensive.
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Duration" value={t.duration} />
        {t.intake_questions && <StatCard label="Intake Questions" value={`${t.intake_questions.length} Questions`} />}
        {t.interview_questions && <StatCard label="Interview Guide" value={`${t.interview_questions.length} Questions`} />}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '16px 18px' }}>
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F04D3D', marginBottom: 6 }}>{label}</p>
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#F7F3EC', lineHeight: 1.3 }}>{value}</p>
    </div>
  )
}

// ─── SOP Tab ──────────────────────────────────────────────────────────────────

function SopTab({ phases, expanded, setExpanded }: { phases: SopPhase[]; expanded: string | null; setExpanded: (id: string | null) => void }) {
  return (
    <div className="space-y-3 max-w-2xl">
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#6a5a40', lineHeight: 1.65, marginBottom: 24 }}>
        Your operating manual for the Brand Alignment Intensive. Five phases, clear owners, and defined outputs at every stage.
      </p>
      {phases.map((phase) => {
        const isOpen = expanded === phase.number
        return (
          <div key={phase.number} style={{ background: '#fff', border: isOpen ? '1px solid #1a1a1a30' : '1px solid #1a1a1a10', borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
            <button onClick={() => setExpanded(isOpen ? null : phase.number)} className="w-full text-left" style={{ padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#F04D3D', fontWeight: 400, minWidth: 32, lineHeight: 1 }}>{phase.number}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 400, color: '#1a1a1a' }}>{phase.name}</h3>
                      <span style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#b33628', background: '#F04D3D15', border: '1px solid #F04D3D30', borderRadius: 20, padding: '2px 8px' }}>{phase.tag}</span>
                    </div>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#8a7a5a' }}>{phase.duration} · {phase.who}</p>
                  </div>
                </div>
                <span style={{ color: '#1a1a1a', fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, marginTop: 2 }}>›</span>
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: '0 24px 24px', borderTop: '1px solid #1a1a1a08' }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#4a3a20', lineHeight: 1.7, marginTop: 16, marginBottom: 20 }}>{phase.description}</p>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div style={{ background: '#F7F3EC', borderRadius: 10, padding: '14px 16px' }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F04D3D', marginBottom: 10 }}>Riley Does</p>
                    <ul className="space-y-2">
                      {phase.riley_does.map((item, i) => (
                        <li key={i} style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#3a2a10', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#F04D3D', flexShrink: 0 }}>—</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ background: '#F7F3EC', borderRadius: 10, padding: '14px 16px' }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7a5a', marginBottom: 10 }}>Client Does</p>
                    <ul className="space-y-2">
                      {phase.client_does.map((item, i) => (
                        <li key={i} style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#3a2a10', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#8a7a5a', flexShrink: 0 }}>—</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F04D3D', marginBottom: 6 }}>Produces</p>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#F7F3EC', lineHeight: 1.6 }}>{phase.produces}</p>
                </div>
                {phase.riley_note && (
                  <div style={{ borderLeft: '3px solid #F04D3D', paddingLeft: 14 }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F04D3D', marginBottom: 4 }}>Riley's Note</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#6a5a40', lineHeight: 1.65, fontStyle: 'italic' }}>{phase.riley_note}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Intake Tab ───────────────────────────────────────────────────────────────

function IntakeTab({ questions, expanded, setExpanded }: { questions: IntakeQuestion[]; expanded: number | null; setExpanded: (i: number | null) => void }) {
  return (
    <div className="max-w-2xl">
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#6a5a40', lineHeight: 1.65, marginBottom: 24 }}>
        Sent async to the CEO before kick-off. Captures the official story before the real conversations start. Each question is engineered to reveal alignment gaps without triggering defensiveness.
      </p>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const isOpen = expanded === i
          return (
            <div key={i} style={{ background: '#fff', border: isOpen ? '1px solid #1a1a1a30' : '1px solid #1a1a1a10', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isOpen ? null : i)} className="w-full text-left" style={{ padding: '18px 22px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#F04D3D', minWidth: 22, flexShrink: 0, marginTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#1a1a1a', lineHeight: 1.5, marginBottom: 4 }}>{q.question}</p>
                      <CategoryPill category={q.category} />
                    </div>
                  </div>
                  <span style={{ color: '#9a8a6a', fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>›</span>
                </div>
              </button>
              {isOpen && (
                <div style={{ padding: '0 22px 20px', borderTop: '1px solid #1a1a1a08' }}>
                  <div style={{ background: '#F7F3EC', borderRadius: 10, padding: '14px 16px', marginTop: 14 }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7a5a', marginBottom: 6 }}>Why This Question</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#3a2a10', lineHeight: 1.7 }}>{q.why}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Interview Tab ────────────────────────────────────────────────────────────

function InterviewTab({ questions, expanded, setExpanded }: { questions: InterviewQuestion[]; expanded: number | null; setExpanded: (i: number | null) => void }) {
  return (
    <div className="max-w-2xl">
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#6a5a40', lineHeight: 1.65, marginBottom: 24 }}>
        60-minute 1:1 conversational interviews. These are anchor questions, not a script. Follow threads when they open. The probes are your toolkit when an answer needs pressure or space.
      </p>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const isOpen = expanded === i
          return (
            <div key={i} style={{ background: '#fff', border: isOpen ? '1px solid #1a1a1a30' : '1px solid #1a1a1a10', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isOpen ? null : i)} className="w-full text-left" style={{ padding: '18px 22px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#F04D3D', minWidth: 22, flexShrink: 0, marginTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#1a1a1a', lineHeight: 1.5, marginBottom: 4 }}>"{q.question}"</p>
                      <CategoryPill category={q.category} />
                    </div>
                  </div>
                  <span style={{ color: '#9a8a6a', fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>›</span>
                </div>
              </button>
              {isOpen && (
                <div style={{ padding: '0 22px 22px', borderTop: '1px solid #1a1a1a08' }}>
                  <div style={{ background: '#F7F3EC', borderRadius: 10, padding: '14px 16px', marginTop: 14, marginBottom: 12 }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a7a5a', marginBottom: 6 }}>Why This Question</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#3a2a10', lineHeight: 1.7 }}>{q.why}</p>
                  </div>
                  <div style={{ borderLeft: '2px solid #e0d0b0', paddingLeft: 14, marginBottom: 16 }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8a6a', marginBottom: 4 }}>Watch For</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#5a4a30', lineHeight: 1.65 }}>{q.watch_for}</p>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8a6a', marginBottom: 10 }}>Follow-Up Probes</p>
                    <div className="space-y-2">
                      {q.probes.map((probe, j) => (
                        <div key={j} style={{ background: '#F7F3EC', borderRadius: 8, padding: '10px 14px', fontFamily: 'Georgia, serif', fontSize: 13, color: '#3a2a10', lineHeight: 1.55, fontStyle: 'italic', display: 'flex', gap: 8 }}>
                          <span style={{ color: '#F04D3D', flexShrink: 0, fontStyle: 'normal' }}>{j + 1}.</span>
                          "{probe}"
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 18px' }}>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F04D3D', marginBottom: 6 }}>In the Room</p>
                    <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#F7F3EC', lineHeight: 1.65 }}>{q.guidance}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8a7a5a' }}>{children}</p>
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b33628', background: '#F04D3D15', border: '1px solid #F04D3D25', borderRadius: 20, padding: '2px 9px', display: 'inline-block' }}>
      {category}
    </span>
  )
}
