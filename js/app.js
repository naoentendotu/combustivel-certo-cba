/**
 * Combustível Certo · Orquestrador Principal do Aplicativo
 */
(() => {
  'use strict';

  // Chaves de armazenamento
  const PREFS_KEY = 'cc_prefs_v1';
  const ANP_KEY = 'cc_anp_v1';
  const ANP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const ANP_URL = location.protocol === 'file:' ? null : 'api/anp';

  // Formatadores
  const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Cálculo de Distância (Haversine em km)
  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // Estado da Aplicação
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const prefs = store.get(PREFS_KEY) || {};

  const state = {
    stations: [],
    prices: {},
    pricesWeek: '',
    pricesWeekId: '',
    fuel: FUELS.some(f => f.id === prefs.fuel) ? prefs.fuel : 'gasolina',
    vehicle: typeof prefs.vehicle === 'number' && typeof VEHICLES !== 'undefined' && VEHICLES[prefs.vehicle] ? prefs.vehicle : 1,
    sort: prefs.sort || 'price', // 'price' | 'dist' | 'both'
    userPos: null,
    activeId: null,
    currentView: 'map' // O MAPA É A PÁGINA INICIAL!
  };

  const savePrefs = () => store.set(PREFS_KEY, { fuel: state.fuel, vehicle: state.vehicle, sort: state.sort });

  function setVehicle(idx) {
    const i = parseInt(idx, 10);
    if (!isNaN(i) && typeof VEHICLES !== 'undefined' && VEHICLES[i]) {
      state.vehicle = i;
      savePrefs();
      render();
    }
  }

  // Normalização de Postos
  function normalizeStation(cnpj, razao, endereco, bairro, dist, lat, lng, mask) {
    lat = parseFloat(lat); lng = parseFloat(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || haversineKm(CUIABA, { lat, lng }) > 60) return null;
    const d = String(dist || '').trim().toUpperCase();
    return {
      id: 'anp-' + cnpj,
      name: razao.replace(/[\s.,–-]*\b(LTDA|EIRELI|EPP|ME|S\/A|S\.A)\.?$/i, '').trim(),
      brand: DIST_BRAND[d] || d || WHITE_LABEL.name,
      address: [endereco, bairro].filter(Boolean).join(' · '),
      lat,
      lng,
      gnv: mask.includes('n')
    };
  }

  // Mapeamento de Produto da ANP para ID de combustível
  const FUEL_BY_PRODUCT = {
    'GASOLINA COMUM': 'gasolina',
    'ETANOL': 'etanol',
    'DIESEL S10': 'diesel',
    'DIESEL S500': 'diesel',
    'GAS NATURAL VEICULAR': 'gnv'
  };

  // Carregamento de Preços da ANP
  async function loadPrices() {
    if (location.protocol === 'file:') return;
    try {
      const res = await fetch('api/precos?municipio=CUIABA&uf=MT&semanas=todas', { signal: AbortSignal.timeout(180000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!Array.isArray(j.registros)) return;

      const prices = {};
      for (const r of j.registros) {
        const fuelId = FUEL_BY_PRODUCT[r.produto];
        if (!fuelId || !r.cnpj) continue;
        const cur = (prices[r.cnpj] ||= {})[fuelId];
        if (!cur || r.dataColeta > cur.data || (r.dataColeta === cur.data && r.produto === 'DIESEL S10')) {
          prices[r.cnpj][fuelId] = {
            preco: r.preco,
            data: r.dataColeta,
            produto: r.produto,
            semana: r.semana
          };
        }
      }
      state.prices = prices;
      state.pricesWeek = j.semanaReferencia?.periodo || '';
      state.pricesWeekId = j.semanaReferencia?.id || '';
      render();
    } catch (err) {
      console.warn('[Combustível Certo] Preços da ANP indisponíveis:', err);
    }
  }

  // Cálculo e Ordenação dos Postos
  function compute() {
    const fuel = FUELS.find(f => f.id === state.fuel) || FUELS[0];
    const vehicle = (typeof VEHICLES !== 'undefined' ? VEHICLES[state.vehicle] : null) || { name: 'Padrão', tank: 50 };
    const tank = vehicle.tank;

    const rows = state.stations.map(s => {
      const cnpj = s.id.slice(4);
      const p = state.prices[cnpj]?.[fuel.id];
      const price = p?.preco ?? null;
      return {
        ...s,
        price,
        full: price != null ? price * tank : null,
        half: price != null ? (price * tank) / 2 : null,
        stale: !!p && p.semana !== state.pricesWeekId,
        priceDate: p ? String(p.data).split('-').reverse().join('/') : '',
        dist: state.userPos ? haversineKm(state.userPos, s) : null
      };
    });

    const byDist = (a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity);
    const byPrice = (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byDist(a, b);

    // Identifica com precisão o posto com o MENOR PREÇO real do combustível selecionado
    const withValidPrice = rows.filter(r => typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0);
    withValidPrice.sort(byPrice);
    const best = withValidPrice.find(r => !r.stale) || withValidPrice[0] || null;

    // Ordenação da lista de postos (menor preço, mais perto ou ambos combinados)
    let ranked;
    if (state.sort === 'dist') {
      ranked = [...rows].sort((a, b) => byDist(a, b) || byPrice(a, b));
    } else if (state.sort === 'both') {
      if (!state.userPos) {
        ranked = [...rows].sort(byPrice);
      } else {
        const sortedByPrice = [...rows].sort(byPrice);
        const priceRanks = new Map();
        sortedByPrice.forEach((r, idx) => priceRanks.set(r.id, idx));

        const sortedByDist = [...rows].sort(byDist);
        const distRanks = new Map();
        sortedByDist.forEach((r, idx) => distRanks.set(r.id, idx));

        ranked = [...rows].sort((a, b) => {
          const scoreA = (priceRanks.get(a.id) ?? 999) + (distRanks.get(a.id) ?? 999);
          const scoreB = (priceRanks.get(b.id) ?? 999) + (distRanks.get(b.id) ?? 999);
          return scoreA - scoreB || byPrice(a, b) || byDist(a, b);
        });
      }
    } else {
      ranked = [...rows].sort(byPrice);
    }

    return { rows: ranked, best, fuel, vehicle, vehicleIdx: state.vehicle };
  }

  // Renderização Central
  function render() {
    const { rows, best, fuel, vehicle, vehicleIdx } = compute();

    // 1. Atualiza Marcadores no Mapa
    MapView.renderMarkers(rows, best?.id, state.activeId, brl);

    // 2. Atualiza Bottom Sheet no Mapa (Mostra o posto ativo ou o de menor preço)
    const activeStation = (state.activeId ? rows.find(r => r.id === state.activeId) : null) || best;
    if (activeStation) {
      BottomSheet.update({
        active: activeStation,
        best: best,
        rows,
        sort: state.sort,
        fuel,
        vehicle,
        vehicleIdx,
        vehicles: typeof VEHICLES !== 'undefined' ? VEHICLES : [],
        onVehicleChange: setVehicle,
        userPos: state.userPos,
        brlFormatter: brl,
        numFormatter: num
      });
    }

    // 3. Atualiza Abas Flutuantes de Combustível no Mapa
    renderFloatingFuelTabs();

    // 4. Atualiza Tela de Lista (Mobile — início)
    ListView.render({
      rows,
      bestStation: best,
      fuel,
      fuels: FUELS,
      vehicle,
      vehicleIdx,
      vehicles: typeof VEHICLES !== 'undefined' ? VEHICLES : [],
      onVehicleChange: setVehicle,
      userPos: state.userPos,
      brlFormatter: brl,
      numFormatter: num,
      anpDate: ANP_SNAPSHOT_DATE
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Abas Flutuantes de Combustível sobre o Mapa
  function renderFloatingFuelTabs() {
    const bar = document.getElementById('mapFloatingFuels');
    if (!bar) return;

    bar.innerHTML = FUELS.map(f => {
      const isActive = f.id === state.fuel;
      return `<button
        data-floating-fuel="${f.id}"
        class="px-3.5 py-1.5 rounded-full text-xs font-bold transition shadow-md cursor-pointer ${
          isActive
            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-extrabold'
            : 'bg-white text-slate-800 hover:bg-slate-100'
        }"
      >
        ${f.shortLabel}
      </button>`;
    }).join('');

    bar.querySelectorAll('[data-floating-fuel]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.fuel = btn.dataset.floatingFuel;
        state.activeId = null; // Reseta posto ativo para focar no menor preço do combustível!
        savePrefs();
        render();
      });
    });
  }

  // Troca de Visão (Mapa vs. Lista vs. Dados)
  function setView(viewName) {
    state.currentView = viewName;
    const viewMap = document.getElementById('viewMap');
    const viewList = document.getElementById('viewList');
    const viewDados = document.getElementById('viewDados');

    if (viewMap) viewMap.classList.toggle('is-hidden', viewName !== 'map');
    if (viewList) viewList.classList.toggle('is-hidden', viewName !== 'list');
    if (viewDados) viewDados.classList.toggle('is-hidden', viewName !== 'dados');

    if (viewName === 'map') {
      MapView.invalidateSize();
    } else if (viewName === 'dados') {
      Modals.loadTabela();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Geolocation (GPS & Zoom na localização atual)
  function requestLocation(shouldZoom = true) {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }
    const gpsBtn = document.getElementById('floatingGpsBtn');
    if (gpsBtn) {
      gpsBtn.classList.add('is-loading');
    }

    // Se já conhecemos a posição do usuário, faz o zoom imediato sem esperar a rede
    if (shouldZoom && state.userPos) {
      MapView.focusLocation(state.userPos.lat, state.userPos.lng, 16);
      gpsBtn?.classList.add('is-active');
      setTimeout(() => gpsBtn?.classList.remove('is-active'), 1000);
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (gpsBtn) {
          gpsBtn.classList.remove('is-loading');
          gpsBtn.classList.add('is-active');
          setTimeout(() => gpsBtn.classList.remove('is-active'), 1500);
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        state.userPos = { lat, lng };
        MapView.updateUserLocation(lat, lng, pos.coords.accuracy || 300);
        if (shouldZoom) {
          MapView.focusLocation(lat, lng, 16);
        }
        render();
      },
      err => {
        if (gpsBtn) gpsBtn.classList.remove('is-loading');
        console.warn('GPS erro:', err.message);
        if (!state.userPos) {
          alert('Não foi possível obter sua localização exata. Verifique se o GPS está autorizado.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Inicialização
  function start() {
    // 1. Carrega postos embutidos
    state.stations = ANP_SNAPSHOT.map(r => normalizeStation(...r)).filter(Boolean);

    // 2. Inicializa o Mapa (PÁGINA INICIAL!)
    MapView.init('map', station => {
      state.activeId = station.id;
      MapView.setActivePin(station.id);
      MapView.focusLocation(station.lat, station.lng, 16);
      render();
    });

    // 3. Inicializa Bottom Sheet com callbacks completos
    BottomSheet.init({
      containerId: 'bottomSheet',
      backdropId: 'sheetBackdrop',
      onSelectStation: station => {
        state.activeId = station.id;
        MapView.setActivePin(station.id);
        MapView.focusLocation(station.lat, station.lng, 16);
        render();
      },
      onSortChange: sortKey => {
        state.sort = sortKey;
        if (sortKey === 'price' || sortKey === 'both') {
          state.activeId = null; // Destaca o de menor preço ao ordenar por menor preço ou custo-benefício
        }
        savePrefs();
        render();
      },
      onRequestGps: () => {
        requestLocation(false);
      },
      onVehicleChange: setVehicle
    });

    // 4. Inicializa Lista (Mobile — início)
    ListView.init({
      containerId: 'viewList',
      onSelectStation: station => {
        state.activeId = station.id;
        Navigation.switchTab('map');
        MapView.setActivePin(station.id);
        MapView.focusLocation(station.lat, station.lng, 16);
        render();
      },
      onUseGps: () => requestLocation(true),
      onVehicleChange: setVehicle,
      onFuelChange: fuelId => {
        state.fuel = fuelId;
        savePrefs();
        render();
      }
    });

    // 5. Inicializa Barra de Navegação (Mapa inicial por padrão)
    Navigation.init({
      defaultTab: 'map',
      onViewChange: setView
    });

    // 6. Inicializa Modais (Top 10 e Tabela ANP)
    Modals.init({
      onFocusStation: stationId => {
        const st = state.stations.find(s => s.id === stationId);
        if (st) {
          state.activeId = st.id;
          Navigation.switchTab('map');
          MapView.setActivePin(st.id);
          MapView.focusLocation(st.lat, st.lng, 16);
          render();
        }
      }
    });

    // 7. Botão GPS flutuante sobre o mapa (Zoom na localização atual)
    document.getElementById('floatingGpsBtn')?.addEventListener('click', () => {
      requestLocation(true);
    });

    // 8. Botão 10 Mais Baratos no cabeçalho/mapa
    document.getElementById('top10QuickBtn')?.addEventListener('click', () => {
      Modals.abrirTop10();
    });

    // 9. Renderiza estado inicial
    render();

    // 10. Carrega preços da ANP (em segundo plano)
    loadPrices();
  }

  // Executa ao carregar o DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
      start();
    });
  } else {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    start();
  }
})();
