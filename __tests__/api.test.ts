import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// ── Setup de mocks ANTES de importar los módulos ─────────────────────────────

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'admin-uuid-123' } }, error: null,
      }),
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { id: 'admin-uuid-123', email: 'admin@test.com' } }, error: null,
        }),
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'new-user-456', email: 'asesor@test.com' } }, error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: true, rol: 'super_admin', organizacion_id: null }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_admin: true, rol: 'super_admin' }, error: null }),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    })),
  })),
}))

// Mock Anthropic SDK — constructor mock correcto para Vitest
const MOCK_RESPONSE = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      nombre: 'Juan Pérez López',
      nss: '12345678901',
      fecha_nac: '1965-03-15',
      semanas: 1677,
      cotizo_antes_97: true,
      cotizo_despues_97: false,
      primer_empleo: '1985-01-01',
      ultima_cotizacion: '2026-03-06',
      fecha_emision: '2026-03-10',
      periodos: [
        { fecha_inicio: '2020-01-01', fecha_fin: '2026-03-06', sdi: 520.02, semanas: 323, patron: 'Empresa SA' },
        { fecha_inicio: '2010-01-01', fecha_fin: '2019-12-31', sdi: 350.00, semanas: 521, patron: 'Anterior SA' },
      ]
    })
  }],
  usage: { input_tokens: 1500, output_tokens: 300 },
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    }
  }
}))

// Helper para crear NextRequest
function makeReq(method: string, body?: object, searchParams?: string): NextRequest {
  const url = `http://localhost/api/test${searchParams ? '?' + searchParams : ''}`
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer fake-valid-token',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS: Validaciones de negocio del API de usuarios
// ══════════════════════════════════════════════════════════════════════════════

describe('API /admin/usuarios — Validaciones de negocio', () => {

  it('sin _uid retorna 403', async () => {
    const { POST } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('POST', { email: 'test@test.com', password: 'Password1!x', nombre: 'Test', telefono: '1234567890' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('email es requerido para crear usuario', async () => {
    const { POST } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('POST', { _uid: 'admin-uuid-123', password: 'Password1!x', nombre: 'Test', telefono: '1234567890' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('password es requerida para crear usuario', async () => {
    const { POST } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('POST', { _uid: 'admin-uuid-123', email: 'test@test.com', nombre: 'Test', telefono: '1234567890' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('password mínimo 10 caracteres', async () => {
    const { POST } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('POST', { _uid: 'admin-uuid-123', email: 'test@test.com', password: '123', nombre: 'Test', telefono: '1234567890' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('no puede eliminarse a sí mismo', async () => {
    const { DELETE } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('DELETE', undefined, 'id=admin-uuid-123')
    req.headers.set('x-uid', 'admin-uuid-123')
    const res = await DELETE(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propia cuenta/)
  })

  it('falta id en DELETE retorna 400', async () => {
    const { DELETE } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('DELETE')
    req.headers.set('x-uid', 'admin-uuid-123')
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('password corta en PATCH retorna 400', async () => {
    const { PATCH } = await import('../app/api/admin/usuarios/route')
    const req = makeReq('PATCH', { _uid: 'admin-uuid-123', id: 'other-uuid', password: '12' })
    const res = await PATCH(req)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toMatch(/6 caracteres/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TESTS: /api/extract-nss — Estructura de respuesta
// ══════════════════════════════════════════════════════════════════════════════

describe('API /extract-nss — Estructura de respuesta', () => {

  it('rechaza si no se envía PDF', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { asesor_id: 'uuid-123' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('extrae nombre del trabajador', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'base64fakedata==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(json.nombre).toBe('Juan Pérez López')
  })

  it('extrae NSS como string', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'base64data==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(typeof json.nss).toBe('string')
    expect(json.nss.length).toBeGreaterThan(0)
  })

  it('extrae semanas como número', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'base64data==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(typeof json.semanas).toBe('number')
    expect(json.semanas).toBeGreaterThan(0)
  })

  it('extrae cotizo_antes_97 como boolean', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'base64data==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(typeof json.cotizo_antes_97).toBe('boolean')
  })

  it('extrae periodos como array con sdi y semanas', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'base64data==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(Array.isArray(json.periodos)).toBe(true)
    expect(json.periodos.length).toBeGreaterThan(0)
    expect(json.periodos[0]).toHaveProperty('sdi')
    expect(json.periodos[0]).toHaveProperty('semanas')
    expect(json.periodos[0]).toHaveProperty('fecha_inicio')
    expect(json.periodos[0]).toHaveProperty('fecha_fin')
  })

  it('fecha_nac en formato YYYY-MM-DD', async () => {
    const { POST } = await import('../app/api/extract-nss/route')
    const req = makeReq('POST', { pdf: 'data==', asesor_id: 'uuid' })
    const res = await POST(req)
    const json = await res.json()
    expect(json.fecha_nac).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
