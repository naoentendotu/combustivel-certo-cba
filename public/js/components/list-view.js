/**
 * Combustível Certo · Aba Lista: o menor preço do momento e todos os postos em ordem,
 * com filtros por bandeira, bairro e faixa de preço
 */
const ListView = (() => {
  let container = null;
  let onSelectStationCallback = null;
  let onUseGpsCallback = null;
  let onFuelChangeCallback = null;
  let onVehicleChangeCallback = null;
  let onShowAllCallback = null;
  let onRetryCallback = null;
  let onShowHistoryCallback = null;
  let onShareCallback = null;

  let currentPage = 1;
  const PAGE_SIZE = 10;
  let lastParams = null;

  // Filtros da lista (não mudam o mapa)
  let filtersOpen = false;
  const filters = { brands: new Set(), bairro: "", min: null, max: null };

  function init({
    containerId,
    onSelectStation,
    onUseGps,
    onFuelChange,
    onVehicleChange,
    onShowAll,
    onRetry,
    onShowHistory,
    onShare,
  }) {
    container = document.getElementById(containerId);
    onSelectStationCallback = onSelectStation;
    onUseGpsCallback = onUseGps;
    onFuelChangeCallback = onFuelChange;
    onVehicleChangeCallback = onVehicleChange;
    onShowAllCallback = onShowAll;
    onRetryCallback = onRetry;
    onShowHistoryCallback = onShowHistory;
    onShareCallback = onShare;
  }

  const cents = (n) => Math.round(n * 100) / 100;

  // Opções de filtro tiradas dos postos do combustível escolhido
  function filterOptions(rows) {
    const count = new Map();
    const bairros = new Set();
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      count.set(r.brand, (count.get(r.brand) || 0) + 1);
      if (r.bairro) bairros.add(r.bairro);
      if (r.price != null) {
        lo = Math.min(lo, r.price);
        hi = Math.max(hi, r.price);
      }
    }
    return {
      brands: [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      bairros: [...bairros].sort((a, b) => a.localeCompare(b)),
      lo: Number.isFinite(lo) ? Math.floor(lo * 100) / 100 : null,
      hi: Number.isFinite(hi) ? Math.ceil(hi * 100) / 100 : null,
    };
  }

  // Descarta escolhas que não existem mais nos postos mostrados
  function pruneFilters(opts) {
    const known = new Set(opts.brands.map(([b]) => b));
    for (const b of [...filters.brands]) if (!known.has(b)) filters.brands.delete(b);
    if (filters.bairro && !opts.bairros.includes(filters.bairro)) filters.bairro = "";
    if (opts.lo == null || opts.hi <= opts.lo) {
      filters.min = filters.max = null;
    } else {
      if (filters.min != null && (filters.min <= opts.lo || filters.min > opts.hi)) filters.min = null;
      if (filters.max != null && (filters.max >= opts.hi || filters.max < opts.lo)) filters.max = null;
    }
  }

  const activeCount = () =>
    filters.brands.size + (filters.bairro ? 1 : 0) + (filters.min != null || filters.max != null ? 1 : 0);

  function applyFilters(rows) {
    const byPrice = filters.min != null || filters.max != null;
    return rows.filter(
      (r) =>
        (!filters.brands.size || filters.brands.has(r.brand)) &&
        (!filters.bairro || r.bairro === filters.bairro) &&
        (!byPrice ||
          (r.price != null &&
            (filters.min == null || r.price >= filters.min) &&
            (filters.max == null || r.price <= filters.max))),
    );
  }

  function clearFilters() {
    filters.brands.clear();
    filters.bairro = "";
    filters.min = filters.max = null;
    currentPage = 1;
  }

  function filtersHtml(opts, brl) {
    const n = activeCount();
    const hasRange = opts.lo != null && opts.hi > opts.lo;
    const min = filters.min ?? opts.lo;
    const max = filters.max ?? opts.hi;

    return `
      <div class="list-tools">
        <button type="button" id="listFiltersBtn" class="chip chip-tool" aria-expanded="${filtersOpen}" aria-controls="listFilters">
          ${UI.icon("sliders-horizontal")}<span>Filtros</span>${n ? `<b class="chip-count">${n}</b>` : ""}
        </button>
        ${n ? `<button type="button" id="listClearBtn" class="link">Limpar</button>` : ""}
      </div>
      ${
        filtersOpen
          ? `<div id="listFilters" class="filters">
              ${
                hasRange
                  ? `<div class="filter">
                      <div class="filter-label">${UI.icon("banknote")}<span>Preço por litro</span>
                        <output id="listRangeOut" class="range2-out">${brl(min)} a ${brl(max)}</output>
                      </div>
                      <wa-slider id="listRange" range min="${opts.lo}" max="${opts.hi}" step="0.01" min-value="${min}" max-value="${max}">
                        <span slot="label" class="sr-only">Faixa de preço por litro</span>
                      </wa-slider>
                    </div>`
                  : ""
              }
              ${
                opts.brands.length > 1
                  ? `<div class="filter">
                      <div class="filter-label">${UI.icon("flag")}<span>Bandeira</span></div>
                      <div class="chip-cloud">
                        ${opts.brands
                          .map(
                            ([b, c]) =>
                              `<button type="button" class="chip" data-brand="${UI.esc(b)}" aria-pressed="${filters.brands.has(b)}">${UI.icon("check")}<span>${UI.esc(b)}</span><small>${c}</small></button>`,
                          )
                          .join("")}
                      </div>
                    </div>`
                  : ""
              }
              ${
                opts.bairros.length > 1
                  ? `<div class="filter">
                      <div class="filter-label">${UI.icon("map-pin")}<span>Bairro</span></div>
                      <wa-select id="listBairro" size="s" with-clear placeholder="Todos os bairros" value="${filters.bairro ? opts.bairros.indexOf(filters.bairro) : ""}">
                        <span slot="label" class="sr-only">Bairro</span>
                        ${opts.bairros.map((b, i) => `<wa-option value="${i}">${UI.esc(b)}</wa-option>`).join("")}
                      </wa-select>
                    </div>`
                  : ""
              }
            </div>`
          : ""
      }
    `;
  }

  function totemHtml(p, best, prices, filtered) {
    const { fuel, vehicle, vehicleIdx, vehicles, userPos, brlFormatter: brl, numFormatter: num } = p;
    if (!best || best.price == null) return "";

    const avg = prices.length > 1 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const diff = avg != null ? avg - best.price : 0;
    const where = [best.brand, best.address, best.dist != null ? `${num(best.dist)} km de você` : ""]
      .filter(Boolean)
      .join(" · ");

    return `
      <section class="totem wa-dark" aria-label="Menor preço">
        <div class="eyebrow">Menor preço de ${UI.esc(fuel.label.toLowerCase())} ${filtered ? "com estes filtros" : "em " + UI.esc(p.place || "Cuiabá")}</div>
        ${UI.flexLine(best, fuel.id, brl)}
        <div class="totem-price">
          <span class="price price-xl">${brl(best.price)}</span>
          <small>por litro</small>
        </div>
        ${diff > 0.004 ? `<p class="totem-diff">${brl(diff)} abaixo da média dos ${prices.length} postos com preço</p>` : ""}
        <h2 class="totem-name">${UI.esc(best.name)}</h2>
        ${UI.addrCopy(best, where, "totem-addr")}
        <p>${UI.freshness(best, { long: true })}</p>
        ${UI.tank(best, vehicle.tank, brl)}
        ${UI.vehicleLine("listVehicleSel", vehicles, vehicleIdx)}
        <div class="summary-actions">
          <a class="btn btn-primary" href="${UI.routeUrl(best, userPos)}" target="_blank" rel="noopener">
            ${UI.icon("navigation")}<span>Traçar rota</span>
          </a>
          <button type="button" class="btn btn-quiet btn-square" data-station-id="${UI.esc(best.id)}" id="listBestMapBtn" aria-label="Ver no mapa" title="Ver no mapa">
            ${UI.icon("map")}
          </button>
          <button type="button" class="btn btn-quiet btn-square" id="listBestHistBtn" aria-label="Histórico de preço" title="Histórico de preço">
            ${UI.icon("chart-line")}
          </button>
          <button type="button" class="btn btn-quiet btn-square" id="listBestShareBtn" aria-label="Compartilhar este preço" title="Compartilhar este preço">${UI.icon("share-2")}</button>
        </div>
      </section>
    `;
  }

  function emptyHtml(p) {
    const fuel = UI.esc(p.fuel.label.toLowerCase());
    if (p.status === "loading") {
      return `<div class="state"><strong>Carregando os preços da ANP…</strong>Isso leva alguns segundos.</div>`;
    }
    if (p.status === "error") {
      return `<div class="state"><strong>Não foi possível carregar os preços.</strong>Confira a conexão e tente de novo.
        <div><button type="button" class="btn btn-quiet" id="listRetryBtn">Tentar de novo</button></div></div>`;
    }
    if (p.status === "offline") {
      return `<div class="state"><strong>Os preços precisam do servidor.</strong>Rode "node server.js" e abra http://localhost:8080.
        ${p.hideNoPrice ? '<div><button type="button" class="btn btn-quiet" id="listShowAllBtn">Mostrar postos sem preço</button></div>' : ""}</div>`;
    }
    return `<div class="state"><strong>Nenhum posto com preço de ${fuel}.</strong>A pesquisa da ANP visita só uma parte dos postos a cada semana.
      ${p.hideNoPrice ? '<div><button type="button" class="btn btn-quiet" id="listShowAllBtn">Mostrar postos sem preço</button></div>' : ""}</div>`;
  }

  function render(params) {
    if (!container) return;
    if (params) {
      if (lastParams && lastParams.fuel.id !== params.fuel.id) {
        // A faixa de preço é de um combustível só
        filters.min = filters.max = null;
        currentPage = 1;
      } else if (lastParams && lastParams.rows.length !== params.rows.length) {
        currentPage = 1;
      }
      lastParams = params;
    }
    if (!lastParams) return;

    const p = lastParams;
    const { rows: allRows, fuel, fuels, vehicle, userPos, brlFormatter: brl, numFormatter: num, week } = p;

    const opts = filterOptions(allRows);
    pruneFilters(opts);
    const filtered = activeCount() > 0;
    const rows = filtered ? applyFilters(allRows) : allRows;

    // Com filtro, o destaque é o menor preço entre os postos filtrados
    const priced = rows.filter((r) => r.price != null).sort((a, b) => a.price - b.price);
    const best = filtered ? priced.find((r) => !r.stale) || priced[0] || null : p.bestStation;

    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);

    const rowsHtml = rows
      .slice(startIdx, endIdx)
      .map((r, i) =>
        UI.stationRow(r, {
          rank: startIdx + i + 1,
          selected: false,
          best: best && r.id === best.id,
          brl,
          num,
          tank: vehicle.tank,
        }),
      )
      .join("");

    const sortLabel = p.sort === "dist" && userPos ? "mais perto primeiro" : p.sort === "both" && userPos ? "preço e distância" : "menor preço primeiro";
    const countLabel = filtered
      ? `${totalItems} de ${allRows.length}`
      : `${totalItems} ${p.hideNoPrice ? "com preço" : "no cadastro"}`;

    // Os filtros ficam colados na lista que eles filtram
    const listHtml = allRows.length
      ? `<div class="section-head">
          <h2>${filtered ? "Postos filtrados" : "Todos os postos"}</h2>
          <span>${countLabel} · ${sortLabel}</span>
        </div>
        <div class="sheet-block">
          <div class="list-filters">${filtersHtml(opts, brl)}</div>
          ${
            totalItems
              ? `<ol class="rows">${rowsHtml}</ol>
                ${totalItems > PAGE_SIZE ? UI.pager({ prefix: "list", start: startIdx, end: endIdx, total: totalItems, page: currentPage, pages: totalPages, noun: "postos" }) : ""}`
              : `<div class="state"><strong>Nenhum posto com esses filtros.</strong>Amplie a faixa de preço ou tire um filtro.
                  <div><button type="button" class="btn btn-quiet" id="listClearEmptyBtn">Limpar filtros</button></div></div>`
          }
        </div>`
      : emptyHtml(p);

    const scroller = container;
    const scrollTop = scroller.scrollTop;

    container.innerHTML = `
      <div class="page">
        <header class="page-head">
          <div class="page-inner">
            <div class="brandline">
              <img src="assets/logo-icon.png" alt="" />
              <span class="wordmark">Combustível <b>Certo</b></span>
              <span class="place">${UI.esc(p.place || "Cuiabá")}</span>
            </div>
            <div class="fuel-row">
              <div id="listFuelTabs">${UI.fuelSeg(fuels, fuel.id, "seg-block")}</div>
              <button type="button" class="city-btn" popovertarget="cityMenu">${UI.icon("map-pin")}</button>
            </div>
          </div>
        </header>

        <div class="page-inner">
          ${p.notice || ""}
          ${totemHtml(p, best, priced.map((r) => r.price), filtered)}

          ${
            !userPos && totalItems
              ? `<div class="locate-line">${UI.icon("locate-fixed")}<span>Veja a distância até cada posto.</span><button type="button" class="link" id="listGpsBtn">Usar minha localização</button></div>`
              : ""
          }

          ${listHtml}

          <p class="footnote">
            Preços da pesquisa semanal da ANP${week ? `, semana de ${UI.esc(week)}` : ""}. A pesquisa visita uma amostra dos postos e o valor na bomba pode ter mudado desde a coleta.
          </p>
        </div>
      </div>
    `;
    scroller.scrollTop = scrollTop;

    container.querySelector("#listVehicleSel")?.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      const cb = p.onVehicleChange || onVehicleChangeCallback;
      if (!isNaN(idx) && typeof cb === "function") cb(idx);
    });

    container.querySelectorAll("#listFuelTabs [data-fuel-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentPage = 1;
        if (typeof onFuelChangeCallback === "function") onFuelChangeCallback(btn.dataset.fuelId);
      });
    });

    bindFilters(opts, brl);

    container.querySelector("#listGpsBtn")?.addEventListener("click", () => {
      if (typeof onUseGpsCallback === "function") onUseGpsCallback();
    });
    container.querySelector("#listShowAllBtn")?.addEventListener("click", () => {
      if (typeof onShowAllCallback === "function") onShowAllCallback();
    });
    container.querySelector("#listRetryBtn")?.addEventListener("click", () => {
      if (typeof onRetryCallback === "function") onRetryCallback();
    });
    container.querySelector("#listBestShareBtn")?.addEventListener("click", () => {
      if (best && typeof onShareCallback === "function") onShareCallback(best);
    });
    container.querySelector("#listBestHistBtn")?.addEventListener("click", () => {
      if (best && typeof onShowHistoryCallback === "function") onShowHistoryCallback(best);
    });

    const goToPage = (delta) => {
      currentPage += delta;
      render();
      container.querySelector(".section-head")?.scrollIntoView({ block: "start" });
    };
    container.querySelector("#listPrevBtn")?.addEventListener("click", () => goToPage(-1));
    container.querySelector("#listNextBtn")?.addEventListener("click", () => goToPage(1));

    container.querySelectorAll("[data-station-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const station = allRows.find((r) => r.id === el.dataset.stationId) || (best && best.id === el.dataset.stationId ? best : null);
        if (station && typeof onSelectStationCallback === "function") onSelectStationCallback(station);
      });
    });

    UI.icons();
  }

  function bindFilters(opts, brl) {
    // part: a peça interna que deve receber o foco (a ponta da barra de preço que a pessoa estava movendo)
    const refresh = (focusSel, part) => {
      currentPage = 1;
      render();
      const el = focusSel && container.querySelector(focusSel);
      // Os componentes Web Awesome só aceitam foco depois de desenhados
      if (el) Promise.resolve(el.updateComplete).then(() => ((part && el.shadowRoot?.querySelector(`[part~="${part}"]`)) || el).focus());
    };

    container.querySelector("#listFiltersBtn")?.addEventListener("click", () => {
      filtersOpen = !filtersOpen;
      render();
      container.querySelector("#listFiltersBtn")?.focus();
    });
    const clear = () => {
      clearFilters();
      refresh("#listFiltersBtn");
    };
    container.querySelector("#listClearBtn")?.addEventListener("click", clear);
    container.querySelector("#listClearEmptyBtn")?.addEventListener("click", clear);

    container.querySelectorAll("[data-brand]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const b = chip.dataset.brand;
        if (filters.brands.has(b)) filters.brands.delete(b);
        else filters.brands.add(b);
        refresh(`[data-brand="${CSS.escape(b)}"]`);
      });
    });

    // Bairro: o valor da opção é a posição do bairro na lista; vazio = todos
    const bairro = container.querySelector("#listBairro");
    const pickBairro = () => {
      const picked = opts.bairros[bairro.value] || "";
      if (picked === filters.bairro) return;
      filters.bairro = picked;
      refresh("#listBairro");
    };
    bairro?.addEventListener("change", pickBairro);
    bairro?.addEventListener("wa-clear", pickBairro);

    // Faixa de preço: arrastar só atualiza o rótulo; a lista muda ao soltar
    const range = container.querySelector("#listRange");
    const out = container.querySelector("#listRangeOut");
    range?.addEventListener("input", () => {
      if (out) out.textContent = `${brl(range.minValue)} a ${brl(range.maxValue)}`;
    });
    range?.addEventListener("change", () => {
      filters.min = range.minValue > opts.lo ? cents(range.minValue) : null;
      filters.max = range.maxValue < opts.hi ? cents(range.maxValue) : null;
      refresh("#listRange", range.shadowRoot?.activeElement?.getAttribute("part")?.includes("thumb-max") ? "thumb-max" : "thumb-min");
    });
  }

  return { init, render };
})();
