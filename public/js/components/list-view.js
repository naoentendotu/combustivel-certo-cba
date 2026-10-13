/**
 * Combustível Certo · Aba Lista: o menor preço do momento e todos os postos em ordem
 */
const ListView = (() => {
  let container = null;
  let onSelectStationCallback = null;
  let onUseGpsCallback = null;
  let onFuelChangeCallback = null;
  let onVehicleChangeCallback = null;
  let onShowAllCallback = null;
  let onRetryCallback = null;

  let currentPage = 1;
  const PAGE_SIZE = 10;
  let lastParams = null;

  function init({
    containerId,
    onSelectStation,
    onUseGps,
    onFuelChange,
    onVehicleChange,
    onShowAll,
    onRetry,
  }) {
    container = document.getElementById(containerId);
    onSelectStationCallback = onSelectStation;
    onUseGpsCallback = onUseGps;
    onFuelChangeCallback = onFuelChange;
    onVehicleChangeCallback = onVehicleChange;
    onShowAllCallback = onShowAll;
    onRetryCallback = onRetry;
  }

  function totemHtml(p) {
    const { bestStation: best, rows, fuel, vehicle, vehicleIdx, vehicles, userPos, brlFormatter: brl, numFormatter: num } = p;
    if (!best || best.price == null) return "";

    const prices = rows.map((r) => r.price).filter((v) => v != null);
    const avg = prices.length > 1 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const diff = avg != null ? avg - best.price : 0;
    const where = [best.brand, best.address, best.dist != null ? `${num(best.dist)} km de você` : ""]
      .filter(Boolean)
      .join(" · ");

    return `
      <section class="totem" aria-label="Menor preço">
        <div class="eyebrow">Menor preço de ${UI.esc(fuel.label.toLowerCase())} em Cuiabá</div>
        <div class="totem-price">
          <span class="price price-xl">${brl(best.price)}</span>
          <small>por litro</small>
        </div>
        ${diff > 0.004 ? `<p class="totem-diff">${brl(diff)} abaixo da média dos ${prices.length} postos com preço</p>` : ""}
        <h2 class="totem-name">${UI.esc(best.name)}</h2>
        <p class="totem-addr">${UI.esc(where)}</p>
        <p>${UI.freshness(best, { long: true })}</p>
        ${UI.tank(best, vehicle.tank, brl)}
        ${UI.vehicleLine("listVehicleSel", vehicles, vehicleIdx)}
        <div class="summary-actions">
          <a class="btn btn-primary" href="${UI.routeUrl(best, userPos)}" target="_blank" rel="noopener">
            ${UI.icon("navigation")}<span>Traçar rota</span>
          </a>
          <button type="button" class="btn btn-quiet" data-station-id="${UI.esc(best.id)}" id="listBestMapBtn">
            ${UI.icon("map")}<span>Ver no mapa</span>
          </button>
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
      if (lastParams && (lastParams.fuel.id !== params.fuel.id || lastParams.rows.length !== params.rows.length)) currentPage = 1;
      lastParams = params;
    }
    if (!lastParams) return;

    const p = lastParams;
    const { rows, bestStation, fuel, fuels, vehicle, userPos, brlFormatter: brl, numFormatter: num, week } = p;

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
          best: bestStation && r.id === bestStation.id,
          brl,
          num,
          tank: vehicle.tank,
        }),
      )
      .join("");

    const sortLabel = p.sort === "dist" && userPos ? "mais perto primeiro" : p.sort === "both" && userPos ? "preço e distância" : "menor preço primeiro";

    container.innerHTML = `
      <div class="page">
        <header class="page-head">
          <div class="page-inner">
            <div class="brandline">
              <img src="assets/logo-icon.svg" alt="" />
              <span class="wordmark">Combustível <b>Certo</b></span>
              <span class="place">Cuiabá, MT</span>
            </div>
            <div id="listFuelTabs">${UI.fuelSeg(fuels, fuel.id, "seg-block")}</div>
          </div>
        </header>

        <div class="page-inner">
          ${totemHtml(p)}

          ${
            !userPos && totalItems
              ? `<div class="locate-line">${UI.icon("locate-fixed")}<span>Veja a distância até cada posto.</span><button type="button" class="link" id="listGpsBtn">Usar minha localização</button></div>`
              : ""
          }

          ${
            totalItems
              ? `<div class="section-head">
                  <h2>Todos os postos</h2>
                  <span>${totalItems} ${p.hideNoPrice ? "com preço" : "no cadastro"} · ${sortLabel}</span>
                </div>
                <div class="sheet-block">
                  <ol class="rows">${rowsHtml}</ol>
                  ${totalItems > PAGE_SIZE ? UI.pager({ prefix: "list", start: startIdx, end: endIdx, total: totalItems, page: currentPage, pages: totalPages, noun: "postos" }) : ""}
                </div>`
              : emptyHtml(p)
          }

          <p class="footnote">
            Preços da pesquisa semanal da ANP${week ? `, semana de ${UI.esc(week)}` : ""}. A pesquisa visita uma amostra dos postos e o valor na bomba pode ter mudado desde a coleta.
          </p>
        </div>
      </div>
    `;

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

    container.querySelector("#listGpsBtn")?.addEventListener("click", () => {
      if (typeof onUseGpsCallback === "function") onUseGpsCallback();
    });
    container.querySelector("#listShowAllBtn")?.addEventListener("click", () => {
      if (typeof onShowAllCallback === "function") onShowAllCallback();
    });
    container.querySelector("#listRetryBtn")?.addEventListener("click", () => {
      if (typeof onRetryCallback === "function") onRetryCallback();
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
        const station = rows.find((r) => r.id === el.dataset.stationId) || (bestStation && bestStation.id === el.dataset.stationId ? bestStation : null);
        if (station && typeof onSelectStationCallback === "function") onSelectStationCallback(station);
      });
    });

    UI.icons();
  }

  return { init, render };
})();
