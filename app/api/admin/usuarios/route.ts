import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Verifica admin usando JWT de cookies — más seguro que _uid en body
async function verificarAdmin(): Promise<{ id: string } | null> {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cs: any[]) { try { cs.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)) } catch {} },
        },
      }
    )
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null

    const admin = getAdminClient()
    const { data: perfil } = await admin
      .from('perfiles_usuario')
      .select('is_admin, rol')
      .eq('id', user.id)
      .maybeSingle()

    if (perfil?.is_admin || perfil?.rol === 'super_admin' || perfil?.rol === 'org_admin') {
      return { id: user.id }
    }
    return null
  } catch (e: any) {
    console.error('verificarAdmin error:', e.message)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin()
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const body = await req.json()
    const { email, password, nombre, razon_social, is_admin, organizacion_id, rol } = body

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
        await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return NextResponse.json({ error: 'Error al crear perfil: ' + errPerfil.message + ' | code: ' + errPerfil.code + ' | details: ' + errPerfil.details }, { status: 400 })
    }

    // Inicializar catálogos de actividad para el nuevo asesor
    if (!is_admin) {
      try {
        await admin.rpc('inicializar_catalogos_asesor', { p_asesor_id: nuevoUsuario.user.id })
      } catch (e) {
        console.error('Error inicializando catálogos:', e)
        // No es crítico — el asesor puede funcionar sin catálogos
      }
    }

    // Email de bienvenida
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && !is_admin) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ksepensiones.vercel.app'
        const features = [
          ['🤖', 'Lectura automática de constancias IMSS por IA'],
          ['📊', 'Diagnóstico pensional completo (Art. 167 LSS Ley 73)'],
          ['💬', 'Análisis personalizado con Sofía IA'],
          ['📄', 'PDF profesional con tu nombre y logo'],
          ['👥', 'Gestión de tu cartera de clientes'],
        ]
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'KSE Pensiones <onboarding@resend.dev>',
            to: [email],
            subject: '🔷 Bienvenido a KSE Pensiones — Tus credenciales de acceso',
            html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="background:#1B3A6B;padding:28px 32px;text-align:center;border-radius:8px 8px 0 0">
  <div style="font-size:22px;font-weight:900;color:white;letter-spacing:1px">KSE PENSIONES</div>
  <div style="font-size:12px;color:#93C5FD;margin-top:4px;letter-spacing:0.5px">SISTEMA DE DIAGNÓSTICO PENSIONAL</div>
</td></tr>
<tr><td style="background:white;padding:32px">
  <p style="font-size:16px;color:#111827;margin:0 0 8px">Hola, <strong>${nombre || email.split('@')[0]}</strong> 👋</p>
  <p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0 0 24px">Tu cuenta en <strong style="color:#1B3A6B">KSE Pensiones</strong> ha sido creada exitosamente. A partir de ahora puedes generar diagnósticos pensionales profesionales y gestionar tu cartera de clientes.</p>
  <div style="background:#F4F6FB;border:1px solid #E5E7EB;border-left:4px solid #F05B21;border-radius:6px;padding:20px;margin:0 0 24px">
    <p style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px">Tus credenciales de acceso</p>
    <p style="margin:0 0 12px"><span style="font-size:12px;color:#6B7280">📧 Usuario</span><br><span style="font-size:15px;font-weight:700;color:#111827">${email}</span></p>
    <p style="margin:0"><span style="font-size:12px;color:#6B7280">🔑 Contraseña temporal</span><br><span style="font-size:20px;font-weight:900;color:#F05B21;letter-spacing:2px">${password}</span></p>
  </div>
  <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:12px 16px;margin:0 0 24px">
    <p style="font-size:12px;color:#92400E;margin:0">⚠️ <strong>Por seguridad</strong>, cambia tu contraseña en tu primer acceso desde <strong>Configuración → Cambiar contraseña</strong>.</p>
  </div>
  <div style="text-align:center;margin:0 0 24px">
    <a href="${appUrl}" style="display:inline-block;background:#1B3A6B;color:white;padding:14px 32px;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px">Entrar al sistema →</a>
  </div>
  <p style="font-size:12px;font-weight:700;color:#374151;margin:0 0 10px">Con tu cuenta puedes:</p>
  <table width="100%" cellpadding="0" cellspacing="0">${features.map(([icon, text]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:13px;color:#374151">${icon} ${text}</td></tr>`).join('')}</table>
</td></tr>
<tr><td style="background:#1B3A6B;padding:20px 32px;text-align:center;border-radius:0 0 8px 8px">
  <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0">KSE Pensiones · Sistema de Diagnóstico Pensional · México</p>
  <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:6px 0 0">Si no esperabas este correo, ignóralo.</p>
</td></tr>
</table></td></tr></table>
</body></html>`
          })
        })
        const emailData = await emailRes.json()
      } catch (e: any) {
        console.error('Email error:', e.message)
      }
    }

    return NextResponse.json({ id: nuevoUsuario.user.id, email, nombre })
  } catch (e: any) {
    console.error('POST error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin()
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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const solicitante = await verificarAdmin()
    if (!solicitante) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const body = await req.json()
    const { id, password, is_admin, organizacion_id, rol } = body
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
