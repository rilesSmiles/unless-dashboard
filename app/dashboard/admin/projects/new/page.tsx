// app/dashboard/admin/projects/new/page.tsx
'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  name: string | null
  business_name: string | null
}

type DeliveryType = {
  id: string
  name: string
}

export default function NewProject() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [deliveryTypeId, setDeliveryTypeId] = useState('')

  const [clients, setClients] = useState<Profile[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultSteps = ['Decode', 'Align', 'Systemize', 'Activate', 'Steward']

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: clientsData, error: clientsError } = await supabase
          .from('profiles')
          .select('id, name, business_name')
          .eq('role', 'client')
          .order('business_name', { ascending: true })

        if (clientsError) throw clientsError

        const { data: typesData, error: typesError } = await supabase
          .from('delivery_types')
          .select('id, name')
          .order('name', { ascending: true })

        if (typesError) throw typesError

        setClients((clientsData || []) as any[])
      } catch (err: any) {
        console.error(err)
        setError('Failed to load form data')
      }
    }

    loadData()
  }, [])


  const handleCreate = async () => {
    setError(null)

    if (!name.trim() || !clientId ) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)

    try {
      // 1) Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          client_id: clientId,
        })
        .select('id')
        .single()

      if (projectError || !project) throw projectError

      // 2) Create steps (phases)
      const stepRows = defaultSteps.map((title, index) => ({
        project_id: project.id,
        title,
        step_order: index + 1,
      }))

      const { data: insertedSteps, error: stepsError } = await supabase
        .from('project_steps')
        .insert(stepRows)
        .select('id')

      if (stepsError) throw stepsError

      // 3) Create progress rows so checkboxes never see null
      const progressRows = (insertedSteps || []).map((s: any) => ({
        project_id: project.id,
        step_id: s.id,
        completed: false,
      }))

      if (progressRows.length) {
        const { error: progErr } = await supabase.from('project_progress').insert(progressRows)
        if (progErr) throw progErr
      }

      // 4) Go to the project
      router.push(`/dashboard/admin/projects/${project.id}`)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Failed to create project')
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Create New Project</h1>
          <p className="text-sm text-gray-500 mt-1">
            This will auto-add your 5 phase framework.
          </p>
        </div>

        <button
          onClick={() => router.push('/dashboard/admin/projects')}
          className="text-sm underline text-neutral-600 hover:text-black"
        >
          Back
        </button>
      </div>

      {error && <p className="text-red-500">{error}</p>}

      <div className="border rounded-2xl p-6 space-y-4">
        {/* Project Name */}
        <div>
          <label className="block text-sm mb-1">Project Name</label>
          <input
            className="w-full border rounded p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website Redesign"
          />
        </div>

        {/* Client */}
        <div>
          <label className="block text-sm mb-1">Client</label>
          <select
            className="w-full border rounded p-2"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.business_name ?? 'Client') + (c.name ? ` — ${c.name}` : '')}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    </div>
  )
}