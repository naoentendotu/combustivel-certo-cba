"use strict";
// Servidor do Combustível Certo (Node 18+, sem dependências).
//   /                    index.html
//   /api/anp             cadastro de postos de Cuiabá (API de Revendedores da ANP, que não aceita chamadas do navegador)
//   /api/precos          preços por posto em Cuiabá/MT (base local alimentada pela coleta semanal da ANP)
//   /api/precos/status   situação da coleta: última execução, semanas importadas, histórico de tentativas
// Uso:  node server.js   →   http://localhost:8080
const http = require("http");
const fs = require("fs");
const path = require("path");
const precos = require("./lib/anp-precos");

/* ------------------------------------------------------- Cadastro de postos */
const ANP_URL =
  "https://revendedoresapi.anp.gov.br/v1/combustivel?municipio=CUIABA&uf=MT";
const CADASTRO_CACHE_MS = 60 * 60 * 1000; // o cadastro muda pouco: 1 consulta à ANP por hora

function criarServidor({
  dataDir = precos.DATA_DIR,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  let cadastro = { ts: 0, body: null };
  async function getCadastro() {
    if (!cadastro.body || Date.now() - cadastro.ts > CADASTRO_CACHE_MS) {
      const r = await fetchImpl(ANP_URL, {
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error("ANP respondeu HTTP " + r.status);
      cadastro = { ts: Date.now(), body: await r.text() };
    }
    return cadastro.body;
  }

  /* -------------------------------------------------------------- Preços */
  let emAndamento = null;
  // Uma atualização por vez; devolve o resultado (ou { resultado: 'erro' } se nem chegou a rodar)
  function atualizarPrecos(opcoes = {}) {
    return (emAndamento ||= precos
      .atualizar({ dataDir, fetchImpl, log, ...opcoes })
      .catch((err) => {
        log("[precos] erro: " + err.message);
        return {
          resultado: "erro",
          mensagem: err.message,
          importadas: [],
          erros: [{ arquivo: null, erro: err.message }],
        };
      })
      .finally(() => {
        emAndamento = null;
      }));
  }
  async function getPrecos(query) {
    let store = precos.carregar(dataDir);
    if (!Object.keys(store.semanas).length && emAndamento) {
      await emAndamento;
      store = precos.carregar(dataDir);
    } // primeira carga
    return { ...precos.consultar(store, query), atualizando: !!emAndamento };
  }
  function getStatus() {
    const s = precos.carregar(dataDir);
    return {
      fonte: s.fonte,
      atualizando: !!emAndamento,
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

  /* ------------------------------------------------------------- Rotas */
  async function json(res, produce) {
    try {
      const body = await produce();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    } catch (err) {
      const status = err.status || 502;
      if (status >= 500) log("[api] " + err.message);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ erro: err.message }));
    }
  }

  const handler = (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    const url = new URL(req.url, "http://localhost");
    if (req.method !== "GET" && req.method !== "HEAD")
      return res.writeHead(405).end();
    if (url.pathname === "/api/anp") return json(res, getCadastro);
    if (url.pathname === "/api/precos" || url.pathname === "/api/precos/")
      return json(res, () => getPrecos(Object.fromEntries(url.searchParams)));
    if (url.pathname === "/api/precos/status") return json(res, getStatus);
    const MIME = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    };
    const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(__dirname, "public", safePath);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cache-Control": ext === ".html" ? "no-cache" : "no-cache",
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    } catch {}
    res.writeHead(404).end("Not found");
  };

  const server = http.createServer(handler);

  return {
    server,
    handler,
    atualizarPrecos,
    getCadastro,
    getPrecos,
    getStatus,
  };
}

/* --------------------------------------------------------- Agendamento semanal */
// Próxima ocorrência de (dia da semana, hora) no horário do servidor, estritamente depois de "agora"
function proximaExecucao(agora, diaSemana, hora) {
  const d = new Date(agora);
  d.setHours(hora, 0, 0, 0);
  d.setDate(d.getDate() + ((diaSemana - d.getDay() + 7) % 7));
  if (d <= agora) d.setDate(d.getDate() + 7);
  return d;
}

// Roda a coleta toda semana no dia/hora configurados, sem depender de alguém abrir o site.
// Falha: tenta de novo em 1 h (até 6 vezes). Sem planilha nova na data: confere 1 vez por dia até ela sair.
function agendarSemanal(
  atualizarPrecos,
  { diaSemana, hora, dataDir = precos.DATA_DIR, log = console.log },
) {
  const HORA = 60 * 60 * 1000;
  let falhas = 0;
  const programar = (quando, motivo) => {
    log(
      `[precos] próxima verificação: ${quando.toLocaleString("pt-BR")} (${motivo})`,
    );
    setTimeout(rodar, Math.max(1000, quando - Date.now())).unref?.();
  };
  async function rodar() {
    const r = await atualizarPrecos();
    const semanal = proximaExecucao(new Date(), diaSemana, hora);
    if (r.resultado === "erro" || r.resultado === "parcial") {
      if (++falhas <= 6)
        return programar(
          new Date(Date.now() + HORA),
          `nova tentativa ${falhas}/6 após falha`,
        );
    } else if (r.resultado === "sem-novidade") {
      falhas = 0;
      const amanha = new Date(Date.now() + 24 * HORA);
      if (amanha < semanal && semanaAtrasada(dataDir))
        return programar(amanha, "ANP ainda não publicou a semana nova");
    }
    falhas = 0;
    programar(semanal, "agenda semanal");
  }
  // A ANP publica cada semana (domingo a sábado) poucos dias depois do fim dela.
  // Se a última semana importada terminou há mais de 9 dias, a publicação nova está atrasada.
  function semanaAtrasada(dir) {
    try {
      const fim = Object.values(precos.carregar(dir).semanas)
        .map((s) => s.fim)
        .sort()
        .pop();
      return !fim || Date.now() - Date.parse(fim + "T23:59:59") > 9 * 24 * HORA;
    } catch {
      return false;
    }
  }

  // Ao subir: atualiza já se a base está vazia ou a última verificação tem mais de 7 dias
  let ultima = 0;
  try {
    ultima = Date.parse(precos.carregar(dataDir).ultimaExecucao?.em || 0) || 0;
  } catch (err) {
    log("[precos] " + err.message);
  }
  let vazia = true;
  try {
    vazia = !precos.carregar(dataDir).registros.length;
  } catch {}
  if (vazia || Date.now() - ultima > 7 * 24 * HORA) rodar();
  else
    programar(proximaExecucao(new Date(), diaSemana, hora), "agenda semanal");
}

const defaultApp = criarServidor();

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8080;
  const HOST = process.env.HOST || "127.0.0.1";
  defaultApp.server.listen(PORT, HOST, () => {
    console.log(
      `Combustível Certo em http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`,
    );
    if (process.env.PRECOS_AGENDAR !== "0") {
      agendarSemanal(defaultApp.atualizarPrecos, {
        diaSemana: Number(process.env.PRECOS_DIA_SEMANA ?? 1), // 0 = domingo ... 6 = sábado (padrão: segunda)
        hora: Number(process.env.PRECOS_HORA ?? 10),
      });
    }
  });
}

const serverlessHandler = (req, res) => defaultApp.handler(req, res);
serverlessHandler.criarServidor = criarServidor;
serverlessHandler.proximaExecucao = proximaExecucao;
serverlessHandler.defaultApp = defaultApp;

module.exports = serverlessHandler;
