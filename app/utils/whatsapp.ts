/**
 * KSE Pensiones — Servicio de notificaciones WhatsApp
 *
 * Proveedor: Twilio WhatsApp API (sandbox gratuito para desarrollo)
 * Producción: requiere aprobación de cuenta Business en Meta
 *
 * Variables de entorno necesarias:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   (ej: whatsapp:+14155238886 para sandbox)
 */

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM  = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

interface WAResult { ok: boolean; sid?: string; error?: string }

async function sendWA(to: string, body: string): Promise<WAResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    // Sin Twilio configurado → solo log (útil para desarrollo)
    console.log(`[WhatsApp MOCK] To: ${to}\n${body}`)
    return { ok: true, sid: 'mock' }
  }

  const tel = to.replace(/\D/g, '')
  const toWA = `whatsapp:+${tel.startsWith('52') ? tel : '52' + tel}`

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
  const params = new URLSearchParams({ From: TWILIO_FROM, To: toWA, Body: body })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.message ?? 'Error Twilio' }
  return { ok: true, sid: data.sid }
}

// ─── Plantillas de mensajes ────────────────────────────────────────────────────

export async function notifBienvenida(tel: string, nombre: string, email: string, password: string) {
  return sendWA(tel, `🔷 *KSE PENSIONES*\n\nHola *${nombre}* 👋\n\nTu cuenta ha sido creada:\n\n📧 *Usuario:* ${email}\n🔑 *Contraseña:* ${password}\n\n🌐 https://ksepensiones.vercel.app\n\n⚠️ Cambia tu contraseña en tu primer acceso.`)
}

export async function notifDiagnosticoListo(tel: string, nombreAsesor: string, nombreCliente: string, pension: string) {
  return sendWA(tel, `✅ *KSE PENSIONES*\n\n*${nombreAsesor}*, el diagnóstico de *${nombreCliente}* está listo.\n\n💰 Pensión proyectada: *${pension}/mes*\n\nEntra a la plataforma para verlo completo.`)
}

export async function notifActividadPendiente(tel: string, nombreAsesor: string, actividades: number) {
  return sendWA(tel, `🔔 *KSE PENSIONES*\n\nHola *${nombreAsesor}*, tienes *${actividades} actividad${actividades > 1 ? 'es' : ''}* pendiente${actividades > 1 ? 's' : ''} vencida${actividades > 1 ? 's' : ''}.\n\nEntra a KSE para atenderlas.`)
}

export async function notifSuscripcionVence(tel: string, nombreOrg: string, diasRestantes: number) {
  return sendWA(tel, `⚠️ *KSE PENSIONES*\n\nLa suscripción de *${nombreOrg}* vence en *${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}*.\n\n💳 Renueva en: https://ksepensiones.vercel.app/billing\n\nNo pierdas acceso a tus diagnósticos.`)
}

export async function notifSuscripcionVencida(tel: string, nombreOrg: string) {
  return sendWA(tel, `❌ *KSE PENSIONES*\n\nLa suscripción de *${nombreOrg}* ha vencido.\n\n💳 Renueva en: https://ksepensiones.vercel.app/billing\n\nTus datos están seguros — reactiva tu cuenta para seguir trabajando.`)
}

export async function notifCanalizacion(tel: string, nombreDestino: string, nombreCliente: string, nombreOrigen: string) {
  return sendWA(tel, `📥 *KSE PENSIONES*\n\nHola *${nombreDestino}*, tienes una nueva canalización de *${nombreOrigen}*.\n\n👤 Cliente: *${nombreCliente}*\n\nEntra a tu panel para revisar el caso.`)
}
