'use strict';
// Coleta semanal dos preços por posto da ANP (Levantamento de Preços de Combustíveis) para Cuiabá/MT.
// Fonte única: a página oficial abaixo. A URL da planilha é descoberta a cada execução.
const fs = require('fs');
const path = require('path');
const { readSheet } = require('./xlsx');

const LPC_PAGE = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas';
function resolverDataDir() {
  const dirRel = path.join(__dirname, '..', 'data');
  if (fs.existsSync(dirRel)) return dirRel;
  const dirCwd = path.join(process.cwd(), 'data');
  if (fs.existsSync(dirCwd)) return dirCwd;
  return dirRel;
}
const DATA_DIR = resolverDataDir();
const UA = { 'User-Agent': 'Mozilla/5.0 (CombustivelCerto; coleta semanal de precos ANP)' };
const AVISO = 'Preços da pesquisa semanal da ANP (Levantamento de Preços de Combustíveis). A pesquisa visita só parte dos postos e os valores podem diferir dos praticados hoje.';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Comparação tolerante a maiúsculas/minúsculas, acentos e espaços extras
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const limpo = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const br = isoDate => isoDate.split('-').reverse().join('/');
const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

/* ----------------------------------------------------- Página -> planilhas */
// Devolve as planilhas "Preços por posto revendedor" publicadas na página, da semana de referência
// mais recente para a mais antiga. A ordem vem das datas do período, não da posição do link.
function listarPlanilhas(html) {
  const vistos = new Set(), lista = [];
  for (const a of html.matchAll(/<a\b[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const texto = norm(a[2].replace(/<[^>]+>/g, ' '));
    let url;
    try { url = new URL(a[1].replace(/&amp;/g, '&'), LPC_PAGE); } catch { continue; }
    const arquivo = decodeURIComponent(path.posix.basename(url.pathname));
    if (!/\.xlsx$/i.test(arquivo)) continue;
    if (!texto.includes('PRECOS POR POSTO REVENDEDOR') && !/revendas?_lpc/i.test(arquivo)) continue;
    if (vistos.has(url.href)) continue;
    vistos.add(url.href);
    const datas = [...arquivo.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)].map(m => iso(m[1], m[2], m[3])).filter(dataValida);
    const [inicio, fim] = datas.length >= 2 ? datas : [null, null];
    lista.push({ url: url.href, arquivo, inicio, fim, id: inicio && fim ? `${inicio}_${fim}` : null, ordem: lista.length });
  }
  return lista.sort((a, b) => (a.fim && b.fim ? b.fim.localeCompare(a.fim) : a.fim ? -1 : b.fim ? 1 : a.ordem - b.ordem));
}

/* ------------------------------------------------------ Planilha -> registros */
// Cabeçalho da ANP (normalizado) -> campo do registro
const COLUNAS = [
  ['cnpj', /^CNPJ$/], ['razao', /^RAZAO( SOCIAL)?$/], ['fantasia', /^(NOME )?FANTASIA$/],
  ['endereco', /^ENDERECO$/], ['numero', /^NUMERO$/], ['complemento', /^COMPLEMENTO$/],
  ['bairro', /^BAIRRO$/], ['cep', /^CEP$/], ['municipio', /^MUNICIPIO$/], ['estado', /^(ESTADO|UF)( - SIGLA)?$/],
  ['bandeira', /^BANDEIRA$/], ['produto', /^PRODUTO$/], ['unidade', /^UNIDADE( DE MEDIDA)?$/],
  ['preco', /^PRECO DE (RE)?VENDA$/], ['dataColeta', /^DATA DA COLETA$/]
];
const OBRIGATORIAS = ['municipio', 'estado', 'produto', 'preco', 'dataColeta'];

function parseData(v) {
  const s = String(v ?? '').trim();
  let d = null;
  if (/^\d+(\.\d+)?$/.test(s)) { // número de série do Excel
    const n = Number(s);
    if (n > 30000 && n < 80000) d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  } else {
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) d = iso(m[3], m[2], m[1]);
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = iso(m[1], m[2], m[3]);
  }
  return d && dataValida(d) ? d : null;
}
function parsePreco(v) {
  const s = String(v ?? '').trim();
  const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 1000) / 1000 : null;
}
function parseCnpj(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 1 && d.length <= 14 ? d.padStart(14, '0') : '';
}
const ehCuiabaMT = (municipio, estado) => norm(municipio) === 'CUIABA' && ['MT', 'MATO GROSSO'].includes(norm(estado));
const chaveDe = r => [r.cnpj || `${norm(r.razao)}/${norm(r.endereco)}/${norm(r.numero)}`, norm(r.produto), r.dataColeta].join('|');

