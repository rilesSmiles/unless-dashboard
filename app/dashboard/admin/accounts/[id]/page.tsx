'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Client  = { id: string; business_name: string | null; name: string | null; position: string | null; email: string | null; phone: string | null; address: string | null; role: string | null }
type Contact = { id: string; client_id: string; name: string | null; position: string | null; email: string | null; phone: string | null; is_primary: boolean; created_at: string }
type Project = { id: string; name: string; client_id: string | null; project_type: string | null; created_at: string }
type Invoice = { id: string; invoice_number: string | null; amount: number; amount_cents: number | null; status: string; created_at: string; client_id: string | null }

const TYPE_PIP: Record<string, string> = {
  'Brand Alignment Intensive':  'bg-[#F04D3D]',
  'Brand System Build':         'bg-stone-400',
  'Brand Stewardship Retainer': 'bg-neutral-400',
}

const STATUS_STYLE: Record<string, string> = {
  draft:   'bg-neutral-100 text-neutral-600',
  sent:    'bg-blue-50 text-blue-700',
  paid:    'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white" />
    </div>
  )
}

export default function AdminAccountDetailPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const router = useRouter()

  const [client, setClient]   = useState<Client | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddContact, setShowAddContact]       = useState(false)
  const [editingContact, setEditingContact]       = useState<Contact | null>(null)
  const [deletingClient, setDeletingClient]       = useState(false)
  const [busyContactId, setBusyContactId]         = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: ctData }, { data: pData }, { data: iData }] = await Promise.all([
        supabase.from('profiles').select('id,business_name,name,position,email,phone,address,role').eq('id', clientId).single(),
        supabase.from('client_contacts').select('id,client_id,name,position,email,phone,is_primary,created_at').eq('client_id', clientId).order('is_primary', { ascending: false }).order('created_at'),
        supabase.from('projects').select('id,name,client_id,project_type,created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('invoices').select('id,invoice_number,amount,amount_cents,status,created_at,client_id').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])
      setClient(c as Client ?? null)
      setContacts((ctData ?? []) as Contact[])
      setProjects((pData ?? []) as Project[])
      setInvoices((iData ?? []) as Invoice[])
      setLoading(false)
    }
    load()
  }, [clientId])

  const primary = useMemo(() => contacts.find((c) => c.is_primary) ?? contacts[0] ?? null, [contacts])
  const outstanding = invoices.filter((i) => i.status === 'draft' || i.status === 'sent')
  const paid = invoices.filter((i) => i.status === 'paid')
  const totalPaid = paid.reduce((s, i) => s + (i.amount_cents ?? i.amount ?? 0), 0)
  const totalOwed = outstanding.reduce((s, i) => s + (i.amount_cents ?? i.amount ?? 0), 0)

  const deleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return
    setBusyContactId(contactId)
    await supabase.from('client_contacts').delete().eq('id', contactId)
    setBusyContactId(null)
    setContacts((p) => p.filter((c) => c.id !== contactId))
  }

  const deleteClient = async () => {
    if (!client) return
    const typed = prompt(`Type DELETE to permanently remove ${client.business_name ?? 'this client'}`)
    if (typed !== 'DELETE') return
    setDeletingClient(true)

    try {
      const res = await fetch('/api/clients/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error ?? 'Failed to delete client')
        setDeletingClient(false)
        return
      }
      router.push('/dashboard/admin/accounts')
    } catch (e: any) {
      alert(e?.message ?? 'Request failed')
      setDeletingClient(false)
    }
  }

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading account…</div>
  if (!client) return <div className="p-8 text-red-400 text-sm">Client not found.</div>

  const displayName = client.business_name ?? primary?.name ?? client.name ?? 'Client'

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* Header */}
      <div className="px-6 pt-8 pb-0" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 55%)' }}>
        <div className="max-w-5xl mx-auto">
          <button onClick={() => router.push('/dashboard/admin/accounts')}
            className="text-[#7EC8A0] hover:text-white text-sm transition mb-4 flex items-center gap-1">
            ← Accounts
          </button>
          <div className="flex items-end justify-between gap-4 pb-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 text-white flex items-center justify-center text-lg font-bold shrink-0">
                {displayName.split(' ').map((w) => w[0]).slice(0,2).join('').toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-mono text-[#7EC8A0] uppercase tracking-widest mb-1">Client</p>
                <h1 className="text-2xl text-white leading-tight">{displayName}</h1>
                <p className="text-neutral-400 text-sm mt-0.5">
                  {primary?.name ?? client.name ?? ''}
                  {(primary?.position ?? client.position) ? ` · ${primary?.position ?? client.position}` : ''}
                </p>
              </div>
            </div>
            {/* Stats */}
            <div className="hidden sm:flex items-center gap-6 pb-1">
              <div className="text-right">
                <p className="text-xl font-bold text-[#F04D3D]">{fmtMoney(totalOwed)}</p>
                <p className="text-xs text-neutral-400">outstanding</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-green-400">{fmtMoney(totalPaid)}</p>
                <p className="text-xs text-neutral-400">collected</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{projects.length}</p>
                <p className="text-xs text-neutral-400">project{projects.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-5">

        {/* Top row: profile + projects + invoices */}
        <div className="grid md:grid-cols-3 gap-5">

          {/* Profile */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-neutral-900">Profile</h2>
            <div className="space-y-2 text-sm">
              {client.business_name && (
                <div className="flex justify-between gap-2">
                  <span className="text-neutral-400">Company</span>
                  <span className="font-medium text-neutral-900 text-right">{client.business_name}</span>
                </div>
              )}
              {(primary?.email ?? client.email) && (
                <div className="flex justify-between gap-2">
                  <span className="text-neutral-400">Email</span>
                  <a href={`mailto:${primary?.email ?? client.email}`}
                    className="font-medium text-neutral-900 hover:text-black text-right truncate max-w-[180px]">
                    {primary?.email ?? client.email}
                  </a>
                </div>
              )}
              {(primary?.phone ?? client.phone) && (
                <div className="flex justify-between gap-2">
                  <span className="text-neutral-400">Phone</span>
                  <span className="font-medium text-neutral-900">{primary?.phone ?? client.phone}</span>
                </div>
              )}
              {client.address && (
                <div className="flex justify-between gap-2">
                  <span className="text-neutral-400 shrink-0">Address</span>
                  <span className="font-medium text-neutral-900 text-right whitespace-pre-line">{client.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Projects */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">Projects</h2>
              <button onClick={() => router.push(`/dashboard/admin/projects/new?clientId=${clientId}`)}
                className="text-xs font-medium px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition">+ New</button>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-neutral-400">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((p) => (
                  <button key={p.id} onClick={() => router.push(`/dashboard/admin/projects/${p.id}`)}
                    className="w-full text-left flex items-center gap-3 p-3 border border-neutral-100 rounded-xl hover:border-neutral-300 transition group">
                    <div className={`w-1.5 h-6 rounded-full shrink-0 ${TYPE_PIP[p.project_type ?? ''] ?? 'bg-neutral-200'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate group-hover:text-black">{p.name}</p>
                      {p.project_type && <p className="text-xs text-neutral-400 truncate">{p.project_type}</p>}
                    </div>
                  </button>
                ))}
                {projects.length > 5 && <p className="text-xs text-neutral-400">+ {projects.length - 5} more</p>}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">Invoices</h2>
              <button onClick={() => router.push(`/dashboard/admin/invoices?clientId=${clientId}&openNew=1`)}
                className="text-xs font-medium px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition">+ New</button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-sm text-neutral-400">No invoices yet 🎉</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 6).map((inv) => (
                  <button key={inv.id} onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                    className="w-full text-left flex items-center justify-between gap-3 p-3 border border-neutral-100 rounded-xl hover:border-neutral-300 transition">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{inv.invoice_number ?? 'Draft'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[inv.status] ?? STATUS_STYLE['draft']}`}>
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-neutral-900 shrink-0">
                      {fmtMoney(inv.amount_cents ?? inv.amount ?? 0)}
                    </p>
                  </button>
                ))}
                {invoices.length > 6 && <p className="text-xs text-neutral-400">+ {invoices.length - 6} more</p>}
              </div>
            )}
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-neutral-900">Contacts</h2>
              <p className="text-sm text-neutral-400 mt-0.5">Multiple people at this organization.</p>
            </div>
            <button onClick={() => setShowAddContact(true)}
              className="text-sm font-medium px-4 py-2 bg-black text-white rounded-xl hover:bg-neutral-800 transition">
              + Add Contact
            </button>
          </div>

          {contacts.length === 0 ? (
            <p className="text-sm text-neutral-400">No contacts yet</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {contacts.map((c) => (
                <div key={c.id} className="group flex items-start justify-between gap-4 p-4 border border-neutral-100 rounded-xl hover:border-neutral-200 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {(c.name ?? '?').split(' ').map((w) => w[0]).slice(0,2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900">{c.name ?? '—'}</p>
                        {c.is_primary && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#1A3428]/10 text-[#1A3428] font-medium">Primary</span>
                        )}
                      </div>
                      {c.position && <p className="text-xs text-neutral-400">{c.position}</p>}
                      {c.email && <p className="text-xs text-neutral-500 mt-0.5">{c.email}</p>}
                      {c.phone && <p className="text-xs text-neutral-500">{c.phone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button onClick={() => setEditingContact(c)}
                      className="text-xs border border-neutral-200 px-2.5 py-1 rounded-lg hover:border-black transition">Edit</button>
                    <button onClick={() => deleteContact(c.id)} disabled={busyContactId === c.id}
                      className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-lg hover:border-red-400 transition disabled:opacity-50">
                      {busyContactId === c.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6">
          <h2 className="font-semibold text-neutral-900 mb-1">Danger Zone</h2>
          <p className="text-sm text-neutral-400 mb-4">Permanently remove this client and all associated contacts. Projects and invoices will remain.</p>
          <button onClick={deleteClient} disabled={deletingClient}
            className="text-sm font-medium px-4 py-2 border border-red-300 text-red-600 rounded-xl hover:border-red-500 hover:bg-red-50 transition disabled:opacity-50">
            {deletingClient ? 'Deleting…' : `Delete ${client.business_name ?? 'client'}`}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showAddContact && (
        <ContactModal
          mode="add" clientId={clientId}
          onClose={() => setShowAddContact(false)}
          onSaved={(c) => { setContacts((p) => [c, ...p]); setShowAddContact(false) }}
        />
      )}
      {editingContact && (
        <ContactModal
          mode="edit" contact={editingContact} clientId={clientId}
          onClose={() => setEditingContact(null)}
          onSaved={(c) => { setContacts((p) => p.map((x) => x.id === c.id ? c : x)); setEditingContact(null) }}
        />
      )}
    </div>
  )
}

// ─── Contact Modal ──────────────────────────────────────────────────────────────
function ContactModal({ mode, clientId, contact, onClose, onSaved }: {
  mode: 'add' | 'edit'; clientId: string; contact?: Contact
  onClose: () => void; onSaved: (c: Contact) => void
}) {
  const [name, setName]           = useState(contact?.name ?? '')
  const [position, setPosition]   = useState(contact?.position ?? '')
  const [email, setEmail]         = useState(contact?.email ?? '')
  const [phone, setPhone]         = useState(contact?.phone ?? '')
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const save = async () => {
    setError(null)
    if (!email.trim() && !name.trim()) { setError('Add at least a name or email.'); return }
    setSaving(true)

    if (isPrimary) {
      await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', clientId)
    }

    const payload = {
      client_id: clientId,
      name: name.trim() || null, position: position.trim() || null,
      email: email.trim() || null, phone: phone.trim() || null, is_primary: isPrimary,
    }

    const { data, error: err } = mode === 'add'
      ? await supabase.from('client_contacts').insert(payload).select('id,client_id,name,position,email,phone,is_primary,created_at').single()
      : await supabase.from('client_contacts').update(payload).eq('id', contact!.id).select('id,client_id,name,position,email,phone,is_primary,created_at').single()

    setSaving(false)
    if (err || !data) { setError('Failed to save contact.'); return }
    onSaved(data as Contact)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="font-bold text-neutral-900 text-lg">{mode === 'add' ? 'Add Contact' : 'Edit Contact'}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-black text-sm">✕</button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
          <Field label="Position" value={position} onChange={setPosition} placeholder="CEO" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="jane@co.com" type="email" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 403…" type="tel" />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div onClick={() => setIsPrimary((p) => !p)}
            className={`w-10 h-6 rounded-full transition ${isPrimary ? 'bg-black' : 'bg-neutral-200'} relative`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${isPrimary ? 'left-5' : 'left-1'}`} />
          </div>
          <span className="text-sm text-neutral-700">Set as primary contact</span>
        </label>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-neutral-200 text-neutral-600 text-sm py-2.5 rounded-xl hover:border-neutral-400 transition">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 bg-black text-white text-sm py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50">
            {saving ? 'Saving…' : mode === 'add' ? 'Add Contact' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
