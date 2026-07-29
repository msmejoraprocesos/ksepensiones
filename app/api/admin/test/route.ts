import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const info: any = {
    has_url: !!url,
    has_service_key: !!serviceKey,
    service_key_length: serviceKey?.length,
    has_token: !!token,
    token_length: token?.length,
  }

  if (serviceKey && url && token) {
    try {
      const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: { user }, error } = await admin.auth.getUser(token)
      info.token_valid = !error
      info.token_error = error?.message
      info.user_id = user?.id?.slice(0, 8) + '...'
      if (user) {
        const { data: perfil } = await admin.from('perfiles_usuario').select('is_admin, rol').eq('id', user.id).single()
        info.perfil_is_admin = perfil?.is_admin
        info.perfil_rol = perfil?.rol
      }
    } catch (e: any) { info.exception = e.message }
  }

  return NextResponse.json(info)
}
