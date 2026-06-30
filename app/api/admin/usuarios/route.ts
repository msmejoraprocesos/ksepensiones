import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@supabase/supabase-js'

/**
 * API route protegida: solo un admin autenticado puede crear/listar/eliminar
 * usuarios. Usa SUPABASE_SERVICE_ROLE_KEY (nunca expuesta al cliente) para
 * poder llamar a supabase.auth.admin.*
 */

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en las variables de entorno')
  return createServerSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verificarAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: perfil } = await admin.from('perfiles_usuario').select('is_admin').eq('id', user.id).single()
  if (!perfil?.is_admin) return null
  return user
}

// POST: crear nuevo usuario (asesor o admin)
export async function POST(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado — solo administradores pueden crear usuarios' }, { status: 403 })

    const { email, password, nombre, razon_social, is_admin } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

    const admin = getAdminClient()

    // 1. Crear usuario en Supabase Auth
    const { data: nuevoUsuario, error: errAuth } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errAuth || !nuevoUsuario.user) {
      return NextResponse.json({ error: errAuth?.message || 'Error al crear usuario en Auth' }, { status: 400 })
    }

    // 2. Crear su perfil en perfiles_usuario
    const { error: errPerfil } = await admin.from('perfiles_usuario').insert({
      id: nuevoUsuario.user.id,
      nombre: nombre || email.split('@')[0],
      razon_social: razon_social || null,
      email,
      is_admin: !!is_admin,
    })
    if (errPerfil) {
      // Rollback: si falla el perfil, eliminar el usuario de Auth para no dejar huérfanos
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return NextResponse.json({ error: 'Error al crear el perfil: ' + errPerfil.message }, { status: 400 })
    }

    return NextResponse.json({ id: nuevoUsuario.user.id, email, nombre, is_admin: !!is_admin })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// DELETE: eliminar usuario (?id=uuid)
export async function DELETE(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })
    if (id === solicitante.id) return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })

    const admin = getAdminClient()
    // Orden importante: eliminar primero de Auth. Si esto falla, el perfil
    // permanece intacto (estado consistente). Si elimináramos el perfil primero
    // y luego fallara Auth, quedaría un usuario huérfano que puede iniciar
    // sesión pero sin perfil — rompería el resto de la app.
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('perfiles_usuario').delete().eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// PATCH: cambiar contraseña o rol de un usuario existente
export async function PATCH(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin(req)
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { id, password, is_admin } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })

    const admin = getAdminClient()

    if (password) {
      if (password.length < 6) return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (typeof is_admin === 'boolean') {
      await admin.from('perfiles_usuario').update({ is_admin }).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
