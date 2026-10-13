/**
 * Combustível Certo · Contas sem tela (etanol x gasolina, tendência da semana), testadas em test/calc.test.js
 */
const Calc = (() => {
  const RENDIMENTO_ETANOL = 0.7; // o etanol rende cerca de 70% do que a gasolina rende

  // Qual combustível sai mais barato por km num posto.
  // economia: reais a menos para rodar o que um tanque de gasolina roda; noTanque: reais a menos para encher com etanol
  function flex(gasolina, etanol, tanque) {
    if (!(gasolina > 0) || !(etanol > 0)) return null;
    const pct = Math.round((etanol / gasolina) * 100);
    return {
      melhor: pct < 70 ? 'etanol' : pct > 70 ? 'gasolina' : 'empate',
      pct,
      economia: Math.abs(gasolina - etanol / RENDIMENTO_ETANOL) * tanque,
      noTanque: (gasolina - etanol) * tanque
    };
  }

  // Variação do preço médio entre as duas semanas mais recentes da pesquisa.
  // A ANP visita postos diferentes a cada semana: só entram os postos pesquisados nas duas.
  function tendenciaSemana(registros, produto, minPostos = 5) {
    const semanas = [...new Set(registros.map(r => r.semana))].sort().reverse().slice(0, 2);
    if (semanas.length < 2) return null;
    const [atual, anterior] = semanas.map(semana => {
      const porPosto = new Map(); // último preço de cada posto na semana
      for (const r of registros) {
        if (r.semana !== semana || r.produto !== produto || !r.cnpj) continue;
        const visto = porPosto.get(r.cnpj);
        if (!visto || r.dataColeta > visto.dataColeta) porPosto.set(r.cnpj, r);
      }
      return porPosto;
    });
    const comuns = [...atual.keys()].filter(cnpj => anterior.has(cnpj));
    if (comuns.length < minPostos) return null;
    const media = semana => comuns.reduce((soma, cnpj) => soma + semana.get(cnpj).preco, 0) / comuns.length;
    return { dif: media(atual) - media(anterior), media: media(atual), postos: comuns.length };
  }

  return { flex, tendenciaSemana };
})();

if (typeof module !== 'undefined') module.exports = Calc;
