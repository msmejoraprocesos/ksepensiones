export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Ping de Supabase ─────────────────────────────────────────────────────────
// Evita que la base de datos se pause en el tier gratuito (pausa tras 7 días inactivos)
// Configurar en cron-job.org: https://ksepensiones.vercel.app/api/ping
// Frecuencia: cada 3 días (máximo 2 veces por semana)
// Método: GET

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Consulta ligera — solo verifica que la DB responde
    const { error } = await supabase
      .from('organizaciones')
      .select('id')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {  // PGRST116 = 0 rows (ok)
      console.error('[ping] Supabase error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const ts = new Date().toISOString()
    console.log(`[ping] Supabase OK — ${ts}`)
    return NextResponse.json({ ok: true, ts, msg: 'Supabase activa' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
