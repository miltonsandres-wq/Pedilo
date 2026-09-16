-- URL del servicio agente de impresión de cada sucursal (recibe la comanda
-- por HTTP y la traduce a ESC/POS hacia la impresora de red). Vive en la
-- sucursal porque es 1:1 con el local (aunque haya varias impresoras/estación
-- registradas en `impresoras`, todas cuelgan de un mismo agente por sucursal).
alter table public.sucursales
  add column if not exists agente_impresion_url text;

comment on column public.sucursales.agente_impresion_url is
  'Endpoint HTTP del servicio agente local (Node/n8n) que imprime la comanda vía ESC/POS. Ej: https://cocina-fondita.tunnel.example.com/comanda';
