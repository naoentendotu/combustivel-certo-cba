/**
 * Combustível Certo · Ranking "10 mais baratos" e tela da pesquisa ANP (todos os registros)
 */
const Modals = (() => {
  const modalTop10 = document.getElementById('modalTop10');
  let top10Periodo = '4';
  let top10Fuel = 'gasolina'; // 'gasolina' | 'etanol' | 'diesel'
  let top10Seq = 0;
  let tabSeq = 0;
  let tabTimer = null;
  let onFocusStationCallback = null;
  let ultimoFoco = null;

  let tabCurrentPage = 1;
  const TAB_PAGE_SIZE = 10;
  let tabUltimosRegistros = [];

  const GRAF = { cor: '#0e7048', grade: '#e4e1d8', alt: 40, margem: 7 };
  const PRODUTO = { gasolina: 'GASOLINA COMUM', etanol: 'ETANOL', diesel: 'DIESEL S10' };
  const TAB_FILTROS = {
    combustivel: 'tabCombustivel',
    bairro: 'tabBairro',
    bandeira: 'tabBandeira',
    semanas: 'tabSemanas',
    precoMin: 'tabMin',
    precoMax: 'tabMax',
    coletaDe: 'tabDe',
    coletaAte: 'tabAte'
  };

  const precoTabela = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const dataBr = isoDate => String(isoDate || '').split('-').reverse().join('/');
  const esc = UI.esc;
  const tc = UI.titleCase;
  const preco2 = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomePosto = r => tc(r.fantasia || r.razao);
  const enderecoDe = r => tc([[r.endereco, r.numero].filter(Boolean).join(', '), r.bairro].filter(Boolean).join(' · '));
  const rotaDe = r => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomePosto(r) + ' ' + (r.endereco || '') + ' Cuiaba')}`;
  const setPressed = (seletor, attr, valor) => document.querySelectorAll(seletor).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === valor)));

  // Uma linha por posto, na mesma escala de preço e de tempo; o último ponto é o preço atual
  function grafLinha(pts, x, y, larg) {
    const meio = GRAF.alt / 2;
    const xy = pts.map(p => [x(p.dataColeta), y(p.preco)]);
    const fim = xy.length - 1;
    return `<svg width="${larg}" height="${GRAF.alt}" viewBox="0 0 ${larg} ${GRAF.alt}" aria-hidden="true">
      <line x1="0" x2="${larg}" y1="${meio}" y2="${meio}" stroke="${GRAF.grade}" stroke-width="1"/>
      ${xy.length > 1 ? `<polyline points="${xy.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${GRAF.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${xy.map(([cx, cy], i) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${i === fim ? 4 : 2.5}" fill="${GRAF.cor}" stroke="#fff" stroke-width="${i === fim ? 2 : 1}"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="transparent" data-tip="${esc(`${dataBr(pts[i].dataColeta)} · ${precoTabela(pts[i].preco)}`)}"/>`).join('')}
    </svg>`;
  }

  function init({ onFocusStation } = {}) {
    onFocusStationCallback = onFocusStation;

    document.getElementById('top10Close')?.addEventListener('click', fecharTop10);
    modalTop10?.addEventListener('click', e => { if (e.target === modalTop10) fecharTop10(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalTop10 && !modalTop10.classList.contains('hidden')) fecharTop10();
    });

    document.getElementById('top10FuelTabs')?.addEventListener('click', e => {
      const b = e.target.closest('[data-top10-fuel]');
      if (!b) return;
      top10Fuel = b.dataset.top10Fuel;
      setPressed('[data-top10-fuel]', 'top10Fuel', top10Fuel);
      loadTop10();
    });

    document.getElementById('top10PeriodoBtns')?.addEventListener('click', e => {
      const b = e.target.closest('[data-top10-periodo]');
      if (!b) return;
      top10Periodo = b.dataset.top10Periodo;
      setPressed('[data-top10-periodo]', 'top10Periodo', top10Periodo);
      loadTop10();
    });

    document.getElementById('top10VerTabelaGeral')?.addEventListener('click', () => {
      fecharTop10();
      abrirTabela();
    });

    // Tocar num posto do ranking leva ao mapa
    modalTop10?.addEventListener('click', e => {
      const linha = e.target.closest('[data-focar-posto]');
      if (linha && typeof onFocusStationCallback === 'function') {
        fecharTop10();
        onFocusStationCallback(linha.dataset.focarPosto);
      }
    });

    // Valor de cada ponto do gráfico ao passar o mouse ou tocar
    const tip = document.getElementById('grafTip');
    const box = document.getElementById('top10GraficoBox');
    box?.addEventListener('pointerover', e => {
      const alvo = e.target.closest?.('[data-tip]');
      if (!alvo || !tip) return;
      const r = alvo.getBoundingClientRect();
      tip.textContent = alvo.dataset.tip;
      tip.style.left = r.left + r.width / 2 + 'px';
      tip.style.top = r.top + r.height / 2 + 'px';
      tip.classList.remove('hidden');
    });
    box?.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) tip?.classList.add('hidden'); });

    document.getElementById('tabReloadBtn')?.addEventListener('click', loadTabela);

    const toggleFiltrosBtn = document.getElementById('tabToggleFiltrosBtn');
    const gavetaFiltros = document.getElementById('tabFiltrosAvancados');
    toggleFiltrosBtn?.addEventListener('click', () => {
      if (!gavetaFiltros) return;
      const fechado = gavetaFiltros.classList.toggle('hidden');
      toggleFiltrosBtn.setAttribute('aria-expanded', String(!fechado));
    });

    for (const id of Object.values(TAB_FILTROS)) {
      document.getElementById(id)?.addEventListener('input', () => {
        clearTimeout(tabTimer);
        tabTimer = setTimeout(loadTabela, 350);
      });
    }

    document.getElementById('tabLimpar')?.addEventListener('click', () => {
      for (const id of Object.values(TAB_FILTROS)) {
        const el = document.getElementById(id);
        if (el) el.value = id === 'tabSemanas' ? '1' : '';
      }
      loadTabela();
    });

    document.getElementById('viewDados')?.addEventListener('click', e => {
      const btnFoco = e.target.closest('[data-tab-foco-mapa]');
      if (btnFoco && typeof onFocusStationCallback === 'function') onFocusStationCallback(btnFoco.dataset.tabFocoMapa);
      if (e.target.closest('#tabRetryBtn')) loadTabela();
    });

    const irParaPagina = delta => {
      tabCurrentPage += delta;
      renderTabRows();
      document.querySelector('#viewDados .scroll-thin')?.scrollTo({ top: 0 });
    };
    document.getElementById('tabPagPrev')?.addEventListener('click', () => { if (tabCurrentPage > 1) irParaPagina(-1); });
    document.getElementById('tabPagNext')?.addEventListener('click', () => {
      if (tabCurrentPage < Math.ceil(tabUltimosRegistros.length / TAB_PAGE_SIZE)) irParaPagina(1);
    });
  }

  function abrirTop10(fuelId) {
    if (!modalTop10) return;
    if (fuelId && PRODUTO[fuelId]) {
      top10Fuel = fuelId;
      setPressed('[data-top10-fuel]', 'top10Fuel', top10Fuel);
    }
    ultimoFoco = document.activeElement;
    modalTop10.classList.remove('hidden');
    document.getElementById('top10Close')?.focus();
    loadTop10();
  }

  function fecharTop10() {
    if (!modalTop10 || modalTop10.classList.contains('hidden')) return;
    modalTop10.classList.add('hidden');
    document.getElementById('grafTip')?.classList.add('hidden');
    ultimoFoco?.focus?.();
  }

  function abrirTabela() {
    if (typeof Navigation !== 'undefined' && typeof Navigation.switchTab === 'function') Navigation.switchTab('dados');
  }

  async function loadTop10() {
    const box = document.getElementById('top10GraficoBox');
    const boxMetrics = document.getElementById('top10Metrics');
    const meta = document.getElementById('top10Meta');
    const aviso = document.getElementById('top10Aviso');
    if (!box) return;

    const estado = (titulo, texto = '', tentar = false) => {
      if (boxMetrics) boxMetrics.classList.add('hidden');
      box.innerHTML = `<div class="state"><strong>${esc(titulo)}</strong>${esc(texto)}${tentar ? '<div><button type="button" class="btn btn-quiet" id="top10Retry">Tentar de novo</button></div>' : ''}</div>`;
      box.querySelector('#top10Retry')?.addEventListener('click', loadTop10);
      box.style.opacity = '1';
    };

    if (location.protocol === 'file:') {
      if (meta) meta.textContent = '';
      return estado('O ranking precisa do servidor.', 'Rode "node server.js" e abra http://localhost:8080.');
    }

    const seq = ++top10Seq;
    const produto = PRODUTO[top10Fuel] || PRODUTO.gasolina;
    if (meta) meta.textContent = 'Consultando a pesquisa da ANP…';
    if (box.children.length) box.style.opacity = '0.5';
    else estado('Carregando…');

    const params = new URLSearchParams({ municipio: 'CUIABA', uf: 'MT', combustivel: produto, semanas: top10Periodo });

    try {
      const res = await fetch('api/precos?' + params, { signal: AbortSignal.timeout(180000) });
      const j = await res.json().catch(() => ({}));
      if (seq !== top10Seq) return;
      if (!res.ok) throw new Error(j.erro || 'HTTP ' + res.status);

      if (aviso) {
        aviso.textContent = j.aviso || '';
        aviso.classList.toggle('hidden', !j.aviso);
      }
      if (meta) {
        meta.textContent = j.semanaReferencia
          ? `Pesquisa ANP · semana de ${j.semanaReferencia.periodo}`
          : 'Pesquisa ANP';
      }

      const porPosto = new Map();
      for (const r of j.registros) {
        const k = r.cnpj || r.razao;
        if (!porPosto.has(k)) porPosto.set(k, []);
        porPosto.get(k).push(r);
      }

      const series = [...porPosto.values()].map(pts => pts.sort((a, b) => a.dataColeta.localeCompare(b.dataColeta)));
      const fim = s => s[s.length - 1];
      const top = series.sort((a, b) => fim(a).preco - fim(b).preco || fim(b).dataColeta.localeCompare(fim(a).dataColeta) || fim(a).razao.localeCompare(fim(b).razao)).slice(0, 10);

      if (!top.length) {
        return estado(`Nenhum preço de ${produto.toLowerCase()} neste período.`, 'Escolha outro combustível ou amplie o período.');
      }

      const precos = top.flat().map(p => p.preco);
      const minP = Math.min(...precos);
      const maxP = Math.max(...precos);
      const atuais = top.map(pts => fim(pts).preco);
      const menorAtual = Math.min(...atuais);
      const maiorAtual = Math.max(...atuais);
      const mediaAtual = atuais.reduce((a, b) => a + b, 0) / atuais.length;

      if (boxMetrics) {
        boxMetrics.classList.remove('hidden');
        boxMetrics.innerHTML = `
          <div><dt>Menor preço</dt><dd class="price price-md">${precoTabela(menorAtual)}</dd><small>${esc(nomePosto(fim(top[0])))}</small></div>
          <div><dt>Média dos ${top.length}</dt><dd class="price price-md">${preco2(mediaAtual)}</dd></div>
          <div><dt>Do 1º ao ${top.length}º</dt><dd class="price price-md">${preco2(maiorAtual - menorAtual)}</dd><small>de diferença</small></div>
        `;
      }

      const winW = document.documentElement.clientWidth || window.innerWidth || 360;
      const larg = winW < 400 ? 72 : winW < 640 ? 104 : 220;
      const t = d => Date.parse(d + 'T00:00:00Z');
      const ids = [...j.semanasConsultadas].sort();
      const t0 = t(ids[0].slice(0, 10)), t1 = t(ids[ids.length - 1].slice(11));
      const x = d => GRAF.margem + (t1 > t0 ? (t(d) - t0) / (t1 - t0) : 0.5) * (larg - 2 * GRAF.margem);
      const y = p => (maxP > minP ? GRAF.alt - GRAF.margem - (p - minP) / (maxP - minP) * (GRAF.alt - 2 * GRAF.margem) : GRAF.alt / 2);
      const semanaAtual = j.semanaReferencia?.id;

      const linhas = top.map((pts, i) => {
        const a = pts[0], b = fim(pts), dif = b.preco - a.preco;
        const variacao = pts.length < 2 ? `1 coleta, em ${dataBr(b.dataColeta).slice(0, 5)}`
          : Math.abs(dif) < 0.005 ? `${UI.icon('minus')}estável`
          : `${UI.icon(dif > 0 ? 'arrow-up-right' : 'arrow-down-right')}${dif > 0 ? 'subiu' : 'caiu'} ${precoTabela(Math.abs(dif))}`;
        const antigo = semanaAtual && b.semana !== semanaAtual;
        return `<li>
          <button type="button" class="rank-row" data-focar-posto="${esc('anp-' + b.cnpj)}" title="Ver no mapa">
            <span class="row-rank${i === 0 ? ' is-best' : ''}">${i + 1}</span>
            <span class="row-main">
              <span class="row-name">${esc(nomePosto(b))}</span>
              <span class="row-sub">${esc(tc([b.bairro, b.bandeira].filter(Boolean).join(' · ')))}</span>
              ${antigo ? `<span class="rank-stale">${UI.icon('triangle-alert')}Atenção: sem coleta na última semana</span>` : ''}
            </span>
            ${grafLinha(pts, x, y, larg)}
            <span class="r">
              <span class="price price-md">${precoTabela(b.preco)}</span>
              <span class="rank-var">${variacao}</span>
            </span>
          </button>
        </li>`;
      }).join('');

      box.innerHTML = `
        <div class="rank-head">
          <span></span><span>Posto</span>
          <span class="axis" style="width:${larg}px"><span>${dataBr(ids[0].slice(0, 10)).slice(0, 5)}</span><span>${dataBr(ids[ids.length - 1].slice(11)).slice(0, 5)}</span></span>
          <span class="r">Preço atual</span>
        </div>
        <ol class="rank-list">${linhas}</ol>
      `;
      box.style.opacity = '1';
      UI.icons();
    } catch (err) {
      if (seq !== top10Seq) return;
      if (meta) meta.textContent = '';
      estado('Não foi possível carregar o ranking.', err.message, true);
    }
  }

  function tabEstado(titulo, texto = '', tentar = false) {
    const el = document.getElementById('tabEstado');
    if (el) {
      el.innerHTML = titulo ? `<strong>${esc(titulo)}</strong>${esc(texto)}${tentar ? '<div><button type="button" class="btn btn-quiet" id="tabRetryBtn">Tentar de novo</button></div>' : ''}` : '';
      el.classList.toggle('hidden', !titulo);
    }
    document.getElementById('tabCardsContainer')?.classList.toggle('hidden', !!titulo);
    document.getElementById('tabTableWrap')?.classList.toggle('hidden', !!titulo);
    document.getElementById('tabPagination')?.classList.toggle('hidden', !!titulo);
  }

  function tabOpcoes(id, valores, rotulo) {
    const el = document.getElementById(id);
    if (!el) return;
    const atual = el.value;
    const lista = atual && !valores.includes(atual) ? [atual, ...valores] : valores;
    el.innerHTML = `<option value="">${rotulo}</option>` + lista.map(v => `<option value="${esc(v)}">${esc(tc(v))}</option>`).join('');
    el.value = atual;
  }

  function renderTabRows() {
    const totalRegs = tabUltimosRegistros.length;
    const totalPages = Math.max(1, Math.ceil(totalRegs / TAB_PAGE_SIZE));
    tabCurrentPage = Math.min(Math.max(1, tabCurrentPage), totalPages);

    const startIdx = (tabCurrentPage - 1) * TAB_PAGE_SIZE;
    const endIdx = Math.min(startIdx + TAB_PAGE_SIZE, totalRegs);
    const paged = tabUltimosRegistros.slice(startIdx, endIdx);

    const acoes = r => `
      <button type="button" class="link" data-tab-foco-mapa="${esc('anp-' + r.cnpj)}">Ver no mapa</button>
      <a class="link" href="${rotaDe(r)}" target="_blank" rel="noopener">Abrir no Google Maps</a>`;

    // Celular: lista de registros
    const cards = document.getElementById('tabCardsContainer');
    if (cards) {
      cards.innerHTML = paged.map(r => `
        <li class="rec">
          <div style="min-width:0">
            <div class="rec-name">${esc(nomePosto(r))}</div>
            <div class="rec-sub">${esc(enderecoDe(r))}</div>
            <div class="rec-meta">${esc([tc(r.bandeira || 'Branca'), tc(r.produto), 'coleta ' + dataBr(r.dataColeta)].join(' · '))}</div>
          </div>
          <div class="price price-md">${precoTabela(r.preco)}</div>
          <div class="rec-actions">${acoes(r)}</div>
        </li>`).join('');
    }

    // Telas largas: tabela
    const corpo = document.getElementById('tabCorpo');
    if (corpo) {
      corpo.innerHTML = paged.map(r => `<tr>
          <td><div class="t-name">${esc(nomePosto(r))}</div><div class="t-sub">${esc(enderecoDe(r))}</div></td>
          <td>${esc(tc(r.bandeira || 'Branca'))}</td>
          <td>${esc(tc(r.produto))}</td>
          <td class="num"><span class="price price-md">${precoTabela(r.preco)}</span></td>
          <td class="num">${esc(dataBr(r.dataColeta))}</td>
          <td><div class="t-actions">${acoes(r)}</div></td>
        </tr>`).join('');
    }

    const pagInfo = document.getElementById('tabPagInfo');
    const pagPage = document.getElementById('tabPagPage');
    const pagPrev = document.getElementById('tabPagPrev');
    const pagNext = document.getElementById('tabPagNext');
    if (pagInfo) pagInfo.textContent = `${totalRegs ? startIdx + 1 : 0}–${endIdx} de ${totalRegs} registros`;
    if (pagPage) pagPage.textContent = `${tabCurrentPage} / ${totalPages}`;
    if (pagPrev) pagPrev.disabled = tabCurrentPage === 1;
    if (pagNext) pagNext.disabled = tabCurrentPage === totalPages;
  }

  async function loadTabela() {
    const tot = document.getElementById('tabTotal');
    if (location.protocol === 'file:') {
      if (tot) tot.textContent = '';
      return tabEstado('A pesquisa precisa do servidor.', 'Rode "node server.js" e abra http://localhost:8080.');
    }
    const seq = ++tabSeq;
    const params = new URLSearchParams({ municipio: 'CUIABA', uf: 'MT' });
    for (const [nome, id] of Object.entries(TAB_FILTROS)) {
      const el = document.getElementById(id);
      if (el && el.value) params.set(nome, el.value);
    }
    tabEstado('Carregando…');
    try {
      const res = await fetch('api/precos?' + params, { signal: AbortSignal.timeout(180000) });
      const j = await res.json().catch(() => ({}));
      if (seq !== tabSeq) return;
      if (!res.ok) throw new Error(j.erro || 'HTTP ' + res.status);

      const aviso = document.getElementById('tabAviso');
      if (aviso) {
        aviso.textContent = j.aviso || '';
        aviso.classList.toggle('hidden', !j.aviso);
      }

      const meta = document.getElementById('tabMeta');
      if (meta) {
        meta.textContent = j.semanaReferencia
          ? `Semana de ${j.semanaReferencia.periodo} · atualizado em ${new Date(j.ultimaAtualizacao).toLocaleDateString('pt-BR')}`
          : 'Nenhuma semana importada ainda';
      }

      tabOpcoes('tabCombustivel', (j.filtros.combustiveis || []).filter(c => !c.toLowerCase().includes('gnv')), 'Todos');
      tabOpcoes('tabBairro', j.filtros.bairros, 'Todos');
      tabOpcoes('tabBandeira', j.filtros.bandeiras, 'Todas');

      if (tot) tot.textContent = `${j.total} ${j.total === 1 ? 'registro' : 'registros'}`;

      if (!j.registros || !j.registros.length) {
        UI.icons();
        return tabEstado('Nenhum registro com esses filtros.', 'Amplie o período ou limpe os filtros.');
      }

      tabUltimosRegistros = j.registros;
      tabCurrentPage = 1;
      tabEstado('');
      renderTabRows();
      UI.icons();
    } catch (err) {
      if (seq !== tabSeq) return;
      tabEstado('Não foi possível carregar a pesquisa.', err.message, true);
    }
  }

  return { init, abrirTop10, fecharTop10, abrirTabela, loadTabela };
})();
