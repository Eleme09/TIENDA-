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
