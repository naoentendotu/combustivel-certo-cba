"use strict";
// Camada de serviços de API compartilhada entre server.js (local) e funções serverless (Vercel)
const precos = require("./anp-precos");

const ANP_URL = "https://revendedoresapi.anp.gov.br/v1/combustivel";
const ANP_MUNICIPIOS = ["CUIABA", "VARZEA GRANDE"];

// Uma consulta por cidade à ANP, devolvidas juntas no mesmo formato da API
async function baixarCadastro(fetchImpl) {
  const partes = await Promise.all(
    ANP_MUNICIPIOS.map(async (m) => {
      const r = await fetchImpl(
        `${ANP_URL}?municipio=${encodeURIComponent(m)}&uf=MT`,
        { signal: AbortSignal.timeout(30000) },
      );
      if (!r.ok) throw new Error("ANP respondeu HTTP " + r.status);
      return JSON.parse(await r.text());
    }),
  );
  return JSON.stringify({
    ...partes[0],
    data: partes.flatMap((p) => p.data || []),
  });
}
const CADASTRO_CACHE_MS = 60 * 60 * 1000; // 1 consulta por hora

let cacheCadastro = { ts: 0, body: null };

async function getCadastro(fetchImpl = fetch) {
  if (
    !cacheCadastro.body ||
    Date.now() - cacheCadastro.ts > CADASTRO_CACHE_MS
  ) {
    cacheCadastro = { ts: Date.now(), body: await baixarCadastro(fetchImpl) };
  }
  return cacheCadastro.body;
}

function getPrecos(query = {}, dataDir = precos.DATA_DIR) {
  const store = precos.carregar(dataDir);
  return { ...precos.consultar(store, query), atualizando: false };
}

function getStatus(dataDir = precos.DATA_DIR) {
  const s = precos.carregar(dataDir);
  return {
    fonte: s.fonte,
    atualizando: false,
    ultimaExecucao: s.ultimaExecucao,
    ultimaImportacao: s.ultimaImportacao,
    registros: s.registros.length,
    semanas: Object.keys(s.semanas)
      .sort()
      .reverse()
      .map((id) => ({ id, ...s.semanas[id] })),
    log: s.log,
  };
}

module.exports = {
  getCadastro,
  getPrecos,
  getStatus,
  ANP_URL,
  CADASTRO_CACHE_MS,
};
