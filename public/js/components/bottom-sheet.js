/**
 * Combustível Certo · Painel do mapa
 * No celular é uma folha inferior (resumo do posto, expansível para a lista).
 * No desktop fica fixo ao lado do mapa, sempre com a lista aberta.
 */
const BottomSheet = (() => {
  let container = null;
  let backdrop = null;

  // Estado interno
  let isExpanded = false;
  let isMini = false; // folha abaixada: só o topo do posto, até o preço
  let currentSort = "price"; // 'price' | 'dist' | 'both'
  let hideNoPrice = true;
  let filtersOpen = false;
  let activeStation = null;
  let bestStation = null;
  let stationRows = [];
  let currentFuel = null;
  let currentUserPos = null;
  let currentPage = 1;
  const PAGE_SIZE = 10;
  let currentVehicleIdx = 1;
  let currentVehicle = (typeof VEHICLES !== "undefined"
    ? VEHICLES[1]
    : null) || { name: "Hyundai HB20", tank: 50 };
  let allVehicles = typeof VEHICLES !== "undefined" ? VEHICLES : [];

  let formatBrl = (n) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let formatNum = (n, d = 1) =>
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });

  // Callbacks
  let onSelectStationCb = null;
  let onSortChangeCb = null;
  let onHideNoPriceChangeCb = null;
  let onRequestGpsCb = null;
  let onVehicleChangeCb = null;
  let onShowHistoryCb = null;
  let onShareCb = null;

  // Gestos de toque
  let touchStartY = 0;
  let touchStartTime = 0;
  let isDraggingHandle = false;

  const desktop = window.matchMedia("(min-width: 1024px)");
  const isDocked = () => desktop.matches;

  function init({
    containerId,
    backdropId,
    onSelectStation,
    onSortChange,
    onHideNoPriceChange,
    onRequestGps,
    onVehicleChange,
    onShowHistory,
    onShare,
  }) {
    container = document.getElementById(containerId);
    backdrop = document.getElementById(backdropId);
    onSelectStationCb = onSelectStation;
    onSortChangeCb = onSortChange;
    onHideNoPriceChangeCb = onHideNoPriceChange;
    onRequestGpsCb = onRequestGps;
    onVehicleChangeCb = onVehicleChange;
    onShowHistoryCb = onShowHistory;
    onShareCb = onShare;

    if (!container) return;

    if (backdrop) backdrop.addEventListener("click", () => collapse());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isExpanded && !isDocked()) collapse();
    });

    desktop.addEventListener("change", () => {
      if (isDocked()) {
        isExpanded = false;
        container.classList.remove("is-expanded");
        backdrop?.classList.add("is-hidden");
      }
      render();
    });

    setupTouchGestures();
  }

  function setupTouchGestures() {
    container.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.closest(".sheet-grip, .sheet-head") || !isExpanded) {
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
          isDraggingHandle = true;
        } else {
          isDraggingHandle = false;
        }
      },
      { passive: true },
    );

    container.addEventListener(
      "touchend",
      (e) => {
        if (isDocked() || (!isDraggingHandle && isExpanded)) return;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;

        if (!isExpanded && (deltaY < -35 || (deltaY < -20 && deltaTime < 250))) {
          if (isMini) setMini(false);
          else expand();
        } else if (!isExpanded && !isMini && (deltaY > 35 || (deltaY > 20 && deltaTime < 250))) {
          setMini(true);
        } else if (isExpanded && (deltaY > 45 || (deltaY > 25 && deltaTime < 250))) {
          const scrollBox = container.querySelector(".sheet-scroll-content");
          if (!scrollBox || scrollBox.scrollTop <= 10) collapse();
        }
        isDraggingHandle = false;
      },
      { passive: true },
    );
  }

  function update({
    active,
    best,
    rows,
    sort,
    hideNoPrice: hide,
    fuel,
    vehicle,
    vehicleIdx,
    vehicles,
    onVehicleChange,
    userPos,
    brlFormatter,
    numFormatter,
  }) {
    if (active) activeStation = active;
    if (best !== undefined) bestStation = best;
    if (rows) stationRows = rows;
    if (hide !== undefined && hide !== hideNoPrice) {
      hideNoPrice = hide;
      currentPage = 1;
    }
    if (sort && sort !== currentSort) {
      currentSort = sort;
      currentPage = 1;
    }
    if (fuel && (!currentFuel || currentFuel.id !== fuel.id)) {
      currentFuel = fuel;
      currentPage = 1;
    }
    if (vehicle) currentVehicle = vehicle;
    if (vehicleIdx !== undefined) currentVehicleIdx = vehicleIdx;
    if (vehicles) allVehicles = vehicles;
    if (onVehicleChange) onVehicleChangeCb = onVehicleChange;
    if (userPos !== undefined) currentUserPos = userPos;
    if (brlFormatter) formatBrl = brlFormatter;
    if (numFormatter) formatNum = numFormatter;

    render();
  }

  // Abaixa a folha recolhida para sobrar mais mapa em telas baixas
  function setMini(on) {
    isMini = on;
    render();
  }

  function expand() {
    if (isDocked()) return;
    isExpanded = true;
    isMini = false;
    container?.classList.add("is-expanded");
    backdrop?.classList.remove("is-hidden");
    render();
  }

  function collapse() {
    isExpanded = false;
    container?.classList.remove("is-expanded");
    backdrop?.classList.add("is-hidden");
    render();
  }

  function toggle() {
    if (isExpanded) collapse();
    else expand();
  }

  // Informa ao mapa a altura ocupada pela folha, para o botão de localização ficar logo acima dela
  function syncHeight() {
    const host = container?.parentElement;
    if (!host) return;
    if (isExpanded && !isDocked()) return; // folha aberta cobre o mapa; mantém a altura da folha recolhida
    const hidden = container.classList.contains("is-hidden");
    host.style.setProperty(
      "--sheet-h",
      isDocked() || hidden ? "0px" : container.offsetHeight + "px",
    );
  }

  function render() {
    if (!container || !activeStation) return;

    if (isExpanded || isDocked()) renderExpanded();
    else renderCollapsed();

    container.classList.remove("is-hidden");
    container.classList.toggle("is-mini", isMini && !isExpanded && !isDocked());
    UI.icons();
    syncHeight();
  }

  const fuelName = () =>
    currentFuel ? currentFuel.label || currentFuel.shortLabel : "Combustível";

  // Resumo do posto: usado na folha recolhida e no topo da lista
  function summaryHtml(station, { vehicleSelId, showAll }) {
    const isBest = bestStation && station.id === bestStation.id;
    const tank = currentVehicle?.tank || 50;
    const diff =
      !isBest && bestStation && station.price != null && bestStation.price != null
        ? station.price - bestStation.price
        : null;

    const tag = isBest
      ? `<span class="tag-best">Menor preço · ${UI.esc(fuelName())}</span>`
      : `<span>${UI.esc(station.brand)}${station.gnv ? " · GNV" : ""}</span>`;
    const dist =
      station.dist != null
        ? `<span class="summary-dist" title="Distância até você">${UI.icon("map-pin")}${formatNum(station.dist)} km</span>`
        : `<button type="button" class="summary-dist summary-dist-btn" data-ask-gps aria-label="Ativar a localização para ver a distância" title="Ativar a localização para ver a distância">${UI.icon("map-pin")}</button>`;

    return `
      <div class="summary-top">${tag}${dist}</div>
      ${UI.flexLine(station, currentFuel?.id, formatBrl)}
      <div class="summary-head">
        <div style="min-width:0">
          <h3>${UI.esc(station.name)}</h3>
          ${UI.addrCopy(station, isBest ? station.brand + " · " + station.address : station.address)}
        </div>
        <div class="summary-price">
          ${
            station.price != null
              ? `<span class="price price-lg">${formatBrl(station.price)}</span><small>por litro</small>`
              : `<span class="muted">Sem preço na pesquisa</span>`
          }
        </div>
      </div>
      ${
        station.stale
          ? `<p class="note-warn summary-fresh">${UI.icon("triangle-alert")}<span>Preço de ${UI.esc(station.priceDate)} · fora da última pesquisa da ANP</span></p>`
          : station.price != null
            ? `<p class="summary-fresh">${UI.freshness(station, { long: true })}</p>`
            : ""
      }
      ${
        diff != null && diff > 0.004
          ? `<div class="summary-compare">
              <span>+ ${formatBrl(diff)} que o menor preço</span>
              <button id="sheetBackToBestBtn" type="button" class="link">Ver o menor</button>
            </div>`
          : ""
      }
      ${station.price != null ? UI.tank(station, tank, formatBrl) + UI.vehicleLine(vehicleSelId, allVehicles, currentVehicleIdx) : ""}
      <div class="summary-actions">
        <a class="btn btn-primary" href="${UI.routeUrl(station, currentUserPos)}" target="_blank" rel="noopener">
          ${UI.icon("navigation")}<span>Traçar rota</span>
        </a>
        ${
          showAll
            ? `<button id="sheetExpandBtn" type="button" class="btn btn-quiet btn-square" aria-label="Ver todos os postos" title="Ver todos os postos">${UI.icon("list")}</button>`
            : ""
        }
        ${
          station.price != null
            ? `<button type="button" class="btn btn-quiet btn-square" data-historico aria-label="Histórico de preço" title="Histórico de preço">${UI.icon("chart-line")}</button>
              <button type="button" class="btn btn-quiet btn-square" data-compartilhar aria-label="Compartilhar este preço" title="Compartilhar este preço">${UI.icon("share-2")}</button>`
            : ""
        }
      </div>
    `;
  }

  function bindSummary(vehicleSelId) {
    const sel = container.querySelector("#" + vehicleSelId);
    sel?.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx) && typeof onVehicleChangeCb === "function") {
        currentVehicleIdx = idx;
        if (allVehicles[idx]) currentVehicle = allVehicles[idx];
        onVehicleChangeCb(idx);
      }
    });

    container.querySelector("[data-historico]")?.addEventListener("click", () => {
      const station = activeStation || bestStation;
      if (station && typeof onShowHistoryCb === "function") onShowHistoryCb(station);
    });

    container.querySelector("[data-compartilhar]")?.addEventListener("click", () => {
      const station = activeStation || bestStation;
      if (station && typeof onShareCb === "function") onShareCb(station);
    });

    container.querySelector("[data-ask-gps]")?.addEventListener("click", () => {
      if (typeof onRequestGpsCb === "function") onRequestGpsCb();
    });

    container.querySelector("#sheetBackToBestBtn")?.addEventListener("click", () => {
      if (!bestStation) return;
      activeStation = bestStation;
      if (typeof onSelectStationCb === "function") onSelectStationCb(bestStation);
      render();
    });
  }

  // ---------------------------------------------------------------------------
  // Folha recolhida: o posto selecionado (ou o de menor preço)
  // ---------------------------------------------------------------------------
  function renderCollapsed() {
    const station = activeStation || bestStation;
    if (!station) return;

    container.innerHTML = `
      <button type="button" class="sheet-grip" id="sheetPeekHeader" aria-label="${isMini ? "Mostrar os detalhes do posto" : "Abrir a lista de postos"}"></button>
      <div class="sheet-peek">
        ${summaryHtml(station, { vehicleSelId: "sheetPeekVehicleSel", showAll: true })}
      </div>
    `;

    container.querySelector("#sheetPeekHeader")?.addEventListener("click", () => (isMini ? setMini(false) : expand()));
    // Abaixada, tocar no resumo (fora dos botões) traz os detalhes de volta
    container.querySelector(".sheet-peek")?.addEventListener("click", (e) => {
      if (isMini && !e.target.closest("button, a")) setMini(false);
    });
    container.querySelector("#sheetExpandBtn")?.addEventListener("click", () => expand());
    bindSummary("sheetPeekVehicleSel");
  }

  // ---------------------------------------------------------------------------
  // Lista de postos (folha aberta no celular, coluna fixa no desktop)
  // ---------------------------------------------------------------------------
  function sortRows() {
    const byDist = (a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity);
    const byPrice = (a, b) =>
      (a.price ?? Infinity) - (b.price ?? Infinity) || byDist(a, b);

    const sorted = [...stationRows];
    if (currentSort === "dist") {
      sorted.sort((a, b) => byDist(a, b) || byPrice(a, b));
    } else if (currentSort === "both" && currentUserPos) {
      const rank = (cmp) => {
        const m = new Map();
        [...stationRows].sort(cmp).forEach((r, i) => m.set(r.id, i));
        return m;
      };
      const pr = rank(byPrice);
      const dr = rank(byDist);
      sorted.sort(
        (a, b) =>
          pr.get(a.id) + dr.get(a.id) - (pr.get(b.id) + dr.get(b.id)) ||
          byPrice(a, b),
      );
    } else {
      sorted.sort(byPrice);
    }
    return sorted;
  }

  function renderExpanded() {
    const isSortBoth = currentSort === "both";
    const isSortPrice = currentSort === "price" || isSortBoth;
    const isSortDist = currentSort === "dist" || isSortBoth;

    const sortedRows = sortRows();
    const totalItems = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);
    const pageRows = sortedRows.slice(startIdx, endIdx);

    const station = activeStation || bestStation;
    if (!station) return;
    const tank = currentVehicle?.tank || 50;
    const scrollTop = container.querySelector(".sheet-scroll-content")?.scrollTop || 0;

    const listTitle = isSortBoth
      ? "Mais baratos e mais perto"
      : isSortDist
        ? "Mais perto de você"
        : "Do menor para o maior preço";

    container.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="sheet-grip" id="sheetGripBtn" aria-label="Recolher a lista"></button>
        <div class="sheet-title">
          <div>
            <h3>${UI.esc(fuelName())}</h3>
            <p>${totalItems} ${totalItems === 1 ? "posto" : "postos"}${hideNoPrice ? " com preço" : ""} em Cuiabá</p>
          </div>
          <button id="sheetCloseBtn" type="button" class="btn-icon" aria-label="Recolher a lista">${UI.icon("chevron-down")}</button>
        </div>

        <div class="sheet-filters">
          <button id="filtersToggleBtn" type="button" class="filter-toggle" aria-label="Mais filtros" title="Mais filtros" aria-expanded="${filtersOpen}">${UI.icon("sliders-horizontal")}</button>
          <button id="sortPriceBtn" type="button" class="chip" aria-pressed="${isSortPrice}">${UI.icon("check")}<span>Menor preço</span></button>
          <button id="sortDistBtn" type="button" class="chip" aria-pressed="${isSortDist}">${UI.icon("check")}<span>Mais perto</span></button>
          ${
            filtersOpen
              ? `<button id="hideNoPriceBtn" type="button" class="chip" aria-pressed="${hideNoPrice}">${UI.icon("check")}<span>Ocultar sem preço</span></button>`
              : ""
          }
        </div>

        ${
          isSortDist && !currentUserPos
            ? `<p id="sheetGpsAlert" class="note-warn" role="button" tabindex="0">${UI.icon("locate-fixed")}<span>Para ordenar por distância, ative a localização.</span><b>Ativar</b></p>`
            : ""
        }
      </div>

      <div class="sheet-scroll-content scroll-thin">
        <div class="sheet-selected">
          ${summaryHtml(station, { vehicleSelId: "sheetExpandedVehicleSel", showAll: false })}
        </div>

        <div class="sheet-list-head">
          <h4>${listTitle}</h4>
        </div>

        <ol class="rows">
          ${pageRows
            .map((s, idx) =>
              UI.stationRow(s, {
                rank: startIdx + idx + 1,
                selected: s.id === station.id,
                best: bestStation && s.id === bestStation.id,
                brl: formatBrl,
                num: formatNum,
                tank,
              }),
            )
            .join("")}
        </ol>

        ${UI.pager({ prefix: "sheet", start: startIdx, end: endIdx, total: totalItems, page: currentPage, pages: totalPages, noun: "postos" })}
      </div>
    `;

    const scrollBox = container.querySelector(".sheet-scroll-content");
    if (scrollBox) scrollBox.scrollTop = scrollTop;

    container.querySelector("#sheetCloseBtn")?.addEventListener("click", () => collapse());
    container.querySelector("#sheetGripBtn")?.addEventListener("click", () => collapse());
    bindSummary("sheetExpandedVehicleSel");

    const goToPage = (delta) => {
      currentPage += delta;
      render();
      container.querySelector(".sheet-scroll-content")?.scrollTo({ top: 0 });
    };
    container.querySelector("#sheetPrevBtn")?.addEventListener("click", () => goToPage(-1));
    container.querySelector("#sheetNextBtn")?.addEventListener("click", () => goToPage(1));

    // "Menor preço" e "Mais perto" podem ficar ligados juntos; um dos dois está sempre ligado
    function toggleSort(target) {
      let price = isSortPrice;
      let dist = isSortDist;
      if (target === "price") price = price && dist ? false : true;
      else dist = price && dist ? false : true;

      const newSort = price && dist ? "both" : dist ? "dist" : "price";
      currentSort = newSort;
      currentPage = 1;

      if (newSort !== "price" && !currentUserPos && typeof onRequestGpsCb === "function") {
        onRequestGpsCb();
      }
      if (typeof onSortChangeCb === "function") onSortChangeCb(newSort);
      render();
    }
    container.querySelector("#sortPriceBtn")?.addEventListener("click", () => toggleSort("price"));
    container.querySelector("#sortDistBtn")?.addEventListener("click", () => toggleSort("dist"));

    container.querySelector("#filtersToggleBtn")?.addEventListener("click", () => {
      filtersOpen = !filtersOpen;
      render();
      container.querySelector("#filtersToggleBtn")?.focus();
    });

    container.querySelector("#hideNoPriceBtn")?.addEventListener("click", () => {
      hideNoPrice = !hideNoPrice;
      currentPage = 1;
      if (typeof onHideNoPriceChangeCb === "function") onHideNoPriceChangeCb(hideNoPrice);
      render();
    });

    const gpsAlert = container.querySelector("#sheetGpsAlert");
    const askGps = () => typeof onRequestGpsCb === "function" && onRequestGpsCb();
    gpsAlert?.addEventListener("click", askGps);
    gpsAlert?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") askGps();
    });

    // Tocar num posto da lista: seleciona e mostra no mapa
    container.querySelectorAll(".row-station").forEach((row) => {
      row.addEventListener("click", () => {
        const picked = stationRows.find((s) => s.id === row.dataset.stationId);
        if (!picked) return;
        activeStation = picked;
        if (typeof onSelectStationCb === "function") onSelectStationCb(picked);
        if (isDocked()) {
          render();
          container.querySelector(".sheet-scroll-content")?.scrollTo({ top: 0 });
        } else {
          collapse();
        }
      });
    });
  }

  function showStation(station, isBest, brlFormatter, numFormatter, userPos) {
    if (station) activeStation = station;
    if (brlFormatter) formatBrl = brlFormatter;
    if (numFormatter) formatNum = numFormatter;
    if (userPos !== undefined) currentUserPos = userPos;
    render();
  }

  function hide() {
    if (container) {
      container.classList.add("is-hidden");
      container.classList.remove("is-expanded");
    }
    if (backdrop) backdrop.classList.add("is-hidden");
    isExpanded = false;
    activeStation = null;
    bestStation = null;
    syncHeight();
  }

  return {
    init,
    update,
    showStation,
    expand,
    collapse,
    toggle,
    hide,
    isExpanded: () => isExpanded,
  };
})();
