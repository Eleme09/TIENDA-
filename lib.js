'use strict';

// Funciones puras (sin fetch, sin Supabase) — mismo patrón que
// venta-webs-lib.js en VENTA-WEB. server.js requiere este módulo.

const crypto = require('crypto');

function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
}

// scrypt nativo de Node (sin dependencia externa). Formato: "salt_hex:hash_hex".
// Se usa tanto para la contraseña del dueño como para el PIN de cada persona.
function hashSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 1) {
    throw new Error('secreto vacío');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifySecret(secret, stored) {
  if (typeof secret !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(secret, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function sanitizePin(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  return digits.slice(0, 4);
}

function isValidPin(raw) {
  return /^\d{4}$/.test(String(raw ?? ''));
}

// Reporte de quincena: agrupa consumos (ya filtrados por fecha) por persona,
// separando lo vigente de lo anulado. `consumos`: [{ persona_id, persona_nombre,
// cantidad, precio_unitario, anulado }]
function buildReporteQuincena(consumos) {
  const porPersona = new Map();
  for (const c of consumos || []) {
    if (!porPersona.has(c.persona_id)) {
      porPersona.set(c.persona_id, {
        persona_id: c.persona_id,
        persona_nombre: c.persona_nombre,
        total: 0,
        items: 0,
        anulados: 0,
      });
    }
    const entry = porPersona.get(c.persona_id);
    const lineTotal = (Number(c.precio_unitario) || 0) * (Number(c.cantidad) || 0);
    if (c.anulado) {
      entry.anulados += 1;
    } else {
      entry.total += lineTotal;
      entry.items += Number(c.cantidad) || 0;
    }
  }
  return Array.from(porPersona.values()).sort((a, b) => b.total - a.total);
}

// Parseo heurístico de una línea de factura OCR: "2 Bolsa de papas 3500" o
// "Gasas x30 12000" → { cantidad, nombre, precio }. Es una heurística, no
// magia — por eso el flujo de factura siempre muestra esto en una tabla
// editable antes de guardar nada.
function parseInvoiceLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return null;

  let rest = line;

  // precio: último número grande (3+ dígitos) al final de la línea. Se
  // extrae primero porque "cantidad" puede aparecer en medio de la línea
  // (ej: "Gasas x30 12000") y confundirse con el precio si se deja para el
  // final.
  let precio = null;
  const priceMatch = rest.match(/(\d[\d.,]{2,})\s*$/);
  if (priceMatch) {
    precio = Number(priceMatch[1].replace(/[.,]/g, ''));
    rest = rest.slice(0, priceMatch.index).trim();
  }

  // cantidad al inicio ("2 Bolsa de papas") o como token "x30" en
  // cualquier parte de lo que queda ("Gasas x30").
  let cantidad = null;
  let m = rest.match(/^(\d{1,4})\s+(.+)$/);
  if (m) {
    cantidad = Number(m[1]);
    rest = m[2].trim();
  } else {
    m = rest.match(/\bx\s*(\d{1,4})\b/i);
    if (m) {
      cantidad = Number(m[1]);
      rest = (rest.slice(0, m.index) + rest.slice(m.index + m[0].length)).trim();
    }
  }

  const nombre = rest.replace(/[-–—:]+$/, '').trim();
  if (!nombre) return null;

  return {
    raw: line,
    cantidad: cantidad && cantidad > 0 ? cantidad : 1,
    nombre,
    precio: precio && precio > 0 ? precio : null,
  };
}

function parseInvoiceText(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseInvoiceLine)
    .filter(Boolean);
}

module.exports = {
  sanitizeUsername,
  hashSecret,
  verifySecret,
  sanitizePin,
  isValidPin,
  buildReporteQuincena,
  parseInvoiceLine,
  parseInvoiceText,
};
