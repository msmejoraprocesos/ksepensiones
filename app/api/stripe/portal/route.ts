import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import Stripe from 'stripe'
import { createClient } from '@/utils/supabase/server'

// Stripe initialized lazily inside handlers

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-08-26.dahlia' })
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: perfil } = await supabase
      .from('perfiles_usuario')
      .select('organizacion_id')
      .eq('id', user.id)
      .single()
    if (!perfil?.organizacion_id) return NextResponse.json({ error: 'Sin organización' }, { status: 400 })

    const { data: org } = await supabase
      .from('organizaciones')
      .select('stripe_customer_id')
      .eq('id', perfil.organizacion_id)
      .single()

    if (!org?.stripe_customer_id) return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })

    const origin = req.headers.get('origin') ?? 'https://ksepensiones.vercel.app'
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${origin}/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
