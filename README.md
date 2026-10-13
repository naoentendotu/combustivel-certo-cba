# Combustível Certo — Cuiabá/MT

Aplicação web moderna, leve e responsiva para consulta, visualização e comparação de preços de combustíveis nos postos de Cuiabá-MT, utilizando dados abertos oficiais da ANP (Agência Nacional do Petróleo, Gás Natural e Biocombustíveis).

Desenvolvido em **Node.js 20+ com zero dependências externas** no backend e interface componentizada em HTML, CSS e Vanilla JavaScript.

---

## Sobre o projeto

### O problema que resolve
Encontrar o combustível mais barato exige comparar valores dispersos pela cidade. O **Combustível Certo** consolida os preços pesquisados semanalmente pela ANP em Cuiabá-MT, permitindo que o motorista identifique rapidamente:
- O menor preço perto de sua localização atual (via GPS).
- O menor preço absoluto da cidade por tipo de combustível (Gasolina Comum, Etanol, Diesel S10, Diesel S500 ou GNV).
- A diferença de economia em relação à média dos postos.
- Traçado de rota direto no Google Maps.

### Principais funcionalidades
- **Mapa (tela inicial):** cada posto é um marcador com o preço. O menor preço fica em verde cheio; o terço mais barato aparece em verde e o terço mais caro, apagado. Preço fora da última semana pesquisada vem em âmbar com ícone de atenção.
- **Painel do mapa:** no celular é uma folha inferior com o posto selecionado (preço, data da coleta, custo do tanque e rota) que abre para a lista; no desktop a lista fica fixa ao lado do mapa. Filtros: *Menor preço*, *Mais perto* e *Ocultar sem preço* (ligado por padrão, atrás do botão de filtros).
- **Lista:** o menor preço do momento em destaque, com a diferença para a média, e todos os postos em ordem, cada um com a data da coleta. Filtros por faixa de preço (barra de duas pontas), bandeira (chips) e bairro (seletor).
- **Histórico de preço:** em qualquer posto com preço, o botão de histórico abre o gráfico e as coletas da ANP daquele posto em 1 mês ou em todo o histórico.
- **10 mais baratos:** ranking com a variação de preço de cada posto em 1 mês ou em todo o histórico. Tocar num posto leva ao mapa.
- **Etanol ou gasolina:** em cada posto com os dois preços, a dica "Etanol ou gasolina?" no resumo abre, ao toque, um balão com as duas opções e a vantagem de cada uma (custo por km pela regra dos 70%, autonomia e valor para encher o tanque).
- **Tendência da semana:** um aviso no mapa e na lista, que a pessoa fecha depois de ler, com quanto o preço médio subiu ou caiu em relação à semana anterior, comparando só os postos pesquisados nas duas semanas.
- **Compartilhar:** envia o preço de um posto pelo compartilhamento do celular (ou WhatsApp), com um link que abre o app naquele posto.
- **Meu carro:** no seletor de veículo, a pessoa adiciona o próprio carro com o tamanho do tanque; ele fica salvo no navegador e pode ser editado ou removido.
- **Estados:** carregamento, erro (com "Tentar de novo") e vazio explicados no mapa, na lista, no histórico e no ranking.

