'use client'

/**
 * Avisos en lugar de alert().
 *
 * alert() bloquea el hilo, no se puede estilizar, se ve distinto en cada
 * navegador, y en movil aparece como un dialogo del sistema que rompe la
 * sensacion de aplicacion.
 *
 * Esta version monta el aviso directamente en el DOM en lugar de vivir en el
 * arbol de React: permite reemplazar los alert() existentes sin reestructurar
 * cada componente ni pasar estado por props.
 */

type Tipo = 'error' | 'exito' | 'info'

const COLOR: Record<Tipo, { fg: string; bg: string; borde: string }> = {
  error: { fg: '#B91C1C', bg: '#FEF2F2', borde: '#B91C1C33' },
  exito: { fg: '#12855C', bg: '#E6F4EE', borde: '#12855C33' },
  info:  { fg: '#245287', bg: '#EEF4FB', borde: '#24528722' },
}

let actual: HTMLElement | null = null

function cerrar() {
  if (!actual) return
  actual.style.opacity = '0'
  actual.style.transform = 'translate(-50%, 8px)'
  const el = actual
  actual = null
  setTimeout(() => el.remove(), 200)
}

/**
 * @param titulo  Qué pasó, en una línea.
 * @param detalle Qué puede hacer el usuario. Un error sin salida solo frustra.
 */
export function avisar(tipo: Tipo, titulo: string, detalle?: string) {
  if (typeof document === 'undefined') return
  cerrar()

  const c = COLOR[tipo]
  const caja = document.createElement('div')
  caja.setAttribute('role', 'status')
  caja.setAttribute('aria-live', 'polite')
  caja.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translate(-50%,8px)',
    'z-index:400', 'max-width:520px', 'width:calc(100% - 40px)',
    'background:#fff', 'border-radius:14px', `border:1px solid ${c.borde}`,
    'box-shadow:0 12px 36px rgba(13,36,64,.18)', 'overflow:hidden',
    'font-family:inherit', 'opacity:0',
    'transition:opacity .2s ease, transform .2s ease',
  ].join(';')

  const fila = document.createElement('div')
  fila.style.cssText = `display:flex;gap:14px;padding:16px 18px;background:${c.bg}`

  const punto = document.createElement('span')
  punto.style.cssText = `width:8px;height:8px;border-radius:999px;background:${c.fg};flex-shrink:0;margin-top:7px`

  const texto = document.createElement('div')
  texto.style.cssText = 'flex:1;min-width:0'
  const t = document.createElement('p')
  t.textContent = titulo
  t.style.cssText = 'font-size:17px;font-weight:600;color:#132135;margin:0;line-height:1.4'
  texto.appendChild(t)
  if (detalle) {
    const d = document.createElement('p')
    d.textContent = detalle
    d.style.cssText = 'font-size:15px;color:#66738A;margin:5px 0 0;line-height:1.55'
    texto.appendChild(d)
  }

  const btn = document.createElement('button')
  btn.textContent = '\u00d7'
  btn.setAttribute('aria-label', 'Cerrar')
  btn.style.cssText = 'background:transparent;border:none;color:#66738A;cursor:pointer;font-size:18px;line-height:1;padding:2px;align-self:flex-start;font-family:inherit'
  btn.onclick = cerrar

  fila.append(punto, texto, btn)
  caja.appendChild(fila)
  document.body.appendChild(caja)
  actual = caja

  requestAnimationFrame(() => {
    caja.style.opacity = '1'
    caja.style.transform = 'translate(-50%, 0)'
  })

  // Los errores se cierran a mano: suelen requerir que el usuario haga algo.
  if (tipo !== 'error') setTimeout(() => { if (actual === caja) cerrar() }, 6000)
}

export const avisoError = (titulo: string, detalle?: string) => avisar('error', titulo, detalle)
export const avisoExito = (titulo: string, detalle?: string) => avisar('exito', titulo, detalle)
export const avisoInfo  = (titulo: string, detalle?: string) => avisar('info', titulo, detalle)
