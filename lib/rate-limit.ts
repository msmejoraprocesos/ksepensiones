import { createClient } from '@supabase/supabase-js'

const LIMITE_DIARIO = 30

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function checkRateLimit(asesorId: string, endpoint: string): Promise<{ permitido: boolean; llamadas: number; limite: number }> {
  if (!asesorId) return { permitido: false, llamadas: 0, limite: LIMITE_DIARIO }

  try {
    const admin = getAdminClient()
    const hoy = new Date().toISOString().slice(0, 10)

    // Obtener contador actual
    const { data } = await admin
      .from('rate_limits_ia')
      .select('llamadas')
      .eq('asesor_id', asesorId)
      .eq('endpoint', endpoint)
      .eq('fecha', hoy)
      .single()

    const llamadasActuales = data?.llamadas ?? 0

    if (llamadasActuales >= LIMITE_DIARIO) {
      return { permitido: false, llamadas: llamadasActuales, limite: LIMITE_DIARIO }
    }

    // Incrementar contador (upsert)
    await admin.from('rate_limits_ia').upsert({
      asesor_id: asesorId,
      endpoint,
      fecha: hoy,
      llamadas: llamadasActuales + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'asesor_id,endpoint,fecha' })

    return { permitido: true, llamadas: llamadasActuales + 1, limite: LIMITE_DIARIO }
  } catch (e) {
    console.error('Rate limit error:', e)
    return { permitido: true, llamadas: 0, limite: LIMITE_DIARIO } // En caso de error, permite la llamada
  }
}
