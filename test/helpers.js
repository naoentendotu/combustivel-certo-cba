'use strict';
// Apoio aos testes: gera planilhas .xlsx mínimas no layout da ANP e um fetch falso.
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LPC_PAGE } = require('../lib/anp-precos');

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ZIP sem compressão com um único arquivo (o suficiente para o leitor de .xlsx)
function zip(name, content) {
  const data = Buffer.from(content, 'utf8'), nome = Buffer.from(name, 'utf8'), crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nome.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nome.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nome.length, 12); end.writeUInt32LE(30 + nome.length + data.length, 16);
  return Buffer.concat([local, nome, data, central, nome, end]);
}

function xlsx(rows) {
  const body = rows.map((cells, r) => `<row r="${r + 1}">` + cells.map((v, c) => {
    const ref = String.fromCharCode(65 + c) + (r + 1);
    if (v == null || v === '') return `<c r="${ref}"/>`;
    return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return zip('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`);
}

const CABECALHO = ['CNPJ', 'RAZÃO', 'FANTASIA', 'ENDEREÇO', 'NÚMERO', 'COMPLEMENTO', 'BAIRRO', 'CEP', 'MUNICÍPIO', 'ESTADO', 'BANDEIRA', 'PRODUTO', 'UNIDADE DE MEDIDA', 'PREÇO DE REVENDA', 'DATA DA COLETA'];
const linha = (o = {}) => [
  o.cnpj ?? 7628437000113, o.razao ?? 'AUTO POSTO VITORIA LTDA', o.fantasia ?? '', o.endereco ?? 'RUA PARNAIBA', o.numero ?? 'S/N', o.complemento ?? '',
  o.bairro ?? 'PRAEIRO', o.cep ?? 78070000, o.municipio ?? 'CUIABA', o.estado ?? 'MATO GROSSO', o.bandeira ?? 'BRANCA',
  o.produto ?? 'GASOLINA COMUM', o.unidade ?? 'R$ / litro', o.preco ?? 7.17, o.data ?? 46300
];
// Linhas de outros municípios, para a planilha ter o volume de uma publicação real
const enchimento = (n = 120) => Array.from({ length: n }, (_, i) => linha({ cnpj: 49051667000102 + i, razao: 'POSTO DE FORA ' + i, municipio: 'GUARULHOS', estado: 'SAO PAULO', preco: 6.5 + (i % 9) / 10 }));

// Planilha no layout da ANP: títulos, período, cabeçalho e dados
function planilhaAnp({ periodo = '04/10/2026 A 10/10/2026', linhas = [], extras = 120, cabecalho = CABECALHO } = {}) {
  return xlsx([
    ['AGÊNCIA NACIONAL DO PETRÓLEO, GÁS NATURAL E BIOCOMBUSTÍVEIS - ANP'], ['SISTEMA DE LEVANTAMENTO DE PREÇOS'], [],
    ['INTERVALO DE TEMPO: SEMANAL'], [`PERÍODO: ${periodo}`], ['COMBUSTÍVEL: TODOS'], [],
    cabecalho, ...enchimento(extras), ...linhas.map(linha)
  ]);
}

const urlPlanilha = nome => `https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/${nome}`;
// Página da ANP com os links na ordem dada (cada item: nome do arquivo de preços por posto)
function pagina(arquivos) {
  return '<html><body>' + arquivos.map(nome => `
    <a href="${urlPlanilha(nome.replace('revendas_lpc', 'resumo_semanal_lpc'))}" class="internal-link">Preços médios semanais: Brasil, regiões, estados e municípios</a>
    <a target="_blank" href="${urlPlanilha(nome)}" class="internal-link">Preços por posto revendedor (combustíveis automotivos e GLP P13)</a>`).join('') +
    '<a href="/anp/pt-br/outra-coisa.pdf">Outro documento</a></body></html>';
}

// fetch falso: rotas = { url: Buffer | string | Error | função }. Guarda as URLs chamadas em .chamadas
function fetchFalso(rotas) {
  const f = async url => {
    f.chamadas.push(String(url));
    let r = rotas[String(url)];
    if (typeof r === 'function') r = r(f.chamadas.filter(u => u === String(url)).length);
    if (r instanceof Error) throw r;
    if (r == null) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    if (typeof r === 'number') return { ok: false, status: r, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = Buffer.isBuffer(r) ? r : Buffer.from(r, 'utf8');
    return { ok: true, status: 200, text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  };
  f.chamadas = [];
  return f;
}

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-precos-'));

module.exports = { xlsx, planilhaAnp, linha, pagina, urlPlanilha, fetchFalso, pastaTemp, CABECALHO, LPC_PAGE };
