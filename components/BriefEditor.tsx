'use client'

import { useEffect, useRef, useState } from 'react'
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'
import { supabase } from '@/lib/supabase'

type Props = {
  projectId: string
  initialData: any
}

export default function BriefEditor({
  projectId,
  initialData,
}: Props) {
  const editorRef = useRef<EditorJS | null>(null)
  const holderRef = useRef<HTMLDivElement>(null)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!holderRef.current) return

    if (editorRef.current) return

    const editor = new EditorJS({
      holder: holderRef.current,
      data: initialData || undefined,

      tools: {
        header: Header,
        list: List,
        paragraph: Paragraph,
      },

      autofocus: true,

      async onChange() {
        const content = await editor.save()

        setSaving(true)

        await supabase
          .from('projects')
          .update({
            brief_content: content,
          })
          .eq('id', projectId)

        setSaving(false)
      },
    })

    editorRef.current = editor

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [projectId, initialData])

  return (
    <div className="space-y-2">

      <div
        ref={holderRef}
        className="border rounded-lg p-3 min-h-[200px] bg-white"
      />

      <p className="text-xs text-gray-400">
        {saving ? 'Saving…' : 'Autosaved'}
      </p>
    </div>
  )
}