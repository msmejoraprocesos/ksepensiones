# Módulo de Cartera — diseño

Registro de clientes del SaaS, control de vigencia y gestión de cobranza.
Documento de trabajo: confirmar antes de construir.

## Qué resuelve

No olvidar cobrar, ver quién está por vencer, y que el vencimiento tenga
consecuencia real en el acceso.

## Hallazgo que condiciona todo

`organizaciones.activo` **no bloquea nada hoy**. El middleware solo valida
sesión; ni el layout ni ninguna ruta revisan el estado de la organización ni
`vigencia_hasta`. Una organización marcada como inactiva sigue teniendo acceso
completo.

Sin cerrar esto, el módulo avisa de la morosidad pero el cliente sigue usando
el sistema. Es la mitad que hace que el resto sirva.

## Modelo de datos

Se reutiliza `organizaciones` (ya tiene `plan`, `asientos`, `vigencia_hasta`,
`dias_gracia`, `activo`). Se agregan dos tablas:

### `contratos`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| organizacion_id | uuid | FK. Una persona física también es una organización de 1 asiento |
| periodicidad | text | `mensual` \| `anual` |
| monto | numeric | Por periodo |
| asientos | int | Cuántos usuarios cubre |
| fecha_inicio | date | |
| fecha_fin | date | |
| dias_tolerancia | int | Default 5 |
| estado | text | `activo` \| `vencido` \| `cancelado` |
| notas | text | |

### `pagos_contrato`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| contrato_id | uuid | FK |
| monto | numeric | Sin pagos parciales: un pago cubre un periodo completo |
| fecha_pago | date | |
| metodo | text | transferencia, efectivo, etc. |
| periodo_cubierto_hasta | date | Lo que este pago extiende |
| referencia | text | Folio o comprobante |
| registrado_por | uuid | Auditoría |

## Flujos

### Alta de cliente
1. Se registra el contrato con sus fechas y monto.
2. Al registrar el primer pago: se calcula `vigencia_hasta`, se marca la
   organización como activa, y se dispara el alta de usuarios contra
   `api/admin/usuarios`, que ya crea la cuenta y envía credenciales por Resend.
3. El módulo no duplica esa lógica: la invoca.

### Renovación
Registrar un pago extiende `vigencia_hasta` desde la fecha mayor entre la
vigencia actual y hoy. Así un pago adelantado suma, y uno tardío no regala
los días de atraso.

### Vencimiento
Se evalúa `vigencia_hasta + dias_tolerancia`:
- **Por vencer** (dentro de 15 días): aviso en el tablero.
- **En tolerancia**: vencido pero dentro del margen. Acceso intacto, alerta visible.
- **Vencido**: pasado el margen. El sistema **propone** desactivar y pide
  confirmación — decisión explícita, nunca automática.

### Corte de acceso
Al confirmar, `organizaciones.activo = false`. Para que eso signifique algo hay
que agregar la validación: al cargar el layout, si la organización del usuario
está inactiva o su vigencia venció con tolerancia agotada, redirigir a una
pantalla de cuenta suspendida con datos de contacto.

## Tablero de cartera

Semáforo por días de atraso, con totales arriba: vigentes, por vencer, en
tolerancia, vencidos, y monto total por cobrar.

## Decisiones tomadas

- **Solo renta.** No hay compra ni acceso perpetuo. Todo contrato vence y se renueva.
- **Sin pagos parciales.** Un pago cubre un periodo completo. Esto simplifica el cálculo de vigencia: no hay prorrateos ni saldos a favor.
- **Todos los pagos los registra el super-admin.** El admin de organización no puede registrar pagos propios.

## Acuerdos de palabra

Caso real del negocio: se concede acceso antes de que el pago entre, por
acuerdo verbal. Hoy eso vive en la memoria del administrador y por eso se
olvida cobrar.

### `acuerdos`
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid | |
| organizacion_id | uuid | FK |
| descripcion | text | Qué se acordó, en palabras del administrador |
| monto_comprometido | numeric | |
| fecha_compromiso | date | Cuándo se prometió pagar |
| recordar_el | date | Cuándo avisar. Default: fecha_compromiso |
| estado | text | `pendiente` \| `cumplido` \| `incumplido` |
| pago_id | uuid | Se llena al cumplirse |

Un acuerdo vencido y no cumplido aparece en el tablero junto a los vencidos,
con la distinción visible: no es que no pagó, es que **prometió y no cumplió**.
La suspensión sigue siendo manual y con confirmación.

## Cotizador

Para empresas con N usuarios. Entrada: número de usuarios y periodicidad.
Salida: precio por usuario, total por periodo y total anual. Debe permitir
generar el contrato directamente desde la cotización, sin recapturar.

Pendiente de definir: la tabla de precios por volumen (a partir de cuántos
usuarios baja el precio unitario y en qué proporción).
