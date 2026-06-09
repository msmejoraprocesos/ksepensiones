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
    }
  }
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
