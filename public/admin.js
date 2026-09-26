(function () {
  'use strict';

  const el = {
    authSection: document.getElementById('authSection'),
    authTitle: document.getElementById('authTitle'),
    authForm: document.getElementById('authForm'),
    fieldDisplayName: document.getElementById('fieldDisplayName'),
    displayName: document.getElementById('displayName'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    authSubmit: document.getElementById('authSubmit'),
    authError: document.getElementById('authError'),
    panelSection: document.getElementById('panelSection'),
    btnLogout: document.getElementById('btnLogout'),
    reporteDesde: document.getElementById('reporteDesde'),
    reporteHasta: document.getElementById('reporteHasta'),
    btnReporte: document.getElementById('btnReporte'),
    reporteBody: document.getElementById('reporteBody'),
    personaForm: document.getElementById('personaForm'),
    personaNombre: document.getElementById('personaNombre'),
    personaPin: document.getElementById('personaPin'),
    personasBody: document.getElementById('personasBody'),
    productoForm: document.getElementById('productoForm'),
    productoNombre: document.getElementById('productoNombre'),
    productoFoto: document.getElementById('productoFoto'),
    productoFotoFile: document.getElementById('productoFotoFile'),
    productoFotoPreview: document.getElementById('productoFotoPreview'),
    productoPrecio: document.getElementById('productoPrecio'),
    productoStock: document.getElementById('productoStock'),
    productosBody: document.getElementById('productosBody'),
    facturaFile: document.getElementById('facturaFile'),
    btnOcr: document.getElementById('btnOcr'),
    ocrStatus: document.getElementById('ocrStatus'),
    facturaItemsWrap: document.getElementById('facturaItemsWrap'),
    facturaItemsBody: document.getElementById('facturaItemsBody'),
    btnAplicarFactura: document.getElementById('btnAplicarFactura'),
  };

  let isSetupMode = false;
  let productosCache = [];

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatMoney(value) {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
    } catch (e) {
      return `$${Math.round(value).toLocaleString('es-CO')}`;
    }
  }

  async function apiFetch(url, options) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  }

  function showPanel() {
    el.authSection.hidden = true;
    el.panelSection.hidden = false;
    el.btnLogout.hidden = false;
    loadReporte();
    loadPersonas();
    loadProductos();
  }

  function showAuth() {
    el.authSection.hidden = false;
    el.panelSection.hidden = true;
    el.btnLogout.hidden = true;
  }

  el.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.authError.hidden = true;
    const username = el.username.value.trim();
    const password = el.password.value;
    try {
      if (isSetupMode) {
        await apiFetch('/api/admin/setup-first-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, display_name: el.displayName.value.trim() || null }),
        });
      } else {
        await apiFetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
      }
      showPanel();
    } catch (err) {
      el.authError.textContent = err.message;
      el.authError.hidden = false;
    }
  });

  el.btnLogout.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showAuth();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ── Reporte ──────────────────────────────────────────────────────────

  async function loadReporte() {
    const params = new URLSearchParams();
    if (el.reporteDesde.value) params.set('desde', el.reporteDesde.value);
    if (el.reporteHasta.value) params.set('hasta', el.reporteHasta.value);
    const data = await apiFetch(`/api/admin/reporte?${params}`);
    el.reporteBody.innerHTML = data
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.persona_nombre)}</td><td>${r.items}</td><td><strong>${formatMoney(r.total)}</strong></td><td>${r.anulados > 0 ? `<span class="pill pill-warn">${r.anulados}</span>` : '—'}</td><td><button type="button" class="btn btn-sm" data-detalle="${r.persona_id}" data-nombre="${escapeHtml(r.persona_nombre)}">Ver detalle</button></td></tr>`
      )
      .join('') || '<tr><td colspan="5" class="muted">Sin consumos en el rango.</td></tr>';

    el.reporteBody.querySelectorAll('[data-detalle]').forEach((btn) => {
      btn.addEventListener('click', () => mostrarDetallePersona(Number(btn.dataset.detalle), btn.dataset.nombre));
    });
  }

  el.btnReporte.addEventListener('click', loadReporte);

  async function mostrarDetallePersona(personaId, nombre) {
    const consumos = await apiFetch(`/api/admin/personas/${personaId}/consumos`);
    const rows = consumos
      .map((c) => {
        const fecha = new Date(c.created_at).toLocaleDateString('es-CO');
        const total = formatMoney(Number(c.precio_unitario) * Number(c.cantidad));
        const producto = c.tf_productos ? c.tf_productos.nombre : '';
        const estado = c.anulado ? '<span class="pill pill-warn">Anulado</span>' : '<span class="pill pill-ok">Vigente</span>';
        const motivo = c.anulado ? escapeHtml(c.motivo_anulacion || '—') : '';
        return `<tr><td>${fecha}</td><td>${escapeHtml(producto)}</td><td>${c.cantidad}</td><td>${total}</td><td>${estado}</td><td>${motivo}</td></tr>`;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'vw-modal-overlay';
    overlay.innerHTML = `
      <div class="vw-modal-box" style="max-width:640px">
        <h2 style="margin:0 0 12px">Detalle de ${escapeHtml(nombre)}</h2>
        <div class="table-wrap" style="max-height:60vh;overflow-y:auto">
          <table>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th><th>Estado</th><th>Motivo</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" class="muted">Sin consumos.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="vw-modal-actions" style="margin-top:12px">
          <button type="button" class="btn btn-accent" id="btnCerrarDetalle">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function close() {
      overlay.remove();
    }
    overlay.querySelector('#btnCerrarDetalle').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  // ── Personas ─────────────────────────────────────────────────────────

  async function loadPersonas() {
    const data = await apiFetch('/api/admin/personas');
    el.personasBody.innerHTML = data
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.nombre)}</td><td>${p.activo ? '<span class="pill pill-ok">Activa</span>' : '<span class="pill pill-warn">Inactiva</span>'}</td><td></td></tr>`
      )
      .join('');
  }

  el.personaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: el.personaNombre.value.trim(), pin: el.personaPin.value.trim() }),
      });
      el.personaForm.reset();
      await loadPersonas();
      window.VW_UI.toast('Persona agregada.', 'ok');
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  });

  // ── Productos ────────────────────────────────────────────────────────

  async function loadProductos() {
    productosCache = await apiFetch('/api/admin/productos');
    el.productosBody.innerHTML = productosCache
      .map((p) => {
        const foto = p.foto_url ? `<img src="${escapeHtml(p.foto_url)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px" />` : '';
        return `<tr><td>${foto}</td><td>${escapeHtml(p.nombre)}</td><td>${formatMoney(p.precio)}</td><td>${p.stock}</td><td>${p.activo ? '<span class="pill pill-ok">Activo</span>' : '<span class="pill pill-warn">Inactivo</span>'}</td><td><button type="button" class="btn btn-sm" data-toggle="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`;
      })
      .join('');
    el.productosBody.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = productosCache.find((x) => x.id === Number(btn.dataset.toggle));
        await apiFetch(`/api/admin/productos/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: !p.activo }),
        });
        await loadProductos();
      });
    });
  }

  el.productoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: el.productoNombre.value.trim(),
          precio: Number(el.productoPrecio.value),
          stock: Number(el.productoStock.value) || 0,
          foto_url: el.productoFoto.value.trim() || null,
        }),
      });
      el.productoForm.reset();
      el.productoFoto.value = '';
      el.productoFotoPreview.hidden = true;
      el.productoFotoPreview.src = '';
      await loadProductos();
      window.VW_UI.toast('Producto agregado.', 'ok');
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  });

  el.productoFotoFile.addEventListener('change', async () => {
    const file = el.productoFotoFile.files[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
      el.productoFoto.value = data.url;
      el.productoFotoPreview.src = data.url;
      el.productoFotoPreview.hidden = false;
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  });

  // ── Factura (OCR) ────────────────────────────────────────────────────

  let facturaItems = [];
  let facturaTexto = '';

  function renderFacturaItems() {
    el.facturaItemsBody.innerHTML = facturaItems
      .map(
        (item, i) => `
        <tr>
          <td><input type="number" min="0" value="${item.cantidad}" data-field="cantidad" data-i="${i}" style="width:70px" /></td>
          <td><input type="text" value="${escapeHtml(item.nombre)}" data-field="nombre" data-i="${i}" /></td>
          <td><input type="number" min="0" value="${item.precio || ''}" data-field="precio" data-i="${i}" style="width:90px" /></td>
          <td><button type="button" class="btn btn-sm" data-remove="${i}">Quitar</button></td>
        </tr>
      `
      )
      .join('');

    el.facturaItemsBody.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.i);
        const field = input.dataset.field;
        facturaItems[i][field] = field === 'nombre' ? input.value : Number(input.value);
      });
    });
    el.facturaItemsBody.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        facturaItems.splice(Number(btn.dataset.remove), 1);
        renderFacturaItems();
      });
    });
  }

  el.btnOcr.addEventListener('click', async () => {
    const file = el.facturaFile.files[0];
    if (!file) {
      window.VW_UI.toast('Elegí una foto primero.', 'error');
      return;
    }
    el.ocrStatus.hidden = false;
    el.btnOcr.disabled = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/factura/ocr', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer la factura');
      facturaTexto = data.texto;
      facturaItems = data.items.map((it) => ({ ...it }));
      renderFacturaItems();
      el.facturaItemsWrap.hidden = false;
      if (facturaItems.length === 0) {
        window.VW_UI.toast('No se detectaron líneas — revisá la foto o cargá manualmente.', 'error');
      }
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    } finally {
      el.ocrStatus.hidden = true;
      el.btnOcr.disabled = false;
    }
  });

  el.btnAplicarFactura.addEventListener('click', async () => {
    const items = facturaItems.map((it) => {
      const match = productosCache.find((p) => p.nombre.toLowerCase() === it.nombre.toLowerCase());
      return match
        ? { producto_id: match.id, cantidad: it.cantidad }
        : { nombre: it.nombre, precio: it.precio, cantidad: it.cantidad };
    });
    try {
      const data = await apiFetch('/api/admin/factura/aplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, texto: facturaTexto }),
      });
      window.VW_UI.toast(`Inventario actualizado: ${data.aplicados.length} producto(s).`, 'ok');
      el.facturaItemsWrap.hidden = true;
      facturaItems = [];
      el.facturaFile.value = '';
      await loadProductos();
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────

  async function init() {
    const { needsSetup } = await apiFetch('/api/admin/needs-setup');
    isSetupMode = needsSetup;
    el.authTitle.textContent = needsSetup ? 'Crear cuenta del dueño' : 'Ingresar';
    el.authSubmit.textContent = needsSetup ? 'Crear cuenta' : 'Ingresar';
    el.fieldDisplayName.hidden = !needsSetup;

    const me = await apiFetch('/api/admin/me');
    if (me.username) showPanel();
    else showAuth();
  }

  init().catch((err) => console.error(err));
})();
