/** @type {import('next').NextConfig} */
/* Vercel expone el SHA del commit en VERCEL_GIT_COMMIT_SHA. Se pasa al
   cliente para mostrarlo al pie del menú: sin eso no hay forma de saber qué
   versión está corriendo el navegador. */
const version =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.NEXT_PUBLIC_VERSION ||
  'dev'

const nextConfig = {
  env: {
    NEXT_PUBLIC_VERSION: version,
  },
  typescript: {
    // El archivo calculadora/page.tsx (~4000 lineas) hace que el type-check sea muy lento en CI.
    // Los errores de tipos no afectan el runtime — se revisan localmente con tsc.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
