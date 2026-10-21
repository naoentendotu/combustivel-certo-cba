"use strict";
// Preços informados pelos usuários, sem cadastro. Ficam pendentes até outra pessoa (outro aparelho e outra rede)
// informar o mesmo valor; só então aparecem como confirmados. A foto é lida no navegador e nunca chega aqui.
//   Banco: Upstash Redis pela API REST (UPSTASH_REDIS_REST_URL / _TOKEN); sem elas, memória (só para dev local).
const crypto = require("crypto");
const precos = require("./anp-precos");
const { ANP_SNAPSHOT, ANP_SNAPSHOT_VG, FUELS } = require("../public/js/data/stations-data");

const PRODUTO = { gasolina: "GASOLINA COMUM", etanol: "ETANOL", diesel: "DIESEL S10" };
const POSTOS = new Map(
  [...ANP_SNAPSHOT, ...ANP_SNAPSHOT_VG].map((r) => [r[0], { lat: r[5], lng: r[6] }]),
);
const MAX_DIST_M = 300;
const FAIXA_ANP = 0.25; // até 25% acima ou abaixo da média da última pesquisa da ANP
const TOLERANCIA = 0.02; // R$ de diferença que ainda conta como o mesmo preço
const JANELA_MS = 48 * 3600 * 1000; // a confirmação vale até 48 h depois do envio
const TTL_S = 7 * 24 * 3600; // um envio some depois de 7 dias
const LIMITE_HORA = 10; // envios por rede por hora
const MAX_ENVIOS = 20; // por posto e combustível

function erro(status, msg) {
  return Object.assign(new Error(msg), { status });
}

