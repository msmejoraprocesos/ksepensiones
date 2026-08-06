'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AZUL = '#1B3A6B', NARANJA = '#F05B21'

export default function EncuestaPage({ params }: { params: { token: string } }) {
  const [encuesta, setEncuesta] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [calificacion, setCalificacion] = useState(0)
  const [hover, setHover] = useState(0)
  const [recomendaria, setRecomendaria] = useState('')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('encuestas_satisfaccion')
        .select('*, perfiles_usuario(nombre, razon_social)')
        .eq('token', params.token)
        .single()
      if (data) {
        setEncuesta(data)
        if (data.respondida_at) setEnviado(true)
      } else {
        setError('Encuesta no encontrada o link inválido')
      }
      setCargando(false)
    }
    cargar()
  }, [params.token])

  async function responder() {
    if (!calificacion || !recomendaria) return
    setEnviando(true)
    const { error: err } = await supabase
      .from('encuestas_satisfaccion')
      .update({
        calificacion,
        recomendaria,
        comentario: comentario.trim() || null,
        respondida_at: new Date().toISOString(),
      })
      .eq('token', params.token)
    if (err) {
      setError('Error al guardar. Intenta de nuevo.')
    } else {
      setEnviado(true)
    }
    setEnviando(false)
  }

  if (cargando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6FB', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: `3px solid ${AZUL}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6B7280', fontSize: '14px' }}>Cargando encuesta...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6FB', fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <p style={{ fontSize: '48px', margin: '0 0 16px' }}>😕</p>
        <h2 style={{ color: '#374151', margin: '0 0 8px' }}>Link no válido</h2>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>{error}</p>
      </div>
    </div>
  )

  const nombreAsesor = encuesta?.perfiles_usuario?.razon_social || encuesta?.perfiles_usuario?.nombre || 'tu asesor'

  if (enviado) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1B3A6B 0%, #2c5282 100%)', fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '40px 32px', textAlign: 'center', maxWidth: '400px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <p style={{ fontSize: '64px', margin: '0 0 16px' }}>🙏</p>
        <h2 style={{ color: AZUL, margin: '0 0 12px', fontSize: '22px' }}>¡Gracias por tu opinión!</h2>
        <p style={{ color: '#6B7280', fontSize: '15px', lineHeight: 1.6 }}>
          Tu respuesta ha sido registrada. Nos ayuda a mejorar el servicio para ti y para más familias como la tuya.
        </p>
        <div style={{ margin: '24px 0 0', padding: '16px', background: '#EEF2F8', borderRadius: '12px' }}>
          <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>
            Si tienes preguntas adicionales, contacta directamente a <strong>{nombreAsesor}</strong>
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1B3A6B 0%, #2c5282 100%)', fontFamily: 'system-ui, sans-serif', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', maxWidth: '420px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ background: AZUL, padding: '24px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: '32px', margin: '0 0 8px' }}>📋</p>
          <h1 style={{ color: 'white', fontSize: '18px', fontWeight: '800', margin: '0 0 6px' }}>Encuesta de satisfacción</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0 }}>
            {encuesta.cliente_nombre ? `Hola ${encuesta.cliente_nombre.split(' ')[0]}, ` : ''}nos importa tu experiencia con {nombreAsesor}
          </p>
        </div>

        <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Pregunta 1: Calificación */}
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#111827', margin: '0 0 16px', lineHeight: 1.4 }}>
              1. ¿Cómo calificarías el servicio de tu asesor?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setCalificacion(n)}
                  onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                  style={{ fontSize: '36px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 0.15s', transform: (hover || calificacion) >= n ? 'scale(1.2)' : 'scale(1)', filter: (hover || calificacion) >= n ? 'none' : 'grayscale(1) opacity(0.4)' }}>
                  ⭐
                </button>
              ))}
            </div>
            {calificacion > 0 && (
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#6B7280', margin: '10px 0 0' }}>
                {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][calificacion]}
              </p>
            )}
          </div>

          {/* Pregunta 2: NPS */}
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#111827', margin: '0 0 14px', lineHeight: 1.4 }}>
              2. ¿Recomendarías este servicio a un familiar o conocido?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { val: 'si', label: '👍 Sí, definitivamente', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
                { val: 'probablemente', label: '🤔 Probablemente sí', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                { val: 'no', label: '👎 No', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
              ].map(op => (
                <button key={op.val} onClick={() => setRecomendaria(op.val)}
                  style={{ padding: '14px 18px', background: recomendaria === op.val ? op.bg : 'white', color: recomendaria === op.val ? op.color : '#374151', border: `2px solid ${recomendaria === op.val ? op.border : '#E5E7EB'}`, fontSize: '14px', fontWeight: recomendaria === op.val ? '700' : '400', cursor: 'pointer', fontFamily: 'inherit', borderRadius: '10px', textAlign: 'left', transition: 'all 0.15s' }}>
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pregunta 3: Comentario */}
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#111827', margin: '0 0 10px', lineHeight: 1.4 }}>
              3. ¿Algo que podamos mejorar? <span style={{ fontWeight: '400', color: '#9CA3AF' }}>(opcional)</span>
            </p>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder="Escribe aquí tu comentario..."
              rows={3}
              style={{ width: '100%', padding: '12px', border: '1.5px solid #E5E7EB', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', outline: 'none', lineHeight: 1.5 }} />
          </div>

          {/* Botón enviar */}
          <button onClick={responder} disabled={!calificacion || !recomendaria || enviando}
            style={{ padding: '16px', background: !calificacion || !recomendaria ? '#E5E7EB' : NARANJA, color: !calificacion || !recomendaria ? '#9CA3AF' : 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '800', cursor: !calificacion || !recomendaria ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '0.3px' }}>
            {enviando ? 'Guardando...' : !calificacion ? 'Selecciona una calificación' : !recomendaria ? 'Responde la pregunta 2' : '✓ Enviar mi respuesta'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '11px', color: '#D1D5DB', margin: 0 }}>
            Tus respuestas son confidenciales y nos ayudan a mejorar
          </p>
        </div>
      </div>
    </div>
  )
}
