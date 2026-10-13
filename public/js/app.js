/**
 * Combustível Certo · Orquestrador Principal do Aplicativo
 */
(() => {
  'use strict';

  // Chaves de armazenamento
  const PREFS_KEY = 'cc_prefs_v1';
  const GPS_HINT_KEY = 'cc_gps_hint_v1';
  const ANP_KEY = 'cc_anp_v1';
  const TREND_KEY = 'cc_tendencia_lida_v1'; // por combustível, a semana cujo aviso de tendência a pessoa já fechou
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

  // "Meu carro": um veículo com nome e tanque informados pela pessoa, sempre o último da lista
  const CUSTOM_IDX = VEHICLES.length;
  const validCar = (name, tank) => !!name && Number.isInteger(tank) && tank >= 1 && tank <= 200;
  if (prefs.custom && validCar(prefs.custom.name, prefs.custom.tank)) {
    VEHICLES.push({ name: String(prefs.custom.name).slice(0, 40), tank: prefs.custom.tank, custom: true });
  }

  const state = {
    stations: [],
    prices: {},
    registros: [],
    pricesWeek: '',
    pricesWeekId: '',
    pricesStatus: location.protocol === 'file:' ? 'offline' : 'loading', // 'loading' | 'ok' | 'error' | 'offline'
    fuel: FUELS.some(f => f.id === prefs.fuel) ? prefs.fuel : 'gasolina',
    vehicle: typeof prefs.vehicle === 'number' && typeof VEHICLES !== 'undefined' && VEHICLES[prefs.vehicle] ? prefs.vehicle : 1,
    hideNoPrice: prefs.hideNoPrice ?? true,
    sort: prefs.sort || 'price', // 'price' | 'dist' | 'both'
    userPos: null,
    activeId: null,
    currentView: 'map' // O MAPA É A PÁGINA INICIAL!
  };

  // Link compartilhado: ?posto=<cnpj>&combustivel=<id> abre o app naquele posto
  const link = new URLSearchParams(location.search);
  if (FUELS.some(f => f.id === link.get('combustivel'))) state.fuel = link.get('combustivel');
  if (/^\d{14}$/.test(link.get('posto') || '')) state.activeId = 'anp-' + link.get('posto');

  let centeredOnBest = false;

  const savePrefs = () => store.set(PREFS_KEY, { fuel: state.fuel, vehicle: state.vehicle, sort: state.sort, hideNoPrice: state.hideNoPrice, custom: VEHICLES[CUSTOM_IDX] || null });

  function setVehicle(idx) {
    const i = parseInt(idx, 10);
    if (i === -1) {
      render(); // devolve o seletor ao veículo atual
      return openCarDialog();
    }
    if (!isNaN(i) && typeof VEHICLES !== 'undefined' && VEHICLES[i]) {
      state.vehicle = i;
      savePrefs();
      render();
    }
  }

  function openCarDialog() {
    const car = VEHICLES[CUSTOM_IDX];
    document.getElementById('carroNome').value = car?.name || '';
    document.getElementById('carroTanque').value = car?.tank || '';
    document.getElementById('carroRemover').classList.toggle('hidden', !car);
    document.getElementById('modalCarro').classList.remove('hidden');
    document.getElementById('carroNome').focus();
  }

  const closeCarDialog = () => document.getElementById('modalCarro').classList.add('hidden');

  function bindCarDialog() {
    const modal = document.getElementById('modalCarro');
    document.getElementById('carroForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('carroNome').value.trim();
      const tank = Number(document.getElementById('carroTanque').value);
      if (!validCar(name, tank)) return UI.toast('Informe um nome e um tanque entre 1 e 200 litros.');
      VEHICLES[CUSTOM_IDX] = { name, tank, custom: true };
      state.vehicle = CUSTOM_IDX;
      savePrefs();
      closeCarDialog();
      render();
    });
    document.getElementById('carroRemover').addEventListener('click', () => {
      VEHICLES.length = CUSTOM_IDX;
      if (state.vehicle === CUSTOM_IDX) state.vehicle = 1;
      savePrefs();
      closeCarDialog();
      render();
    });
    document.getElementById('carroClose').addEventListener('click', closeCarDialog);
    modal.addEventListener('click', e => { if (e.target === modal) closeCarDialog(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCarDialog(); });
  }

  // Normalização de Postos
  function normalizeStation(cnpj, razao, endereco, bairro, dist, lat, lng, mask) {
    lat = parseFloat(lat); lng = parseFloat(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || haversineKm(CUIABA, { lat, lng }) > 60) return null;
    const d = String(dist || '').trim().toUpperCase();
    return {
      id: 'anp-' + cnpj,
      name: UI.titleCase(razao.replace(/[\s.,–-]*\b(LTDA|EIRELI|EPP|ME|S\/A|S\.A)\.?$/i, '').trim()),
      brand: DIST_BRAND[d] || UI.titleCase(d) || WHITE_LABEL.name,
      address: UI.titleCase([endereco, bairro].filter(Boolean).join(' · ')),
      bairro: UI.titleCase(bairro || ''),
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

  // Produto da ANP usado na tendência da semana de cada combustível
  const TREND_PRODUCT = { gasolina: 'GASOLINA COMUM', etanol: 'ETANOL', diesel: 'DIESEL S10' };

  // Carregamento de Preços da ANP
  async function loadPrices() {
    if (location.protocol === 'file:') return;
    state.pricesStatus = 'loading';
    render();
    try {
      const res = await fetch('api/precos?municipio=CUIABA&uf=MT&semanas=todas', { signal: AbortSignal.timeout(180000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!Array.isArray(j.registros)) throw new Error('resposta sem registros');

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
      state.registros = j.registros;
      state.pricesWeek = j.semanaReferencia?.periodo || '';
      state.pricesWeekId = j.semanaReferencia?.id || '';
      state.pricesStatus = 'ok';
      render();
      // Primeira carga: leva o mapa até o menor preço, se a pessoa ainda não escolheu um posto nem a localização
      const { best } = compute();
      if (best && !state.activeId && !state.userPos && !centeredOnBest) {
        centeredOnBest = true;
        MapView.focusLocation(best.lat, best.lng, 14);
      }
    } catch (err) {
      console.warn('[Combustível Certo] Preços da ANP indisponíveis:', err);
      state.pricesStatus = 'error';
      render();
    }
  }

  // Cálculo e Ordenação dos Postos
  function compute() {
    const fuel = FUELS.find(f => f.id === state.fuel) || FUELS[0];
    const vehicle = (typeof VEHICLES !== 'undefined' ? VEHICLES[state.vehicle] : null) || { name: 'Padrão', tank: 50 };
    const tank = vehicle.tank;

    const rows = state.stations.map(s => {
      const cnpj = s.id.slice(4);
      const doPosto = state.prices[cnpj];
      const p = doPosto?.[fuel.id];
      const flex = Calc.flex(doPosto?.gasolina?.preco, doPosto?.etanol?.preco, tank);
      if (flex) flex.datasDiferentes = doPosto.gasolina.semana !== doPosto.etanol.semana;
      const price = p?.preco ?? null;
      return {
        ...s,
        price,
        flex,
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

    if (state.hideNoPrice) ranked = ranked.filter(r => r.price != null);

    const trend = Calc.tendenciaSemana(state.registros, TREND_PRODUCT[fuel.id]);

    return { rows: ranked, best, fuel, vehicle, vehicleIdx: state.vehicle, trend };
  }

  // Renderização Central
  function render() {
    const { rows, best, fuel, vehicle, vehicleIdx, trend } = compute();

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
        hideNoPrice: state.hideNoPrice,
        fuel,
        vehicle,
        vehicleIdx,
        vehicles: typeof VEHICLES !== 'undefined' ? VEHICLES : [],
        onVehicleChange: setVehicle,
        userPos: state.userPos,
        brlFormatter: brl,
        numFormatter: num
      });
    } else {
      BottomSheet.hide();
    }
    renderMapStatus(rows.length, fuel);

    // Aviso da tendência: depois de fechado, só volta quando a ANP publicar outra semana
    const notice = trend && (store.get(TREND_KEY) || {})[fuel.id] !== state.pricesWeekId ? UI.trendNotice(trend, fuel.label, brl) : '';
    const mapNotice = document.getElementById('mapNotice');
    if (mapNotice) mapNotice.innerHTML = notice;

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
      week: state.pricesWeek,
      notice,
      sort: state.sort,
      hideNoPrice: state.hideNoPrice,
      status: state.pricesStatus
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function setFuel(fuelId) {
    state.fuel = fuelId;
    state.activeId = null; // volta o destaque para o menor preço do combustível escolhido
    savePrefs();
    render();
    // Troca suave: os preços do novo combustível entram com um fade
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of document.querySelectorAll('#viewList .page > .page-inner, #bottomSheet > *, .leaflet-marker-pane')) {
      el.animate({ opacity: [0, 1] }, { duration: 220, easing: 'ease' });
    }
  }

  // Seletor de combustível sobre o mapa
  function renderFloatingFuelTabs() {
    const bar = document.getElementById('mapFloatingFuels');
    if (!bar) return;
    bar.innerHTML = UI.fuelSeg(FUELS, state.fuel);
    bar.querySelectorAll('[data-fuel-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        setFuel(btn.dataset.fuelId);
      });
    });
  }

  // Compartilha o preço do posto com um link que abre o app nele
  function shareStation(station) {
    const fuel = FUELS.find(f => f.id === state.fuel) || FUELS[0];
    const url = `${location.origin}${location.pathname}?posto=${station.id.slice(4)}&combustivel=${fuel.id}`;
    const text = `${fuel.label} a ${brl(station.price)} · ${station.name}${station.bairro ? ', ' + station.bairro : ''}. Coleta da ANP em ${station.priceDate}.`;
    if (navigator.share) navigator.share({ title: 'Combustível Certo', text, url }).catch(() => {}); // a pessoa pode fechar a janela de compartilhar
    else window.open('https://wa.me/?text=' + encodeURIComponent(`${text} ${url}`), '_blank', 'noopener');
  }

  const showHistory = station => Modals.abrirHistorico(station, state.fuel, state.registros);

  function showStationsWithoutPrice() {
    state.hideNoPrice = false;
    savePrefs();
    render();
  }

  // Quando não há posto para mostrar, o mapa explica o motivo e oferece a saída
  function renderMapStatus(total, fuel) {
    const el = document.getElementById('mapStatus');
    if (!el) return;
    if (total) return el.classList.add('hidden');

    const showAll = state.hideNoPrice ? '<div><button type="button" class="btn btn-quiet btn-sm" data-status="all">Mostrar postos sem preço</button></div>' : '';
    const byStatus = {
      loading: '<strong>Carregando os preços da ANP…</strong>',
      error: '<strong>Não foi possível carregar os preços.</strong>Confira a conexão e tente de novo.<div><button type="button" class="btn btn-quiet btn-sm" data-status="retry">Tentar de novo</button></div>',
      offline: '<strong>Os preços precisam do servidor.</strong>Rode "node server.js" e abra http://localhost:8080.' + showAll,
      ok: `<strong>Nenhum posto com preço de ${UI.esc(fuel.label.toLowerCase())}.</strong>A pesquisa da ANP visita só uma parte dos postos a cada semana.` + showAll
    };
    el.innerHTML = byStatus[state.pricesStatus] || byStatus.ok;
    el.classList.remove('hidden');
    el.querySelector('[data-status="all"]')?.addEventListener('click', showStationsWithoutPrice);
    el.querySelector('[data-status="retry"]')?.addEventListener('click', loadPrices);
  }

  // Troca de Visão (Mapa vs. Lista)
  function setView(viewName) {
    state.currentView = viewName;
    const viewMap = document.getElementById('viewMap');
    const viewList = document.getElementById('viewList');

    if (viewMap) viewMap.classList.toggle('is-hidden', viewName !== 'map');
    if (viewList) viewList.classList.toggle('is-hidden', viewName !== 'list');

    if (viewName === 'map') MapView.invalidateSize();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Geolocation (GPS & Zoom na localização atual)
  function requestLocation(shouldZoom = true) {
    if (!navigator.geolocation) {
      UI.toast('Este navegador não informa a localização.');
      return;
    }
    const gpsBtn = document.getElementById('floatingGpsBtn');
    if (gpsBtn) {
      gpsBtn.classList.remove('is-hint');
      gpsBtn.classList.add('is-loading');
    }
    store.set(GPS_HINT_KEY, true);

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
          UI.toast(err.code === 1 ? 'Localização bloqueada. Libere o acesso nas permissões do navegador.' : 'Não foi possível obter a sua localização. Tente de novo.');
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
      onHideNoPriceChange: hide => {
        state.hideNoPrice = hide;
        savePrefs();
        render();
      },
      onRequestGps: () => {
        requestLocation(false);
      },
      onShowHistory: showHistory,
      onShare: shareStation,
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
      onShowAll: showStationsWithoutPrice,
      onRetry: loadPrices,
      onShowHistory: showHistory,
      onShare: shareStation,
      onFuelChange: setFuel
    });

    // 5. Inicializa Barra de Navegação (Mapa inicial por padrão)
    Navigation.init({
      defaultTab: 'map',
      onViewChange: setView
    });

    // 6. Inicializa Modais (Top 10 e histórico de preço)
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

    bindCarDialog();

    // 7. Botão GPS flutuante sobre o mapa (Zoom na localização atual)
    document.getElementById('floatingGpsBtn')?.addEventListener('click', () => {
      requestLocation(true);
    });
    // Na primeira visita, o botão pisca até a pessoa pedir a localização
    if (!store.get(GPS_HINT_KEY)) {
      document.getElementById('floatingGpsBtn')?.classList.add('is-hint');
    }

    // Copiar o endereço de um posto e fechar o aviso da tendência (no mapa ou na lista)
    document.addEventListener('click', e => {
      const copiar = e.target.closest('[data-copiar]');
      if (copiar) {
        if (!navigator.clipboard) return UI.toast('Este navegador não permite copiar.');
        return navigator.clipboard.writeText(copiar.dataset.copiar).then(() => UI.toast('Endereço copiado.'), () => UI.toast('Não foi possível copiar o endereço.'));
      }
      if (!e.target.closest('[data-fechar-aviso]')) return;
      store.set(TREND_KEY, { ...store.get(TREND_KEY), [state.fuel]: state.pricesWeekId });
      render();
    });

    // 8. Botão 10 Mais Baratos no cabeçalho/mapa
    document.getElementById('top10QuickBtn')?.addEventListener('click', () => {
      Modals.abrirTop10(state.fuel);
    });

    // No desktop a lista fica ao lado do mapa: ao cruzar essa largura o mapa muda de tamanho
    window.matchMedia('(min-width: 1024px)').addEventListener('change', () => MapView.invalidateSize());

    // 9. Renderiza estado inicial
    render();
    // Link compartilhado: o mapa abre no posto do link
    const linked = state.stations.find(s => s.id === state.activeId);
    if (linked) {
      centeredOnBest = true;
      MapView.focusLocation(linked.lat, linked.lng, 16);
    }

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
