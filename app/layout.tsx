import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

/**
 * Inter — tipografía del sistema de diseño (docs/rediseno/SISTEMA-DISENO.md).
 * Antes se declaraba 'Segoe UI', que solo existe en Windows: en Mac caía a
 * San Francisco y en Android a Roboto, así que la aplicación se veía distinta
 * en cada sistema operativo.
 *
 * next/font descarga y autohospeda el archivo en build: no hay petición a
 * Google en tiempo de ejecución ni salto de texto al cargar.
 *
 * 'cv05' y 'ss01' activan la l con cola y la a de un piso, que mejoran la
 * distinción entre l, I y 1 — relevante en una aplicación llena de cifras.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'sans-serif'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /* Se permite el acercamiento hasta 5x: bloquearlo en una aplicación llena
     de cifras deja fuera a quien necesita ampliar para leerlas. */
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0D2440',
}

export const metadata: Metadata = {
  title: 'KSE Pensiones',
  description: 'CRM especializado en diagnóstico pensional para asesores en México',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  /* Instalable: en la tablet o el teléfono del asesor abre sin barra del
     navegador, que en pantallas chicas roba altura útil. */
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'KSE Pensiones',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className={inter.className} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
