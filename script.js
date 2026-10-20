/*
CÓDIGO GERADO COM CLAUDE AI, GEMINI E CHATGPT COM BASE NOS CÓDIGOS ORIGINAIS EM PYTHON
Os códigos originais foram intensamente testados e estão disponíveis em:
https://github.com/pedro-mantovani/calculadora_ENEM
O erro médio é inferior a presisão mostrada no ENEM (um décimo)
*/

"use strict";

// O mesmo arquivo atende às quatro páginas sem inicializar a calculadora fora dela.
iniciarRecursosCompartilhados();
if (document.getElementById("step-identificacao")) {
  /* =========================================================
   Constantes (mesmos valores do script original em Python)
   ========================================================= */

  const TRANSFORMACAO = {
    LC: [499.977, 108.09],
    CH: [501.487, 112.315],
    CN: [501.142, 113.11],
    MT: [500.016, 129.654],
  };

  const SIGLAS = {
    LC: "Linguagens, Códigos e suas Tecnologias",
    CH: "Ciências Humanas e suas Tecnologias",
    CN: "Ciências da Natureza e suas Tecnologias",
    MT: "Matemática e suas Tecnologias",
  };

  const ALTERNATIVAS = ["A", "B", "C", "D", "E"];
  const N_THETA = 400;
  const THETA_MIN = -4;
  const THETA_MAX = 4;

  /* =========================================================
   Estado da aplicação
   ========================================================= */

  const state = {
    ano: null,
    prova: null,
    area: null,
    itens: [],
    respostas: [],
    lingua: null,
    etapa: "step-identificacao",
  };

  /* =========================================================
   Leitura e parsing do CSV (latin1, separador ';')
   ========================================================= */

  async function carregarItens(ano) {
    const url = `dados/ITENS_PROVA_${ano}.csv`;
    let resposta;
    try {
      resposta = await fetch(url);
    } catch (e) {
      throw new Error(`Não foi possível acessar "${url}".`);
    }
    if (!resposta.ok) {
      throw new Error(`Arquivo "${url}" não encontrado.`);
    }

    const buffer = await resposta.arrayBuffer();
    const texto = new TextDecoder("iso-8859-1").decode(buffer);

    const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (linhas.length < 2) {
      throw new Error(`Arquivo "${url}" está vazio ou mal formatado.`);
    }

    const header = linhas[0].split(";").map((h) => h.trim());
    const idx = {};
    header.forEach((h, i) => (idx[h] = i));

    const obrigatorias = [
      "CO_POSICAO",
      "TX_GABARITO",
      "TP_LINGUA",
      "IN_ITEM_ABAN",
      "NU_PARAM_A",
      "NU_PARAM_B",
      "NU_PARAM_C",
      "CO_PROVA",
      "SG_AREA",
    ];
    for (const col of obrigatorias) {
      if (!(col in idx)) {
        throw new Error(`Coluna "${col}" não encontrada em "${url}".`);
      }
    }

    const itens = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(";");
      const get = (nome) => {
        const v = cols[idx[nome]];
        return v === undefined ? "" : v.trim();
      };

      const tpLinguaRaw = get("TP_LINGUA");
      const abanRaw = get("IN_ITEM_ABAN");

      itens.push({
        CO_POSICAO: parseInt(get("CO_POSICAO"), 10),
        TX_GABARITO: get("TX_GABARITO").toUpperCase(),
        TP_LINGUA: tpLinguaRaw === "" ? NaN : parseInt(tpLinguaRaw, 10),
        IN_ITEM_ABAN: abanRaw === "" ? 0 : parseInt(abanRaw, 10),
        NU_PARAM_A: parseFloat(get("NU_PARAM_A")),
        NU_PARAM_B: parseFloat(get("NU_PARAM_B")),
        NU_PARAM_C: parseFloat(get("NU_PARAM_C")),
        CO_PROVA: parseInt(get("CO_PROVA"), 10),
        SG_AREA: get("SG_AREA"),
      });
    }

    return itens;
  }

  /* =========================================================
   Modelo TRI (3PL) e estimação de theta (EAP)
   ========================================================= */

  function probItem(theta, a, b, c) {
    const z = a * (theta - b);
    return c + (1 - c) / (1 + Math.exp(-z));
  }

  function trapz(y, x) {
    let soma = 0;
    for (let i = 0; i < x.length - 1; i++) {
      soma += ((x[i + 1] - x[i]) * (y[i + 1] + y[i])) / 2;
    }
    return soma;
  }

  function calcularLogLikelihood(thetaArr, resp, itens, basePos) {
    const logL = new Float64Array(thetaArr.length);

    for (const item of itens) {
      if (item.IN_ITEM_ABAN === 1) continue;

      const pos = item.CO_POSICAO - basePos;
      if (pos < 0 || pos >= resp.length) continue;

      const acertou = item.TX_GABARITO === resp[pos];
      const a = item.NU_PARAM_A;
      const b = item.NU_PARAM_B;
      const c = item.NU_PARAM_C;

      for (let i = 0; i < thetaArr.length; i++) {
        let p = probItem(thetaArr[i], a, b, c);
        if (p < 1e-9) p = 1e-9;
        else if (p > 1 - 1e-9) p = 1 - 1e-9;
        logL[i] += acertou ? Math.log(p) : Math.log(1 - p);
      }
    }

    return logL;
  }

  function estimarTheta(resp, itens) {
    const thetaArr = new Float64Array(N_THETA);
    for (let i = 0; i < N_THETA; i++) {
      thetaArr[i] = THETA_MIN + ((THETA_MAX - THETA_MIN) * i) / (N_THETA - 1);
    }

    const basePos = itens[0].CO_POSICAO;
    const logL = calcularLogLikelihood(thetaArr, resp, itens, basePos);

    const logPost = new Float64Array(N_THETA);
    let maxVal = -Infinity;
    for (let i = 0; i < N_THETA; i++) {
      logPost[i] = logL[i] - 0.5 * thetaArr[i] * thetaArr[i];
      if (logPost[i] > maxVal) maxVal = logPost[i];
    }

    const posterior = new Float64Array(N_THETA);
    for (let i = 0; i < N_THETA; i++) {
      posterior[i] = Math.exp(logPost[i] - maxVal);
    }

    const integral = trapz(posterior, thetaArr);
    for (let i = 0; i < N_THETA; i++) posterior[i] /= integral;

    const ponderado = new Float64Array(N_THETA);
    for (let i = 0; i < N_THETA; i++) ponderado[i] = thetaArr[i] * posterior[i];

    return trapz(ponderado, thetaArr);
  }

  function escalar(theta, area) {
    const [A, B] = TRANSFORMACAO[area];
    return A + B * theta;
  }

  function calcularNota(resp, itens, area) {
    const theta = estimarTheta(resp, itens);
    const nota = escalar(theta, area);
    return { theta, nota };
  }

  /* =========================================================
   Impacto de cada questão (inverte acerto/erro e recalcula)
   ========================================================= */

  function inverterResposta(resp, itens, pos) {
    const respNova = resp.slice();
    const item = itens[pos];
    const gabarito = item.TX_GABARITO;
    const atual = respNova[pos];

    if (atual === gabarito) {
      const erradas = ALTERNATIVAS.filter((a) => a !== gabarito);
      respNova[pos] = erradas[0];
    } else {
      respNova[pos] = gabarito;
    }

    return respNova;
  }

  function calcularDeltas(resp, itens, area, notaOriginal) {
    const resultados = [];

    for (let pos = 0; pos < resp.length; pos++) {
      const respAlterada = inverterResposta(resp, itens, pos);
      const { nota: notaAlterada } = calcularNota(respAlterada, itens, area);
      const delta = notaOriginal - notaAlterada;

      const item = itens[pos];
      const gabarito = item.TX_GABARITO;
      const respostaOriginal = resp[pos];
      const alteracao = respostaOriginal === gabarito ? "Acerto → Erro" : "Erro → Acerto";

      resultados.push({
        questao: item.CO_POSICAO,
        resposta: respostaOriginal,
        gabarito,
        alteracao,
        notaAlterada,
        delta,
      });
    }

    resultados.sort((x, y) => x.delta - y.delta);
    return resultados;
  }

  /* =========================================================
   UI — elementos
   ========================================================= */

  const el = {
    stepIdentificacao: document.getElementById("step-identificacao"),
    inputProva: document.getElementById("input-prova"),
    btnCarregar: document.getElementById("btn-carregar"),
    hintIdentificacao: document.getElementById("hint-identificacao"),
    selCor: document.getElementById("sel-cor"),

    stepIdioma: document.getElementById("step-idioma"),
    idiomaChoice: document.getElementById("idioma-choice"),
    hintIdioma: document.getElementById("hint-idioma"),

    stepRespostas: document.getElementById("step-respostas"),
    stepRespostasIndex: document.getElementById("step-respostas-index"),
    areaNome: document.getElementById("area-nome"),
    numQuestoes: document.getElementById("num-questoes"),
    posRange: document.getElementById("pos-range"),
    inputColar: document.getElementById("input-colar"),
    btnColar: document.getElementById("btn-colar"),
    bubbleSheet: document.getElementById("bubble-sheet"),
    btnCalcular: document.getElementById("btn-calcular"),
    hintRespostas: document.getElementById("hint-respostas"),
    checkCorrecao: document.getElementById("check-correcao"),

    stepResultado: document.getElementById("step-resultado"),
    scoreAreaLabel: document.getElementById("score-area-label"),
    scoreNota: document.getElementById("score-nota"),
    scoreAcertos: document.getElementById("score-acertos"),
    scoreTheta: document.getElementById("score-theta"),
    totalQuestoesResultado: document.getElementById("total-questoes-resultado"),
    loadingDeltas: document.getElementById("loading-deltas"),
    deltaTable: document.getElementById("delta-table"),
    btnRefazer: document.getElementById("btn-refazer"),
  };

  function mostrarPasso(secao) {
    secao.classList.remove("hidden");
    atualizarEtapas(secao.id);
    state.etapa = secao.id;
    if (secao !== el.stepIdentificacao) esconderPasso(el.stepIdentificacao);
    document.getElementById("btn-trocar").hidden = !state.prova;
    atualizarResumoProva();
    if (!restaurando) {
      secao.setAttribute("tabindex", "-1");
      secao.focus({ preventScroll: true });
      secao.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      salvarProgresso();
    }
  }

  function esconderPasso(secao) {
    secao.classList.add("hidden");
  }

  function setHint(elemento, mensagem, tipo) {
    elemento.textContent = mensagem || "";
    elemento.classList.remove("error", "ok");
    if (tipo) elemento.classList.add(tipo);
  }

  const elPrecisao = {
    container: document.getElementById("info-precisao-prova"),
    erroMedio: document.getElementById("val-erro-medio"),
    erroMaximo: document.getElementById("val-erro-maximo"),
    obs: document.getElementById("precisao-obs"),
  };

  function exibirConfiabilidadeProva(match) {
    if (!match) {
      elPrecisao.container.classList.add("hidden");
      return;
    }

    const erroMedio = match.erro_medio;
    const confiavel =
      Number.isFinite(match.erro_medio) &&
      Number.isFinite(match.erro_maximo) &&
      match.erro_medio <= 1;
    elPrecisao.container.classList.toggle("precision-warning", !confiavel);
    elPrecisao.container.querySelector("summary").textContent = confiavel
      ? "Ver precisão desta prova"
      : Number.isFinite(match.erro_medio) && Number.isFinite(match.erro_maximo)
        ? "Atenção: erro amostral elevado"
        : "Atenção: precisão sem dados de validação";
    const erroMaximo = match.erro_maximo;

    if (Number.isFinite(erroMedio) && Number.isFinite(erroMaximo)) {
      elPrecisao.erroMedio.textContent = `${erroMedio.toFixed(3)} pts`;
      elPrecisao.erroMaximo.textContent = `${erroMaximo.toFixed(1)} pts`;

      if (erroMedio > 1.0) {
        elPrecisao.obs.textContent =
          "⚠️ Esta prova apresenta um erro amostral elevado, os dados do ENEM podem estar fora do padrão ou incorretos.";
        elPrecisao.obs.className = "precisao-obs alerta";
      } else {
        elPrecisao.obs.textContent =
          "✓ Esta prova possui alta precisão estimada, o erro médio é pequeno e está relacionado a possíveis simplificações nos cálculos.";
        elPrecisao.obs.className = "precisao-obs ok";
      }
    } else {
      elPrecisao.erroMedio.textContent = "Sem dados";
      elPrecisao.erroMaximo.textContent = "Sem dados";
      elPrecisao.obs.textContent =
        "Aviso: Não há dados de participantes suficientes publicados para validar esta aplicação específica.";
      elPrecisao.obs.className = "precisao-obs alerta";
    }

    elPrecisao.container.classList.remove("hidden");
  }

  // Atualiza na seleção por cascata
  el.selCor.addEventListener("change", () => {
    const codNum = parseInt(el.selCor.value, 10);
    const match = catalogoProvas.find((p) => p.codigo === codNum);
    if (!radioCodigo.checked) {
      el.inputProva.value = el.selCor.value || "";
    }
    exibirConfiabilidadeProva(match);
  });

  // Atualiza na digitação do código direto
  el.inputProva.addEventListener("input", () => {
    if (radioCascata.checked) return;

    const codNum = parseInt(el.inputProva.value.trim(), 10);
    const match = catalogoProvas.find((p) => p.codigo === codNum);

    if (match) {
      /* ... popular selects em cascata ... */
      exibirConfiabilidadeProva(match);
    } else {
      /* ... reset selects ... */
      exibirConfiabilidadeProva(null);
    }
  });

  /* =========================================================
   Alternância de Modo de Seleção (Cascata vs Código)
   ========================================================= */

  const radioCascata = document.querySelector('input[value="cascata"]');
  const radioCodigo = document.querySelector('input[value="codigo"]');
  const blocoCascata = document.getElementById("bloco-cascata");
  const blocoCodigo = document.getElementById("bloco-codigo");

  // Função auxiliar para recarregar as opções de Ano quando voltamos para a busca por características
  function restaurarCascataInicial() {
    if (catalogoProvas.length === 0) return;
    const anos = [...new Set(catalogoProvas.map((p) => p.ano))].sort((a, b) => b - a);
    popularSelect(
      selAno,
      anos.map((a) => ({ value: a, text: a })),
      "Selecione o ano...",
    );
    resetSelect(selArea, "Selecione a área...");
    resetSelect(selAplicacao, "Selecione a área antes...");
    resetSelect(el.selCor, "Selecione a aplicação...");
  }

  function atualizarModoEntrada() {
    if (radioCascata.checked) {
      blocoCascata.inert = !radioCascata.checked;
      blocoCodigo.hidden = radioCascata.checked;
      blocoCascata.style.opacity = "1";
      blocoCascata.style.pointerEvents = "auto";
      blocoCodigo.style.opacity = "0.5";
      blocoCodigo.style.pointerEvents = "none";

      // Trava a edição via teclado na caixa de texto cinza
      el.inputProva.readOnly = true;
      el.inputProva.tabIndex = -1;
      // Muda o texto de fundo quando está travado
      el.inputProva.placeholder = "Aguardando seleção...";

      restaurarCascataInicial();
      el.inputProva.value = "";
      setHint(el.hintIdentificacao, "", null);
    } else {
      blocoCascata.inert = !radioCascata.checked;
      blocoCodigo.hidden = radioCascata.checked;
      blocoCascata.style.opacity = "0.5";
      blocoCascata.style.pointerEvents = "none";
      blocoCodigo.style.opacity = "1";
      blocoCodigo.style.pointerEvents = "auto";

      // Destrava a caixa de texto
      el.inputProva.readOnly = false;
      el.inputProva.tabIndex = 0;
      // Volta com o texto de exemplo quando está destravado
      el.inputProva.placeholder = "Ex: 1201";

      // Força a atualização da cascata (que ficará cinza) para refletir o código digitado
      el.inputProva.dispatchEvent(new Event("input"));
      setHint(el.hintIdentificacao, "", null);
    }
  }

  radioCascata.addEventListener("change", atualizarModoEntrada);
  radioCodigo.addEventListener("change", atualizarModoEntrada);

  /* =========================================================
   Passo 1 — Identificação da prova
   ========================================================= */

  el.btnCarregar.addEventListener("click", async () => {
    if (ocupado) return;
    let provaStr = "";

    if (radioCascata.checked) {
      provaStr = el.selCor.value;
    } else {
      provaStr = el.inputProva.value.trim();
    }

    if (!provaStr) {
      setHint(el.hintIdentificacao, "Informe ou selecione o código da prova.", "error");
      return;
    }

    const prova = parseInt(provaStr, 10);
    if (Number.isNaN(prova)) {
      setHint(el.hintIdentificacao, "Código da prova inválido.", "error");
      return;
    }

    const infoProva = catalogoProvas.find((p) => p.codigo === prova);
    if (!infoProva) {
      setHint(
        el.hintIdentificacao,
        "Código de prova não reconhecido. Confira e tente de novo.",
        "error",
      );
      return;
    }

    if (infoProva.disponivel === false) {
      setHint(
        el.hintIdentificacao,
        "Este caderno consta no catálogo, mas seus itens não estão disponíveis na base original. Escolha outra prova para simular.",
        "error",
      );
      return;
    }

    const anoDaProva = infoProva.ano;

    ocupado = true;
    el.btnCarregar.disabled = true;
    setHint(el.hintIdentificacao, "Carregando itens da prova...", null);

    try {
      const todos = await carregarItens(anoDaProva);
      const itensProva = todos.filter((it) => it.CO_PROVA === prova);

      if (itensProva.length === 0) {
        setHint(el.hintIdentificacao, "Itens não encontrados no CSV para este código.", "error");
        el.btnCarregar.disabled = false;
        return;
      }

      esconderPasso(el.stepResultado);
      esconderPasso(el.stepRespostas);
      esconderPasso(el.stepIdioma);
      el.stepRespostasIndex.textContent = "02";
      state.lingua = null;
      el.inputColar.value = "";
      state.itens = [];
      state.respostas = [];
      state.ano = anoDaProva;
      state.prova = prova;
      state.area = itensProva[0].SG_AREA;
      state.itensBrutos = itensProva;

      setHint(
        el.hintIdentificacao,
        `Prova de ${SIGLAS[state.area] || state.area} encontrada.`,
        "ok",
      );

      if (state.area === "LC") {
        el.stepRespostasIndex.textContent = "03";
        mostrarPasso(el.stepIdioma);
      } else {
        finalizarSelecaoItens(itensProva);
      }
    } catch (erro) {
      setHint(el.hintIdentificacao, erro.message, "error");
    } finally {
      el.btnCarregar.disabled = false;
      ocupado = false;
    }
  });

  /* =========================================================
   Passo 2 — Idioma (somente Linguagens)
   ========================================================= */

  el.idiomaChoice.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".choice-btn");
    if (!btn) return;

    [...el.idiomaChoice.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");

    const lingua = parseInt(btn.dataset.lingua, 10);
    state.lingua = lingua;
    const excluir = lingua === 0 ? 1 : 0;

    const itensFiltrados = state.itensBrutos.filter((it) => it.TP_LINGUA !== excluir);

    esconderPasso(el.stepIdioma);
    finalizarSelecaoItens(itensFiltrados);
  });

  /* =========================================================
   Preparação final dos itens (ordenar) + montar cartão-resposta
   ========================================================= */

  function finalizarSelecaoItens(itensFiltrados) {
    const itens = [...itensFiltrados].sort((a, b) => a.CO_POSICAO - b.CO_POSICAO);
    state.itens = itens;
    state.respostas = new Array(itens.length).fill("");

    el.areaNome.textContent = SIGLAS[state.area] || state.area;
    el.numQuestoes.textContent = itens.length;
    const posicoes = itens.map((it) => it.CO_POSICAO);
    el.posRange.textContent = `${Math.min(...posicoes)}–${Math.max(...posicoes)}`;

    montarCartaoResposta(itens);
    setHint(el.hintRespostas, "", null);

    // Reseta o checkbox de correção
    el.checkCorrecao.checked = false;
    el.bubbleSheet.classList.remove("mostrar-gabarito");

    mostrarPasso(el.stepRespostas);
  }

  function montarCartaoResposta(itens) {
    el.bubbleSheet.innerHTML = "";
    atualizarProgresso();
    ultimoPreenchimento = null;
    document.getElementById("btn-desfazer").disabled = true;
    document.getElementById("paste-start").max = itens.length;
    document.getElementById("paste-start").value = 1;
    document.getElementById("paste-status").textContent = "";

    itens.forEach((item, pos) => {
      const row = document.createElement("div");
      row.className = "bubble-row";
      row.dataset.pos = pos;

      const qnum = document.createElement("span");
      qnum.className = "bubble-qnum";
      qnum.textContent = item.CO_POSICAO;
      row.appendChild(qnum);

      ALTERNATIVAS.forEach((letra) => {
        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.className = "bubble";
        bubble.textContent = letra;
        bubble.dataset.letra = letra;
        bubble.setAttribute("aria-label", `Questão ${item.CO_POSICAO}, alternativa ${letra}`);
        bubble.setAttribute("aria-pressed", "false");
        // Atributo adicionado para saber o acerto
        bubble.dataset.isCorrect = letra === item.TX_GABARITO;

        bubble.addEventListener("click", () => {
          state.respostas[pos] = state.respostas[pos] === letra ? "" : letra;
          atualizarLinhaCartao(row, state.respostas[pos]);
        });
        row.appendChild(bubble);
      });

      const branco = document.createElement("button");
      branco.type = "button";
      branco.className = "bubble blank-bubble filled";
      branco.dataset.letra = "";
      branco.textContent = "–";
      branco.setAttribute("aria-label", `Questão ${item.CO_POSICAO}, deixar em branco`);
      branco.setAttribute("aria-pressed", "true");
      branco.addEventListener("click", () => {
        state.respostas[pos] = "";
        atualizarLinhaCartao(row, "");
      });
      row.appendChild(branco);
      el.bubbleSheet.appendChild(row);
    });
    organizarColunas();
  }

  function atualizarLinhaCartao(row, letraSelecionada) {
    atualizarProgresso();
    esconderPasso(el.stepResultado);
    row.classList.toggle("answered", Boolean(letraSelecionada));
    salvarProgresso();
    row.querySelectorAll(".bubble").forEach((b) => {
      b.classList.toggle("filled", b.dataset.letra === letraSelecionada);
      b.setAttribute("aria-pressed", String(b.dataset.letra === letraSelecionada));
    });
  }

  el.checkCorrecao.addEventListener("change", (e) => {
    if (e.target.checked) {
      el.bubbleSheet.classList.add("mostrar-gabarito");
    } else {
      el.bubbleSheet.classList.remove("mostrar-gabarito");
    }
  });

  // Importação explícita: nunca extrai letras de palavras desconhecidas.
  let ultimoPreenchimento = null;
  function aplicarRespostasColadas(modo) {
    try {
      const inicio = modo === "merge" ? Number(document.getElementById("paste-start").value) : 1;
      const parsed = interpretarCartao(el.inputColar.value, state.itens, inicio);
      ultimoPreenchimento = state.respostas.slice();
      const novas =
        modo === "merge" ? state.respostas.slice() : new Array(state.itens.length).fill("");
      parsed.entries.forEach(([pos, resposta]) => {
        novas[pos] = resposta;
      });
      state.respostas = novas;
      [...el.bubbleSheet.children].forEach((row, pos) =>
        atualizarLinhaCartao(row, state.respostas[pos]),
      );
      document.getElementById("btn-desfazer").disabled = false;
      const brancos = novas.filter((r) => !r).length;
      setHint(
        document.getElementById("paste-status"),
        `${parsed.entries.length} posições aplicadas. ${brancos} em branco no cartão.${parsed.extra ? " " + parsed.extra + " respostas excedentes não foram usadas." : ""} ${modo === "merge" ? "Demais posições preservadas." : "Posições não informadas ficaram em branco."}`,
        "ok",
      );
    } catch (erro) {
      setHint(document.getElementById("paste-status"), erro.message, "error");
    }
  }
  el.btnColar.addEventListener("click", () => aplicarRespostasColadas("replace"));
  document
    .getElementById("btn-mesclar")
    .addEventListener("click", () => aplicarRespostasColadas("merge"));
  document.getElementById("btn-desfazer").addEventListener("click", () => {
    if (!ultimoPreenchimento) return;
    state.respostas = ultimoPreenchimento;
    ultimoPreenchimento = null;
    [...el.bubbleSheet.children].forEach((row, pos) =>
      atualizarLinhaCartao(row, state.respostas[pos]),
    );
    document.getElementById("btn-desfazer").disabled = true;
    setHint(
      document.getElementById("paste-status"),
      "Preenchimento desfeito. O cartão anterior foi recuperado.",
      "ok",
    );
  });

  function organizarColunas() {
    const sheet = el.bubbleSheet;
    if (!state.itens.length) return;
    const cols = Math.max(1, Math.min(5, Math.floor((sheet.clientWidth + 24) / 355)));
    const rows = Math.ceil(state.itens.length / cols);
    sheet.style.gridTemplateRows = `repeat(${rows}, auto)`;
    sheet.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    [...sheet.children].forEach((row, i) => row.classList.toggle("stripe", (i % rows) % 2 === 1));
  }
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(organizarColunas).observe(el.bubbleSheet);
  window.addEventListener("resize", organizarColunas);

  /* =========================================================
   Passo 3 — Calcular nota + impacto por questão
   ========================================================= */

  // Recursos de apresentação; a estimação TRI não é alterada.
  document.getElementById("btn-exportar").addEventListener("click", () => {
    if (!state.itens.length || el.stepResultado.classList.contains("hidden")) return;
    const info = catalogoProvas.find((p) => p.codigo === state.prova && p.ano === state.ano);
    const linhas = [
      "MEU ENEM — RESULTADO ESTIMADO DO ENEM",
      "Gerado em: " + new Date().toLocaleString("pt-BR"),
      "Prova: " + state.ano + " · " + state.prova,
      "Área: " + (SIGLAS[state.area] || state.area),
      "Caderno: " + (info ? info.aplicacao + " · " + info.descricao : "Não informado"),
      ...(state.area === "LC" ? ["Idioma: " + (state.lingua === 0 ? "Inglês" : "Espanhol")] : []),
      "Nota estimada: " + el.scoreNota.textContent + " pontos",
      "Habilidade estimada (θ): " + el.scoreTheta.textContent,
      "Acertos (contagem bruta): " + el.scoreAcertos.textContent + "/" + state.itens.length,
      document.getElementById("result-blanks").textContent,
      "",
      "SEU CARTÃO-RESPOSTA",
      ...state.itens.map(
        (it, i) =>
          it.CO_POSICAO +
          ": " +
          (state.respostas[i] || "EM BRANCO") +
          " | Gabarito: " +
          it.TX_GABARITO +
          (it.IN_ITEM_ABAN === 1 ? " | Item desconsiderado" : ""),
      ),
      "",
      document.getElementById("result-precision").textContent,
      "",
      "Estimativa educacional independente. A nota oficial é divulgada pelo Inep.",
      "Cálculo TRI/EAP baseado no projeto de Pedro Mantovani.",
    ];
    let url;
    try {
      url = URL.createObjectURL(
        new Blob(["\ufeff" + linhas.join("\n")], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "meu-enem-" + state.ano + "-" + state.prova + ".txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      document.getElementById("export-status").textContent = "Resultado preparado para download.";
    } catch {
      document.getElementById("export-status").textContent =
        "O download não está disponível neste navegador. Tente o botão Baixar PDF para salvar seu resultado.";
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  const btnPDF = document.getElementById("btn-imprimir");
  btnPDF.textContent = "Baixar PDF ↓";
  btnPDF.title = "Baixar relatório em PDF com nota, respostas e métricas da prova";
  document.getElementById("btn-exportar").textContent = "Baixar TXT ↓";
  btnPDF.addEventListener("click", async () => {
    if (ocupado || !state.itens.length || el.stepResultado.classList.contains("hidden")) return;
    const status = document.getElementById("export-status");
    let url;
    btnPDF.disabled = true;
    btnPDF.textContent = "Gerando PDF...";
    status.textContent = "Preparando seu relatório em PDF...";
    try {
      const resultado = calcularNota(state.respostas, state.itens, state.area);
      const dadosRelatorio = {
        impactos: calcularDeltas(state.respostas, state.itens, state.area, resultado.nota),
        ...resultado,
        ano: state.ano,
        prova: state.prova,
        area: state.area,
        areaNome: SIGLAS[state.area] || state.area,
        lingua: state.lingua,
        itens: state.itens.slice(),
        respostas: state.respostas.slice(),
        info: catalogoProvas.find((p) => p.codigo === state.prova && p.ano === state.ano),
        geradoEm: new Date().toLocaleString("pt-BR"),
      };
      const logo = await carregarLogoPDF();
      const bytes = gerarRelatorioPDFMeuENEM(dadosRelatorio, logo);
      url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "meu-enem-" + dadosRelatorio.ano + "-" + dadosRelatorio.prova + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      status.textContent = "Seu relatório em PDF foi preparado para download.";
    } catch (erro) {
      console.error("Não foi possível gerar o relatório PDF:", erro);
      status.textContent = "Não foi possível gerar o PDF. Tente novamente ou baixe a versão TXT.";
    } finally {
      btnPDF.disabled = false;
      btnPDF.textContent = "Baixar PDF ↓";
      if (url) setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  });

  el.btnCalcular.addEventListener("click", calcularResultado);
  async function calcularResultado() {
    if (ocupado || !state.itens.length) return;
    ocupado = true;
    el.btnCalcular.disabled = true;
    setHint(el.hintRespostas, "Calculando sua estimativa...", null);
    document.getElementById("export-status").textContent = "";

    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const { theta, nota } = calcularNota(state.respostas, state.itens, state.area);

      // Cálculo da quantidade de acertos
      let qtdAcertos = 0;
      state.respostas.forEach((resp, i) => {
        if (resp === state.itens[i].TX_GABARITO) qtdAcertos++;
      });

      el.scoreAreaLabel.textContent = SIGLAS[state.area] || state.area;
      el.scoreNota.textContent = nota.toFixed(1).replace(".", ",");
      el.scoreTheta.textContent = theta.toFixed(4).replace(".", ",");
      el.scoreAcertos.textContent = qtdAcertos;
      el.totalQuestoesResultado.textContent = state.itens.length;
      const brancos = state.respostas.filter((r) => !r).length;
      const anulados = state.itens.filter((it) => it.IN_ITEM_ABAN === 1).length;
      document.getElementById("result-blanks").textContent =
        `${brancos} respostas em branco (tratadas como erro nos itens válidos). ${anulados} itens anulados/abandonados, sem efeito na nota. A contagem de acertos acima é bruta, incluindo eventuais itens anulados.`;
      const info = catalogoProvas.find((p) => p.codigo === state.prova && p.ano === state.ano);
      const precision = document.getElementById("result-precision");
      precision.replaceChildren();
      const valid = info && Number.isFinite(info.erro_medio) && Number.isFinite(info.erro_maximo);
      const warning = !valid || info.erro_medio > 1;
      precision.classList.toggle("precision-warning", warning);
      const title = document.createElement("h3");
      title.append(criarAjudaPrecisao());
      title.prepend(
        document.createTextNode(
          !valid
            ? "Precisão sem dados de validação"
            : warning
              ? "Atenção à precisão desta prova"
              : "Precisão desta prova",
        ),
      );
      const metrics = document.createElement("div");
      metrics.className = "result-precision-metrics";
      if (valid) {
        for (const [label, value, digits] of [
          ["Erro médio da amostra", info.erro_medio, 3],
          ["Maior erro observado", info.erro_maximo, 1],
        ]) {
          const item = document.createElement("div"),
            caption = document.createElement("span"),
            number = document.createElement("strong");
          caption.textContent = label;
          number.textContent =
            value.toLocaleString("pt-BR", {
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            }) + " pontos";
          item.append(caption, number);
          metrics.append(item);
        }
      }
      const note = document.createElement("p");
      note.className = "input-help";
      note.textContent = !valid
        ? "Não há métricas disponíveis para avaliar a precisão deste caderno. Interprete a estimativa com cautela."
        : warning
          ? "Erro amostral elevado. Pode haver inconsistências nos dados; interprete a estimativa com cautela."
          : "Métricas da amostra de validação; não garantem o erro da sua nota.";
      precision.append(title, metrics, note);

      esconderPasso(el.stepRespostas);
      mostrarPasso(el.stepResultado);

      el.deltaTable.innerHTML = "";
      el.loadingDeltas.classList.remove("hidden");

      await new Promise((resolve) => setTimeout(resolve, 30));

      const resultados = calcularDeltas(state.respostas, state.itens, state.area, nota);
      renderizarDeltas(resultados);

      el.loadingDeltas.classList.add("hidden");
    } catch (erro) {
      el.loadingDeltas.classList.add("hidden");
      esconderPasso(el.stepResultado);
      mostrarPasso(el.stepRespostas);
      setHint(el.hintRespostas, `Erro ao calcular: ${erro.message}`, "error");
    } finally {
      el.btnCalcular.disabled = false;
      ocupado = false;
    }
  }

  let impactosCalculados = [];
  for (const id of ["impact-sort", "impact-filter"]) {
    document
      .getElementById(id)
      .addEventListener("change", () => renderizarDeltas(impactosCalculados));
  }

  function renderizarDeltas(todosResultados) {
    impactosCalculados = todosResultados;
    const resultados = selecionarImpactos(
      todosResultados,
      state.itens,
      document.getElementById("impact-sort").value,
      document.getElementById("impact-filter").value,
    );
    document.getElementById("impact-count").textContent = resultados.length
      ? `${resultados.length} de ${todosResultados.length} questões. Leia de cima para baixo em cada coluna.`
      : "Nenhuma questão corresponde a este filtro.";
    el.deltaTable.innerHTML = "";

    const maiorAbs = Math.max(1e-6, ...resultados.map((r) => Math.abs(r.delta)));

    const colunas = [document.createElement("div"), document.createElement("div")];
    colunas.forEach((col) => {
      col.className = "delta-column";
      el.deltaTable.appendChild(col);
    });
    resultados.forEach((r, index) => {
      const foiAcerto = r.alteracao === "Acerto → Erro";
      const anulado = state.itens.find((it) => it.CO_POSICAO === r.questao)?.IN_ITEM_ABAN === 1;
      const classe = foiAcerto ? "acerto" : "erro";
      const larguraPct = Math.min(100, (Math.abs(r.delta) / maiorAbs) * 100);

      const row = document.createElement("div");
      row.className = "delta-row";

      row.innerHTML = `
      <span class="delta-qnum">Q${r.questao}</span>
      <span class="delta-bar-wrap">
        <span class="delta-bar ${classe}" style="width:${larguraPct}%"></span>
      </span>
      <span class="delta-value ${classe}">${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)}
        <span class="delta-badge ${classe}">${anulado ? "anulada" : !r.resposta ? "branco" : foiAcerto ? "acerto" : "erro"}</span>
      </span>
    `;

      colunas[index < Math.ceil(resultados.length / 2) ? 0 : 1].appendChild(row);
    });
  }

  /* =========================================================
   Refazer
   ========================================================= */

  el.btnRefazer.addEventListener("click", () => {
    esconderPasso(el.stepResultado);
    esconderPasso(el.stepIdioma);
    el.inputColar.value = "";
    setHint(el.hintRespostas, "", null);
    mostrarPasso(el.stepRespostas);
  });

  /* =========================================================
   Filtros em Cascata para Identificação Automática
   ========================================================= */

  let catalogoProvas = [];

  const selAno = document.getElementById("sel-ano");
  const selArea = document.getElementById("sel-area");
  const selAplicacao = document.getElementById("sel-aplicacao");

  const NOME_AREAS = {
    LC: "Linguagens",
    CH: "Ciências Humanas",
    CN: "Ciências da Natureza",
    MT: "Matemática",
  };

  async function iniciarFiltrosCascata() {
    try {
      const res = await fetch("./dados/provas_mapeadas.json");
      if (!res.ok) throw new Error("JSON não encontrado");
      catalogoProvas = await res.json();

      const anos = [...new Set(catalogoProvas.map((p) => p.ano))].sort((a, b) => b - a);
      popularSelect(
        selAno,
        anos.map((a) => ({ value: a, text: a })),
        "Selecione o ano...",
      );

      selAno.addEventListener("change", () => {
        resetSelect(selArea, "Selecione a área...");
        resetSelect(selAplicacao, "Selecione a área antes...");
        resetSelect(el.selCor, "Selecione a aplicação...");
        exibirConfiabilidadeProva(null);
        if (!selAno.value) return;

        const areas = [
          ...new Set(catalogoProvas.filter((p) => p.ano == selAno.value).map((p) => p.area)),
        ];
        const areasObj = areas.map((a) => ({ value: a, text: NOME_AREAS[a] || a }));
        popularSelect(selArea, areasObj, "Selecione a área...");
      });

      selArea.addEventListener("change", () => {
        resetSelect(selAplicacao, "Selecione a aplicação...");
        resetSelect(el.selCor, "Selecione a aplicação antes...");
        exibirConfiabilidadeProva(null);
        if (!selArea.value) return;

        const aplicacoes = [
          ...new Set(
            catalogoProvas
              .filter((p) => p.ano == selAno.value && p.area === selArea.value)
              .map((p) => p.aplicacao),
          ),
        ];
        popularSelect(
          selAplicacao,
          aplicacoes.map((a) => ({ value: a, text: a })),
          "Selecione a aplicação...",
        );
      });

      selAplicacao.addEventListener("change", () => {
        resetSelect(el.selCor, "Selecione a cor/formato...");
        exibirConfiabilidadeProva(null);
        if (!selAplicacao.value) return;

        const opcoes = catalogoProvas.filter(
          (p) =>
            p.ano == selAno.value && p.area === selArea.value && p.aplicacao === selAplicacao.value,
        );

        const coresObj = opcoes.map((op) => ({
          value: op.codigo,
          text: op.descricao + (op.disponivel === false ? " — dados indisponíveis" : ""),
          disabled: op.disponivel === false,
        }));
        popularSelect(el.selCor, coresObj, "Selecione a cor/formato...");
      });
      // 1. Quando selecionar a cor na cascata, preenche a caixa de código (que estará cinza)
      el.selCor.addEventListener("change", () => {
        if (radioCodigo.checked) return;
        el.inputProva.value = el.selCor.value || "";
      });

      // 2. Quando digitar o código diretamente, espelha as características na cascata (que estará cinza)
      el.inputProva.addEventListener("input", () => {
        if (radioCascata.checked) return; // Só ativa se o usuário estiver usando o modo Código

        const codNum = parseInt(el.inputProva.value.trim(), 10);
        const match = catalogoProvas.find((p) => p.codigo === codNum);

        if (match) {
          popularSelect(selAno, [{ value: match.ano, text: match.ano }], "");
          selAno.value = match.ano;
          selAno.disabled = true; // Mantém visualmente bloqueado

          popularSelect(
            selArea,
            [{ value: match.area, text: NOME_AREAS[match.area] || match.area }],
            "",
          );
          selArea.value = match.area;
          selArea.disabled = true;

          popularSelect(selAplicacao, [{ value: match.aplicacao, text: match.aplicacao }], "");
          selAplicacao.value = match.aplicacao;
          selAplicacao.disabled = true;

          popularSelect(el.selCor, [{ value: match.codigo, text: match.descricao }], "");
          el.selCor.value = match.codigo;
          el.selCor.disabled = true;
        } else {
          // Se o código estiver incompleto ou errado, exibe aguardando
          resetSelect(selAno, "Aguardando código...");
          resetSelect(selArea, "...");
          resetSelect(selAplicacao, "...");
          resetSelect(el.selCor, "...");
        }
      });

      // Força a validação inicial do layout depois que o JSON carregar
      atualizarModoEntrada();
      await restaurarProgresso();
    } catch (e) {
      console.warn("Filtros em cascata não inicializados. Erro:", e);
      resetSelect(selAno, "Dados indisponíveis");
      setHint(
        el.hintIdentificacao,
        location.protocol === "file:"
          ? "Para carregar as provas, abra o site pelo iniciador: execute python3 iniciar.py na pasta extraída. Consulte o LEIA-ME.md incluído no ZIP."
          : "Não foi possível carregar as provas. Recarregue a página e confira se a pasta dados está disponível no site.",
        "error",
      );
    }
  }

  function popularSelect(selectElem, arrayObjetos, placeholder) {
    selectElem.innerHTML = `<option value="">${placeholder}</option>`;
    arrayObjetos.forEach((obj) => {
      const option = document.createElement("option");
      option.value = obj.value;
      option.textContent = obj.text;
      option.disabled = Boolean(obj.disabled);
      selectElem.appendChild(option);
    });
    selectElem.disabled = false;
  }

  function resetSelect(selectElem, placeholder) {
    selectElem.innerHTML = `<option value="">${placeholder}</option>`;
    selectElem.disabled = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarFiltrosCascata);
  } else {
    queueMicrotask(iniciarFiltrosCascata);
  }

  // Melhorias de apresentação; o modelo e seus parâmetros permanecem originais.
  function atualizarProgresso() {
    const preenchidas = state.respostas.filter(Boolean).length;
    document.getElementById("answer-count").textContent =
      `${preenchidas} marcadas · ${state.itens.length - preenchidas} em branco`;
    const progresso = document.getElementById("answer-progress");
    progresso.max = state.itens.length || 1;
    progresso.value = preenchidas;
  }
  function atualizarEtapas(id) {
    const atual = id === "step-resultado" ? 3 : id === "step-identificacao" ? 1 : 2;
    document.querySelectorAll(".journey li").forEach((item) => {
      const etapa = Number(item.dataset.stage);
      item.classList.toggle("active", etapa === atual);
      item.classList.toggle("complete", etapa < atual);
      if (etapa === atual) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      const button = item.querySelector("button");
      if (button) {
        if (etapa === atual) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      }
    });
  }

  /* Progresso local versionado: não armazena parâmetros nem confia em notas salvas. */
  const STORAGE_KEY = "enem-na-pratica:progresso:v1";
  let restaurando = false;
  let ocupado = false;
  let armazenamentoPronto = false;

  function statusSalvamento(texto, erro = false) {
    const status = document.getElementById("storage-status");
    status.textContent = texto;
    status.classList.toggle("error", erro);
  }

  function atualizarResumoProva() {
    const resumo = document.getElementById("exam-summary");
    resumo.hidden = !state.prova;
    if (!state.prova) return;
    resumo.textContent = `ENEM ${state.ano} · ${NOME_AREAS[state.area] || state.area} · Prova ${state.prova}${state.area === "LC" && state.lingua !== null ? " · " + (state.lingua === 0 ? "Inglês" : "Espanhol") : ""}`;
  }

  function salvarProgresso() {
    if (restaurando || !armazenamentoPronto) return;
    const registro = {
      versao: 1,
      atualizadoEm: Date.now(),
      selecao: {
        modo: radioCodigo.checked ? "codigo" : "cascata",
        ano: selAno.value,
        area: selArea.value,
        aplicacao: selAplicacao.value,
        cor: el.selCor.value,
        codigo: el.inputProva.value,
      },
      prova: state.prova,
      ano: state.ano,
      area: state.area,
      lingua: state.lingua,
      etapa: state.etapa,
      respostas: state.itens.map((item, i) => ({
        posicao: item.CO_POSICAO,
        resposta: state.respostas[i] || "",
      })),
      correcao: el.checkCorrecao.checked,
      textoColado: el.inputColar.value.slice(0, 10000),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registro));
      statusSalvamento("✓ Progresso salvo neste navegador.");
    } catch {
      statusSalvamento(
        "Não foi possível salvar neste navegador. Mantenha esta aba aberta para não perder suas respostas.",
        true,
      );
    }
  }

  function selecionarValor(elemento, valor) {
    if ([...elemento.options].some((op) => op.value === String(valor || ""))) {
      elemento.value = valor || "";
      elemento.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function restaurarProgresso() {
    let salvo;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        armazenamentoPronto = true;
        return;
      }
      salvo = JSON.parse(raw);
      if (
        !salvo ||
        salvo.versao !== 1 ||
        !salvo.selecao ||
        !Array.isArray(salvo.respostas) ||
        salvo.respostas.some(
          (r) => !r || !Number.isInteger(r.posicao) || !["", ...ALTERNATIVAS].includes(r.resposta),
        )
      ) {
        throw new Error("Formato inválido");
      }
    } catch {
      // Não sobrescreve dados antigos ou ilegíveis silenciosamente.
      statusSalvamento(
        "Não foi possível ler o progresso salvo. Use “Apagar progresso” para iniciar um novo salvamento.",
        true,
      );
      return;
    }

    restaurando = true;
    ocupado = true;
    const panels = document.getElementById("calculator-panels");
    panels.inert = true;
    panels.setAttribute("aria-busy", "true");
    statusSalvamento("Retomando seu progresso…");
    try {
      radioCodigo.checked = salvo.selecao.modo === "codigo";
      radioCascata.checked = !radioCodigo.checked;
      atualizarModoEntrada();
      if (radioCodigo.checked) {
        el.inputProva.value = String(salvo.selecao.codigo || "");
        el.inputProva.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        selecionarValor(selAno, salvo.selecao.ano);
        selecionarValor(selArea, salvo.selecao.area);
        selecionarValor(selAplicacao, salvo.selecao.aplicacao);
        selecionarValor(el.selCor, salvo.selecao.cor);
      }

      if (salvo.prova !== null) {
        const info = catalogoProvas.find((p) => p.codigo === salvo.prova && p.ano === salvo.ano);
        if (!info) throw new Error("Prova salva indisponível");
        const todos = await carregarItens(info.ano);
        const brutos = todos.filter((it) => it.CO_PROVA === info.codigo);
        if (!brutos.length || brutos[0].SG_AREA !== salvo.area)
          throw new Error("Dados da prova alterados");
        state.prova = info.codigo;
        state.ano = info.ano;
        state.area = brutos[0].SG_AREA;
        state.itensBrutos = brutos;
        state.lingua = state.area === "LC" && [0, 1].includes(salvo.lingua) ? salvo.lingua : null;
        if (state.area === "LC" && state.lingua === null) {
          mostrarPasso(el.stepIdioma);
        } else {
          const itens =
            state.area === "LC"
              ? brutos.filter((it) => it.TP_LINGUA !== (state.lingua === 0 ? 1 : 0))
              : brutos;
          el.stepRespostasIndex.textContent = state.area === "LC" ? "03" : "02";
          finalizarSelecaoItens(itens);
          const mapa = new Map(salvo.respostas.map((r) => [r.posicao, r.resposta]));
          state.respostas = state.itens.map((it) => mapa.get(it.CO_POSICAO) || "");
          [...el.bubbleSheet.children].forEach((row, i) =>
            atualizarLinhaCartao(row, state.respostas[i]),
          );
          el.checkCorrecao.checked = salvo.correcao === true;
          el.bubbleSheet.classList.toggle("mostrar-gabarito", el.checkCorrecao.checked);
          if (salvo.etapa === "step-resultado") {
            ocupado = false;
            await calcularResultado();
            ocupado = true;
          }
          if (salvo.etapa === "step-identificacao") {
            esconderPasso(el.stepRespostas);
            esconderPasso(el.stepResultado);
            mostrarPasso(el.stepIdentificacao);
          }
        }
      }
      el.inputColar.value =
        typeof salvo.textoColado === "string" ? salvo.textoColado.slice(0, 10000) : "";
      if (el.inputColar.value) el.inputColar.closest("details").open = true;
      armazenamentoPronto = true;
      statusSalvamento("✓ Progresso recuperado. Continue de onde parou.");
    } catch {
      statusSalvamento(
        "Seu progresso está guardado, mas não foi possível abrir a prova. Recarregue a página para tentar novamente.",
        true,
      );
    } finally {
      restaurando = false;
      ocupado = false;
      panels.inert = false;
      panels.removeAttribute("aria-busy");
    }
  }

  // O listener no documento roda depois dos listeners de cada campo.
  document.addEventListener("change", (ev) => {
    if (
      ev.target.matches(
        "#sel-ano, #sel-area, #sel-aplicacao, #sel-cor, #check-correcao, input[name=input_mode]",
      )
    )
      salvarProgresso();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.matches("#input-prova, #input-colar")) salvarProgresso();
  });
  document.getElementById("btn-trocar").addEventListener("click", () => {
    if (ocupado) return;
    esconderPasso(el.stepIdioma);
    esconderPasso(el.stepRespostas);
    esconderPasso(el.stepResultado);
    mostrarPasso(el.stepIdentificacao);
    setHint(
      el.hintIdentificacao,
      "Seu cartão atual será substituído ao carregar outra prova.",
      null,
    );
  });
  document.getElementById("btn-limpar").addEventListener("click", () => {
    if (ocupado) return;
    if (!window.confirm("Apagar a seleção e todas as respostas salvas neste navegador?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      statusSalvamento(
        "O navegador não permitiu apagar os dados. Confira as configurações de armazenamento.",
        true,
      );
      return;
    }
    restaurando = true;
    Object.assign(state, {
      ano: null,
      prova: null,
      area: null,
      lingua: null,
      itens: [],
      respostas: [],
      itensBrutos: [],
      etapa: "step-identificacao",
    });
    radioCascata.checked = true;
    radioCodigo.checked = false;
    atualizarModoEntrada();
    exibirConfiabilidadeProva(null);
    el.inputColar.value = "";
    el.checkCorrecao.checked = false;
    el.bubbleSheet.innerHTML = "";
    el.deltaTable.innerHTML = "";
    el.scoreNota.textContent = "—";
    document.getElementById("impact-details").open = false;
    esconderPasso(el.stepIdioma);
    esconderPasso(el.stepRespostas);
    esconderPasso(el.stepResultado);
    mostrarPasso(el.stepIdentificacao);
    restaurando = false;
    armazenamentoPronto = true;
    statusSalvamento("Progresso apagado. Você pode começar uma nova simulação.");
  });
  document.querySelectorAll("[data-go-stage]").forEach((button) =>
    button.addEventListener("click", async () => {
      const status = document.getElementById("journey-status");
      if (ocupado) {
        status.textContent = "Aguarde o cálculo terminar para mudar de etapa.";
        return;
      }
      const etapa = Number(button.dataset.goStage);
      status.textContent = "";
      if (etapa === 1) {
        document.getElementById("btn-trocar").click();
        return;
      }
      if (!state.prova) {
        status.textContent =
          "Primeiro, selecione a prova e clique em Continuar para carregar seu caderno.";
        el.btnCarregar.focus();
        return;
      }
      if (state.area === "LC" && state.lingua === null) {
        esconderPasso(el.stepIdentificacao);
        esconderPasso(el.stepResultado);
        esconderPasso(el.stepRespostas);
        mostrarPasso(el.stepIdioma);
        status.textContent = "Escolha inglês ou espanhol para continuar.";
        return;
      }
      if (!state.itens.length) {
        status.textContent = "Carregue os itens da prova antes de continuar.";
        return;
      }
      esconderPasso(el.stepIdentificacao);
      esconderPasso(el.stepIdioma);
      if (etapa === 2) {
        esconderPasso(el.stepResultado);
        mostrarPasso(el.stepRespostas);
      } else {
        await calcularResultado();
      }
    }),
  );
  atualizarModoEntrada();
}

