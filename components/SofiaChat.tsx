'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21'

interface Mensaje {
  role: 'user' | 'assistant'
  content: string
}

interface SofiaChatProps {
  contextoCliente?: {
    nombre?: string
    nss?: string
    semanas?: number
    edad?: number
    pension_sin?: number
    pension_con?: number
    etapa?: string
  } | null
}

export function SofiaChat({ contextoCliente }: SofiaChatProps) {
  const supabase = createClient()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [userId, setUserId] = useState('')
  const [llamadas, setLlamadas] = useState(0)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
  }, [])

  useEffect(() => {
    if (abierto) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [abierto, mensajes])

  useEffect(() => {
    if (abierto && mensajes.length === 0) {
      const bienvenida = contextoCliente?.nombre
        ? `¡Hola! Veo que estás trabajando con **${contextoCliente.nombre}**. ¿En qué te puedo ayudar?`
        : '¡Hola! Soy Sofía, tu asistente pensional 👋 ¿En qué te puedo ayudar hoy?'
      setMensajes([{ role: 'assistant', content: bienvenida }])
    }
  }, [abierto])

  async function enviar() {
    if (!input.trim() || enviando || !userId) return
    const pregunta = input.trim()
    setInput('')
    setError('')
    const nuevosMensajes: Mensaje[] = [...mensajes, { role: 'user', content: pregunta }]
    setMensajes(nuevosMensajes)
    setEnviando(true)

    try {
      const res = await fetch('/api/sofia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nuevosMensajes,
          asesor_id: userId,
          contexto_cliente: contextoCliente ?? null,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setMensajes(prev => [...prev, { role: 'assistant', content: data.respuesta }])
        setLlamadas(data.llamadas ?? 0)
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    }
    setEnviando(false)
  }

  function limpiar() {
    setMensajes([])
    setError('')
    setTimeout(() => {
      setMensajes([{ role: 'assistant', content: contextoCliente?.nombre
        ? `¡Lista para seguir! ¿Qué necesitas sobre ${contextoCliente.nombre}?`
        : '¡Nueva conversación! ¿En qué te puedo ayudar?' }])
    }, 100)
  }

  const renderTexto = (texto: string) => {
    return texto.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return <span key={i} dangerouslySetInnerHTML={{ __html: bold }} style={{ display: 'block' }} />
    })
  }

  return (
    <>
      {/* Botón flotante con avatar */}
      <button onClick={() => setAbierto(p => !p)}
        style={{
          position: 'fixed' as const, bottom: '20px', right: '20px', zIndex: 1000,
          width: '60px', height: '60px', borderRadius: '50%',
          background: abierto ? '#374151' : AZUL,
          border: `3px solid ${abierto ? '#6B7280' : '#F05B21'}`,
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, overflow: 'hidden', transition: 'all 0.2s',
        }}>
        {abierto
          ? <span style={{ color: 'white', fontSize: '20px', fontWeight: '700' }}>✕</span>
          : <img src="/sofia-avatar.svg" alt="Sofía" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
        }
      </button>

      {/* Badge de mensajes disponibles */}
      {!abierto && llamadas > 0 && (
        <div style={{
          position: 'fixed' as const, bottom: '72px', right: '16px', zIndex: 1001,
          background: NARANJA, color: 'white', fontSize: '10px', fontWeight: '700',
          padding: '2px 6px', borderRadius: '10px',
        }}>
          {50 - llamadas}/50
        </div>
      )}

      {/* Panel de chat */}
      {abierto && (
        <div style={{
          position: 'fixed' as const, bottom: '92px', right: '20px', zIndex: 999,
          width: '370px', height: '520px',
          background: 'white', borderRadius: '20px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column' as const,
          overflow: 'hidden', animation: 'sofiaSlideUp 0.25s ease',
        }}>

          {/* Header con avatar */}
          <div style={{ background: AZUL, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src="/sofia-avatar.svg" alt="Sofía" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <p style={{ fontSize: '15px', fontWeight: '700', color: 'white', margin: 0 }}>Sofía IA</p>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', animation: 'sofiaOnline 1.5s ease-in-out infinite' }} />
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', margin: 0 }}>
                {contextoCliente?.nombre ? `Contexto: ${contextoCliente.nombre}` : 'Asistente pensional KSE'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '8px' }}>
                {llamadas}/50 hoy
              </span>
              <button onClick={limpiar}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'inherit' }}>
                Nueva
              </button>
            </div>
          </div>

          {/* Contexto del cliente */}
          {contextoCliente?.nombre && (
            <div style={{ padding: '8px 16px', background: '#EEF2F8', borderBottom: '1px solid #E5E7EB', fontSize: '11px', color: AZUL, display: 'flex', gap: '8px', flexWrap: 'wrap' as const, flexShrink: 0 }}>
              <span>👤 <strong>{contextoCliente.nombre}</strong></span>
              {contextoCliente.semanas && <span>· {contextoCliente.semanas} sem.</span>}
              {contextoCliente.edad && <span>· {contextoCliente.edad} años</span>}
              {contextoCliente.pension_con && <span>· Est. ${Math.round(contextoCliente.pension_con).toLocaleString('es-MX')}/mes</span>}
            </div>
          )}

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
            {mensajes.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    <img src="/sofia-avatar.svg" alt="" style={{ width: '26px', height: '26px' }} />
                  </div>
                )}
                <div style={{
                  maxWidth: '82%', padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? AZUL : '#F4F6FB',
                  color: m.role === 'user' ? 'white' : '#374151',
                  fontSize: '13px', lineHeight: 1.55,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  {renderTexto(m.content)}
                </div>
              </div>
            ))}

            {/* Indicador de escritura */}
            {enviando && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  <img src="/sofia-avatar.svg" alt="" style={{ width: '26px', height: '26px' }} />
                </div>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#9CA3AF', animation: `sofiaTyping 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: '10px', fontSize: '12px', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: '8px', alignItems: 'center', background: 'white', flexShrink: 0 }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Pregúntale a Sofía..."
              disabled={enviando}
              style={{
                flex: 1, padding: '9px 14px', border: '1.5px solid #E5E7EB',
                borderRadius: '22px', fontSize: '13px', fontFamily: 'inherit',
                outline: 'none', background: '#F8FAFC', transition: 'border 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = AZUL}
              onBlur={e => e.target.style.borderColor = '#E5E7EB'}
            />
            <button onClick={enviar} disabled={enviando || !input.trim()}
              style={{
                width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                background: enviando || !input.trim() ? '#E5E7EB' : NARANJA,
                border: 'none', cursor: enviando || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', transition: 'background 0.2s',
              }}>
              <span style={{ color: enviando || !input.trim() ? '#9CA3AF' : 'white', fontSize: '14px', marginLeft: '2px' }}>➤</span>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sofiaSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sofiaOnline {
          0%,100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes sofiaTyping {
          0%,100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
