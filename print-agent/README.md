# print-agent

Servicio pequeño que corre en una PC/mini-PC **dentro de cada sucursal**, en
la misma red que la impresora térmica de cocina. La app del POS (que corre en
la nube, vía Coolify) le manda la comanda por HTTP; este servicio la traduce
a comandos ESC/POS y la dispara a la impresora por IP.

## Por qué existe

El navegador no puede hablarle directo a una impresora de red por IP/ESC-POS.
Este agente es la pieza que sí puede, porque corre en la misma LAN.

## Instalación en la sucursal

1. Instalar Node.js 20+ en una PC del local (puede ser la misma caja
   registradora, o una Raspberry Pi).
2. Copiar esta carpeta `print-agent/` a esa máquina.
3. `cp .env.example .env` y poner la IP real de la impresora térmica.
4. `npm install && npm start`.
5. Configurar el proceso para que arranque solo (pm2, NSSM en Windows, o un
   servicio de systemd en Linux).

## Exponerlo a la app (sin abrir puertos en el router)

La app vive en un VPS con Coolify + Cloudflare por delante; el agente vive en
la LAN del restaurante. Para que la app le pueda mandar comandas por HTTP sin
tener que abrir puertos manualmente en el router del local, la forma
recomendada es un **Cloudflare Tunnel** saliente desde la misma máquina del
agente:

```
cloudflared tunnel --url http://localhost:4000
```

(o un túnel nombrado con un subdominio fijo tipo
`cocina-fondita.tudominio.com`). Esa URL pública es la que se guarda en el
panel de admin → Sucursales → "URL del agente de impresión".

## Cambiar de impresora o de protocolo

Todo lo específico de ESC/POS vive en `index.js` (función `imprimirComanda`).
Si mañana cambian de marca de impresora, o quieren mandar la comanda a un
proveedor de impresión en la nube en vez de ESC/POS directo, solo se toca
este archivo — la app y el resto del sistema le siguen hablando por el mismo
POST `/comanda` (ver `src/lib/printing/enviarComanda.ts` en la app principal).

## Formato de la comanda (POST /comanda)

```json
{
  "ordenId": "uuid",
  "mesa": "Mesa 5",
  "sucursalId": "uuid",
  "creadaEn": "2026-01-01T12:00:00.000Z",
  "items": [
    { "ordenItemId": "uuid", "nombre": "Baleada con pollo", "cantidad": 2, "nota": "sin repollo" }
  ]
}
```
