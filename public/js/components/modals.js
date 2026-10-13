/**
 * Combustível Certo · Ranking "10 mais baratos" e histórico de preço de um posto
 */
const Modals = (() => {
  const modalTop10 = document.getElementById('modalTop10');
  let top10Periodo = '4';
  let top10Fuel = 'gasolina'; // 'gasolina' | 'etanol' | 'diesel'
  let top10Seq = 0;
  let onFocusStationCallback = null;
  let ultimoFoco = null;

  const modalHist = document.getElementById('modalHist');
  let histPeriodo = 'todas';
  let histRegistros = [];
  let histPosto = null;
  let histFuel = 'gasolina';

  const GRADE = '#e4e1d8';
  const PRODUTO = { gasolina: 'GASOLINA COMUM', etanol: 'ETANOL', diesel: 'DIESEL S10' };
  const ROTULO = { gasolina: 'Gasolina', etanol: 'Etanol', diesel: 'Diesel' };
  const precoTabela = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const dataBr = isoDate => String(isoDate || '').split('-').reverse().join('/');
  const esc = UI.esc;
  const tc = UI.titleCase;
  const preco2 = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomePosto = r => tc(r.fantasia || r.razao);
  const setPressed = (seletor, attr, valor) => document.querySelectorAll(seletor).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === valor)));

  const tendencia = dif => UI.trend(dif, precoTabela);

  // Preço ao longo do tempo: eixo de preço à esquerda, datas embaixo, o último ponto de cada linha é o preço atual.
  // Com várias séries (ranking), só a destacada fica em verde; as outras ficam em cinza ao fundo.
  function grafPrecos(series, larg, { t0, t1, nomes = [], destaque = 0 } = {}) {
    const alt = 180, m = { e: 46, d: 14, t: 14, b: 26 };
    const t = d => Date.parse(d + 'T00:00:00Z');
    const todos = series.flat();
    const precos = todos.map(p => p.preco);
    const minP = Math.min(...precos), maxP = Math.max(...precos);
    const datas = todos.map(p => p.dataColeta).sort();
    t0 ??= t(datas[0]);
    t1 ??= t(datas[datas.length - 1]);
    const x = d => m.e + (t1 > t0 ? (t(d) - t0) / (t1 - t0) : 0.5) * (larg - m.e - m.d);
    const y = p => (maxP > minP ? alt - m.b - (p - minP) / (maxP - minP) * (alt - m.t - m.b) : (alt - m.b + m.t) / 2);
    const base = alt - m.b;
    const eixoY = maxP > minP ? [maxP, minP] : [maxP];
    const dia = ms => dataBr(new Date(ms).toISOString().slice(0, 10)).slice(0, 5);

    const serie = (pts, i) => {
      const xy = pts.map(p => [x(p.dataColeta), y(p.preco)]);
      const fim = xy.length - 1;
      const linha = xy.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
      const tip = p => [nomes[i], dataBr(p.dataColeta), precoTabela(p.preco)].filter(Boolean).join(' · ');
      return `<g class="serie${i === destaque ? ' is-on' : ''}" data-serie="${i}">
        ${fim > 0 ? `<polygon class="serie-area" points="${xy[0][0].toFixed(1)},${base} ${linha} ${xy[fim][0].toFixed(1)},${base}"/>
          <polyline points="${linha}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${xy.map(([cx, cy], k) => `<circle class="serie-pt" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${k === fim ? 5 : 3}"/>
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="13" fill="transparent" data-tip="${esc(tip(pts[k]))}"/>`).join('')}
      </g>`;
    };
    // A série destacada é desenhada por último para ficar por cima
    const ordem = series.map((_, i) => i).sort((a, b) => (a === destaque) - (b === destaque));

    return `<svg class="hist-graf" width="${larg}" height="${alt}" viewBox="0 0 ${larg} ${alt}" role="img" aria-label="Gráfico do preço ao longo do tempo">
      ${eixoY.map(p => `<line x1="${m.e}" x2="${larg - m.d}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}" stroke="${GRADE}" stroke-width="1" stroke-dasharray="3 4"/>
        <text x="${m.e - 8}" y="${(y(p) + 4).toFixed(1)}" text-anchor="end">${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</text>`).join('')}
      <line x1="${m.e}" x2="${larg - m.d}" y1="${base}" y2="${base}" stroke="${GRADE}" stroke-width="1"/>
      <text x="${m.e}" y="${alt - 7}">${dia(t0)}</text>
      ${t1 > t0 ? `<text x="${larg - m.d}" y="${alt - 7}" text-anchor="end">${dia(t1)}</text>` : ''}
      ${ordem.map(i => serie(series[i], i)).join('')}
    </svg>`;
  }

  function init({ onFocusStation } = {}) {
    onFocusStationCallback = onFocusStation;

    document.getElementById('top10Close')?.addEventListener('click', fecharTop10);
    modalTop10?.addEventListener('click', e => { if (e.target === modalTop10) fecharTop10(); });
    document.getElementById('histClose')?.addEventListener('click', fecharHistorico);
    modalHist?.addEventListener('click', e => { if (e.target === modalHist) fecharHistorico(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      fecharTop10();
      fecharHistorico();
    });

    document.getElementById('histPeriodoBtns')?.addEventListener('click', e => {
      const b = e.target.closest('[data-hist-periodo]');
      if (!b) return;
      histPeriodo = b.dataset.histPeriodo;
      setPressed('[data-hist-periodo]', 'histPeriodo', histPeriodo);
      renderHistorico();
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
    for (const box of [document.getElementById('top10GraficoBox'), document.getElementById('histBox')]) {
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
    }
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

      const t = d => Date.parse(d + 'T00:00:00Z');
      const ids = [...j.semanasConsultadas].sort();
      const larg = Math.max(260, Math.floor(box.clientWidth) || 320);
      const semanaAtual = j.semanaReferencia?.id;

      const linhas = top.map((pts, i) => {
        const a = pts[0], b = fim(pts), dif = b.preco - a.preco;
        const variacao = pts.length < 2 ? `1 coleta, em ${dataBr(b.dataColeta).slice(0, 5)}`
          : tendencia(dif);
        const antigo = semanaAtual && b.semana !== semanaAtual;
        return `<li>
          <button type="button" class="rank-row" data-focar-posto="${esc('anp-' + b.cnpj)}" data-serie="${i}" title="Ver no mapa">
            <span class="row-rank${i === 0 ? ' is-best' : ''}">${i + 1}</span>
            <span class="row-main">
              <span class="row-name">${esc(nomePosto(b))}</span>
              <span class="row-sub">${esc(tc([b.bairro, b.bandeira].filter(Boolean).join(' · ')))}</span>
              ${antigo ? `<span class="rank-stale">${UI.icon('triangle-alert')}Atenção: sem coleta na última semana</span>` : ''}
            </span>
            <span class="r">
              <span class="price price-md">${precoTabela(b.preco)}</span>
              <span class="rank-var">${variacao}</span>
            </span>
          </button>
        </li>`;
      }).join('');

      box.innerHTML = `
        ${grafPrecos(top, larg, { t0: t(ids[0].slice(0, 10)), t1: t(ids[ids.length - 1].slice(11)), nomes: top.map(pts => nomePosto(fim(pts))) })}
        <p class="graf-legenda"><span id="top10Destaque" class="graf-legenda-on">${esc(nomePosto(fim(top[0])))}</span><span>demais postos do ranking</span></p>
        <div class="rank-head">
          <span></span><span>Posto</span>
          <span class="r">Preço atual</span>
        </div>
        <ol class="rank-list">${linhas}</ol>
      `;

      // Passar o mouse (ou o foco) num posto destaca a linha dele no gráfico
      const svg = box.querySelector('.hist-graf');
      const legenda = box.querySelector('#top10Destaque');
      const destacar = i => {
        const g = svg?.querySelector(`.serie[data-serie="${i}"]`);
        if (!g || g.classList.contains('is-on')) return;
        svg.querySelector('.serie.is-on')?.classList.remove('is-on');
        g.classList.add('is-on');
        svg.appendChild(g);
        if (legenda) legenda.textContent = nomePosto(fim(top[i]));
      };
      box.querySelectorAll('.rank-row').forEach(linha => {
        linha.addEventListener('pointerenter', () => destacar(linha.dataset.serie));
        linha.addEventListener('focus', () => destacar(linha.dataset.serie));
      });
      svg?.addEventListener('pointerover', e => {
        const g = e.target.closest?.('.serie');
        if (g) destacar(g.dataset.serie);
      });
      box.style.opacity = '1';
      UI.icons();
    } catch (err) {
      if (seq !== top10Seq) return;
      if (meta) meta.textContent = '';
      estado('Não foi possível carregar o ranking.', err.message, true);
    }
  }

  // ---------------------------------------------------------------------------
  // Histórico de preço de um posto
  // ---------------------------------------------------------------------------
  function abrirHistorico(posto, fuelId, registros) {
    if (!modalHist || !posto) return;
    histPosto = posto;
    histRegistros = registros || [];
    histFuel = PRODUTO[fuelId] ? fuelId : 'gasolina';
    ultimoFoco = document.activeElement;
    const titulo = document.getElementById('histTitle');
    if (titulo) titulo.textContent = posto.name;
    setPressed('[data-hist-periodo]', 'histPeriodo', histPeriodo);
    modalHist.classList.remove('hidden');
    document.getElementById('histClose')?.focus();
    renderHistorico();
  }

  function fecharHistorico() {
    if (!modalHist || modalHist.classList.contains('hidden')) return;
    modalHist.classList.add('hidden');
    document.getElementById('grafTip')?.classList.add('hidden');
    ultimoFoco?.focus?.();
  }

  function renderHistorico() {
    const box = document.getElementById('histBox');
    const boxMetrics = document.getElementById('histMetrics');
    const meta = document.getElementById('histMeta');
    if (!box || !histPosto) return;

    const rotulo = ROTULO[histFuel];
    if (meta) meta.textContent = [rotulo, histPosto.brand, histPosto.address].filter(Boolean).join(' · ');

    // "1 mês" são as 4 semanas mais recentes com coleta em Cuiabá, como na API
    const semanas = [...new Set(histRegistros.map(r => r.semana))].sort().reverse();
    const noPeriodo = new Set(histPeriodo === 'todas' ? semanas : semanas.slice(0, parseInt(histPeriodo, 10)));

    // Diesel: S10 quando o posto tem; senão o S500, como no mapa e na lista
    const cnpj = histPosto.id.slice(4);
    const doPosto = histRegistros.filter(r => r.cnpj === cnpj && noPeriodo.has(r.semana));
    let pts = doPosto.filter(r => r.produto === PRODUTO[histFuel]);
    if (!pts.length && histFuel === 'diesel') pts = doPosto.filter(r => r.produto === 'DIESEL S500');
    pts.sort((a, b) => a.dataColeta.localeCompare(b.dataColeta));

    if (!pts.length) {
      boxMetrics?.classList.add('hidden');
      box.innerHTML = `<div class="state"><strong>Nenhuma coleta de ${esc(rotulo.toLowerCase())} neste posto neste período.</strong>A pesquisa da ANP visita só uma parte dos postos a cada semana. Escolha um período maior.</div>`;
      return;
    }

    const atual = pts[pts.length - 1];
    const menor = pts.reduce((a, b) => (b.preco < a.preco ? b : a));
    if (boxMetrics) {
      boxMetrics.classList.remove('hidden');
      boxMetrics.innerHTML = `
        <div><dt>Preço atual</dt><dd class="price price-md">${precoTabela(atual.preco)}</dd><small>coleta de ${dataBr(atual.dataColeta)}</small></div>
        <div><dt>Menor no período</dt><dd class="price price-md">${precoTabela(menor.preco)}</dd><small>em ${dataBr(menor.dataColeta)}</small></div>
        <div><dt>No período</dt><dd class="hist-trend">${pts.length > 1 ? tendencia(atual.preco - pts[0].preco) : '1 coleta'}</dd><small>${pts.length} ${pts.length === 1 ? 'coleta' : 'coletas'}</small></div>
      `;
    }

    const larg = Math.max(260, Math.floor(box.clientWidth) || 320);
    const linhas = pts.map((p, i) => `<li>
        <span>${dataBr(p.dataColeta)}</span>
        <span class="rank-var">${i > 0 ? tendencia(p.preco - pts[i - 1].preco) : ''}</span>
        <span class="price price-md">${precoTabela(p.preco)}</span>
      </li>`).reverse().join('');

    box.innerHTML = `
      ${grafPrecos([pts], larg)}
      <h3 class="hist-sub">Coletas da ANP</h3>
      <ol class="hist-list">${linhas}</ol>
    `;
    UI.icons();
  }

  return { init, abrirTop10, fecharTop10, abrirHistorico, fecharHistorico };
})();
