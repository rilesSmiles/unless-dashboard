import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

// Service-role Supabase client (bypasses RLS — only used server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

    // Load invoice — must be published + sent/overdue
    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, amount_cents, amount, bill_to_email, bill_to_name, status, is_published, stripe_payment_intent_id, tax_rate, service_fee_rate')
      .eq('id', invoiceId)
      .eq('is_published', true)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found or not published' }, { status: 404 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 })
    }

    // Calculate total in cents (subtotal is stored as amount_cents already inclusive of fees)
    const amountCents = invoice.amount_cents ?? invoice.amount ?? 0
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Invoice has no amount' }, { status: 400 })
    }

    // Reuse existing PaymentIntent if already created (idempotent)
    if (invoice.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id)
      // If it's still usable, return its client_secret
      if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
        return NextResponse.json({ clientSecret: existing.client_secret })
      }
    }

    // Create new PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'cad',
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number ?? '',
      },
      description: `Unless Creative — Invoice ${invoice.invoice_number ?? invoice.id}`,
      receipt_email: invoice.bill_to_email ?? undefined,
    })

    // Store the payment intent ID on the invoice
    await supabaseAdmin
      .from('invoices')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', invoiceId)

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err: any) {
    console.error('Stripe create-payment-intent error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
