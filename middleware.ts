import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAuthRoute = pathname.startsWith('/login') ||
    pathname.startsWith('/reset-password')

  const token = req.cookies.get('sb-jjauccfnewxevknvoccb-auth-token')?.value ||
    req.cookies.get('supabase-auth-token')?.value

  if (!token && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
