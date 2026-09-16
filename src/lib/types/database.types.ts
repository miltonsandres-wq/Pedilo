export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          created_at: string
          id: string
          nombre: string
          orden: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pago_sucursal: {
        Row: {
          activo: boolean
          forma_pago: string
          sucursal_id: string
        }
        Insert: {
          activo?: boolean
          forma_pago: string
          sucursal_id: string
        }
        Update: {
          activo?: boolean
          forma_pago?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formas_pago_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      impresoras: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          ip: unknown
          nombre: string
          puerto: number
          sucursal_id: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          ip: unknown
          nombre?: string
          puerto?: number
          sucursal_id: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          ip?: unknown
          nombre?: string
          puerto?: number
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impresoras_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas: {
        Row: {
          activa: boolean
          capacidad: number
          created_at: string
          estado: string
          forma: string
          id: string
          nombre: string
          pos_x: number | null
          pos_y: number | null
          qr_token: string
          sucursal_id: string
          tenant_id: string
          zona: string | null
        }
        Insert: {
          activa?: boolean
          capacidad?: number
          created_at?: string
          estado?: string
          forma?: string
          id?: string
          nombre: string
          pos_x?: number | null
          pos_y?: number | null
          qr_token?: string
          sucursal_id: string
          tenant_id: string
          zona?: string | null
        }
        Update: {
          activa?: boolean
          capacidad?: number
          created_at?: string
          estado?: string
          forma?: string
          id?: string
          nombre?: string
          pos_x?: number | null
          pos_y?: number | null
          qr_token?: string
          sucursal_id?: string
          tenant_id?: string
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mesas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_items: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          impreso: boolean
          nombre_producto: string
          nota: string | null
          orden_id: string
          origen_cliente: boolean
          precio_unitario: number
          producto_id: string
          sucursal_id: string
          tenant_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          impreso?: boolean
          nombre_producto: string
          nota?: string | null
          orden_id: string
          origen_cliente?: boolean
          precio_unitario: number
          producto_id: string
          sucursal_id: string
          tenant_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          impreso?: boolean
          nombre_producto?: string
          nota?: string | null
          orden_id?: string
          origen_cliente?: boolean
          precio_unitario?: number
          producto_id?: string
          sucursal_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes: {
        Row: {
          cancelada_at: string | null
          cliente_nombre: string | null
          created_at: string
          enviada_at: string | null
          estado: string
          id: string
          mesa_id: string
          motivo_cancelacion: string | null
          pagada_at: string | null
          personas: number | null
          sucursal_id: string
          tenant_id: string
          total: number
          usuario_id: string | null
        }
        Insert: {
          cancelada_at?: string | null
          cliente_nombre?: string | null
          created_at?: string
          enviada_at?: string | null
          estado?: string
          id?: string
          mesa_id: string
          motivo_cancelacion?: string | null
          pagada_at?: string | null
          personas?: number | null
          sucursal_id: string
          tenant_id: string
          total?: number
          usuario_id?: string | null
        }
        Update: {
          cancelada_at?: string | null
          cliente_nombre?: string | null
          created_at?: string
          enviada_at?: string | null
          estado?: string
          id?: string
          mesa_id?: string
          motivo_cancelacion?: string | null
          pagada_at?: string | null
          personas?: number | null
          sucursal_id?: string
          tenant_id?: string
          total?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          created_at: string
          forma_pago: string
          id: string
          monto: number
          orden_id: string
          referencia: string | null
          sucursal_id: string
          tenant_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          forma_pago: string
          id?: string
          monto: number
          orden_id: string
          referencia?: string | null
          sucursal_id: string
          tenant_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          forma_pago?: string
          id?: string
          monto?: number
          orden_id?: string
          referencia?: string | null
          sucursal_id?: string
          tenant_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_sucursales: {
        Row: {
          producto_id: string
          sucursal_id: string
        }
        Insert: {
          producto_id: string
          sucursal_id: string
        }
        Update: {
          producto_id?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_sucursales_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_sucursales_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          created_at: string
          descripcion: string | null
          disponible: boolean
          foto_url: string | null
          id: string
          nombre: string
          precio: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          foto_url?: string | null
          id?: string
          nombre: string
          precio: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          foto_url?: string | null
          id?: string
          nombre?: string
          precio?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activo: boolean
          agente_impresion_url: string | null
          created_at: string
          direccion: string | null
          id: string
          logo_url: string | null
          nombre: string
          telefono: string | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean
          agente_impresion_url?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          nombre: string
          telefono?: string | null
          tenant_id: string
        }
        Update: {
          activo?: boolean
          agente_impresion_url?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          nombre?: string
          telefono?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          activo: boolean
          created_at: string
          direccion: string | null
          id: string
          logo_url: string | null
          max_sucursales: number
          moneda: string
          nombre: string
          notas_admin: string | null
          plan: string
          precio_mensual: number | null
          prueba_vence_el: string | null
          rtn: string | null
          sitio_web: string | null
          slug: string | null
          suscripcion_estado: string
          suscripcion_vence_el: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          max_sucursales?: number
          moneda?: string
          nombre: string
          notas_admin?: string | null
          plan?: string
          precio_mensual?: number | null
          prueba_vence_el?: string | null
          rtn?: string | null
          sitio_web?: string | null
          slug?: string | null
          suscripcion_estado?: string
          suscripcion_vence_el?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          max_sucursales?: number
          moneda?: string
          nombre?: string
          notas_admin?: string | null
          plan?: string
          precio_mensual?: number | null
          prueba_vence_el?: string | null
          rtn?: string | null
          sitio_web?: string | null
          slug?: string | null
          suscripcion_estado?: string
          suscripcion_vence_el?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      plataforma_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      formas_pago_plataforma: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string
          id: string
          orden: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion: string
          id?: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string
          id?: string
          orden?: number
        }
        Relationships: []
      }
      pagos_plataforma: {
        Row: {
          created_at: string
          fecha_pago: string
          id: string
          monto: number
          notas: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          fecha_pago?: string
          id?: string
          monto: number
          notas?: string | null
          tenant_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          fecha_pago?: string
          id?: string
          monto?: number
          notas?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_plataforma_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          rol: string
          sucursal_id: string | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id: string
          nombre: string
          rol: string
          sucursal_id?: string | null
          tenant_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          rol?: string
          sucursal_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_rol: { Args: never; Returns: string }
      current_sucursal_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
