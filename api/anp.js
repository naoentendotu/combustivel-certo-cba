"use strict";
const { defaultApp } = require("../server");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }

  try {
    const data = await defaultApp.getCadastro();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(typeof data === "string" ? data : JSON.stringify(data));
  } catch (err) {
    const status = err.status || 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = status;
    res.end(JSON.stringify({ erro: err.message }));
  }
};
