'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { createWorker } = require('tesseract.js');

const lib = require('./lib');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Faltan variables de entorno obligatorias: ${missingEnv.join(', ')}. No se inicia el servidor.`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Capa de datos ───────────────────────────────────────────────────────

async function sbGetConfig() {
  const { data, error } = await supabase.from('tf_negocio_config').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

async function sbListPersonas({ activeOnly = false } = {}) {
  let q = supabase.from('tf_personas').select('id, nombre, activo, created_at').order('nombre');
  if (activeOnly) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function sbGetPersona(id) {
  const { data, error } = await supabase.from('tf_personas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function sbCreatePersona(nombre, pin) {
  const { data, error } = await supabase
    .from('tf_personas')
    .insert({ nombre, pin_hash: lib.hashSecret(pin) })
    .select('id, nombre, activo, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function sbListProductos({ activeOnly = false } = {}) {
  let q = supabase.from('tf_productos').select('*').order('nombre');
  if (activeOnly) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function sbCreateProducto(fields) {
  const { data, error } = await supabase.from('tf_productos').insert(fields).select().single();
  if (error) throw error;
  return data;
}

async function sbUpdateProducto(id, fields) {
  const { data, error } = await supabase
    .from('tf_productos')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function sbCreateConsumo({ personaId, productoId, cantidad, precioUnitario }) {
  const { data, error } = await supabase
    .from('tf_consumos')
    .insert({ persona_id: personaId, producto_id: productoId, cantidad, precio_unitario: precioUnitario })
    .select()
    .single();
  if (error) throw error;

  // Descuento de stock directo (no hay concurrencia crítica: un solo
  // dispositivo autoservicio a la vez en la tienda física).
  const { data: producto } = await supabase.from('tf_productos').select('stock').eq('id', productoId).single();
  if (producto) {
    await supabase
      .from('tf_productos')
      .update({ stock: Number(producto.stock) - Number(cantidad) })
      .eq('id', productoId);
  }
  return data;
}

async function sbGetConsumo(id) {
  const { data, error } = await supabase.from('tf_consumos').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function sbAnularConsumo(id, motivo) {
  const { data, error } = await supabase
    .from('tf_consumos')
    .update({ anulado: true, motivo_anulacion: motivo, anulado_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Repone el stock que se había descontado.
  const { data: producto } = await supabase.from('tf_productos').select('stock').eq('id', data.producto_id).single();
  if (producto) {
    await supabase
      .from('tf_productos')
      .update({ stock: Number(producto.stock) + Number(data.cantidad) })
      .eq('id', data.producto_id);
  }
  return data;
}

async function sbListConsumosByPersona(personaId, limit = 200) {
  const { data, error } = await supabase
    .from('tf_consumos')
    .select('*, tf_productos(nombre)')
    .eq('persona_id', personaId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function sbListConsumosRango(desde, hasta) {
  let q = supabase
    .from('tf_consumos')
    .select('*, tf_personas(nombre)')
    .order('created_at', { ascending: false });
  if (desde) q = q.gte('created_at', desde);
  // Un input type="date" manda solo "2024-01-15" — comparado con lte tal
  // cual, Postgres lo castea a medianoche de ese día y excluye todo lo
  // registrado durante el día seleccionado. Se empuja al final del día.
  if (hasta) {
    const hastaFinDeDia = /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? `${hasta}T23:59:59.999` : hasta;
    q = q.lte('created_at', hastaFinDeDia);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data.map((c) => ({
    persona_id: c.persona_id,
    persona_nombre: c.tf_personas ? c.tf_personas.nombre : '(desconocido)',
    cantidad: c.cantidad,
    precio_unitario: c.precio_unitario,
    anulado: c.anulado,
  }));
}

async function sbFindAdminByUsername(username) {
  const { data, error } = await supabase.from('tf_admins').select('*').eq('username', username).maybeSingle();
  if (error) throw error;
  return data;
}

async function sbCountAdmins() {
  const { count, error } = await supabase.from('tf_admins').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function sbCreateAdmin(username, passwordHash, displayName) {
  const { data, error } = await supabase
    .from('tf_admins')
    .insert({ username, password_hash: passwordHash, display_name: displayName || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function sbSaveFactura(textoOcr, itemsAplicados) {
  const { error } = await supabase.from('tf_facturas').insert({ texto_ocr: textoOcr, items_aplicados: itemsAplicados });
  if (error) throw error;
}

// ── App ─────────────────────────────────────────────────────────────────

const app = express();
if (IS_PROD) app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

// El PIN de una persona se intenta mucho más seguido que el login del
// dueño (uso normal del día a día) — límite más generoso pero igual
// presente, para que no sea trivial de adivinar por fuerza bruta.
const pinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
  })
);

function requireAdmin(req, res, next) {
  if (!req.session.adminUsername) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => handler(req, res, next).catch(next);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(Object.assign(new Error('Solo se aceptan imágenes JPG, PNG o WEBP'), { status: 400 }));
    }
    cb(null, true);
  },
});

// Sube una foto de producto a Supabase Storage (bucket "uploads", mismo
// patrón que VENTA-WEB) y devuelve la URL pública.
async function sbUploadImage(buffer, mimetype, originalName) {
  const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const { error } = await supabase.storage.from('uploads').upload(filename, buffer, {
    contentType: mimetype,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('uploads').getPublicUrl(filename);
  return data.publicUrl;
}

// Verifica el PIN de una persona contra la base. 401 si no coincide.
async function requirePersonaPin(req, res, next) {
  try {
    const personaId = Number(req.body.persona_id || req.params.personaId);
    const pin = lib.sanitizePin(req.body.pin);
    if (!personaId || !lib.isValidPin(pin)) {
      return res.status(400).json({ error: 'Falta persona o PIN inválido' });
    }
    const persona = await sbGetPersona(personaId);
    if (!persona || !persona.activo || !lib.verifySecret(pin, persona.pin_hash)) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    req.persona = persona;
    next();
  } catch (err) {
    next(err);
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

// ── Rutas públicas (autoservicio, sin login) ────────────────────────────

app.get(
  '/api/negocio',
  asyncRoute(async (req, res) => {
    const config = await sbGetConfig();
    res.json({ name: config.name, currency: config.currency });
  })
);

app.get(
  '/api/personas',
  asyncRoute(async (req, res) => {
    res.json(await sbListPersonas({ activeOnly: true }));
  })
);

app.get(
  '/api/productos',
  asyncRoute(async (req, res) => {
    res.json(await sbListProductos({ activeOnly: true }));
  })
);

app.post(
  '/api/consumos',
  pinLimiter,
  requirePersonaPin,
  asyncRoute(async (req, res) => {
    const productoId = Number(req.body.producto_id);
    const cantidad = Number(req.body.cantidad);
    if (!productoId || !(cantidad > 0)) {
      return res.status(400).json({ error: 'Producto o cantidad inválidos' });
    }
    const productos = await sbListProductos({ activeOnly: true });
    const producto = productos.find((p) => p.id === productoId);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const consumo = await sbCreateConsumo({
      personaId: req.persona.id,
      productoId,
      cantidad,
      precioUnitario: producto.precio,
    });
    res.json(consumo);
  })
);

app.post(
  '/api/personas/:personaId/consumos',
  pinLimiter,
  requirePersonaPin,
  asyncRoute(async (req, res) => {
    res.json(await sbListConsumosByPersona(req.persona.id));
  })
);

app.post(
  '/api/consumos/:id/anular',
  pinLimiter,
  asyncRoute(async (req, res) => {
    const consumoId = Number(req.params.id);
    const pin = lib.sanitizePin(req.body.pin);
    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Falta el motivo de la anulación' });
    if (!lib.isValidPin(pin)) return res.status(400).json({ error: 'PIN inválido' });

    const consumo = await sbGetConsumo(consumoId);
    if (!consumo) return res.status(404).json({ error: 'No encontrado' });
    if (consumo.anulado) return res.status(400).json({ error: 'Ya estaba anulado' });

    const persona = await sbGetPersona(consumo.persona_id);
    if (!persona || !lib.verifySecret(pin, persona.pin_hash)) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    res.json(await sbAnularConsumo(consumoId, motivo));
  })
);

// ── Autenticación del dueño ──────────────────────────────────────────────

app.get(
  '/api/admin/needs-setup',
  asyncRoute(async (req, res) => {
    res.json({ needsSetup: (await sbCountAdmins()) === 0 });
  })
);

app.post(
  '/api/admin/setup-first-admin',
  authLimiter,
  asyncRoute(async (req, res) => {
    if ((await sbCountAdmins()) > 0) {
      return res.status(403).json({ error: 'Ya existe un administrador.' });
    }
    const username = lib.sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!username || password.length < 8) {
      return res.status(400).json({ error: 'Usuario inválido o contraseña muy corta (mínimo 8 caracteres).' });
    }
    await sbCreateAdmin(username, lib.hashSecret(password), req.body.display_name || null);
    req.session.adminUsername = username;
    res.json({ ok: true, username });
  })
);

app.post(
  '/api/admin/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const username = lib.sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const admin = await sbFindAdminByUsername(username);
    if (!admin || !lib.verifySecret(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    req.session.adminUsername = username;
    res.json({ ok: true, username });
  })
);

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ username: req.session.adminUsername || null });
});

// ── Panel del dueño ───────────────────────────────────────────────────────

app.get(
  '/api/admin/personas',
  requireAdmin,
  asyncRoute(async (req, res) => {
    res.json(await sbListPersonas());
  })
);

app.post(
  '/api/admin/personas',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    const pin = lib.sanitizePin(req.body.pin);
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
    if (!lib.isValidPin(pin)) return res.status(400).json({ error: 'El PIN debe tener 4 dígitos' });
    res.json(await sbCreatePersona(nombre, pin));
  })
);

app.get(
  '/api/admin/productos',
  requireAdmin,
  asyncRoute(async (req, res) => {
    res.json(await sbListProductos());
  })
);

app.post(
  '/api/admin/productos',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    const precio = Number(req.body.precio);
    if (!nombre || !(precio >= 0)) return res.status(400).json({ error: 'Nombre o precio inválidos' });
    res.json(
      await sbCreateProducto({
        nombre,
        precio,
        stock: Number(req.body.stock) || 0,
        unidad: req.body.unidad || 'unidad',
        foto_url: req.body.foto_url || null,
      })
    );
  })
);

app.put(
  '/api/admin/productos/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const fields = {};
    if (req.body.nombre !== undefined) fields.nombre = String(req.body.nombre).trim();
    if (req.body.precio !== undefined) fields.precio = Number(req.body.precio);
    if (req.body.stock !== undefined) fields.stock = Number(req.body.stock);
    if (req.body.foto_url !== undefined) fields.foto_url = req.body.foto_url || null;
    if (req.body.activo !== undefined) fields.activo = Boolean(req.body.activo);
    res.json(await sbUpdateProducto(Number(req.params.id), fields));
  })
);

app.get(
  '/api/admin/reporte',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const consumos = await sbListConsumosRango(req.query.desde, req.query.hasta);
    res.json(lib.buildReporteQuincena(consumos));
  })
);

app.get(
  '/api/admin/personas/:id/consumos',
  requireAdmin,
  asyncRoute(async (req, res) => {
    res.json(await sbListConsumosByPersona(Number(req.params.id)));
  })
);

app.post(
  '/api/admin/upload',
  requireAdmin,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const url = await sbUploadImage(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ url });
  })
);

// ── Factura por foto (OCR local, sin API de IA) ──────────────────────────
// El OCR (tesseract.js) solo lee texto de la imagen. El parseo de
// cantidad/nombre/precio es una heurística de líneas (lib.parseInvoiceText)
// — por eso esto SIEMPRE vuelve como una lista editable, nunca se aplica
// solo al inventario sin que el dueño la confirme.

app.post(
  '/api/admin/factura/ocr',
  requireAdmin,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta la foto de la factura' });

    const worker = await createWorker('spa');
    try {
      const {
        data: { text },
      } = await worker.recognize(req.file.buffer);
      res.json({ texto: text, items: lib.parseInvoiceText(text) });
    } finally {
      await worker.terminate();
    }
  })
);

app.post(
  '/api/admin/factura/aplicar',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const productos = await sbListProductos();
    const aplicados = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad) || 0;
      if (cantidad <= 0) continue;
      if (item.producto_id) {
        const producto = productos.find((p) => p.id === Number(item.producto_id));
        if (!producto) continue;
        await sbUpdateProducto(producto.id, { stock: Number(producto.stock) + cantidad });
        aplicados.push({ producto_id: producto.id, nombre: producto.nombre, cantidad, tipo: 'existente' });
      } else if (item.nombre) {
        const nuevo = await sbCreateProducto({
          nombre: String(item.nombre).trim(),
          precio: Number(item.precio) || 0,
          stock: cantidad,
          unidad: 'unidad',
        });
        aplicados.push({ producto_id: nuevo.id, nombre: nuevo.nombre, cantidad, tipo: 'nuevo' });
      }
    }
    await sbSaveFactura(req.body.texto || null, aplicados);
    res.json({ ok: true, aplicados });
  })
);

// ── Errores ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  void next;
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Archivo demasiado grande (máx 8MB)' });
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Error interno' : err.message });
});

app.listen(PORT, () => console.log(`TIENDA- escuchando en :${PORT}`));
