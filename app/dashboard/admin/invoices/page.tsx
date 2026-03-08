'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type DocStatus = 'draft' | 'sent' | 'paid' | 'accepted' | 'declined' | 'converted' | 'overdue'

type InvoiceRow = {
  id: string; invoice_number: string | null; amount_cents: number | null
  amount: number | null; status: DocStatus; created_at: string
  due_date: string | null; paid_at: string | null
  project_name: string | null; business_name: string | null
  is_deposit: boolean; quote_id: string | null
}

type QuoteRow = {
  id: string; quote_number: string | null
  status: DocStatus; created_at: string; valid_until: string | null
  project_name: string | null; business_name: string | null
  converted_invoice_id: string | null
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: 'bg-neutral-100',  text: 'text-neutral-600', label: 'Draft'     },
  sent:      { bg: 'bg-blue-50',      text: 'text-blue-700',    label: 'Sent'      },
  paid:      { bg: 'bg-green-50',     text: 'text-green-700',   label: 'Paid'      },
  overdue:   { bg: 'bg-red-50',       text: 'text-red-700',     label: 'Overdue'   },
  accepted:  { bg: 'bg-emerald-50',   text: 'text-emerald-700', label: 'Accepted'  },
  declined:  { bg: 'bg-red-50',       text: 'text-red-700',     label: 'Declined'  },
  converted: { bg: 'bg-amber-50',     text: 'text-amber-700',   label: 'Invoiced'  },
}

const fmtMoney = (cents: number | null) =>
  cents == null ? '—' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

