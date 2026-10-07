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
  return /^\d{3,4}$/.test(String(raw ?? ''));
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

// Formato de recibo de caja/surtidora (el más común en el mercado):
// "CÓDIGO  DESCRIPCIÓN  CANT.  VR.UNIT  VR.TOTAL" en una sola línea, ej.
// "7702001000012  Malta Pony 330 ml   6   $3.000   $18.000". Se intenta
// primero porque es más confiable que la heurística genérica — acá la
// cantidad y el precio están en columnas fijas, no hay que adivinar si
// un número suelto es cantidad o parte del nombre.
function parseInvoicePosRow(line) {
  const m = line.match(/^(\d{6,14})\s+(.+?)\s+(\d{1,4})\s+\$?\s?([\d.,]{3,})\s+\$?\s?([\d.,]{3,})\s*$/);
  if (!m) return null;
  const [, , nombreRaw, cantidadRaw, precioUnitRaw] = m;
  const nombre = nombreRaw.trim();
  if (!nombre) return null;
  return {
    raw: line,
    cantidad: Number(cantidadRaw),
    nombre,
    precio: Number(precioUnitRaw.replace(/[.,]/g, '')) || null,
  };
}

// Parseo heurístico de una línea de factura OCR: "2 Bolsa de papas 3500" o
// "Gasas x30 12000" → { cantidad, nombre, precio }. Es una heurística, no
// magia — por eso el flujo de factura siempre muestra esto en una tabla
// editable antes de guardar nada.
function parseInvoiceLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return null;

  const posRow = parseInvoicePosRow(line);
  if (posRow) return posRow;

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

// Líneas que casi nunca son un producto: datos del negocio/cliente
// (dirección, teléfono, NIT, correo), encabezados/pies de la factura
// (fecha, forma de pago, subtotal, totales) y encabezados de columna de
// la tabla. El OCR no distingue esto de un producto real — hay que
// filtrarlo antes de intentar leer cantidad/precio.
const JUNK_LINE_PATTERNS = [
  /factura de venta/i,
  /\bnit\b/i,
  /\btel(?:[eé]fono)?\s*:/i,
  /\bcalle\b/i,
  /\bcra\.?\b/i,
  /\bcarrera\b/i,
  /\bavenida\b/i,
  /\bav\.\s/i,
  /\bcliente\s*:/i,
  /direcci[oó]n\s*:/i,
  /^fecha\s*:/i,
  /\bfecha\s+de\b/i,
  /^hora\s*:/i,
  /^cajero\s*:/i,
  /^caja\s*:/i,
  /vencimiento/i,
  /forma de pago/i,
  /\bvendedor\s*:/i,
  /\bsubtotal\b/i,
  /\bdescuento\b/i,
  /\biva\s*\(/i,
  /total a pagar/i,
  /^(efectivo|cambio)\b/i,
  /observaciones/i,
  /gracias por su compra/i,
  /documento de ejemplo/i,
  /firma y sello/i,
  /consumo masivo/i,
  /validez fiscal/i,
  /mejor precio/i,
  /calidad garantizada/i,
  /atenci[oó]n al cliente/i,
  /no se aceptan devoluciones/i,
  /conserve su (factura|recibo|comprobante)/i,
  /\bs\.?a\.?s\.?\b/i,
  /\bltda\.?\b/i,
  /@/, // correos
  /www\./i,
  /\.com/i,
  /^n[°º]\s/i,
  /^no\.?\s/i,
  // encabezado de columnas del recibo de caja ("CÓDIGO  DESCRIPCIÓN  CANT. ...")
  /^c[oó]digo\b.*descripci[oó]n/i,
  // pie de factura electrónica DIAN: resumen de impuestos, resolución, QR, etc.
  /atendido por/i,
  /num\.?\s*art/i,
  /resoluci[oó]n dian/i,
  /\bvigencia\b/i,
  /\bcufe\b/i,
  /resumen de impuestos/i,
  /^id\s+total\s+base\s+iva/i,
  /^total\b/i,
  /consumidor final/i,
  /emisi[oó]n/i,
  /valor pagado/i,
  /sistema pos/i,
  /facturador electr[oó]nico/i,
  /electr[oó]nica de venta/i,
  // fila de resumen de IVA/exento ("5 = EXENTO 28,750 ..." / "A 19% 46,000 ...")
  /^[a-z0-9]\s*=?\s*(exento\b|\d+%)/i,
];

function isJunkInvoiceLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 2) return true;
  if (JUNK_LINE_PATTERNS.some((re) => re.test(trimmed))) return true;
  // encabezado de columna de la tabla, o solo el número de fila (#)
  if (/^(#|producto|descripci[oó]n|cant\.?|precio\s*unit\.?|vr\.?\s*unit\.?|vr\.?\s*total|iva|subtotal)$/i.test(trimmed))
    return true;
  if (/^\d{1,3}$/.test(trimmed)) return true;
  // sin ninguna letra (teléfonos, NIT, códigos sueltos)
  if (!/[a-zá-úñA-ZÁ-ÚÑ]/.test(trimmed)) return true;
  // encabezado de columnas con cualquier orden ("PLU UM VALOR U CÓDIGO DESCRIPCIÓN ...")
  if (/c[oó]digo/i.test(trimmed) && /descripci[oó]n/i.test(trimmed)) return true;
  // lista de nombres propios separados por coma, sin números (ej:
  // "Pereira, Risaralda, Colombia") — una dirección/ciudad, no un producto.
  if (/^([A-ZÁÉÍÓÚÑ][\wá-úñ.]*,\s*)+[A-ZÁÉÍÓÚÑ][\wá-úñ.]*$/.test(trimmed) && !/\d/.test(trimmed)) return true;
  // línea en MAYÚSCULA sostenida sin ningún dígito: nombre del negocio,
  // título de la factura, banner de agradecimiento, etc. — un producto
  // real en este formato siempre va en formato Título, nunca todo en caps.
  if (trimmed.length > 4 && !/\d/.test(trimmed) && trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    return true;
  }
  return false;
}

// Factura electrónica DIAN, una fila por línea:
// "1 23 UN 1,250 7700304504916 LECHE ENTERA 28,750 5"
//  ítem cant UM  vr.unit        código        descripción    vr.total  id-iva
function parseInvoiceDianRow(line) {
  const m = line.match(
    /^\d{1,3}\s+(\d{1,4})\s*UN\s+([\d.,]+)\s+(\d{8,14})\s+(.+?)\s+([\d.,]{3,})\s+[A-Z0-9]\s*$/i
  );
  if (!m) return null;
  const [, cantidadRaw, precioUnitRaw, codigo, nombreRaw, ] = m;
  const nombre = nombreRaw.trim();
  if (!nombre) return null;
  return {
    raw: line,
    cantidad: Number(cantidadRaw),
    nombre,
    precio: Number(precioUnitRaw.replace(/[.,]/g, '')) || null,
    codigo,
  };
}

// Recibo de caja registradora (ej. "SURTITIENDAS"), formato de varias
// líneas por producto:
//   53016 DE TODITO X12          <- código + nombre
//     ---X 12          29800     <- cantidad + valor total
//     6.00 x $2500                <- desglose de precio por unidad interna (se ignora)
// A veces hay una segunda línea de "fracción" para el mismo producto
// (venta de una caja incompleta), que se suma a la cantidad/total:
//     ---_F/X 1        15000
function parseCajaCodeNameLine(line) {
  const m = line.match(/^\d{4,6}\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9/.\s]{2,})$/);
  if (!m) return null;
  const nombre = m[1].trim().replace(/\s{2,}/g, ' ');
  if (!nombre || /^\d+$/.test(nombre)) return null;
  return { nombre };
}

