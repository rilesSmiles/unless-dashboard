'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = { name: string | null; role: string }

type ProjectRow = {
  id: string; name: string; project_type: string | null
  created_at: string; last_viewed_at: string | null
  client_name: string | null; task_total: number; task_done: number
}

type InvoiceRow = {
  id: string; invoice_number: string | null
  amount_cents: number | null; amount: number | null
  status: string; client_name: string | null
}

type QuoteRow = {
  id: string; quote_number: string | null; status: string; client_name: string | null
}

type Stats = {
  totalClients: number; totalProjects: number
  collectedCents: number; outstandingCents: number
  openQuotes: number; activeProjects: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100)

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const fmtDate = () =>
  new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })

const TYPE_PIP: Record<string, string> = {
  'Brand Alignment Intensive':  'bg-amber-400',
  'Brand System Build':         'bg-stone-400',
  'Brand Stewardship Retainer': 'bg-neutral-400',
}

const TYPE_SHORT: Record<string, string> = {
  'Brand Alignment Intensive':  'BAI',
  'Brand System Build':         'BSB',
  'Brand Stewardship Retainer': 'BSR',
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'bg-neutral-100',  text: 'text-neutral-500' },
  sent:      { bg: 'bg-blue-50',      text: 'text-blue-700'    },
  paid:      { bg: 'bg-green-50',     text: 'text-green-700'   },
  accepted:  { bg: 'bg-emerald-50',   text: 'text-emerald-700' },
  converted: { bg: 'bg-amber-50',     text: 'text-amber-700'   },
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter()

  const [profile, setProfile]     = useState<Profile | null>(null)
  const [stats, setStats]         = useState<Stats | null>(null)
  const [projects, setProjects]   = useState<ProjectRow[]>([])
  const [invoices, setInvoices]   = useState<InvoiceRow[]>([])
  const [quotes, setQuotes]       = useState<QuoteRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        // Auth check
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) { router.push('/login'); return }

        const { data: prof, error: profErr } = await supabase
          .from('profiles').select('name, role').eq('id', user.id).single()
        if (profErr || !prof) throw profErr ?? new Error('Profile not found')
        if (prof.role !== 'admin') { router.push('/dashboard/client'); return }

        setProfile(prof)

        // All data in parallel
        const [
          { data: allProjects },
          { data: allInvoices },
          { data: allQuotes },
          { data: clientCount },
        ] = await Promise.all([
          supabase.from('projects')
            .select(`id, name, project_type, created_at, last_viewed_at,
              profiles:client_id(business_name, name),
              project_step_tasks(id, is_done)`)
            .order('last_viewed_at', { ascending: false, nullsFirst: false })
            .limit(20),
          supabase.from('invoices')
            .select(`id, invoice_number, amount, amount_cents, status,
              profiles:client_id(business_name, name)`)
            .in('status', ['draft', 'sent'])
            .order('created_at', { ascending: false })
            .limit(6),
          supabase.from('quotes')
            .select(`id, quote_number, status,
              profiles:client_id(business_name, name)`)
            .in('status', ['draft', 'sent', 'accepted'])
            .order('created_at', { ascending: false })
            .limit(4),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        ])

        // Paid totals
        const { data: paidData } = await supabase
          .from('invoices').select('amount_cents, amount').eq('status', 'paid')
        const { data: sentData } = await supabase
          .from('invoices').select('amount_cents, amount').eq('status', 'sent')

        const collected = (paidData ?? []).reduce((s: number, i: any) => s + (i.amount_cents ?? i.amount ?? 0), 0)
        const outstanding = (sentData ?? []).reduce((s: number, i: any) => s + (i.amount_cents ?? i.amount ?? 0), 0)

        // Shape projects
        const shapedProjects: ProjectRow[] = (allProjects ?? []).map((p: any) => {
          const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
          const tasks: any[] = p.project_step_tasks ?? []
          return {
            id: p.id,
            name: p.name,
            project_type: p.project_type ?? null,
            created_at: p.created_at,
            last_viewed_at: p.last_viewed_at ?? null,
            client_name: prof?.business_name ?? prof?.name ?? null,
            task_total: tasks.length,
            task_done: tasks.filter((t) => t.is_done).length,
          }
        })

        // Shape invoices
        const shapedInvoices: InvoiceRow[] = (allInvoices ?? []).map((i: any) => {
          const pr = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles
          return {
            id: i.id,
            invoice_number: i.invoice_number ?? null,
            amount_cents: i.amount_cents ?? null,
            amount: i.amount ?? null,
            status: i.status,
            client_name: pr?.business_name ?? pr?.name ?? null,
          }
        })

        // Shape quotes
        const shapedQuotes: QuoteRow[] = (allQuotes ?? []).map((q: any) => {
          const pr = Array.isArray(q.profiles) ? q.profiles[0] : q.profiles
          return {
            id: q.id,
            quote_number: q.quote_number ?? null,
            status: q.status,
            client_name: pr?.business_name ?? pr?.name ?? null,
          }
        })

        setProjects(shapedProjects)
        setInvoices(shapedInvoices)
        setQuotes(shapedQuotes)
        setStats({
          totalClients:     (clientCount as any)?.count ?? 0,
          totalProjects:    allProjects?.length ?? 0,
          collectedCents:   collected,
          outstandingCents: outstanding,
          openQuotes:       shapedQuotes.length,
          activeProjects:   allProjects?.length ?? 0,
        })

        setLoading(false)
      } catch (err: any) {
        setError(err?.message ?? 'Something went wrong')
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (loading) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Loading…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <p className="text-red-500 text-sm">{error}</p>
    </div>
  )

  const firstName = profile?.name?.split(' ')[0] ?? 'Riley'
  const recentProjects = projects.slice(0, 6)
  const hasOutstanding = invoices.length > 0 || quotes.length > 0

  return (
    <div className="min-h-screen bg-neutral-50 pb-36">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="bg-black px-6 pt-10 pb-8">
        <div className="max-w-5xl mx-auto">

          {/* Greeting */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest mb-2">{fmtDate()}</p>
              <h1 className="text-3xl font-bold text-white leading-tight">
                {greeting()}, {firstName}.
              </h1>
              <p className="text-neutral-500 text-sm mt-1">Here's where Unless Creative stands today.</p>
            </div>
            <div className="shrink-0 text-right hidden sm:block">
              <p className="text-neutral-600 text-xs font-mono uppercase tracking-widest">Unless Creative</p>
              <p className="text-amber-400 text-xs mt-0.5">◆ HQ</p>
            </div>
          </div>

          {/* Revenue stats */}
          <div className="grid grid-cols-3 gap-3 mt-8">
            <StatCard
              label="Collected"
              value={fmtMoney(stats?.collectedCents ?? 0)}
              sub="total paid"
              accent="text-green-400"
            />
            <StatCard
              label="Outstanding"
              value={fmtMoney(stats?.outstandingCents ?? 0)}
              sub={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
              accent={stats?.outstandingCents ? 'text-amber-400' : 'text-neutral-500'}
            />
            <StatCard
              label="Open Quotes"
              value={String(stats?.openQuotes ?? 0)}
              sub="pending response"
              accent="text-neutral-400"
            />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-6 flex-wrap">
            {[
              { label: '+ New Project',  href: '/dashboard/admin/projects/new',  style: 'bg-amber-400 text-black hover:bg-amber-300' },
              { label: '+ New Quote',    href: '/dashboard/admin/invoices',       style: 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700' },
              { label: '+ New Invoice',  href: '/dashboard/admin/invoices',       style: 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700' },
              { label: '+ New Client',   href: '/dashboard/admin/accounts/new',  style: 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700' },
            ].map(({ label, href, style }) => (
              <button key={label} onClick={() => router.push(href)}
                className={`text-xs font-semibold px-4 py-2 rounded-xl transition ${style}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pt-7 space-y-7">

        {/* ── Active Projects ── */}
        <Section
          title="Active Projects"
          count={projects.length}
          cta="View all"
          onCta={() => router.push('/dashboard/admin/projects')}
        >
          {recentProjects.length === 0 ? (
            <EmptyCard label="No projects yet" cta="Start your first project →" onClick={() => router.push('/dashboard/admin/projects/new')} />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentProjects.map((p) => {
                const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0
                return (
                  <button key={p.id} onClick={() => router.push(`/dashboard/admin/projects/${p.id}`)}
                    className="text-left bg-white border border-neutral-200 rounded-2xl p-5 hover:border-neutral-400 hover:shadow-sm transition group space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-neutral-900 group-hover:text-black text-sm leading-snug truncate">{p.name}</p>
                        <p className="text-xs text-neutral-400 mt-0.5 truncate">{p.client_name ?? 'No client'}</p>
                      </div>
                      {p.project_type && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-mono shrink-0 bg-neutral-100 text-neutral-500`}>
                          {TYPE_SHORT[p.project_type] ?? p.project_type}
                        </span>
                      )}
                    </div>

                    {/* Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${TYPE_PIP[p.project_type ?? ''] ?? 'bg-neutral-300'}`} />
                          <span className="text-xs text-neutral-400">{p.task_done}/{p.task_total} tasks</span>
                        </div>
                        <span className="text-xs font-medium text-neutral-600">{pct}%</span>
                      </div>
                      <div className="w-full h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${TYPE_PIP[p.project_type ?? ''] ?? 'bg-neutral-300'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Billing snapshot ── */}
        {hasOutstanding && (
          <div className="grid sm:grid-cols-2 gap-5">

            {/* Outstanding invoices */}
            {invoices.length > 0 && (
              <Section
                title="Outstanding Invoices"
                count={invoices.length}
                cta="View billing"
                onCta={() => router.push('/dashboard/admin/invoices')}
              >
                <div className="space-y-2">
                  {invoices.map((inv) => {
                    const s = STATUS_STYLE[inv.status] ?? STATUS_STYLE['draft']
                    return (
                      <button key={inv.id} onClick={() => router.push(`/dashboard/admin/invoices/${inv.id}`)}
                        className="w-full text-left flex items-center gap-4 bg-white border border-neutral-200 rounded-xl px-4 py-3 hover:border-neutral-400 transition group">
                        <div className={`w-1.5 h-8 rounded-full shrink-0 ${inv.status === 'sent' ? 'bg-blue-400' : 'bg-neutral-200'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 group-hover:text-black truncate">
                            {inv.client_name ?? 'Client'}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-neutral-900 shrink-0">
                          {fmtMoney(inv.amount_cents ?? inv.amount ?? 0)}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Open quotes */}
            {quotes.length > 0 && (
              <Section
                title="Open Quotes"
                count={quotes.length}
                cta="View billing"
                onCta={() => router.push('/dashboard/admin/invoices')}
              >
                <div className="space-y-2">
                  {quotes.map((q) => {
                    const s = STATUS_STYLE[q.status] ?? STATUS_STYLE['draft']
                    return (
                      <button key={q.id} onClick={() => router.push(`/dashboard/admin/quotes/${q.id}`)}
                        className="w-full text-left flex items-center gap-4 bg-white border border-neutral-200 rounded-xl px-4 py-3 hover:border-neutral-400 transition group">
                        <div className={`w-1.5 h-8 rounded-full shrink-0 ${
                          q.status === 'accepted' ? 'bg-emerald-400' :
                          q.status === 'sent' ? 'bg-blue-400' : 'bg-neutral-200'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 group-hover:text-black truncate">
                            {q.client_name ?? 'Client'}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
                            {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-neutral-400 shrink-0">{q.quote_number ?? 'Draft'}</span>
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ── Quick nav ── */}
        <Section title="Navigate">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Projects',  sub: `${stats?.totalProjects ?? 0} active`,        href: '/dashboard/admin/projects',  pip: 'bg-amber-400' },
              { label: 'Billing',   sub: `${invoices.length} outstanding`,             href: '/dashboard/admin/invoices',  pip: 'bg-blue-400'  },
              { label: 'Accounts',  sub: `${stats?.totalClients ?? 0} clients`,        href: '/dashboard/admin/accounts',  pip: 'bg-neutral-400' },
              { label: 'Gap Maps',  sub: 'Brand alignment',                            href: '/dashboard/admin/gap-maps',  pip: 'bg-stone-400' },
              { label: 'Templates', sub: 'SOPs + frameworks',                          href: '/dashboard/admin/templates', pip: 'bg-neutral-300' },
              { label: 'Profile',   sub: 'Your account',                               href: '/dashboard/admin/profile',   pip: 'bg-neutral-200' },
            ].map(({ label, sub, href, pip }) => (
              <button key={label} onClick={() => router.push(href)}
                className="text-left bg-white border border-neutral-200 rounded-2xl p-4 hover:border-neutral-400 hover:shadow-sm transition group">
                <div className={`w-2 h-2 rounded-full ${pip} mb-3`} />
                <p className="text-sm font-semibold text-neutral-900 group-hover:text-black">{label}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Footer note ── */}
        <div className="flex items-center justify-between pt-2 pb-4">
          <p className="text-xs text-neutral-400 font-mono">Unless Creative · Calgary, AB</p>
          <p className="text-xs text-neutral-300">◆ Turn instinct into infrastructure.</p>
        </div>

      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      <p className="text-xs text-neutral-600 mt-0.5">{sub}</p>
    </div>
  )
}

function Section({ title, count, cta, onCta, children }: {
  title: string; count?: number; cta?: string; onCta?: () => void; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-neutral-900 text-sm">{title}</h2>
          {count != null && count > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full">{count}</span>
          )}
        </div>
        {cta && onCta && (
          <button onClick={onCta} className="text-xs text-neutral-400 hover:text-black transition">{cta} →</button>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyCard({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }) {
  return (
    <div className="border border-dashed border-neutral-200 rounded-2xl p-10 text-center space-y-2">
      <p className="text-sm text-neutral-400">{label}</p>
      <button onClick={onClick} className="text-sm font-medium text-black underline">{cta}</button>
    </div>
  )
}
