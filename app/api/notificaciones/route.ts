import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — obtener notificaciones del usuario
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('uid')
    if (!userId) return NextResponse.json({ error: 'uid requerido' }, { status: 400 })

    const admin = getAdmin()
    const { data, error } = await admin
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const noLeidas = (data ?? []).filter((n: any) => !n.leida).length
    return NextResponse.json({ notificaciones: data ?? [], no_leidas: noLeidas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — marcar como leída(s)
export async function PATCH(req: NextRequest) {
  try {
    const { uid, id, todas } = await req.json()
    if (!uid) return NextResponse.json({ error: 'uid requerido' }, { status: 400 })

    const admin = getAdmin()
    if (todas) {
      await admin.from('notificaciones').update({ leida: true }).eq('usuario_id', uid)
    } else if (id) {
      await admin.from('notificaciones').update({ leida: true }).eq('id', id).eq('usuario_id', uid)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — generar notificaciones automáticas (llamado por cron-job.org)
export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json()
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const admin = getAdmin()
    let generadas = 0

    // 1. Clientes sin contacto en 30+ días
    const { data: asesores } = await admin
      .from('perfiles_usuario')
      .select('id')
      .eq('activo', true)

    for (const asesor of asesores ?? []) {
      // Clientes sin actividad en 30 días
      const hace30 = new Date()
      hace30.setDate(hace30.getDate() - 30)

      const { data: clientesSinContacto } = await admin
        .from('clientes')
        .select('id, nombre')
        .eq('asesor_id', asesor.id)
        .neq('activo', false)
        .lt('ultimo_contacto', hace30.toISOString())
        .limit(5)

      if (clientesSinContacto && clientesSinContacto.length > 0) {
        // Verificar que no exista ya esta notificación hoy
        const hoy = new Date().toISOString().slice(0, 10)
        const { count } = await admin
          .from('notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('usuario_id', asesor.id)
          .eq('tipo', 'cliente_sin_contacto')
          .gte('created_at', hoy)

        if ((count ?? 0) === 0) {
          await admin.from('notificaciones').insert({
            usuario_id: asesor.id,
            tipo: 'cliente_sin_contacto',
            titulo: `${clientesSinContacto.length} cliente(s) sin contacto`,
            mensaje: `Tienes ${clientesSinContacto.length} cliente(s) sin actividad en más de 30 días: ${clientesSinContacto.map((c: any) => c.nombre).join(', ')}.`,
            url_destino: '/clientes',
          })
          generadas++
        }
      }

      // 2. Actividades pendientes vencidas
      const ayer = new Date()
      ayer.setDate(ayer.getDate() - 1)

      const { data: actsPendientes } = await admin
        .from('actividades')
        .select('id, titulo, fecha_programada')
        .eq('asesor_id', asesor.id)
        .eq('estatus', 'pendiente')
        .lt('fecha_programada', ayer.toISOString())
        .limit(5)

      if (actsPendientes && actsPendientes.length > 0) {
        const hoy = new Date().toISOString().slice(0, 10)
        const { count } = await admin
          .from('notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('usuario_id', asesor.id)
          .eq('tipo', 'actividad_pendiente')
          .gte('created_at', hoy)

        if ((count ?? 0) === 0) {
          await admin.from('notificaciones').insert({
            usuario_id: asesor.id,
            tipo: 'actividad_pendiente',
            titulo: `${actsPendientes.length} actividad(es) pendiente(s) vencida(s)`,
            mensaje: `Tienes ${actsPendientes.length} actividad(es) que debían completarse y siguen pendientes.`,
            url_destino: '/seguimiento',
          })
          generadas++
        }
      }

      // 3. Financiamientos por vencer en 30 días
      const en30 = new Date()
      en30.setDate(en30.getDate() + 30)

      const { data: finsPorVencer } = await admin
        .from('financiamientos')
        .select('id, clientes(nombre)')
        .eq('asesor_id', asesor.id)
        .eq('estatus', 'activo')
        .lt('fecha_fin', en30.toISOString())
        .limit(3)

      if (finsPorVencer && finsPorVencer.length > 0) {
        const hoy = new Date().toISOString().slice(0, 10)
        const { count } = await admin
          .from('notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('usuario_id', asesor.id)
          .eq('tipo', 'financiamiento_por_vencer')
          .gte('created_at', hoy)

        if ((count ?? 0) === 0) {
          await admin.from('notificaciones').insert({
            usuario_id: asesor.id,
            tipo: 'financiamiento_por_vencer',
            titulo: `${finsPorVencer.length} financiamiento(s) por vencer`,
            mensaje: `Tienes ${finsPorVencer.length} financiamiento(s) que vencen en menos de 30 días.`,
            url_destino: '/financiamiento',
          })
          generadas++
        }
      }
    }

    return NextResponse.json({ ok: true, generadas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
