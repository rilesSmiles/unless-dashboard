'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  noteId: string
  initialData: any
  onSaved?: () => void
}

export default function MeetingNoteEditor({ noteId, initialData, onSaved }: Props) {
  const holderRef = useRef<string>(`meeting-editor-${noteId}`)
  const editorRef = useRef<any>(null)
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    if (editorRef.current) return

    let editor: any

    const init = async () => {
      const EditorJS   = (await import('@editorjs/editorjs')).default
      const Header     = (await import('@editorjs/header')).default
      const List       = (await import('@editorjs/list')).default
      const Paragraph  = (await import('@editorjs/paragraph')).default

      editor = new EditorJS({
        holder: holderRef.current,
        data: initialData && Object.keys(initialData).length > 0 ? initialData : { blocks: [] },
        tools: { header: Header, list: List, paragraph: Paragraph },
        placeholder: 'Start typing your meeting notes…',
        async onChange() {
          const data = await editor.save()
          setSaving(true)
          await supabase
            .from('meeting_notes')
            .update({ content: data, updated_at: new Date().toISOString() })
            .eq('id', noteId)
          setSaving(false)
          setSavedAt(new Date())
          onSaved?.()
        },
      })

      editorRef.current = editor
    }

    init()

    return () => {
      if (editorRef.current?.destroy) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [mounted, noteId, initialData])

  if (!mounted) return <p className="text-sm text-neutral-400">Loading editor…</p>

  return (
    <div>
      <div className="border border-neutral-200 rounded-xl bg-white px-4 py-3 min-h-[300px] focus-within:ring-2 focus-within:ring-black/10 transition">
        <div id={holderRef.current} />
      </div>
      <div className="mt-2 h-4">
        {saving && <p className="text-xs text-neutral-400">Saving…</p>}
        {!saving && savedAt && (
          <p className="text-xs text-neutral-400">
            Saved {savedAt.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
