"use strict";
const { defaultApp } = require("../../server");

function extrairQuery(req) {
  if (req.query && typeof req.query === "object" && Object.keys(req.query).length > 0) {
    return req.query;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    return Object.fromEntries(url.searchParams);
  } catch {
    return {};
  }
}

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
    const query = extrairQuery(req);
    const data = await defaultApp.getPrecos(query);
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
