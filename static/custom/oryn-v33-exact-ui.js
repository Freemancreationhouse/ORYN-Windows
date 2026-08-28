(() => {
  'use strict';

  // This is the same proven injection path that already renders the visible
  // Perimeter Calibration card on the Motion page. Full-circle calibration is
  // deliberately mounted inside the SAME card so it cannot disappear while
  // Perimeter Calibration remains visible.
  const CARD_ID = 'oryn-perimeter-calibration-card';
  let timer = null;
  let working = false;

  function apiBase() {
    try {
      const saved = localStorage.getItem('orynmotion_tables');
      const activeId = localStorage.getItem('orynmotion_active_table');
      if (!saved || !activeId) return '';
      const data = JSON.parse(saved);
      const table = (data.tables || []).find(t => t.id === activeId);
      if (table && !table.isCurrent && table.url) return table.url.replace(/\/$/, '');
    } catch (_) {}
    return '';
  }

  async function request(path, method='GET', body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(apiBase() + path, options);
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch (_) { data = { detail: raw }; }
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  function setMessage(id, text, isError=false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('oryn-pc-error', !!isError);
  }

  function setWorking(value) {
    working = value;
    document.querySelectorAll(`#${CARD_ID} button`).forEach(btn => {
      btn.disabled = value;
    });
  }

  async function refreshRotation() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    try {
      const c = await request('/api/rotation-calibration');
      const calibrated = !!c.calibrated;
      const active = !!c.active;
      const savedUnits = c.theta_revolution_units == null ? null : Number(c.theta_revolution_units);
      const effectiveUnits = Number(c.effective_units);
      const currentUnits = Number(c.current_units || 0);

      const badge = document.getElementById('oryn-rc-badge');
      if (badge) {
        badge.textContent = calibrated ? 'CALIBRATED' : 'NOT CALIBRATED';
        badge.classList.toggle('calibrated', calibrated);
      }

      const idle = document.getElementById('oryn-rc-idle');
      const activeBox = document.getElementById('oryn-rc-active');
      if (idle) idle.style.display = active ? 'none' : '';
      if (activeBox) activeBox.style.display = active ? '' : 'none';

      const saved = document.getElementById('oryn-rc-saved');
      if (saved) {
        saved.textContent = calibrated && Number.isFinite(savedUnits)
          ? `${savedUnits.toFixed(3)} units / 360°`
          : `Not saved (legacy source ${Number.isFinite(effectiveUnits) ? effectiveUnits.toFixed(3) : '—'})`;
      }

      const input = document.getElementById('oryn-rc-units');
      if (input && document.activeElement !== input && !active) {
        input.value = calibrated && Number.isFinite(savedUnits) ? savedUnits.toFixed(3) : '';
      }

      const current = document.getElementById('oryn-rc-current');
      if (current) current.textContent = `${currentUnits.toFixed(3)} units`;

      const saveBtn = document.getElementById('oryn-rc-save');
      if (saveBtn) saveBtn.disabled = working || !active || currentUnits < 0.1;

      const resetBtn = document.getElementById('oryn-rc-reset');
      if (resetBtn) resetBtn.style.display = calibrated && !active ? '' : 'none';

      if (!working) {
        card.querySelectorAll('#oryn-rc-idle button,#oryn-rc-active button').forEach(btn => btn.disabled = false);
        if (saveBtn) saveBtn.disabled = !active || currentUnits < 0.1;
      }
    } catch (e) {
      setMessage('oryn-rc-message', `Full-circle status unavailable: ${e.message || e}`, true);
    }
  }

  async function refreshPerimeter() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    try {
      const c = await request('/api/perimeter-calibration');
      const calibrated = !!c.calibrated;
      const active = !!c.active;
      const savedUnits = c.rho_travel_units == null ? null : Number(c.rho_travel_units);
      const effectiveUnits = Number(c.effective_units);
      const currentUnits = Number(c.current_units || 0);

      const badge = document.getElementById('oryn-pc-badge');
      if (badge) {
        badge.textContent = calibrated ? 'CALIBRATED' : 'SOURCE DEFAULT';
        badge.classList.toggle('calibrated', calibrated);
      }

      const idle = document.getElementById('oryn-pc-idle');
      const activeBox = document.getElementById('oryn-pc-active');
      if (idle) idle.style.display = active ? 'none' : '';
      if (activeBox) activeBox.style.display = active ? '' : 'none';

      const saved = document.getElementById('oryn-pc-saved');
      if (saved) {
        saved.textContent = calibrated && Number.isFinite(savedUnits)
          ? `${savedUnits.toFixed(3)} units`
          : `Source ${Number.isFinite(effectiveUnits) ? effectiveUnits.toFixed(3) : '—'} units`;
      }

      const input = document.getElementById('oryn-pc-units');
      if (input && document.activeElement !== input && !active) {
        input.value = calibrated && Number.isFinite(savedUnits) ? savedUnits.toFixed(3) : '';
      }

      const current = document.getElementById('oryn-pc-current');
      if (current) current.textContent = `${currentUnits.toFixed(3)} units`;

      const saveBtn = document.getElementById('oryn-pc-save');
      if (saveBtn) saveBtn.disabled = working || !active || currentUnits < 0.001;

      const resetBtn = document.getElementById('oryn-pc-reset');
      if (resetBtn) resetBtn.style.display = calibrated && !active ? '' : 'none';

      if (!working) {
        card.querySelectorAll('#oryn-pc-idle button,#oryn-pc-active button').forEach(btn => btn.disabled = false);
        if (saveBtn) saveBtn.disabled = !active || currentUnits < 0.001;
      }
    } catch (e) {
      setMessage('oryn-pc-message', `Perimeter status unavailable: ${e.message || e}`, true);
    }
  }

  async function refreshAll() {
    await Promise.all([refreshRotation(), refreshPerimeter()]);
  }

  async function execute(path, body, success, messageId) {
    if (working) return null;
    setWorking(true);
    setMessage(messageId, '');
    try {
      const result = await request(path, 'POST', body);
      setMessage(messageId, success instanceof Function ? success(result) : success);
      return result;
    } catch (e) {
      setMessage(messageId, e.message || String(e), true);
      return null;
    } finally {
      working = false;
      await refreshAll();
    }
  }

  async function startRotation() {
    await execute(
      '/api/rotation-calibration/start', undefined,
      'Full-circle calibration started. Jog theta until the mechanism makes exactly ONE physical revolution.',
      'oryn-rc-message'
    );
  }

  async function jogRotation(units) {
    await execute(
      '/api/rotation-calibration/jog', { units, speed: 80 },
      `Theta jog ${units > 0 ? 'FWD' : 'BACK'} ${Math.abs(units)} units complete.`,
      'oryn-rc-message'
    );
  }

  async function saveRotation() {
    const r = await execute(
      '/api/rotation-calibration/save', undefined,
      data => `Full circle saved: ${Number(data.theta_revolution_units).toFixed(3)} controller units = exactly 360° physical rotation.`,
      'oryn-rc-message'
    );
    if (r && Number.isFinite(Number(r.theta_revolution_units))) {
      const input = document.getElementById('oryn-rc-units');
      if (input) input.value = Number(r.theta_revolution_units).toFixed(3);
    }
  }

  async function updateRotation() {
    const input = document.getElementById('oryn-rc-units');
    const units = Number(input?.value);
    if (!Number.isFinite(units) || units === 0) {
      setMessage('oryn-rc-message', 'Enter valid non-zero controller units for one complete revolution.', true);
      return;
    }
    await execute(
      '/api/rotation-calibration/set', { units },
      `Full-circle calibration updated: ${units.toFixed(3)} units / 360°.`,
      'oryn-rc-message'
    );
  }

  async function resetRotation() {
    await execute(
      '/api/rotation-calibration/reset', undefined,
      'Full-circle calibration cleared. Patterns will not use universal geometry until it is saved again.',
      'oryn-rc-message'
    );
  }

  async function startPerimeter() {
    await execute(
      '/api/perimeter-calibration/start', undefined,
      'Perimeter calibration started. Use OUT buttons until the ball reaches the exact physical perimeter.',
      'oryn-pc-message'
    );
  }

  async function jogPerimeter(units) {
    await execute(
      '/api/perimeter-calibration/jog', { units, speed: 60 },
      `Jog ${units > 0 ? 'OUT' : 'IN'} ${Math.abs(units)} units complete.`,
      'oryn-pc-message'
    );
  }

  async function savePerimeter() {
    const r = await execute(
      '/api/perimeter-calibration/save', undefined,
      data => `Perimeter saved: ${Number(data.rho_travel_units).toFixed(3)} controller units.`,
      'oryn-pc-message'
    );
    if (r && Number.isFinite(Number(r.rho_travel_units))) {
      const input = document.getElementById('oryn-pc-units');
      if (input) input.value = Number(r.rho_travel_units).toFixed(3);
    }
  }

  async function updatePerimeter() {
    const input = document.getElementById('oryn-pc-units');
    const units = Number(input?.value);
    if (!Number.isFinite(units) || units <= 0) {
      setMessage('oryn-pc-message', 'Enter a valid controller-unit travel.', true);
      return;
    }
    await execute(
      '/api/perimeter-calibration/set', { units },
      `Perimeter travel updated to ${units.toFixed(3)} units.`,
      'oryn-pc-message'
    );
  }

  async function resetPerimeter() {
    await execute(
      '/api/perimeter-calibration/reset', undefined,
      'Original source radial scale restored.',
      'oryn-pc-message'
    );
  }

  function cardMarkup() {
    return `
      <div class="oryn-pc-head">
        <div>
          <h3 class="oryn-pc-title">Universal Machine Calibration</h3>
          <div class="oryn-pc-sub">Teach ORYN one exact 360° rotation and one exact Center → Perimeter travel</div>
        </div>
        <span class="oryn-pc-badge calibrated">UNIVERSAL</span>
      </div>

      <div class="oryn-pc-note">
        These two physical values are the geometry source for any table size, gearing,
        driver or microstepping setup. Calibrate with the hardware/jumper configuration
        you will actually use.
      </div>

      <div style="border:1px solid #383838;border-radius:12px;padding:13px;margin-bottom:14px">
        <div class="oryn-pc-head" style="margin-bottom:10px">
          <div>
            <h3 class="oryn-pc-title">Full Circle Calibration — 360°</h3>
            <div class="oryn-pc-sub">Teach exact controller travel for ONE physical revolution</div>
          </div>
          <span id="oryn-rc-badge" class="oryn-pc-badge">NOT CALIBRATED</span>
        </div>

        <div id="oryn-rc-idle">
          <button id="oryn-rc-start" class="oryn-pc-btn primary">Start Full-Circle Calibration</button>
          <div class="oryn-pc-row">
            <input id="oryn-rc-units" class="oryn-pc-input" type="number" step="0.001"
                   placeholder="Controller units / 360°">
            <button id="oryn-rc-update" class="oryn-pc-btn">Update</button>
          </div>
          <div class="oryn-pc-meta">
            <span>Saved revolution</span>
            <strong id="oryn-rc-saved">Loading…</strong>
          </div>
          <button id="oryn-rc-reset" class="oryn-pc-btn oryn-pc-reset" style="display:none">
            Reset Full-Circle Calibration
          </button>
        </div>

        <div id="oryn-rc-active" style="display:none">
          <div class="oryn-pc-current">
            <span>Jogged theta travel</span>
            <strong id="oryn-rc-current">0.000 units</strong>
          </div>
          <div class="oryn-pc-jogs">
            <button class="oryn-pc-btn" data-rj="-1">BACK 1</button>
            <button class="oryn-pc-btn" data-rj="-0.1">BACK 0.1</button>
            <button class="oryn-pc-btn" data-rj="-0.01">BACK 0.01</button>
            <button class="oryn-pc-btn" data-rj="0.01">FWD 0.01</button>
            <button class="oryn-pc-btn" data-rj="0.1">FWD 0.1</button>
            <button class="oryn-pc-btn" data-rj="1">FWD 1</button>
          </div>
          <div class="oryn-pc-sub" style="margin-top:8px">Use 1 unit for coarse rotation, then 0.1 / 0.01 for exact 360° alignment.</div>
          <button id="oryn-rc-save" class="oryn-pc-btn primary" style="margin-top:10px">
            Save This as Exactly One Revolution
          </button>
        </div>
        <div id="oryn-rc-message" class="oryn-pc-message"></div>
      </div>

      <div style="border:1px solid #383838;border-radius:12px;padding:13px">
        <div class="oryn-pc-head" style="margin-bottom:10px">
          <div>
            <h3 class="oryn-pc-title">Perimeter Calibration</h3>
            <div class="oryn-pc-sub">Teach exact Center → Perimeter travel once for this table</div>
          </div>
          <span id="oryn-pc-badge" class="oryn-pc-badge">SOURCE DEFAULT</span>
        </div>

        <div id="oryn-pc-idle">
          <button id="oryn-pc-start" class="oryn-pc-btn primary">Start From Current Center</button>
          <div class="oryn-pc-row">
            <input id="oryn-pc-units" class="oryn-pc-input" type="number" min="0.001" step="0.001"
                   placeholder="Saved controller units">
            <button id="oryn-pc-update" class="oryn-pc-btn">Update</button>
          </div>
          <div class="oryn-pc-meta">
            <span>Saved travel</span>
            <strong id="oryn-pc-saved">Loading…</strong>
          </div>
          <button id="oryn-pc-reset" class="oryn-pc-btn oryn-pc-reset" style="display:none">
            Reset to Source Default
          </button>
        </div>

        <div id="oryn-pc-active" style="display:none">
          <div class="oryn-pc-current">
            <span>Center → Edge travel</span>
            <strong id="oryn-pc-current">0.000 units</strong>
          </div>
          <div class="oryn-pc-jogs">
            <button class="oryn-pc-btn" data-pj="-0.2">IN 0.2</button>
            <button class="oryn-pc-btn" data-pj="0.2">OUT 0.2</button>
            <button class="oryn-pc-btn" data-pj="1">OUT 1</button>
            <button class="oryn-pc-btn" data-pj="-1">IN 1</button>
            <button class="oryn-pc-btn" data-pj="2">OUT 2</button>
            <button class="oryn-pc-btn" data-pj="5">OUT 5</button>
          </div>
          <button id="oryn-pc-save" class="oryn-pc-btn primary" style="margin-top:10px">
            Save This Physical Position as Perimeter
          </button>
        </div>
        <div id="oryn-pc-message" class="oryn-pc-message"></div>
      </div>
    `;
  }

  function findPositionCard() {
    const exact = [...document.querySelectorAll('h1,h2,h3,h4,h5,div,span')]
      .find(el => (el.textContent || '').trim() === 'Position');
    if (!exact) return null;

    let node = exact;
    for (let i=0; i<8 && node; i++, node=node.parentElement) {
      const text = (node.textContent || '');
      if (text.includes('Center') && text.includes('Perimeter') && text.includes('Align')) {
        return node;
      }
    }
    return exact.parentElement?.parentElement || null;
  }

  function bindControls(card) {
    document.getElementById('oryn-rc-start')?.addEventListener('click', startRotation);
    document.getElementById('oryn-rc-update')?.addEventListener('click', updateRotation);
    document.getElementById('oryn-rc-reset')?.addEventListener('click', resetRotation);
    document.getElementById('oryn-rc-save')?.addEventListener('click', saveRotation);
    card.querySelectorAll('[data-rj]').forEach(button => {
      button.addEventListener('click', () => jogRotation(Number(button.dataset.rj)));
    });

    document.getElementById('oryn-pc-start')?.addEventListener('click', startPerimeter);
    document.getElementById('oryn-pc-update')?.addEventListener('click', updatePerimeter);
    document.getElementById('oryn-pc-reset')?.addEventListener('click', resetPerimeter);
    document.getElementById('oryn-pc-save')?.addEventListener('click', savePerimeter);
    card.querySelectorAll('[data-pj]').forEach(button => {
      button.addEventListener('click', () => jogPerimeter(Number(button.dataset.pj)));
    });
  }

  function mount() {
    if (location.pathname !== '/table-control') {
      document.getElementById(CARD_ID)?.remove();
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }

    if (document.getElementById(CARD_ID)) {
      if (!timer) timer = setInterval(refreshAll, 800);
      return;
    }

    const positionCard = findPositionCard();
    if (!positionCard || !positionCard.parentElement) return;

    const card = document.createElement('section');
    card.id = CARD_ID;
    card.innerHTML = cardMarkup();

    // This is the exact mount path that already worked for Perimeter Calibration.
    positionCard.insertAdjacentElement('afterend', card);
    bindControls(card);

    refreshAll();
    if (!timer) timer = setInterval(refreshAll, 800);
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', mount);
  window.addEventListener('popstate', mount);
  setInterval(mount, 1200);
})();
