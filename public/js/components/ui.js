/**
 * Combustível Certo · Peças de interface compartilhadas entre o painel do mapa, a lista e o ranking
 */
const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<i data-lucide="${name}"></i>`;

  // A ANP publica tudo em maiúsculas; aqui vira texto de leitura normal
  const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  const SIGLAS = new Set(["BR", "MT", "GNV", "S/N", "II", "III", "IV", "CPA", "ME", "EPP"]);
  function titleCase(s) {
    return String(s ?? "").toLowerCase().replace(/[^\s·,()-]+/g, (w, i) => {
      const up = w.toUpperCase();
      if (SIGLAS.has(up) || /\d/.test(w) || /^[a-z]\.$/.test(w)) return up;
      if (i > 0 && MINUSCULAS.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    });
  }

  function icons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function routeUrl(s, userPos) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` +
      (userPos ? `&origin=${userPos.lat},${userPos.lng}` : '');
  }

  // Data da coleta; em âmbar, com ícone, quando o preço não é da última semana pesquisada
  function freshness(s, { long = false } = {}) {
    if (s.price == null || !s.priceDate) return '';
    const dia = s.priceDate.slice(0, 5);
    if (s.stale) {
      return `<span class="fresh is-stale">${icon('triangle-alert')}<span>${long
        ? `Preço de ${esc(s.priceDate)} · fora da última pesquisa`
        : `Preço de ${esc(dia)}`}</span></span>`;
    }
    return `<span class="fresh" title="Preço coletado pela ANP em ${esc(s.priceDate)}">${icon('calendar-check')}<span>${long ? 'ANP · ' + esc(s.priceDate) : esc(dia)}</span></span>`;
  }

  function stationRow(s, { rank, selected, best, brl, num, tank }) {
    const full = s.full ?? (s.price != null ? s.price * tank : null);
    const dist = s.dist != null ? `<span>${num(s.dist)} km</span>` : '';
    return `<li>
      <button type="button" class="row-station${selected ? ' is-selected' : ''}" data-station-id="${esc(s.id)}"${selected ? ' aria-current="true"' : ''}>
        <span class="row-rank${best ? ' is-best' : ''}">${rank}</span>
        <span class="row-main">
          <span class="row-name">${esc(s.name)}</span>
          <span class="row-sub">${esc(s.brand)} · ${esc(s.address)}</span>
          <span class="row-meta">${dist}${freshness(s)}${s.gnv ? '<span>GNV</span>' : ''}</span>
        </span>
        <span class="row-price">
          ${s.price != null
            ? `<span class="price price-md">${brl(s.price)}</span><span class="row-tank">tanque ${brl(full)}</span>`
            : '<span class="row-noprice">sem preço</span>'}
        </span>
      </button>
    </li>`;
  }

  function tank(s, tankL, brl) {
    const full = s.full ?? (s.price != null ? s.price * tankL : null);
    const half = full != null ? full / 2 : null;
    return `<dl class="tank">
      <div><dt>Tanque cheio · ${tankL} L</dt><dd>${full != null ? brl(full) : '—'}</dd></div>
      <div><dt>Meio tanque · ${num1(tankL / 2)} L</dt><dd>${half != null ? brl(half) : '—'}</dd></div>
    </dl>`;
  }
  const num1 = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  function vehicleLine(id, vehicles, idx) {
    return `<div class="veh-line">
      ${icon('car')}
      <select id="${id}" class="select-inline" aria-label="Veículo da simulação" title="Veículo da simulação">
        ${vehicles.map((v, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(v.name)} (${v.tank} L)</option>`).join('')}
      </select>
    </div>`;
  }

  function fuelSeg(fuels, activeId, extraClass = '') {
    return `<div class="seg ${extraClass}" role="group" aria-label="Combustível">
      ${fuels.map(f => `<button type="button" data-fuel-id="${f.id}" aria-pressed="${f.id === activeId}">${esc(f.shortLabel)}</button>`).join('')}
    </div>`;
  }

  function pager({ prefix, start, end, total, page, pages, noun }) {
    return `<div class="pager">
      <span>${total ? start + 1 : 0}–${end} de ${total} ${noun}</span>
      <div class="pager-nav">
        <button id="${prefix}PrevBtn" type="button" class="btn-icon" aria-label="Página anterior"${page === 1 ? ' disabled' : ''}>${icon('chevron-left')}</button>
        <span class="pager-page">${page} / ${pages}</span>
        <button id="${prefix}NextBtn" type="button" class="btn-icon" aria-label="Próxima página"${page === pages ? ' disabled' : ''}>${icon('chevron-right')}</button>
      </div>
    </div>`;
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 4500);
  }

  return { esc, titleCase, icon, icons, routeUrl, freshness, stationRow, tank, vehicleLine, fuelSeg, pager, toast };
})();
