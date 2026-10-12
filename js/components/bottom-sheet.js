/**
 * Combustível Certo · Componente Bottom Sheet do Mapa (Peek & Expandido com Paginação de 10 em 10)
 */
const BottomSheet = (() => {
  let container = null;
  let backdrop = null;

  // Estado interno
  let isExpanded = false;
  let currentSort = "price"; // 'price' | 'dist'
  let activeStation = null;
  let bestStation = null;
  let stationRows = [];
  let currentFuel = null;
  let currentUserPos = null;
  let currentPage = 1;
  const PAGE_SIZE = 10;

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
  let onRequestGpsCb = null;

  // Variáveis para rastreamento de gestos touch
  let touchStartY = 0;
  let touchStartTime = 0;
  let isDraggingHandle = false;

  function init({
    containerId,
    backdropId,
    onSelectStation,
    onSortChange,
    onRequestGps,
  }) {
    container = document.getElementById(containerId);
    backdrop = document.getElementById(backdropId);
    onSelectStationCb = onSelectStation;
    onSortChangeCb = onSortChange;
    onRequestGpsCb = onRequestGps;

    if (!container) return;

    // Fechar ao clicar no backdrop translúcido
    if (backdrop) {
      backdrop.addEventListener("click", () => collapse());
    }

    // Fechar com tecla ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isExpanded) {
        collapse();
      }
    });

    // Gestos de Touch na barra de puxar e no cabeçalho
    setupTouchGestures();
  }

  function setupTouchGestures() {
    container.addEventListener(
      "touchstart",
      (e) => {
        const target = e.target;
        if (
          target.closest(".sheet-drag-area") ||
          target.closest(".sheet-drag-handle") ||
          !isExpanded
        ) {
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
        if (!isDraggingHandle && isExpanded) return;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaY = touchEndY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;

        // Puxar para cima expande o sheet
        if (
          !isExpanded &&
          (deltaY < -35 || (deltaY < -20 && deltaTime < 250))
        ) {
          expand();
        }
        // Puxar para baixo quando estiver no topo da rolagem recolhe o sheet
        else if (
          isExpanded &&
          (deltaY > 45 || (deltaY > 25 && deltaTime < 250))
        ) {
          const scrollBox = container.querySelector(".sheet-scroll-content");
          if (!scrollBox || scrollBox.scrollTop <= 10) {
            collapse();
          }
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
    fuel,
    userPos,
    brlFormatter,
    numFormatter,
  }) {
    if (active) activeStation = active;
    if (best) bestStation = best;
    if (rows) stationRows = rows;
    if (sort && sort !== currentSort) {
      currentSort = sort;
      currentPage = 1;
    }
    if (fuel && (!currentFuel || currentFuel.id !== fuel.id)) {
      currentFuel = fuel;
      currentPage = 1;
    }
    if (userPos !== undefined) currentUserPos = userPos;
    if (brlFormatter) formatBrl = brlFormatter;
    if (numFormatter) formatNum = numFormatter;

    render();
  }

  function expand() {
    isExpanded = true;
    if (container) {
      container.classList.add("is-expanded");
      container.classList.remove("is-hidden");
    }
    if (backdrop) {
      backdrop.classList.remove("is-hidden");
    }
    render();
  }

  function collapse() {
    isExpanded = false;
    if (container) {
      container.classList.remove("is-expanded");
    }
    if (backdrop) {
      backdrop.classList.add("is-hidden");
    }
    render();
  }

  function toggle() {
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function render() {
    if (!container || !activeStation) return;

    if (isExpanded) {
      renderExpanded();
    } else {
      renderCollapsed();
    }

    container.classList.remove("is-hidden");
    refreshIcons();
  }

  // ---------------------------------------------------------------------------
  // Renderização: Modo Recolhido (Peek)
  // ---------------------------------------------------------------------------
  function renderCollapsed() {
    const station = activeStation || bestStation;
    const isBest = bestStation && station.id === bestStation.id;

    const routeUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}` +
      (currentUserPos
        ? `&origin=${currentUserPos.lat},${currentUserPos.lng}`
        : "");

    const priceText =
      station.price != null ? formatBrl(station.price) : "Sem preço";
    const distText =
      station.dist != null
        ? `${formatNum(station.dist)} km de você`
        : "Cuiabá · MT";
    const fuelName = currentFuel
      ? currentFuel.label || currentFuel.shortLabel || currentFuel.name
      : "Combustível";

    const bestBadge = isBest
      ? `<span class="px-2.5 py-1 rounded-full bg-[#0e7048] text-white font-black text-[10px] tracking-wide uppercase shadow-sm flex items-center gap-1.5"><i data-lucide="star" class="w-3 h-3 fill-amber-300 text-amber-300"></i><span>Menor preço · ${fuelName}</span></span>`
      : `<span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">${station.brand}</span>`;

    container.innerHTML = `
      <!-- Puxador Superior com Área de Arraste e Clique -->
      <div class="sheet-drag-area text-center" id="sheetPeekHeader">
        <div class="sheet-drag-handle"></div>
        <div class="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-[#0e7048] transition cursor-pointer select-none">
          <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
          <span>Puxe para cima para ver os outros (${stationRows.length} postos)</span>
        </div>
      </div>

      <div class="px-5 pb-4 pt-1.5">
        <!-- Linha Superior: Tags e Distância -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${bestBadge}
            ${station.gnv ? '<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">GNV</span>' : ""}
          </div>
          <span class="text-xs font-semibold text-slate-500">${distText}</span>
        </div>

        <!-- Linha Central: Nome, Endereço e Preço Grande -->
        <div class="flex items-baseline justify-between gap-3 mt-1.5">
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-extrabold text-slate-900 leading-tight truncate">${station.name}</h3>
            <p class="text-xs text-slate-500 truncate mt-1">${station.brand} · ${station.address}</p>
          </div>
          <div class="text-right shrink-0">
            <div class="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums leading-none">${priceText}</div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">por litro</div>
          </div>
        </div>

        ${
          station.stale
            ? `
          <div class="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-700 shrink-0"></i>
            <span class="truncate">Preço coletado em ${station.priceDate} (sem visita recente da ANP)</span>
          </div>
        `
            : ""
        }

        <!-- Botões de Ação Inferiores -->
        <div class="mt-3.5 flex items-center gap-2">
          <a
            href="${routeUrl}"
            target="_blank"
            rel="noopener"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0e7048] hover:bg-[#095436] active:scale-[0.98] text-white font-black text-xs shadow-md transition-all cursor-pointer"
          >
            <i data-lucide="navigation" class="w-4 h-4 text-white"></i>
            <span>Traçar rota</span>
          </a>

          <button
            id="sheetExpandBtn"
            type="button"
            class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
          >
            <i data-lucide="list" class="w-3.5 h-3.5 text-slate-600"></i>
          </button>
        </div>
      </div>
    `;

    // Eventos
    container
      .querySelector("#sheetPeekHeader")
      ?.addEventListener("click", () => expand());
    container
      .querySelector("#sheetExpandBtn")
      ?.addEventListener("click", () => expand());
  }

  // ---------------------------------------------------------------------------
  // Renderização: Modo Expandido (Drawer Completo com Paginação de 10 em 10)
  // ---------------------------------------------------------------------------
  function renderExpanded() {
    const fuelName = currentFuel
      ? currentFuel.label || currentFuel.shortLabel || currentFuel.name
      : "Combustível";
    const isSortPrice = currentSort === "price";
    const isSortDist = currentSort === "dist";

    // Ordenação dos postos na lista
    const sortedRows = [...stationRows].sort((a, b) => {
      if (isSortDist) {
        return (
          (a.dist ?? Infinity) - (b.dist ?? Infinity) ||
          (a.price ?? Infinity) - (b.price ?? Infinity)
        );
      }
      return (
        (a.price ?? Infinity) - (b.price ?? Infinity) ||
        (a.dist ?? Infinity) - (b.dist ?? Infinity)
      );
    });

    // Cálculos de Paginação (10 em 10)
    const totalItems = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);
    const pageRows = sortedRows.slice(startIdx, endIdx);

    const station = activeStation || bestStation;
    const isBest = bestStation && station.id === bestStation.id;

    const routeUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}` +
      (currentUserPos
        ? `&origin=${currentUserPos.lat},${currentUserPos.lng}`
        : "");

    const activePriceText =
      station.price != null ? formatBrl(station.price) : "Sem preço";
    const activeDistText =
      station.dist != null
        ? `${formatNum(station.dist)} km de você`
        : "Cuiabá · MT";

    container.innerHTML = `
      <!-- Cabeçalho Fixo do Bottom Sheet -->
      <div class="sheet-drag-area border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
        <div class="sheet-drag-handle"></div>

        <div class="flex items-center justify-between gap-3 pt-1.5 pb-2.5 px-4 sm:px-5">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-8 h-8 rounded-xl bg-emerald-950/10 text-[#0e7048] flex items-center justify-center text-sm font-black shrink-0">
              <i data-lucide="fuel" class="w-4 h-4 text-[#0e7048]"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold text-slate-900 leading-tight truncate">${fuelName}</h3>
              <p class="text-[11px] font-semibold text-slate-500">${totalItems} postos encontrados</p>
            </div>
          </div>

          <button
            id="sheetCloseBtn"
            type="button"
            title="Recolher tela"
            aria-label="Recolher tela"
            class="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
          >
            <i data-lucide="chevron-down" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Seletor de Ordenação: Menor Preço vs. Mais Perto -->
        <div class="flex items-center justify-between gap-2 py-2.5 px-4 sm:px-5 border-t border-slate-100">
          <span class="text-xs font-bold text-slate-600">Ordenar por:</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              id="sortPriceBtn"
              type="button"
              class="sort-pill-btn ${isSortPrice ? "is-active" : ""}"
            >
              <i data-lucide="badge-percent" class="w-3.5 h-3.5"></i>
              <span>Menor preço</span>
            </button>

            <button
              id="sortDistBtn"
              type="button"
              class="sort-pill-btn ${isSortDist ? "is-active" : ""}"
            >
              <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
              <span>Mais perto</span>
            </button>
          </div>
        </div>

        ${
          isSortDist && !currentUserPos
            ? `
          <div id="sheetGpsAlert" class="mx-4 sm:mx-5 my-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between cursor-pointer">
            <div class="flex items-center gap-1.5 min-w-0">
              <i data-lucide="locate-fixed" class="w-3.5 h-3.5 text-amber-700 shrink-0"></i>
              <span class="font-medium truncate">Ative o GPS para calcular distância exata</span>
            </div>
            <span class="font-bold underline text-[#0e7048] shrink-0 ml-2">Ativar GPS &rarr;</span>
          </div>
        `
            : ""
        }
      </div>

      <!-- Área de Rolagem do Conteúdo com espaçamento confortável -->
      <div class="sheet-scroll-content flex-1 min-h-0 overflow-y-auto scroll-thin px-4 sm:px-5 py-4 space-y-3.5">
        <!-- 1. Card do Posto em Destaque Selecionado -->
        <div class="rounded-2xl border-2 ${isBest ? "border-[#0e7048] bg-gradient-to-br from-emerald-950/5 to-white" : "border-slate-300 bg-white"} p-4 sm:p-5 shadow-sm">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-1.5">
              <span class="px-2.5 py-1 rounded-full ${isBest ? "bg-[#0e7048] text-white shadow-sm" : "bg-slate-700 text-white"} font-black text-[10px] tracking-wide uppercase flex items-center gap-1.5">
                <i data-lucide="${isBest ? "star" : "check-circle"}" class="w-3 h-3 ${isBest ? "fill-amber-300 text-amber-300" : "text-slate-300"}"></i>
                <span>${isBest ? "MENOR PREÇO" : "Posto Selecionado"}</span>
              </span>
              <span class="px-2.5 py-1 rounded-full bg-slate-200/90 text-slate-800 font-bold text-[10px] uppercase">${station.brand}</span>
            </div>
            <span class="text-xs font-bold text-[#0e7048]">${activeDistText}</span>
          </div>

          <div class="flex items-baseline justify-between gap-3 mt-1.5">
            <div class="min-w-0 flex-1">
              <h4 class="text-base font-extrabold text-slate-900 leading-tight truncate">${station.name}</h4>
              <p class="text-xs text-slate-600 truncate mt-1">${station.address}</p>
            </div>
            <div class="text-right shrink-0">
              <div class="text-2xl font-black text-slate-900 tabular-nums">${activePriceText}</div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">por litro</div>
            </div>
          </div>

          ${
            !isBest && bestStation
              ? `
            <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <span class="text-slate-500">Menor preço da cidade: <strong>${formatBrl(bestStation.price)}</strong></span>
              <button id="sheetBackToBestBtn" type="button" class="font-extrabold text-[#0e7048] hover:underline cursor-pointer">Ver menor preço &rarr;</button>
            </div>
          `
              : ""
          }

          <!-- Botão Traçar Rota no Posto Selecionado -->
          <div class="mt-3.5">
            <a
              href="${routeUrl}"
              target="_blank"
              rel="noopener"
              class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0e7048] hover:bg-[#095436] active:scale-[0.98] text-white font-black text-xs shadow-md transition-all cursor-pointer"
            >
              <i data-lucide="navigation" class="w-4 h-4 text-white"></i>
              <span>Traçar rota no GPS</span>
            </a>
          </div>
        </div>

        <!-- 2. Cabeçalho da Lista de Postos com Paginação -->
        <div class="pt-2 px-0.5 flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
            <i data-lucide="${isSortDist ? "map-pin" : "badge-percent"}" class="w-3.5 h-3.5 text-[#0e7048]"></i>
            <span>${isSortDist ? "Postos mais próximos" : "Postos por menor preço"}</span>
          </div>
          <span class="text-[11px] text-slate-400 font-semibold">10 por página</span>
        </div>

        <!-- 3. Lista dos 10 Postos da Página Atual -->
        <div class="space-y-2.5">
          ${pageRows
            .map((s, idx) => {
              const globalIndex = startIdx + idx;
              const isSelected = s.id === station.id;
              const isRankBest = globalIndex === 0;
              const price = s.price != null ? formatBrl(s.price) : "Sem preço";
              const dist = s.dist != null ? `${formatNum(s.dist)} km` : "—";
              const stRouteUrl =
                `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` +
                (currentUserPos
                  ? `&origin=${currentUserPos.lat},${currentUserPos.lng}`
                  : "");

              return `
              <div
                data-station-card="${s.id}"
                class="rounded-xl border p-3.5 sm:p-4 transition-all cursor-pointer ${
                  isSelected
                    ? "border-[#0e7048] bg-emerald-950/5 ring-2 ring-[#0e7048]/20 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                }"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start gap-2.5 min-w-0 flex-1">
                    <!-- Número do Ranking Geral -->
                    <span class="w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                      isRankBest
                        ? "bg-amber-400 text-emerald-950 font-black"
                        : globalIndex < 3
                          ? "bg-emerald-950/10 text-[#0e7048] font-bold"
                          : "bg-slate-100 text-slate-600 font-bold"
                    }">
                      ${globalIndex + 1}
                    </span>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-xs font-black text-slate-900 truncate">${s.name}</span>
                        <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-extrabold text-[9px] uppercase">${s.brand}</span>
                      </div>
                      <p class="text-[11px] text-slate-500 truncate mt-0.5">${s.address}</p>

                      <div class="flex items-center gap-2 mt-1 text-[11px] font-semibold text-slate-500">
                        <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i><span>${dist}</span></span>
                        ${s.gnv ? '<span class="text-[#0e7048] font-bold">· GNV</span>' : ""}
                      </div>
                    </div>
                  </div>

                  <!-- Preço e Ações Rápidas -->
                  <div class="text-right shrink-0 flex flex-col items-end justify-between">
                    <span class="text-base font-black text-slate-900 tabular-nums">${price}</span>

                    <div class="flex items-center gap-1 mt-1.5">
                      <button
                        data-focus-map="${s.id}"
                        type="button"
                        title="Ver no mapa"
                        class="px-2 py-1 rounded-lg bg-emerald-950/10 hover:bg-emerald-950/20 text-[#0e7048] font-extrabold text-[10px] transition active:scale-95 cursor-pointer border border-[#0e7048]/30 flex items-center gap-1"
                      >
                        <i data-lucide="map" class="w-3 h-3"></i>
                        <span>Mapa</span>
                      </button>

                      <a
                        href="${stRouteUrl}"
                        target="_blank"
                        rel="noopener"
                        title="Traçar rota no GPS"
                        class="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition active:scale-95 cursor-pointer"
                      >
                        <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>

        <!-- 4. Barra de Paginação (10 em 10 - Inquebrável em telas menores) -->
        <div class="mt-4 pt-3 border-t border-slate-200/90 flex items-center justify-between gap-2 text-xs">
          <span class="text-slate-500 font-semibold text-[11px] whitespace-nowrap shrink-0">
            <strong>${totalItems ? startIdx + 1 : 0}–${endIdx}</strong> de <strong>${totalItems}</strong><span class="hidden sm:inline"> postos</span>
          </span>
          <div class="flex items-center gap-1 shrink-0">
            <button
              id="sheetPrevBtn"
              type="button"
              title="Página anterior"
              class="h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
              ${currentPage === 1 ? "disabled" : ""}
            >
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
              <span class="hidden sm:inline text-xs">Anterior</span>
            </button>

            <span class="h-8 px-2 sm:px-2.5 flex items-center justify-center font-extrabold text-slate-800 text-xs bg-slate-100 rounded-lg whitespace-nowrap">
              ${currentPage} / ${totalPages}
            </span>

            <button
              id="sheetNextBtn"
              type="button"
              title="Próxima página"
              class="h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
              ${currentPage === totalPages ? "disabled" : ""}
            >
              <span class="hidden sm:inline text-xs">Próxima</span>
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    // Eventos do modo expandido
    container
      .querySelector("#sheetCloseBtn")
      ?.addEventListener("click", () => collapse());

    // Botões de navegação de página
    container.querySelector("#sheetPrevBtn")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        render();
        container
          .querySelector(".sheet-scroll-content")
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    container.querySelector("#sheetNextBtn")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        render();
        container
          .querySelector(".sheet-scroll-content")
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    // Botões de ordenação
    container.querySelector("#sortPriceBtn")?.addEventListener("click", () => {
      currentSort = "price";
      currentPage = 1;
      if (bestStation) activeStation = bestStation;
      if (typeof onSortChangeCb === "function") onSortChangeCb("price");
      render();
    });

    container.querySelector("#sortDistBtn")?.addEventListener("click", () => {
      if (currentSort !== "dist") {
        currentSort = "dist";
        currentPage = 1;
        if (typeof onSortChangeCb === "function") onSortChangeCb("dist");
        if (!currentUserPos && typeof onRequestGpsCb === "function") {
          onRequestGpsCb();
        }
        render();
      }
    });

    container
      .querySelector("#sheetBackToBestBtn")
      ?.addEventListener("click", () => {
        if (bestStation) {
          activeStation = bestStation;
          if (typeof onSelectStationCb === "function")
            onSelectStationCb(bestStation);
          render();
        }
      });

    container.querySelector("#sheetGpsAlert")?.addEventListener("click", () => {
      if (typeof onRequestGpsCb === "function") onRequestGpsCb();
    });

    // Clique em cada card de posto na lista
    container.querySelectorAll("[data-station-card]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;

        const sId = card.dataset.stationCard;
        const station = stationRows.find((s) => s.id === sId);
        if (station) {
          activeStation = station;
          if (typeof onSelectStationCb === "function") {
            onSelectStationCb(station);
          }
          if (e.target.closest("[data-focus-map]")) {
            collapse();
          } else {
            render();
          }
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
    if (container) container.classList.add("is-hidden");
    if (backdrop) backdrop.classList.add("is-hidden");
    isExpanded = false;
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
