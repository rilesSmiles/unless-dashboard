import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const { priceId, projectId } = await req.json()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],

    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],

    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/admin/invoices?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/admin/invoices?canceled=true`,

    metadata: {
      projectId,
    },
  })

  return NextResponse.json({
    url: session.url,
  })
}