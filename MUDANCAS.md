# Mudanças da branch `feat-precos-usuarios`

Resumo: o app passa a aceitar **preços informados pelos usuários**, sem cadastro. O que antes estava em "Implementações futuras" no README agora existe.

## Como funciona, do ponto de vista de quem usa

1. No card do posto (folha de baixo) há um botão novo **Informar preço** (ícone de balão com `+`).
2. Abre um modal onde a pessoa digita gasolina, etanol e/ou diesel S10, **ou** tira foto da placa.
3. A foto é lida **no próprio celular** com Tesseract.js (OCR). A imagem nunca sai do aparelho; só os números vão para o servidor. Os valores lidos preenchem os campos na ordem e a pessoa confere/corrige.
4. Ao enviar, o app pega o GPS. Só aceita se a pessoa estiver a **até 300 m** do posto.
5. O preço fica **pendente**. No card aparece "Alguém informou R$ X há N h. Confere?" com os botões **Confirmar** e **Está diferente**.
6. Vira **confirmado** quando outra pessoa, de **outro aparelho e outra rede**, informa o mesmo valor (diferença de até R$ 0,02) em até 48 h.

## Regras anti-abuso (servidor)

| Regra | Valor |
|---|---|
| Distância máxima do posto | 300 m |
| Faixa aceita | ±25% da média da última semana da ANP (sem média: R$ 2 a R$ 15) |
| Tolerância para "mesmo preço" | R$ 0,02 |
| Janela para confirmar | 48 h |
| Tempo de vida de um envio | 7 dias |
| Limite por rede | 10 envios por hora |
| Envios guardados por posto/combustível | 20 |
| Tamanho máximo do corpo | 2 KB |

O IP nunca é guardado: só um hash SHA-256 com sal (`CONTRIB_SAL`), usado para contar redes diferentes (LGPD). O "aparelho" é um UUID aleatório salvo no `localStorage` (`cc_aparelho_v1`).

## Arquivos

### Novos
- **`lib/contribuicoes.js`**: toda a regra de negócio: validação do envio, cálculo de pendente/confirmado, rate limit, e o banco. Usa **Upstash Redis** pela API REST se `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` existirem; senão guarda **em memória** (só para dev local, some ao reiniciar).
- **`api/contribuicoes.js`**: função serverless do Vercel. `GET` lista os preços, `POST` envia.
- **`test/contribuicoes.test.js`**: testes da validação e do estado pendente/confirmado.

### Alterados
- **`server.js`**: rota `/api/contribuicoes` no servidor local (GET e POST); CORS agora aceita POST.
- **`api/index.js`**: lista a rota nova.
- **`public/js/data/stations-data.js`**: exporta os dados via `module.exports` para o servidor conferir as coordenadas dos postos.
- **`public/js/calc.js`**: `precosDaFoto(texto)` extrai preços (ex.: `6,19`, `4.299`) do texto do OCR, entre R$ 2 e R$ 15, sem repetir.
- **`public/js/components/bottom-sheet.js`**: botão "Informar preço", linha de preço informado (pendente/confirmado) e callback `onReport`.
- **`public/js/app.js`**: carrega os preços dos usuários (`loadContribs`), modal de informar, envio com GPS, leitura da foto (Tesseract.js baixado só quando alguém escolhe uma foto).
- **`public/index.html`**: modal `#modalInformar`, pergunta nova na aba Dúvidas e cache-busting `?v=13` → `?v=14`.
- **`package.json`**: `npm test` inclui o teste novo.
- **`README.md`**: a funcionalidade saiu de "Implementações futuras" e foi documentada.
- **`data/precos.json`**: atualização da coleta semanal da ANP.
- **`.gitignore`**: a pasta `video/` inteira (projeto Remotion, scripts, `node_modules` e renders) é ignorada e fica só na sua máquina.

## Para colocar no ar (Vercel)

Crie as variáveis de ambiente, senão cada função serverless terá sua própria memória e os envios se perdem:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CONTRIB_SAL` (qualquer texto longo e secreto)
