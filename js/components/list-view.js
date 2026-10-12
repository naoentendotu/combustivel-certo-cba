/**
 * Combustível Certo · Componente da Tela de Lista / Início (Mobile — início com Paginação de 10 em 10)
 */
const ListView = (() => {
  let container = null;
  let onSelectStationCallback = null;
  let onUseGpsCallback = null;
  let onFuelChangeCallback = null;

  let currentPage = 1;
  const PAGE_SIZE = 10;
  let lastParams = null;

  function init({
    containerId,
    onSelectStation,
    onUseGps,
    onFuelChange
  }) {
    container = document.getElementById(containerId);
    onSelectStationCallback = onSelectStation;
    onUseGpsCallback = onUseGps;
    onFuelChangeCallback = onFuelChange;
  }

  function render(params) {
    if (!container) return;
    if (params) lastParams = params;
    if (!lastParams) return;

    const {
      rows,
      bestStation,
      fuel,
      fuels,
      userPos,
      brlFormatter,
      numFormatter,
      anpDate
    } = lastParams;

    // 1. Header & Hero Escuro (Mobile — início)
    const fuelTabsHtml = fuels.map(f => {
      const isActive = f.id === fuel.id;
      return `<button
        data-fuel-id="${f.id}"
        class="fuel-tab-btn px-4 py-2 rounded-full font-bold text-xs transition cursor-pointer ${
          isActive
            ? 'bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300'
            : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700/80'
        }"
      >
        ${f.shortLabel}
      </button>`;
    }).join('');

    // Preço médio para calcular "vs. média"
    const validPrices = rows.map(r => r.price).filter(p => p != null);
    const avgPrice = validPrices.length ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : null;

    // Card do Menor Preço em Destaque
    let heroCardHtml = '';
    if (bestStation && bestStation.price != null) {
      const diffAvg = avgPrice ? avgPrice - bestStation.price : 0;
      const distStr = bestStation.dist != null ? `${numFormatter(bestStation.dist)} km` : 'Cuiabá';
      heroCardHtml = `
        <div class="mt-4 rounded-2xl bg-white p-4 sm:p-5 text-slate-900 shadow-md border border-slate-200/80">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Menor preço ${userPos ? 'perto de você' : 'em Cuiabá'}</span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0e7048] text-white font-extrabold text-[10px] uppercase shadow-xs">
              <i data-lucide="star" class="w-3 h-3 fill-amber-300 text-amber-300"></i>
              <span>Menor preço</span>
            </span>
          </div>
          <div class="mt-1 flex items-baseline justify-between gap-2">
            <div class="text-3xl sm:text-4xl font-black text-slate-950 tabular-nums">
              ${brlFormatter(bestStation.price)}
            </div>
            ${diffAvg > 0 ? `<div class="text-xs font-bold text-[#0e7048]">- ${brlFormatter(diffAvg)} vs. média</div>` : ''}
          </div>
          <div class="mt-1 font-bold text-sm text-slate-800 truncate">${bestStation.name}</div>
          <div class="text-xs text-slate-500 truncate">${bestStation.address} · ${distStr}</div>
        </div>
      `;
    }

    // Lista dos seguintes (Posições 2, 3, 4...) com Paginação de 10 em 10
    const otherStations = bestStation ? rows.filter(r => r.id !== bestStation.id) : rows;
    const totalItems = otherStations.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);
    const pageStations = otherStations.slice(startIdx, endIdx);

    const listItemsHtml = pageStations.map((r, idx) => {
      const position = startIdx + idx + 2;
      const distStr = r.dist != null ? `${numFormatter(r.dist)} km` : 'Cuiabá';
      return `
        <div
          data-station-click="${r.id}"
          class="flex items-center justify-between gap-3 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition px-2.5 sm:px-3 rounded-xl cursor-pointer"
        >
          <div class="w-6 shrink-0 text-slate-400 font-extrabold text-xs text-center">${position}</div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-sm text-slate-900 truncate">${r.name}</div>
            <div class="text-xs text-slate-500 truncate">${r.address} · ${distStr}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-base font-black text-slate-900 tabular-nums">
              ${r.price != null ? brlFormatter(r.price) : '<span class="text-xs text-slate-400">Sem preço</span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="min-h-full pb-20 bg-slate-50">
        <!-- Topo Escuro (Mobile — início) -->
        <header class="bg-[#091e26] text-white p-5 sm:p-6 pt-5 rounded-b-3xl shadow-lg">
          <div class="flex items-center justify-between gap-2 mb-4">
            <div class="flex items-center gap-2.5">
              <img src="assets/logo-icon.svg" class="w-8 h-8 rounded-xl shadow-md" alt="Combustível Certo" />
              <div class="flex items-baseline font-black text-lg tracking-tight leading-none">
                <span class="text-white">Combustível</span>
                <span class="text-[#f5b723] ml-1.5">Certo</span>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Cuiabá, MT
            </span>
          </div>

          <h1 class="text-2xl sm:text-3xl font-extrabold leading-tight text-white tracking-tight">
            O combustível mais barato, <span class="text-amber-400">perto de você.</span>
          </h1>

          <!-- Abas de Combustível -->
          <div id="listFuelTabs" class="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scroll-thin">
            ${fuelTabsHtml}
          </div>

          <!-- Botão Usar Minha Localização -->
          <button
            id="listGpsBtn"
            class="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0e7048] hover:bg-[#095436] active:scale-[0.99] text-white font-extrabold text-sm shadow-md transition cursor-pointer"
          >
            <i data-lucide="locate-fixed" class="w-4 h-4 text-white"></i>
            <span>Usar minha localização</span>
          </button>

          <!-- Card Destaque Menor Preço -->
          ${heroCardHtml}
        </header>

        <!-- Seção: Mais baratos perto de você -->
        <section class="p-4 sm:p-6 pt-5 max-w-xl mx-auto">
          <div class="flex items-center justify-between pb-2 mb-1 px-1">
            <h2 class="font-black text-sm text-slate-800">Mais baratos perto de você</h2>
            <span class="text-[11px] font-semibold text-slate-400">ANP · ${anpDate}</span>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs">
            ${listItemsHtml || '<p class="py-8 text-center text-sm text-slate-400">Nenhum posto encontrado.</p>'}

            <!-- Barra de Paginação da Lista (10 em 10 - Inquebrável em telas menores) -->
            ${totalItems > PAGE_SIZE ? `
              <div class="mt-3.5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 px-1 text-xs">
                <span class="text-slate-500 font-semibold text-[11px] whitespace-nowrap shrink-0">
                  <strong>${startIdx + 1}–${endIdx}</strong> de <strong>${totalItems}</strong><span class="hidden sm:inline"> postos</span>
                </span>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    id="listPrevBtn"
                    type="button"
                    title="Página anterior"
                    class="h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
                    ${currentPage === 1 ? 'disabled' : ''}
                  >
                    <i data-lucide="chevron-left" class="w-4 h-4"></i>
                    <span class="hidden sm:inline text-xs">Anterior</span>
                  </button>

                  <span class="h-8 px-2 sm:px-2.5 flex items-center justify-center font-extrabold text-slate-800 text-xs bg-slate-100 rounded-lg whitespace-nowrap">
                    ${currentPage} / ${totalPages}
                  </span>

                  <button
                    id="listNextBtn"
                    type="button"
                    title="Próxima página"
                    class="h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
                    ${currentPage === totalPages ? 'disabled' : ''}
                  >
                    <span class="hidden sm:inline text-xs">Próxima</span>
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        </section>
      </div>
    `;

    // Eventos
    container.querySelectorAll('.fuel-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = 1;
        if (typeof onFuelChangeCallback === 'function') {
          onFuelChangeCallback(btn.dataset.fuelId);
        }
      });
    });

    const gpsBtn = container.querySelector('#listGpsBtn');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        if (typeof onUseGpsCallback === 'function') {
          onUseGpsCallback();
        }
      });
    }

    container.querySelector('#listPrevBtn')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        render();
      }
    });

    container.querySelector('#listNextBtn')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        render();
      }
    });

    container.querySelectorAll('[data-station-click]').forEach(el => {
      el.addEventListener('click', () => {
        const stationId = el.dataset.stationClick;
        const station = rows.find(r => r.id === stationId);
        if (station && typeof onSelectStationCallback === 'function') {
          onSelectStationCallback(station);
        }
      });
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  return {
    init,
    render
  };
})();
