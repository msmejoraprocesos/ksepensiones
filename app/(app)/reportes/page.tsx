'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import * as XLSX from 'xlsx'

const AZUL = '#1B3A6B', NARANJA = '#F05B21'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtFecha = (s: string | null) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s } }

type Reporte = 'actividad' | 'cartera' | 'financiamientos' | 'diagnosticos'

const REPORTES = [
  { id: 'actividad', label: '📞 Actividad', desc: 'Llamadas, visitas y resultados por período' },
  { id: 'cartera', label: '👥 Cartera de clientes', desc: 'Lista completa con etapa, último contacto y servicio' },
  { id: 'financiamientos', label: '💳 Financiamientos', desc: 'Créditos, pagos, estatus y comisiones' },
  { id: 'diagnosticos', label: '📊 Diagnósticos', desc: 'Diagnósticos generados con datos del cliente' },
]

export default function ReportesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState('')
  const [tipoReporte, setTipoReporte] = useState<Reporte>('cartera')
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10)
  })
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10))
  const [datos, setDatos] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  const [generando, setGenerando] = useState<'excel' | 'pdf' | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
    })
  }, [])

  async function cargarDatos() {
    if (!userId) return
    setCargando(true)
    setDatos([])

    try {
      if (tipoReporte === 'actividad') {
        const { data } = await supabase.from('actividades')
          .select('*, clientes(nombre)')
          .eq('asesor_id', userId)
          .gte('created_at', fechaInicio)
          .lte('created_at', fechaFin + 'T23:59:59')
          .order('created_at', { ascending: false })
        setDatos(data ?? [])

      } else if (tipoReporte === 'cartera') {
        const { data } = await supabase.from('clientes')
          .select('*')
          .eq('asesor_id', userId)
          .order('created_at', { ascending: false })
        setDatos(data ?? [])

      } else if (tipoReporte === 'financiamientos') {
        const { data } = await supabase.from('financiamientos')
          .select('*, clientes(nombre), instituciones_financieras(nombre)')
          .eq('asesor_id', userId)
          .gte('created_at', fechaInicio)
          .lte('created_at', fechaFin + 'T23:59:59')
          .order('created_at', { ascending: false })
        setDatos(data ?? [])

      } else if (tipoReporte === 'diagnosticos') {
        const { data } = await supabase.from('diagnosticos')
          .select('*, clientes(nombre)')
          .eq('asesor_id', userId)
          .gte('created_at', fechaInicio)
          .lte('created_at', fechaFin + 'T23:59:59')
          .order('created_at', { ascending: false })
        setDatos(data ?? [])
      }
    } catch (e) { console.error(e) }
    setCargando(false)
  }

  function getColumnas(): { key: string; label: string; fmt?: (v: any, row: any) => string }[] {
    if (tipoReporte === 'actividad') return [
      { key: 'created_at', label: 'Fecha', fmt: (v) => fmtFecha(v) },
      { key: 'clientes', label: 'Cliente', fmt: (_, r) => r.clientes?.nombre ?? '—' },
      { key: 'tipo_contacto', label: 'Tipo contacto', fmt: (v) => v || r?.tipo || '—' },
      { key: 'titulo', label: 'Título' },
      { key: 'resultado', label: 'Resultado', fmt: (v) => v ?? '—' },
      { key: 'proximo_paso', label: 'Próximo paso', fmt: (v) => v ?? '—' },
      { key: 'estatus', label: 'Estatus' },
      { key: 'notas', label: 'Notas', fmt: (v) => v ?? '—' },
    ]
    if (tipoReporte === 'cartera') return [
      { key: 'nombre', label: 'Cliente' },
      { key: 'nss', label: 'NSS', fmt: (v) => v ?? '—' },
      { key: 'telefono', label: 'Teléfono', fmt: (v) => v ?? '—' },
      { key: 'etapa_kanban', label: 'Etapa' },
      { key: 'tipo_servicio', label: 'Servicio', fmt: (v) => v ?? '—' },
      { key: 'ultimo_contacto', label: 'Último contacto', fmt: (v) => fmtFecha(v) },
      { key: 'created_at', label: 'Alta', fmt: (v) => fmtFecha(v) },
      { key: 'activo', label: 'Activo', fmt: (v) => v === false ? 'No' : 'Sí' },
    ]
    if (tipoReporte === 'financiamientos') return [
      { key: 'created_at', label: 'Fecha', fmt: (v) => fmtFecha(v) },
      { key: 'clientes', label: 'Cliente', fmt: (_, r) => r.clientes?.nombre ?? '—' },
      { key: 'instituciones_financieras', label: 'Institución', fmt: (_, r) => r.instituciones_financieras?.nombre ?? '—' },
      { key: 'monto_total', label: 'Monto', fmt: (v) => fmtMXN(v) },
      { key: 'tasa_anual', label: 'Tasa anual', fmt: (v) => `${v}%` },
      { key: 'plazo_meses', label: 'Plazo (meses)' },
      { key: 'cuota_mensual', label: 'Cuota mensual', fmt: (v) => fmtMXN(v) },
      { key: 'estatus', label: 'Estatus' },
      { key: 'comision_monto', label: 'Comisión', fmt: (v) => v ? fmtMXN(v) : '—' },
      { key: 'comision_cobrada', label: 'Comisión cobrada', fmt: (v) => v ? 'Sí' : 'No' },
    ]
    if (tipoReporte === 'diagnosticos') return [
      { key: 'created_at', label: 'Fecha', fmt: (v) => fmtFecha(v) },
      { key: 'clientes', label: 'Cliente', fmt: (_, r) => r.clientes?.nombre ?? '—' },
      { key: 'estatus', label: 'Estatus' },
      { key: 'semanas_cotizadas', label: 'Semanas', fmt: (v) => v ?? '—' },
      { key: 'edad_actual', label: 'Edad', fmt: (v) => v ?? '—' },
      { key: 'pension_base', label: 'Pensión base', fmt: (v) => v ? fmtMXN(v) : '—' },
      { key: 'pension_con_mod40', label: 'Pensión con Mod.40', fmt: (v) => v ? fmtMXN(v) : '—' },
      { key: 'costo_mod40', label: 'Costo Mod.40', fmt: (v) => v ? fmtMXN(v) : '—' },
    ]
    return []
  }

  function exportarExcel() {
    setGenerando('excel')
    try {
      const cols = getColumnas()
      const rows = datos.map(row => {
        const obj: Record<string, any> = {}
        cols.forEach(col => {
          const val = row[col.key]
          obj[col.label] = col.fmt ? col.fmt(val, row) : (val ?? '—')
        })
        return obj
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, tipoReporte)

      // Ancho de columnas
      const colWidths = cols.map(c => ({ wch: Math.max(c.label.length + 2, 18) }))
      ws['!cols'] = colWidths

      XLSX.writeFile(wb, `KSE_${tipoReporte}_${fechaInicio}_${fechaFin}.xlsx`)
    } catch (e) { console.error(e) }
    setGenerando(null)
  }

  function exportarPDF() {
    setGenerando('pdf')
    try {
      const cols = getColumnas()
      const reporte = REPORTES.find(r => r.id === tipoReporte)

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 20px; }
  .header { background: #1B3A6B; color: white; padding: 16px 20px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { margin: 0; font-size: 16px; }
  .header p { margin: 0; font-size: 11px; opacity: 0.7; }
  .meta { display: flex; gap: 24px; margin-bottom: 16px; font-size: 11px; color: #6B7280; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #1B3A6B; color: white; padding: 6px 8px; text-align: left; font-weight: 700; }
  td { padding: 5px 8px; border-bottom: 1px solid #E5E7EB; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .footer { margin-top: 16px; font-size: 10px; color: #9CA3AF; text-align: center; }
</style>
</head><body>
<div class="header">
  <div><h1>KSE Pensiones — ${reporte?.label}</h1><p>${reporte?.desc}</p></div>
  <div style="text-align:right"><p>Generado: ${new Date().toLocaleDateString('es-MX')}</p><p>${datos.length} registros</p></div>
</div>
${fechaInicio !== fechaFin ? `<div class="meta"><span>Período: ${fmtFecha(fechaInicio)} — ${fmtFecha(fechaFin)}</span></div>` : ''}
<table>
  <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
  <tbody>
    ${datos.map(row => `<tr>${cols.map(col => {
      const val = row[col.key]
      const txt = col.fmt ? col.fmt(val, row) : (val ?? '—')
      return `<td>${txt}</td>`
    }).join('')}</tr>`).join('')}
  </tbody>
</table>
<div class="footer">KSE Pensiones · Sistema de Diagnóstico Pensional · ${new Date().getFullYear()}</div>
</body></html>`

      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => { win.print(); win.close() }, 500)
      }
    } catch (e) { console.error(e) }
    setGenerando(null)
  }

  const cols = getColumnas()
  const r: any = null // para el fmt de actividades

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflowY: 'auto', background: '#F4F6FB', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: '800', color: AZUL, margin: '0 0 4px' }}>📋 Reportes</h1>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>Exporta tu información en Excel o PDF</p>
      </div>

      {/* Controles */}
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: '12px', alignItems: 'flex-end' }}>

          <div>
            <label style={{ fontSize: '10.5px', fontWeight: '700', color: '#6B7280', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const }}>Tipo de reporte</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {REPORTES.map(r => (
                <button key={r.id} onClick={() => { setTipoReporte(r.id as Reporte); setDatos([]) }}
                  style={{ padding: '6px 12px', background: tipoReporte === r.id ? AZUL : 'white', color: tipoReporte === r.id ? 'white' : '#374151', border: `1px solid ${tipoReporte === r.id ? AZUL : '#E5E7EB'}`, fontSize: '12px', fontWeight: tipoReporte === r.id ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {tipoReporte !== 'cartera' && (
            <>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '700', color: '#6B7280', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const }}>Desde</label>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', fontSize: '13px', borderRadius: '6px', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: '700', color: '#6B7280', display: 'block', marginBottom: '4px', textTransform: 'uppercase' as const }}>Hasta</label>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', fontSize: '13px', borderRadius: '6px', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              </div>
            </>
          )}

          <div style={{ gridColumn: tipoReporte === 'cartera' ? '2 / -1' : 'auto', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button onClick={cargarDatos} disabled={cargando || !userId}
              style={{ padding: '8px 16px', background: AZUL, color: 'white', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px', opacity: cargando ? 0.7 : 1, whiteSpace: 'nowrap' as const }}>
              {cargando ? 'Cargando...' : '🔍 Generar'}
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      {datos.length > 0 && (
        <>
          {/* Barra de exportación */}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '13px', color: '#374151', margin: 0, fontWeight: '600' }}>
              {datos.length} registro{datos.length !== 1 ? 's' : ''} encontrado{datos.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={exportarExcel} disabled={generando === 'excel'}
                style={{ padding: '7px 14px', background: '#16A34A', color: 'white', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px', opacity: generando === 'excel' ? 0.7 : 1 }}>
                {generando === 'excel' ? 'Generando...' : '📊 Exportar Excel'}
              </button>
              <button onClick={exportarPDF} disabled={generando === 'pdf'}
                style={{ padding: '7px 14px', background: NARANJA, color: 'white', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '6px', opacity: generando === 'pdf' ? 0.7 : 1 }}>
                {generando === 'pdf' ? 'Generando...' : '📄 Exportar PDF'}
              </button>
            </div>
          </div>

          {/* Tabla de preview */}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {cols.map((col, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: 'left' as const, color: 'white', fontWeight: '700', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', whiteSpace: 'nowrap' as const }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datos.slice(0, 50).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                      {cols.map((col, j) => {
                        const val = row[col.key]
                        const txt = col.fmt ? col.fmt(val, row) : (val ?? '—')
                        return <td key={j} style={{ padding: '7px 12px', color: '#374151', whiteSpace: 'nowrap' as const }}>{txt}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {datos.length > 50 && (
              <div style={{ padding: '10px 16px', background: '#F8FAFC', borderTop: '1px solid #E5E7EB', fontSize: '12px', color: '#6B7280', textAlign: 'center' as const }}>
                Mostrando 50 de {datos.length} registros — el archivo exportado incluye todos
              </div>
            )}
          </div>
        </>
      )}

      {datos.length === 0 && !cargando && (
        <div style={{ background: 'white', border: '1px dashed #D1D5DB', borderRadius: '8px', padding: '48px', textAlign: 'center' as const, color: '#9CA3AF' }}>
          <p style={{ fontSize: '32px', margin: '0 0 8px' }}>📋</p>
          <p style={{ fontSize: '13px', margin: 0 }}>Selecciona un tipo de reporte y haz clic en "Generar"</p>
        </div>
      )}
    </div>
  )
}
