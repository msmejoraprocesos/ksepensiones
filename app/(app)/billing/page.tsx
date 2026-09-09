'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const BORDE = '#E2E8F0'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

interface Org {
  id: string
  nombre: string
  plan: string
  asientos: number
  vigencia_hasta: string | null
  cancelar_al_periodo: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

const PLANES = [
  {
    id: 'individual',
    nombre: 'Individual',
    desc: 'Para asesores independientes',
    asientos: 1,
    precio_mensual: 999,
    precio_anual: 9990,
    features: [
      'Calculadora pensional completa',
      'Diagnósticos ilimitados',
      'PDF profesional',
      'Sofía IA incluida',
      '1 asesor',
    ],
    color: AZUL,
  },
  {
    id: 'equipo',
    nombre: 'Equipo',
    desc: 'Para despachos y equipos',
    asientos: 5,
    precio_mensual: 3499,
    precio_anual: 34990,
    features: [
      'Todo lo de Individual',
      'Hasta 5 asesores',
      'Panel org-admin',
      'Reportes consolidados',
      'Canalizaciones entre asesores',
    ],
    color: VERDE,
    popular: true,
  },
  {
    id: 'enterprise',
    nombre: 'Enterprise',
    desc: 'Para empresas grandes',
    asientos: 20,
    precio_mensual: 9999,
    precio_anual: 99990,
    features: [
      'Todo lo de Equipo',
      'Hasta 20 asesores',
      'Integración WhatsApp',
      'Soporte prioritario',
      'Personalización de marca',
    ],
    color: '#7C3AED',
  },
]

export default function BillingPage() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'mensual' | 'anual'>('mensual')
  const [procesando, setProcesando] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    cargar()
    if (params.get('success')) setMsg('✅ ¡Suscripción activada con éxito! Bienvenido a KSE Pensiones Pro.')
    if (params.get('canceled')) setMsg('Pago cancelado. Puedes intentarlo de nuevo cuando quieras.')
  }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: perfil } = await supabase.from('perfiles_usuario').select('organizacion_id').eq('id', user.id).single()
    if (!perfil?.organizacion_id) { setLoading(false); return }
    const { data } = await supabase.from('organizaciones').select('*').eq('id', perfil.organizacion_id).single()
    setOrg(data)
    setLoading(false)
  }

  async function iniciarPago(planId: string) {
    setProcesando(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, periodo }),
      })
      const { url, error } = await res.json()
      if (error) { setMsg(`Error: ${error}`); return }
      window.location.href = url
    } catch (e) {
      setMsg('Error de conexión. Intenta de nuevo.')
    } finally {
      setProcesando('')
    }
  }

  async function abrirPortal() {
    setProcesando('portal')
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { setMsg(error); setProcesando(''); return }
    window.location.href = url
  }

  const vigente = org?.vigencia_hasta ? new Date(org.vigencia_hasta) > new Date() : false
  const diasRestantes = org?.vigencia_hasta
    ? Math.ceil((new Date(org.vigencia_hasta).getTime() - Date.now()) / 86400000)
    : 0

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94A3B8' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: '0 0 6px' }}>
          Suscripción y facturación
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          Gestiona tu plan, método de pago e historial de facturas.
        </p>
      </div>

      {/* Mensaje de estado */}
      {msg && (
        <div style={{ padding: '12px 16px', background: msg.startsWith('✅') ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${msg.startsWith('✅') ? '#86EFAC' : '#FCA5A5'}`, borderRadius: '8px', fontSize: '13px', color: msg.startsWith('✅') ? '#065F46' : '#B91C1C', marginBottom: '20px' }}>
          {msg}
        </div>
      )}

      {/* Estado actual */}
      {org && (
        <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${BORDE}`, padding: '18px 20px', marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px', fontWeight: '600' }}>Plan actual</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: '800', color: AZUL, textTransform: 'capitalize' }}>{org.plan}</span>
              {vigente ? (
                <span style={{ fontSize: '11px', padding: '3px 8px', background: '#F0FDF4', color: VERDE, border: '1px solid #86EFAC', borderRadius: '4px', fontWeight: '600' }}>
                  ✓ Activo — {diasRestantes} días restantes
                </span>
              ) : (
                <span style={{ fontSize: '11px', padding: '3px 8px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: '4px', fontWeight: '600' }}>
                  ⚠ Sin suscripción activa
                </span>
              )}
              {org.cancelar_al_periodo && (
                <span style={{ fontSize: '11px', padding: '3px 8px', background: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D', borderRadius: '4px' }}>
                  Cancela el {new Date(org.vigencia_hasta!).toLocaleDateString('es-MX')}
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '6px 0 0' }}>
              {org.asientos} asiento{org.asientos !== 1 ? 's' : ''} • Organización: {org.nombre}
            </p>
          </div>
          {org.stripe_subscription_id && (
            <button onClick={abrirPortal} disabled={procesando === 'portal'}
              style={{ padding: '8px 16px', background: '#F8FAFC', color: '#374151', border: `1px solid ${BORDE}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              {procesando === 'portal' ? 'Abriendo...' : '⚙ Gestionar suscripción'}
            </button>
          )}
        </div>
      )}

      {/* Toggle mensual/anual */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'center' }}>
        <span style={{ fontSize: '13px', color: periodo === 'mensual' ? AZUL : '#94A3B8', fontWeight: periodo === 'mensual' ? '700' : '400' }}>Mensual</span>
        <button onClick={() => setPeriodo(p => p === 'mensual' ? 'anual' : 'mensual')}
          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: AZUL, position: 'relative', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: '3px', left: periodo === 'anual' ? '23px' : '3px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'left 0.2s' }} />
        </button>
        <span style={{ fontSize: '13px', color: periodo === 'anual' ? AZUL : '#94A3B8', fontWeight: periodo === 'anual' ? '700' : '400' }}>
          Anual <span style={{ fontSize: '11px', background: '#F0FDF4', color: VERDE, padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>−2 meses gratis</span>
        </span>
      </div>

      {/* Cards de planes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {PLANES.map(plan => {
          const precio = periodo === 'anual' ? plan.precio_anual : plan.precio_mensual
          const precioMes = periodo === 'anual' ? Math.round(plan.precio_anual / 12) : plan.precio_mensual
          const esCurrent = org?.plan === plan.id
          const color = plan.color

          return (
            <div key={plan.id} style={{
              background: 'white', borderRadius: '12px',
              border: esCurrent ? `2px solid ${color}` : plan.popular ? `2px solid ${color}` : `1px solid ${BORDE}`,
              boxShadow: plan.popular ? `0 4px 16px ${color}22` : '0 1px 3px rgba(0,0,0,0.06)',
              overflow: 'hidden', position: 'relative'
            }}>
              {plan.popular && (
                <div style={{ background: color, padding: '6px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: 'white', letterSpacing: '0.5px' }}>
                  MÁS POPULAR
                </div>
              )}
              {esCurrent && (
                <div style={{ background: color, padding: '6px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: 'white', letterSpacing: '0.5px' }}>
                  ✓ PLAN ACTUAL
                </div>
              )}
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: color, margin: '0 0 4px' }}>{plan.nombre}</h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 16px' }}>{plan.desc}</p>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '28px', fontWeight: '800', color: '#111827' }}>{fmtMXN(precioMes)}</span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>/mes</span>
                  {periodo === 'anual' && (
                    <div style={{ fontSize: '11px', color: VERDE, marginTop: '2px' }}>
                      {fmtMXN(precio)}/año (−{fmtMXN(plan.precio_mensual * 12 - precio)})
                    </div>
                  )}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{ fontSize: '12px', color: '#374151', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <span style={{ color: color, fontWeight: '700', flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => iniciarPago(plan.id)} disabled={!!procesando || esCurrent}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                    background: esCurrent ? '#F8FAFC' : color, color: esCurrent ? '#94A3B8' : 'white',
                    fontSize: '13px', fontWeight: '700', cursor: esCurrent ? 'default' : 'pointer',
                    fontFamily: 'inherit', opacity: procesando && procesando !== plan.id ? 0.5 : 1,
                  }}>
                  {procesando === plan.id ? 'Procesando...' : esCurrent ? 'Plan actual' : 'Seleccionar plan'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', marginTop: '24px' }}>
        Pagos seguros procesados por Stripe • Cancela cuando quieras • 14 días de prueba gratuita para nuevas cuentas
      </p>
    </div>
  )
}
