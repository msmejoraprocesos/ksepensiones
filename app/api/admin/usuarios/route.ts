import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada')
  return createServerSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Verifica que quien solicita sea admin — usa las cookies del server (más confiable que el token Bearer)
async function verificarAdmin(req: NextRequest) {
  try {
    // Intento 1: usar el cliente server que lee cookies (más confiable en App Router)
    const supabaseServer = createClient()
    const { data: { user }, error } = await supabaseServer.auth.getUser()
    if (!error && user) {
      const admin = getAdminClient()
      const { data: perfil } = await admin.from('perfiles_usuario').select('is_admin, rol').eq('id', user.id).single()
      if (perfil?.is_admin || perfil?.rol === 'super_admin') return user
    }

    // Intento 2: usar Bearer token del header (fallback)
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (token && token !== 'undefined' && token !== 'null') {
      const admin = getAdminClient()
      const { data: { user: tokenUser }, error: tokenError } = await admin.auth.getUser(token)
      if (!tokenError && tokenUser) {
        const { data: perfil } = await admin.from('perfiles_usuario').select('is_admin, rol').eq('id', tokenUser.id).single()
        if (perfil?.is_admin || perfil?.rol === 'super_admin') return tokenUser
      }
    }

    return null
  } catch (e) {
    console.error('verificarAdmin error:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { email, password, nombre, razon_social, is_admin, organizacion_id, rol } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

    const admin = getAdminClient()

    // Validar asientos disponibles
    if (organizacion_id) {
      const { data: org } = await admin.from('organizaciones').select('asientos, nombre').eq('id', organizacion_id).single()
      if (org) {
        const { count } = await admin.from('perfiles_usuario').select('*', { count: 'exact', head: true }).eq('organizacion_id', organizacion_id)
        const usados = count ?? 0
        if (usados >= org.asientos) {
          return NextResponse.json({ error: `La organización "${org.nombre}" ya tiene ${usados} de ${org.asientos} asientos contratados.` }, { status: 400 })
        }
      }
    }

    // Crear usuario en Auth
    const { data: nuevoUsuario, error: errAuth } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errAuth || !nuevoUsuario.user) {
      return NextResponse.json({ error: errAuth?.message || 'Error al crear usuario' }, { status: 400 })
    }

    // Crear perfil
    const { error: errPerfil } = await admin.from('perfiles_usuario').insert({
      id: nuevoUsuario.user.id,
      nombre: nombre || email.split('@')[0],
      razon_social: razon_social || null,
      email,
      is_admin: !!is_admin,
      rol: is_admin ? 'super_admin' : (rol || 'asesor'),
      organizacion_id: organizacion_id || null,
    })
    if (errPerfil) {
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return NextResponse.json({ error: 'Error al crear el perfil: ' + errPerfil.message }, { status: 400 })
    }

    // Email de bienvenida (si Resend está configurado)
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
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
              <div style="background:#1B3A6B;padding:24px;text-align:center"><h1 style="color:white;margin:0">KSE Pensiones</h1></div>
              <div style="padding:28px;background:white;border:1px solid #E5E7EB">
                <p>Hola <strong>${nombre || email.split('@')[0]}</strong>,</p>
                <p>Tu cuenta ha sido creada. Aquí están tus credenciales:</p>
                <div style="background:#F4F6FB;border-left:3px solid #F05B21;padding:16px;margin:20px 0">
                  <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Correo</p>
                  <p style="margin:0 0 16px;font-weight:bold">${email}</p>
                  <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Contraseña temporal</p>
                  <p style="margin:0;font-weight:bold;color:#F05B21">${password}</p>
                </div>
                <p style="font-size:13px;color:#6B7280">Te recomendamos cambiar tu contraseña en Configuración después del primer acceso.</p>
                <div style="text-align:center;margin:24px 0">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://ksepensiones.vercel.app'}" style="background:#1B3A6B;color:white;padding:12px 28px;text-decoration:none;font-weight:bold">Entrar al sistema →</a>
                </div>
              </div>
            </div>`
          })
        })
      } catch (e) { console.error('Error email bienvenida:', e) }
    }

    return NextResponse.json({ id: nuevoUsuario.user.id, email, nombre, is_admin: !!is_admin })
  } catch (e: any) {
    console.error('POST /api/admin/usuarios error:', e)
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

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

export async function PATCH(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id, password, is_admin, organizacion_id, rol } = await req.json()
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
    if (rol) {
      await admin.from('perfiles_usuario').update({ rol }).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
