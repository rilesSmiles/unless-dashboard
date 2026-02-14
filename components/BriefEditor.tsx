'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

import Header from '@editorjs/header'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'

type Props = {
  projectId: string
  initialData: any
}

export default function BriefEditor({
  projectId,
  initialData,
}: Props) {
  const editorRef = useRef<any>(null)
  const [mounted, setMounted] = useState(false)

  /* Make sure we're on client */
  useEffect(() => {
    setMounted(true)
  }, [])

  /* Init editor */
  useEffect(() => {
    if (!mounted) return
    if (editorRef.current) return

    let editor: any

    const init = async () => {
      const EditorJS = (await import('@editorjs/editorjs')).default

      editor = new EditorJS({
        holder: 'editorjs',

        data:
          initialData && Object.keys(initialData).length > 0
            ? initialData
            : { blocks: [] },

        tools: {
          header: Header,
          list: List,
          paragraph: Paragraph,
        },

        async onChange() {
          const data = await editor.save()

          await supabase
            .from('projects')
            .update({
              brief_content: data,
            })
            .eq('id', projectId)
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
  }, [mounted, projectId, initialData])

  if (!mounted) {
    return (
      <p className="text-sm text-gray-400">
        Loading editor…
      </p>
    )
  }

  return (
    <div className="border rounded p-3 min-h-[250px] bg-white">
      <div id="editorjs" />
    </div>
  )
}