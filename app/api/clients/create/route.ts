import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/clients/create' })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      email,
      tempPassword,
      name,
      business_name,
      position,
      phone,
      address,
    } = body as {
      email: string
      tempPassword?: string
      name?: string
      business_name?: string
      position?: string
      phone?: string
      address?: string
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // ✅ 1) Create user (password OR invite)
    let userId: string | null = null

    if (tempPassword && tempPassword.trim().length >= 6) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true, // avoids confirmation issues
      })

      if (error || !data.user) {
        return NextResponse.json(
          { error: 'Failed to create auth user', details: error?.message ?? null },
          { status: 500 }
        )
      }

      userId = data.user.id
    } else {
      // ✅ Invite flow (no password)
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)

      if (error || !data.user) {
        return NextResponse.json(
          { error: 'Failed to invite user', details: error?.message ?? null },
          { status: 500 }
        )
      }

      userId = data.user.id
    }

    // ✅ 2) Create profile row
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          role: 'client',
          email, // make sure your profiles table has this column
          name: name ?? null,
          business_name: business_name ?? null,
          position: position ?? null,
          phone: phone ?? null,
          address: address ?? null,
        },
        { onConflict: 'id' }
      )

    if (profileErr) {
      return NextResponse.json(
        { error: 'Failed to create profile', details: profileErr.message },
        { status: 500 }
      )
    }

    // ✅ 3) Create primary contact row
    const { error: contactErr } = await supabaseAdmin.from('client_contacts').insert({
      client_id: userId,
      name: name ?? null,
      position: position ?? null,
      email,
      phone: phone ?? null,
      is_primary: true,
    })

    if (contactErr) {
      return NextResponse.json(
        { error: 'Client created, but contact insert failed', details: contactErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, userId })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', details: err?.message ?? String(err) },
      { status: 500 }
    )
  }
}