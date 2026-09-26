(function () {
  'use strict';

  const el = {
    businessName: document.getElementById('businessName'),
    stepPersona: document.getElementById('stepPersona'),
    personaGrid: document.getElementById('personaGrid'),
    stepPin: document.getElementById('stepPin'),
    pinPersonaName: document.getElementById('pinPersonaName'),
    pinForm: document.getElementById('pinForm'),
    pinInput: document.getElementById('pinInput'),
    btnBackPersona: document.getElementById('btnBackPersona'),
    stepMenu: document.getElementById('stepMenu'),
    menuPersonaName: document.getElementById('menuPersonaName'),
    productoList: document.getElementById('productoList'),
    historialBody: document.getElementById('historialBody'),
    btnSalir: document.getElementById('btnSalir'),
  };

  let business = null;
  let personas = [];
  let productos = [];
  let selectedPersona = null;
  let currentPin = null;
  const qtyByProducto = {};

  function formatMoney(value) {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: business.currency || 'COP', maximumFractionDigits: 0 }).format(value);
    } catch (e) {
      return `$${Math.round(value).toLocaleString('es-CO')}`;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showStep(step) {
    el.stepPersona.hidden = step !== 'persona';
    el.stepPin.hidden = step !== 'pin';
    el.stepMenu.hidden = step !== 'menu';
  }

  function renderPersonas() {
    el.personaGrid.innerHTML = personas
      .map((p) => `<button type="button" class="persona-chip" data-id="${p.id}">${escapeHtml(p.nombre)}</button>`)
      .join('');
    el.personaGrid.querySelectorAll('.persona-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPersona = personas.find((p) => p.id === Number(btn.dataset.id));
        el.pinPersonaName.textContent = selectedPersona.nombre;
        el.pinInput.value = '';
        showStep('pin');
        el.pinInput.focus();
      });
    });
  }

  function renderProductos() {
    el.productoList.innerHTML = productos
      .map((p) => {
        const qty = qtyByProducto[p.id] || 0;
        const outOfStock = Number(p.stock) <= 0;
        const foto = p.foto_url
          ? `<img class="producto-foto" src="${escapeHtml(p.foto_url)}" alt="" loading="lazy" />`
          : '<div class="producto-foto producto-foto-empty"></div>';
        return `
          <div class="producto-row">
            ${foto}
            <div style="flex:1;min-width:0">
              <div class="producto-nombre">${escapeHtml(p.nombre)}</div>
              <div class="producto-precio">${formatMoney(p.precio)} ${outOfStock ? '· <span class="pill pill-warn">Sin stock</span>' : ''}</div>
            </div>
            <div class="qty-controls">
              <button type="button" class="qty-btn" data-id="${p.id}" data-delta="-1" ${outOfStock ? 'disabled' : ''}>−</button>
              <span>${qty}</span>
              <button type="button" class="qty-btn" data-id="${p.id}" data-delta="1" ${outOfStock ? 'disabled' : ''}>+</button>
              ${qty > 0 ? `<button type="button" class="btn btn-accent btn-sm" data-confirm="${p.id}">Anotar</button>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    el.productoList.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const delta = Number(btn.dataset.delta);
        qtyByProducto[id] = Math.max(0, (qtyByProducto[id] || 0) + delta);
        renderProductos();
      });
    });
    el.productoList.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', () => registrarConsumo(Number(btn.dataset.confirm)));
    });
  }

  async function registrarConsumo(productoId) {
    const cantidad = qtyByProducto[productoId] || 0;
    if (cantidad <= 0) return;
    try {
      const res = await fetch('/api/consumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: selectedPersona.id, pin: currentPin, producto_id: productoId, cantidad }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar');
      qtyByProducto[productoId] = 0;
      await refreshProductos();
      window.VW_UI.toast('Consumo anotado.', 'ok');
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  }

  async function refreshProductos() {
    productos = await fetch('/api/productos').then((r) => r.json());
    renderProductos();
  }

  async function loadHistorial() {
    const res = await fetch(`/api/personas/${selectedPersona.id}/consumos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: selectedPersona.id, pin: currentPin }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.VW_UI.toast(data.error || 'No se pudo cargar', 'error');
      return;
    }
    el.historialBody.innerHTML = data
      .map((c) => {
        const fecha = new Date(c.created_at).toLocaleDateString('es-CO');
        const total = formatMoney(Number(c.precio_unitario) * Number(c.cantidad));
        const nombre = c.tf_productos ? c.tf_productos.nombre : '';
        const estado = c.anulado
          ? `<span class="pill pill-warn" title="${escapeHtml(c.motivo_anulacion || '')}">Anulado</span>`
          : `<span class="pill pill-ok">Vigente</span>`;
        const anularBtn = c.anulado ? '' : `<button type="button" class="btn btn-sm" data-anular="${c.id}">Anular</button>`;
        return `<tr><td>${fecha}</td><td>${escapeHtml(nombre)}</td><td>${c.cantidad}</td><td>${total}</td><td>${estado}</td><td>${anularBtn}</td></tr>`;
      })
      .join('');

    el.historialBody.querySelectorAll('[data-anular]').forEach((btn) => {
      btn.addEventListener('click', () => anularConsumo(Number(btn.dataset.anular)));
    });
  }

  async function anularConsumo(consumoId) {
    const motivo = window.prompt('¿Por qué anulás este consumo? (obligatorio)');
    if (!motivo || !motivo.trim()) {
      window.VW_UI.toast('Necesitás indicar el motivo.', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/consumos/${consumoId}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentPin, motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo anular');
      window.VW_UI.toast('Consumo anulado.', 'ok');
      await loadHistorial();
      await refreshProductos();
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  }

  el.pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = el.pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      window.VW_UI.toast('El PIN debe tener 4 dígitos.', 'error');
      return;
    }
    // Se valida recién al primer POST (no hay endpoint de "solo validar PIN"
    // para no crear una vía extra de fuerza bruta) — probamos contra el
    // historial, que ya requiere PIN correcto.
    currentPin = pin;
    try {
      const res = await fetch(`/api/personas/${selectedPersona.id}/consumos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: selectedPersona.id, pin: currentPin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.VW_UI.toast(data.error || 'PIN incorrecto', 'error');
        return;
      }
      el.menuPersonaName.textContent = selectedPersona.nombre;
      Object.keys(qtyByProducto).forEach((k) => delete qtyByProducto[k]);
      await refreshProductos();
      showStep('menu');
      document.querySelector('.tab-btn[data-tab="tabAgregar"]').click();
    } catch (err) {
      window.VW_UI.toast('No se pudo conectar. Intenta de nuevo.', 'error');
    }
  });

  el.btnBackPersona.addEventListener('click', () => {
    selectedPersona = null;
    currentPin = null;
    showStep('persona');
  });

  el.btnSalir.addEventListener('click', () => {
    selectedPersona = null;
    currentPin = null;
    showStep('persona');
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tabHistorial') loadHistorial();
    });
  });

  async function init() {
    const [businessRes, personasRes] = await Promise.all([
      fetch('/api/negocio').then((r) => r.json()),
      fetch('/api/personas').then((r) => r.json()),
    ]);
    business = businessRes;
    personas = personasRes;
    el.businessName.textContent = business.name || 'Autoservicio';
    document.title = business.name || 'Autoservicio';
    renderPersonas();
  }

  init().catch((err) => {
    console.error(err);
    el.personaGrid.innerHTML = '<p class="muted">No se pudo cargar. Intenta de nuevo.</p>';
  });
})();
