/**
 * Combustível Certo · Orquestrador Principal do Aplicativo
 */
(() => {
  "use strict";

  const PREFS_KEY = "cc_prefs_v1";
  const GPS_HINT_KEY = "cc_gps_hint_v1";
  const ANP_KEY = "cc_anp_v1";
  const TOUR_KEY = "cc_tutorial_visto_v1";
  const TREND_KEY = "cc_tendencia_lida_v1"; // por combustível, a semana cujo aviso de tendência a pessoa já fechou
  const DISP_KEY = "cc_aparelho_v1"; // id aleatório do aparelho: só separa quem confirma de quem informou
  const ANP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const ANP_URL = location.protocol === "file:" ? null : "api/anp";

  const brl = (n) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (n, d = 1) =>
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  const plain = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  function haversineKm(a, b) {
    const R = 6371,
      rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad,
      dLng = (b.lng - a.lng) * rad;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  const store = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };
  const prefs = store.get(PREFS_KEY) || {};

  // "Meu carro": um veículo com nome e tanque informados pela pessoa, sempre o último da lista
  const CUSTOM_IDX = VEHICLES.length;
  const validCar = (name, tank) =>
    !!name && Number.isInteger(tank) && tank >= 1 && tank <= 200;
  if (prefs.custom && validCar(prefs.custom.name, prefs.custom.tank)) {
    VEHICLES.push({
      name: String(prefs.custom.name).slice(0, 40),
      tank: prefs.custom.tank,
      custom: true,
    });
  }

  const state = {
    stations: [],
    prices: {},
    contribs: {}, // preços informados pelos usuários: { cnpj: { fuel: { preco, ts, estado } } }
    registros: [],
    pricesWeek: "",
    pricesWeekId: "",
    pricesStatus: location.protocol === "file:" ? "offline" : "loading", // 'loading' | 'ok' | 'error' | 'offline'
    fuel: FUELS.some((f) => f.id === prefs.fuel) ? prefs.fuel : "gasolina",
    vehicle:
      typeof prefs.vehicle === "number" &&
      typeof VEHICLES !== "undefined" &&
      VEHICLES[prefs.vehicle]
        ? prefs.vehicle
        : 1,
    hideNoPrice: prefs.hideNoPrice ?? true,
    sort: prefs.sort || "price", // 'price' | 'dist' | 'both'
    city: CITIES.some((c) => c.id === prefs.city) ? prefs.city : "", // '' = as duas cidades
    userPos: null,
    activeId: null,
    currentView: "map",
  };

  // Link compartilhado: ?posto=<cnpj>&combustivel=<id> abre o app naquele posto
  const link = new URLSearchParams(location.search);
  if (FUELS.some((f) => f.id === link.get("combustivel")))
    state.fuel = link.get("combustivel");
  if (/^\d{14}$/.test(link.get("posto") || "")) {
    state.activeId = "anp-" + link.get("posto");
    state.city = ""; // o posto do link pode ser de qualquer uma das cidades
  }

  let centeredOnBest = false;

  const savePrefs = () =>
    store.set(PREFS_KEY, {
      fuel: state.fuel,
      vehicle: state.vehicle,
      sort: state.sort,
      hideNoPrice: state.hideNoPrice,
      city: state.city,
      custom: VEHICLES[CUSTOM_IDX] || null,
    });

  function setVehicle(idx) {
    const i = parseInt(idx, 10);
    if (i === -1) {
      render(); // devolve o seletor ao veículo atual
      return openCarDialog();
    }
    if (!isNaN(i) && typeof VEHICLES !== "undefined" && VEHICLES[i]) {
      state.vehicle = i;
      savePrefs();
      render();
    }
  }

  function openCarDialog() {
    const car = VEHICLES[CUSTOM_IDX];
    document.getElementById("carroNome").value = car?.name || "";
    document.getElementById("carroTanque").value = car?.tank || "";
    document.getElementById("carroRemover").classList.toggle("hidden", !car);
    document.getElementById("modalCarro").classList.remove("hidden");
    document.getElementById("carroNome").focus();
  }

  const closeCarDialog = () =>
    document.getElementById("modalCarro").classList.add("hidden");

  function bindCarDialog() {
    const modal = document.getElementById("modalCarro");
    document.getElementById("carroForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("carroNome").value.trim();
      const tank = Number(document.getElementById("carroTanque").value);
      if (!validCar(name, tank))
        return UI.toast("Informe um nome e um tanque entre 1 e 200 litros.");
      VEHICLES[CUSTOM_IDX] = { name, tank, custom: true };
      state.vehicle = CUSTOM_IDX;
      savePrefs();
      closeCarDialog();
      render();
    });
    document.getElementById("carroRemover").addEventListener("click", () => {
      VEHICLES.length = CUSTOM_IDX;
      if (state.vehicle === CUSTOM_IDX) state.vehicle = 1;
      savePrefs();
      closeCarDialog();
      render();
    });
    document
      .getElementById("carroClose")
      .addEventListener("click", closeCarDialog);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeCarDialog();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCarDialog();
    });
  }

  // O menu de cidade abre logo abaixo do botão que o chamou (o do mapa ou o da lista)
  function bindCityMenu() {
    const menu = document.getElementById("cityMenu");
    if (!menu) return;
    let origem = null;
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest('[popovertarget="cityMenu"]');
        if (btn) origem = btn;
      },
      true,
    );
    menu.addEventListener("toggle", (e) => {
      if (e.newState !== "open" || !origem?.isConnected) return;
      const r = origem.getBoundingClientRect();
      menu.style.left =
        Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = r.bottom + 6 + "px";
    });
    menu.addEventListener("click", (e) => {
      const opcao = e.target.closest("[data-city]");
      if (opcao) toggleCity(opcao.dataset.city); // o menu fica aberto para marcar a outra
    });
  }

  function normalizeStation(
    cnpj,
    razao,
    endereco,
    bairro,
    dist,
    lat,
    lng,
    mask,
    city,
  ) {
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      haversineKm(CUIABA, { lat, lng }) > 60
    )
      return null;
    const d = String(dist || "")
      .trim()
      .toUpperCase();
    return {
      id: "anp-" + cnpj,
      name: UI.titleCase(
        razao
          .replace(/[\s.,–-]*\b(LTDA|EIRELI|EPP|ME|S\/A|S\.A)\.?$/i, "")
          .trim(),
      ),
      brand: DIST_BRAND[d] || UI.titleCase(d) || WHITE_LABEL.name,
      address: UI.titleCase([endereco, bairro].filter(Boolean).join(" · ")),
      bairro: UI.titleCase(bairro || ""),
      city: city.id,
      cityLabel: city.label,
      lat,
      lng,
      gnv: mask.includes("n"),
    };
  }

  const FUEL_BY_PRODUCT = {
    "GASOLINA COMUM": "gasolina",
    ETANOL: "etanol",
    "DIESEL S10": "diesel",
    "DIESEL S500": "diesel",
    "GAS NATURAL VEICULAR": "gnv",
  };

  // Produto da ANP usado na tendência da semana de cada combustível
  const TREND_PRODUCT = {
    gasolina: "GASOLINA COMUM",
    etanol: "ETANOL",
    diesel: "DIESEL S10",
  };

  async function loadPrices() {
    if (location.protocol === "file:") return;
    state.pricesStatus = "loading";
    render();
    try {
      const res = await fetch("api/precos?uf=MT&semanas=todas", {
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (!Array.isArray(j.registros))
        throw new Error("resposta sem registros");

      const prices = {};
      for (const r of j.registros) {
        const fuelId = FUEL_BY_PRODUCT[r.produto];
        if (!fuelId || !r.cnpj) continue;
        const cur = (prices[r.cnpj] ||= {})[fuelId];
        if (
          !cur ||
          r.dataColeta > cur.data ||
          (r.dataColeta === cur.data && r.produto === "DIESEL S10")
        ) {
          prices[r.cnpj][fuelId] = {
            preco: r.preco,
            data: r.dataColeta,
            produto: r.produto,
            semana: r.semana,
          };
        }
      }
      state.prices = prices;
      state.registros = j.registros;
      state.pricesWeek = j.semanaReferencia?.periodo || "";
      state.pricesWeekId = j.semanaReferencia?.id || "";
      state.pricesStatus = "ok";
      render();
      // Primeira carga: leva o mapa até o menor preço, se a pessoa ainda não escolheu um posto nem a localização
      const { best } = compute();
      if (best && !state.activeId && !state.userPos && !centeredOnBest) {
        centeredOnBest = true;
        MapView.focusLocation(best.lat, best.lng, 14);
      }
      if (best) setTimeout(startTour, 800);
    } catch (err) {
      console.warn("[Combustível Certo] Preços da ANP indisponíveis:", err);
      state.pricesStatus = "error";
      render();
    }
  }

  // Tutorial da primeira visita. Num link compartilhado fica para a próxima, para não tirar a pessoa do posto do link
  function startTour(again = false) {
    if (!again && (store.get(TOUR_KEY) || state.activeId)) return;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const docked = () => matchMedia("(min-width: 1024px)").matches;
    const sheet = async (pos) => {
      if (!docked()) {
        BottomSheet.snapTo(pos);
        await wait(450);
      }
    };
    let movedActive = false;

    Navigation.switchTab("map");
    Tour.start(
      [
        {
          target: ".map-pin-best",
          title: "O menor preço fica em verde",
          text: "Cada etiqueta no mapa é um posto com o preço do litro. A verde é o mais barato agora. Toque em qualquer uma para ver o posto.",
          prep: async () => {
            await sheet("peek");
            const { best } = compute();
            if (!best) return false;
            MapView.focusLocation(best.lat, best.lng, 14);
            await wait(700);
          },
        },
        {
          target: "#bottomSheet .hint",
          title: "Etanol ou gasolina?",
          text: "Carro flex? Toque aqui e veja o que compensa mais neste posto: quanto você economiza por km e no tanque cheio.",
          below: true,
          // O botão só existe em posto com os dois preços: se o do card não tiver, mostra o mais barato que tem
          prep: async () => {
            await sheet("peek");
            if (document.querySelector("#bottomSheet .hint")) return;
            if (state.fuel !== "gasolina" && state.fuel !== "etanol")
              return false;
            const flex = compute().rows.find((r) => r.flex && r.price != null);
            if (!flex) return false;
            state.activeId = flex.id;
            movedActive = true;
            render();
          },
          open: (btn) =>
            document
              .getElementById(btn.getAttribute("popovertarget"))
              ?.showPopover(),
        },
        {
          target: "#bottomSheet .summary-actions",
          title: "Vá até o posto",
          text:
            "Traçar rota abre o caminho no seu app de mapas. Ao lado ficam o histórico de preço e o compartilhar." +
            (docked()
              ? ""
              : " Puxe o card para cima para ver todos os postos."),
          prep: () => sheet("peek"),
        },
        {
          target: "#mapFloatingFuels",
          title: "Escolha o combustível",
          text: "Gasolina, etanol ou diesel: os preços do mapa e do card mudam juntos.",
        },
        {
          target: "#mapCityBtn",
          title: "Escolha a cidade",
          text: "Veja os postos de Cuiabá, de Várzea Grande ou das duas cidades juntas.",
        },
        {
          target: "#bottomSheet .veh-line",
          title: "O seu carro",
          text: "Escolha o seu carro, ou adicione o tamanho do tanque dele, para o custo de encher o tanque ficar certo.",
          prep: async () => {
            await sheet("full");
            document
              .querySelector("#bottomSheet .veh-line")
              ?.scrollIntoView({ block: "center" });
          },
        },
        {
          target: "#floatingGpsBtn",
          title: "Postos perto de você",
          text: "Toque aqui para o mapa ir até você. Com a localização ligada, cada posto mostra a distância e a lista ordena pelos mais perto.",
          prep: () => sheet("peek"),
        },
      ],
      () => {
        store.set(TOUR_KEY, true);
        if (movedActive) {
          state.activeId = null;
          render();
        }
        // O tutorial deixa o mapa no posto mais barato: termina levando a pessoa de volta para onde ela está
        if (state.userPos && haversineKm(CUIABA, state.userPos) <= 60) {
          MapView.focusLocation(state.userPos.lat, state.userPos.lng, 15);
        }
      },
    );
  }

  function compute() {
    const fuel = FUELS.find((f) => f.id === state.fuel) || FUELS[0];
    const vehicle = (typeof VEHICLES !== "undefined"
      ? VEHICLES[state.vehicle]
      : null) || { name: "Padrão", tank: 50 };
    const tank = vehicle.tank;

    const stations = state.city
      ? state.stations.filter((s) => s.city === state.city)
      : state.stations;
    const rows = stations.map((s) => {
      const cnpj = s.id.slice(4);
      const doPosto = state.prices[cnpj];
      const p = doPosto?.[fuel.id];
      const flex = Calc.flex(
        doPosto?.gasolina?.preco,
        doPosto?.etanol?.preco,
        tank,
      );
      if (flex)
        flex.datasDiferentes =
          doPosto.gasolina.semana !== doPosto.etanol.semana;
      const price = p?.preco ?? null;
      return {
        ...s,
        cityTag: state.city ? "" : s.cityLabel, // com as duas cidades na tela, cada posto diz de qual é
        price,
        flex,
        full: price != null ? price * tank : null,
        half: price != null ? (price * tank) / 2 : null,
        stale: !!p && p.semana !== state.pricesWeekId,
        priceDate: p ? String(p.data).split("-").reverse().join("/") : "",
        dist: state.userPos ? haversineKm(state.userPos, s) : null,
        contrib: state.contribs[cnpj]?.[fuel.id] || null,
      };
    });

    const byDist = (a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity);
    const byPrice = (a, b) =>
      (a.price ?? Infinity) - (b.price ?? Infinity) || byDist(a, b);

    const withValidPrice = rows.filter(
      (r) =>
        typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0,
    );
    withValidPrice.sort(byPrice);
    const best =
      withValidPrice.find((r) => !r.stale) || withValidPrice[0] || null;

    let ranked;
    if (state.sort === "dist") {
      ranked = [...rows].sort((a, b) => byDist(a, b) || byPrice(a, b));
    } else if (state.sort === "both") {
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
          const scoreA =
            (priceRanks.get(a.id) ?? 999) + (distRanks.get(a.id) ?? 999);
          const scoreB =
            (priceRanks.get(b.id) ?? 999) + (distRanks.get(b.id) ?? 999);
          return scoreA - scoreB || byPrice(a, b) || byDist(a, b);
        });
      }
    } else {
      ranked = [...rows].sort(byPrice);
    }

    if (state.hideNoPrice) ranked = ranked.filter((r) => r.price != null);

    const daCidade = state.city
      ? state.registros.filter((r) => plain(r.municipio) === plain(state.city))
      : state.registros;
    const trend = Calc.tendenciaSemana(daCidade, TREND_PRODUCT[fuel.id]);

    return {
      rows: ranked,
      best,
      fuel,
      vehicle,
      vehicleIdx: state.vehicle,
      trend,
    };
  }

  const placeLabel = () =>
    CITIES.find((c) => c.id === state.city)?.label ||
    CITIES.map((c) => c.label).join(" e ");

  // Botões de cidade (no mapa e na lista) e o menu com as duas cidades, que podem ficar marcadas juntas
  function renderCityControls() {
    const rotulo = "Cidades: " + placeLabel();
    document.querySelectorAll(".city-btn").forEach((btn) => {
      btn.classList.toggle("is-filtered", !!state.city);
      btn.setAttribute("aria-label", rotulo);
      btn.title = rotulo;
    });
    const menu = document.getElementById("cityMenu");
    if (menu) {
      menu.innerHTML = CITIES.map(
        (c) =>
          `<button type="button" role="menuitemcheckbox" data-city="${c.id}" aria-checked="${!state.city || c.id === state.city}">${UI.icon("check")}<span>${UI.esc(c.label)}</span></button>`,
      ).join("");
    }
  }

  // Liga ou desliga uma cidade; pelo menos uma fica sempre marcada
  function toggleCity(id) {
    const outra = CITIES.find((c) => c.id !== id).id;
    if (!state.city)
      state.city = outra; // as duas marcadas: desmarca esta
    else if (state.city === id)
      return; // é a única marcada: continua
    else state.city = ""; // marca a que faltava
    state.activeId = null;
    savePrefs();
    render();
    const c = CITIES.find((x) => x.id === state.city);
    if (c) MapView.focusLocation(c.lat, c.lng, 13);
    else
      MapView.focusLocation(
        (CITIES[0].lat + CITIES[1].lat) / 2,
        (CITIES[0].lng + CITIES[1].lng) / 2,
        12,
      );
  }

  function render() {
    const { rows, best, fuel, vehicle, vehicleIdx, trend } = compute();
    const place = placeLabel();

    MapView.renderMarkers(rows, best?.id, state.activeId, brl);

    const activeStation =
      (state.activeId ? rows.find((r) => r.id === state.activeId) : null) ||
      best;
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
        vehicles: typeof VEHICLES !== "undefined" ? VEHICLES : [],
        onVehicleChange: setVehicle,
        userPos: state.userPos,
        place,
        brlFormatter: brl,
        numFormatter: num,
      });
    } else {
      BottomSheet.hide();
    }
    renderMapStatus(rows.length, fuel);

    // Aviso da tendência: depois de fechado, só volta quando a ANP publicar outra semana
    const notice =
      trend && (store.get(TREND_KEY) || {})[fuel.id] !== state.pricesWeekId
        ? UI.trendNotice(trend, fuel.label, brl, place)
        : "";
    const mapNotice = document.getElementById("mapNotice");
    if (mapNotice) mapNotice.innerHTML = notice;

    renderFloatingFuelTabs();

    ListView.render({
      rows,
      bestStation: best,
      fuel,
      fuels: FUELS,
      vehicle,
      vehicleIdx,
      vehicles: typeof VEHICLES !== "undefined" ? VEHICLES : [],
      onVehicleChange: setVehicle,
      userPos: state.userPos,
      brlFormatter: brl,
      numFormatter: num,
      week: state.pricesWeek,
      place,
      notice,
      sort: state.sort,
      hideNoPrice: state.hideNoPrice,
      status: state.pricesStatus,
    });
    renderCityControls();

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function setFuel(fuelId) {
    state.fuel = fuelId;
    state.activeId = null; // volta o destaque para o menor preço do combustível escolhido
    savePrefs();
    render();
    // Troca suave: os preços do novo combustível entram com um fade
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const el of document.querySelectorAll(
      "#viewList .page > .page-inner, #bottomSheet > *, .leaflet-marker-pane",
    )) {
      el.animate({ opacity: [0, 1] }, { duration: 220, easing: "ease" });
    }
  }

  function renderFloatingFuelTabs() {
    const bar = document.getElementById("mapFloatingFuels");
    if (!bar) return;
    bar.innerHTML = UI.fuelSeg(FUELS, state.fuel);
    bar.querySelectorAll("[data-fuel-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setFuel(btn.dataset.fuelId);
      });
    });
  }

  // Compartilha o preço do posto com um link que abre o app nele
  function shareStation(station) {
    const fuel = FUELS.find((f) => f.id === state.fuel) || FUELS[0];
    const url = `${location.origin}${location.pathname}?posto=${station.id.slice(4)}&combustivel=${fuel.id}`;
    const text = `${fuel.label} a ${brl(station.price)} · ${station.name}${station.bairro ? ", " + station.bairro : ""}. Coleta da ANP em ${station.priceDate}.`;
    if (navigator.share)
      navigator
        .share({ title: "Combustível Certo", text, url })
        .catch(() => {});
    // a pessoa pode fechar a janela de compartilhar
    else
      window.open(
        "https://wa.me/?text=" + encodeURIComponent(`${text} ${url}`),
        "_blank",
        "noopener",
      );
  }

  async function loadContribs() {
    if (location.protocol === "file:") return;
    try {
      const res = await fetch("api/contribuicoes");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.contribs = await res.json();
      render();
    } catch (err) {
      console.warn("[Combustível Certo] Preços de usuários indisponíveis:", err);
    }
  }

  // Informar preço: digitado ou lido da foto; confirmar = enviar o mesmo valor pendente
  let reportStation = null,
    reportOcr = false;
  const reportField = (id) => document.getElementById("informar-" + id);
  const reportStatus = (t) =>
    (document.getElementById("informarStatus").textContent = t);
  const closeReportDialog = () =>
    document.getElementById("modalInformar").classList.add("hidden");

  function openReportDialog(station, confirmar) {
    if (confirmar && station.contrib)
      return sendReport(station, { [state.fuel]: station.contrib.preco });
    reportStation = station;
    reportOcr = false;
    FUELS.forEach((f) => (reportField(f.id).value = ""));
    document.getElementById("informarPosto").textContent = station.name;
    reportStatus(
      "Você precisa estar no posto. O preço aparece como confirmado quando outra pessoa informar o mesmo valor.",
    );
    document.getElementById("modalInformar").classList.remove("hidden");
  }

  const posicaoAtual = () =>
    new Promise((ok, falha) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(ok, falha, {
            enableHighAccuracy: true,
            timeout: 15000,
          })
        : falha(new Error("sem GPS")),
    );

  async function sendReport(station, precos, ocr = false) {
    let disp = store.get(DISP_KEY);
    if (!disp) store.set(DISP_KEY, (disp = crypto.randomUUID()));
    let pos;
    try {
      pos = await posicaoAtual();
    } catch {
      return UI.toast("Ative a localização: o preço só pode ser informado no posto.");
    }
    try {
      const res = await fetch("api/contribuicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: station.id.slice(4),
          precos,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          disp,
          ocr,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.erro || "HTTP " + res.status);
      closeReportDialog();
      UI.toast(
        Object.values(j).some((e) => e?.estado === "confirmado")
          ? "Obrigado! Preço confirmado."
          : "Obrigado! O preço aparece confirmado quando outra pessoa informar o mesmo valor.",
      );
      loadContribs();
    } catch (err) {
      UI.toast("Não foi possível enviar: " + err.message);
    }
  }

  // Tesseract.js só é baixado quando alguém escolhe uma foto
  let tesseract = null;
  const loadTesseract = () =>
    (tesseract ||= new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = () => ok(window.Tesseract);
      s.onerror = () => {
        tesseract = null;
        falha(new Error("não carregou o leitor de foto"));
      };
      document.head.append(s);
    }));

  async function readPhoto(file) {
    reportStatus("Lendo a foto…");
    try {
      const worker = await (await loadTesseract()).createWorker("eng");
      await worker.setParameters({ tessedit_char_whitelist: "0123456789.,R$ " });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const lidos = Calc.precosDaFoto(data.text);
      if (!lidos.length)
        return reportStatus("Não achamos preços na foto. Digite os valores.");
      // A placa não diz qual linha é qual combustível: preenche na ordem e a pessoa corrige
      FUELS.filter((f) => !reportField(f.id).value).forEach((f, i) => {
        if (lidos[i] != null) reportField(f.id).value = lidos[i];
      });
      reportOcr = true;
      reportStatus("Confira cada valor e o combustível: a leitura da foto pode errar.");
    } catch (err) {
      reportStatus("Não foi possível ler a foto (" + err.message + "). Digite os valores.");
    }
  }

  function bindReportDialog() {
    const modal = document.getElementById("modalInformar");
    document.getElementById("informarForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const precos = {};
      for (const f of FUELS) {
        const v = String(reportField(f.id).value || "").replace(",", ".");
        if (v) precos[f.id] = Number(v);
      }
      if (!Object.keys(precos).length)
        return UI.toast("Informe pelo menos um preço.");
      sendReport(reportStation, precos, reportOcr);
    });
    document.getElementById("informarFoto").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = ""; // permite escolher a mesma foto de novo
      if (file) readPhoto(file);
    });
    document
      .getElementById("informarClose")
      .addEventListener("click", closeReportDialog);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeReportDialog();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeReportDialog();
    });
  }

  const showHistory = (station) =>
    Modals.abrirHistorico(station, state.fuel, state.registros);

  function showStationsWithoutPrice() {
    state.hideNoPrice = false;
    savePrefs();
    render();
  }

  // Quando não há posto para mostrar, o mapa explica o motivo e oferece a saída
  function renderMapStatus(total, fuel) {
    const el = document.getElementById("mapStatus");
    if (!el) return;
    if (total) return el.classList.add("hidden");

    const showAll = state.hideNoPrice
      ? '<div><button type="button" class="btn btn-quiet btn-sm" data-status="all">Mostrar postos sem preço</button></div>'
      : "";
    const byStatus = {
      loading: "<strong>Carregando os preços da ANP…</strong>",
      error:
        '<strong>Não foi possível carregar os preços.</strong>Confira a conexão e tente de novo.<div><button type="button" class="btn btn-quiet btn-sm" data-status="retry">Tentar de novo</button></div>',
      offline:
        '<strong>Os preços precisam do servidor.</strong>Rode "node server.js" e abra http://localhost:8080.' +
        showAll,
      ok:
        `<strong>Nenhum posto com preço de ${UI.esc(fuel.label.toLowerCase())}.</strong>A pesquisa da ANP visita só uma parte dos postos a cada semana.` +
        showAll,
    };
    el.innerHTML = byStatus[state.pricesStatus] || byStatus.ok;
    el.classList.remove("hidden");
    el.querySelector('[data-status="all"]')?.addEventListener(
      "click",
      showStationsWithoutPrice,
    );
    el.querySelector('[data-status="retry"]')?.addEventListener(
      "click",
      loadPrices,
    );
  }

  function setView(viewName) {
    state.currentView = viewName;
    const viewMap = document.getElementById("viewMap");
    const viewList = document.getElementById("viewList");

    if (viewMap) viewMap.classList.toggle("is-hidden", viewName !== "map");
    if (viewList) viewList.classList.toggle("is-hidden", viewName !== "list");
    document
      .getElementById("viewHelp")
      ?.classList.toggle("is-hidden", viewName !== "help");

    if (viewName === "map") MapView.invalidateSize();

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  // auto: pedido feito ao abrir o site, sem a pessoa tocar em nada. Não mostra aviso se ela recusar
  // e só leva o mapa até ela se estiver na região de Cuiabá.
  function requestLocation(shouldZoom = true, { auto = false } = {}) {
    if (!navigator.geolocation) {
      if (!auto) UI.toast("Este navegador não informa a localização.");
      return;
    }
    const gpsBtn = document.getElementById("floatingGpsBtn");
    if (gpsBtn) {
      gpsBtn.classList.remove("is-hint");
      gpsBtn.classList.add("is-loading");
    }
    if (!auto) store.set(GPS_HINT_KEY, true);

    // Se já conhecemos a posição do usuário, faz o zoom imediato sem esperar a rede
    if (shouldZoom && state.userPos) {
      MapView.focusLocation(state.userPos.lat, state.userPos.lng, 16);
      gpsBtn?.classList.add("is-active");
      setTimeout(() => gpsBtn?.classList.remove("is-active"), 1000);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsBtn) {
          gpsBtn.classList.remove("is-loading");
          gpsBtn.classList.add("is-active");
          setTimeout(() => gpsBtn.classList.remove("is-active"), 1500);
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        state.userPos = { lat, lng };
        MapView.updateUserLocation(lat, lng, pos.coords.accuracy || 300);
        if (shouldZoom && (!auto || haversineKm(CUIABA, state.userPos) <= 60)) {
          MapView.focusLocation(lat, lng, auto ? 15 : 16);
        }
        render();
      },
      (err) => {
        if (gpsBtn) gpsBtn.classList.remove("is-loading");
        console.warn("GPS erro:", err.message);
        if (auto) {
          if (!store.get(GPS_HINT_KEY)) gpsBtn?.classList.add("is-hint");
        } else if (!state.userPos) {
          UI.toast(
            err.code === 1
              ? "Localização bloqueada. Libere o acesso nas permissões do navegador."
              : "Não foi possível obter a sua localização. Tente de novo.",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function start() {
    state.stations = [
      ...ANP_SNAPSHOT.map((r) => normalizeStation(...r, CITIES[0])),
      ...ANP_SNAPSHOT_VG.map((r) => normalizeStation(...r, CITIES[1])),
    ].filter(Boolean);

    MapView.init("map", (station) => {
      state.activeId = station.id;
      MapView.setActivePin(station.id);
      MapView.focusLocation(station.lat, station.lng, 16);
      render();
    });

    BottomSheet.init({
      containerId: "bottomSheet",
      backdropId: "sheetBackdrop",
      onSelectStation: (station) => {
        state.activeId = station.id;
        MapView.setActivePin(station.id);
        MapView.focusLocation(station.lat, station.lng, 16);
        render();
      },
      onSortChange: (sortKey) => {
        state.sort = sortKey;
        if (sortKey === "price" || sortKey === "both") {
          state.activeId = null; // Destaca o de menor preço ao ordenar por menor preço ou custo-benefício
        }
        savePrefs();
        render();
      },
      onHideNoPriceChange: (hide) => {
        state.hideNoPrice = hide;
        savePrefs();
        render();
      },
      onRequestGps: () => {
        requestLocation(false);
      },
      onShowHistory: showHistory,
      onShare: shareStation,
      onReport: openReportDialog,
      onVehicleChange: setVehicle,
    });

    ListView.init({
      containerId: "viewList",
      onSelectStation: (station) => {
        state.activeId = station.id;
        Navigation.switchTab("map");
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
      onFuelChange: setFuel,
    });

    Navigation.init({
      defaultTab: "map",
      onViewChange: setView,
    });

    Modals.init({
      onFocusStation: (stationId) => {
        const st = state.stations.find((s) => s.id === stationId);
        if (st) {
          state.activeId = st.id;
          Navigation.switchTab("map");
          MapView.setActivePin(st.id);
          MapView.focusLocation(st.lat, st.lng, 16);
          render();
        }
      },
    });

    bindCarDialog();
    bindReportDialog();
    bindCityMenu();

    document.getElementById("floatingGpsBtn")?.addEventListener("click", () => {
      requestLocation(true);
    });
    // Na primeira visita, o botão pisca até a pessoa pedir a localização
    if (!store.get(GPS_HINT_KEY)) {
      document.getElementById("floatingGpsBtn")?.classList.add("is-hint");
    }

    // Copiar o endereço de um posto e fechar o aviso da tendência (no mapa ou na lista)
    document.addEventListener("click", (e) => {
      const copiar = e.target.closest("[data-copiar]");
      if (copiar) {
        if (!navigator.clipboard)
          return UI.toast("Este navegador não permite copiar.");
        return navigator.clipboard.writeText(copiar.dataset.copiar).then(
          () => UI.toast("Endereço copiado."),
          () => UI.toast("Não foi possível copiar o endereço."),
        );
      }
      if (!e.target.closest("[data-fechar-aviso]")) return;
      store.set(TREND_KEY, {
        ...store.get(TREND_KEY),
        [state.fuel]: state.pricesWeekId,
      });
      render();
    });

    document
      .getElementById("tourAgainBtn")
      ?.addEventListener("click", () => startTour(true));

    document.getElementById("top10QuickBtn")?.addEventListener("click", () => {
      Modals.abrirTop10(state.fuel, state.city, placeLabel());
    });

    // No desktop a lista fica ao lado do mapa: ao cruzar essa largura o mapa muda de tamanho
    window
      .matchMedia("(min-width: 1024px)")
      .addEventListener("change", () => MapView.invalidateSize());

    render();
    // Link compartilhado: o mapa abre no posto do link
    const linked = state.stations.find((s) => s.id === state.activeId);
    if (linked) {
      centeredOnBest = true;
      MapView.focusLocation(linked.lat, linked.lng, 16);
    }

    loadPrices();
    loadContribs();

    // Pede a localização logo ao abrir e leva o mapa até a pessoa.
    // Num link compartilhado o mapa fica no posto do link; a localização só serve para a distância.
    requestLocation(!state.activeId, { auto: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
      start();
    });
  } else {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
    start();
  }
})();
