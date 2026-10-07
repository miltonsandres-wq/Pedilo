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
      cai_rangos: {
        Row: {
          cai: string
          clase: string
          created_at: string
          desde: number
          dispositivo_id: string | null
          establecimiento: string
          estado: string
          fecha_limite: string
          hasta: number
          id: string
          punto_emision: string
          siguiente: number
          sucursal_id: string
          tenant_id: string
          tipo_doc: string
        }
        Insert: {
          cai: string
          clase?: string
          created_at?: string
          desde: number
          dispositivo_id?: string | null
          establecimiento: string
          estado?: string
          fecha_limite: string
          hasta: number
          id?: string
          punto_emision: string
          siguiente: number
          sucursal_id: string
          tenant_id: string
          tipo_doc: string
        }
        Update: {
          cai?: string
          clase?: string
          created_at?: string
          desde?: number
          dispositivo_id?: string | null
          establecimiento?: string
          estado?: string
          fecha_limite?: string
          hasta?: number
          id?: string
          punto_emision?: string
          siguiente?: number
          sucursal_id?: string
          tenant_id?: string
          tipo_doc?: string
        }
        Relationships: [
          {
            foreignKeyName: "cai_rangos_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "dispositivos_pos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cai_rangos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cai_rangos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      contadores_orden_diario: {
        Row: {
          fecha: string
          sucursal_id: string
          ultimo_numero: number
        }
        Insert: {
          fecha: string
          sucursal_id: string
          ultimo_numero?: number
        }
        Update: {
          fecha?: string
          sucursal_id?: string
          ultimo_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "contadores_orden_diario_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      datos_fiscales_emisor: {
        Row: {
          correo: string | null
          created_at: string
          direccion_fiscal: string | null
          id: string
          nombre_comercial: string | null
          razon_social: string | null
          rtn: string | null
          sucursal_id: string | null
          telefono: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          correo?: string | null
          created_at?: string
          direccion_fiscal?: string | null
          id?: string
          nombre_comercial?: string | null
          razon_social?: string | null
          rtn?: string | null
          sucursal_id?: string | null
          telefono?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          correo?: string | null
          created_at?: string
          direccion_fiscal?: string | null
          id?: string
          nombre_comercial?: string | null
          razon_social?: string | null
          rtn?: string | null
          sucursal_id?: string | null
          telefono?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "datos_fiscales_emisor_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datos_fiscales_emisor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositivos_pos: {
        Row: {
          activo: boolean
          created_at: string
          establecimiento: string
          id: string
          nombre: string
          punto_emision: string
          sucursal_id: string
          tenant_id: string
          vinculado_at: string | null
          vinculo_hash: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          establecimiento: string
          id?: string
          nombre: string
          punto_emision: string
          sucursal_id: string
          tenant_id: string
          vinculado_at?: string | null
          vinculo_hash?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          establecimiento?: string
          id?: string
          nombre?: string
          punto_emision?: string
          sucursal_id?: string
          tenant_id?: string
          vinculado_at?: string | null
          vinculo_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositivos_pos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispositivos_pos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscales: {
        Row: {
          anulada_at: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          cai: string
          cargo_servicio: number
          clase: string
          cliente_nombre: string
          cliente_rtn: string | null
          correlativo: number
          created_at: string
          dispositivo_id: string | null
          documento_referencia_id: string | null
          emisor_snapshot: Json
          establecimiento: string
          estado: string
          fecha_emision: string
          fecha_limite: string
          gravado_15: number
          gravado_18: number
          id: string
          importe_exento: number
          importe_exonerado: number
          isv_15: number
          isv_18: number
          lineas: Json
          motivo_nota: string | null
          no_constancia_exonerado: string | null
          no_orden_compra_exenta: string | null
          no_registro_sag: string | null
          numero_completo: string
          orden_id: string
          punto_emision: string
          rango_desde: number
          rango_hasta: number
          rango_id: string | null
          sucursal_id: string
          tenant_id: string
          tipo_doc: string
          total: number
          total_letras: string
          usuario_id: string | null
        }
        Insert: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cai: string
          cargo_servicio?: number
          clase?: string
          cliente_nombre?: string
          cliente_rtn?: string | null
          correlativo: number
          created_at?: string
          dispositivo_id?: string | null
          documento_referencia_id?: string | null
          emisor_snapshot: Json
          establecimiento: string
          estado?: string
          fecha_emision: string
          fecha_limite: string
          gravado_15?: number
          gravado_18?: number
          id: string
          importe_exento?: number
          importe_exonerado?: number
          isv_15?: number
          isv_18?: number
          lineas: Json
          motivo_nota?: string | null
          no_constancia_exonerado?: string | null
          no_orden_compra_exenta?: string | null
          no_registro_sag?: string | null
          numero_completo: string
          orden_id: string
          punto_emision: string
          rango_desde: number
          rango_hasta: number
          rango_id?: string | null
          sucursal_id: string
          tenant_id: string
          tipo_doc: string
          total: number
          total_letras: string
          usuario_id?: string | null
        }
        Update: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cai?: string
          cargo_servicio?: number
          clase?: string
          cliente_nombre?: string
          cliente_rtn?: string | null
          correlativo?: number
          created_at?: string
          dispositivo_id?: string | null
          documento_referencia_id?: string | null
          emisor_snapshot?: Json
          establecimiento?: string
          estado?: string
          fecha_emision?: string
          fecha_limite?: string
          gravado_15?: number
          gravado_18?: number
          id?: string
          importe_exento?: number
          importe_exonerado?: number
          isv_15?: number
          isv_18?: number
          lineas?: Json
          motivo_nota?: string | null
          no_constancia_exonerado?: string | null
          no_orden_compra_exenta?: string | null
          no_registro_sag?: string | null
          numero_completo?: string
          orden_id?: string
          punto_emision?: string
          rango_desde?: number
          rango_hasta?: number
          rango_id?: string | null
          sucursal_id?: string
          tenant_id?: string
          tipo_doc?: string
          total?: number
          total_letras?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscales_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "dispositivos_pos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_documento_referencia_id_fkey"
            columns: ["documento_referencia_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_rango_id_fkey"
            columns: ["rango_id"]
            isOneToOne: false
            referencedRelation: "cai_rangos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscales_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
      incidentes_fiscales: {
        Row: {
          created_at: string
          detalle: string
          dispositivo_id: string | null
          id: string
          payload: Json | null
          resuelto: boolean
          sucursal_id: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          detalle: string
          dispositivo_id?: string | null
          id?: string
          payload?: Json | null
          resuelto?: boolean
          sucursal_id?: string | null
          tenant_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          detalle?: string
          dispositivo_id?: string | null
          id?: string
          payload?: Json | null
          resuelto?: boolean
          sucursal_id?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidentes_fiscales_dispositivo_id_fkey"
            columns: ["dispositivo_id"]
            isOneToOne: false
            referencedRelation: "dispositivos_pos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidentes_fiscales_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidentes_fiscales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_categorias: {
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
            foreignKeyName: "inventario_categorias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_items: {
        Row: {
          activo: boolean
          categoria_id: string | null
          costo_unitario: number | null
          created_at: string
          id: string
          nombre: string
          proveedor: string | null
          stock_minimo: number
          tenant_id: string
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          costo_unitario?: number | null
          created_at?: string
          id?: string
          nombre: string
          proveedor?: string | null
          stock_minimo?: number
          tenant_id: string
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          costo_unitario?: number | null
          created_at?: string
          id?: string
          nombre?: string
          proveedor?: string | null
          stock_minimo?: number
          tenant_id?: string
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_items_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "inventario_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_stock: {
        Row: {
          cantidad: number
          item_id: string
          sucursal_id: string
          updated_at: string
        }
        Insert: {
          cantidad?: number
          item_id: string
          sucursal_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          item_id?: string
          sucursal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_stock_sucursal_id_fkey"
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
          tasa_isv: string
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
          tasa_isv?: string
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
          tasa_isv?: string
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
          lista_cocina: boolean
          canal: string
          mesa_id: string | null
          motivo_cancelacion: string | null
          numero_dia: number | null
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
          lista_cocina?: boolean
          mesa_id?: string | null
          motivo_cancelacion?: string | null
          numero_dia?: number | null
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
          lista_cocina?: boolean
          canal?: string
          mesa_id?: string | null
          motivo_cancelacion?: string | null
          numero_dia?: number | null
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
          plato_dia_fecha: string | null
          activo: boolean
          categoria_id: string | null
          created_at: string
          descripcion: string | null
          disponible: boolean
          foto_url: string | null
          id: string
          nombre: string
          precio: number
          tasa_isv: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          plato_dia_fecha?: string | null
          activo?: boolean
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          foto_url?: string | null
          id?: string
          nombre: string
          precio: number
          tasa_isv?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          plato_dia_fecha?: string | null
          activo?: boolean
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          foto_url?: string | null
          id?: string
          nombre?: string
          precio?: number
          tasa_isv?: string
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
          delivery_habilitado: boolean
          configuracion_inicial_at: string | null
          tutorial_completado_at: string | null
          activo: boolean
          created_at: string
          direccion: string | null
          facturacion_fiscal_activa: boolean
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
          delivery_habilitado?: boolean
          configuracion_inicial_at?: string | null
          tutorial_completado_at?: string | null
          activo?: boolean
          created_at?: string
          direccion?: string | null
          facturacion_fiscal_activa?: boolean
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
          delivery_habilitado?: boolean
          configuracion_inicial_at?: string | null
          tutorial_completado_at?: string | null
          activo?: boolean
          created_at?: string
          direccion?: string | null
          facturacion_fiscal_activa?: boolean
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
      usuarios: {
        Row: {
          clave_cifrada: string | null
          activo: boolean
          created_at: string
          id: string
          nombre: string
          rol: string
          sucursal_id: string | null
          tenant_id: string
        }
        Insert: {
          clave_cifrada?: string | null
          activo?: boolean
          created_at?: string
          id: string
          nombre: string
          rol: string
          sucursal_id?: string | null
          tenant_id: string
        }
        Update: {
          clave_cifrada?: string | null
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
      // --- Delivery (0022-0027). Escrito a mano; se sobreescribe al correr `npm run db:types`.
      delivery_config: {
        Row: {
          sucursal_id: string
          tenant_id: string
          activo: boolean
          pausado: boolean
          horario: Json
          monto_minimo: number
          tiempo_estimado_min: number
          metodos_pago: string[]
          cuenta_transferencia: string | null
          slug: string | null
          mensaje_bienvenida: string | null
          tasa_isv_envio: string
          radio_llegada_m: number
          velocidad_moto_kmh: number
          retencion_rastro_dias: number
          updated_at: string
        }
        Insert: {
          sucursal_id?: string
          tenant_id?: string
          activo?: boolean
          pausado?: boolean
          horario?: Json
          monto_minimo?: number
          tiempo_estimado_min?: number
          metodos_pago?: string[]
          cuenta_transferencia?: string | null
          slug?: string | null
          mensaje_bienvenida?: string | null
          tasa_isv_envio?: string
          radio_llegada_m?: number
          velocidad_moto_kmh?: number
          retencion_rastro_dias?: number
          updated_at?: string
        }
        Update: {
          sucursal_id?: string
          tenant_id?: string
          activo?: boolean
          pausado?: boolean
          horario?: Json
          monto_minimo?: number
          tiempo_estimado_min?: number
          metodos_pago?: string[]
          cuenta_transferencia?: string | null
          slug?: string | null
          mensaje_bienvenida?: string | null
          tasa_isv_envio?: string
          radio_llegada_m?: number
          velocidad_moto_kmh?: number
          retencion_rastro_dias?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zonas: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string
          nombre: string
          tarifa: number
          activa: boolean
          poligono_geojson: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          nombre?: string
          tarifa?: number
          activa?: boolean
          poligono_geojson?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          nombre?: string
          tarifa?: number
          activa?: boolean
          poligono_geojson?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      repartidores: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string
          nombre: string
          telefono: string | null
          activo: boolean
          tipo_pago: string
          monto_por_entrega: number
          aceptacion_ubicacion_at: string | null
          turno_inicio: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          nombre?: string
          telefono?: string | null
          activo?: boolean
          tipo_pago?: string
          monto_por_entrega?: number
          aceptacion_ubicacion_at?: string | null
          turno_inicio?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          nombre?: string
          telefono?: string | null
          activo?: boolean
          tipo_pago?: string
          monto_por_entrega?: number
          aceptacion_ubicacion_at?: string | null
          turno_inicio?: string | null
          created_at?: string
        }
        Relationships: []
      }
      repartidor_credenciales: {
        Row: {
          repartidor_id: string
          pin_hash: string
          intentos_fallidos: number
          bloqueado_hasta: string | null
        }
        Insert: {
          repartidor_id?: string
          pin_hash?: string
          intentos_fallidos?: number
          bloqueado_hasta?: string | null
        }
        Update: {
          repartidor_id?: string
          pin_hash?: string
          intentos_fallidos?: number
          bloqueado_hasta?: string | null
        }
        Relationships: []
      }
      ordenes_delivery: {
        Row: {
          orden_id: string
          tenant_id: string
          sucursal_id: string
          cliente_nombre: string
          cliente_telefono: string
          direccion_referencia: string
          ubicacion_lat: number | null
          ubicacion_lng: number | null
          zona_id: string | null
          zona_nombre: string | null
          tarifa_envio: number
          metodo_pago: string
          paga_con: number | null
          comprobante_transferencia_url: string | null
          tipo_factura: string
          factura_nombre: string | null
          factura_rtn: string | null
          repartidor_id: string | null
          tracking_token: string
          estado_delivery: string
          recibido_at: string
          aceptado_at: string | null
          en_cocina_at: string | null
          listo_at: string | null
          en_camino_at: string | null
          llegado_at: string | null
          llegada_automatica: boolean
          entregado_at: string | null
          cancelado_at: string | null
          motivo_cancelacion: string | null
          entrega_lat: number | null
          entrega_lng: number | null
          entrega_foto_url: string | null
          monto_cobrado: number | null
          liquidacion_id: string | null
          created_at: string
        }
        Insert: {
          orden_id?: string
          tenant_id?: string
          sucursal_id?: string
          cliente_nombre?: string
          cliente_telefono?: string
          direccion_referencia?: string
          ubicacion_lat?: number | null
          ubicacion_lng?: number | null
          zona_id?: string | null
          zona_nombre?: string | null
          tarifa_envio?: number
          metodo_pago?: string
          paga_con?: number | null
          comprobante_transferencia_url?: string | null
          tipo_factura?: string
          factura_nombre?: string | null
          factura_rtn?: string | null
          repartidor_id?: string | null
          tracking_token?: string
          estado_delivery?: string
          recibido_at?: string
          aceptado_at?: string | null
          en_cocina_at?: string | null
          listo_at?: string | null
          en_camino_at?: string | null
          llegado_at?: string | null
          llegada_automatica?: boolean
          entregado_at?: string | null
          cancelado_at?: string | null
          motivo_cancelacion?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_foto_url?: string | null
          monto_cobrado?: number | null
          liquidacion_id?: string | null
          created_at?: string
        }
        Update: {
          orden_id?: string
          tenant_id?: string
          sucursal_id?: string
          cliente_nombre?: string
          cliente_telefono?: string
          direccion_referencia?: string
          ubicacion_lat?: number | null
          ubicacion_lng?: number | null
          zona_id?: string | null
          zona_nombre?: string | null
          tarifa_envio?: number
          metodo_pago?: string
          paga_con?: number | null
          comprobante_transferencia_url?: string | null
          tipo_factura?: string
          factura_nombre?: string | null
          factura_rtn?: string | null
          repartidor_id?: string | null
          tracking_token?: string
          estado_delivery?: string
          recibido_at?: string
          aceptado_at?: string | null
          en_cocina_at?: string | null
          listo_at?: string | null
          en_camino_at?: string | null
          llegado_at?: string | null
          llegada_automatica?: boolean
          entregado_at?: string | null
          cancelado_at?: string | null
          motivo_cancelacion?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_foto_url?: string | null
          monto_cobrado?: number | null
          liquidacion_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      repartidor_rastro: {
        Row: {
          id: number
          tenant_id: string
          sucursal_id: string
          orden_id: string
          repartidor_id: string
          lat: number
          lng: number
          precision_m: number | null
          velocidad: number | null
          evento: string
          registrado_at: string
        }
        Insert: {
          id?: number
          tenant_id?: string
          sucursal_id?: string
          orden_id?: string
          repartidor_id?: string
          lat?: number
          lng?: number
          precision_m?: number | null
          velocidad?: number | null
          evento?: string
          registrado_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          sucursal_id?: string
          orden_id?: string
          repartidor_id?: string
          lat?: number
          lng?: number
          precision_m?: number | null
          velocidad?: number | null
          evento?: string
          registrado_at?: string
        }
        Relationships: []
      }
      liquidaciones_repartidor: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string
          repartidor_id: string
          turno_fecha: string
          turno_inicio: string | null
          pedidos: Json
          total_pedidos: number
          total_efectivo_cobrado: number
          total_entregado_en_caja: number
          diferencia: number
          total_pago_envios: number
          notas: string | null
          cerrada_por: string | null
          cerrada_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          repartidor_id?: string
          turno_fecha?: string
          turno_inicio?: string | null
          pedidos?: Json
          total_pedidos?: number
          total_efectivo_cobrado?: number
          total_entregado_en_caja?: number
          diferencia?: number
          total_pago_envios?: number
          notas?: string | null
          cerrada_por?: string | null
          cerrada_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string
          repartidor_id?: string
          turno_fecha?: string
          turno_inicio?: string | null
          pedidos?: Json
          total_pedidos?: number
          total_efectivo_cobrado?: number
          total_entregado_en_caja?: number
          diferencia?: number
          total_pago_envios?: number
          notas?: string | null
          cerrada_por?: string | null
          cerrada_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_liquidacion: { Args: { p_repartidor: string }; Returns: Json }
      cerrar_liquidacion: { Args: { p_repartidor: string; p_entregado: number; p_notas?: string }; Returns: Json }
      crear_pedido_delivery: { Args: { p_sucursal: string; p_canal: string; p_pedido: Json }; Returns: Json }
      delivery_abierto: { Args: { p_sucursal: string; p_ahora?: string }; Returns: boolean }
      delivery_pausar: { Args: { p_sucursal: string; p_pausado: boolean }; Returns: undefined }
      delivery_rate_limit_hit: { Args: { p_clave: string; p_max: number; p_ventana_seg: number }; Returns: boolean }
      purgar_rastro_delivery: { Args: never; Returns: number }
      repartidor_aceptar_ubicacion: { Args: never; Returns: string }
      repartidor_hash_pin: { Args: { p_pin: string }; Returns: string }
      repartidor_login: { Args: { p_repartidor: string; p_pin: string }; Returns: Json }
      seguimiento_pedido: { Args: { p_token: string }; Returns: Json }
      anular_documento_fiscal: {
        Args: { p_id: string; p_motivo: string }
        Returns: {
          anulada_at: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          cai: string
          cargo_servicio: number
          clase: string
          cliente_nombre: string
          cliente_rtn: string | null
          correlativo: number
          created_at: string
          dispositivo_id: string | null
          documento_referencia_id: string | null
          emisor_snapshot: Json
          establecimiento: string
          estado: string
          fecha_emision: string
          fecha_limite: string
          gravado_15: number
          gravado_18: number
          id: string
          importe_exento: number
          importe_exonerado: number
          isv_15: number
          isv_18: number
          lineas: Json
          motivo_nota: string | null
          no_constancia_exonerado: string | null
          no_orden_compra_exenta: string | null
          no_registro_sag: string | null
          numero_completo: string
          orden_id: string
          punto_emision: string
          rango_desde: number
          rango_hasta: number
          rango_id: string | null
          sucursal_id: string
          tenant_id: string
          tipo_doc: string
          total: number
          total_letras: string
          usuario_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "documentos_fiscales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_rol: { Args: never; Returns: string }
      current_sucursal_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      fn_activar_pendientes: { Args: { p_tenant: string }; Returns: undefined }
      fn_hoy_hn: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      max_correlativo_fiscal: {
        Args: { p_establecimiento: string; p_punto: string; p_tipo_doc: string }
        Returns: number
      }
      refrescar_estados_cai: { Args: never; Returns: undefined }
      sincronizar_documento_fiscal: { Args: { p_doc: Json }; Returns: Json }
      vincular_dispositivo: {
        Args: { p_id: string; p_token: string }
        Returns: {
          activo: boolean
          created_at: string
          establecimiento: string
          id: string
          nombre: string
          punto_emision: string
          sucursal_id: string
          tenant_id: string
          vinculado_at: string | null
          vinculo_hash: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dispositivos_pos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
