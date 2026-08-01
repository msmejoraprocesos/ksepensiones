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
        ? `¡Hola! Soy Sofía 👋 Veo que estás trabajando con **${contextoCliente.nombre}**. ¿En qué te puedo ayudar?`
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
          messages: nuevosMensajes.filter(m => m.role !== 'assistant' || nuevosMensajes.indexOf(m) > 0),
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
      if (contextoCliente?.nombre) {
        setMensajes([{ role: 'assistant', content: `¡Hola de nuevo! ¿Tienes otra pregunta sobre ${contextoCliente.nombre}?` }])
      } else {
        setMensajes([{ role: 'assistant', content: '¡Hola! ¿En qué te puedo ayudar?' }])
      }
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
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(p => !p)}
        style={{
          position: 'fixed' as const, bottom: '20px', right: '20px', zIndex: 1000,
          width: '52px', height: '52px', borderRadius: '50%',
          background: abierto ? '#374151' : AZUL,
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', transition: 'all 0.2s',
        }}>
        {abierto ? '✕' : '✨'}
      </button>

      {/* Panel de chat */}
      {abierto && (
        <div style={{
          position: 'fixed' as const, bottom: '84px', right: '20px', zIndex: 999,
          width: '360px', height: '500px',
          background: 'white', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column' as const,
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
        }}>

          {/* Header */}
          <div style={{ background: AZUL, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              ✨
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: 0 }}>Sofía IA</p>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                {contextoCliente?.nombre ? `Contexto: ${contextoCliente.nombre}` : 'Asistente pensional KSE'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>{llamadas}/50</span>
              <button onClick={limpiar} title="Nueva conversación"
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', fontSize: '11px' }}>
                Nueva
              </button>
            </div>
          </div>

          {/* Contexto del cliente */}
          {contextoCliente?.nombre && (
            <div style={{ padding: '8px 14px', background: '#EEF2F8', borderBottom: '1px solid #E5E7EB', fontSize: '11px', color: AZUL }}>
              <strong>{contextoCliente.nombre}</strong>
              {contextoCliente.semanas && ` · ${contextoCliente.semanas} semanas`}
              {contextoCliente.edad && ` · ${contextoCliente.edad} años`}
              {contextoCliente.pension_con && ` · Pensión est. $${Math.round(contextoCliente.pension_con).toLocaleString('es-MX')}/mes`}
            </div>
          )}

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
            {mensajes.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? AZUL : '#F4F6FB',
                  color: m.role === 'user' ? 'white' : '#374151',
                  fontSize: '13px', lineHeight: 1.5,
                }}>
                  {renderTexto(m.content)}
                </div>
              </div>
            ))}
            {enviando && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '12px 12px 12px 2px', fontSize: '18px' }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>•••</span>
                </div>
              </div>
            )}
            {error && (
              <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', fontSize: '12px', color: '#DC2626' }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Pregúntale a Sofía..."
              disabled={enviando}
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: '20px',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                background: enviando ? '#F8FAFC' : 'white',
              }}
            />
            <button onClick={enviar} disabled={enviando || !input.trim()}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: enviando || !input.trim() ? '#E5E7EB' : NARANJA,
                border: 'none', cursor: enviando || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                flexShrink: 0,
              }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; } 50% { opacity: 1; }
        }
      `}</style>
    </>
  )
}
