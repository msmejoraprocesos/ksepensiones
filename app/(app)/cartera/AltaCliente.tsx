'use client'
import React, { useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { K, nw, num, botonPrimario } from '@/lib/design-tokens'
import { cotizar, calcularNuevaVigencia, type TramoPrecio } from '@/lib/cartera'
import { useValidacion, reglas } from '@/app/hooks/useValidacion'
import { useConfirmarCierre } from '@/app/hooks/useConfirmarCierre'

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

/** Contraseña temporal legible: se dicta por teléfono sin confusiones. */
function generarPassword(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyz'   // sin l ni o
  const nums = '23456789'                      // sin 0 ni 1
  const p = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('')
  return `${p(letras, 4)}-${p(nums, 4)}-${p(letras, 4)}`
}

const campo: React.CSSProperties = {
  width: '100%', height: 46, border: `1px solid ${K.line}`, borderRadius: 10,
  padding: '0 12px', fontSize: 17, fontFamily: 'inherit', color: K.ink,
  fontWeight: 600, boxSizing: 'border-box', outline: 'none', background: K.card,
}

interface Props {
  tramos: TramoPrecio[]
  onCreado: () => void
  onCerrar: () => void
}

export default function AltaCliente({ tramos, onCreado, onCerrar }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [empresa, setEmpresa] = useState('')
  const [usuarios, setUsuarios] = useState(1)
  const [periodicidad, setPeriodicidad] = useState<'mensual' | 'anual'>('mensual')
  const [diasTolerancia, setDiasTolerancia] = useState(5)
  const [adminNombre, setAdminNombre] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminTel, setAdminTel] = useState('')
  const [pagoRecibido, setPagoRecibido] = useState(true)
  const [password] = useState(generarPassword)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cot = useMemo(() => cotizar(usuarios, periodicidad, tramos), [usuarios, periodicidad, tramos])

  const v = useValidacion(
    { empresa, adminNombre, adminEmail, adminTel, usuarios },
    {
      empresa:     [reglas.requerido('El nombre de la empresa')],
      adminNombre: [reglas.requerido('El nombre del administrador')],
      adminEmail:  [reglas.requerido('El correo'), reglas.correo()],
      adminTel:    [reglas.telefono(10)],
      usuarios:    [reglas.minimo(1, 'Los usuarios contratados')],
    }
  )

  /* Cerrar por error tras llenar el formulario obliga a recapturar todo.
     Se confirma solo si ya hay algo escrito. */
  const hayDatos = !!(empresa.trim() || adminNombre.trim() || adminEmail.trim() || adminTel.trim())
  const intentarCerrar = useConfirmarCierre(hayDatos, onCerrar)

  async function crear() {
    if (!v.validarAntesDeEnviar()) return
    setGuardando(true); setError('')

    /* El orden importa: si el alta del usuario falla, no debe quedar una
       organización huérfana cobrando asientos que nadie usa. Por eso se
       revierte la organización si el usuario no se crea. */
    const { data: org, error: eOrg } = await supabase
      .from('organizaciones')
      .insert({
        nombre: empresa.trim(),
        asientos: cot.usuarios,
        plan: periodicidad,
        activo: pagoRecibido,
        dias_gracia: diasTolerancia,
        vigencia_hasta: pagoRecibido ? calcularNuevaVigencia(null, periodicidad) : null,
      })
      .select()
      .single()

    if (eOrg || !org) {
      setGuardando(false)
      setError('No se pudo crear la organización. ' + (eOrg?.message ?? ''))
      return
    }

    const { error: eContrato } = await supabase.from('contratos').insert({
      organizacion_id: org.id,
      periodicidad,
      monto: cot.totalPeriodo,
      asientos: cot.usuarios,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      dias_tolerancia: diasTolerancia,
      estado: 'activo',
    })

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        email: adminEmail.trim(), password, nombre: adminNombre.trim(),
        telefono: adminTel.trim(), rol: 'org_admin', organizacion_id: org.id,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      await supabase.from('organizaciones').delete().eq('id', org.id)
      setGuardando(false)
      setError(`No se pudo crear el administrador, así que se canceló el alta completa. ${data.error ?? ''}`)
      return
    }

    if (pagoRecibido) {
      await supabase.from('pagos_contrato').insert({
        contrato_id: (await supabase.from('contratos').select('id').eq('organizacion_id', org.id).single()).data?.id,
        monto: cot.totalPeriodo,
        periodo_cubierto_hasta: calcularNuevaVigencia(null, periodicidad),
        metodo: 'registrado en alta',
      })
    }

    setGuardando(false)
    onCreado()
  }

  const Etq = ({ children }: { children: React.ReactNode }) => (
    <span style={{ display: 'block', fontSize: 13, color: K.muted, marginBottom: 5 }}>{children}</span>
  )

  return (
    <div onClick={intentarCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(13,36,64,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: K.card, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ padding: '22px 26px', borderBottom: `1px solid ${K.line}` }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: K.ink, margin: 0 }}>Alta de cliente</p>
          <p style={{ fontSize: 15, color: K.muted, margin: '4px 0 0' }}>
            Crea la organización, su contrato y el usuario administrador, que recibirá sus credenciales por correo.
          </p>
        </div>

        <div style={{ padding: '22px 26px' }}>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <Etq>Nombre de la empresa o persona</Etq>
            <input value={empresa} onChange={e => setEmpresa(e.target.value)} onBlur={() => v.tocar('empresa')}
              style={{ ...campo, borderColor: v.errorDe('empresa') ? K.red : K.line }} placeholder="Ej. Despacho Hernández" />
            {v.errorDe('empresa') && <span style={{ display: 'block', fontSize: 13, color: K.red, marginTop: 5 }}>{v.errorDe('empresa')}</span>}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
            <label>
              <Etq>Usuarios contratados</Etq>
              <input type="number" min={1} value={usuarios} onChange={e => setUsuarios(Number(e.target.value) || 1)} style={campo} />
            </label>
            <label>
              <Etq>Periodicidad</Etq>
              <select value={periodicidad} onChange={e => setPeriodicidad(e.target.value as any)} style={{ ...campo, cursor: 'pointer' }}>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select>
            </label>
            <label>
              <Etq>Días de tolerancia</Etq>
              <input type="number" min={0} value={diasTolerancia} onChange={e => setDiasTolerancia(Number(e.target.value) || 0)} style={campo} />
            </label>
          </div>

          <div style={{ background: K.navy900, borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.56)', margin: 0 }}>Total {periodicidad}</p>
            <p style={{ fontSize: 34, fontWeight: 800, color: '#fff', margin: '3px 0 0', lineHeight: 1, ...nw, ...num }}>{mxn(cot.totalPeriodo)}</p>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.68)', margin: '6px 0 0', ...num }}>
              {cot.usuarios} × {mxn(cot.precioUsuario)} por usuario
            </p>
          </div>

          <p style={{ fontSize: 17, fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>Administrador de la cuenta</p>
          <p style={{ fontSize: 13, color: K.muted, margin: '0 0 14px' }}>
            Él dará de alta al resto de su equipo desde su propio panel, hasta agotar los {cot.usuarios} asientos.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <label><Etq>Nombre</Etq>
              <input value={adminNombre} onChange={e => setAdminNombre(e.target.value)} onBlur={() => v.tocar('adminNombre')}
                style={{ ...campo, borderColor: v.errorDe('adminNombre') ? K.red : K.line }} />
              {v.errorDe('adminNombre') && <span style={{ display: 'block', fontSize: 13, color: K.red, marginTop: 5 }}>{v.errorDe('adminNombre')}</span>}
            </label>
            <label><Etq>Correo</Etq>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} onBlur={() => v.tocar('adminEmail')}
                style={{ ...campo, borderColor: v.errorDe('adminEmail') ? K.red : K.line }} />
              {v.errorDe('adminEmail') && <span style={{ display: 'block', fontSize: 13, color: K.red, marginTop: 5 }}>{v.errorDe('adminEmail')}</span>}
            </label>
            <label><Etq>WhatsApp</Etq>
              <input value={adminTel} onChange={e => setAdminTel(e.target.value)} onBlur={() => v.tocar('adminTel')}
                style={{ ...campo, borderColor: v.errorDe('adminTel') ? K.red : K.line }} placeholder="10 dígitos" />
              {v.errorDe('adminTel') && <span style={{ display: 'block', fontSize: 13, color: K.red, marginTop: 5 }}>{v.errorDe('adminTel')}</span>}
            </label>
          </div>

          <div style={{ marginTop: 14, background: K.paper, borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 13, color: K.muted, margin: 0 }}>Contraseña temporal que se enviará</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: K.ink, margin: '3px 0 0', letterSpacing: 1, ...num }}>{password}</p>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={pagoRecibido} onChange={e => setPagoRecibido(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: K.orange }} />
            <span>
              <span style={{ display: 'block', fontSize: 17, color: K.ink, fontWeight: 600 }}>El pago ya se recibió</span>
              <span style={{ display: 'block', fontSize: 13, color: K.muted, marginTop: 2, lineHeight: 1.5 }}>
                Activa la cuenta y corre la vigencia desde hoy. Sin marcar, el cliente queda registrado pero suspendido hasta que registres el pago.
              </span>
            </span>
          </label>

          {error && (
            <div style={{ marginTop: 16, background: K.redSoft, border: `1px solid ${K.red}33`, borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 15, color: K.red, margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}
        </div>

        <div style={{ padding: '18px 26px', borderTop: `1px solid ${K.line}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={intentarCerrar} style={{ padding: '13px 20px', borderRadius: 10, border: `1px solid ${K.line}`, background: 'transparent', color: K.muted, fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={crear} disabled={guardando}
            style={{ ...botonPrimario, opacity: guardando ? .5 : 1, cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
