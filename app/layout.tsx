import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'KSE Pensiones',
  description: 'CRM especializado en diagnóstico pensional para asesores en México',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
