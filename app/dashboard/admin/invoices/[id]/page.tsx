'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type LineItem = {
  id: string; description: string; quantity: number; unit_price_cents: number; sort_order: number
}
type Invoice = {
  id: string; invoice_number: string | null; status: string
  bill_to_name: string | null; bill_to_email: string | null
  bill_to_position: string | null; bill_to_address: string | null
  due_date: string | null; paid_at: string | null; notes: string | null
  tax_rate: number; amount_cents: number | null; amount: number | null
  is_deposit: boolean; checkout_url: string | null; quote_id: string | null
  project_name: string | null; business_name: string | null
  created_at: string; updated_at: string | null
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_STYLE: Record<string, string> = {
  draft:   'bg-neutral-100 text-neutral-600',
  sent:    'bg-blue-50 text-blue-700',
  paid:    'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // editing
  const [billToName, setBillToName]       = useState('')
  const [billToEmail, setBillToEmail]     = useState('')
  const [billToPosition, setBillToPosition] = useState('')
  const [billToAddress, setBillToAddress] = useState('')
  const [dueDate, setDueDate]             = useState('')
  const [notes, setNotes]                 = useState('')
  const [taxRate, setTaxRate]             = useState(0)

  useEffect(() => {
    const load = async () => {
      const [{ data: inv }, { data: items }] = await Promise.all([
        supabase.from('invoices').select(`*,projects:project_id(name),profiles:client_id(business_name)`).eq('id', id).single(),
        supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order'),
      ])
      if (inv) {
        const project_name = (Array.isArray(inv.projects) ? inv.projects[0] : inv.projects)?.name ?? null
        const business_name = (Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles)?.business_name ?? null
        setInvoice({ ...inv, project_name, business_name })
        setBillToName(inv.bill_to_name ?? '')
        setBillToEmail(inv.bill_to_email ?? '')
        setBillToPosition(inv.bill_to_position ?? '')
        setBillToAddress(inv.bill_to_address ?? '')
        setDueDate(inv.due_date ?? '')
        setNotes(inv.notes ?? '')
        setTaxRate(Number(inv.tax_rate ?? 0))
      }
      setLineItems(items ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  // ── Computed totals ──
  const subtotal = lineItems.reduce((s, i) => s + Math.round(i.quantity * i.unit_price_cents), 0)
  const taxAmount = Math.round(subtotal * taxRate)
  const total = subtotal + taxAmount

  // ── Line item helpers ──
  const addLineItem = async () => {
    const { data } = await supabase.from('invoice_line_items').insert({
      invoice_id: id, description: '', quantity: 1, unit_price_cents: 0, sort_order: lineItems.length,
    }).select('*').single()
    if (data) setLineItems((p) => [...p, data])
  }

  const updateLineItem = useCallback((itemId: string, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) => prev.map((li) => li.id === itemId ? { ...li, [field]: value } : li))
  }, [])

  const saveLineItem = useCallback(async (item: LineItem) => {
    await supabase.from('invoice_line_items').update({
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
    }).eq('id', item.id)
    // keep totals in sync on invoice
    const newSubtotal = lineItems.reduce((s, i) => s + Math.round(i.quantity * i.unit_price_cents), 0)
    const newTotal = newSubtotal + Math.round(newSubtotal * taxRate)
    await supabase.from('invoices').update({ amount_cents: newTotal, amount: newTotal, updated_at: new Date().toISOString() }).eq('id', id)
  }, [lineItems, taxRate, id])

  const deleteLineItem = async (itemId: string) => {
    setLineItems((p) => p.filter((li) => li.id !== itemId))
    await supabase.from('invoice_line_items').delete().eq('id', itemId)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('invoices').update({
      bill_to_name:     billToName.trim() || null,
      bill_to_email:    billToEmail.trim() || null,
      bill_to_position: billToPosition.trim() || null,
      bill_to_address:  billToAddress.trim() || null,
      due_date:         dueDate || null,
      notes:            notes.trim() || null,
      tax_rate:         taxRate,
      amount_cents:     total,
      amount:           total,
      updated_at:       new Date().toISOString(),
    }).eq('id', id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
    setInvoice((p) => p ? { ...p, bill_to_name: billToName, bill_to_email: billToEmail, tax_rate: taxRate } : p)
  }

  const markSent = async () => {
    await supabase.from('invoices').update({ status: 'sent', is_published: true, updated_at: new Date().toISOString() }).eq('id', id)
    setInvoice((p) => p ? { ...p, status: 'sent' } : p)
  }

  const markPaid = async () => {
    const now = new Date().toISOString()
    await supabase.from('invoices').update({ status: 'paid', paid_at: now, updated_at: now }).eq('id', id)
    setInvoice((p) => p ? { ...p, status: 'paid', paid_at: now } : p)
  }

  const deleteInvoice = async () => {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('invoices').delete().eq('id', id)
    router.push('/dashboard/admin/invoices')
  }

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading invoice…</div>
  if (!invoice) return <div className="p-8 text-red-400 text-sm">Invoice not found.</div>

  const isEditable = invoice.status === 'draft'

  return (
    <div className="min-h-screen bg-neutral-100 pb-32">

      {/* Top bar */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button onClick={() => router.push('/dashboard/admin/invoices')}
            className="text-sm text-neutral-500 hover:text-black transition flex items-center gap-1">
            ← Billing
          </button>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_STYLE[invoice.status] ?? STATUS_STYLE['draft']}`}>
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </span>
            {isEditable && (
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-medium px-4 py-2 bg-black text-white rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            )}
            {invoice.status === 'draft' && (
              <button onClick={markSent}
                className="text-sm font-medium px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl hover:border-black hover:text-black transition">
                Mark Sent
              </button>
            )}
            {invoice.status === 'sent' && (
              <button onClick={markPaid}
                className="text-sm font-medium px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition">
                Mark Paid
              </button>
            )}
            <button onClick={deleteInvoice}
              className="text-xs text-neutral-400 hover:text-red-600 transition px-2">
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Invoice document */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden">

          {/* Invoice header */}
          <div className="bg-black px-10 py-8 flex items-start justify-between gap-8">
            <div>
              <p className="text-white text-2xl font-bold tracking-tight">Unless Creative</p>
              <p className="text-neutral-400 text-sm mt-1">Brand Strategy Consultancy</p>
              <p className="text-neutral-500 text-xs mt-3">Calgary, AB</p>
              <p className="text-neutral-500 text-xs">admin@unlesscreative.com</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-400 text-xs uppercase tracking-widest font-medium">
                {invoice.is_deposit ? 'Deposit Invoice' : 'Invoice'}
              </p>
              <p className="text-[#F04D3D] text-3xl font-bold mt-1">{invoice.invoice_number ?? 'Draft'}</p>
              <div className="mt-4 space-y-1 text-right">
                <div className="flex items-center justify-end gap-3">
                  <span className="text-neutral-500 text-xs">Issue Date</span>
                  <span className="text-neutral-300 text-xs">{fmtDate(invoice.created_at)}</span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <span className="text-neutral-500 text-xs">Due Date</span>
                  {isEditable ? (
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                      className="bg-neutral-800 text-neutral-300 text-xs border border-neutral-700 rounded-lg px-2 py-1 focus:outline-none focus:border-[#F04D3D]" />
                  ) : (
                    <span className="text-neutral-300 text-xs">{fmtDate(dueDate)}</span>
                  )}
                </div>
                {invoice.status === 'paid' && (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-neutral-500 text-xs">Paid</span>
                    <span className="text-green-400 text-xs font-medium">{fmtDate(invoice.paid_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bill To / Project */}
          <div className="px-10 py-8 grid sm:grid-cols-2 gap-8 border-b border-neutral-100">
            {/* Bill To */}
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Bill To</p>
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

            {/* Project info */}
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Project</p>
              <div className="space-y-1">
                {invoice.project_name && (
                  <p className="font-semibold text-neutral-900">{invoice.project_name}</p>
                )}
                {invoice.business_name && (
                  <p className="text-sm text-neutral-500">{invoice.business_name}</p>
                )}
                {invoice.quote_id && (
                  <p className="text-xs text-[#F04D3D] mt-2">Converted from quote</p>
                )}
                {!invoice.project_name && <p className="text-sm text-neutral-400">No project linked</p>}
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
                          placeholder="Line item description…"
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
                <span className="font-bold text-neutral-900 text-base">Total</span>
                <span className="font-bold text-neutral-900 text-xl">{fmtMoney(total)}</span>
              </div>
              {invoice.status === 'paid' && (
                <div className="flex items-center justify-between text-green-600 text-sm font-medium pt-1">
                  <span>Amount Paid</span>
                  <span>{fmtMoney(total)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="px-10 pb-8 border-t border-neutral-100 pt-6">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Notes</p>
            {isEditable ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Payment terms, thank-you note, or any other details…"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10" />
            ) : (
              <p className="text-sm text-neutral-600 whitespace-pre-line">{notes || '—'}</p>
            )}
          </div>

          {/* Payment link */}
          {invoice.checkout_url && (
            <div className="px-10 pb-8">
              <a href={invoice.checkout_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#F04D3D] bg-[#F04D3D]/5 border border-[#F04D3D]/20 px-4 py-2 rounded-xl hover:bg-[#F04D3D]/10 transition">
                Pay Now →
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="bg-neutral-50 border-t border-neutral-100 px-10 py-5 flex items-center justify-between">
            <p className="text-xs text-neutral-400">Unless Creative · Calgary, AB · admin@unlesscreative.com</p>
            <p className="text-xs text-neutral-300">Thank you for your business.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
