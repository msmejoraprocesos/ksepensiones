// Setup global para todos los tests de integración
import { vi } from 'vitest'

// Variables de entorno necesarias para los API routes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