function parseCajaQtyLine(line) {
  const m = line.match(/^-{1,4}\s*(?:_F\/)?[Xx*]\s*(\d{1,4})\s*(?:UNDS?|UN)?\s+\$?\s?([\d.,]{3,})\s*$/);
  if (!m) return null;
  const [, cantidadRaw, totalRaw] = m;
  return { cantidad: Number(cantidadRaw), total: Number(totalRaw.replace(/[.,]/g, '')) || 0 };
}

function isCajaBreakdownLine(line) {
  return /^\d+(?:\.\d{1,2})?\s*x\s*\$?[\d.,]+$/i.test(line);
}

function parseInvoiceText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];
  let pending = null; // producto de caja en curso, esperando su línea de cantidad/precio

  function flushPending() {
    if (pending && pending.cantidad > 0) {
      results.push({
        raw: pending.raw,
        cantidad: pending.cantidad,
        nombre: pending.nombre,
        precio: pending.total > 0 ? Math.round(pending.total / pending.cantidad) : null,
      });
    }
    pending = null;
  }

  for (const line of lines) {
    if (isJunkInvoiceLine(line)) continue;

    const dian = parseInvoiceDianRow(line);
    if (dian) {
      flushPending();
      results.push(dian);
      continue;
    }

    const qty = parseCajaQtyLine(line);
    if (qty) {
      if (pending) {
        pending.cantidad += qty.cantidad;
        pending.total += qty.total;
      }
      continue;
    }

    if (isCajaBreakdownLine(line)) continue;

    const code = parseCajaCodeNameLine(line);
    if (code) {
      flushPending();
      pending = { raw: line, nombre: code.nombre, cantidad: 0, total: 0 };
      continue;
    }

    flushPending();
    const generic = parseInvoiceLine(line);
    if (generic) results.push(generic);
  }
  flushPending();

  // desambiguar productos con el mismo nombre pero código distinto
  // (ej. dos presentaciones de "Bebida de Yog" en la misma factura)
  const nombreCounts = new Map();
  for (const r of results) nombreCounts.set(r.nombre, (nombreCounts.get(r.nombre) || 0) + 1);
  for (const r of results) {
    if (r.codigo && nombreCounts.get(r.nombre) > 1) {
      r.nombre = `${r.nombre} (${r.codigo})`;
    }
  }

  return results;
}

module.exports = {
  sanitizeUsername,
  hashSecret,
  verifySecret,
  sanitizePin,
  isValidPin,
  buildReporteQuincena,
  parseInvoiceLine,
  parseInvoiceDianRow,
  parseInvoiceText,
};
