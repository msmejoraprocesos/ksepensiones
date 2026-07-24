import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada')
  return createServerSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verificarAdmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: perfil } = await admin.from('perfiles_usuario').select('is_admin').eq('id', user.id).single()
  if (!perfil?.is_admin) return null
  return user
}

// POST: crear nuevo usuario con validación de asientos
export async function POST(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { email, password, nombre, razon_social, is_admin, organizacion_id } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

    const admin = getAdminClient()

    // ── Validar asientos disponibles si se asigna a una org ─────────
    if (organizacion_id) {
      const { data: org } = await admin.from('organizaciones').select('asientos, nombre').eq('id', organizacion_id).single()
      if (org) {
        const { count } = await admin.from('perfiles_usuario').select('*', { count: 'exact', head: true }).eq('organizacion_id', organizacion_id)
        const usados = count ?? 0
        if (usados >= org.asientos) {
          return NextResponse.json({
            error: `La organización "${org.nombre}" ya tiene ${usados} de ${org.asientos} asientos contratados. Actualiza el plan antes de agregar más asesores.`
          }, { status: 400 })
        }
      }
    }

    // ── Crear usuario en Auth ────────────────────────────────────────
    const { data: nuevoUsuario, error: errAuth } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errAuth || !nuevoUsuario.user) {
      return NextResponse.json({ error: errAuth?.message || 'Error al crear usuario en Auth' }, { status: 400 })
    }

    // ── Crear perfil ─────────────────────────────────────────────────
    const { error: errPerfil } = await admin.from('perfiles_usuario').insert({
      id: nuevoUsuario.user.id,
      nombre: nombre || email.split('@')[0],
      razon_social: razon_social || null,
      email,
      is_admin: !!is_admin,
      rol: is_admin ? 'super_admin' : 'asesor',
      organizacion_id: organizacion_id || null,
    })
    if (errPerfil) {
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return NextResponse.json({ error: 'Error al crear el perfil: ' + errPerfil.message }, { status: 400 })
    }

    // ── Enviar email de bienvenida via Resend ────────────────────────
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !is_admin) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'KSE Pensiones <noreply@ksepensiones.com>',
            to: [email],
            subject: 'Bienvenido a KSE Pensiones — Tus credenciales de acceso',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
                <div style="background: #1B3A6B; padding: 24px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 22px;">KSE Pensiones</h1>
                  <p style="color: #93C5FD; margin: 4px 0 0; font-size: 13px;">Sistema de Diagnóstico Pensional</p>
                </div>
                <div style="padding: 28px 24px; background: white; border: 1px solid #E5E7EB;">
                  <p style="font-size: 15px; color: #111827;">Hola <strong>${nombre || email.split('@')[0]}</strong>,</p>
                  <p style="font-size: 14px; color: #374151; line-height: 1.6;">Tu cuenta en KSE Pensiones ha sido creada. Aquí están tus credenciales de acceso:</p>
                  <div style="background: #F4F6FB; border: 1px solid #E5E7EB; border-left: 3px solid #F05B21; padding: 16px; margin: 20px 0;">
                    <p style="margin: 0 0 8px; font-size: 13px; color: #6B7280;">Correo de acceso</p>
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: bold; color: #111827;">${email}</p>
                    <p style="margin: 0 0 8px; font-size: 13px; color: #6B7280;">Contraseña temporal</p>
                    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #F05B21; letter-spacing: 1px;">${password}</p>
                  </div>
                  <p style="font-size: 13px; color: '#6B7280';">Te recomendamos cambiar tu contraseña después del primer acceso desde Configuración.</p>
                  <div style="text-align: center; margin: 24px 0;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://ksepensiones.vercel.app'}" 
                       style="background: #1B3A6B; color: white; padding: 12px 28px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                      Entrar al sistema →
                    </a>
                  </div>
                </div>
                <div style="padding: 14px; text-align: center; font-size: 11px; color: #9CA3AF;">
                  KSE Pensiones · Sistema de Diagnóstico Pensional IMSS Ley 73
                </div>
              </div>
            `
          })
        })
      } catch (e) {
        console.error('Error enviando email de bienvenida:', e)
        // No falla el request si el email no se envía
      }
    }

    return NextResponse.json({ id: nuevoUsuario.user.id, email, nombre, is_admin: !!is_admin })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// DELETE: eliminar usuario
export async function DELETE(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
    if (id === solicitante.id) return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })

    const admin = getAdminClient()
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('perfiles_usuario').delete().eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// PATCH: cambiar password o rol
export async function PATCH(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id, password, is_admin, organizacion_id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

    const admin = getAdminClient()

    if (password) {
      if (password.length < 6) return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (typeof is_admin === 'boolean') {
      await admin.from('perfiles_usuario').update({ is_admin, rol: is_admin ? 'super_admin' : 'asesor' }).eq('id', id)
    }
    if (organizacion_id !== undefined) {
      await admin.from('perfiles_usuario').update({ organizacion_id: organizacion_id || null }).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
