'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string; business_name: string | null; name: string | null
  position: string | null; email: string | null; phone: string | null
  address: string | null; role: string | null
}
type Contact = {
  id: string; client_id: string; name: string | null; position: string | null
  email: string | null; phone: string | null; is_primary: boolean; created_at: string
}
type Project = {
  id: string; name: string; client_id: string | null
  project_type: string | null; created_at: string
}
type Invoice = {
  id: string; invoice_number: string | null; amount: number
  amount_cents: number | null; status: string; client_id: string | null
}

const TYPE_PIP: Record<string, string> = {
  'Brand Alignment Intensive':  'bg-amber-400',
  'Brand System Build':         'bg-stone-400',
  'Brand Stewardship Retainer': 'bg-neutral-400',
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)

function initials(name: string | null, biz: string | null) {
  const src = biz ?? name ?? '?'
  return src.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function AccountsPage() {
  const router = useRouter()
  const [clients, setClients]   = useState<Client[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: cData }, { data: ctData }, { data: pData }, { data: iData }] = await Promise.all([
        supabase.from('profiles').select('id,business_name,name,position,email,phone,address,role').order('business_name'),
        supabase.from('client_contacts').select('id,client_id,name,position,email,phone,is_primary,created_at').order('is_primary', { ascending: false }).order('created_at'),
        supabase.from('projects').select('id,name,client_id,project_type,created_at').order('created_at', { ascending: false }),
        supabase.from('invoices').select('id,invoice_number,amount,amount_cents,status,client_id').in('status', ['draft','sent']),
      ])
      setClients((cData ?? []) as Client[])
      setContacts((ctData ?? []) as Contact[])
      setProjects((pData ?? []) as Project[])
      setInvoices((iData ?? []) as Invoice[])
      setLoading(false)
    }
    load()
  }, [])

  const clientsOnly = useMemo(() =>
    clients.filter((c) => (c.role ?? 'client') === 'client') || clients
  , [clients])

  const contactsByClient = useMemo(() => {
    const m = new Map<string, Contact[]>()
    contacts.forEach((c) => { if (c.client_id) m.set(c.client_id, [...(m.get(c.client_id) ?? []), c]) })
    return m
  }, [contacts])

  const projectsByClient = useMemo(() => {
    const m = new Map<string, Project[]>()
    projects.forEach((p) => { if (p.client_id) m.set(p.client_id, [...(m.get(p.client_id) ?? []), p]) })
    return m
  }, [projects])

  const invoicesByClient = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    invoices.forEach((i) => { if (i.client_id) m.set(i.client_id, [...(m.get(i.client_id) ?? []), i]) })
    return m
  }, [invoices])

  const filtered = useMemo(() => {
    if (!search.trim()) return clientsOnly
    const q = search.toLowerCase()
    return clientsOnly.filter((c) =>
      (c.business_name ?? '').toLowerCase().includes(q) ||
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  }, [clientsOnly, search])

  if (loading) return <div className="p-8 text-neutral-400 text-sm">Loading accounts…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">

      {/* Header */}
      <div className="bg-black px-6 pt-10 pb-8">
        <div className="max-w-5xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-1">Unless Creative</p>
            <h1 className="text-3xl font-bold text-white">Accounts</h1>
            <p className="text-neutral-500 text-sm mt-1">
              {clientsOnly.length === 0 ? 'No clients yet' : `${clientsOnly.length} client${clientsOnly.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button onClick={() => router.push('/dashboard/admin/accounts/new')}
            className="text-sm font-medium px-5 py-2.5 bg-amber-400 text-black rounded-xl hover:bg-amber-300 transition shrink-0">
            + New Client
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-6 space-y-4">

        {/* Search */}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full sm:w-72 text-sm border border-neutral-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/10 bg-white" />

        {filtered.length === 0 ? (
          <div className="border border-dashed border-neutral-200 rounded-2xl p-16 text-center">
            <p className="text-neutral-400 text-sm">
              {search ? `No results for "${search}"` : 'No clients yet — add your first one.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const clientContacts = contactsByClient.get(c.id) ?? []
              const primary = clientContacts.find((x) => x.is_primary) ?? clientContacts[0] ?? null
              const clientProjects = projectsByClient.get(c.id) ?? []
              const clientInvoices = invoicesByClient.get(c.id) ?? []
              const isOpen = expanded === c.id
              const outstandingTotal = clientInvoices.reduce((s, i) => s + (i.amount_cents ?? i.amount ?? 0), 0)

              return (
                <div key={c.id} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden transition-all">

                  {/* Client row */}
                  <div className="px-6 py-5 flex items-center gap-5 cursor-pointer hover:bg-neutral-50 transition"
                    onClick={() => setExpanded(isOpen ? null : c.id)}>

                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {initials(c.name, c.business_name)}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900">{c.business_name ?? c.name ?? '—'}</p>
                      <p className="text-sm text-neutral-400 truncate">
                        {primary?.name ?? c.name ?? ''}
                        {(primary?.position ?? c.position) ? ` · ${primary?.position ?? c.position}` : ''}
                        {(primary?.email ?? c.email) ? ` · ${primary?.email ?? c.email}` : ''}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-6 shrink-0">
                      {clientProjects.length > 0 && (
                        <div className="text-center">
                          <p className="text-lg font-bold text-neutral-900">{clientProjects.length}</p>
                          <p className="text-xs text-neutral-400">project{clientProjects.length !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      {clientInvoices.length > 0 && (
                        <div className="text-center">
                          <p className="text-lg font-bold text-amber-500">{fmtMoney(outstandingTotal)}</p>
                          <p className="text-xs text-neutral-400">outstanding</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/admin/accounts/${c.id}`) }}
                        className="text-xs font-medium px-3 py-1.5 border border-neutral-200 rounded-lg hover:border-black hover:text-black text-neutral-500 transition">
                        Manage
                      </button>
                      <span className={`text-neutral-400 text-xs transition ${isOpen ? 'rotate-180' : ''} inline-block`}>▼</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-neutral-100 px-6 py-5 grid sm:grid-cols-2 gap-6 bg-neutral-50">

                      {/* Contact info */}
                      <div>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Contact</p>
                        <div className="space-y-1.5 text-sm">
                          {(primary?.email ?? c.email) && (
                            <a href={`mailto:${primary?.email ?? c.email}`}
                              className="flex items-center gap-2 text-neutral-700 hover:text-black transition">
                              <span className="text-neutral-300 w-4">✉</span>
                              {primary?.email ?? c.email}
                            </a>
                          )}
                          {(primary?.phone ?? c.phone) && (
                            <p className="flex items-center gap-2 text-neutral-700">
                              <span className="text-neutral-300 w-4">☎</span>
                              {primary?.phone ?? c.phone}
                            </p>
                          )}
                          {c.address && (
                            <p className="flex items-start gap-2 text-neutral-500">
                              <span className="text-neutral-300 w-4 mt-0.5">⌖</span>
                              <span className="whitespace-pre-line">{c.address}</span>
                            </p>
                          )}
                          {clientContacts.length > 1 && (
                            <p className="text-xs text-neutral-400 pt-1">
                              + {clientContacts.length - 1} additional contact{clientContacts.length - 1 !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Projects */}
                      <div>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Projects</p>
                        {clientProjects.length === 0 ? (
                          <p className="text-sm text-neutral-400">No projects yet</p>
                        ) : (
                          <div className="space-y-2">
                            {clientProjects.slice(0, 4).map((p) => (
                              <button key={p.id} onClick={() => router.push(`/dashboard/admin/projects/${p.id}`)}
                                className="w-full text-left flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl hover:border-neutral-400 transition group">
                                <div className={`w-1.5 h-6 rounded-full shrink-0 ${TYPE_PIP[p.project_type ?? ''] ?? 'bg-neutral-200'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-neutral-800 group-hover:text-black truncate">{p.name}</p>
                                  {p.project_type && <p className="text-xs text-neutral-400 truncate">{p.project_type}</p>}
                                </div>
                                <span className="text-neutral-300 group-hover:text-neutral-500 text-xs shrink-0">→</span>
                              </button>
                            ))}
                            {clientProjects.length > 4 && (
                              <p className="text-xs text-neutral-400">+ {clientProjects.length - 4} more</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Outstanding invoices */}
                      {clientInvoices.length > 0 && (
                        <div className="sm:col-span-2">
                          <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Outstanding</p>
                          <div className="flex gap-3 flex-wrap">
                            {clientInvoices.map((inv) => (
                              <button key={inv.id} onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                                className="flex items-center gap-3 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-400 transition text-sm">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inv.status === 'sent' ? 'bg-blue-400' : 'bg-neutral-300'}`} />
                                <span className="font-mono text-xs text-neutral-500">{inv.invoice_number ?? 'Draft'}</span>
                                <span className="font-semibold text-neutral-900">{fmtMoney(inv.amount_cents ?? inv.amount ?? 0)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