// Lê a planilha e devolve o período de referência e os registros de Cuiabá/MT.
// Lança erro (sem devolver nada) se o arquivo for inválido, vazio ou incompleto.
function lerPlanilha(buf, { minLinhas = 100 } = {}) {
  const rows = readSheet(buf);
  const hi = rows.findIndex(r => { const v = Object.values(r).map(norm); return v.includes('PRODUTO') && v.includes('MUNICIPIO'); });
  if (hi < 0) throw new Error('planilha sem a linha de cabeçalho esperada (colunas PRODUTO e MUNICÍPIO)');

  const col = {};
  for (const [letra, titulo] of Object.entries(rows[hi])) {
    const campo = COLUNAS.find(([, re]) => re.test(norm(titulo)))?.[0];
    if (campo && !col[campo]) col[campo] = letra;
  }
  const faltando = OBRIGATORIAS.filter(c => !col[c]);
  if (!col.cnpj && !col.razao) faltando.push('cnpj/razao');
  if (faltando.length) throw new Error('planilha sem as colunas obrigatórias: ' + faltando.join(', '));

  const periodo = { inicio: null, fim: null, texto: '', id: null };
  for (const r of rows.slice(0, hi)) {
    const t = Object.values(r).join(' ');
    const m = norm(t).startsWith('PERIODO') && t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    const a = iso(m[3], m[2], m[1]), b = iso(m[6], m[5], m[4]);
    if (dataValida(a) && dataValida(b) && a <= b) Object.assign(periodo, { inicio: a, fim: b, texto: `${br(a)} a ${br(b)}`, id: `${a}_${b}` });
  }

  const dados = rows.slice(hi + 1).filter(r => Object.keys(r).length);
  if (dados.length < minLinhas) throw new Error(`planilha incompleta: ${dados.length} linhas de dados (mínimo esperado: ${minLinhas})`);

  const get = (r, campo) => (col[campo] ? limpo(r[col[campo]]) : '');
  const porChave = new Map();
  let cuiaba = 0, descartados = 0;
  for (const r of dados) {
    if (!ehCuiabaMT(get(r, 'municipio'), get(r, 'estado'))) continue;
    cuiaba++;
    const preco = parsePreco(get(r, 'preco')), dataColeta = parseData(get(r, 'dataColeta'));
    const reg = {
      cnpj: parseCnpj(get(r, 'cnpj')), razao: get(r, 'razao'), fantasia: get(r, 'fantasia'),
      endereco: get(r, 'endereco'), numero: get(r, 'numero'), complemento: get(r, 'complemento'),
      bairro: get(r, 'bairro'), cep: get(r, 'cep'), municipio: get(r, 'municipio'), uf: 'MT',
      bandeira: get(r, 'bandeira'), produto: get(r, 'produto'), unidade: get(r, 'unidade'),
      preco, dataColeta
    };
    // Não se inventa valor: linha sem preço, data, produto ou identificação do posto é descartada
    if (preco == null || !dataColeta || !reg.produto || (!reg.cnpj && !reg.razao)) { descartados++; continue; }
    reg.chave = chaveDe(reg);
    porChave.set(reg.chave, reg);
  }
  // Há semanas em que a ANP não pesquisa Cuiabá: a planilha é válida e a semana fica registrada sem preços
  if (descartados > cuiaba * 0.2) throw new Error(`planilha inconsistente: ${descartados} de ${cuiaba} linhas de Cuiabá com preço ou data inválidos`);
  return { periodo, linhasPlanilha: dados.length, descartados, registros: [...porChave.values()] };
}

/* ------------------------------------------------------------ Persistência */
// data/precos.json: { semanas: {id: {...}}, registros: [...], ultimaExecucao, ultimaImportacao, log: [...] }
const arquivoStore = dataDir => path.join(dataDir, 'precos.json');
const vazio = () => ({ versao: 1, fonte: LPC_PAGE, semanas: {}, registros: [], ultimaExecucao: null, ultimaImportacao: null, log: [] });

function carregar(dataDir = DATA_DIR) {
  let txt;
  try { txt = fs.readFileSync(arquivoStore(dataDir), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return vazio(); throw err; }
  const s = JSON.parse(txt); // base corrompida: falha em vez de ser sobrescrita
  if (!s || typeof s.semanas !== 'object' || !Array.isArray(s.registros)) throw new Error('data/precos.json com formato inesperado');
  return { ...vazio(), ...s };
}
// Gravação atômica: escreve em arquivo temporário e renomeia, para nunca deixar a base pela metade
function salvar(dataDir, store) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${arquivoStore(dataDir)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, arquivoStore(dataDir));
}