function iniciarRecursosCompartilhados() {
  document
    .querySelectorAll("[data-precision-help]")
    .forEach((container) => container.append(criarAjudaPrecisao()));
  const copy = document.getElementById("copy-email");
  if (copy)
    copy.addEventListener("click", async () => {
      const status = document.getElementById("copy-status");
      try {
        await navigator.clipboard.writeText("pedro.mantovani6@usp.br");
        status.textContent = "E-mail copiado!";
      } catch {
        status.textContent = "Selecione e copie o endereço acima: pedro.mantovani6@usp.br";
      }
    });

  const chart = document.getElementById("tri-chart");
  if (!chart) return;
  const grid = document.getElementById("chart-grid");
  const svgNS = "http://www.w3.org/2000/svg";
  const add = (tag, attrs, text) => {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    grid.appendChild(node);
  };
  const x = (theta) => 70 + ((theta + 4) / 8) * 570;
  const y = (p) => 310 - p * 270;
  for (let i = 0; i <= 4; i++) {
    const chance = i / 4;
    add("line", {
      x1: 70,
      x2: 640,
      y1: y(chance),
      y2: y(chance),
      stroke: "#d9e2d3",
      "stroke-dasharray": "4 5",
    });
    add("text", { x: 59, y: y(chance) + 5, "text-anchor": "end" }, chance * 100 + "%");
  }
  for (let theta = -4; theta <= 4; theta++) {
    add("text", { x: x(theta), y: 336, "text-anchor": "middle" }, theta);
  }
  const ids = ["a", "b", "c", "theta"];
  function update() {
    const values = Object.fromEntries(
      ids.map((id) => [id, Number(document.getElementById("param-" + id).value)]),
    );
    const { a, b, c, theta } = values;
    ids.forEach((id) => {
      const formatted = values[id].toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      document.getElementById("value-" + id).textContent = formatted;
      document.getElementById("param-" + id).setAttribute("aria-valuetext", formatted);
    });
    const probability = (t) => c + (1 - c) / (1 + Math.exp(-a * (t - b)));
    let path = "";
    for (let i = 0; i <= 200; i++) {
      const t = -4 + (i / 200) * 8;
      path += (i ? " L" : "M") + x(t).toFixed(2) + "," + y(probability(t)).toFixed(2);
    }
    document.getElementById("curve-path").setAttribute("d", path);
    document.getElementById("curve-area").setAttribute("d", path + " L640,310 L70,310 Z");
    const chance = probability(theta);
    const line = document.getElementById("theta-line");
    line.setAttribute("x1", x(theta));
    line.setAttribute("x2", x(theta));
    line.setAttribute("y1", 310);
    line.setAttribute("y2", y(chance));
    const dot = document.getElementById("theta-dot");
    dot.setAttribute("cx", x(theta));
    dot.setAttribute("cy", y(chance));
    const bLine = document.getElementById("b-line");
    Object.entries({ x1: x(b), x2: x(b), y1: 40, y2: 310 }).forEach(([k, v]) =>
      bLine.setAttribute(k, v),
    );
    const cLine = document.getElementById("c-line");
    Object.entries({ x1: 70, x2: 640, y1: y(c), y2: y(c) }).forEach(([k, v]) =>
      cLine.setAttribute(k, v),
    );
    const handles = {
      b: [x(b), 310],
      c: [70, y(c)],
      a: [x(b + (b > 2 ? -0.75 : 0.75)), y(probability(b + (b > 2 ? -0.75 : 0.75)))],
      theta: [x(theta), y(chance)],
    };
    ids.forEach((id) => {
      const handle = document.getElementById(id === "theta" ? "theta-dot" : id + "-dot");
      handle.setAttribute("cx", handles[id][0]);
      handle.setAttribute("cy", handles[id][1]);
      const slider = document.getElementById("param-" + id);
      handle.setAttribute("aria-valuemin", slider.min);
      handle.setAttribute("aria-valuemax", slider.max);
      handle.setAttribute("aria-valuenow", values[id]);
      handle.setAttribute("aria-valuetext", slider.getAttribute("aria-valuetext"));
    });
    const formatted = (chance * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    document.getElementById("curve-readout").textContent =
      `Com θ = ${theta.toLocaleString("pt-BR")}, a probabilidade de acerto deste item ilustrativo é ${formatted}%.`;
  }
  function setParam(id, value) {
    const input = document.getElementById("param-" + id);
    const step = Number(input.step),
      min = Number(input.min),
      max = Number(input.max);
    input.value = Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));
    update();
  }
  let drag = null;
  chart.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("[data-param]");
    if (!target) return;
    event.preventDefault();
    drag = { id: target.dataset.param, pointerId: event.pointerId };
    chart.setPointerCapture(event.pointerId);
  });
  chart.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const t = ((point.x - 70) / 570) * 8 - 4;
    const probability = (310 - point.y) / 270;
    if (drag.id === "theta" || drag.id === "b") setParam(drag.id, t);
    else if (drag.id === "c") setParam("c", probability);
    else {
      const b = Number(document.getElementById("param-b").value);
      const c = Number(document.getElementById("param-c").value);
      const fraction = Math.min(0.9999, Math.max(0.0001, (probability - c) / (1 - c)));
      setParam("a", Math.log(fraction / (1 - fraction)) / (b > 2 ? -0.75 : 0.75));
    }
  });
  const endDrag = () => {
    drag = null;
  };
  chart.addEventListener("pointerup", endDrag);
  chart.addEventListener("pointercancel", endDrag);
  chart.addEventListener("lostpointercapture", endDrag);
  chart.addEventListener("keydown", (event) => {
    const id = event.target.dataset.param;
    if (
      !id ||
      !["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const slider = document.getElementById("param-" + id);
    if (event.key === "Home") setParam(id, Number(slider.min));
    else if (event.key === "End") setParam(id, Number(slider.max));
    else
      setParam(
        id,
        Number(slider.value) +
          (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1) * Number(slider.step),
      );
  });
  ids.forEach((id) => document.getElementById("param-" + id).addEventListener("input", update));
  document.getElementById("reset-curve").addEventListener("click", () => {
    const defaults = { a: 1.2, b: 0, c: 0.2, theta: 0 };
    ids.forEach((id) => (document.getElementById("param-" + id).value = defaults[id]));
    update();
  });
  update();
}

function interpretarCartao(texto, itens, inicio = 1) {
  const raw = texto.trim().toUpperCase();
  if (!raw) throw new Error("Cole pelo menos uma resposta ou um marcador de branco (–).");
  if (raw.length > 10000) throw new Error("O texto é muito longo. Cole apenas as respostas.");
  const normalizar = (value) => (/[A-E]/.test(value) ? value : "");
  // Numerado: 1:A 2:B, Q136) C; use o número real ou a posição no cartão.
  if (
    /^(?:Q\s*)?\d+\s*[).:=]\s*/.test(raw) ||
    /^Q\s*\d+/.test(raw) ||
    /^\d+\s+[A-E_X?0.\-–]/.test(raw)
  ) {
    const regex = /(?:Q\s*)?(\d+)\s*[).:=]?\s*([A-E_X?0.\-–])/gy;
    const pairs = [];
    let cursor = 0;
    while (cursor < raw.length) {
      while (/[\s,;|]/.test(raw[cursor] || "") && cursor < raw.length) cursor++;
      if (cursor >= raw.length) break;
      regex.lastIndex = cursor;
      const match = regex.exec(raw);
      if (!match) throw new Error("Formato numerado inválido. Use, por exemplo: 1:A 2:- 3:C.");
      pairs.push([Number(match[1]), normalizar(match[2])]);
      cursor = regex.lastIndex;
    }
    const reais = pairs.every(([n]) => itens.some((it) => it.CO_POSICAO === n));
    const entries = pairs.map(([n, resp]) => [
      reais ? itens.findIndex((it) => it.CO_POSICAO === n) : n - 1,
      resp,
    ]);
    if (entries.some(([n]) => n < 0 || n >= itens.length))
      throw new Error(
        "Há números fora desta prova. Use os números do caderno ou posições de 1 até " +
          itens.length +
          ".",
      );
    if (new Set(entries.map(([n]) => n)).size !== entries.length)
      throw new Error("Há questões repetidas na lista. Remova as duplicatas antes de preencher.");
    return { entries, extra: 0 };
  }
  if (!Number.isInteger(inicio) || inicio < 1 || inicio > itens.length)
    throw new Error("Escolha uma posição inicial válida no cartão.");
  if (/[^A-E_X?0.\-–\s,;|/]/.test(raw))
    throw new Error(
      "Há caracteres não reconhecidos. Use apenas A–E, marcadores de branco ou uma lista numerada como 1:A.",
    );
  let values = [];
  if (/[,;|/]/.test(raw)) {
    raw.split(/[,;|/]/).forEach((part) => {
      const compact = part.replace(/\s/g, "");
      values.push(...(compact ? [...compact].map(normalizar) : [""]));
    });
  } else values = [...raw.replace(/\s/g, "")].map(normalizar);
  const capacidade = itens.length - inicio + 1;
  return {
    entries: values.slice(0, capacidade).map((r, i) => [inicio - 1 + i, r]),
    extra: Math.max(0, values.length - capacidade),
  };
}
