'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ProjectRow = {
  id: string
  name: string
  created_at: string
}

type ProjectDoc = {
  id: string
  project_id: string
  title: string
  created_at: string
  embed_url: string | null
  storage_path: string | null
  file_type: string | null
}

type ProjectTask = {
  id: string
  project_id: string
  title: string
  created_at: string
  updated_at: string
}

type ProjectTodo = {
  id: string
  project_id: string
  text: string
  created_at: string
  completed_at: string | null
  is_done: boolean
}

type WhatsNewItem =
  | { type: 'doc'; project_id: string; title: string; ts: string; doc_id: string }
  | { type: 'task'; project_id: string; title: string; ts: string; task_id: string }
  | { type: 'todo'; project_id: string; text: string; ts: string; todo_id: string }

function toIso(d: Date) {
  return d.toISOString()
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [whatsNew, setWhatsNew] = useState<WhatsNewItem[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErrorMsg(null)

      // 1) auth user
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      const userId = authData?.user?.id

      if (authErr || !userId) {
        setErrorMsg('You must be signed in to view your dashboard.')
        setLoading(false)
        return
      }

      // 2) profile -> last_seen_at (profile id = client id in your setup)
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('id, last_seen_at')
        .eq('id', userId)
        .single()

      if (profErr || !profile?.id) {
        setErrorMsg('No client profile found for this account.')
        setLoading(false)
        return
      }

      const clientId = profile.id as string
      const lastSeenAt = (profile.last_seen_at as string | null) ?? null

      // 3) projects for this client
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

      if (projErr) {
        console.error('Load projects error:', projErr)
        setErrorMsg('Could not load projects.')
        setLoading(false)
        return
      }

      const projectRows = (projData || []) as ProjectRow[]
      setProjects(projectRows)

      const projectIds = projectRows.map((p) => p.id)

      // If first visit, show last 14 days
      const fallbackSince = toIso(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
      const since = lastSeenAt ?? fallbackSince

      // 4) WHAT'S NEW: docs + tasks + todos since `since`
      let newItems: WhatsNewItem[] = []

      if (projectIds.length > 0) {
        // docs
        const { data: docsData, error: docsErr } = await supabase
          .from('project_documents')
          .select('id, project_id, title, created_at, embed_url, storage_path, file_type')
          .in('project_id', projectIds)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(20)

        if (docsErr) console.error('Load whats-new docs error:', docsErr)

        const docs = (docsData || []) as ProjectDoc[]
        newItems = newItems.concat(
          docs.map((d) => ({
            type: 'doc' as const,
            project_id: d.project_id,
            title: d.title,
            ts: d.created_at,
            doc_id: d.id,
          }))
        )

        // tasks updated since last visit
        const { data: tasksData, error: tasksErr } = await supabase
          .from('project_step_tasks')
          .select('id, project_id, title, created_at, updated_at')
          .in('project_id', projectIds)
          .gt('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(20)

        if (tasksErr) console.error('Load whats-new tasks error:', tasksErr)

        const tasks = (tasksData || []) as ProjectTask[]
        newItems = newItems.concat(
          tasks.map((t) => ({
            type: 'task' as const,
            project_id: t.project_id,
            title: t.title,
            ts: t.updated_at,
            task_id: t.id,
          }))
        )

        // todos created since last visit
        const { data: todosData, error: todosErr } = await supabase
          .from('project_todos')
          .select('id, project_id, text, created_at, completed_at, is_done')
          .in('project_id', projectIds)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(20)

        if (todosErr) console.error('Load whats-new todos error:', todosErr)

        const todos = (todosData || []) as ProjectTodo[]
        newItems = newItems.concat(
          todos.map((t) => ({
            type: 'todo' as const,
            project_id: t.project_id,
            text: t.text,
            ts: t.created_at,
            todo_id: t.id,
          }))
        )
      }

      // newest-first
      newItems.sort((a, b) => (a.ts < b.ts ? 1 : -1))
      setWhatsNew(newItems.slice(0, 25))

      // 5) update last_seen_at AFTER fetching
      const nowIso = new Date().toISOString()
      const { error: seenErr } = await supabase.from('profiles').update({ last_seen_at: nowIso }).eq('id', userId)
      if (seenErr) console.error('Update last_seen_at error:', seenErr)

      setLoading(false)
    }

    load()
  }, [])

  const projectsById = useMemo(() => {
    const map = new Map<string, ProjectRow>()
    for (const p of projects) map.set(p.id, p)
    return map
  }, [projects])

  const getWhatsNewKey = (item: WhatsNewItem) => {
    switch (item.type) {
      case 'doc':
        return `doc-${item.doc_id}`
      case 'task':
        return `task-${item.task_id}`
      case 'todo':
        return `todo-${item.todo_id}`
    }
  }

  const getWhatsNewLabel = (item: WhatsNewItem) => {
    switch (item.type) {
      case 'doc':
        return `New document: ${item.title}`
      case 'task':
        return `Task updated: ${item.title}`
      case 'todo':
        return `New note: ${item.text}`
    }
  }

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <p className="text-sm text-gray-500">Dashboard</p>
        <h1 className="text-3xl font-bold">Welcome back</h1>
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* WHAT'S NEW */}
        <div className="border rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">What’s New</h2>
            <div className="text-xs text-gray-500">Since your last visit</div>
          </div>

          {whatsNew.length === 0 ? (
            <div className="text-sm text-gray-500">Nothing new yet ✨</div>
          ) : (
            <div className="space-y-2">
              {whatsNew.map((item) => {
                const proj = projectsById.get(item.project_id)
                return (
                  <button
                    key={getWhatsNewKey(item)}
                    type="button"
                    onClick={() => router.push(`/dashboard/client/projects/${item.project_id}`)}
                    className="w-full text-left border rounded-xl p-3 hover:border-black transition"
                  >
                    <div className="text-xs text-gray-500">
                      {proj?.name ?? 'Project'} • {new Date(item.ts).toLocaleString()}
                    </div>
                    <div className="text-sm font-medium pt-1">{getWhatsNewLabel(item)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* PROJECTS */}
        <div className="border rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold">Your Projects</h2>

          {projects.length === 0 ? (
            <div className="text-sm text-gray-500">You don’t have any projects yet.</div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/client/projects/${p.id}`)}
                  className="w-full text-left border rounded-xl p-4 hover:border-black transition"
                >
                  <div className="text-lg font-semibold">{p.name}</div>
                  <div className="text-xs text-gray-500 pt-1">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}