// Siembra un menú de ejemplo (categorías + productos CON foto) para poder
// probar el panel y el POS sin tener que cargar el catálogo real a mano.
// Sube las fotos al bucket "productos" de Storage (igual que si el admin las
// hubiera subido desde /admin/menu) y las asigna a una sucursal.
//
// Uso:
//   TENANT_NOMBRE="Milton Sandres" SUCURSAL_NOMBRE="Sucursal de prueba" \
//   node scripts/seed-menu-demo.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const linea of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
cargarEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantNombre = process.env.TENANT_NOMBRE;
const sucursalNombre = process.env.SUCURSAL_NOMBRE;

if (!url || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (revisa .env.local).");
  process.exit(1);
}
if (!tenantNombre || !sucursalNombre) {
  console.error("Faltan TENANT_NOMBRE / SUCURSAL_NOMBRE.");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const FOTOS_DIR = path.join(__dirname, "seed-fotos");

// nombre de archivo local (en scripts/seed-fotos/) -> platillo
const MENU = [
  {
    categoria: "Antojitos",
    nombre: "Tacos de carne (3 uds)",
    descripcion: "Tortillas de maíz con carne, cilantro, cebolla y un toque de limón.",
    precio: 75,
    foto: "tacos-carne.jpg",
  },
  {
    categoria: "Antojitos",
    nombre: "Tacos de camarón (3 uds)",
    descripcion: "Camarón a la plancha, col morada y aderezo de aguacate.",
    precio: 95,
    foto: "tacos-camaron.jpg",
  },
  {
    categoria: "Antojitos",
    nombre: "Pizza personal de pepperoni",
    descripcion: "Masa artesanal, salsa de tomate, mozzarella y pepperoni.",
    precio: 110,
    foto: "pizza.jpg",
  },
  {
    categoria: "Platos fuertes",
    nombre: "Hamburguesa clásica",
    descripcion: "Carne 100% de res, queso, lechuga, tomate y nuestra salsa especial.",
    precio: 95,
    foto: "hamburguesa.jpg",
  },
  {
    categoria: "Platos fuertes",
    nombre: "Hamburguesa con papas fritas",
    descripcion: "La clásica, servida con papas fritas y salsas para acompañar.",
    precio: 115,
    foto: "hamburguesa-papas.jpg",
  },
  {
    categoria: "Platos fuertes",
    nombre: "Carne asada con papas",
    descripcion: "Corte de res a la parrilla con papas rústicas y hierbas.",
    precio: 165,
    foto: "carne-asada.jpg",
  },
  {
    categoria: "Platos fuertes",
    nombre: "Parrillada mixta",
    descripcion: "Selección de carnes a la parrilla con ensalada fresca.",
    precio: 185,
    foto: "parrillada.jpg",
  },
  {
    categoria: "Platos fuertes",
    nombre: "Bowl saludable de pollo",
    descripcion: "Pollo a la plancha, maíz, huevo, vegetales frescos y aderezo ligero.",
    precio: 120,
    foto: "bowl-pollo.jpg",
  },
  {
    categoria: "Bebidas",
    nombre: "Margarita de la casa",
    descripcion: "Tequila, licor de naranja y limón, escarchada con sal.",
    precio: 90,
    foto: "margarita.jpg",
  },
  {
    categoria: "Bebidas",
    nombre: "Limonada de fresa",
    descripcion: "Limonada natural con fresas frescas y un toque de menta.",
    precio: 40,
    foto: "limonada-fresa.jpg",
  },
  {
    categoria: "Bebidas",
    nombre: "Café con leche",
    descripcion: "Espresso con leche vaporizada, servido caliente.",
    precio: 35,
    foto: "cafe-leche.jpg",
  },
  {
    categoria: "Bebidas",
    nombre: "Café americano",
    descripcion: "Café negro recién hecho, acompañado de galletas.",
    precio: 30,
    foto: "cafe-americano.jpg",
  },
  {
    categoria: "Postres",
    nombre: "Brownie con helado",
    descripcion: "Brownie tibio de chocolate con helado de vainilla y caramelo.",
    precio: 65,
    foto: "brownie.jpg",
  },
  {
    categoria: "Postres",
    nombre: "Tiramisú",
    descripcion: "Clásico postre italiano con capas de café y mascarpone.",
    precio: 60,
    foto: "tiramisu.jpg",
  },
  {
    categoria: "Postres",
    nombre: "Helado artesanal",
    descripcion: "Bola de helado a elegir sabor, servido en cono o vaso.",
    precio: 45,
    foto: "helado.jpg",
  },
];

async function main() {
  const { data: tenant, error: errTenant } = await admin
    .from("tenants")
    .select("id")
    .eq("nombre", tenantNombre)
    .single();
  if (errTenant || !tenant) throw new Error(`No encontré el tenant "${tenantNombre}": ${errTenant?.message}`);

  const { data: sucursal, error: errSuc } = await admin
    .from("sucursales")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("nombre", sucursalNombre)
    .single();
  if (errSuc || !sucursal)
    throw new Error(`No encontré la sucursal "${sucursalNombre}": ${errSuc?.message}`);

  console.log(`Sembrando menú en tenant=${tenant.id} sucursal=${sucursal.id}...`);

  const categoriaIdPorNombre = new Map();

  for (const item of MENU) {
    // categoría: reusa o crea
    let categoriaId = categoriaIdPorNombre.get(item.categoria);
    if (!categoriaId) {
      const { data: existente } = await admin
        .from("categorias")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("nombre", item.categoria)
        .maybeSingle();

      if (existente) {
        categoriaId = existente.id;
      } else {
        const { data: nueva, error } = await admin
          .from("categorias")
          .insert({ tenant_id: tenant.id, nombre: item.categoria })
          .select("id")
          .single();
        if (error) throw error;
        categoriaId = nueva.id;
      }
      categoriaIdPorNombre.set(item.categoria, categoriaId);
    }

    // foto: sube el archivo local al bucket "productos"
    const rutaLocal = path.join(FOTOS_DIR, item.foto);
    const bytes = fs.readFileSync(rutaLocal);
    const storagePath = `${tenant.id}/demo-${item.foto}`;
    const { error: errUpload } = await admin.storage
      .from("productos")
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
    if (errUpload) throw errUpload;

    const {
      data: { publicUrl },
    } = admin.storage.from("productos").getPublicUrl(storagePath);

    // producto
    const { data: producto, error: errProd } = await admin
      .from("productos")
      .insert({
        tenant_id: tenant.id,
        categoria_id: categoriaId,
        nombre: item.nombre,
        descripcion: item.descripcion,
        precio: item.precio,
        foto_url: publicUrl,
        disponible: true,
      })
      .select("id")
      .single();
    if (errProd) throw errProd;

    await admin
      .from("producto_sucursales")
      .insert({ producto_id: producto.id, sucursal_id: sucursal.id });

    console.log(`  + ${item.nombre}`);
  }

  console.log(`\nListo: ${MENU.length} platillos en ${categoriaIdPorNombre.size} categorías.`);
}

main().catch((err) => {
  console.error("Error sembrando el menú:", err);
  process.exit(1);
});
