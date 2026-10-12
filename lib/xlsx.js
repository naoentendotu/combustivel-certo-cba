'use strict';
// Leitor mínimo de .xlsx (sem dependências): o arquivo é um ZIP com XMLs.
const zlib = require('zlib');

function unzip(buf) {
  const out = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  if (end < 0) throw new Error('arquivo não é um .xlsx válido (ZIP sem diretório central)');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('arquivo .xlsx corrompido ou incompleto');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + size > buf.length) throw new Error('arquivo .xlsx corrompido ou incompleto');
    const data = buf.subarray(start, start + size);
    out[name] = () => (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescapeXml = s => s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (m, k) =>
  k[0] === '#' ? String.fromCodePoint(+k.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k]);
const textOf = xml => unescapeXml([...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join(''));

// Lê a primeira planilha do arquivo e devolve as linhas como { A: valor, B: valor, ... }
function readSheet(buf) {
  const zip = unzip(buf);
  const sheet = Object.keys(zip).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
  if (!sheet) throw new Error('arquivo .xlsx sem planilha');
  const strings = zip['xl/sharedStrings.xml']
    ? [...zip['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]))
    : [];
  const rows = [];
  for (const rm of zip[sheet]().matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row = {};
    for (const c of (rm[1] || '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2], inner = c[3];
      if (inner == null) continue;
      const v = inner.match(/<v>([^<]*)<\/v>/);
      if (/t="s"/.test(attrs)) { if (v) row[c[1]] = strings[+v[1]] ?? ''; }
      else if (/t="inlineStr"/.test(attrs)) row[c[1]] = textOf(inner);
      else if (v) row[c[1]] = unescapeXml(v[1]);
    }
    rows.push(row);
  }
  return rows;
}

module.exports = { readSheet };
