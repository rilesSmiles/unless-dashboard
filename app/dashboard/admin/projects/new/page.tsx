'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  name: string
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
  const [deliveryTypes, setDeliveryTypes] = useState<DeliveryType[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default Unless Framework
  const defaultSteps = [
    'Decode',
    'Align',
    'Systemize',
    'Activate',
    'Steward',
  ]

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get clients
        const { data: clientsData, error: clientsError } =
          await supabase
            .from('profiles')
            .select('id, name')
            .eq('role', 'client')

        if (clientsError) throw clientsError

        // Get delivery types
        const { data: typesData, error: typesError } =
          await supabase
            .from('delivery_types')
            .select('id, name')

        if (typesError) throw typesError

        setClients(clientsData || [])
        setDeliveryTypes(typesData || [])

      } catch (err: any) {
        console.error(err)
        setError('Failed to load form data')
      }
    }

    loadData()
  }, [])

  const handleCreate = async () => {
    setLoading(true)
    setError(null)

   try {
  console.log({ name, clientId, deliveryTypeId })

if (!name || !clientId || !deliveryTypeId) {
  setError('Please fill in all fields')
  return
}

      // 1️⃣ Create project
      const { data: project, error: projectError } =
        await supabase
          .from('projects')
          .insert({
            name,
            client_id: clientId,
            delivery_type_id: deliveryTypeId,
          })
          .select()
          .single()

      if (projectError) throw projectError

      // 2️⃣ Create steps
      const steps = defaultSteps.map((title, index) => ({
        project_id: project.id,
        title,
        step_order: index + 1,
      }))

      const { error: stepsError } =
        await supabase
          .from('project_steps')
          .insert(steps)

      if (stepsError) throw stepsError

      // 3️⃣ Redirect
      router.push('/dashboard/admin')

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to create project')
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto">

      <h1 className="text-3xl font-bold mb-6">
        Create New Project
      </h1>

      {error && (
        <p className="text-red-500 mb-4">
          {error}
        </p>
      )}

      <div className="space-y-4">

        {/* Project Name */}
        <div>
          <label className="block text-sm mb-1">
            Project Name
          </label>
          <input
            className="w-full border rounded p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website Redesign"
          />
        </div>

        {/* Client */}
        <div>
          <label className="block text-sm mb-1">
            Client
          </label>
          <select
            className="w-full border rounded p-2"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Select client</option>

            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Type */}
        <div>
          <label className="block text-sm mb-1">
            Delivery Type
          </label>
          <select
            className="w-full border rounded p-2"
            value={deliveryTypeId}
            onChange={(e) => setDeliveryTypeId(e.target.value)}
          >
            <option value="">Select type</option>

            {deliveryTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Submit */}
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