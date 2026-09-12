export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      perfiles_usuario: {
        Row: {
          id: string
          nombre: string | null
          logo_url: string | null
          uma_diaria: number
          salario_minimo: number
          pmg_mensual: number
          rendimiento_afore_default: number
          inflacion_uma: number
          inflacion_pension: number | null
          recargo_mensual: number | null
          is_admin: boolean | null
          organizacion_id: string | null
          rol: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['perfiles_usuario']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['perfiles_usuario']['Row']>
      }
      clientes: {
        Row: {
          id: string
          asesor_id: string
          nombre: string
          telefono: string | null
          email: string | null
          notas: string | null
          ultimo_contacto: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['clientes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['clientes']['Row']>
      }
      diagnosticos: {
        Row: {
          id: string
          asesor_id: string
          cliente_id: string
          ley: '73' | '97'
          semanas: number
          salario_diario: number
          edad_retiro: number
          ingreso_deseado: number
          afore_saldo: number
          ppr_mensual: number
          rendimiento: number
          resultado_e1: number | null
          resultado_e2: number | null
          resultado_e3: number | null
          resultado_e4: number | null
          notas: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['diagnosticos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['diagnosticos']['Row']>
      }
      actividades: {
        Row: {
          id: string
          asesor_id: string
          cliente_id: string | null
          tipo: string
          titulo: string
          fecha_programada: string | null
          estatus: string
          notas: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['actividades']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['actividades']['Row']>
      }
      contratos: {
        Row: {
          id: string
          organizacion_id: string
          periodicidad: 'mensual' | 'anual'
          monto: number
          asientos: number
          fecha_inicio: string
          fecha_fin: string | null
          dias_tolerancia: number
          estado: 'activo' | 'vencido' | 'cancelado'
          notas: string | null
          creado_en: string
        }
        Insert: Omit<Database['public']['Tables']['contratos']['Row'], 'id' | 'creado_en'> & { id?: string }
        Update: Partial<Database['public']['Tables']['contratos']['Row']>
      }
      pagos_contrato: {
        Row: {
          id: string
          contrato_id: string
          monto: number
          fecha_pago: string
          metodo: string | null
          periodo_cubierto_hasta: string
          referencia: string | null
          registrado_por: string | null
          creado_en: string
        }
        Insert: Omit<Database['public']['Tables']['pagos_contrato']['Row'], 'id' | 'creado_en'> & { id?: string }
        Update: Partial<Database['public']['Tables']['pagos_contrato']['Row']>
      }
      acuerdos: {
        Row: {
          id: string
          organizacion_id: string
          descripcion: string
          monto_comprometido: number | null
          fecha_compromiso: string
          /** Lo llena un disparador con fecha_compromiso si se omite. */
          recordar_el: string | null
          estado: 'pendiente' | 'cumplido' | 'incumplido'
          pago_id: string | null
          creado_en: string
        }
        Insert: Omit<Database['public']['Tables']['acuerdos']['Row'], 'id' | 'creado_en' | 'recordar_el'> & { id?: string; recordar_el?: string | null }
        Update: Partial<Database['public']['Tables']['acuerdos']['Row']>
      }
      tramos_precio: {
        Row: {
          id: string
          /** null = tramo abierto, "de aquí en adelante". Solo puede haber uno. */
          hasta: number | null
          precio_usuario: number
          actualizado_en: string
        }
        Insert: { id?: string; hasta: number | null; precio_usuario: number }
        Update: Partial<Database['public']['Tables']['tramos_precio']['Row']>
        Relationships: []
      }
      /**
       * Tablas que existen en Supabase y aún no están tipadas aquí. Se declaran
       * con forma laxa para que el cliente resuelva la consulta en lugar de
       * inferir `never`, que es lo que obligaba a poner casts en las páginas.
       * Al regenerar los tipos desde Supabase, este bloque desaparece.
       */
      organizaciones: TablaSinTipar
      pagos: TablaSinTipar
      pagos_programados: TablaSinTipar
      pagos_suscripcion: TablaSinTipar
      cobros_esperados: TablaSinTipar
      financiamientos: TablaSinTipar
      financiamientos_corridas: TablaSinTipar
      financieras: TablaSinTipar
      instituciones_financieras: TablaSinTipar
      materiales_apoyo: TablaSinTipar
      encuestas_satisfaccion: TablaSinTipar
      servicios_contratados: TablaSinTipar
      solicitudes_canalizacion: TablaSinTipar
      solicitudes_financiamiento: TablaSinTipar
      pagos_financiamiento: TablaSinTipar
      rate_limits_ia: TablaSinTipar
      uso_ia: TablaSinTipar
      notificaciones: TablaSinTipar
      comprobantes: TablaSinTipar
      documentos_cliente: TablaSinTipar
      documentos_catalogo: TablaSinTipar
      documentos_financiera: TablaSinTipar
      criterios_financiera: TablaSinTipar
      catalogos_actividad: TablaSinTipar
      logos: TablaSinTipar
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

/** Forma laxa para tablas todavía sin tipar. */
interface TablaSinTipar {
  Row: Record<string, any>
  Insert: Record<string, any>
  Update: Record<string, any>
}

export interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_MENSUAL: number
  RENDIMIENTO_DEFAULT: number
  INFLACION_UMA: number
}

export const SYS_DEFAULTS: SysVars = {
  UMA_DIARIA: 117.31,
  SALARIO_MIN: 315.04,
  PMG_MENSUAL: 10636.54,
  RENDIMIENTO_DEFAULT: 6,
  INFLACION_UMA: 4.5,
}
