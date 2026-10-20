/* Shared presentation helpers. They do not change TRI calculations. */
function criarAjudaPrecisao() {
  const container = document.createElement("span");
  container.className = "metric-help";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "metric-help-button";
  button.textContent = "?";
  button.setAttribute("aria-label", "Como o erro da prova foi avaliado");
  const tooltip = document.createElement("span");
  tooltip.className = "metric-tooltip";
  tooltip.id = `precision-help-${++criarAjudaPrecisao.nextId}`;
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent =
    "As notas de cerca de 800 participantes que fizeram esta prova foram avaliadas. Para cada participante, comparou-se a nota estimada com a nota real. O erro médio resume essas diferenças na amostra; o erro máximo é a maior diferença observada. Essas métricas descrevem a amostra e não garantem o erro da sua estimativa.";
  button.setAttribute("aria-describedby", tooltip.id);
  button.addEventListener("click", () => container.classList.toggle("help-open"));
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      container.classList.remove("help-open");
      container.classList.add("help-dismissed");
    }
  });
  for (const event of ["mouseenter", "focusin"]) {
    container.addEventListener(event, () => container.classList.remove("help-dismissed"));
  }
  container.addEventListener("focusout", () => container.classList.remove("help-open"));
  container.append(button, tooltip);
  return container;
}
criarAjudaPrecisao.nextId = 0;

/** Filter a copy, keeping the complete result available for exports and other views. */
function selecionarImpactos(resultados, itens, ordem, filtro) {
  const anuladas = new Set(
    itens.filter((item) => item.IN_ITEM_ABAN === 1).map((item) => item.CO_POSICAO),
  );
  const selecionados = resultados.filter((item) => {
    const anulada = anuladas.has(item.questao);
    const acerto = item.alteracao === "Acerto → Erro";
    switch (filtro) {
      case "correct":
        return !anulada && acerto;
      case "wrong":
        return !anulada && !acerto;
      case "blank":
        return !anulada && !item.resposta;
      case "void":
        return anulada;
      default:
        return true;
    }
  });
  const comparadores = {
    ascending: (a, b) => a.delta - b.delta,
    descending: (a, b) => b.delta - a.delta,
    question: (a, b) => a.questao - b.questao,
    magnitude: (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  };
  const comparar = comparadores[ordem] || comparadores.ascending;
  return selecionados.sort((a, b) => comparar(a, b) || a.questao - b.questao);
}
