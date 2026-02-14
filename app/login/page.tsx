'use client'

import { supabase } from '@/lib/supabase'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      // 1️⃣ Sign in
      const { data: loginData, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (loginError) {
        throw loginError
      }

      // 2️⃣ Get logged-in user
      const user = loginData.user

      if (!user) {
        throw new Error('User not found after login')
      }

      // 3️⃣ Get profile
      const { data: profile, error: profileError } =
        await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

      if (profileError) {
        throw profileError
      }

      if (!profile) {
        throw new Error('Profile not found')
      }

      // 4️⃣ Redirect by role
      if (profile.role === 'admin') {
        router.push('/dashboard/admin')
      } else {
        router.push('/dashboard/client')
      }

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-96 rounded-xl bg-edeae7 p-6 shadow space-y-4">

        <h1 className="text-2xl font-bold text-center">
          Welcome Back!
        </h1>

        {error && (
          <p className="text-red-500 text-sm text-center">
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          className="w-full border rounded p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border rounded p-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        <p className="text-sm text-center">
          Don’t have an account?{' '}
          <a href="/signup" className="underline">
            Sign up
          </a>
        </p>

      </div>
    </div>
  )
}