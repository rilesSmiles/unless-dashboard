'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type LineItem = {
  id: string; description: string; quantity: number; unit_price_cents: number; sort_order: number
}
type Quote = {
  id: string; quote_number: string | null; status: string
  bill_to_name: string | null; bill_to_email: string | null
  bill_to_position: string | null; bill_to_address: string | null
  valid_until: string | null; notes: string | null; tax_rate: number
  converted_invoice_id: string | null
  project_name: string | null; business_name: string | null
  created_at: string
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-neutral-100 text-neutral-600',
  sent:      'bg-blue-50 text-blue-700',
  accepted:  'bg-emerald-50 text-emerald-700',
  declined:  'bg-red-50 text-red-700',
  converted: 'bg-amber-50 text-amber-700',
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [converting, setConverting] = useState(false)

  const [billToName, setBillToName]         = useState('')
  const [billToEmail, setBillToEmail]       = useState('')
  const [billToPosition, setBillToPosition] = useState('')
  const [billToAddress, setBillToAddress]   = useState('')
  const [validUntil, setValidUntil]         = useState('')
  const [notes, setNotes]                   = useState('')
  const [taxRate, setTaxRate]               = useState(0)

  useEffect(() => {
    const load = async () => {
      const [{ data: qt }, { data: items }] = await Promise.all([
        supabase.from('quotes').select(`*,projects:project_id(name),profiles:client_id(business_name)`).eq('id', id).single(),
        supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
      ])
      if (qt) {
        const project_name = (Array.isArray(qt.projects) ? qt.projects[0] : qt.projects)?.name ?? null
        const business_name = (Array.isArray(qt.profiles) ? qt.profiles[0] : qt.profiles)?.business_name ?? null
        setQuote({ ...qt, project_name, business_name })
        setBillToName(qt.bill_to_name ?? '')
        setBillToEmail(qt.bill_to_email ?? '')
        setBillToPosition(qt.bill_to_position ?? '')
        setBillToAddress(qt.bill_to_address ?? '')
        setValidUntil(qt.valid_until ?? '')
        setNotes(qt.notes ?? '')
        setTaxRate(Number(qt.tax_rate ?? 0))
      }
      setLineItems(items ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  const subtotal  = lineItems.reduce((s, i) => s + Math.round(i.quantity * i.unit_price_cents), 0)
  const taxAmount = Math.round(subtotal * taxRate)
  const total     = subtotal + taxAmount

  const addLineItem = async () => {
    const { data } = await supabase.from('quote_line_items').insert({
      quote_id: id, description: '', quantity: 1, unit_price_cents: 0, sort_order: lineItems.length,
    }).select('*').single()
    if (data) setLineItems((p) => [...p, data])
  }

  const updateLineItem = useCallback((itemId: string, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) => prev.map((li) => li.id === itemId ? { ...li, [field]: value } : li))
  }, [])

  const saveLineItem = useCallback(async (item: LineItem) => {
    await supabase.from('quote_line_items').update({
      description: item.description, quantity: item.quantity, unit_price_cents: item.unit_price_cents,
    }).eq('id', item.id)
  }, [])

  const deleteLineItem = async (itemId: string) => {
    setLineItems((p) => p.filter((li) => li.id !== itemId))
    await supabase.from('quote_line_items').delete().eq('id', itemId)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('quotes').update({
      bill_to_name: billToName.trim() || null,
      bill_to_email: billToEmail.trim() || null,
      bill_to_position: billToPosition.trim() || null,
      bill_to_address: billToAddress.trim() || null,
      valid_until: validUntil || null,
      notes: notes.trim() || null,
      tax_rate: taxRate,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const markSent = async () => {
    await supabase.from('quotes').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', id)
    setQuote((p) => p ? { ...p, status: 'sent' } : p)
  }

  const markAccepted = async () => {
    await supabase.from('quotes').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', id)
    setQuote((p) => p ? { ...p, status: 'accepted' } : p)
  }

  const markDeclined = async () => {
    await supabase.from('quotes').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', id)
    setQuote((p) => p ? { ...p, status: 'declined' } : p)
  }

  // ── Convert to Invoice ─────────────────────────────────────────────────────
  const convertToInvoice = async () => {
    if (!confirm('Convert this quote to an invoice? This will create a new invoice with the same line items.')) return
    setConverting(true)
    try {
      // 1. Save latest edits first
      await supabase.from('quotes').update({
        bill_to_name: billToName || null, bill_to_email: billToEmail || null,
        bill_to_position: billToPosition || null, bill_to_address: billToAddress || null,
        valid_until: validUntil || null, notes: notes || null, tax_rate: taxRate,
        status: 'converted', updated_at: new Date().toISOString(),
      }).eq('id', id)

      // 2. Create invoice
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        project_id: quote?.project_name ? undefined : undefined, // project linked via quote
        status: 'draft',
        amount: total, amount_cents: total,
        bill_to_name: billToName || null, bill_to_email: billToEmail || null,
        bill_to_position: billToPosition || null, bill_to_address: billToAddress || null,
        notes: notes || null, tax_rate: taxRate,
        quote_id: id,
      }).select('id').single()
      if (invErr || !inv) throw invErr

      // 3. Copy line items
      if (lineItems.length > 0) {
        await supabase.from('invoice_line_items').insert(
          lineItems.map((li) => ({
            invoice_id: inv.id, description: li.description,
            quantity: li.quantity, unit_price_cents: li.unit_price_cents, sort_order: li.sort_order,
          }))
        )
      }

      // 4. Link back
      await supabase.from('quotes').update({ converted_invoice_id: inv.id }).eq('id', id)
      setQuote((p) => p ? { ...p, status: 'converted', converted_invoice_id: inv.id } : p)

      // 5. Navigate to invoice
      router.push(`/dashboard/admin/invoices/${inv.id}`)
    } catch (e) {
      console.error('Convert error:', e)
      setConverting(false)
    }
  }

  const deleteQuote = async () => {
    if (!confirm('Delete this quote?')) return
    await supabase.from('quotes').delete().eq('id', id)
    router.push('/dashboard/admin/invoices?tab=quotes')
  }

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading quote…</div>
  if (!quote) return <div className="p-8 text-red-400 text-sm">Quote not found.</div>

  const isEditable = quote.status === 'draft' || quote.status === 'sent'
  const isConverted = quote.status === 'converted'

  return (
    <div className="min-h-screen bg-neutral-100 pb-32">

      {/* Top bar */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => router.push('/dashboard/admin/invoices')}
            className="text-sm text-neutral-500 hover:text-black transition flex items-center gap-1">
            ← Billing
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_STYLE[quote.status] ?? STATUS_STYLE['draft']}`}>
              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
            </span>

            {isEditable && (
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-medium px-4 py-2 bg-black text-white rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            )}

            {quote.status === 'draft' && (
              <button onClick={markSent}
                className="text-sm font-medium px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl hover:border-black transition">
                Mark Sent
              </button>
            )}
            {quote.status === 'sent' && (
              <>
                <button onClick={markAccepted}
                  className="text-sm font-medium px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition">
                  Mark Accepted
                </button>
                <button onClick={markDeclined}
                  className="text-sm font-medium px-4 py-2 border border-neutral-200 text-neutral-600 rounded-xl hover:border-red-300 hover:text-red-600 transition">
                  Declined
                </button>
              </>
            )}

            {/* Convert to Invoice — the big one */}
            {(quote.status === 'accepted' || quote.status === 'sent' || quote.status === 'draft') && !isConverted && (
              <button onClick={convertToInvoice} disabled={converting}
                className="text-sm font-semibold px-5 py-2 bg-amber-400 text-black rounded-xl hover:bg-amber-300 transition disabled:opacity-50 flex items-center gap-2">
                {converting ? 'Converting…' : '◆ Convert to Invoice'}
              </button>
            )}

            {isConverted && quote.converted_invoice_id && (
              <button onClick={() => router.push(`/dashboard/admin/invoices/${quote.converted_invoice_id}`)}
                className="text-sm font-medium px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition">
                View Invoice →
              </button>
            )}

            <button onClick={deleteQuote} className="text-xs text-neutral-400 hover:text-red-600 transition px-2">
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Quote document */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">

          {/* Quote header */}
          <div className="bg-black px-10 py-8 flex items-start justify-between gap-8">
            <div>
              <p className="text-white text-2xl font-bold tracking-tight">Unless Creative</p>
              <p className="text-neutral-400 text-sm mt-1">Brand Strategy Consultancy</p>
              <p className="text-neutral-500 text-xs mt-3">Calgary, AB</p>
              <p className="text-neutral-500 text-xs">hello@unlesscreative.com</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-400 text-xs uppercase tracking-widest font-medium">Quote</p>
              <p className="text-amber-400 text-3xl font-bold mt-1">{quote.quote_number ?? 'Draft'}</p>
              <div className="mt-4 space-y-1 text-right">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-neutral-500 text-xs">Issue Date</span>
                  <span className="text-neutral-300 text-xs">{fmtDate(quote.created_at)}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-neutral-500 text-xs">Valid Until</span>
                  {isEditable ? (
                    <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
                      className="bg-neutral-800 text-neutral-300 text-xs border border-neutral-700 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400" />
                  ) : (
                    <span className="text-neutral-300 text-xs">{fmtDate(validUntil)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bill To / Project */}
          <div className="px-10 py-8 grid sm:grid-cols-2 gap-8 border-b border-neutral-100">
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Prepared For</p>
              {isEditable ? (
                <div className="space-y-2">
                  <input value={billToName} onChange={(e) => setBillToName(e.target.value)}
                    placeholder="Company / Client Name"
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
                  <input value={billToPosition} onChange={(e) => setBillToPosition(e.target.value)}
                    placeholder="Title / Position"
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
                  <input value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)}
                    placeholder="Email" type="email"
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" />
                  <textarea value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)}
                    placeholder="Address" rows={2}
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10" />
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="font-semibold text-neutral-900">{billToName || '—'}</p>
                  {billToPosition && <p className="text-sm text-neutral-500">{billToPosition}</p>}
                  {billToEmail && <p className="text-sm text-neutral-500">{billToEmail}</p>}
                  {billToAddress && <p className="text-sm text-neutral-400 whitespace-pre-line">{billToAddress}</p>}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Project</p>
              <div className="space-y-1">
                {quote.project_name && <p className="font-semibold text-neutral-900">{quote.project_name}</p>}
                {quote.business_name && <p className="text-sm text-neutral-500">{quote.business_name}</p>}
                {!quote.project_name && <p className="text-sm text-neutral-400">No project linked</p>}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="px-10 py-8">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 w-full">Description</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 px-4 whitespace-nowrap">Qty</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 px-4 whitespace-nowrap">Rate</th>
                  <th className="text-right text-xs font-bold text-neutral-400 uppercase tracking-wider pb-3 whitespace-nowrap">Amount</th>
                  {isEditable && <th className="pb-3 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={isEditable ? 5 : 4} className="py-8 text-center text-sm text-neutral-400">
                      No line items yet — add one below
                    </td>
                  </tr>
                )}
                {lineItems.map((item) => (
                  <tr key={item.id} className="group">
                    <td className="py-3 pr-4">
                      {isEditable ? (
                        <input value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          onBlur={() => saveLineItem(item)}
                          placeholder="Service or deliverable…"
                          className="w-full text-sm border-0 outline-none focus:bg-neutral-50 rounded-lg px-2 py-1 -ml-2 transition" />
                      ) : (
                        <span className="text-sm text-neutral-800">{item.description || '—'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isEditable ? (
                        <input type="number" value={item.quantity} min={0} step={0.5}
                          onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          onBlur={() => saveLineItem(item)}
                          className="w-16 text-sm text-right border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black/10" />
                      ) : (
                        <span className="text-sm">{item.quantity}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isEditable ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-sm text-neutral-400">$</span>
                          <input type="number" value={(item.unit_price_cents / 100).toFixed(2)} min={0} step={0.01}
                            onChange={(e) => updateLineItem(item.id, 'unit_price_cents', Math.round((parseFloat(e.target.value) || 0) * 100))}
                            onBlur={() => saveLineItem(item)}
                            className="w-24 text-sm text-right border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black/10" />
                        </div>
                      ) : (
                        <span className="text-sm">{fmtMoney(item.unit_price_cents)}</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-sm font-medium">{fmtMoney(Math.round(item.quantity * item.unit_price_cents))}</span>
                    </td>
                    {isEditable && (
                      <td className="py-3 pl-3 text-right">
                        <button onClick={() => deleteLineItem(item.id)}
                          className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-xs">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {isEditable && (
              <button onClick={addLineItem}
                className="mt-4 text-sm text-neutral-500 hover:text-black transition flex items-center gap-2">
                <span className="w-5 h-5 rounded-full border border-neutral-300 flex items-center justify-center text-xs">+</span>
                Add line item
              </button>
            )}
          </div>

          {/* Totals */}
          <div className="px-10 pb-8">
            <div className="ml-auto w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-medium">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">
                  Tax
                  {isEditable ? (
                    <span className="ml-2">
                      (<input type="number" value={(taxRate * 100).toFixed(1)} min={0} max={100} step={0.5}
                        onChange={(e) => setTaxRate((parseFloat(e.target.value) || 0) / 100)}
                        className="w-12 text-center border border-neutral-200 rounded-lg px-1 py-0.5 text-xs focus:outline-none" />%)
                    </span>
                  ) : (
                    <span className="text-neutral-400"> ({(taxRate * 100).toFixed(1)}%)</span>
                  )}
                </span>
                <span className="font-medium">{fmtMoney(taxAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3 mt-1">
                <span className="font-bold text-neutral-900 text-base">Estimate Total</span>
                <span className="font-bold text-neutral-900 text-xl">{fmtMoney(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="px-10 pb-8 border-t border-neutral-100 pt-6">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Notes</p>
            {isEditable ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Scope notes, terms, or anything the client should know…"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10" />
            ) : (
              <p className="text-sm text-neutral-600 whitespace-pre-line">{notes || '—'}</p>
            )}
          </div>

          {/* Convert CTA — inside document too */}
          {(quote.status === 'accepted' || quote.status === 'sent' || quote.status === 'draft') && !isConverted && (
            <div className="px-10 pb-8">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Ready to invoice?</p>
                  <p className="text-xs text-amber-700 mt-0.5">All line items will carry over — no re-entry needed.</p>
                </div>
                <button onClick={convertToInvoice} disabled={converting}
                  className="text-sm font-semibold px-5 py-2.5 bg-black text-white rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 whitespace-nowrap">
                  {converting ? 'Converting…' : '◆ Convert to Invoice'}
                </button>
              </div>
            </div>
          )}

          {/* Converted notice */}
          {isConverted && quote.converted_invoice_id && (
            <div className="px-10 pb-8">
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                <p className="text-sm text-neutral-600">This quote has been converted to an invoice.</p>
                <button onClick={() => router.push(`/dashboard/admin/invoices/${quote.converted_invoice_id}`)}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900 underline transition whitespace-nowrap">
                  View Invoice →
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-neutral-50 border-t border-neutral-100 px-10 py-5 flex items-center justify-between">
            <p className="text-xs text-neutral-400">Unless Creative · Calgary, AB · hello@unlesscreative.com</p>
            <p className="text-xs text-neutral-300">This is a quote, not a payment request.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
