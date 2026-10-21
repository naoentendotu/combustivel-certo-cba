"use strict";
const { criarServico, lerCorpo, ipDe } = require("../lib/contribuicoes");

const servico = criarServico();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    return res.end();
  }

  try {
    const data =
      req.method === "POST"
        ? await servico.enviar(await lerCorpo(req), ipDe(req))
        : await servico.listar();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    const status = err.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = status;
    res.end(JSON.stringify({ erro: err.message }));
  }
};
