'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Invoice = {
  id: string
  invoice_number: string | null
  status: string | null
  amount_cents: number | null
  currency: string | null
  due_date: string | null
  created_at: string
  projects?: { id: string; name: string }[] | null
}

function formatMoney(cents: number | null, currency: string | null) {
  if (cents == null) return '—'
  try {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: (currency || 'CAD').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `$${((cents ?? 0) / 100).toFixed(0)}`
  }
}

function formatDate(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return ts }
}

function statusConfig(status: string | null) {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'paid') return { label: 'Paid', bg: '#f0fdf4', text: '#16a34a', dot: '#22c55e' }
  if (s === 'sent' || s === 'open') return { label: 'Outstanding', bg: '#F04D3D10', text: '#F04D3D', dot: '#F04D3D' }
  if (s === 'draft') return { label: 'Draft', bg: '#f5f5f5', text: '#999', dot: '#ccc' }
  if (s === 'void' || s === 'uncollectible') return { label: 'Void', bg: '#fff1f2', text: '#e11d48', dot: '#fb7185' }
  return { label: status ?? 'Unknown', bg: '#f5f5f5', text: '#999', dot: '#ccc' }
}

export default function ClientInvoicesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setErrorMsg('Not signed in.'); setLoading(false); return }

      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, amount_cents, currency, due_date, created_at, projects:project_id(id, name)')
        .eq('client_id', userId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      if (error) { setErrorMsg('Could not load invoices.'); setLoading(false); return }
      setInvoices((data ?? []) as Invoice[])
      setLoading(false)
    }
    load()
  }, [])

  const { outstandingTotal, outstandingCount, outstandingCurrency, paidTotal } = useMemo(() => {
    const outstanding = invoices.filter((i) => {
      const s = (i.status ?? '').toLowerCase()
      return s !== 'paid' && s !== 'void' && s !== 'uncollectible'
    })
    const paid = invoices.filter((i) => (i.status ?? '').toLowerCase() === 'paid')
    const currency = invoices.find((i) => i.currency)?.currency ?? 'CAD'
    return {
      outstandingTotal: outstanding.reduce((acc, i) => acc + (i.amount_cents ?? 0), 0),
      outstandingCount: outstanding.length,
      outstandingCurrency: currency,
      paidTotal: paid.reduce((acc, i) => acc + (i.amount_cents ?? 0), 0),
    }
  }, [invoices])

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading invoices…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">

      {/* ── Header ── */}
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7EC8A0' }}>
            Unless Creative — Client Portal
          </p>
          <h1 className="text-3xl text-white">Invoices</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-4">
        {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-neutral-200 rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1">Outstanding</p>
            <p className="text-2xl font-bold" style={{ color: outstandingCount > 0 ? '#F04D3D' : '#1A3428' }}>
              {formatMoney(outstandingTotal, outstandingCurrency)}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              {outstandingCount === 0 ? 'All paid up ✓' : `${outstandingCount} invoice${outstandingCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-1">Paid to date</p>
            <p className="text-2xl font-bold text-neutral-800">
              {formatMoney(paidTotal, outstandingCurrency)}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              {invoices.filter((i) => (i.status ?? '').toLowerCase() === 'paid').length} paid invoice{invoices.filter((i) => (i.status ?? '').toLowerCase() === 'paid').length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* ── Invoice List ── */}
        <div className="space-y-3">
          {invoices.length === 0 ? (
            <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
              <p className="text-sm text-neutral-400">No invoices yet.</p>
            </div>
          ) : (
            invoices.map((inv) => {
              const sc = statusConfig(inv.status)
              const projectName = inv.projects?.[0]?.name ?? null
              return (
                <div key={inv.id} className="bg-white border border-neutral-200 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Status + amount */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                          {sc.label}
                        </span>
                        {projectName && (
                          <span className="text-xs text-neutral-400">· {projectName}</span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-neutral-900">
                        {formatMoney(inv.amount_cents, inv.currency)}
                      </p>
                      <div className="flex gap-4 mt-2">
                        <div>
                          <p className="text-xs text-neutral-400">Issued</p>
                          <p className="text-xs font-medium text-neutral-600">{formatDate(inv.created_at)}</p>
                        </div>
                        {inv.due_date && (
                          <div>
                            <p className="text-xs text-neutral-400">Due</p>
                            <p className="text-xs font-medium text-neutral-600">{formatDate(inv.due_date)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <Link
                        href={`/dashboard/client/invoices/${inv.id}`}
                        className="text-xs font-semibold px-4 py-2 rounded-xl text-white text-center transition hover:opacity-90"
                        style={{ background: (inv.status ?? '').toLowerCase() === 'paid' ? '#1A3428' : '#F04D3D' }}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Back */}
        <button
          onClick={() => router.push('/dashboard/client')}
          className="text-xs text-neutral-400 hover:text-black transition"
        >
          ← Back to dashboard
        </button>
      </div>
    </div>
  )
}
