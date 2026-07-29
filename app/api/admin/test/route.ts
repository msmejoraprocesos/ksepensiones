import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const authHeader = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  const customHeader = req.headers.get('x-admin-token')?.trim()

  return NextResponse.json({
    has_url: !!url,
    has_service_key: !!serviceKey,
    service_key_length: serviceKey?.length,
    auth_header_present: !!authHeader,
    auth_header_length: authHeader?.length,
    custom_header_present: !!customHeader,
    note: 'Abre el sistema, haz F12 Console y ejecuta: supabase.auth.getSession().then(s => console.log(s.data.session?.access_token?.length))',
  })
}