function distanciaM(a, b) {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

// Média da semana mais recente da ANP por combustível, para barrar preço absurdo
function mediasAnp(dataDir = precos.DATA_DIR) {
  const { registros } = precos.consultar(precos.carregar(dataDir));
  const medias = {};
  for (const [fuel, produto] of Object.entries(PRODUTO)) {
    const p = registros.filter((r) => r.produto === produto).map((r) => r.preco);
    if (p.length) medias[fuel] = p.reduce((s, v) => s + v, 0) / p.length;
  }
  return medias;
}

// Confere o envio inteiro; devolve { cnpj, precos: { fuel: preco }, ocr } ou lança erro 400
function validar(corpo, medias = {}) {
  const c = corpo && typeof corpo === "object" ? corpo : {};
  const posto = POSTOS.get(String(c.cnpj));
  if (!posto) throw erro(400, "posto desconhecido");
  if (!(Number.isFinite(c.lat) && Number.isFinite(c.lng)))
    throw erro(400, "é preciso a localização para informar um preço");
  if (distanciaM(posto, c) > MAX_DIST_M)
    throw erro(400, "você precisa estar no posto para informar o preço");
  const saida = {};
  for (const [fuel, v] of Object.entries(c.precos || {})) {
    if (!PRODUTO[fuel]) throw erro(400, "combustível inválido: " + fuel);
    const preco = Math.round(Number(v) * 1000) / 1000;
    const m = medias[fuel];
    const [min, max] = m ? [m * (1 - FAIXA_ANP), m * (1 + FAIXA_ANP)] : [2, 15];
    if (!(preco >= min && preco <= max))
      throw erro(400, `preço de ${FUELS.find((f) => f.id === fuel).label} fora da faixa esperada`);
    saida[fuel] = preco;
  }
  if (!Object.keys(saida).length) throw erro(400, "informe pelo menos um preço");
  return { cnpj: String(c.cnpj), precos: saida, ocr: c.ocr === true };
}

// Situação do preço de um posto/combustível a partir dos envios (mais novo primeiro)
function estado(envios) {
  const [ultimo] = envios;
  if (!ultimo) return null;
  const iguais = envios.filter(
    (e) => Math.abs(e.preco - ultimo.preco) <= TOLERANCIA && ultimo.ts - e.ts <= JANELA_MS,
  );
  const aparelhos = new Set(iguais.map((e) => e.disp)).size;
  const redes = new Set(iguais.map((e) => e.ip)).size;
  return {
    preco: ultimo.preco,
    ts: ultimo.ts,
    estado: aparelhos >= 2 && redes >= 2 ? "confirmado" : "pendente",
    confirmacoes: Math.min(aparelhos, redes),
  };
}

/* ------------------------------------------------------------------ Banco */
function redis(url, token, fetchImpl = fetch) {
  const pipe = async (cmds) => {
    const r = await fetchImpl(url + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw erro(502, "banco respondeu HTTP " + r.status);
    return (await r.json()).map((x) => {
      if (x.error) throw erro(502, "banco: " + x.error);
      return x.result;
    });
  };
  return {
    async adicionar(chave, item) {
      await pipe([
        ["LPUSH", chave, JSON.stringify(item)],
        ["LTRIM", chave, 0, MAX_ENVIOS - 1],
        ["EXPIRE", chave, TTL_S],
        ["SADD", "contrib:idx", chave],
      ]);
    },
    async listar(chave) {
      const [itens] = await pipe([["LRANGE", chave, 0, -1]]);
      return itens.map((s) => JSON.parse(s));
    },
    async todos() {
      const [chaves] = await pipe([["SMEMBERS", "contrib:idx"]]);
      if (!chaves.length) return {};
      const listas = await pipe(chaves.map((k) => ["LRANGE", k, 0, -1]));
      return Object.fromEntries(chaves.map((k, i) => [k, listas[i].map((s) => JSON.parse(s))]));
    },
    async contar(chave) {
      const [n] = await pipe([["INCR", chave], ["EXPIRE", chave, 3600, "NX"]]);
      return n;
    },
  };
}

// shortcut: memória some ao reiniciar e não é compartilhada entre funções; só para rodar local sem o Upstash
function memoria() {
  const listas = new Map(),
    contadores = new Map();
  return {
    async adicionar(chave, item) {
      listas.set(chave, [item, ...(listas.get(chave) || [])].slice(0, MAX_ENVIOS));
    },
    async listar(chave) {
      return listas.get(chave) || [];
    },
    async todos() {
      return Object.fromEntries(listas);
    },
    async contar(chave) {
      const c = contadores.get(chave);
      const novo = c && c.ate > Date.now() ? { n: c.n + 1, ate: c.ate } : { n: 1, ate: Date.now() + 3600000 };
      contadores.set(chave, novo);
      return novo.n;
    },
  };
}

function criarServico({ env = process.env, fetchImpl = fetch, dataDir = precos.DATA_DIR, agora = Date.now } = {}) {
  const banco =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? redis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, fetchImpl)
      : memoria();
  const sal = env.CONTRIB_SAL || "dev";
  // Guarda só o hash do IP (LGPD): serve para contar redes diferentes, não para identificar ninguém
  const hashIp = (ip) => crypto.createHash("sha256").update(sal + ip).digest("hex").slice(0, 16);
  const recentes = (envios) => envios.filter((e) => agora() - e.ts <= TTL_S * 1000);

  // { [cnpj]: { [fuel]: { preco, ts, estado, confirmacoes } } }
  async function listar() {
    const saida = {};
    for (const [chave, envios] of Object.entries(await banco.todos())) {
      const [, cnpj, fuel] = chave.split(":");
      const e = estado(recentes(envios));
      if (e) (saida[cnpj] ||= {})[fuel] = e;
    }
    return saida;
  }

  async function enviar(corpo, ip) {
    const ok = validar(corpo, mediasAnp(dataDir));
    const rede = hashIp(ip || "");
    if ((await banco.contar("rl:" + rede)) > LIMITE_HORA)
      throw erro(429, "muitos envios desta rede; tente de novo em 1 hora");
    const disp = String(corpo.disp || "").slice(0, 64) || rede;
    const saida = {};
    for (const [fuel, preco] of Object.entries(ok.precos)) {
      const chave = `contrib:${ok.cnpj}:${fuel}`;
      await banco.adicionar(chave, { preco, ts: agora(), disp, ip: rede, ocr: ok.ocr });
      saida[fuel] = estado(recentes(await banco.listar(chave)));
    }
    return saida;
  }

  return { listar, enviar };
}

// Corpo JSON de até 2 KB; no Vercel o req.body já vem lido
async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let s = "";
  for await (const parte of req) {
    s += parte;
    if (s.length > 2048) throw erro(413, "envio grande demais");
  }
  try {
    return JSON.parse(s || "{}");
  } catch {
    throw erro(400, "JSON inválido");
  }
}

const ipDe = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";

module.exports = { validar, estado, distanciaM, criarServico, lerCorpo, ipDe, MAX_DIST_M };
