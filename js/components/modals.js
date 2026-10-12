/**
 * Combustível Certo · Componente de Modais (10 Mais Baratos & Tabela Completa ANP)
 */
const Modals = (() => {
  const modalTop10 = document.getElementById('modalTop10');
  const modalTabela = document.getElementById('modalTabela');
  let top10Periodo = '4';
  let top10Seq = 0;
  let tabSeq = 0;
  let tabTimer = null;
  let onFocusStationCallback = null;

  let tabCurrentPage = 1;
  const TAB_PAGE_SIZE = 10;
  let tabUltimosRegistros = [];

  const GRAF = { cor: '#047857', corPonto: '#f59e0b', grade: '#e2e8f0', alt: 40, margem: 7 };
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
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function grafLinha(pts, x, y, larg) {
    const meio = GRAF.alt / 2;
    const xy = pts.map(p => [x(p.dataColeta), y(p.preco)]);
    return `<svg width="${larg}" height="${GRAF.alt}" viewBox="0 0 ${larg} ${GRAF.alt}" class="block shrink-0" role="img">
      <line x1="0" x2="${larg}" y1="${meio}" y2="${meio}" stroke="${GRAF.grade}" stroke-width="1"/>
      ${xy.length > 1 ? `<polyline points="${xy.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${GRAF.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${xy.map(([cx, cy], i) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${GRAF.corPonto}" stroke="${GRAF.cor}" stroke-width="2"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="transparent" class="cursor-pointer" data-tip="${esc(`${dataBr(pts[i].dataColeta)} · ${precoTabela(pts[i].preco)}`)}"/>`).join('')}
    </svg>`;
  }

  function init({ onFocusStation } = {}) {
    onFocusStationCallback = onFocusStation;

    // Fechar modal Top 10
    document.getElementById('top10Close')?.addEventListener('click', fecharTop10);
    modalTop10?.addEventListener('click', e => { if (e.target === modalTop10) fecharTop10(); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        fecharTop10();
      }
    });

    // Filtros de período do Top 10
    document.getElementById('top10PeriodoBtns')?.addEventListener('click', e => {
      const b = e.target.closest('[data-top10-periodo]');
      if (!b) return;
      top10Periodo = b.dataset.top10Periodo;
      document.querySelectorAll('.top10-p-btn').forEach(btn => {
        const ativo = btn.dataset.top10Periodo === top10Periodo;
        btn.classList.toggle('bg-white', ativo);
        btn.classList.toggle('text-emerald-950', ativo);
        btn.classList.toggle('shadow-sm', ativo);
        btn.classList.toggle('font-bold', ativo);
        btn.classList.toggle('text-emerald-800', !ativo);
        btn.classList.toggle('font-semibold', !ativo);
      });
      loadTop10();
    });

    // Atalho do Top 10 para ver a Visão de Dados (sem esconder a barra inferior!)
    document.getElementById('top10VerTabelaGeral')?.addEventListener('click', () => {
      fecharTop10();
      abrirTabela();
    });

    // Clique em "Ver no mapa" dentro do Top 10
    modalTop10?.addEventListener('click', e => {
      const btnFoco = e.target.closest('[data-focar-posto]');
      if (btnFoco && typeof onFocusStationCallback === 'function') {
        fecharTop10();
        onFocusStationCallback(btnFoco.dataset.focarPosto);
      }
    });

    // Botão de recarregar na tela de dados
    document.getElementById('tabReloadBtn')?.addEventListener('click', loadTabela);

    // Alternar gaveta de filtros avançados (não ocupa espaço na tela no mobile)
    const toggleFiltrosBtn = document.getElementById('tabToggleFiltrosBtn');
    const chevronFiltros = document.getElementById('tabToggleFiltrosChevron');
    const gavetaFiltros = document.getElementById('tabFiltrosAvancados');
    toggleFiltrosBtn?.addEventListener('click', () => {
      if (!gavetaFiltros) return;
      const isHidden = gavetaFiltros.classList.toggle('hidden');
      chevronFiltros?.classList.toggle('rotate-180', !isHidden);
    });

    // Filtros da Visão de Dados
    for (const id of Object.values(TAB_FILTROS)) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          clearTimeout(tabTimer);
          tabTimer = setTimeout(loadTabela, 350);
        });
      }
    }

    document.getElementById('tabLimpar')?.addEventListener('click', () => {
      for (const id of Object.values(TAB_FILTROS)) {
        const el = document.getElementById(id);
        if (el) el.value = id === 'tabSemanas' ? '1' : '';
      }
      loadTabela();
    });

    // Clique em "Ver no mapa" dentro dos cards e tabela da tela de dados
    document.getElementById('viewDados')?.addEventListener('click', e => {
      const btnFoco = e.target.closest('[data-tab-foco-mapa]');
      if (btnFoco && typeof onFocusStationCallback === 'function') {
        onFocusStationCallback(btnFoco.dataset.tabFocoMapa);
      }
    });

    // Navegação de páginas da tabela ANP (10 em 10)
    document.getElementById('tabPagPrev')?.addEventListener('click', () => {
      if (tabCurrentPage > 1) {
        tabCurrentPage--;
        renderTabRows();
        document.getElementById('viewDados')?.querySelector('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    document.getElementById('tabPagNext')?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(tabUltimosRegistros.length / TAB_PAGE_SIZE));
      if (tabCurrentPage < totalPages) {
        tabCurrentPage++;
        renderTabRows();
        document.getElementById('viewDados')?.querySelector('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function abrirTop10() {
    if (!modalTop10) return;
    modalTop10.classList.remove('hidden');
    modalTop10.classList.add('flex');
    loadTop10();
  }

  function fecharTop10() {
    if (!modalTop10) return;
    modalTop10.classList.remove('flex');
    modalTop10.classList.add('hidden');
  }

  function abrirTabela() {
    // Abre a visão de dados nativa mantendo a barra de navegação inferior ativa e visível!
    if (typeof Navigation !== 'undefined' && typeof Navigation.switchTab === 'function') {
      Navigation.switchTab('dados');
    }
  }

  async function loadTop10() {
    const boxGrafico = document.getElementById('top10GraficoBox');
    const boxCards = document.getElementById('top10Cards');
    const boxMetrics = document.getElementById('top10Metrics');
    const meta = document.getElementById('top10Meta');
    const faixa = document.getElementById('top10FaixaPreco');
    const aviso = document.getElementById('top10Aviso');
    if (!boxGrafico || !boxCards) return;

    if (location.protocol === 'file:') {
      if (meta) meta.textContent = 'Servidor local necessário';
      if (aviso) {
        aviso.textContent = 'O ranking oficial da ANP depende do servidor. Execute "node server.js" e acesse http://localhost:8080.';
        aviso.classList.remove('hidden');
      }
      return;
    }

    const seq = ++top10Seq;
    if (meta) meta.textContent = 'Consultando preços oficiais da ANP em Cuiabá…';
    boxGrafico.style.opacity = '0.5';
    boxCards.style.opacity = '0.5';

    const params = new URLSearchParams({
      municipio: 'CUIABA',
      uf: 'MT',
      combustivel: 'GASOLINA COMUM',
      semanas: top10Periodo
    });

    try {
      const res = await fetch('api/precos?' + params, { signal: AbortSignal.timeout(180000) });
      const j = await res.json().catch(() => ({}));
      if (seq !== top10Seq) return;
      if (!res.ok) throw new Error(j.erro || 'HTTP ' + res.status);

      if (aviso) {
        if (j.aviso) {
          aviso.textContent = j.aviso;
          aviso.classList.remove('hidden');
        } else {
          aviso.classList.add('hidden');
        }
      }

      if (meta) {
        meta.textContent = j.semanaReferencia
          ? `Semana de referência: ${j.semanaReferencia.periodo} · Atualizado em: ${new Date(j.ultimaAtualizacao).toLocaleDateString('pt-BR')}`
          : 'Pesquisa oficial ANP';
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
        boxGrafico.innerHTML = '<p class="py-6 text-center text-sm text-slate-500 font-medium">Nenhum registro de Gasolina Comum encontrado neste período.</p>';
        boxCards.innerHTML = '';
        if (boxMetrics) boxMetrics.innerHTML = '';
        boxGrafico.style.opacity = '1';
        boxCards.style.opacity = '1';
        return;
      }

      const todos = top.flat();
      const precos = todos.map(p => p.preco);
      const minP = Math.min(...precos);
      const maxP = Math.max(...precos);
      const ultimosPrecos = top.map(pts => fim(pts).preco);
      const menorAtual = Math.min(...ultimosPrecos);
      const maiorAtual = Math.max(...ultimosPrecos);
      const mediaAtual = ultimosPrecos.reduce((a, b) => a + b, 0) / ultimosPrecos.length;

      if (faixa) faixa.textContent = `Menor: ${precoTabela(menorAtual)} · Maior: ${precoTabela(maiorAtual)}`;

      if (boxMetrics) {
        boxMetrics.innerHTML = `
          <div class="rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 text-white p-4 sm:p-5 shadow-sm border border-emerald-700/40 ring-1 ring-amber-400/20">
            <div class="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <i data-lucide="trophy" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>Campeão do Menor Preço</span>
            </div>
            <div class="mt-1 text-2xl font-black tabular-nums tracking-tight">${precoTabela(menorAtual)}</div>
            <div class="text-xs text-emerald-200/90 truncate mt-0.5 font-medium">${esc(fim(top[0]).fantasia || fim(top[0]).razao)}</div>
          </div>
          <div class="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preço Médio do Top 10</div>
            <div class="mt-1 text-2xl font-black text-slate-900 tabular-nums tracking-tight">${precoTabela(mediaAtual)}</div>
            <div class="text-xs text-slate-500 font-medium mt-0.5">Média entre os 10 mais baratos</div>
          </div>
          <div class="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diferença no Top 10</div>
            <div class="mt-1 text-2xl font-black text-slate-900 tabular-nums tracking-tight">${precoTabela(maiorAtual - menorAtual)}</div>
            <div class="text-xs text-slate-500 font-medium mt-0.5">Variação do 1º ao 10º colocado</div>
          </div>
        `;
      }

      const winW = document.documentElement.clientWidth || window.innerWidth || 360;
      const larg = winW < 400 ? 75 : winW < 640 ? 110 : 280;
      const t = d => Date.parse(d + 'T00:00:00Z');
      const ids = [...j.semanasConsultadas].sort();
      const t0 = t(ids[0].slice(0, 10)), t1 = t(ids[ids.length - 1].slice(11));
      const x = d => GRAF.margem + (t1 > t0 ? (t(d) - t0) / (t1 - t0) : 0.5) * (larg - 2 * GRAF.margem);
      const y = p => (maxP > minP ? GRAF.alt - GRAF.margem - (p - minP) / (maxP - minP) * (GRAF.alt - 2 * GRAF.margem) : GRAF.alt / 2);

      const linhasGrafico = top.map((pts, i) => {
        const a = pts[0], b = fim(pts), dif = b.preco - a.preco;
        const variacao = pts.length < 2 ? `1 coleta (${dataBr(b.dataColeta).slice(0, 5)})`
          : Math.abs(dif) < 0.005 ? `estável`
          : `${dif > 0 ? '▲' : '▼'} ${precoTabela(Math.abs(dif))}`;
        return `<li class="flex items-center gap-2 sm:gap-3 py-2 border-b border-slate-100 last:border-0 hover:bg-emerald-50/40 rounded-xl px-1.5 sm:px-2 transition">
          <span class="w-5 sm:w-6 shrink-0 text-right text-xs font-black ${i < 3 ? 'text-amber-500' : 'text-slate-400'}">${i + 1}º</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs sm:text-sm font-bold text-slate-900">${esc(b.fantasia || b.razao)}</div>
            <div class="truncate text-[10px] sm:text-[11px] text-slate-500 font-medium">${esc([b.bairro, b.bandeira].filter(Boolean).join(' · '))}</div>
          </div>
          ${grafLinha(pts, x, y, larg)}
          <div class="w-20 sm:w-36 shrink-0 text-right">
            <div class="text-xs sm:text-sm font-black text-emerald-800">${precoTabela(b.preco)}</div>
            <div class="text-[10px] sm:text-[11px] text-slate-500 font-medium">${variacao}</div>
          </div>
        </li>`;
      }).join('');

      boxGrafico.innerHTML = `
        <div class="flex items-center gap-2 sm:gap-3 text-[10px] text-slate-400 font-semibold px-1.5 sm:px-2 pb-1">
          <span class="w-5 sm:w-6 shrink-0 text-right">#</span><span class="min-w-0 flex-1">Posto & Bairro</span>
          <span class="flex justify-between shrink-0" style="width:${larg}px"><span>${dataBr(ids[0].slice(0, 10)).slice(0, 5)}</span><span>${dataBr(ids[ids.length - 1].slice(11)).slice(0, 5)}</span></span>
          <span class="w-20 sm:w-36 shrink-0 text-right">Preço</span>
        </div>
        <ol>${linhasGrafico}</ol>
      `;

      const medalhas = [
        '<i data-lucide="trophy" class="w-3 h-3 text-emerald-950 inline"></i> 1º Lugar',
        '<i data-lucide="medal" class="w-3 h-3 text-emerald-950 inline"></i> 2º Lugar',
        '<i data-lucide="medal" class="w-3 h-3 text-emerald-950 inline"></i> 3º Lugar'
      ];
      boxCards.innerHTML = top.map((pts, i) => {
        const b = fim(pts);
        const isTop3 = i < 3;
        const borderClass = i === 0
          ? 'border-amber-400 ring-1 ring-amber-300/40 bg-gradient-to-br from-emerald-50/40 via-white to-amber-50/20 shadow-xs'
          : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-2xs';

        const badgeMedal = isTop3
          ? `<span class="rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-emerald-950 text-[10px] font-black px-2.5 py-0.5 border border-amber-400/80 shadow-2xs inline-flex items-center gap-1">${medalhas[i]}</span>`
          : `<span class="rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5">#${i + 1}</span>`;

        const difPrimeiro = b.preco - menorAtual;
        const difTxt = difPrimeiro === 0 ? '<span class="inline-flex items-center gap-1 text-emerald-700 font-bold"><i data-lucide="trophy" class="w-3 h-3 text-amber-500"></i>Menor preço</span>' : `+${precoTabela(difPrimeiro)} vs 1º lugar`;
        const stationId = 'anp-' + b.cnpj;

        return `
          <div class="rounded-2xl border ${borderClass} p-4 sm:p-5 flex flex-col justify-between transition hover:border-slate-300">
            <div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                  ${badgeMedal}
                  <span class="rounded-full bg-slate-100 text-slate-700 border border-slate-200/70 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">${esc(b.bandeira)}</span>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-black tabular-nums tracking-tight text-[#0e7048]">${precoTabela(b.preco)}</div>
                  <div class="text-[10px] font-bold text-[#0e7048]">${difTxt}</div>
                </div>
              </div>
              <h4 class="mt-2 text-sm font-bold text-slate-900 leading-snug tracking-tight">${esc(b.fantasia || b.razao)}</h4>
              <p class="text-xs text-slate-500 mt-0.5 truncate">${esc([[b.endereco, b.numero].filter(Boolean).join(', '), b.bairro].filter(Boolean).join(' · '))}</p>
            </div>
            <div class="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button data-focar-posto="${esc(stationId)}" class="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 px-3 py-1.5 transition active:scale-95 cursor-pointer">Ver no mapa</button>
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((b.fantasia || b.razao) + ' Cuiaba')}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950 text-xs font-bold text-white px-3.5 py-1.5 shadow-2xs hover:shadow-xs transition active:scale-95 cursor-pointer">
                <span>Traçar rota</span>
                <span class="text-[11px] text-amber-300">→</span>
              </a>
            </div>
          </div>
        `;
      }).join('');

      boxGrafico.style.opacity = '1';
      boxCards.style.opacity = '1';
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (err) {
      if (seq !== top10Seq) return;
      if (meta) meta.textContent = 'Erro ao consultar ANP';
      boxGrafico.innerHTML = `<p class="py-4 text-center text-sm text-slate-500">Não foi possível carregar os dados: ${esc(err.message)}.</p>`;
      boxCards.innerHTML = '';
      if (boxMetrics) boxMetrics.innerHTML = '';
      boxGrafico.style.opacity = '1';
      boxCards.style.opacity = '1';
    }
  }

  function tabEstado(msg) {
    const el = document.getElementById('tabEstado');
    const cards = document.getElementById('tabCardsContainer');
    const tableWrap = document.getElementById('tabTableWrap');
    if (el) {
      el.textContent = msg || '';
      el.classList.toggle('hidden', !msg);
    }
    if (cards) cards.classList.toggle('hidden', !!msg);
    if (tableWrap) tableWrap.classList.toggle('hidden', !!msg);
  }

  function tabOpcoes(id, valores, rotulo) {
    const el = document.getElementById(id);
    if (!el) return;
    const atual = el.value;
    const lista = atual && !valores.includes(atual) ? [atual, ...valores] : valores;
    el.innerHTML = `<option value="">${rotulo}</option>` + lista.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    el.value = atual;
  }

  function renderTabRows() {
    const totalRegs = tabUltimosRegistros.length;
    const totalPages = Math.max(1, Math.ceil(totalRegs / TAB_PAGE_SIZE));
    if (tabCurrentPage > totalPages) tabCurrentPage = totalPages;
    if (tabCurrentPage < 1) tabCurrentPage = 1;

    const startIdx = (tabCurrentPage - 1) * TAB_PAGE_SIZE;
    const endIdx = Math.min(startIdx + TAB_PAGE_SIZE, totalRegs);
    const paged = tabUltimosRegistros.slice(startIdx, endIdx);

    // 1. Renderiza Cards Espaçosos para telas menores (Celular) - sem espremer dados!
    const cardsContainer = document.getElementById('tabCardsContainer');
    if (cardsContainer) {
      cardsContainer.innerHTML = paged.map(r => {
        const stationId = 'anp-' + r.cnpj;
        const enderecoCompleto = [[r.endereco, r.numero].filter(Boolean).join(', '), r.bairro].filter(Boolean).join(' · ');
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((r.fantasia || r.razao) + ' Cuiaba')}`;

        return `
          <div class="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs hover:border-slate-300 transition">
            <!-- Linha Superior: Tags e Data -->
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-extrabold text-[10px] uppercase border border-slate-200/60">${esc(r.bandeira || 'Branca')}</span>
                <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200/50">${esc(r.produto)}</span>
              </div>
              <span class="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <i data-lucide="calendar" class="w-3 h-3 text-slate-400"></i>
                <span>${esc(dataBr(r.dataColeta))}</span>
              </span>
            </div>

            <!-- Linha Central: Nome do Posto e Preço em Destaque -->
            <div class="flex items-baseline justify-between gap-3 mt-1.5">
              <div class="min-w-0 flex-1">
                <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">${esc(r.fantasia || r.razao)}</h3>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(enderecoCompleto)}</p>
              </div>
              <div class="text-right shrink-0">
                <div class="text-xl sm:text-2xl font-black text-[#0e7048] tabular-nums">${precoTabela(r.preco)}</div>
                <div class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">por litro</div>
              </div>
            </div>

            <!-- Linha Inferior: Ações (Ver no Mapa / Traçar Rota) -->
            <div class="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                data-tab-foco-mapa="${esc(stationId)}"
                type="button"
                class="px-3 py-1.5 rounded-xl border border-emerald-900/20 bg-emerald-950/10 hover:bg-emerald-950/20 text-[#0e7048] font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <i data-lucide="map" class="w-3.5 h-3.5 text-[#0e7048]"></i>
                <span>Ver no mapa</span>
              </button>

              <a
                href="${gmapsUrl}"
                target="_blank"
                rel="noopener"
                class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <i data-lucide="navigation" class="w-3.5 h-3.5 text-amber-300"></i>
                <span>Traçar rota</span>
              </a>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. Renderiza Tabela Larga para telas maiores (Desktop / Tablet)
    const corpo = document.getElementById('tabCorpo');
    if (corpo) {
      corpo.innerHTML = paged.map(r => {
        const stationId = 'anp-' + r.cnpj;
        const enderecoCompleto = [[r.endereco, r.numero].filter(Boolean).join(', '), r.bairro].filter(Boolean).join(' · ');
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((r.fantasia || r.razao) + ' Cuiaba')}`;

        return `<tr class="hover:bg-slate-50 transition">
          <td class="px-5 py-3">
            <div class="font-bold text-slate-900">${esc(r.fantasia || r.razao)}</div>
            <div class="text-xs text-slate-500">${esc(enderecoCompleto)}</div>
          </td>
          <td class="px-3 py-3 text-slate-600 font-medium">${esc(r.bandeira)}</td>
          <td class="px-3 py-3">
            <span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold text-xs">${esc(r.produto)}</span>
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <span class="font-black text-base text-emerald-800 tabular-nums">${precoTabela(r.preco)}</span>
          </td>
          <td class="px-4 py-3 text-right text-slate-500 whitespace-nowrap text-xs font-semibold">${esc(dataBr(r.dataColeta))}</td>
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <div class="inline-flex items-center gap-1.5">
              <button data-tab-foco-mapa="${esc(stationId)}" class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer">Mapa</button>
              <a href="${gmapsUrl}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-emerald-950 text-white text-xs font-bold transition cursor-pointer">GPS</a>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // 3. Paginação Unbreakable e Compacta (10 em 10)
    const pagInfo = document.getElementById('tabPagInfo');
    const pagPage = document.getElementById('tabPagPage');
    const pagPrev = document.getElementById('tabPagPrev');
    const pagNext = document.getElementById('tabPagNext');

    if (pagInfo) pagInfo.innerHTML = `<strong>${totalRegs ? startIdx + 1 : 0}–${endIdx}</strong> de <strong>${totalRegs}</strong><span class="hidden sm:inline"> registros</span>`;
    if (pagPage) pagPage.textContent = `${tabCurrentPage} / ${totalPages}`;
    if (pagPrev) pagPrev.disabled = tabCurrentPage === 1;
    if (pagNext) pagNext.disabled = tabCurrentPage === totalPages;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  async function loadTabela() {
    if (location.protocol === 'file:') {
      const tot = document.getElementById('tabTotal');
      if (tot) tot.textContent = '';
      return tabEstado('A tabela de preços depende do servidor. Rode "node server.js" e abra http://localhost:8080.');
    }
    const seq = ++tabSeq;
    const params = new URLSearchParams({ municipio: 'CUIABA', uf: 'MT' });
    for (const [nome, id] of Object.entries(TAB_FILTROS)) {
      const el = document.getElementById(id);
      if (el && el.value) params.set(nome, el.value);
    }
    tabEstado('Carregando preços…');
    try {
      const res = await fetch('api/precos?' + params, { signal: AbortSignal.timeout(180000) });
      const j = await res.json().catch(() => ({}));
      if (seq !== tabSeq) return;
      if (!res.ok) throw new Error(j.erro || 'HTTP ' + res.status);

      const aviso = document.getElementById('tabAviso');
      if (aviso) aviso.textContent = j.aviso || '';

      const meta = document.getElementById('tabMeta');
      if (meta) {
        meta.textContent = j.semanaReferencia
          ? `Semana de referência: ${j.semanaReferencia.periodo} · Atualizado: ${new Date(j.ultimaAtualizacao).toLocaleDateString('pt-BR')}`
          : 'Nenhuma semana importada ainda';
      }

      tabOpcoes('tabCombustivel', j.filtros.combustiveis, 'Todos');
      tabOpcoes('tabBairro', j.filtros.bairros, 'Todos');
      tabOpcoes('tabBandeira', j.filtros.bandeiras, 'Todas');

      const tot = document.getElementById('tabTotal');
      if (tot) tot.textContent = `${j.total} registros`;

      if (!j.registros || !j.registros.length) {
        document.getElementById('tabPagination')?.classList.add('hidden');
        return tabEstado('Nenhum registro encontrado para os filtros escolhidos.');
      }

      document.getElementById('tabPagination')?.classList.remove('hidden');
      tabUltimosRegistros = j.registros;
      tabCurrentPage = 1;
      renderTabRows();
      tabEstado('');
    } catch (err) {
      if (seq !== tabSeq) return;
      document.getElementById('tabPagination')?.classList.add('hidden');
      tabEstado(`Não foi possível carregar os preços: ${err.message}.`);
    }
  }

  return {
    init,
    abrirTop10,
    fecharTop10,
    abrirTabela,
    loadTabela
  };
})();
