'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────
type Doc = {
  id: string
  project_id: string
  title: string
  storage_path: string | null
  embed_url: string | null
  file_type: string | null
  created_at: string
  project_name?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function docTypeLabel(doc: Doc): string {
  if (doc.embed_url) return 'LINK'
  const ft = (doc.file_type ?? '').toLowerCase()
  if (ft.includes('pdf')) return 'PDF'
  if (ft.startsWith('image/')) return 'IMAGE'
  if (ft.includes('word') || ft.includes('document')) return 'DOC'
  if (ft.includes('sheet') || ft.includes('excel') || ft.includes('csv')) return 'SHEET'
  if (ft.includes('presentation') || ft.includes('powerpoint')) return 'SLIDES'
  if (ft) return ft.split('/').pop()?.toUpperCase() ?? 'FILE'
  return 'FILE'
}

function docTypeIcon(doc: Doc): string {
  if (doc.embed_url) return '↗'
  const ft = (doc.file_type ?? '').toLowerCase()
  if (ft.includes('pdf')) return '◆'
  if (ft.startsWith('image/')) return '▣'
  return '◆'
}

function normalizeEmbedUrl(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('docs.google.com')) {
      u.pathname = u.pathname.replace(/\/(edit|view|copy).*$/, '/preview')
      return u.toString()
    }
    if (u.hostname.includes('drive.google.com')) {
      u.pathname = u.pathname.replace(/\/view.*$/, '/preview')
      return u.toString()
    }
    if (u.hostname.includes('figma.com')) {
      if (u.pathname.startsWith('/embed')) return u.toString()
      return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
    }
    return url
  } catch { return url }
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function ClientDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string>('all')

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ─── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setLoading(false); return }

      // Get client's projects
      const { data: projData } = await supabase
        .from('projects')
        .select('id, name')
        .eq('client_id', userId)

      const projects = (projData ?? []) as { id: string; name: string }[]
      const projectIds = projects.map((p) => p.id)
      const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]))

      if (!projectIds.length) { setLoading(false); return }

      // Get ALL documents across all projects
      const { data: docData } = await supabase
        .from('project_documents')
        .select('id, project_id, title, storage_path, embed_url, file_type, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })

      const enriched = ((docData ?? []) as Doc[]).map((d) => ({
        ...d,
        project_name: projectMap[d.project_id] ?? 'Project',
      }))

      setDocs(enriched)
      setLoading(false)
    }
    load()
  }, [])

  // Load signed URLs for uploaded files
  useEffect(() => {
    const load = async () => {
      const missing = docs.filter((d) => d.storage_path && !signedUrls[d.id])
      if (!missing.length) return
      const next: Record<string, string> = {}
      for (const d of missing) {
        const { data } = await supabase.storage
          .from('project-files')
          .createSignedUrl(d.storage_path!, 600)
        if (data?.signedUrl) next[d.id] = data.signedUrl
      }
      if (Object.keys(next).length) setSignedUrls((prev) => ({ ...prev, ...next }))
    }
    load()
  }, [docs])

  // ─── Preview ────────────────────────────────────────────────────────────
  const openPreview = async (doc: Doc) => {
    setPreviewDoc(doc)
    setPreviewLoading(true)
    setPreviewUrl(null)
    if (doc.embed_url) {
      setPreviewUrl(normalizeEmbedUrl(doc.embed_url))
    } else if (doc.storage_path) {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.storage_path, 600)
      setPreviewUrl(data?.signedUrl ?? null)
    }
    setPreviewLoading(false)
  }

  const isImage = (d: Doc) => (d.file_type ?? '').toLowerCase().startsWith('image/')
  const isPdf = (d: Doc) => (d.file_type ?? '').toLowerCase().includes('pdf')

  // ─── Filter options ──────────────────────────────────────────────────────
  const typeOptions = ['all', ...Array.from(new Set(docs.map((d) => docTypeLabel(d))))]

  const filtered = filter === 'all' ? docs : docs.filter((d) => docTypeLabel(d) === filter)

  // Group by project
  const grouped = filtered.reduce<Record<string, Doc[]>>((acc, doc) => {
    const key = doc.project_name ?? 'Project'
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">

      {/* ── Header ── */}
      <div className="px-6 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A3428 0%, #0d0d0d 60%)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7EC8A0' }}>
            Unless Creative — Client Portal
          </p>
          <h1 className="text-3xl text-white">Documents</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>
            {docs.length} file{docs.length !== 1 ? 's' : ''} shared with you
          </p>
        </div>
      </div>

      {/* ── Filter pills ── */}
      {typeOptions.length > 2 && (
        <div className="bg-white border-b border-neutral-100 px-6 py-3 overflow-x-auto">
          <div className="max-w-2xl mx-auto flex gap-2">
            {typeOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition"
                style={
                  filter === opt
                    ? { background: '#F04D3D', color: '#fff', borderColor: '#F04D3D' }
                    : { background: 'white', color: '#888', borderColor: '#e5e5e5' }
                }
              >
                {opt === 'all' ? 'All files' : opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-6">
        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
            <p className="text-neutral-400 text-sm">No documents yet — files will appear here as Riley shares them.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([projectName, projectDocs]) => (
            <div key={projectName}>
              {/* Project label */}
              {Object.keys(grouped).length > 1 && (
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 px-1">
                  {projectName}
                </p>
              )}

              <div className="space-y-2">
                {projectDocs.map((doc) => {
                  const typeLabel = docTypeLabel(doc)
                  const icon = docTypeIcon(doc)
                  const thumbUrl = signedUrls[doc.id] ?? null

                  return (
                    <button
                      key={doc.id}
                      onClick={() => openPreview(doc)}
                      className="w-full text-left bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:border-neutral-400 hover:shadow-sm transition group flex items-stretch"
                    >
                      {/* Thumbnail strip */}
                      <div
                        className="w-16 shrink-0 relative overflow-hidden"
                        style={{ background: '#f5f5f5' }}
                      >
                        {doc.embed_url && (
                          <iframe
                            src={normalizeEmbedUrl(doc.embed_url)}
                            className="absolute inset-0 w-full h-full"
                            loading="lazy"
                            style={{ pointerEvents: 'none' }}
                            sandbox="allow-same-origin allow-scripts"
                          />
                        )}
                        {!doc.embed_url && thumbUrl && isImage(doc) && (
                          <img src={thumbUrl} alt={doc.title} className="absolute inset-0 w-full h-full object-cover" />
                        )}
                        {!doc.embed_url && thumbUrl && isPdf(doc) && (
                          <iframe src={thumbUrl} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
                        )}
                        {!doc.embed_url && !thumbUrl && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold" style={{ color: '#F04D3D' }}>{icon}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate group-hover:text-black">
                            {doc.title}
                          </p>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            <span
                              className="inline-block font-semibold px-1.5 py-0.5 rounded mr-1.5 text-[10px]"
                              style={{ background: '#F04D3D10', color: '#F04D3D' }}
                            >
                              {typeLabel}
                            </span>
                            {formatDate(doc.created_at)}
                          </p>
                        </div>
                        <span className="text-neutral-300 text-sm shrink-0 group-hover:text-neutral-500 transition">→</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Preview Modal ── */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) { setPreviewDoc(null); setPreviewUrl(null) }
          }}
        >
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  {docTypeLabel(previewDoc)} · {previewDoc.project_name}
                </p>
                <p className="font-bold text-neutral-900 truncate">{previewDoc.title}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {/* Open externally */}
                {(previewUrl || previewDoc.embed_url) && (
                  <button
                    onClick={() => window.open(previewDoc.embed_url ?? previewUrl ?? '', '_blank', 'noreferrer')}
                    className="text-xs font-medium px-3 py-1.5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition"
                  >
                    Open ↗
                  </button>
                )}
                <button
                  onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }}
                  className="text-sm text-neutral-400 hover:text-black transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal content */}
            <div className="p-4">
              {previewLoading ? (
                <p className="text-sm text-neutral-400 py-12 text-center">Loading preview…</p>
              ) : !previewUrl ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-neutral-400">No preview available for this file type.</p>
                </div>
              ) : previewDoc.embed_url || isPdf(previewDoc) ? (
                <iframe
                  src={previewUrl}
                  className="w-full rounded-xl border border-neutral-100"
                  style={{ height: '68vh' }}
                  title={previewDoc.title}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              ) : isImage(previewDoc) ? (
                <img
                  src={previewUrl}
                  alt={previewDoc.title}
                  className="max-h-[68vh] w-auto mx-auto rounded-xl"
                />
              ) : (
                <div className="py-12 text-center space-y-3">
                  <p className="text-sm text-neutral-500">This file type can't be previewed inline.</p>
                  <button
                    onClick={() => window.open(previewUrl, '_blank', 'noreferrer')}
                    className="text-sm font-semibold underline"
                    style={{ color: '#F04D3D' }}
                  >
                    Download / Open file
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