function travar(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const lock = path.join(dataDir, 'atualizacao.lock');
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > 15 * 60 * 1000) fs.unlinkSync(lock); // trava esquecida por execução interrompida
  } catch {}
  try { fs.closeSync(fs.openSync(lock, 'wx')); }
  catch (err) { if (err.code === 'EEXIST') throw new Error('já existe uma atualização de preços em andamento'); throw err; }
  return () => { try { fs.unlinkSync(lock); } catch {} };
}

/* ------------------------------------------------------------- Atualização */
async function baixar(fetchImpl, url, { tentativas = 3, esperaMs = 2000, timeoutMs = 60000, binario = false } = {}) {
  let ultimo;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : await r.text();
      const err = new Error(`HTTP ${r.status}`);
      err.definitivo = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
      throw err;
    } catch (err) {
      ultimo = err;
      if (err.definitivo || i === tentativas) break;
      await sleep(esperaMs * 3 ** (i - 1)); // falha temporária: espera e tenta de novo
    }
  }
  throw new Error(`${ultimo.message} (${url})`);
}

function aplicarSemana(store, id, plan, origem, em) {
  // Reimportação que voltaria vazia não apaga os preços que a semana já tinha
  if (!plan.registros.length && store.semanas[id]?.registros > 0) throw new Error('planilha sem registros de Cuiabá/MT; mantidos os dados já importados desta semana');
  const outras = store.registros.filter(r => r.semana !== id); // reimportação substitui só a própria semana
  const chaves = new Set(outras.map(r => r.chave));
  const novos = plan.registros.filter(r => !chaves.has(r.chave)).map(r => ({ semana: id, ...r }));
  store.registros = outras.concat(novos);
  store.semanas[id] = {
    inicio: plan.periodo.inicio || origem.inicio, fim: plan.periodo.fim || origem.fim,
    periodo: plan.periodo.texto || `${br(origem.inicio)} a ${br(origem.fim)}`,
    arquivo: origem.arquivo, url: origem.url, importadoEm: em,
    registros: novos.length, linhasPlanilha: plan.linhasPlanilha, descartados: plan.descartados
  };
  store.ultimaImportacao = { em, semana: id, arquivo: origem.arquivo };
  return novos.length;
}

// Verifica a página da ANP e importa as semanas mais recentes que ainda não estão na base.
// Nunca lança por falha de rede ou planilha inválida: registra o erro e preserva os dados existentes.
async function atualizar({ dataDir = DATA_DIR, fetchImpl = fetch, semanas = 4, forcar = false, esperaMs = 2000, minLinhas = 100, agora = () => new Date(), log = console.log } = {}) {
  const soltar = travar(dataDir);
  try {
    const store = carregar(dataDir);
    const em = agora().toISOString();
    const concluir = (resultado, mensagem, extra = {}) => {
      store.ultimaExecucao = { em, resultado, mensagem };
      store.log = [{ em, resultado, mensagem }, ...store.log].slice(0, 100);
      salvar(dataDir, store);
      log(`[precos] ${resultado}: ${mensagem}`);
      return { resultado, mensagem, importadas: [], erros: [], ...extra };
    };

    let lista;
    try { lista = listarPlanilhas(await baixar(fetchImpl, LPC_PAGE, { esperaMs })); }
    catch (err) { return concluir('erro', `não foi possível acessar a página da ANP: ${err.message}`, { erros: [{ arquivo: null, erro: err.message }] }); }
    if (!lista.length) return concluir('erro', 'nenhuma planilha "Preços por posto revendedor" encontrada na página da ANP', { erros: [{ arquivo: null, erro: 'link não encontrado' }] });

    const jaImportada = p => (p.id && store.semanas[p.id]) || Object.values(store.semanas).some(s => s.url === p.url);
    const pendentes = lista.slice(0, Math.max(1, semanas)).filter(p => forcar || !jaImportada(p)).reverse(); // da mais antiga para a mais nova
    const maisRecente = lista[0].id || lista[0].arquivo;
    if (!pendentes.length) return concluir('sem-novidade', `nenhuma planilha nova; semana mais recente publicada (${maisRecente}) já está na base`, { maisRecente });

    const importadas = [], erros = [];
    for (const p of pendentes) {
      try {
        const plan = lerPlanilha(await baixar(fetchImpl, p.url, { esperaMs, timeoutMs: 120000, binario: true }), { minLinhas });
        const id = plan.periodo.id || p.id; // o período escrito na planilha prevalece sobre o nome do arquivo
        if (!id) throw new Error('período de referência não identificado');
        if (store.semanas[id] && !forcar) { store.semanas[id].url = p.url; continue; } // mesmo período, arquivo republicado
        importadas.push({ semana: id, arquivo: p.arquivo, registros: aplicarSemana(store, id, plan, p, em) });
      } catch (err) {
        erros.push({ arquivo: p.arquivo, erro: err.message }); // semana com falha não entra; as demais e a base seguem intactas
      }
    }
    const resultado = importadas.length ? (erros.length ? 'parcial' : 'importado') : erros.length ? 'erro' : 'sem-novidade';
    const partes = [];
    if (importadas.length) partes.push('importadas ' + importadas.map(i => `${i.semana} (${i.registros ? i.registros + ' registros' : 'Cuiabá não pesquisada'})`).join(', '));
    if (erros.length) partes.push('falhas: ' + erros.map(e => `${e.arquivo}: ${e.erro}`).join('; '));
    return concluir(resultado, partes.join(' | ') || 'nenhuma planilha nova', { importadas, erros, maisRecente });
  } finally {
    soltar();
  }
}

