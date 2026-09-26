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

const PRODUCTOS = [
  { nombre: 'Bolsa de papas', precio: 3500, stock: 24 },
  { nombre: 'Chocolatina', precio: 2500, stock: 40 },
  { nombre: 'Gaseosa 400ml', precio: 4000, stock: 18 },
  { nombre: 'Galletas paquete', precio: 3000, stock: 30 },
  { nombre: 'Dulce de leche', precio: 1000, stock: 60 },
  { nombre: 'Chicle paquete', precio: 1500, stock: 50 },
  { nombre: 'Agua 600ml', precio: 2500, stock: 20 },
  { nombre: 'Café en vaso', precio: 2000, stock: 15 },
];

const PERSONAS = [
  { nombre: 'Juan Pérez', pin: '1111' },
  { nombre: 'María Gómez', pin: '2222' },
  { nombre: 'Carlos Ruiz', pin: '3333' },
];

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
