'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('./lib');

test('hashSecret / verifySecret', () => {
  const hash = lib.hashSecret('1234');
  assert.equal(lib.verifySecret('1234', hash), true);
  assert.equal(lib.verifySecret('9999', hash), false);
  assert.equal(lib.verifySecret('1234', 'formato-invalido'), false);
});

test('sanitizePin / isValidPin', () => {
  assert.equal(lib.sanitizePin('12ab34'), '1234');
  assert.equal(lib.sanitizePin('12'), '12');
  assert.equal(lib.isValidPin('1234'), true);
  assert.equal(lib.isValidPin('001'), true);
  assert.equal(lib.isValidPin('12'), false);
  assert.equal(lib.isValidPin('abcd'), false);
});

test('parseInvoiceLine: cantidad al inicio + precio al final', () => {
  const r = lib.parseInvoiceLine('2 Bolsa de papas 3500');
  assert.deepEqual(r, { raw: '2 Bolsa de papas 3500', cantidad: 2, nombre: 'Bolsa de papas', precio: 3500 });
});

test('parseInvoiceLine: cantidad como token "xN" en medio de la línea', () => {
  const r = lib.parseInvoiceLine('Gasas x30 12000');
  assert.equal(r.cantidad, 30);
  assert.equal(r.nombre, 'Gasas');
  assert.equal(r.precio, 12000);
});

test('parseInvoiceLine: sin cantidad explícita asume 1', () => {
  const r = lib.parseInvoiceLine('Chocolatina 2500');
  assert.equal(r.cantidad, 1);
  assert.equal(r.nombre, 'Chocolatina');
  assert.equal(r.precio, 2500);
});

test('parseInvoiceLine: sin precio detectable (nombre con dígitos no confunde)', () => {
  const r = lib.parseInvoiceLine('10 Gaseosa 400ml');
  assert.equal(r.cantidad, 10);
  assert.equal(r.nombre, 'Gaseosa 400ml');
  assert.equal(r.precio, null);
});

test('parseInvoiceLine: línea vacía devuelve null', () => {
  assert.equal(lib.parseInvoiceLine(''), null);
  assert.equal(lib.parseInvoiceLine('   '), null);
});

test('parseInvoiceText: ignora líneas vacías', () => {
  const items = lib.parseInvoiceText('2 Papas 3500\n\nChocolatina 2500\n');
  assert.equal(items.length, 2);
});

test('parseInvoiceText: filtra datos del negocio, dirección, encabezados y totales', () => {
  const text = [
    'Dulces El Antojo S.A.S',
    'NIT: 901.234.567-8',
    'Calle 12 # 23-45',
    'Pereira, Risaralda, Colombia',
    'Tel: 320 123 4567',
    'ventas@dulceselantojo.com',
    'FACTURA DE VENTA',
    'Fecha de emisión: 03/10/2026',
    'Cliente: Cliente de ejemplo',
    'Dirección: Pereira, Risaralda',
    '# PRODUCTO DESCRIPCIÓN CANT. PRECIO UNIT. IVA SUBTOTAL',
    '1',
    '2 Milo Bebida en polvo Milo 400 g 28000',
    'SUBTOTAL 187900',
    'IVA (19%) 35701',
    'TOTAL A PAGAR 223601',
    'Gracias por su compra.',
  ].join('\n');
  const items = lib.parseInvoiceText(text);
  assert.equal(items.length, 1);
  assert.equal(items[0].nombre, 'Milo Bebida en polvo Milo 400 g');
  assert.equal(items[0].cantidad, 2);
  assert.equal(items[0].precio, 28000);
});

test('parseInvoicePosRow: lee recibo de caja (código, descripción, cant., vr.unit, vr.total)', () => {
  const r = lib.parseInvoiceLine('7702001000012  Malta Pony 330 ml                 6     $3.000    $18.000');
  assert.equal(r.cantidad, 6);
  assert.equal(r.nombre, 'Malta Pony 330 ml');
  assert.equal(r.precio, 3000);
});

test('parseInvoicePosRow: no confunde "x N" dentro del nombre con la cantidad', () => {
  const r = lib.parseInvoiceLine('7704000008227  Caja de galletas Festival x 20     1    $42.000    $42.000');
  assert.equal(r.cantidad, 1);
  assert.equal(r.nombre, 'Caja de galletas Festival x 20');
  assert.equal(r.precio, 42000);
});

test('parseInvoiceText: recibo de caja completo — solo quedan los productos', () => {
  const text = [
    'SUPERMERCADO LA ECONOMÍA',
    'NIT: 901.234.567-8',
    'Calle 15 # 23-47',
    'Tel: 320 123 4567',
    'FACTURA DE VENTA',
    'No. FE-0001256',
    'Fecha: 03/10/2026',
    'Hora: 14:32:15',
    'Cajero: 001 - Laura',
    'Caja: 2',
    'CÓDIGO          DESCRIPCIÓN                    CANT.  VR. UNIT.  VR. TOTAL',
    '7702001000012  Malta Pony 330 ml                 6     $3.000    $18.000',
    '7706000078901  Chicles Trident unidad             20    $1.000    $20.000',
    'SUBTOTAL   $251.700',
    'DESCUENTO  $0',
    'IVA (19%)  $47.823',
    'TOTAL A PAGAR  $299.523',
    'FORMA DE PAGO',
    'Efectivo   $300.000',
    'Cambio     $477',
    '¡GRACIAS POR SU COMPRA!',
    'Productos de calidad, al mejor precio.',
    'Esta es una factura de ejemplo sin validez fiscal.',
  ].join('\n');
  const items = lib.parseInvoiceText(text);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.nombre),
    ['Malta Pony 330 ml', 'Chicles Trident unidad']
  );
});

test('buildReporteQuincena: agrupa por persona, separa anulados del total', () => {
  const consumos = [
    { persona_id: 1, persona_nombre: 'Juan', cantidad: 2, precio_unitario: 1000, anulado: false },
    { persona_id: 1, persona_nombre: 'Juan', cantidad: 1, precio_unitario: 5000, anulado: true },
    { persona_id: 2, persona_nombre: 'María', cantidad: 3, precio_unitario: 2000, anulado: false },
  ];
  const reporte = lib.buildReporteQuincena(consumos);
  const juan = reporte.find((r) => r.persona_id === 1);
  const maria = reporte.find((r) => r.persona_id === 2);

  assert.equal(juan.total, 2000);
  assert.equal(juan.items, 2);
  assert.equal(juan.anulados, 1);

  assert.equal(maria.total, 6000);
  assert.equal(maria.items, 3);
  assert.equal(maria.anulados, 0);

  // ordenado de mayor a menor total
  assert.equal(reporte[0].persona_id, 2);
});