function StatusBadge({ status }: { status: DocStatus | string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE['draft']
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

// ─── Modal shared types ───────────────────────────────────────────────────────
type ProjectOption = { id: string; name: string; business_name: string | null; client_id: string | null }

export default function InvoicesHubPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'invoices' | 'quotes'>('invoices')
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [showNewQuote, setShowNewQuote] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [{ data: invData }, { data: qtData }] = await Promise.all([
        supabase.from('invoices').select(`id,invoice_number,amount,amount_cents,status,created_at,due_date,paid_at,is_deposit,quote_id,projects:project_id(name),profiles:client_id(business_name)`).order('created_at', { ascending: false }),
        supabase.from('quotes').select(`id,quote_number,status,created_at,valid_until,converted_invoice_id,projects:project_id(name),profiles:client_id(business_name)`).order('created_at', { ascending: false }),
      ])

      setInvoices((invData ?? []).map((d: any) => ({
        id: d.id, invoice_number: d.invoice_number ?? null,
        amount_cents: d.amount_cents ?? null, amount: d.amount ?? null,
        status: d.status, created_at: d.created_at, due_date: d.due_date ?? null,
        paid_at: d.paid_at ?? null, is_deposit: d.is_deposit ?? false,
        quote_id: d.quote_id ?? null,
        project_name: (Array.isArray(d.projects) ? d.projects[0] : d.projects)?.name ?? null,
        business_name: (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles)?.business_name ?? null,
      })))

      setQuotes((qtData ?? []).map((d: any) => ({
        id: d.id, quote_number: d.quote_number ?? null,
        status: d.status, created_at: d.created_at, valid_until: d.valid_until ?? null,
        converted_invoice_id: d.converted_invoice_id ?? null,
        project_name: (Array.isArray(d.projects) ? d.projects[0] : d.projects)?.name ?? null,
        business_name: (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles)?.business_name ?? null,
      })))

      setLoading(false)
    }
    load()
  }, [])

  // ── Stats ──
  const totalPaid   = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.amount_cents ?? i.amount ?? 0), 0)
  const totalOwed   = invoices.filter((i) => i.status === 'sent').reduce((s, i) => s + (i.amount_cents ?? i.amount ?? 0), 0)
  const openQuotes  = quotes.filter((q) => q.status === 'draft' || q.status === 'sent').length

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* Header */}
      <div className="px-6 pt-10 pb-0" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between gap-4 pb-6">
            <div>
              <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-2">Unless Creative</p>
              <h1 className="text-3xl text-white leading-tight">Billing</h1>
            </div>
            <div className="flex items-center gap-3 pb-1">
              <button onClick={() => setShowNewQuote(true)}
                className="text-sm font-medium px-4 py-2 border border-neutral-700 text-neutral-300 rounded-xl hover:border-white hover:text-white transition">
                + New Quote
              </button>
              <button onClick={() => setShowNewInvoice(true)}
                className="text-sm font-medium px-4 py-2 bg-[#F04D3D] text-white rounded-xl hover:bg-[#d43c2d] transition">
                + New Invoice
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pb-6">
            {[
              { label: 'Collected', value: fmtMoney(totalPaid), sub: 'paid invoices' },
              { label: 'Outstanding', value: fmtMoney(totalOwed), sub: 'awaiting payment' },
              { label: 'Open Quotes', value: openQuotes, sub: 'pending response' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
                <p className="text-xs text-neutral-600 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-0">
            {(['invoices', 'quotes'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium border-b-2 capitalize transition -mb-px ${
                  tab === t ? 'border-[#F04D3D] text-[#F04D3D]' : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}>
                {t} ({t === 'invoices' ? invoices.length : quotes.length})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-3">

        {/* ── Invoices ── */}
        {tab === 'invoices' && (
          <>
            {invoices.length === 0 ? (
              <EmptyState label="No invoices yet" cta="Create your first invoice" onClick={() => setShowNewInvoice(true)} />
            ) : (
              invoices.map((inv) => {
                const cents = inv.amount_cents ?? inv.amount ?? 0
                return (
                  <button key={inv.id} onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                    className="w-full text-left bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 hover:shadow-sm transition group flex items-center gap-5">
                    {/* Status pip */}
                    <div className={`w-1.5 h-12 rounded-full shrink-0 ${
                      inv.status === 'paid' ? 'bg-green-400' :
                      inv.status === 'sent' ? 'bg-blue-400' :
                      inv.status === 'overdue' ? 'bg-red-400' : 'bg-neutral-200'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="font-mono text-xs text-neutral-400">{inv.invoice_number ?? 'Draft'}</span>
                        <StatusBadge status={inv.status} />
                        {inv.is_deposit && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">Deposit</span>
                        )}
                        {inv.quote_id && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">From Quote</span>
                        )}
                      </div>
                      <p className="font-semibold text-neutral-900 group-hover:text-black">
                        {inv.project_name ?? 'No project'}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">{inv.business_name ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-xl font-bold text-neutral-900">{fmtMoney(cents)}</p>
                      <p className="text-xs text-neutral-400">
                        {inv.status === 'paid' && inv.paid_at ? `Paid ${fmtDate(inv.paid_at)}` :
                         inv.due_date ? `Due ${fmtDate(inv.due_date)}` : `Created ${fmtDate(inv.created_at)}`}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </>
        )}

        {/* ── Quotes ── */}
        {tab === 'quotes' && (
          <>
            {quotes.length === 0 ? (
              <EmptyState label="No quotes yet" cta="Create your first quote" onClick={() => setShowNewQuote(true)} />
            ) : (
              quotes.map((qt) => (
                <button key={qt.id} onClick={() => router.push(`/dashboard/admin/quotes/${qt.id}`)}
                  className="w-full text-left bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 hover:shadow-sm transition group flex items-center gap-5">
                  <div className={`w-1.5 h-12 rounded-full shrink-0 ${
                    qt.status === 'accepted' ? 'bg-emerald-400' :
                    qt.status === 'converted' ? 'bg-amber-400' :
                    qt.status === 'declined' ? 'bg-red-400' :
                    qt.status === 'sent' ? 'bg-blue-400' : 'bg-neutral-200'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-mono text-xs text-neutral-400">{qt.quote_number ?? 'Draft'}</span>
                      <StatusBadge status={qt.status} />
                    </div>
                    <p className="font-semibold text-neutral-900 group-hover:text-black">
                      {qt.project_name ?? 'No project'}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">{qt.business_name ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xs text-neutral-400">
                      {qt.valid_until ? `Valid until ${fmtDate(qt.valid_until)}` : `Created ${fmtDate(qt.created_at)}`}
                    </p>
                    {qt.converted_invoice_id && (
                      <p className="text-xs text-amber-600 font-medium">→ Invoice created</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showNewInvoice && (
        <NewDocModal
          type="invoice"
          onClose={() => setShowNewInvoice(false)}
          onCreated={(id) => { setShowNewInvoice(false); router.push(`/dashboard/admin/invoices/${id}`) }}
        />
      )}
      {showNewQuote && (
        <NewDocModal
          type="quote"
          onClose={() => setShowNewQuote(false)}
          onCreated={(id) => { setShowNewQuote(false); router.push(`/dashboard/admin/quotes/${id}`) }}
        />
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }) {
  return (
    <div className="border border-dashed border-neutral-200 rounded-2xl p-16 text-center space-y-3">
      <p className="text-neutral-400 text-sm">{label}</p>
      <button onClick={onClick} className="text-sm font-medium text-black underline">{cta}</button>
    </div>
  )
}

// ─── New Doc Modal ─────────────────────────────────────────────────────────────
function NewDocModal({ type, onClose, onCreated }: {
  type: 'invoice' | 'quote'
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('projects').select('id,name,client_id,profiles:client_id(business_name)').order('created_at', { ascending: false })
      .then(({ data }) => setProjects((data ?? []).map((p: any) => ({
        id: p.id, name: p.name, client_id: p.client_id ?? null,
        business_name: (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.business_name ?? null,
      }))))
  }, [])

  const selected = projects.find((p) => p.id === projectId)

  const create = async () => {
    setSaving(true)

    let clientSnap: { bill_to_name: string | null; bill_to_email: string | null; bill_to_position: string | null; bill_to_address: string | null } = { bill_to_name: null, bill_to_email: null, bill_to_position: null, bill_to_address: null }

    if (selected?.client_id) {
      const { data } = await supabase.from('profiles').select('name,email,position,address,business_name').eq('id', selected.client_id).single()
      if (data) clientSnap = { bill_to_name: data.business_name ?? data.name, bill_to_email: data.email, bill_to_position: data.position, bill_to_address: data.address }
    }

    if (type === 'invoice') {
      const { data, error } = await supabase.from('invoices').insert({
        project_id: projectId || null,
        client_id: selected?.client_id ?? null,
        status: 'draft',
        amount: 0, amount_cents: 0,
        ...clientSnap,
      }).select('id').single()
      setSaving(false)
      if (data) onCreated(data.id)
    } else {
      const { data, error } = await supabase.from('quotes').insert({
        project_id: projectId || null,
        client_id: selected?.client_id ?? null,
        status: 'draft',
        ...clientSnap,
      }).select('id').single()
      setSaving(false)
      if (data) onCreated(data.id)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="font-bold text-neutral-900 text-lg">
            New {type === 'invoice' ? 'Invoice' : 'Quote'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-black text-sm">✕</button>
        </div>
        <div>
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Project <span className="font-normal normal-case text-neutral-400">(optional)</span>
          </label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white">
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.business_name ? ` — ${p.business_name}` : ''}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-neutral-400">
          You'll add line items, amounts, and details on the next screen.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-neutral-200 text-neutral-600 text-sm py-2.5 rounded-xl hover:border-neutral-400 transition">
            Cancel
          </button>
          <button onClick={create} disabled={saving}
            className="flex-1 bg-black text-white text-sm py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
            {saving ? 'Creating…' : `Create ${type === 'invoice' ? 'Invoice' : 'Quote'} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