/* ---------------------------------------------------------------- Consulta */
function erro400(msg) { return Object.assign(new Error(msg), { status: 400 }); }

// Filtros: combustivel, bairro, bandeira (aceitam lista separada por vírgula), precoMin, precoMax,
// coletaDe, coletaAte (AAAA-MM-DD), semanas (N mais recentes; padrão 1; "todas") ou semana (id específico).
function consultar(store, q = {}) {
  if (q.municipio != null && norm(q.municipio) !== 'CUIABA') throw erro400('somente o município de CUIABA está disponível');
  if (q.uf != null && !['MT', 'MATO GROSSO'].includes(norm(q.uf))) throw erro400('somente a UF MT está disponível');
  const numero = (v, nome) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n)) throw erro400(`${nome} inválido`); return n; };
  const data = (v, nome) => { if (v == null || v === '') return null; if (!dataValida(v)) throw erro400(`${nome} inválida (use AAAA-MM-DD)`); return v; };
  const lista = v => (v == null || v === '' ? null : String(v).split(',').map(norm).filter(Boolean));

  // Semanas em que a ANP não pesquisou Cuiabá ficam fora da contagem de "N mais recentes"
  const ids = Object.keys(store.semanas).sort().reverse().filter(id => store.semanas[id].registros > 0);
  let escopo;
  if (q.semana) escopo = ids.filter(i => i === q.semana);
  else if (norm(q.semanas) === 'TODAS') escopo = ids;
  else {
    const n = q.semanas == null || q.semanas === '' ? 1 : parseInt(q.semanas, 10);
    if (!(n >= 1)) throw erro400('semanas inválido (use um número ou "todas")');
    escopo = ids.slice(0, n);
  }
  const noEscopo = new Set(escopo);
  const base = store.registros.filter(r => noEscopo.has(r.semana));

  const combustivel = lista(q.combustivel), bairro = lista(q.bairro), bandeira = lista(q.bandeira);
  const precoMin = numero(q.precoMin, 'precoMin'), precoMax = numero(q.precoMax, 'precoMax');
  const coletaDe = data(q.coletaDe, 'coletaDe'), coletaAte = data(q.coletaAte, 'coletaAte');
  const registros = base.filter(r =>
    (!combustivel || combustivel.includes(norm(r.produto))) &&
    (!bairro || bairro.includes(norm(r.bairro))) &&
    (!bandeira || bandeira.includes(norm(r.bandeira))) &&
    (precoMin == null || r.preco >= precoMin) && (precoMax == null || r.preco <= precoMax) &&
    (!coletaDe || r.dataColeta >= coletaDe) && (!coletaAte || r.dataColeta <= coletaAte)
  ).sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR') || a.preco - b.preco || b.dataColeta.localeCompare(a.dataColeta));

  const unicos = campo => [...new Map(base.map(r => [norm(r[campo]), r[campo]])).values()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ultima = ids[0] ? { id: ids[0], ...store.semanas[ids[0]] } : null;
  return {
    municipio: 'CUIABA', uf: 'MT', fonte: LPC_PAGE, aviso: AVISO,
    ultimaAtualizacao: store.ultimaImportacao?.em || null,
    ultimaExecucao: store.ultimaExecucao,
    semanaReferencia: ultima && { id: ultima.id, inicio: ultima.inicio, fim: ultima.fim, periodo: ultima.periodo, arquivo: ultima.arquivo },
    semanasConsultadas: escopo,
    semanasDisponiveis: ids.map(id => ({ id, periodo: store.semanas[id].periodo, registros: store.semanas[id].registros })),
    filtros: { combustiveis: unicos('produto'), bairros: unicos('bairro'), bandeiras: unicos('bandeira') },
    total: registros.length,
    registros
  };
}

module.exports = { LPC_PAGE, DATA_DIR, AVISO, norm, listarPlanilhas, lerPlanilha, ehCuiabaMT, parseData, parsePreco, carregar, salvar, atualizar, consultar };
