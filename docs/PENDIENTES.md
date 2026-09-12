# Pendientes — KSE Pensiones

Lo que queda abierto, ordenado por impacto. Cerrar la línea al terminar.

## Bloqueantes

- [ ] **Validación visual de la app.** Diecisiete commits sin ver la aplicación corriendo. El cambio de fuente y el barrido de tipografía (82 sustituciones automáticas) tocan cada pixel y ningún test los juzga.
- [ ] **Confirmar deploy en Vercel.** El build falla localmente por variables de Supabase ausentes; nadie ha verificado que allá pase.
- [ ] **Sustento del pago retroactivo.** No se encontró fundamento legal para esa mecánica en la LSS. El Art. 219 fija plazo para *solicitar*, no para pagar hacia atrás, y el Art. 220 termina la continuación a los dos meses sin pago. Es el escenario más caro que ofrece la herramienta.
- [x] Migraciones aplicadas en KSE: parámetros configurables y cartera.
- [ ] **Correr `supabase/migraciones/20260912_rls_cartera.sql`** en KSE. Sin ella, cualquier usuario con sesión puede leer y escribir contratos y pagos.

## Producto

- [ ] **Auditar rutas que usan `service_role`.** Se restauraron los GRANT tras encontrar un revoke masivo, pero nunca se verificó qué llevaba tiempo fallando en silencio.
- [ ] **Denominador oficial del retorno.** La app divide entre inversión neta, el Excel entre costo total. Documentado en `lib/design-tokens.ts`; falta confirmación formal.

## Módulo de cartera — en construcción

Diseño en `docs/MODULO-CARTERA.md`. Hecho: migración de `contratos`, `pagos_contrato` y `acuerdos`; lógica de vigencias y cotizador en `lib/cartera.ts` con 22 tests.

Falta: la interfaz (alta de contrato, registro de pago, tablero de cartera, cotizador), y **la validación de acceso** — hoy `organizaciones.activo` no bloquea nada, así que suspender no tiene efecto real.

Pendiente de definir: la tabla de precios por volumen. Los tramos actuales en `TRAMOS_PRECIO` son provisionales.

## Si se retoma el cobro

El módulo de suscripción con Stripe se eliminó en esta fase. Lo que quedó en pie por si se retoma:

- Columnas en `organizaciones`: `plan`, `asientos`, `vigencia_hasta`, `dias_gracia`, `cancelar_al_periodo`, `stripe_customer_id`, `stripe_subscription_id`. No se borraron: eliminar datos es irreversible y no estorban.
- El acceso nunca dependió de Stripe. `vigencia_hasta` se administra a mano desde Admin por organización y solo se muestra informativamente.
- Variables de entorno en Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, los `STRIPE_PRICE_*`) quedaron sin uso. Conviene retirarlas.
- Si hay un webhook configurado en el panel de Stripe apuntando a `/api/stripe/webhook`, ya no existe: desactivarlo para que deje de reintentar.

## Transversal

- [ ] Los iconos del sidebar son emojis (💳 ⚙ 🔬 📊). Se ven distintos en cada sistema operativo y conviven mal con el rediseño.

- [x] Paginación y ordenamiento en Clientes y Reportes. *(Seguimiento resultó ser vista de calendario, no tabla: no aplica.)*
- [ ] Reemplazar los 16 `alert()` y mensajes genéricos por errores específicos.
- [ ] Skeletons de carga. No existe ninguno.
- [ ] Manifest PWA. La app no es instalable.
- [ ] Responsividad fuera de la calculadora: dashboard, clientes, seguimiento.
- [ ] Validación en tiempo real en formularios. Hoy solo valida al enviar.
- [ ] Confirmación al cerrar modales con datos capturados.

## Calidad

- [ ] **Tests de renderizado.** Los 104 actuales son de lógica pura. Ninguno prueba que un tab monte sin reventar con datos vacíos, que es donde más se rompe una app.
- [ ] **Rediseñar `DiagnosticoPDF.tsx`.** Quedó con el diseño anterior. Es el entregable que ve el cliente final: hoy hay inconsistencia entre lo que el asesor muestra en pantalla y lo que entrega.
- [ ] **Llevar los tokens al resto de la app.** Dashboard, Clientes y Seguimiento siguen con la paleta vieja; la calculadora se ve distinta al resto del sistema.

## Cerrados en la sesión del 12 sep 2026

Modalidad 10 separada de la comparativa · indexación real por INPC · prorrateo de meses por año · termómetro de Proyección corregido y unificado · etiquetas reinterpretables · glosario de Modalidad 10 · 11 pantallas migradas al sistema de diseño · responsividad y cajón lateral · retroalimentación fuera de pantalla · marca de agua retirada · ortografía · tokens centralizados · Inter vía next/font · guía de interpretación del termómetro · compuerta de elegibilidad conectada · riesgo de fallecimiento explícito · recargos e INPC configurables · 104 tests (30 de regresión)
