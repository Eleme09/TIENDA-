'use strict';

// Datos de ejemplo (inventados, no reales) para probar el flujo completo
// antes de que el cliente cargue sus productos y personas reales.
//
//   npm run seed

const { createClient } = require('@supabase/supabase-js');
const lib = require('./lib');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Faltan variables de entorno: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Fotos genéricas (Unsplash), verificadas a mano una por una para que
// ninguna muestre marca real — es una tienda de dulces, no un catálogo de
// una marca en particular.
const PRODUCTOS = [
  { nombre: 'Chocolate trozado', precio: 2500, stock: 40, foto_url: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=600&q=80' },
  { nombre: 'Ositos de goma', precio: 1500, stock: 50, foto_url: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=600&q=80' },
  { nombre: 'Paleta de dulce', precio: 1000, stock: 60, foto_url: 'https://images.unsplash.com/photo-1575224300306-1b8da36134ec?w=600&q=80' },
  { nombre: 'Galletas surtidas', precio: 3000, stock: 30, foto_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=600&q=80' },
  { nombre: 'Agua 600ml', precio: 2500, stock: 20, foto_url: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=80' },
  { nombre: 'Café caliente', precio: 2000, stock: 15, foto_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80' },
  { nombre: 'Bolsa de papas', precio: 3500, stock: 24, foto_url: 'https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=600&q=80' },
  { nombre: 'Dona glaseada', precio: 2800, stock: 18, foto_url: 'https://images.unsplash.com/photo-1551106652-a5bcf4b29ab6?w=600&q=80' },
];

// Persona real (no de ejemplo) pedida explícitamente por el dueño.
const PERSONAS = [{ nombre: 'Jeiner', pin: '0909' }];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { count } = await supabase.from('tf_consumos').select('id', { count: 'exact', head: true });
  if (count > 0 && !process.argv.includes('--force')) {
    console.error(`Ya hay ${count} consumo(s) registrado(s) — no parece una base vacía. Usa --force para forzar.`);
    process.exit(1);
  }

  console.log('Sembrando productos y personas de ejemplo (inventados)...');

  await supabase.from('tf_productos').delete().neq('id', 0);
  await supabase.from('tf_personas').delete().neq('id', 0);

  for (const p of PRODUCTOS) {
    const { error } = await supabase.from('tf_productos').insert(p);
    if (error) throw error;
  }

  for (const p of PERSONAS) {
    const { error } = await supabase
      .from('tf_personas')
      .insert({ nombre: p.nombre, pin_hash: lib.hashSecret(p.pin) });
    if (error) throw error;
  }

  console.log(`Listo: ${PRODUCTOS.length} productos, ${PERSONAS.length} personas.`);
  console.log('PINs de prueba: ' + PERSONAS.map((p) => `${p.nombre}=${p.pin}`).join(', '));
  console.log('Crea la cuenta del dueño desde /admin.html (primer arranque).');
}

main().catch((err) => {
  console.error('Error al sembrar datos:', err);
  process.exit(1);
});
