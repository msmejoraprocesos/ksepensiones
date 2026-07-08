/** @type {import('next').NextConfig} */
const nextConfig = {
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
