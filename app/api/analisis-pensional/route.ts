import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

const client = new Anthropic()

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()
    const asesorIdRL = datos.asesor_id ?? null

    // Rate limiting: 30 llamadas por asesor por día
    if (asesorIdRL) {
      const rl = await checkRateLimit(asesorIdRL, 'analisis-pensional')
      if (!rl.permitido) {
        return NextResponse.json({
          ok: false,
          error: `Alcanzaste el límite diario de ${rl.limite} análisis de Sofía IA. Se restablece a medianoche.`,
          llamadas: rl.llamadas, limite: rl.limite
        }, { status: 429 })
      }
    }
    const {
      nombre, nombre_trabajador, ley, semanas, salarioDiario, salarioMensual, edadActual, edadRetiro,
      aniosRetiro, ingresoDes, inflacion, sys,
      e1, e2, e3, e4, escRecomendado,
      mod10Activo, mod10Anios, mod40Activo, mod40UMAs, mod40Anios, mod40Costo,
      tieneISSSTe, aniosISSSTe, aforeSaldo, rendimiento
    } = datos

    const brechaE1 = Math.max(0, ingresoDes - e1.pension_real)
    const pctE1 = ingresoDes > 0 ? Math.round((e1.pension_real / ingresoDes) * 100) : 0
    const pctE4 = ingresoDes > 0 ? Math.round((e4.pension_real / ingresoDes) * 100) : 0
    const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

    const prompt = `Eres un experto asesor en pensiones del IMSS en México con 20 años de experiencia. 
Genera un análisis pensional profesional, claro y personalizado en español mexicano. 
Sé directo, empático y usa lenguaje que cualquier persona pueda entender.
NO uses tecnicismos innecesarios. SÍ explica las consecuencias reales.

DATOS DEL DIAGNÓSTICO:
- Cliente / quien solicita: ${nombre || 'el asegurado'}
- Trabajador titular (constancia IMSS): ${nombre_trabajador || nombre || 'el asegurado'}
- Régimen: Ley ${ley}
- Edad actual: ${edadActual} años
- Edad de retiro deseada: ${edadRetiro} años (${aniosRetiro} años para el retiro)
- Semanas cotizadas: ${semanas} ${tieneISSSTe ? `(incluye ${aniosISSSTe * 52} semanas de portabilidad ISSSTE)` : ''}
- Salario: ${salarioDiario} veces SM (${fmtMXN(salarioMensual)}/mes)
- Ingreso deseado al retiro: ${fmtMXN(ingresoDes)}/mes
- Inflación estimada: ${inflacion}%

RESULTADOS DE LOS 4 ESCENARIOS (en pesos de hoy):
- E1 Sin acción: ${fmtMXN(e1.pension_real)}/mes (${pctE1}% del objetivo, brecha: ${fmtMXN(brechaE1)})
- E2 Modalidad 10: ${fmtMXN(e2.pension_real)}/mes (${ingresoDes > 0 ? Math.round((e2.pension_real/ingresoDes)*100) : 0}% del objetivo)
- E3 Modalidad 40: ${fmtMXN(e3.pension_real)}/mes ${mod40Activo ? `(${mod40UMAs} UMAs, ${mod40Anios} años, costo ${fmtMXN(mod40Costo)}/mes)` : ''}
- E4 Combinada: ${fmtMXN(e4.pension_real)}/mes (${pctE4}% del objetivo) ← RECOMENDADO
${ley === '97' ? `- Saldo AFORE: ${fmtMXN(aforeSaldo)}, rendimiento ${rendimiento}%` : ''}

VARIABLES 2026: UMA ${sys.UMA_DIARIA}/día · SM ${sys.SALARIO_MIN}/día · PMG L73 ${fmtMXN(sys.PMG_L73)} · Inflación ${inflacion}%

Genera el análisis con EXACTAMENTE estas 5 secciones en formato JSON:

{
  "contexto": "2-3 párrafos sobre la situación actual del asegurado. Incluye: edad, semanas, régimen, años para el retiro, y una evaluación honesta de su situación (si va bien, si va justo, si está en riesgo). Menciona si aplica Ley 73 o 97 y por qué importa.",
  
  "diagnostico_actual": "2 párrafos explicando qué pasaría sin acción. Usa números concretos. Explica la brecha en términos de vida real (ej: 'no alcanzaría para pagar renta y servicios básicos'). Si la pensión no cubre la meta, sé claro en las consecuencias.",
  
  "opciones_disponibles": "3-4 párrafos explicando cada escenario disponible (E2, E3, E4) en lenguaje simple. Para cada uno explica: qué implica hacer, cuánto cuesta, qué ganancia tiene. Si hay brecha que no se puede cubrir, explica las alternativas (retrasar retiro, ajustar expectativa, ahorros adicionales).",
  
  "recomendacion": "1-2 párrafos con una recomendación clara y directa. Menciona el escenario óptimo, el costo mensual, el beneficio concreto y por qué es la mejor opción para este caso específico. Si hay urgencia (pocos años para el retiro, pocas semanas), indícalo.",
  
  "proximos_pasos": "Lista de 3-5 acciones concretas y ordenadas que debe tomar el cliente, con tiempos aproximados. Incluye verificar semanas en imss.gob.mx, cuándo iniciar la modalidad recomendada, etc."
}

Responde ÚNICAMENTE con el JSON válido, sin markdown.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const analisis = JSON.parse(clean)

    // Registrar uso de IA en background
    const asesorId = datos.asesor_id ?? null
    const clienteId = datos.cliente_id ?? null
    if (asesorId) {
      try {
        const db = getAdminClient()
        const { data: perfil } = await db.from('perfiles_usuario').select('organizacion_id').eq('id', asesorId).single()
        await db.from('uso_ia').insert({
          asesor_id: asesorId,
          organizacion_id: perfil?.organizacion_id ?? null,
          cliente_id: clienteId,
          tipo: 'analisis_pensional',
          tokens_entrada: response.usage?.input_tokens ?? 0,
          tokens_salida: response.usage?.output_tokens ?? 0,
          modelo: 'claude-sonnet-4-6',
          exitoso: true,
          duracion_ms: 0,
        })
      } catch (e) { console.error('Error logging uso_ia:', e) }
    }

    return NextResponse.json({ ok: true, analisis })
  } catch (error: any) {
    console.error('Analisis error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
