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
    btnCerrarQuincena: document.getElementById('btnCerrarQuincena'),
    cierrePendiente: document.getElementById('cierrePendiente'),
    cierresLista: document.getElementById('cierresLista'),
    desprPersona: document.getElementById('desprPersona'),
    desprLista: document.getElementById('desprLista'),
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
    btnExportarCsv: document.getElementById('btnExportarCsv'),
    negocioForm: document.getElementById('negocioForm'),
    negocioNombre: document.getElementById('negocioNombre'),
    negocioMoneda: document.getElementById('negocioMoneda'),
  };

  let isSetupMode = false;
  let productosCache = [];
  let reporteCache = [];

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
    loadCierres();
    loadPersonas();
    loadProductos();
    loadNegocio();
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
    reporteCache = data;
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

  // Atajos: rellenan Desde/Hasta (hora Colombia) y generan el reporte.
  document.querySelectorAll('[data-rango]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hoy = new Date(Date.now() - 5 * 3600 * 1000);
      const y = hoy.getUTCFullYear();
      const mo = hoy.getUTCMonth();
      const pad = (n) => String(n).padStart(2, '0');
      const ult = (yy, mm) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
      let d;
      let h;
      const tipo = btn.dataset.rango;
      if (tipo === 'mes') {
        d = `${y}-${pad(mo + 1)}-01`;
        h = `${y}-${pad(mo + 1)}-${pad(ult(y, mo))}`;
      } else {
        const primera = hoy.getUTCDate() <= 15;
        let yy = y;
        let mm = mo;
        let ini = primera;
        if (tipo === 'anterior') {
          if (primera) {
            mm = mo - 1;
            if (mm < 0) {
              mm = 11;
              yy = y - 1;
            }
          }
          ini = !primera;
        }
        d = `${yy}-${pad(mm + 1)}-${ini ? '01' : '16'}`;
        h = `${yy}-${pad(mm + 1)}-${ini ? '15' : pad(ult(yy, mm))}`;
      }
      el.reporteDesde.value = d;
      el.reporteHasta.value = h;
      loadReporte().catch((err) => window.VW_UI.toast(err.message, 'error'));
    });
  });

  function downloadCsv(filename, rows) {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  el.btnExportarCsv.addEventListener('click', () => {
    if (reporteCache.length === 0) {
      window.VW_UI.toast('No hay datos para exportar — generá el reporte primero.', 'error');
      return;
    }
    const rows = [
      ['Persona', 'Items', 'Total a cobrar', 'Anulados'],
      ...reporteCache.map((r) => [r.persona_nombre, r.items, r.total, r.anulados]),
    ];
    downloadCsv(`reporte_quincena_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  });

  // ── Cierres de quincena ─────────────────────────────────────────────

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function labelQuincena(inicio, fin) {
    const [y, m, d1] = inicio.split('-').map(Number);
    return `${d1} al ${Number(fin.slice(8))} ${MESES[m - 1]} ${y}`;
  }

  // Última quincena ya terminada (hora Colombia), en YYYY-MM-DD.
  function ultimaQuincenaTerminada() {
    const hoy = new Date(Date.now() - 5 * 3600 * 1000);
    const y = hoy.getUTCFullYear();
    const m = hoy.getUTCMonth();
    const pad = (n) => String(n).padStart(2, '0');
    if (hoy.getUTCDate() <= 15) {
      const prev = new Date(Date.UTC(y, m, 0));
      return { inicio: `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-16`, fin: `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}` };
    }
    return { inicio: `${y}-${pad(m + 1)}-01`, fin: `${y}-${pad(m + 1)}-15` };
  }

  let cierresCache = [];

  // Deuda pendiente por persona (suma de quincenas cerradas sin pagar).
  function deudaPorPersona() {
    const m = new Map();
    for (const c of cierresCache) {
      for (const r of c.detalle) {
        if (!r.pagado && Number(r.total) > 0) m.set(r.persona_id, (m.get(r.persona_id) || 0) + Number(r.total));
      }
    }
    return m;
  }

  // Selector: primero quienes deben (con su monto), luego los que están al día.
  function refreshDesprSelect() {
    const deuda = deudaPorPersona();
    const prev = el.desprPersona.value;
    const opt = (p) => `<option value="${p.id}">${escapeHtml(p.nombre)}${deuda.has(p.id) ? ` · debe ${formatMoney(deuda.get(p.id))}` : ''}</option>`;
    const debe = personasCache.filter((p) => deuda.has(p.id)).sort((a, b) => deuda.get(b.id) - deuda.get(a.id));
    const aldia = personasCache.filter((p) => !deuda.has(p.id));
    el.desprPersona.innerHTML =
      (debe.length ? `<optgroup label="Con pago pendiente (${debe.length})">${debe.map(opt).join('')}</optgroup>` : '') +
      (aldia.length ? `<optgroup label="Al día">${aldia.map(opt).join('')}</optgroup>` : '');
    const existe = personasCache.some((p) => String(p.id) === prev);
    el.desprPersona.value = existe ? prev : debe.length ? String(debe[0].id) : aldia.length ? String(aldia[0].id) : '';
    loadDesprendibles();
    renderPersonas();
  }

  async function loadCierres() {
    cierresCache = await apiFetch('/api/admin/cierres');
    const q = ultimaQuincenaTerminada();
    const yaCerrada = cierresCache.some((c) => c.periodo_inicio === q.inicio && c.periodo_fin === q.fin);
    el.btnCerrarQuincena.hidden = yaCerrada;
    el.cierrePendiente.textContent = yaCerrada
      ? 'La última quincena terminada ya está cerrada.'
      : `Pendiente por cerrar: ${labelQuincena(q.inicio, q.fin)}.`;
    if (!yaCerrada) {
      el.btnCerrarQuincena.textContent = `Cerrar quincena ${labelQuincena(q.inicio, q.fin)}`;
      el.btnCerrarQuincena.dataset.inicio = q.inicio;
      el.btnCerrarQuincena.dataset.fin = q.fin;
    }
    // Cada cierre es un desplegable: al abrirlo salen los nombres; elegir uno muestra su cuenta abajo.
    el.cierresLista.innerHTML =
      cierresCache
        .map((c) => {
          const filas = c.detalle.filter((r) => Number(r.total) > 0).sort((a, b) => Number(a.pagado) - Number(b.pagado) || b.total - a.total);
          const porCobrar = filas.filter((r) => !r.pagado).reduce((s, r) => s + Number(r.total), 0);
          const nombres = filas
            .map(
              (r) =>
                `<button type="button" class="nombre-fila${r.pagado ? ' pagada' : ''}" data-ir="${r.persona_id}"><span>${escapeHtml(r.persona_nombre)}</span><span>${r.pagado ? 'Pagado' : formatMoney(r.total)}</span></button>`
            )
            .join('');
          return `<details class="cierre-resumen">
            <summary><span><strong>${labelQuincena(c.periodo_inicio, c.periodo_fin)}</strong><br /><span class="muted">${porCobrar ? `Por cobrar ${formatMoney(porCobrar)}` : 'Todo pagado'}</span></span><span class="muted">Total ${formatMoney(c.total)}</span></summary>
            <div class="nombres">${nombres || '<p class="muted">Sin consumos.</p>'}</div>
            <button type="button" class="btn btn-sm" data-csv="${c.id}">Exportar CSV</button></details>`;
        })
        .join('') || '<p class="muted">Aún no hay quincenas cerradas.</p>';

    el.cierresLista.querySelectorAll('[data-ir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.desprPersona.value = btn.dataset.ir;
        el.cierresLista.querySelectorAll('.nombre-fila').forEach((b) => b.classList.toggle('sel', b.dataset.ir === btn.dataset.ir));
        loadDesprendibles();
        renderPersonas();
        document.getElementById('personaBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    el.cierresLista.querySelectorAll('[data-csv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = cierresCache.find((x) => x.id === Number(btn.dataset.csv));
        downloadCsv(`cierre_${c.periodo_inicio}_${c.periodo_fin}.csv`, [
          ['Persona', 'Items', 'Total', 'Pagado'],
          ...c.detalle.map((r) => [r.persona_nombre, r.items, r.total, r.pagado ? 'Sí' : 'No']),
        ]);
      });
    });
    if (personasCache.length) refreshDesprSelect();
  }

  async function cambiarPago(cierreId, personaId, pagado) {
    if (!pagado && !window.confirm('¿Marcar como pendiente? Se descarta el comprobante y la persona volverá a ver el aviso de pago.')) return;
    try {
      await apiFetch(`/api/admin/cierres/${cierreId}/pago`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, pagado }),
      });
      await loadCierres();
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  }

  // Desprendible de la persona elegida: consumo quincena a quincena + pago.
  const ESTADO_DESPR = { en_curso: 'En curso', sin_cerrar: 'Sin cerrar', cerrada: 'Cerrada' };

  async function loadDesprendibles() {
    const id = el.desprPersona.value;
    if (!id) {
      el.desprLista.innerHTML = '<p class="muted">Aún no hay personas.</p>';
      return;
    }
    try {
      const data = await apiFetch(`/api/admin/personas/${id}/desprendibles`);
      const nombre = el.desprPersona.selectedOptions[0].textContent.split(' · ')[0];
      el.desprLista.innerHTML =
        data
          .map((q, i) => {
            const lineas = q.lineas
              .map(
                (l) =>
                  `<div class="linea${l.anulado ? ' anulada' : ''}"><span class="linea-fecha">${new Date(l.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span><span class="linea-prod">${escapeHtml(l.producto)} ×${l.cantidad}</span><span class="linea-monto">${formatMoney(l.subtotal)}</span></div>`
              )
              .join('');
            const cerrada = q.cierre_id && Number(q.total_cierre ?? q.total) > 0;
            const pago = cerrada
              ? `<div class="pago-fila">${q.pagado ? '<span class="muted">Pagado</span>' : '<strong class="debe">Pendiente de pago</strong>'}${q.comprobante_url ? `<a href="${escapeHtml(q.comprobante_url)}" target="_blank" rel="noopener">Ver comprobante</a>` : ''}<button type="button" class="btn btn-sm ${q.pagado ? '' : 'btn-accent'}" data-pago="${q.cierre_id}:${id}:${q.pagado ? 0 : 1}">${q.pagado ? 'Marcar pendiente' : 'Marcar pagado'}</button></div>`
              : '';
            const abierta = i === 0 || (cerrada && !q.pagado);
            return `<details class="desp-q"${abierta ? ' open' : ''}><summary><span><strong>${labelQuincena(q.inicio, q.fin)}</strong> <span class="muted">${ESTADO_DESPR[q.estado]}</span></span><strong>${formatMoney(q.total)}</strong></summary>
              ${pago}<div class="lineas">${lineas}</div>
              <button type="button" class="btn btn-sm" data-despr-csv="${i}">Exportar CSV</button></details>`;
          })
          .join('') || '<p class="muted">Sin consumos registrados.</p>';
      el.desprLista.querySelectorAll('[data-pago]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const [cid, pid, val] = btn.dataset.pago.split(':').map(Number);
          cambiarPago(cid, pid, val === 1);
        });
      });
      el.desprLista.querySelectorAll('[data-despr-csv]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = data[Number(btn.dataset.desprCsv)];
          downloadCsv(`desprendible_${nombre}_${q.inicio}.csv`.replace(/\s+/g, '_'), [
            ['Fecha', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Anulado'],
            ...q.lineas.map((l) => [new Date(l.fecha).toLocaleDateString('es-CO'), l.producto, l.cantidad, l.precio_unitario, l.subtotal, l.anulado ? 'Sí' : 'No']),
            ['', '', '', 'Total', q.total, ''],
          ]);
        });
      });
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  }

  el.desprPersona.addEventListener('change', () => {
    loadDesprendibles();
    renderPersonas();
  });

  el.btnCerrarQuincena.addEventListener('click', async () => {
    const { inicio, fin } = el.btnCerrarQuincena.dataset;
    if (!window.confirm(`¿Cerrar la quincena ${labelQuincena(inicio, fin)}? Queda congelada y no se puede repetir.`)) return;
    el.btnCerrarQuincena.disabled = true;
    try {
      await apiFetch('/api/admin/cierres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inicio, fin }),
      });
      window.VW_UI.toast('Quincena cerrada', 'success');
      await loadCierres();
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    } finally {
      el.btnCerrarQuincena.disabled = false;
    }
  });

  // Dos motivos fijos, igual que en el autoservicio — acá el dueño puede
  // anular sin PIN y sin el límite de 15 minutos, para corregir un error
  // que se nota después.
  function elegirMotivoAnulacionAdmin() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'vw-modal-overlay';
      overlay.innerHTML = `
        <div class="vw-modal-box">
          <p>¿Por qué se anula este consumo?</p>
          <div class="vw-modal-actions" style="justify-content:stretch;flex-direction:column">
            <button type="button" class="btn btn-danger btn-block" data-tipo="no_hay">No había stock</button>
            <button type="button" class="btn btn-accent btn-block" data-tipo="no_quiere" style="margin-top:8px">No lo quiso</button>
            <button type="button" class="btn btn-block" id="btnCancelarMotivoAdmin" style="margin-top:8px">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      function close(result) {
        overlay.remove();
        resolve(result);
      }
      overlay.querySelectorAll('[data-tipo]').forEach((btn) => {
        btn.addEventListener('click', () => close(btn.dataset.tipo));
      });
      overlay.querySelector('#btnCancelarMotivoAdmin').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });
    });
  }

  async function anularConsumoAdmin(consumoId, personaId, nombre) {
    const tipo = await elegirMotivoAnulacionAdmin();
    if (!tipo) return;
    try {
      await apiFetch(`/api/admin/consumos/${consumoId}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      });
      window.VW_UI.toast('Consumo anulado.', 'ok');
      await mostrarDetallePersona(personaId, nombre);
      await loadReporte();
      await loadProductos();
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    }
  }

  async function mostrarDetallePersona(personaId, nombre) {
    const consumos = await apiFetch(`/api/admin/personas/${personaId}/consumos`);
    let totalVigente = 0;
    let itemsVigentes = 0;
    const rows = consumos
      .map((c) => {
        const fecha = new Date(c.created_at).toLocaleDateString('es-CO');
        const lineTotal = Number(c.precio_unitario) * Number(c.cantidad);
        const total = formatMoney(lineTotal);
        const producto = c.tf_productos ? c.tf_productos.nombre : '';
        const estado = c.anulado ? '<span class="pill pill-warn">Anulado</span>' : '<span class="pill pill-ok">Vigente</span>';
        const motivo = c.anulado ? escapeHtml(c.motivo_anulacion || '—') : '';
        const anularBtn = c.anulado ? '' : `<button type="button" class="btn btn-sm" data-anular-admin="${c.id}">Anular</button>`;
        if (!c.anulado) {
          totalVigente += lineTotal;
          itemsVigentes += Number(c.cantidad);
        }
        return `<tr><td>${fecha}</td><td>${escapeHtml(producto)}</td><td>${c.cantidad}</td><td>${total}</td><td>${estado}</td><td>${motivo}</td><td>${anularBtn}</td></tr>`;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'vw-modal-overlay';
    overlay.innerHTML = `
      <div class="vw-modal-box" style="max-width:700px">
        <h2 style="margin:0 0 4px">Detalle de ${escapeHtml(nombre)}</h2>
        <p class="muted" style="margin:0 0 12px">Total vigente: <strong>${formatMoney(totalVigente)}</strong> (${itemsVigentes} ítems)</p>
        <div class="table-wrap" style="max-height:60vh;overflow-y:auto">
          <table>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th><th>Estado</th><th>Motivo</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="muted">Sin consumos.</td></tr>'}</tbody>
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
    overlay.querySelectorAll('[data-anular-admin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.remove();
        anularConsumoAdmin(Number(btn.dataset.anularAdmin), personaId, nombre);
      });
    });
    overlay.querySelector('#btnCerrarDetalle').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  // ── Personas ─────────────────────────────────────────────────────────

  let personasCache = [];

  async function loadPersonas() {
    personasCache = await apiFetch('/api/admin/personas');
    refreshDesprSelect();
  }

  // Acciones de la persona elegida (solo una a la vez, para no saturar la pantalla).
  function renderPersonas() {
    const p = personasCache.find((x) => String(x.id) === el.desprPersona.value);
    const box = document.getElementById('personaAcciones');
    if (!p) {
      box.innerHTML = '';
      return;
    }
    const deuda = deudaPorPersona();
    box.innerHTML = `<div class="persona-estado"><span>${p.activo ? 'Activa' : 'Inactiva'}</span> · ${
      deuda.has(p.id) ? `<strong class="debe">Debe ${formatMoney(deuda.get(p.id))}</strong>` : '<span class="muted">Al día</span>'
    }</div>
      <div class="persona-botones">
        <button type="button" class="btn btn-sm" id="pConsumo">Ver consumo</button>
        <button type="button" class="btn btn-sm" id="pEditar">Editar</button>
        <button type="button" class="btn btn-sm btn-quiet-danger" id="pVaciar">Vaciar lista</button>
      </div>`;
    document.getElementById('pConsumo').addEventListener('click', () => mostrarDetallePersona(p.id, p.nombre));
    document.getElementById('pEditar').addEventListener('click', () => abrirEditarPersona(p));
    document.getElementById('pVaciar').addEventListener('click', async () => {
      const ok = await window.VW_UI.confirmDialog(
        `¿Vaciar la lista de ${p.nombre}? Se eliminan para siempre todos sus consumos. No se puede deshacer.`,
        { confirmLabel: 'Vaciar lista' }
      );
      if (!ok) return;
      try {
        const r = await apiFetch(`/api/admin/personas/${p.id}/vaciar`, { method: 'POST' });
        window.VW_UI.toast(`Lista de ${p.nombre} vaciada (${r.eliminados} consumos).`, 'ok');
        loadDesprendibles();
      } catch (err) {
        window.VW_UI.toast(err.message, 'error');
      }
    });
  }

  function abrirEditarPersona(persona) {
    const overlay = document.createElement('div');
    overlay.className = 'vw-modal-overlay';
    overlay.innerHTML = `
      <div class="vw-modal-box">
        <h2 style="margin:0 0 12px">Editar persona</h2>
        <div class="field">
          <label>Nombre</label>
          <input id="editPersonaNombre" value="${escapeHtml(persona.nombre)}" />
        </div>
        <div class="field">
          <label>Nuevo PIN (3 dígitos, dejar vacío para no cambiarlo)</label>
          <input id="editPersonaPin" maxlength="4" pattern="[0-9]{3,4}" />
        </div>
        <div class="field">
          <label><input type="checkbox" id="editPersonaActivo" ${persona.activo ? 'checked' : ''} style="width:auto;margin-right:6px" />Activa (puede entrar al autoservicio)</label>
        </div>
        <div class="vw-modal-actions">
          <button type="button" class="btn" id="btnCancelarEditPersona">Cancelar</button>
          <button type="button" class="btn btn-accent" id="btnGuardarPersona">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function close() {
      overlay.remove();
    }
    overlay.querySelector('#btnCancelarEditPersona').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#btnGuardarPersona').addEventListener('click', async () => {
      const nombre = overlay.querySelector('#editPersonaNombre').value.trim();
      const pin = overlay.querySelector('#editPersonaPin').value.trim();
      const activo = overlay.querySelector('#editPersonaActivo').checked;
      try {
        await apiFetch(`/api/admin/personas/${persona.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, pin: pin || undefined, activo }),
        });
        close();
        await loadPersonas();
        window.VW_UI.toast('Persona actualizada.', 'ok');
      } catch (err) {
        window.VW_UI.toast(err.message, 'error');
      }
    });
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
        return `
          <tr>
            <td>${foto}</td>
            <td>${escapeHtml(p.nombre)}</td>
            <td>${formatMoney(p.precio)}</td>
            <td>${p.stock}</td>
            <td>${p.activo ? '<span class="pill pill-ok">Activo</span>' : '<span class="pill pill-warn">Inactivo</span>'}</td>
            <td>
              <button type="button" class="btn btn-sm" data-editar-producto="${p.id}">Editar</button>
              <button type="button" class="btn btn-sm" data-toggle="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button>
              <button type="button" class="btn btn-sm btn-danger" data-eliminar-producto="${p.id}">Eliminar</button>
            </td>
          </tr>`;
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
    el.productosBody.querySelectorAll('[data-editar-producto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = productosCache.find((x) => x.id === Number(btn.dataset.editarProducto));
        if (p) abrirEditarProducto(p);
      });
    });
    el.productosBody.querySelectorAll('[data-eliminar-producto]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = productosCache.find((x) => x.id === Number(btn.dataset.eliminarProducto));
        if (!p) return;
        const ok = await window.VW_UI.confirmDialog(`¿Eliminar "${p.nombre}" para siempre? No se puede deshacer.`, {
          confirmLabel: 'Eliminar',
        });
        if (!ok) return;
        try {
          await apiFetch(`/api/admin/productos/${p.id}`, { method: 'DELETE' });
          await loadProductos();
          window.VW_UI.toast('Producto eliminado.', 'ok');
        } catch (err) {
          window.VW_UI.toast(err.message, 'error');
        }
      });
    });
  }

  function abrirEditarProducto(producto) {
    const overlay = document.createElement('div');
    overlay.className = 'vw-modal-overlay';
    overlay.innerHTML = `
      <div class="vw-modal-box">
        <h2 style="margin:0 0 12px">Editar producto</h2>
        <div class="field">
          <label>Nombre</label>
          <input id="editProductoNombre" value="${escapeHtml(producto.nombre)}" />
        </div>
        <div class="field">
          <label>Precio</label>
          <input id="editProductoPrecio" type="number" min="0" value="${producto.precio}" />
        </div>
        <div class="field">
          <label>Stock</label>
          <input id="editProductoStock" type="number" min="0" value="${producto.stock}" />
        </div>
        <div class="field">
          <label>Foto</label>
          <div class="upload-row">
            <img id="editProductoFotoPreview" class="producto-foto" src="${escapeHtml(producto.foto_url || '')}" ${producto.foto_url ? '' : 'hidden'} />
            <input id="editProductoFoto" type="hidden" value="${escapeHtml(producto.foto_url || '')}" />
            <input id="editProductoFotoFile" type="file" accept="image/*" />
          </div>
        </div>
        <div class="vw-modal-actions">
          <button type="button" class="btn" id="btnCancelarEditProducto">Cancelar</button>
          <button type="button" class="btn btn-accent" id="btnGuardarProducto">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function close() {
      overlay.remove();
    }
    overlay.querySelector('#btnCancelarEditProducto').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#editProductoFotoFile').addEventListener('change', async () => {
      const file = overlay.querySelector('#editProductoFotoFile').files[0];
      if (!file) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
        overlay.querySelector('#editProductoFoto').value = data.url;
        const preview = overlay.querySelector('#editProductoFotoPreview');
        preview.src = data.url;
        preview.hidden = false;
      } catch (err) {
        window.VW_UI.toast(err.message, 'error');
      }
    });
    overlay.querySelector('#btnGuardarProducto').addEventListener('click', async () => {
      try {
        await apiFetch(`/api/admin/productos/${producto.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: overlay.querySelector('#editProductoNombre').value.trim(),
            precio: Number(overlay.querySelector('#editProductoPrecio').value),
            stock: Number(overlay.querySelector('#editProductoStock').value),
            foto_url: overlay.querySelector('#editProductoFoto').value.trim() || null,
          }),
        });
        close();
        await loadProductos();
        window.VW_UI.toast('Producto actualizado.', 'ok');
      } catch (err) {
        window.VW_UI.toast(err.message, 'error');
      }
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
      window.VW_UI.toast('Elige una foto primero.', 'error');
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
      el.btnAplicarFactura.disabled = false;
      if (facturaItems.length === 0) {
        window.VW_UI.toast('No se detectaron líneas — revisa la foto o carga los productos manualmente.', 'error');
      }
    } catch (err) {
      window.VW_UI.toast(err.message, 'error');
    } finally {
      el.ocrStatus.hidden = true;
      el.btnOcr.disabled = false;
    }
  });

  el.btnAplicarFactura.addEventListener('click', async () => {
    if (el.btnAplicarFactura.disabled) return;
    el.btnAplicarFactura.disabled = true;
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
      el.btnAplicarFactura.disabled = false;
    }
  });

  // ── Negocio ──────────────────────────────────────────────────────────

  async function loadNegocio() {
    const data = await apiFetch('/api/admin/negocio');
    el.negocioNombre.value = data.name || '';
    el.negocioMoneda.value = data.currency || 'COP';
  }

  el.negocioForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/negocio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: el.negocioNombre.value.trim(), currency: el.negocioMoneda.value.trim() }),
      });
      window.VW_UI.toast('Datos del negocio actualizados.', 'ok');
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
