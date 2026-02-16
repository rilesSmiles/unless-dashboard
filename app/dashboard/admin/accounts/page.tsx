// app/dashboard/admin/accounts/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  business_name: string | null
  name: string | null
  position: string | null
  email: string | null
  phone: string | null
  address: string | null
  role: string | null
}

type Project = {
  id: string
  name: string
  client_id: string | null
  project_type: string | null
  created_at: string
}

type Invoice = {
  id: string
  invoice_number: string | null
  amount: number
  status: 'draft' | 'sent' | 'paid'
  created_at: string
  client_id: string | null
  project_id: string | null
}

export default function AccountsPage() {
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // 1) Clients
      const { data: clientData, error: clientErr } = await supabase
        .from('profiles')
        .select('id, business_name, name, position, email, phone, address, role')
        .order('business_name', { ascending: true })

      if (clientErr) console.error('Load clients error:', clientErr)

      // 2) Projects
      const { data: projectData, error: projectErr } = await supabase
  .from('projects')
  .select('id, name, client_id, created_at')
  .order('created_at', { ascending: false })

      if (projectErr) {
  console.error('Load projects error:', projectErr)
  console.error('Load projects error JSON:', JSON.stringify(projectErr))
}

      // 3) Invoices (only outstanding)
      const { data: invoiceData, error: invoiceErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, status, created_at, client_id, project_id')
        .in('status', ['draft', 'sent'])
        .order('created_at', { ascending: false })

      if (invoiceErr) console.error('Load invoices error:', invoiceErr)

      setClients((clientData || []) as Client[])
      setProjects((projectData || []) as Project[])
      setInvoices((invoiceData || []) as Invoice[])
      setLoading(false)
    }

    load()
  }, [])

  const clientsOnly = useMemo(() => {
    // If you use roles: filter to clients (otherwise remove this filter)
    const list = clients.filter((c) => (c.role ?? 'client') === 'client')

    // If you have clients without role set yet, they’d get filtered out—this keeps them
    return list.length ? list : clients
  }, [clients])

  const projectsByClient = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of projects) {
      if (!p.client_id) continue
      const arr = map.get(p.client_id) ?? []
      arr.push(p)
      map.set(p.client_id, arr)
    }
    return map
  }, [projects])

  const invoicesByClient = useMemo(() => {
    const map = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      if (!inv.client_id) continue
      const arr = map.get(inv.client_id) ?? []
      arr.push(inv)
      map.set(inv.client_id, arr)
    }
    return map
  }, [invoices])

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Clients, invoices, projects — all in one place.
          </p>
        </div>

        <button
          onClick={() => router.push('/dashboard/admin/accounts/new')}
          className="bg-black text-white px-4 py-2 rounded-lg"
        >
          + New Client
        </button>
      </div>

      {clientsOnly.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center text-gray-400">
          No clients yet ✨
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {clientsOnly.map((c) => {
            const clientProjects = projectsByClient.get(c.id) ?? []
            const clientInvoices = invoicesByClient.get(c.id) ?? []

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4"
              >
                {/* Header */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {c.business_name ?? 'Client'}
                    </h2>
                    <p className="text-sm text-neutral-400">
                      {c.name ?? '—'}
                      {c.position ? ` • ${c.position}` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => router.push(`/dashboard/admin/accounts/${c.id}`)}
                    className="text-sm underline text-neutral-300 hover:text-white"
                  >
                    Manage
                  </button>
                </div>

                {/* Contact */}
                <div className="text-sm text-neutral-300 space-y-1">
                  {c.email && <p>Email: <span className="text-neutral-200">{c.email}</span></p>}
                  {c.phone && <p>Phone: <span className="text-neutral-200">{c.phone}</span></p>}
                  {c.address && (
                    <p className="whitespace-pre-line">
                      Address: <span className="text-neutral-200">{c.address}</span>
                    </p>
                  )}
                </div>

                {/* Outstanding invoices */}
                {clientInvoices.length > 0 && (
                  <div className="pt-2 border-t border-neutral-800">
                    <h3 className="font-semibold text-sm text-white mb-2">
                      Outstanding invoices
                    </h3>

                    <div className="space-y-2">
                      {clientInvoices.slice(0, 5).map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                          className="w-full text-left flex justify-between items-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 hover:border-neutral-600 transition"
                        >
                          <div>
                            <p className="text-sm text-white">
                              {inv.invoice_number ?? 'Draft Invoice'}
                            </p>
                            <p className="text-xs text-neutral-400 uppercase">
                              {inv.status}
                            </p>
                          </div>

                          <p className="text-sm text-neutral-200">
                            ${(inv.amount / 100).toFixed(2)}
                          </p>
                        </button>
                      ))}

                      {clientInvoices.length > 5 && (
                        <p className="text-xs text-neutral-500">
                          + {clientInvoices.length - 5} more…
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Projects */}
                <div className="pt-2 border-t border-neutral-800">
                  <h3 className="font-semibold text-sm text-white mb-2">
                    Projects
                  </h3>

                  {clientProjects.length === 0 ? (
                    <p className="text-sm text-neutral-500">No projects yet</p>
                  ) : (
                    <div className="space-y-2">
                      {clientProjects.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => router.push(`/dashboard/admin/projects/${p.id}`)}
                          className="w-full text-left rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 hover:border-neutral-600 transition"
                        >
                          <p className="text-sm text-white">{p.name}</p>
                          <p className="text-xs text-neutral-400">
                            {p.project_type ?? '—'}
                          </p>
                        </button>
                      ))}

                      {clientProjects.length > 6 && (
                        <p className="text-xs text-neutral-500">
                          + {clientProjects.length - 6} more…
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}