### Implementações futuras
- **Rota desenhada no mapa:** traçar o trajeto de carro até o posto selecionado (ou o destacado) dentro do próprio mapa, com um servidor próprio do [OSRM](https://github.com/Project-OSRM/osrm-backend). Hoje o botão "Traçar rota" abre o trajeto no Google Maps.

### Fonte de dados e limitações
1. **Cadastro dos postos:** Obtido via API de Revendedores da ANP (`/api/anp`), mapeado com coordenadas geográficas de Cuiabá.
2. **Preços oficiais:** Coletados do [Levantamento de Preços de Combustíveis (LPC)](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas) da ANP.
3. **Limitações reais:**
   - A pesquisa da ANP é **amostral**: visita uma parcela dos postos da cidade (cerca de 20 a 30 postos por semana com gasolina em Cuiabá, de um total de ~147 cadastrados).
   - Os preços refletem a data da visita do fiscal da ANP e podem sofrer alterações no posto antes da próxima pesquisa.
   - Quando a ANP não realiza pesquisa em Cuiabá em determinada semana, a semana é registrada sem preços e o histórico anterior é rigorosamente preservado. Nenhum valor é inventado ou estimado.

---

## Tecnologias

### Backend & Ferramentas
- **Node.js (>= 20):** Módulos nativos (`node:http`, `node:fs`, `node:path`, `node:zlib`, `fetch`). Zero pacotes externos no `package.json`.
- **Parser de XLSX Próprio (`lib/xlsx.js`):** Leitor de planilhas Excel puro via descompactação ZIP e leitura de XML, sem bibliotecas pesadas.
- **Node Test Runner:** Testes automatizados executados pelo test runner nativo (`node:test` e `node:assert/strict`).

### Frontend
- **HTML5 Semântico:** Estrutura acessível com metatags responsivas.
- **CSS próprio (`public/css/app.css`):** design system em variáveis CSS (cores, raios, sombras, tipografia) e componentes. Sem framework de CSS.
- **Tipografia:** Barlow para texto e Barlow Semi Condensed para preços, via Google Fonts.
- **Leaflet (1.9.4 CDN):** Renderização de mapas e camadas interativas.
- **Lucide Icons (CDN):** Ícones vetoriais em substituição a emojis e caracteres Unicode.
- **Web Awesome 3:** componentes de formulário (seletor de veículo e de bairro, barra de faixa de preço e campos do "Meu carro"), carregados por CDN, sem etapa de build.

### Serviços Externos
- **OpenStreetMap / CartoDB:** Camadas de mapa (tiles).
- **Google Maps:** Destino para rotas de navegação no trânsito.
- **Gov.br / ANP:** Fonte primária governamental dos dados de preços e cadastro de postos.

---

## Estrutura do projeto

```
combustivel-certo/
├── api/                     # Funções serverless do Vercel (anp, precos, precos/status)
├── data/
│   └── precos.json          # Histórico consolidado das coletas da ANP em Cuiabá
├── lib/
│   ├── anp-precos.js        # Módulo de scraping, validação, persistência e consulta
│   ├── api-service.js       # Serviço compartilhado pelas funções de api/
│   └── xlsx.js              # Leitor nativo de arquivos .xlsx sem dependências
├── public/                  # Site (única cópia): servido pelo server.js e publicado pelo Vercel
│   ├── assets/              # Identidade visual (logo.png, logo-icon.png, favicon.svg, favicon.png, apple-touch-icon.png)
│   ├── css/
│   │   └── app.css          # Design system, temas, mapa, bottom sheet e navegação
│   ├── js/
│   │   ├── calc.js          # Contas sem tela: etanol x gasolina e tendência da semana
│   │   ├── app.js           # Orquestrador central e gerenciador de estado da aplicação
│   │   ├── components/
│   │   │   ├── ui.js            # Peças compartilhadas: linha de posto, paginação, data da coleta, avisos
│   │   │   ├── bottom-sheet.js  # Painel do mapa: folha inferior no celular, coluna fixa no desktop
│   │   │   ├── list-view.js     # Lista com menor preço em destaque e filtros
│   │   │   ├── map-view.js      # Integração com Leaflet, pins e geolocalização
│   │   │   ├── modals.js        # Ranking dos 10 mais baratos e histórico de preço do posto
│   │   │   └── nav.js           # Navegação: barra inferior no celular, lateral no desktop
│   │   └── data/
│   │       └── stations-data.js # Base geoespacial local de postos de Cuiabá (fallback)
│   └── index.html           # Aplicação web principal de página única
├── scripts/
│   └── atualizar-precos.js  # CLI para atualizar preços e consultar status da base
├── test/
│   ├── anp-ao-vivo.test.js  # Testes de integração ao vivo contra o portal da ANP
│   ├── helpers.js           # Gerador de planilhas e mocks para testes
│   ├── calc.test.js         # Testes das contas de etanol x gasolina e da tendência
│   └── precos.test.js       # Suíte com 14 testes automatizados locais
├── package.json             # Metadados do projeto e scripts npm
├── server.js                # Servidor HTTP nativo e handler compatível com Vercel
├── vercel.json              # Configuração de rotas e publicação no Vercel
└── .gitignore               # Arquivos ignorados pelo Git
```

---

## Como executar localmente

### Pré-requisitos
- **Node.js 20 ou superior** instalado (`node -v`).
- **Nenhum `npm install` é obrigatório** para rodar a aplicação, pois não há dependências de terceiros.

### Inicialização

1. Clone o repositório ou navegue até a pasta do projeto:
   ```bash
   cd combustivel-certo
   ```

2. Inicie o servidor:
   ```bash
   npm start
   # ou: node server.js
   ```

3. Abra no navegador:
   ```
   http://localhost:8080
   ```

### Variáveis de ambiente opcionais

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `8080` | Porta do servidor local |
| `HOST` | `127.0.0.1` | Endereço de escuta (`0.0.0.0` para acesso em rede local) |
| `PRECOS_AGENDAR` | `1` | Defina como `0` para desativar o agendamento interno |
| `PRECOS_DIA_SEMANA` | `1` | Dia da semana para checagem (0 = domingo, 1 = segunda, ..., 6 = sábado) |
| `PRECOS_HORA` | `10` | Hora da coleta (0 a 23, horário local) |

---

## API

Todas as rotas retornam respostas em formato JSON (`application/json`).

### 1. Cadastro de Postos
- **Rota:** `GET /api/anp`
- **Finalidade:** Consulta o cadastro completo de postos de Cuiabá na API de Revendedores da ANP com cache em memória de 1 hora.
- **Resposta:** Lista de postos com CNPJ, razão social, endereço, bairro, bandeira e produtos autorizados.

### 2. Consulta de Preços
- **Rota:** `GET /api/precos`
- **Finalidade:** Consulta os preços da base histórica filtrados conforme parâmetros.
- **Parâmetros de busca (Query Params):**
  - `combustivel`: Nome do produto (ex.: `GASOLINA COMUM`, `ETANOL`, `DIESEL S10`). Aceita múltiplos separados por vírgula.
  - `bairro`: Nome do bairro (ex.: `CENTRO`, `ALVORADA`).
  - `bandeira`: Bandeira do posto (ex.: `VIBRA`, `IPIRANGA`, `BRANCA`).
  - `precoMin` / `precoMax`: Valores numéricos de corte (ex.: `precoMin=6.00&precoMax=6.60`).
  - `coletaDe` / `coletaAte`: Datas da coleta no formato `AAAA-MM-DD`.
  - `semanas`: Quantidade de semanas mais recentes a incluir (um número, como `1`, `4`, `26` ou `52`, ou `todas`; padrão: `1`).
  - `semana`: ID específico de uma semana (ex.: `2026-10-04_2026-10-10`).
- **Resposta:**
  ```json
  {
    "municipio": "CUIABA",
    "uf": "MT",
    "fonte": "https://www.gov.br/anp/...",
    "aviso": "Preços da pesquisa semanal da ANP...",
    "ultimaAtualizacao": "2026-10-12T20:02:10.261Z",
    "semanaReferencia": { "id": "2026-10-04_2026-10-10", "periodo": "04/10/2026 a 10/10/2026" },
    "filtros": { "combustiveis": [...], "bairros": [...], "bandeiras": [...] },
    "total": 88,
    "registros": [ ... ]
  }
  ```

### 3. Status da Base de Preços
- **Rota:** `GET /api/precos/status`
- **Finalidade:** Retorna a situação operacional do coletor: total de registros armazenados, semanas disponíveis, última execução e log das últimas tentativas.

---

## Atualização dos preços

A coleta é realizada de forma automatizada por `lib/anp-precos.js`:

1. **Descoberta:** Acessa a página oficial do LPC da ANP e extrai os links das planilhas semanais de "Preços por posto revendedor".
2. **Ordenação por Data:** Identifica o período real de cada arquivo pelo nome e pelo cabeçalho, processando da mais recente para a mais antiga.
3. **Download e Extração:** Baixa a planilha `.xlsx` e processa o XML interno sem bibliotecas pesadas.
4. **Filtragem Restrita:** Isola exclusivamente os registros correspondentes a `CUIABA / MT`, validando preços, datas e CNPJ.
5. **Gravação Atômica:** Salva em `data/precos.json` utilizando arquivo temporário seguido de renomeação atômica, evitando corrupção de dados.
6. **Mecanismo de Lock:** Utiliza `data/atualizacao.lock` para impedir coletas concorrentes simultâneas.

### Comandos manuais

- **Verificar situação da base:**
  ```bash
  npm run precos:status
  ```
- **Importar semanas novas:**
  ```bash
  npm run precos:atualizar
  ```
- **Importar histórico ampliado (ex.: 8 semanas):**
  ```bash
  node scripts/atualizar-precos.js --semanas=8
  ```
- **Reimportar e sobrescrever semanas existentes:**
  ```bash
  node scripts/atualizar-precos.js --forcar
  ```

---

## Testes

O projeto conta com suítes de testes automatizados utilizando o test runner nativo do Node.js:

### 1. Testes Automatizados Locais (sem internet)
Valida a lógica de filtragem, o leitor de `.xlsx`, integridade das consultas, persistência atômica, tratamento de falhas e cálculos de agenda:
```bash
npm test
```
*Resultado esperado: 14 testes aprovados (100% de sucesso).*

### 2. Testes de Integração ao Vivo (requer internet)
Conecta ao portal real da ANP (`gov.br`) para verificar se a estrutura dos links ou da planilha sofreu alterações por parte do governo:
```bash
npm run test:live
```

---

## Publicação no Vercel

O projeto está estruturado para deploy simples e direto no Vercel.

### Como publicar
1. Instale o Vercel CLI (`npm i -g vercel`) ou importe o repositório diretamente no painel do [vercel.com](https://vercel.com).
2. Execute na raiz do repositório:
   ```bash
   vercel
   ```
3. O arquivo `vercel.json` encaminha as requisições `/api/*` para `server.js` como Serverless Function, enquanto arquivos estáticos (`index.html`, CSS, JS e assets) são servidos globalmente pela CDN do Vercel.

### Limitações operacionais na Vercel (Importante)
- **Sistema de arquivos efêmero (read-only):** O Vercel executa Serverless Functions em ambientes que não persistem alterações no sistema de arquivos em disco entre execuções. A base `data/precos.json` é servida como snapshot estático empacotado no deploy.
- **Agendamento em background:** O agendador semanal (`agendarSemanal` via `setTimeout`) só funciona em servidores de execução contínua (como VPS, Docker ou máquinas locais). No Vercel, o processo é finalizado após responder a requisição.
- **Estratégia recomendada para atualização em produção no Vercel:**
  - Configurar um **GitHub Actions** semanal agendado (cron) que executa `npm run precos:atualizar`, commita `data/precos.json` caso haja novidade e dispara o redeploy automático do Vercel.
