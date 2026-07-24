'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21', VERDE = '#2E8B57'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtUSD = (n: number) => `$${(n || 0).toFixed(4)} USD`
const fmtNum = (n: number) => new Intl.NumberFormat('es-MX').format(n || 0)

export default function SuperAdminDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'7d' | '30d' | '90d' | 'total'>('30d')

  // Stats
  const [stats, setStats] = useState({
    totalAsesores: 0, asesoresActivos: 0,
    totalOrgs: 0, orgsActivas: 0,
    totalClientes: 0, totalDiags: 0, diagAutorizados: 0,
    costoIATotal: 0, costoIAExtraccion: 0, costoIAAnalisis: 0,
    tokensTotal: 0, llamadasIA: 0,
  })
  const [asesoresStats, setAsesoresStats] = useState<any[]>([])
  const [orgsStats, setOrgsStats] = useState<any[]>([])
  const [usoIAPorDia, setUsoIAPorDia] = useState<any[]>([])
  const [vencimientos, setVencimientos] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles_usuario').select('rol').eq('id', session.user.id).single()
      if (p?.rol !== 'super_admin') { router.push('/dashboard'); return }
      await loadAll()
      setLoading(false)
    })
  }, [periodo])

  async function loadAll() {
    const fechaDesde = periodo === 'total' ? '2020-01-01' :
      new Date(Date.now() - (periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90) * 86400000).toISOString()

    const [
      { data: asesores },
      { data: orgs },
      { data: clientes },
      { data: diags },
      { data: usoIA },
    ] = await Promise.all([
      supabase.from('perfiles_usuario').select('id, nombre, email, organizacion_id, rol, created_at'),
      supabase.from('organizaciones').select('*'),
      supabase.from('clientes').select('id, asesor_id, created_at').gte('created_at', fechaDesde),
      supabase.from('diagnosticos').select('id, asesor_id, estatus, created_at').gte('created_at', fechaDesde),
      supabase.from('uso_ia').select('*').gte('created_at', fechaDesde),
    ])

    const asesoresFiltrados = (asesores ?? []).filter((a: any) => a.rol !== 'super_admin')
    const costoTotal = (usoIA ?? []).reduce((s: number, u: any) => s + (u.costo_total_usd ?? 0), 0)
    const costoExtraccion = (usoIA ?? []).filter((u: any) => u.tipo === 'extraccion_constancia').reduce((s: number, u: any) => s + (u.costo_total_usd ?? 0), 0)
    const costoAnalisis = (usoIA ?? []).filter((u: any) => u.tipo === 'analisis_pensional').reduce((s: number, u: any) => s + (u.costo_total_usd ?? 0), 0)
    const tokensTotal = (usoIA ?? []).reduce((s: number, u: any) => s + (u.tokens_total ?? 0), 0)

    setStats({
      totalAsesores: asesoresFiltrados.length,
      asesoresActivos: asesoresFiltrados.filter((a: any) => (clientes ?? []).some((c: any) => c.asesor_id === a.id)).length,
      totalOrgs: (orgs ?? []).length,
      orgsActivas: (orgs ?? []).filter((o: any) => o.activo).length,
      totalClientes: (clientes ?? []).length,
      totalDiags: (diags ?? []).length,
      diagAutorizados: (diags ?? []).filter((d: any) => d.estatus === 'autorizado').length,
      costoIATotal: costoTotal,
      costoIAExtraccion: costoExtraccion,
      costoIAAnalisis: costoAnalisis,
      tokensTotal,
      llamadasIA: (usoIA ?? []).length,
    })

    // Stats por asesor
    const byAsesor = asesoresFiltrados.map((a: any) => {
      const misClientes = (clientes ?? []).filter((c: any) => c.asesor_id === a.id).length
      const misDiags = (diags ?? []).filter((d: any) => d.asesor_id === a.id).length
      const misLlamadas = (usoIA ?? []).filter((u: any) => u.asesor_id === a.id)
      const miCosto = misLlamadas.reduce((s: number, u: any) => s + (u.costo_total_usd ?? 0), 0)
      const org = (orgs ?? []).find((o: any) => o.id === a.organizacion_id)
      return { ...a, clientes: misClientes, diagnosticos: misDiags, costo_ia: miCosto, org_nombre: org?.nombre ?? '—' }
    }).sort((a: any, b: any) => b.diagnosticos - a.diagnosticos)
    setAsesoresStats(byAsesor)

    // Stats por org
    const byOrg = (orgs ?? []).map((o: any) => {
      const asesoresOrg = asesoresFiltrados.filter((a: any) => a.organizacion_id === o.id)
      const ids = asesoresOrg.map((a: any) => a.id)
      const cliOrg = (clientes ?? []).filter((c: any) => ids.includes(c.asesor_id)).length
      const diagOrg = (diags ?? []).filter((d: any) => ids.includes(d.asesor_id)).length
      const costoOrg = (usoIA ?? []).filter((u: any) => ids.includes(u.asesor_id)).reduce((s: number, u: any) => s + (u.costo_total_usd ?? 0), 0)
      return { ...o, asesores: asesoresOrg.length, clientes: cliOrg, diagnosticos: diagOrg, costo_ia: costoOrg }
    }).sort((a: any, b: any) => b.diagnosticos - a.diagnosticos)
    setOrgsStats(byOrg)

    // Uso IA por día (últimos 14 días)
    const porDia: Record<string, number> = {}
    ;(usoIA ?? []).forEach((u: any) => {
      const dia = u.created_at?.slice(0, 10)
      if (dia) porDia[dia] = (porDia[dia] ?? 0) + (u.costo_total_usd ?? 0)
    })
    const dias = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
    setUsoIAPorDia(dias)

    // Vencimientos próximos (30 días)
    const en30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const hoy = new Date().toISOString().slice(0, 10)
    const proxVenc = (orgs ?? []).filter((o: any) => o.fecha_vencimiento && o.fecha_vencimiento >= hoy && o.fecha_vencimiento <= en30dias)
    setVencimientos(proxVenc)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#9CA3AF' }}>Cargando dashboard...</div>

  const CARD = { background: 'white', border: '1px solid #E5E7EB', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const LABEL = { fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB' }}>

      {/* Header */}
      <div style={{ position: 'sticky' as const, top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '800' as const, color: AZUL, margin: 0 }}>🏠 Dashboard de Negocio</h1>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>Solo visible para ti — super_admin</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['7d', '30d', '90d', 'total'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              style={{ padding: '5px 12px', background: periodo === p ? AZUL : '#F4F6FB', color: periodo === p ? 'white' : '#6B7280', border: `1px solid ${periodo === p ? AZUL : '#E5E7EB'}`, fontSize: '11px', fontWeight: (periodo === p ? '700' : '400') as const, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p === '7d' ? 'Últimos 7 días' : p === '30d' ? 'Últimos 30 días' : p === '90d' ? 'Últimos 90 días' : 'Todo'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: '20px' }}>

        {/* Alertas de vencimiento */}
        {vencimientos.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '2px solid #FCA5A5', borderLeft: '4px solid #DC2626', padding: '12px 16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#991B1B', margin: '0 0 6px' }}>⚠️ {vencimientos.length} organización(es) vencen en los próximos 30 días</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
              {vencimientos.map((o: any) => (
                <span key={o.id} style={{ padding: '3px 10px', background: 'white', border: '1px solid #FCA5A5', fontSize: '11px', color: '#991B1B' }}>
                  {o.nombre} — vence {o.fecha_vencimiento}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* KPIs principales */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Asesores totales', value: fmtNum(stats.totalAsesores), sub: `${stats.asesoresActivos} activos en el periodo`, color: AZUL },
            { label: 'Organizaciones', value: fmtNum(stats.totalOrgs), sub: `${stats.orgsActivas} activas`, color: '#7C3AED' },
            { label: 'Clientes nuevos', value: fmtNum(stats.totalClientes), sub: 'en el periodo', color: NARANJA },
            { label: 'Diagnósticos', value: fmtNum(stats.totalDiags), sub: `${stats.diagAutorizados} autorizados`, color: VERDE },
          ].map((k, i) => (
            <div key={i} style={{ ...CARD, borderLeft: `3px solid ${k.color}` }}>
              <div style={LABEL}>{k.label}</div>
              <div style={{ fontSize: '28px', fontWeight: '800' as const, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* KPIs de IA */}
        <div>
          <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#374151', margin: '0 0 10px' }}>💡 Costo de Inteligencia Artificial</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
            {[
              { label: 'Costo total IA', value: fmtUSD(stats.costoIATotal), color: '#DC2626', big: true },
              { label: 'Extracción constancias', value: fmtUSD(stats.costoIAExtraccion), color: '#F59E0B' },
              { label: 'Análisis Sofía IA', value: fmtUSD(stats.costoIAAnalisis), color: '#7C3AED' },
              { label: 'Tokens totales', value: fmtNum(stats.tokensTotal), color: '#6B7280' },
              { label: 'Llamadas a la API', value: fmtNum(stats.llamadasIA), color: '#6B7280' },
            ].map((k, i) => (
              <div key={i} style={{ ...CARD, borderTop: `3px solid ${k.color}` }}>
                <div style={LABEL}>{k.label}</div>
                <div style={{ fontSize: k.big ? '20px' : '14px', fontWeight: '800' as const, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '6px 0 0' }}>
            Precios: claude-sonnet-4-6 · Entrada $3.00/MTok · Salida $15.00/MTok · Costo por diagnóstico completo ≈ {stats.llamadasIA > 0 ? fmtUSD(stats.costoIATotal / stats.llamadasIA) : '$0.0000 USD'}
          </p>
        </div>

        {/* Dos columnas: asesores + orgs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Por asesor */}
          <div style={CARD}>
            <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Actividad por asesor</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Asesor', 'Org', 'Clientes', 'Diags', 'Costo IA'].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: (i > 1 ? 'right' : 'left') as const, fontWeight: '700' as const, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asesoresStats.slice(0, 10).map((a: any, i: number) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: '600' as const, color: '#111827' }}>{a.nombre || a.email}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280', fontSize: '10px' }}>{a.org_nombre}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: AZUL, fontWeight: '600' as const }}>{a.clientes}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: VERDE, fontWeight: '600' as const }}>{a.diagnosticos}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: '#DC2626', fontSize: '10px' }}>{a.costo_ia > 0 ? fmtUSD(a.costo_ia) : '—'}</td>
                  </tr>
                ))}
                {asesoresStats.length === 0 && <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' as const, color: '#9CA3AF' }}>Sin actividad en el periodo</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Por organización */}
          <div style={CARD}>
            <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Actividad por organización</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Organización', 'Plan', 'Asesores', 'Diags', 'Costo IA'].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: (i > 1 ? 'right' : 'left') as const, fontWeight: '700' as const, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgsStats.map((o: any, i: number) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                    <td style={{ padding: '6px 8px', fontWeight: '600' as const, color: '#111827' }}>{o.nombre}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280', textTransform: 'capitalize' as const, fontSize: '10px' }}>{o.plan}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: '#7C3AED', fontWeight: '600' as const }}>{o.asesores}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: VERDE, fontWeight: '600' as const }}>{o.diagnosticos}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' as const, color: '#DC2626', fontSize: '10px' }}>{o.costo_ia > 0 ? fmtUSD(o.costo_ia) : '—'}</td>
                  </tr>
                ))}
                {orgsStats.length === 0 && <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center' as const, color: '#9CA3AF' }}>Sin organizaciones</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Costo IA por día */}
        {usoIAPorDia.length > 0 && (
          <div style={CARD}>
            <p style={{ fontSize: '13px', fontWeight: '700' as const, color: '#374151', margin: '0 0 12px' }}>Costo IA diario (últimos 14 días)</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
              {(() => {
                const max = Math.max(...usoIAPorDia.map(([, v]) => v as number), 0.001)
                return usoIAPorDia.map(([dia, costo]: any) => (
                  <div key={dia} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px' }}>
                    <div title={`${dia}: ${fmtUSD(costo)}`} style={{ width: '100%', height: `${Math.max(4, (costo / max) * 60)}px`, background: AZUL, opacity: 0.8 }} />
                    <span style={{ fontSize: '8px', color: '#9CA3AF', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' as const }}>{dia.slice(5)}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
