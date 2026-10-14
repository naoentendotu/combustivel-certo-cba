/**
 * Combustível Certo · Painel do mapa
 * No celular é uma folha inferior (resumo do posto, expansível para a lista).
 * No desktop fica fixo ao lado do mapa, sempre com a lista aberta.
 */
const BottomSheet = (() => {
  let container = null;
  let backdrop = null;

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
  let currentPlace = "Cuiabá";
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

  let onSelectStationCb = null;
  let onSortChangeCb = null;
  let onHideNoPriceChangeCb = null;
  let onRequestGpsCb = null;
  let onVehicleChangeCb = null;
  let onShowHistoryCb = null;
  let onShareCb = null;

  // Arrasto da folha: ela acompanha o dedo e, ao soltar, desliza até a posição mais próxima
  let drag = null; // { y0, t0, h0, mini, peek, full, moved, lastY, lastT, v }
  let settling = false;
  let pendingRender = false;
  let lastPeekH = 360;
  let lastMiniH = 120;

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

    if (backdrop) backdrop.addEventListener("click", () => snapTo("peek"));

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

  const stateName = () => (isExpanded ? "full" : isMini ? "mini" : "peek");

  // Altura da folha abaixada: do topo até o fim do bloco com o nome e o preço do posto
  function miniHeight() {
    const head = container.querySelector(".sheet-peek .summary-head");
    if (!head) return lastMiniH;
    return Math.round(head.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 14);
  }

  // Alturas das três posições, medidas a partir do que está na tela agora
  function snapHeights() {
    const full = (container.parentElement?.clientHeight || window.innerHeight) - 56;
    if (!isExpanded) {
      if (isMini) {
        // mede a folha recolhida inteira sem mudar o que a pessoa vê
        const h = container.offsetHeight;
        container.style.height = h + "px";
        container.classList.remove("is-mini");
        lastMiniH = h;
        lastPeekH = Math.min(container.scrollHeight, 460);
      } else {
        lastPeekH = container.offsetHeight;
        lastMiniH = miniHeight();
      }
    }
    return { mini: Math.min(lastMiniH, lastPeekH), peek: Math.min(lastPeekH, full), full };
  }

  const setSheetVar = (h) => container.parentElement?.style.setProperty("--sheet-h", Math.round(h) + "px");

  // Desliza a folha até uma posição ("mini", "peek" ou "full") e só então troca o conteúdo
  function snapTo(target, heights) {
    if (!container || isDocked() || settling) return;
    const from = container.offsetHeight;
    const hs = heights || snapHeights();
    const to = hs[target];

    const finish = () => {
      settling = false;
      container.classList.remove("is-settling", "is-dragging");
      container.style.height = "";
      container.style.maxHeight = "";
      isExpanded = target === "full";
      isMini = target === "mini";
      container.classList.toggle("is-expanded", isExpanded);
      backdrop?.classList.toggle("is-hidden", !isExpanded);
      pendingRender = false;
      render();
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || Math.abs(to - from) < 2) return finish();

    settling = true;
    container.style.maxHeight = "none";
    container.style.height = from + "px";
    container.classList.remove("is-dragging", "is-mini");
    void container.offsetHeight; // fixa a altura de partida antes de animar
    container.classList.add("is-settling");
    container.style.height = to + "px";
    setSheetVar(Math.min(to, hs.peek));

    let done = false;
    const end = (e) => {
      if (done || (e && (e.target !== container || e.propertyName !== "height"))) return;
      done = true;
      container.removeEventListener("transitionend", end);
      finish();
    };
    container.addEventListener("transitionend", end);
    setTimeout(end, 400);
  }

  function setupTouchGestures() {
    container.addEventListener(
      "touchstart",
      (e) => {
        drag = null;
        if (isDocked() || settling || e.touches.length !== 1) return;
        // Com a lista aberta, só o topo arrasta a folha; o resto rola a lista
        if (isExpanded && !e.target.closest(".sheet-grip, .sheet-head")) return;
        const y = e.touches[0].clientY;
        drag = { y0: y, t0: Date.now(), h0: 0, moved: false, lastY: y, lastT: Date.now(), v: 0 };
      },
      { passive: true },
    );

    container.addEventListener(
      "touchmove",
      (e) => {
        if (!drag) return;
        const y = e.touches[0].clientY;
        const dy = y - drag.y0;
        if (!drag.moved) {
          if (Math.abs(dy) < 6) return;
          drag.moved = true;
          drag.h0 = container.offsetHeight;
          drag.start = stateName();
          Object.assign(drag, snapHeights());
          container.classList.add("is-dragging");
          container.classList.remove("is-mini");
          container.style.maxHeight = "none";
          // A lista já vem por baixo do resumo enquanto a folha sobe; o render ao parar a troca pela de verdade
          if (!isExpanded) {
            const station = activeStation || bestStation;
            container.insertAdjacentHTML(
              "beforeend",
              `<div class="sheet-list-preview" aria-hidden="true">${listHtml(station, sortRows().slice(0, PAGE_SIZE), 0)}</div>`,
            );
          }
        }
        const now = Date.now();
        if (now > drag.lastT) drag.v = (y - drag.lastY) / (now - drag.lastT); // px/ms, positivo para baixo
        drag.lastY = y;
        drag.lastT = now;

        const h = Math.max(drag.mini, Math.min(drag.full, drag.h0 - dy));
        container.style.height = h + "px";
        setSheetVar(Math.min(h, drag.peek));
      },
      { passive: true },
    );

    const release = () => {
      const d = drag;
      drag = null;
      if (!d || !d.moved) return;
      const h = container.offsetHeight;
      const order = ["mini", "peek", "full"];
      let target;
      if (Math.abs(d.v) > 0.45 && Date.now() - d.lastT < 120) {
        // Puxão rápido: vai para a próxima posição na direção do gesto
        const i = order.indexOf(d.start) + (d.v < 0 ? 1 : -1);
        target = order[Math.max(0, Math.min(2, i))];
      } else {
        target = order.reduce((a, b) => (Math.abs(d[b] - h) < Math.abs(d[a] - h) ? b : a));
      }
      snapTo(target, d);
    };
    container.addEventListener("touchend", release, { passive: true });
    container.addEventListener("touchcancel", release, { passive: true });
  }

  function update({
    active,
    best,
    rows,
    sort,
    hideNoPrice: hide,
    place,
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
    if (place) currentPlace = place;
    if (userPos !== undefined) currentUserPos = userPos;
    if (brlFormatter) formatBrl = brlFormatter;
    if (numFormatter) formatNum = numFormatter;

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
    if (drag?.moved || settling) {
      pendingRender = true; // redesenha quando a folha parar
      return;
    }

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

    container.querySelector("#sheetPeekHeader")?.addEventListener("click", () => snapTo(isMini ? "peek" : "full"));
    // Abaixada, tocar no resumo (fora dos botões) traz os detalhes de volta
    container.querySelector(".sheet-peek")?.addEventListener("click", (e) => {
      if (isMini && !e.target.closest("button, a")) snapTo("peek");
    });
    container.querySelector("#sheetExpandBtn")?.addEventListener("click", () => snapTo("full"));
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

  function listHtml(station, pageRows, startIdx) {
    const listTitle =
      currentSort === "both"
        ? "Mais baratos e mais perto"
        : currentSort === "dist"
          ? "Mais perto de você"
          : "Do menor para o maior preço";
    const tank = currentVehicle?.tank || 50;
    return `
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
        </ol>`;
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
    const scrollTop = container.querySelector(".sheet-scroll-content")?.scrollTop || 0;

    container.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="sheet-grip" id="sheetGripBtn" aria-label="Recolher a lista"></button>
        <div class="sheet-title">
          <div>
            <h3>${UI.esc(fuelName())}</h3>
            <p>${totalItems} ${totalItems === 1 ? "posto" : "postos"}${hideNoPrice ? " com preço" : ""} em ${UI.esc(currentPlace)}</p>
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

        ${listHtml(station, pageRows, startIdx)}

        ${UI.pager({ prefix: "sheet", start: startIdx, end: endIdx, total: totalItems, page: currentPage, pages: totalPages, noun: "postos" })}
      </div>
    `;

    const scrollBox = container.querySelector(".sheet-scroll-content");
    if (scrollBox) scrollBox.scrollTop = scrollTop;

    container.querySelector("#sheetCloseBtn")?.addEventListener("click", () => snapTo("peek"));
    container.querySelector("#sheetGripBtn")?.addEventListener("click", () => snapTo("peek"));
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
