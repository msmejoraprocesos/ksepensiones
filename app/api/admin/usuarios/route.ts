import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Verifica que el usuario sea admin usando su ID directamente
async function verificarAdmin(userId: string) {
  if (!userId || userId.length < 10) return false
  try {
    const admin = getAdminClient()
    // Usa auth.admin que no depende de RLS ni de perfiles_usuario
    const { data: { user }, error } = await admin.auth.admin.getUserById(userId)
    if (error || !user) {
      console.log('verificarAdmin auth error:', error?.message)
      return false
    }
    // El usuario existe en Auth — ahora verifica su perfil con service role
    const { data: perfil, error: perfilError } = await admin
      .from('perfiles_usuario')
      .select('is_admin, rol')
      .eq('id', userId)
      .maybeSingle()
    console.log('verificarAdmin:', JSON.stringify({ uid: userId.slice(0,8), perfil, perfilError: perfilError?.message }))
    // Si no hay perfil (primer admin), permite por auth.uid
    if (!perfil) return true // El usuario existe en auth — es el admin original
    return !!perfil.is_admin || perfil.rol === 'super_admin'
  } catch (e: any) {
    console.error('verificarAdmin exception:', e.message)
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, nombre, razon_social, is_admin, organizacion_id, rol, _uid } = body

    if (!_uid) return NextResponse.json({ error: 'Sesión no válida — recarga la página' }, { status: 403 })
    const esAdmin = await verificarAdmin(_uid)
    if (!esAdmin) return NextResponse.json({ error: 'No tienes permisos de administrador' }, { status: 403 })

    if (!email || !password) return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

    const admin = getAdminClient()

    if (organizacion_id) {
      const { data: org } = await admin.from('organizaciones').select('asientos, nombre').eq('id', organizacion_id).single()
      if (org) {
        const { count } = await admin.from('perfiles_usuario').select('*', { count: 'exact', head: true }).eq('organizacion_id', organizacion_id)
        if ((count ?? 0) >= org.asientos) {
          return NextResponse.json({ error: `"${org.nombre}" ya tiene ${count} de ${org.asientos} asientos contratados.` }, { status: 400 })
        }
      }
    }

    const { data: nuevoUsuario, error: errAuth } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errAuth || !nuevoUsuario.user) return NextResponse.json({ error: errAuth?.message || 'Error al crear usuario' }, { status: 400 })

    // Limpiar perfil huérfano si existe (de intentos previos fallidos)
    await admin.from('perfiles_usuario').delete().eq('id', nuevoUsuario.user.id)

    const { error: errPerfil } = await admin.from('perfiles_usuario').insert({
      id: nuevoUsuario.user.id,
      nombre: nombre || email.split('@')[0],
      razon_social: razon_social || null,
      email_contacto: email,
      is_admin: !!is_admin,
      rol: is_admin ? 'super_admin' : (rol || 'asesor'),
      organizacion_id: organizacion_id || null,
    })
    if (errPerfil) {
      console.log('errPerfil:', JSON.stringify(errPerfil))
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return NextResponse.json({ error: 'Error al crear perfil: ' + errPerfil.message + ' | code: ' + errPerfil.code + ' | details: ' + errPerfil.details }, { status: 400 })
    }

    // Email de bienvenida
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !is_admin) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'KSE Pensiones <noreply@ksepensiones.com>',
          to: [email],
          subject: 'Bienvenido a KSE Pensiones',
          html: `<p>Hola ${nombre},</p><p>Tu cuenta fue creada.<br>Email: ${email}<br>Contraseña: ${password}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://ksepensiones.vercel.app'}">Entrar al sistema</a></p>`
        })
      }).catch(e => console.error('Email error:', e))
    }

    return NextResponse.json({ id: nuevoUsuario.user.id, email, nombre })
  } catch (e: any) {
    console.error('POST error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = req.headers.get('x-uid') || req.nextUrl.searchParams.get('uid')
    if (!uid || !(await verificarAdmin(uid))) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
    if (id === uid) return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })

    const admin = getAdminClient()
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('perfiles_usuario').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { _uid, id, password, is_admin, organizacion_id, rol } = body
    if (!_uid || !(await verificarAdmin(_uid))) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

    const admin = getAdminClient()
    if (password) {
      if (password.length < 6) return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (typeof is_admin === 'boolean') await admin.from('perfiles_usuario').update({ is_admin, rol: is_admin ? 'super_admin' : 'asesor' }).eq('id', id)
    if (organizacion_id !== undefined) await admin.from('perfiles_usuario').update({ organizacion_id: organizacion_id || null }).eq('id', id)
    if (rol) await admin.from('perfiles_usuario').update({ rol }).eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
