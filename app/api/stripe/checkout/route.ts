import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // IMPORTANT: you must add this to Vercel env vars (server-only)
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { invoiceId } = await req.json()

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Missing invoiceId' },
        { status: 400 }
      )
    }

    // 1) Load invoice
    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('id, amount, status, client_id')
      .eq('id', invoiceId)
      .single()

    if (error || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // optional: prevent paying twice
    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Invoice already paid' },
        { status: 400 }
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL?.startsWith('http')
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`

    // 2) Create Stripe Checkout (ONE-TIME)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: invoice.amount, // cents
            product_data: {
              name: `Invoice ${invoice.id}`,
            },
          },
        },
      ],
      success_url: `${siteUrl}/dashboard/admin/invoices?paid=1`,
      cancel_url: `${siteUrl}/dashboard/admin/invoices?canceled=1`,
      metadata: {
        invoiceId: invoice.id,
      },
    })

    // 3) Save session id + (optional) url + status=sent
    await supabaseAdmin
      .from('invoices')
      .update({
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        status: 'sent',
      })
      .eq('id', invoice.id)

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('Checkout route error:', e)
    return NextResponse.json(
      { error: 'Checkout failed' },
      { status: 500 }
    )
  }
}