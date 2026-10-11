/*
CÓDIGO GERADO COM CLAUDE AI, GEMINI E CHATGPT COM BASE NOS CÓDIGOS ORIGINAIS EM PYTHON
Os códigos originais foram intensamente testados e estão disponíveis em:
https://github.com/pedro-mantovani/calculadora_ENEM
O erro médio é inferior a presisão mostrada no ENEM (um décimo)
*/

"use strict";

// O mesmo arquivo atende às três páginas sem inicializar a calculadora fora dela.
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
    "CO_POSICAO", "TX_GABARITO", "TP_LINGUA", "IN_ITEM_ABAN",
    "NU_PARAM_A", "NU_PARAM_B", "NU_PARAM_C", "CO_PROVA", "SG_AREA",
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
    secao.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
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
  obs: document.getElementById("precisao-obs")
};

function exibirConfiabilidadeProva(match) {
  if (!match) {
    elPrecisao.container.classList.add("hidden");
    return;
  }

  const erroMedio = match.erro_medio;
  const confiavel = Number.isFinite(match.erro_medio) && Number.isFinite(match.erro_maximo) && match.erro_medio <= 1;
  elPrecisao.container.classList.toggle("precision-warning", !confiavel);
  elPrecisao.container.querySelector("summary").textContent = confiavel ? "Ver precisão desta prova" : Number.isFinite(match.erro_medio) && Number.isFinite(match.erro_maximo) ? "Atenção: erro amostral elevado" : "Atenção: precisão sem dados de validação";
  const erroMaximo = match.erro_maximo;

  if (Number.isFinite(erroMedio) && Number.isFinite(erroMaximo)) {
    elPrecisao.erroMedio.textContent = `${erroMedio.toFixed(3)} pts`;
    elPrecisao.erroMaximo.textContent = `${erroMaximo.toFixed(1)} pts`;

    if (erroMedio > 1.0) {
      elPrecisao.obs.textContent = "⚠️ Esta prova apresenta um erro amostral elevado, os dados do ENEM podem estar fora do padrão ou incorretos.";
      elPrecisao.obs.className = "precisao-obs alerta";
    } else {
      elPrecisao.obs.textContent = "✓ Esta prova possui alta precisão estimada, o erro médio é pequeno e está relacionado a possíveis simplificações nos cálculos.";
      elPrecisao.obs.className = "precisao-obs ok";
    }
  } else {
    elPrecisao.erroMedio.textContent = "Sem dados";
    elPrecisao.erroMaximo.textContent = "Sem dados";
    elPrecisao.obs.textContent = "Aviso: Não há dados de participantes suficientes publicados para validar esta aplicação específica.";
    elPrecisao.obs.className = "precisao-obs alerta";
  }

  elPrecisao.container.classList.remove("hidden");
}

// Atualiza na seleção por cascata
el.selCor.addEventListener('change', () => {
  const codNum = parseInt(el.selCor.value, 10);
  const match = catalogoProvas.find(p => p.codigo === codNum);
  if (!radioCodigo.checked) {
    el.inputProva.value = el.selCor.value || "";
  }
  exibirConfiabilidadeProva(match);
});

// Atualiza na digitação do código direto
el.inputProva.addEventListener('input', () => {
  if (radioCascata.checked) return;

  const codNum = parseInt(el.inputProva.value.trim(), 10);
  const match = catalogoProvas.find(p => p.codigo === codNum);

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
const blocoCascata = document.getElementById('bloco-cascata');
const blocoCodigo = document.getElementById('bloco-codigo');

// Função auxiliar para recarregar as opções de Ano quando voltamos para a busca por características
function restaurarCascataInicial() {
  if (catalogoProvas.length === 0) return;
  const anos = [...new Set(catalogoProvas.map(p => p.ano))].sort((a, b) => b - a);
  popularSelect(selAno, anos.map(a => ({ value: a, text: a })), "Selecione o ano...");
  resetSelect(selArea, "Selecione a área...");
  resetSelect(selAplicacao, "Selecione a área antes...");
  resetSelect(el.selCor, "Selecione a aplicação...");
}

function atualizarModoEntrada() {
  if (radioCascata.checked) {
    blocoCascata.inert = !radioCascata.checked;
    blocoCodigo.hidden = radioCascata.checked;
    blocoCascata.style.opacity = '1';
    blocoCascata.style.pointerEvents = 'auto';
    blocoCodigo.style.opacity = '0.5';
    blocoCodigo.style.pointerEvents = 'none';
    
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
    blocoCascata.style.opacity = '0.5';
    blocoCascata.style.pointerEvents = 'none';
    blocoCodigo.style.opacity = '1';
    blocoCodigo.style.pointerEvents = 'auto';
    
    // Destrava a caixa de texto
    el.inputProva.readOnly = false;
    el.inputProva.tabIndex = 0;
    // Volta com o texto de exemplo quando está destravado
    el.inputProva.placeholder = "Ex: 1201";
    
    // Força a atualização da cascata (que ficará cinza) para refletir o código digitado
    el.inputProva.dispatchEvent(new Event('input'));
    setHint(el.hintIdentificacao, "", null);
  }
}

radioCascata.addEventListener('change', atualizarModoEntrada);
radioCodigo.addEventListener('change', atualizarModoEntrada);

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

  const infoProva = catalogoProvas.find(p => p.codigo === prova);
  if (!infoProva) {
    setHint(el.hintIdentificacao, "Código de prova não reconhecido. Confira e tente de novo.", "error");
    return;
  }

  if (infoProva.disponivel === false) {
    setHint(el.hintIdentificacao, "Este caderno consta no catálogo, mas seus itens não estão disponíveis na base original. Escolha outra prova para simular.", "error");
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

    setHint(el.hintIdentificacao, `Prova de ${SIGLAS[state.area] || state.area} encontrada.`, "ok");

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
  el.bubbleSheet.classList.remove('mostrar-gabarito');
  
  mostrarPasso(el.stepRespostas);
}

function montarCartaoResposta(itens) {
  el.bubbleSheet.innerHTML = "";
  atualizarProgresso();
  ultimoPreenchimento = null;
  document.getElementById("btn-desfazer").disabled = true;
  document.getElementById("paste-start").max = itens.length;

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
      bubble.dataset.isCorrect = (letra === item.TX_GABARITO);

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

el.checkCorrecao.addEventListener('change', (e) => {
  if(e.target.checked) {
    el.bubbleSheet.classList.add('mostrar-gabarito');
  } else {
    el.bubbleSheet.classList.remove('mostrar-gabarito');
  }
});

// Importação explícita: nunca extrai letras de palavras desconhecidas.
let ultimoPreenchimento = null;
el.btnColar.addEventListener("click", () => {
  try {
    const parsed = interpretarCartao(el.inputColar.value, state.itens, Number(document.getElementById("paste-start").value));
    const modo = document.getElementById("paste-mode").value;
    ultimoPreenchimento = state.respostas.slice();
    const novas = modo === "merge" ? state.respostas.slice() : new Array(state.itens.length).fill("");
    parsed.entries.forEach(([pos, resposta]) => { novas[pos] = resposta; });
    state.respostas = novas;
    [...el.bubbleSheet.children].forEach((row, pos) => atualizarLinhaCartao(row, state.respostas[pos]));
    document.getElementById("btn-desfazer").disabled = false;
    const brancos = novas.filter(r => !r).length;
    setHint(el.hintRespostas, `${parsed.entries.length} posições aplicadas. ${brancos} em branco no cartão.${parsed.extra ? " " + parsed.extra + " respostas excedentes não foram usadas." : ""} ${modo === "merge" ? "Demais posições preservadas." : "Posições não informadas ficaram em branco."}`, "ok");
  } catch (erro) {
    setHint(el.hintRespostas, erro.message, "error");
  }
});
document.getElementById("btn-desfazer").addEventListener("click", () => {
  if (!ultimoPreenchimento) return;
  state.respostas = ultimoPreenchimento;
  ultimoPreenchimento = null;
  [...el.bubbleSheet.children].forEach((row, pos) => atualizarLinhaCartao(row, state.respostas[pos]));
  document.getElementById("btn-desfazer").disabled = true;
  setHint(el.hintRespostas, "Preenchimento desfeito. O cartão anterior foi recuperado.", "ok");
});

function organizarColunas() {
  const sheet = el.bubbleSheet;
  if (!state.itens.length) return;
  const cols = Math.max(1, Math.min(5, Math.floor((sheet.clientWidth + 24) / 355)));
  const rows = Math.ceil(state.itens.length / cols);
  sheet.style.gridTemplateRows = `repeat(${rows}, auto)`;
  sheet.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  [...sheet.children].forEach((row, i) => row.classList.toggle("stripe", i % rows % 2 === 1));
}
if (typeof ResizeObserver !== "undefined") new ResizeObserver(organizarColunas).observe(el.bubbleSheet);
window.addEventListener("resize", organizarColunas);

/* =========================================================
   Passo 3 — Calcular nota + impacto por questão
   ========================================================= */

// Recursos de apresentação; a estimação TRI não é alterada.
document.getElementById("btn-exportar").addEventListener("click", () => {
  if (!state.itens.length || el.stepResultado.classList.contains("hidden")) return;
  const info = catalogoProvas.find(p => p.codigo === state.prova && p.ano === state.ano);
  const linhas = [
    "NOTAVIVA — RESULTADO ESTIMADO DO ENEM",
    "Gerado em: " + new Date().toLocaleString("pt-BR"),
    "Prova: " + state.ano + " · " + state.prova,
    "Área: " + (SIGLAS[state.area] || state.area),
    "Caderno: " + (info ? info.aplicacao + " · " + info.descricao : "Não informado"),
    ...(state.area === "LC" ? ["Idioma: " + (state.lingua === 0 ? "Inglês" : "Espanhol")] : []),
    "Nota estimada: " + el.scoreNota.textContent + " pontos",
    "Habilidade estimada (θ): " + el.scoreTheta.textContent,
    "Acertos (contagem bruta): " + el.scoreAcertos.textContent + "/" + state.itens.length,
    document.getElementById("result-blanks").textContent,
    "", "SEU CARTÃO-RESPOSTA",
    ...state.itens.map((it, i) => it.CO_POSICAO + ": " + (state.respostas[i] || "EM BRANCO") + " | Gabarito: " + it.TX_GABARITO + (it.IN_ITEM_ABAN === 1 ? " | Item desconsiderado" : "")),
    "", document.getElementById("result-precision").textContent,
    "", "Estimativa educacional independente. A nota oficial é divulgada pelo Inep.",
    "Cálculo TRI/EAP baseado no projeto de Pedro Mantovani."
  ];
  let url;
  try {
    url = URL.createObjectURL(new Blob(["\ufeff" + linhas.join("\n")], {type:"text/plain;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "notaviva-" + state.ano + "-" + state.prova + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    document.getElementById("export-status").textContent = "Resultado preparado para download.";
  } catch {
    document.getElementById("export-status").textContent = "O download não está disponível neste navegador. Tente o botão Baixar PDF para salvar seu resultado.";
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
    const bytes = gerarRelatorioPDFNotaViva({
      impactos: calcularDeltas(state.respostas, state.itens, state.area, resultado.nota),
      ...resultado, ano: state.ano, prova: state.prova, area: state.area,
      areaNome: SIGLAS[state.area] || state.area, lingua: state.lingua,
      itens: state.itens, respostas: state.respostas,
      info: catalogoProvas.find(p => p.codigo === state.prova && p.ano === state.ano),
      geradoEm: new Date().toLocaleString("pt-BR")
    });
    url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "notaviva-" + state.ano + "-" + state.prova + ".pdf";
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
    const brancos = state.respostas.filter(r => !r).length;
    const anulados = state.itens.filter(it => it.IN_ITEM_ABAN === 1).length;
    document.getElementById("result-blanks").textContent = `${brancos} respostas em branco (tratadas como erro nos itens válidos). ${anulados} itens anulados/abandonados, sem efeito na nota. A contagem de acertos acima é bruta, incluindo eventuais itens anulados.`;
    const info = catalogoProvas.find(p => p.codigo === state.prova && p.ano === state.ano);
    const precision = document.getElementById("result-precision");
    precision.replaceChildren();
    const valid = info && Number.isFinite(info.erro_medio) && Number.isFinite(info.erro_maximo);
    const warning = !valid || info.erro_medio > 1;
    precision.classList.toggle("precision-warning", warning);
    const title = document.createElement("h3");
    title.textContent = !valid ? "Precisão sem dados de validação" : warning ? "Atenção à precisão desta prova" : "Precisão desta prova";
    const metrics = document.createElement("div");
    metrics.className = "result-precision-metrics";
    if (valid) {
      for (const [label, value, digits] of [["Erro médio da amostra", info.erro_medio, 3], ["Maior erro observado", info.erro_maximo, 1]]) {
        const item = document.createElement("div"), caption = document.createElement("span"), number = document.createElement("strong");
        caption.textContent = label;
        number.textContent = value.toLocaleString("pt-BR", {minimumFractionDigits: digits, maximumFractionDigits: digits}) + " pontos";
        item.append(caption, number); metrics.append(item);
      }
    }
    const note = document.createElement("p");
    note.className = "input-help";
    note.textContent = !valid ? "Não há métricas disponíveis para avaliar a precisão deste caderno. Interprete a estimativa com cautela." : warning ? "Erro amostral elevado. Pode haver inconsistências nos dados; interprete a estimativa com cautela." : "Métricas da amostra de validação; não garantem o erro da sua nota.";
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

function renderizarDeltas(resultados) {
  el.deltaTable.innerHTML = "";

  const maiorAbs = Math.max(1e-6, ...resultados.map((r) => Math.abs(r.delta)));

  const colunas = [document.createElement("div"), document.createElement("div")];
  colunas.forEach(col => { col.className = "delta-column"; el.deltaTable.appendChild(col); });
  resultados.forEach((r, index) => {
    const foiAcerto = r.alteracao === "Acerto → Erro";
    const anulado = state.itens.find(it => it.CO_POSICAO === r.questao)?.IN_ITEM_ABAN === 1;
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

const selAno = document.getElementById('sel-ano');
const selArea = document.getElementById('sel-area');
const selAplicacao = document.getElementById('sel-aplicacao');

const NOME_AREAS = {
  LC: "Linguagens",
  CH: "Ciências Humanas",
  CN: "Ciências da Natureza",
  MT: "Matemática"
};

async function iniciarFiltrosCascata() {
  try {
    const res = await fetch('./dados/provas_mapeadas.json');
    if (!res.ok) throw new Error("JSON não encontrado");
    catalogoProvas = await res.json();
    
    const anos = [...new Set(catalogoProvas.map(p => p.ano))].sort((a, b) => b - a);
    popularSelect(selAno, anos.map(a => ({ value: a, text: a })), "Selecione o ano...");
    
    selAno.addEventListener('change', () => {
      resetSelect(selArea, "Selecione a área...");
      resetSelect(selAplicacao, "Selecione a área antes...");
      resetSelect(el.selCor, "Selecione a aplicação...");
      exibirConfiabilidadeProva(null);
      if (!selAno.value) return;
      
      const areas = [...new Set(catalogoProvas.filter(p => p.ano == selAno.value).map(p => p.area))];
      const areasObj = areas.map(a => ({ value: a, text: NOME_AREAS[a] || a }));
      popularSelect(selArea, areasObj, "Selecione a área...");
    });
    
    selArea.addEventListener('change', () => {
      resetSelect(selAplicacao, "Selecione a aplicação...");
      resetSelect(el.selCor, "Selecione a aplicação antes...");
      exibirConfiabilidadeProva(null);
      if (!selArea.value) return;
      
      const aplicacoes = [...new Set(catalogoProvas.filter(p => 
        p.ano == selAno.value && p.area === selArea.value
      ).map(p => p.aplicacao))];
      popularSelect(selAplicacao, aplicacoes.map(a => ({ value: a, text: a })), "Selecione a aplicação...");
    });
    
    selAplicacao.addEventListener('change', () => {
      resetSelect(el.selCor, "Selecione a cor/formato...");
      exibirConfiabilidadeProva(null);
      if (!selAplicacao.value) return;
      
      const opcoes = catalogoProvas.filter(p => 
        p.ano == selAno.value && 
        p.area === selArea.value && 
        p.aplicacao === selAplicacao.value
      );
      
      const coresObj = opcoes.map(op => ({ value: op.codigo, text: op.descricao + (op.disponivel === false ? " — dados indisponíveis" : ""), disabled: op.disponivel === false }));
      popularSelect(el.selCor, coresObj, "Selecione a cor/formato...");
    });
// 1. Quando selecionar a cor na cascata, preenche a caixa de código (que estará cinza)
    el.selCor.addEventListener('change', () => {
      if (radioCodigo.checked) return;
      el.inputProva.value = el.selCor.value || "";
    });

    // 2. Quando digitar o código diretamente, espelha as características na cascata (que estará cinza)
    el.inputProva.addEventListener('input', () => {
      if (radioCascata.checked) return; // Só ativa se o usuário estiver usando o modo Código
      
      const codNum = parseInt(el.inputProva.value.trim(), 10);
      const match = catalogoProvas.find(p => p.codigo === codNum);

      if (match) {
        popularSelect(selAno, [{ value: match.ano, text: match.ano }], "");
        selAno.value = match.ano;
        selAno.disabled = true; // Mantém visualmente bloqueado

        popularSelect(selArea, [{ value: match.area, text: NOME_AREAS[match.area] || match.area }], "");
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
    setHint(el.hintIdentificacao, location.protocol === "file:" ? "Para carregar as provas, abra o site pelo iniciador: execute python3 iniciar.py na pasta extraída. Consulte o LEIA-ME.md incluído no ZIP." : "Não foi possível carregar as provas. Recarregue a página e confira se a pasta dados está disponível no site.", "error");
  }
}

function popularSelect(selectElem, arrayObjetos, placeholder) {
  selectElem.innerHTML = `<option value="">${placeholder}</option>`;
  arrayObjetos.forEach(obj => {
    const option = document.createElement('option');
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
  document.getElementById("answer-count").textContent = `${preenchidas} marcadas · ${state.itens.length - preenchidas} em branco`;
  const progresso = document.getElementById("answer-progress");
  progresso.max = state.itens.length || 1;
  progresso.value = preenchidas;
}
function atualizarEtapas(id) {
  const atual = id === "step-resultado" ? 3 : id === "step-identificacao" ? 1 : 2;
  document.querySelectorAll(".journey li").forEach(item => {
    const etapa = Number(item.dataset.stage);
    item.classList.toggle("active", etapa === atual);
    item.classList.toggle("complete", etapa < atual);
    if (etapa === atual) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    const button = item.querySelector("button");
    if (button) { if (etapa === atual) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current"); }
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
      ano: selAno.value, area: selArea.value,
      aplicacao: selAplicacao.value, cor: el.selCor.value,
      codigo: el.inputProva.value
    },
    prova: state.prova,
    ano: state.ano,
    area: state.area,
    lingua: state.lingua,
    etapa: state.etapa,
    respostas: state.itens.map((item, i) => ({
      posicao: item.CO_POSICAO, resposta: state.respostas[i] || ""
    })),
    correcao: el.checkCorrecao.checked,
    textoColado: el.inputColar.value.slice(0, 10000)
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registro));
    statusSalvamento("✓ Progresso salvo neste navegador.");
  } catch {
    statusSalvamento("Não foi possível salvar neste navegador. Mantenha esta aba aberta para não perder suas respostas.", true);
  }
}

function selecionarValor(elemento, valor) {
  if ([...elemento.options].some(op => op.value === String(valor || ""))) {
    elemento.value = valor || "";
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function restaurarProgresso() {
  let salvo;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { armazenamentoPronto = true; return; }
    salvo = JSON.parse(raw);
    if (!salvo || salvo.versao !== 1 || !salvo.selecao ||
        !Array.isArray(salvo.respostas) ||
        salvo.respostas.some(r => !r || !Number.isInteger(r.posicao) || !["", ...ALTERNATIVAS].includes(r.resposta))) {
      throw new Error("Formato inválido");
    }
  } catch {
    // Não sobrescreve dados antigos ou ilegíveis silenciosamente.
    statusSalvamento("Não foi possível ler o progresso salvo. Use “Apagar progresso” para iniciar um novo salvamento.", true);
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
      const info = catalogoProvas.find(p => p.codigo === salvo.prova && p.ano === salvo.ano);
      if (!info) throw new Error("Prova salva indisponível");
      const todos = await carregarItens(info.ano);
      const brutos = todos.filter(it => it.CO_PROVA === info.codigo);
      if (!brutos.length || brutos[0].SG_AREA !== salvo.area) throw new Error("Dados da prova alterados");
      state.prova = info.codigo;
      state.ano = info.ano;
      state.area = brutos[0].SG_AREA;
      state.itensBrutos = brutos;
      state.lingua = state.area === "LC" && [0, 1].includes(salvo.lingua) ? salvo.lingua : null;
      if (state.area === "LC" && state.lingua === null) {
        mostrarPasso(el.stepIdioma);
      } else {
        const itens = state.area === "LC" ? brutos.filter(it => it.TP_LINGUA !== (state.lingua === 0 ? 1 : 0)) : brutos;
        el.stepRespostasIndex.textContent = state.area === "LC" ? "03" : "02";
        finalizarSelecaoItens(itens);
        const mapa = new Map(salvo.respostas.map(r => [r.posicao, r.resposta]));
        state.respostas = state.itens.map(it => mapa.get(it.CO_POSICAO) || "");
        [...el.bubbleSheet.children].forEach((row, i) => atualizarLinhaCartao(row, state.respostas[i]));
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
    el.inputColar.value = typeof salvo.textoColado === "string" ? salvo.textoColado.slice(0, 10000) : "";
    if (el.inputColar.value) el.inputColar.closest("details").open = true;
    armazenamentoPronto = true;
    statusSalvamento("✓ Progresso recuperado. Continue de onde parou.");
  } catch {
    statusSalvamento("Seu progresso está guardado, mas não foi possível abrir a prova. Recarregue a página para tentar novamente.", true);
  } finally {
    restaurando = false;
    ocupado = false;
    panels.inert = false;
    panels.removeAttribute("aria-busy");
  }
}

// O listener no documento roda depois dos listeners de cada campo.
document.addEventListener("change", ev => {
  if (ev.target.matches("#sel-ano, #sel-area, #sel-aplicacao, #sel-cor, #check-correcao, input[name=input_mode]")) salvarProgresso();
});
document.addEventListener("input", ev => {
  if (ev.target.matches("#input-prova, #input-colar")) salvarProgresso();
});
document.getElementById("btn-trocar").addEventListener("click", () => {
  if (ocupado) return;
  esconderPasso(el.stepIdioma);
  esconderPasso(el.stepRespostas);
  esconderPasso(el.stepResultado);
  mostrarPasso(el.stepIdentificacao);
  setHint(el.hintIdentificacao, "Seu cartão atual será substituído ao carregar outra prova.", null);
});
document.getElementById("btn-limpar").addEventListener("click", () => {
  if (ocupado) return;
  if (!window.confirm("Apagar a seleção e todas as respostas salvas neste navegador?")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    statusSalvamento("O navegador não permitiu apagar os dados. Confira as configurações de armazenamento.", true);
    return;
  }
  restaurando = true;
  Object.assign(state, { ano: null, prova: null, area: null, lingua: null, itens: [], respostas: [], itensBrutos: [], etapa: "step-identificacao" });
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
document.querySelectorAll("[data-go-stage]").forEach(button => button.addEventListener("click", async () => {
  const status = document.getElementById("journey-status");
  if (ocupado) { status.textContent = "Aguarde o cálculo terminar para mudar de etapa."; return; }
  const etapa = Number(button.dataset.goStage);
  status.textContent = "";
  if (etapa === 1) { document.getElementById("btn-trocar").click(); return; }
  if (!state.prova) {
    status.textContent = "Primeiro, selecione a prova e clique em Continuar para carregar seu caderno.";
    el.btnCarregar.focus(); return;
  }
  if (state.area === "LC" && state.lingua === null) {
    esconderPasso(el.stepIdentificacao); esconderPasso(el.stepResultado); esconderPasso(el.stepRespostas);
    mostrarPasso(el.stepIdioma);
    status.textContent = "Escolha inglês ou espanhol para continuar."; return;
  }
  if (!state.itens.length) { status.textContent = "Carregue os itens da prova antes de continuar."; return; }
  esconderPasso(el.stepIdentificacao); esconderPasso(el.stepIdioma);
  if (etapa === 2) { esconderPasso(el.stepResultado); mostrarPasso(el.stepRespostas); }
  else { await calcularResultado(); }
}));
atualizarModoEntrada();

}

function iniciarRecursosCompartilhados() {
  const copy = document.getElementById("copy-email");
  if (copy) copy.addEventListener("click", async () => {
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
  const x = theta => 70 + (theta + 4) / 8 * 570;
  const y = p => 310 - p * 270;
  for (let i = 0; i <= 4; i++) {
    const chance = i / 4;
    add("line", { x1: 70, x2: 640, y1: y(chance), y2: y(chance), stroke: "#d9e2d3", "stroke-dasharray": "4 5" });
    add("text", { x: 59, y: y(chance) + 5, "text-anchor": "end" }, (chance * 100) + "%");
  }
  for (let theta = -4; theta <= 4; theta++) {
    add("text", { x: x(theta), y: 336, "text-anchor": "middle" }, theta);
  }
  const ids = ["a", "b", "c", "theta"];
  function update() {
    const values = Object.fromEntries(ids.map(id => [id, Number(document.getElementById("param-" + id).value)]));
    const { a, b, c, theta } = values;
    ids.forEach(id => {
      const formatted = values[id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById("value-" + id).textContent = formatted;
      document.getElementById("param-" + id).setAttribute("aria-valuetext", formatted);
    });
    const probability = t => c + (1 - c) / (1 + Math.exp(-a * (t - b)));
    let path = "";
    for (let i = 0; i <= 200; i++) {
      const t = -4 + i / 200 * 8;
      path += (i ? " L" : "M") + x(t).toFixed(2) + "," + y(probability(t)).toFixed(2);
    }
    document.getElementById("curve-path").setAttribute("d", path);
    document.getElementById("curve-area").setAttribute("d", path + " L640,310 L70,310 Z");
    const chance = probability(theta);
    const line = document.getElementById("theta-line");
    line.setAttribute("x1", x(theta)); line.setAttribute("x2", x(theta));
    line.setAttribute("y1", 310); line.setAttribute("y2", y(chance));
    const dot = document.getElementById("theta-dot");
    dot.setAttribute("cx", x(theta)); dot.setAttribute("cy", y(chance));
    const bLine = document.getElementById("b-line");
    Object.entries({x1:x(b), x2:x(b), y1:40, y2:310}).forEach(([k,v]) => bLine.setAttribute(k,v));
    const cLine = document.getElementById("c-line");
    Object.entries({x1:70, x2:640, y1:y(c), y2:y(c)}).forEach(([k,v]) => cLine.setAttribute(k,v));
    const handles = {
      b: [x(b), 310],
      c: [70, y(c)],
      a: [x(b + (b > 2 ? -0.75 : 0.75)), y(probability(b + (b > 2 ? -0.75 : 0.75)))],
      theta: [x(theta), y(chance)]
    };
    ids.forEach(id => {
      const handle = document.getElementById(id === "theta" ? "theta-dot" : id + "-dot");
      handle.setAttribute("cx", handles[id][0]); handle.setAttribute("cy", handles[id][1]);
      const slider = document.getElementById("param-" + id);
      handle.setAttribute("aria-valuemin", slider.min);
      handle.setAttribute("aria-valuemax", slider.max);
      handle.setAttribute("aria-valuenow", values[id]);
      handle.setAttribute("aria-valuetext", slider.getAttribute("aria-valuetext"));
    });
    const formatted = (chance * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    document.getElementById("curve-readout").textContent = `Com θ = ${theta.toLocaleString("pt-BR")}, a probabilidade de acerto deste item ilustrativo é ${formatted}%.`;
  }
  function setParam(id, value) {
    const input = document.getElementById("param-" + id);
    const step = Number(input.step), min = Number(input.min), max = Number(input.max);
    input.value = Math.min(max, Math.max(min, Math.round((value - min) / step) * step + min));
    update();
  }
  let drag = null;
  chart.addEventListener("pointerdown", event => {
    const target = event.target.closest("[data-param]");
    if (!target) return;
    event.preventDefault();
    drag = { id: target.dataset.param, pointerId: event.pointerId };
    chart.setPointerCapture(event.pointerId);
  });
  chart.addEventListener("pointermove", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const t = (point.x - 70) / 570 * 8 - 4;
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
  const endDrag = () => { drag = null; };
  chart.addEventListener("pointerup", endDrag);
  chart.addEventListener("pointercancel", endDrag);
  chart.addEventListener("lostpointercapture", endDrag);
  chart.addEventListener("keydown", event => {
    const id = event.target.dataset.param;
    if (!id || !["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const slider = document.getElementById("param-" + id);
    if (event.key === "Home") setParam(id, Number(slider.min));
    else if (event.key === "End") setParam(id, Number(slider.max));
    else setParam(id, Number(slider.value) + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1) * Number(slider.step));
  });
  ids.forEach(id => document.getElementById("param-" + id).addEventListener("input", update));
  document.getElementById("reset-curve").addEventListener("click", () => {
    const defaults = { a: 1.2, b: 0, c: 0.2, theta: 0 };
    ids.forEach(id => document.getElementById("param-" + id).value = defaults[id]);
    update();
  });
  update();
}


function interpretarCartao(texto, itens, inicio = 1) {
  const raw = texto.trim().toUpperCase();
  if (!raw) throw new Error("Cole pelo menos uma resposta ou um marcador de branco (–).");
  if (raw.length > 10000) throw new Error("O texto é muito longo. Cole apenas as respostas.");
  const normalizar = value => /[A-E]/.test(value) ? value : "";
  // Numerado: 1:A 2:B, Q136) C; use o número real ou a posição no cartão.
  if (/^(?:Q\s*)?\d+\s*[).:=]\s*/.test(raw) || /^Q\s*\d+/.test(raw) || /^\d+\s+[A-E_X?0.\-–]/.test(raw)) {
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
    const reais = pairs.every(([n]) => itens.some(it => it.CO_POSICAO === n));
    const entries = pairs.map(([n, resp]) => [reais ? itens.findIndex(it => it.CO_POSICAO === n) : n - 1, resp]);
    if (entries.some(([n]) => n < 0 || n >= itens.length)) throw new Error("Há números fora desta prova. Use os números do caderno ou posições de 1 até " + itens.length + ".");
    if (new Set(entries.map(([n]) => n)).size !== entries.length) throw new Error("Há questões repetidas na lista. Remova as duplicatas antes de preencher.");
    return { entries, extra: 0 };
  }
  if (!Number.isInteger(inicio) || inicio < 1 || inicio > itens.length) throw new Error("Escolha uma posição inicial válida no cartão.");
  if (/[^A-E_X?0.\-–\s,;|/]/.test(raw)) throw new Error("Há caracteres não reconhecidos. Use apenas A–E, marcadores de branco ou uma lista numerada como 1:A.");
  let values = [];
  if (/[,;|/]/.test(raw)) {
    raw.split(/[,;|/]/).forEach(part => {
      const compact = part.replace(/\s/g, "");
      values.push(...(compact ? [...compact].map(normalizar) : [""]));
    });
  } else values = [...raw.replace(/\s/g, "")].map(normalizar);
  const capacidade = itens.length - inicio + 1;
  return { entries: values.slice(0, capacidade).map((r, i) => [inicio - 1 + i, r]), extra: Math.max(0, values.length - capacidade) };
}

/* PDF vetorial A4, gerado localmente, com texto selecionável e sem CDN.
   Coordenadas em pontos; fontes DejaVu Sans incorporadas, com codificação WinAnsi. */
function gerarRelatorioPDFNotaViva(dados) {
  const W = 595.28, H = 841.89, M = 38, CW = W - 2 * M;
  const cores = { tinta: '#29243c', suave: '#746a87', violeta: '#6547de', lilas: '#eee8fc', verde: '#267451', menta: '#e5f3eb', coral: '#b43f59', rosa: '#fbeaf0', linha: '#e7e1ee', branco: '#ffffff', fundo: '#faf9fd', ambar: '#88621e', areia: '#fff4dc' };
  const fontes = [{"nome":"NVDejaVuSans","hex":"78dad4bc794094d5fe3f7e96679f7d631d60601856150441519409f79dcabd2454c4a5cc3d53345c123417dc7025255353f21a99191a9925696e5957adeb55af95967623f3f6b14de1e1fb3ecf0c88d5fd2efffd7e0c679e75ce73ce7b7dbddfe79c0761849015be38e4ead9ad7b0fee095e87d09a4170b65dcf9c818fdf3b17f6331c2f41c871a6e7e383b337fdb3321fa1ddecfaddfe8f0ceab574dec50084f6f44288ec1ff87852cac414736b84f06eb83e64cca451533e5933158ef9bb705c33e6b9192e34212c03217d2ddca3164c1937696abbe726222454c1f5d7c78d9a3e0589f0416ba03ea41ff7ccec8297979da841c80cf717ad1c3f76547e1bd7ba2bf0db56703d7d3c9c304e9346c231b409458f9f34e3f9ca010bbe82b6c021fde999c963467d1afcd32308196bd9b949a39e9fc277a2708ca13fc8f5eca84963637fe87c04a155d01f7c61cae4e9331a2fa311f0fc38767dcab4b1533a89ff815df149e8c378c4684572abcfbe1ed0ee2953e6cf284242ecefcb7b9f65b0edb73f864cab3fd8f06fa59fb8060e25ad19ec0f7e274e52c310526aea0faa4b957e5a4d2dffee69671a517fe87d36f0822033da043520ce41021085ab9833e255888776a4f29ba0ca70df967e810a88159aa51328953842b8f90825415d4a53d53905ddf39117b922a304bb6ac79bc549f8baaf4dec8f3b0bbf5f06f5a4e134ba0f7d241c405bf94054296e465385ce680149451fd10854056507875067b87e09eedf4aaea37cd85e26fba14581a804ca5750d6432987920f85d5530a653794655016c0bd77a06c657534152e0bad856e96f0b391999f874ef2ebd174211eb6467492db8c4e0aa970cca193e449561ad7f359707e269cbf09f7d4c3b61f9ace9df76df95238674725dcf5c67bfc65b49fd5297e87baf185a8339cab87ed93ac2faccdb03da13d1f35d641bf2ab99ba8107e7b982b4053613b95ab4353c9672889edf356749864a00f4846e3656ebb6f5f3c8d0eb3f3dc37dafd87d97db40f1c27a2c9d48ddac3b57d5c0dd06b191a02db4e6c9f4b45c3f8400c9a8239b6f5d352a33dd0672fa311945c288fb17ba05d4f42f9424238947e04fdfcc6473b467b760eae5d84728c9da3692817ca680ee1e9f0fb7d8cfe8c3f70ec86f34be1f779f0fb0fc40fd0527f190db42fd5e8fe1705fa27315e303eb42cc0874e50b6032f54d80ac01fa5890f7f2a0770306c0b345eb4288c17dc17509f02f402baff55112fc3b6c0c7879605787002e8bf0ab6ff827257a3bf9f0f7f2c1a7fbf41bd182f5a16c60b8dd7b065bc944ad1742949e36309e35f93ac307e91cf1a8b80c61ff8cb6d280711aaff08b6c0034d07f641d9cfb69ca7454128432bd53815eeab536a403e52d156281fe021ea52e04916f008541cc7c27d550f17b2e2cfe71e9c171079550023ecdbb6dc075d5b0432abf88a58e32bd0de2f1aa68365d2d79fab3fa7a9bd6620a1d835dbc2b61c62363b06b9604f402fa046fc381e859fc72fe035e438b9e2b2bb425ce1ae28578c2bd9d5d1b53732aab191d94854811fc37970df3cff7d365790cbe97269f765f8ee6bfcaaf168e3e4c6318dfd1b7b37a6abb4e1ce97ef7e59fde53b5f1efcf2ad2f2bbfdcfe65eab5237fb288ffe5ef1d51e0394a306ae53257114feffc2aefa3c35c1f0f8f6cddea0f872eb3e8aa42395586d9aeeac6c69c615c283fbc8a7756518f54c579dc5ffdb78b5fb56ed5376798abaaa17b377fadddf3bac1b9c787c12e3b82d370be7b37ed1a7b6815ef81ffde7955ae31e35d2f995f72777cc93cb6636b544de67b1befabf49e9dfeeea1bfa5d05fd7d35f8cf46795de55e9ff78e84f46fa9ff5f48e87fef8d223fc8f2abdbd9efeb09ed6dda3dfdfa3ff56e9771de9ad6c7a53a5dfa6d06f6e3cce7fb39ede801b6f3c4eaf7f9dc45fbf47bf4ea25fa9f44b955e4ba1ffb2d3abebe915955eb6d27fcea397dea5ff50e9e770fbe7f3e8c50b3df98bf3e8859ef4fcdf43f9f32afd7b28fd4ca59faaf49c4a3f51e9d9f5f4cce970fe8c4a4f87d35329f4a44a8f2fb6f0c79df4a3005aabd2632afd50a51fa8f4a84adf57e91195bea7d21a95beabd2c3167aa8d8c31f5269f53beff2d52a7de7e048fe9d77e93bf3b9836f7bf88323bd8df4a0977bdb430fa8f4adf574bf4adf5469954adf50e9be7cfa3723ddfbba87df9b4f5fafb4f2af7b68a595ee8146efb94777abf43595ee52e94e2bdda1d257b71bf95753e876237d259f56c02d15ebe936956e7d59cf6f55e9cb7a5abe25982fcfa75b369bf92dc174b3996e52e846956e586fe037a874bd8196c18fcad6d3756b8dfcba38bad648d7dca3ab57bdcbaf56e9aad291fcaa77e9aaf95ce94a0f5f3a92967ab9951eba42a5cb97b5e197ab74591bfa1274f3a547e8d2253a7ea99d2ed1d1123851924f8b8152c51ebad8425f54e9a285167e914a175ae80295ce5769914abd8d2fcc9bc7bfa0d279f3e8dc7c5a38c8c1177ae81c95ce56e9f3463a4b4f9f53e84c95ceb847a7dfa3d3eed1a9f7e814954e56e9b32a7d26923eadd289966c7ee2e374824ac7cfa3e3e0a040a563559aafd2312a1dadd2511d69de3d9aaba72355fa844a47a874f830851f7e8f0e53e8d080607e680a1da2d2c1f0e4c1d97490833e8ecdfce341f4313b7db48f8d7f54a5393a3a50a503fa9bf9012aed6fa6fd54da17aef455699fde66be8f8df60e33f0bdcdb49781f654698ff5b4fb7ada4da55d496bbeeb3d9afd2e7da42ff5aa344ba55d3a5bf92e76da39d3c477b6d2cc4e063ed3db68a29d0cb4a34a3354daa1bd9def708fb64f37f3eded343d4dc7a79b699a8eb60ba7a9069ad256c7a7a8b4ad8e2627e9f864034dd2d136ad65be8d99b69669ab149a98e0e113f36942bc954ff0d0782b8d8bf5f0718fd0580f8df1e8f81813f5e868b44add2a8d32d148e867a495baf269c43d1a0e5d08cfa76106ea040a3a551a7a8f8664d36038085669503e0d044a05aa34007e14104c1d2ab5abd4a6522bdc6055a905fa6ac9a6e679d4944f8d2a35e80378834af570b73e80ea54aa98a9ac52096e93542adaa9904f39b8c8810438289ca52a582d334f5a536ca648a5b81ae72f5e8113fffff087fe3fddba309c86aad169f87c802a5139de054705e02aa6c2990ac07a8bd14c38730c9fc64b496b38b70bdd41e7e1ce12749a56023eea8352e12c42977882eee241e800d49181ed384304e0c90de00e708f71d5dc4d40caedb9e9dc592e8f9b8e53e9767e08bf0b4a06fd08f0f7491481aaf135341d1da6dfd1545ac375e38ce81a3d4b2bd137f01470dbf08c52b40315425bec78322a2285e4313873823f8b36c367325c3f8bb7e2f3d0bac37811ba8836528ef4425bf145e8d769f40b5a4407912270dba9a400da7f02ea3a0bbfdf0cb810f117b182549208e7a0f5f0acd1da77186dcd5fd43e7750113c7910da21540b76d10d4f6114db858fe13a612daa40e7e993742abd8c17736e6e37d70b95fa2840f300215ec49bd96f84023c1bface3e85ac76328bcbc395e83b2e4f1c0d757fc47a04cf3c401e831e15a01a28b30433f4a9135e4c97424bd9d5307456ecc325c1efa106711ef41a015e4e431361af10ed43fb516bba1e95424d5a7f85f6fc2ff0cb72ee2be873295e417e41676937148f0ab8db406b802d687d3334680b4ffc3b9e47ccb41b9d4477d24fb930ae2737869bcdade0f67377f944be5208170a857f8addc597c4ff91464a73a51dd297329633e5d79471ca0d5da6ae44775cf7b33e423f4d5fa1afd5df37ac3454195b1b17188f9b04d333a65fccd3cc95e63acb93d60ceb326b9dadaf6d8eadc276ca5667c7f678fbfb0e9d6388637b803e6058404dc06f81aec091811703ff276850d0aaa0af8293825f087e3b243fe49590eba1339cc561bdc25b87af8dc01141112b233e8df8d415ec7ac17529726ce42f51c151efb983dd95d141d1f3a23745bfe119ec99e379db5317d3296653ccd1d8e0d89eb14fc62e8fad8ead8f1b13373d6e51dcda78537c687c6c7c66fce3f11313948499090b1256246c4aa84ca849f838e142c23709bf243e91382df185c49712b72556279e6b95daea5cabcbad6eb6525b07b7f6b41edffa7e1b439b8836496dbab719d5667ed2c8a4094933931624ad497a35e98da47793ce245d4d7e3bf983e433c95f24df4c6e686b6bfb48dbfb29428a2525322523a55bcada94ca944f532352df4a3d9e7a29f5dfa9bfb453da8d6db7a6ddd176bfa40d4e5b92f672dafeb4736975e9527a7a7a7efa9af423ed517b57fb3e1d4c1d7a7658d06167466247be639f8e051da7772cedf87ac7431d2f76fca6e34f9d68277ba7c84e6d3bf5ed34abd39a4edb3a1deef46d26ca1c965999f95de7619ddfe9e2ec32a1cb6759d15953b34e20021600202d7f11d0ac8cd2bc26112de2161049e43105cd53ccf57dab7483861d8208fb6887e199752919196d51d28dfa33c9f820d2b974e0ff467a521d6e4baa85ba294e3b7dfab47dbb4355f98b0d53d52d782cabfc235a49bed39e0011bad7c4e31739b440e27801f18493d813ac83fa56d9063d018f21ec31f557eada22f35d785a32f69a9265af9c23e7c953e40af97d591c892d6e4b24143cb9924457c2832e924456e0495b111202f923f0a40894e76d1baa4325221726f3c10652126833392c11e1ced090c00087dd66b5988d06bd2c3581e21025487099ebcf04b2fe655ec8ccaccf64dfb529752929c95e8b0eeb884eaf33d8b9104b88d51e21e191389246521a694ba5918e48adb86d5a498bd40a17a85e1d843dddc6e3e80915e37007f595c7701775cbf88a71eae571af8c573fc27983d4237842015daceea725ea28bc4d1db559ddbf491d8db7b2b2090fd88cb7b168a3523dcf4d12ec2812c5414cf29e77701451744a2c8e89233a9d1286c39d24293e2994c4c72765db2ce62825349e0b14e484489e04160708c5bcc51df252c052334a7889074b2e0528e1627c8815581e659629166324032f24334ec88cd73c6342df2a3d70c53ce889be55268d353cf23209b81b98591f9879f7461d9383bada0b37ea526acdb7cdb72dd60c4b86c51a0825231920bf68e67e10cdc61f2c8119cd1bee87e1511054c7c4c4a60504045a6262d2daa5b74f4b75c081034e5a02803382482d82e0b0c3f5f4f4b47631e4403e9ef0f789059f4dbe7af29f67f247ee7bfcf1379ebcfef9f5cff367cc99fa55d18242f53c6e4d5ab73ee07d04e38fa3f7ae7fb5c6f8fd2d2e22f48d84369c3ad87da07ccf3113846a9b0d13870dc9bba80eb43c3b62d87804dd99da785d8c07fbae4381c88d62c1972df5a6479b3c319e18536c746c365aa30f5fd36645d09a68618d7e458c75795cf4ea76b191a11e991a1c46d9608a34241a430da6b6ba763ed231557982d10dbeececcbc8be0c1af5da329ad6d6ddad33dffee5362314c899f946caddcc1bda19f36d1fcdf81f58012a453112a4a6300ac4a630b2b8a318b55a9ef7a462b7adc535feb3a163c60c1d3c66cce0ad87df7db9e2f0bbf51b868c193d74e8987cdab6a27e4445c4d69a77b76d3b7498ac5ef7e2c2b2b2858bca8aaebcfbeee5cbefd65c26a3ca16beb86edd8b0bd617fdfe3f82e1f2bbeffdf372cde12b4c7b17345ee755a0928c92f159ef7a0336ea8b2d568bae58d159ad16b918c98e00878805a918b84730c5c561e161a85846e1e161ae0812196e516c0aa81c0db25b6c8a281141b6d86c0ac18422df2512e4802b767636dbaa93a98094701ae7300a71b14259506259ecbae8d541cb8d36a58dce28a3365647ac319cb6b1c6461a2d26d0386ba8b9adb91e24f1429df9b88fb420894c18992a1fbff1cbb7405df371269f81ecbf99d0bc4f281fda3c7c4efa9304b333cd678747ed37a5603cd2bb5fd4f15172bc1339710409d425a0041c63ed88da59bbe972d1703c42196c1d1132226278f2b8f042b4056dc69bc806a94cb7d651165016b5a97584ac93f592451fab8f0b22a172b02e581f6c71da9d8e80b0889458148be365b735c196608f7324a57492db59336c59297de47ef6be8e1ec1035386e011f270fd60eb70db93114fa54cd44fb0e4a5ccc4b3f5732c6bd15abc8194f1e562b9b44dda2c6fd16dd6af4aa948a94ac918894662c12f4bed314e4f6f9f2a1011bb63059026c4f452d3ced4144d35dd9ad8e19f9e187ca1e2a95dbdd5425cdf295b38ac1f3f1207d6978ebfb1e83fea27c5c5c929ffaa7e7ce7e0a15bbb4d58d489ba1f7d65d89a0fb3bca4b4e1b7e1a7a7bda8aa2fa8d7d70e1f8a6d5fccff6a4cd6bccced1f45471f4c6a3b7958ea38849997c093352fd1deabe017d1028eb907ee2fdc83e61ceac03518bc7c0e9fc74fe157f115bca03906700a3e8f003556a93f9142c18a0c50a349d88836180d22a25601d914a3f90aab126a547cb6cea4ed330b7723a5cec29c1c8854321688c36e0d74c790b476d6f6a4b078e1a2c515ebcbd66d10acdfaa5d6ede543b7df33d3efee5355c5b07cfdb01cf9bac3d2f02fc287b9e8891cecad92404cfcbbcfba05e5b6a80d56127a23bdd9ad68eec802acbd6572c5eb448b0d6a999d7be543b7eff0dfee8e64dfc21d4da99f4a1c740ff2c6880b795d9a0439c5e1639709c74136fd16f52b071b555d22b54162c145382ec264e27db0d82d57c21f346ca1528819a596644bb002eb5b60e4ec07132e679d10324e3633d9ef63c38700f3da66ec2e33aaa55d3d4aa8e789cbaa923ce998673b86b1f1e1b7d5a2dc1b34f8f3ef6e198d378b65a721a5a76098ce8659e03fbe9f65a908ccb45ca1307870215c121e9cd57eac187322f7101b6b5c9d8022e92b9eeb4480bdd475a379cdfdd701ea23baee17c25dba9840803a3ad8d567c0ca9609d83bd7aba152d1220160c46410290edc2191ff5daa73ac0cdde39bf63c163ea5ef528f6c2eff2f13552441681f4580ea272c261c499afb0fb2f00b5e1c1f924b4e11bb26807cbde5f86af7df00cb8f71db488b0ea41cc584bb5badd97cf9f575596556bcc26fb35896cedb5a3100c262b84229a4db6817012846952adc65090c5876d37d865225536fc06a2f8fb2466434b1aaf73a54d9ec66b132aaca842bfdaba3c48769ac2a9d3111a04cfbfcbe4fa067310c9388a58ccd6d414002924360559cc087412bec9b2f2975f86ff975fbe8f65f5d7fbf7d55fb1cce7a867d53350cec28353713b9c5aa14e578bd512753a5e8167e3397805ebf557087123a03720e45e4736ade04805bf404415b21421380130619df9825f0f30d383ba5a1f4952eed65dd03a081d3b60a2268e8c6c1f69e1d33ca98ca12aee033233f614ee53bfa3929bdeabbad7bd8b955001c4165c1fe8b1136df5c6068784d220a70544c5c2f35cb6f915cb3a43857d35073126328327509c81662a8431557780aa07f8fd27b4846a5ef342ddd1a39ac3d45ad382dcfc0fb8ca69d62c31f6a60ce686f043c439dc1cfeb9d092601122d0602e840be59d33d073c2cc90e9103c2c44c5c10b4316862e74ee46bb432d60043dd089b474d45ec31a60e6c4b474307a1cc3210282b0f783fa7e40c6d451fd5f2b7eeafcf3732e0cbb85eddd9f0856ef565656cec2ab3b4edad07bd6faecae67daa6dcfaf0c99d53c2d4efa1f7e5c0efe9d0fb3834c5db06396c4ab11c51ecb255380c15f25ac159e15aeb5e2d2c77bc1a1fe0b4216a0f76c6b8cc4e6a8f908578468480414dfd97b5fe0301c078046ac2567703a0975973693ed0057650ce0f1f1531ca951fc9815167188a8b8cd220960f27b8dd69fe9d96dda359ab5f553f556fe59e9838e8e349474e1cdab9ef60d9d657373e7e64daf493c3bfc5fa95d41351bbeaea4f1ecfb1b629eb4b5f2cdb356bcaf4c2e898032ed767fbe7becee43a1fb8bc03648a80cd5be00dc3066a40941ab211d5891510412c90b15e414e41e2f49ac5d50d6a82437ad6b10b99608c342f7d8359a666dc7812987b92b134418712502f341c4d40b3d04b480cc089280627d2743c000fd40f340cc10578269e43176303f36780c8532d2c186156860a2ac16a9a7af1e2c9865cde537f9d9ead4fddad56e0bc639a9db9cee543cbc350aed7cd858896627358488568af302f35900ab4c0b05cdc111ee8c40a75421024849beb714bbe985b780d33d3166091b9f6365360a6c1c01eb5d6c71d667c2c8ce6c801f8fd21b60037aed2e0868a56c35addc3d1ea05f5c7dc63e3471c7dfa6fa74efdedd15706f1172bd53526937afbdfff517f76b94eb74d3e585e7e303a06a85d0aad5fafd9936834cc1b6d1390a1588f2a02840a67c04e73857e69d46ae7728f3e4a760687db9c343222d403060684e88666626ed4df78203e5efb69741a9f2567e959ee347f5a807eef0f272321be690135b18601086dea88dbc5cc51644a00d9b164dbb62550b0dc6f4bbf8fcf9b3aed7ffa2bccab77be561bd4db380787f6db423b1ddefecabbefbeb2fd30995d1d1da3fea4fe3874a4fae3f7dfaaffd60cd468bc339c59a8dd204de38127021ae30de22d84126ae1c05ef0c00fca530c465d102144abd5fc68d29fcc2e63d0b0f720c8640e414422f0c8d2bec370af7518c1020de133f85efc385a85aa0411a4051883dd3872373ddaf0f579ac36a4f21787dc5bc027b2786b19d07799465f37c45b5dbd9e20a06eac5011debac2ba3a7c79ecabc941fae804a723da6992c17a830937458642fc04f8beb64e236c93ae6a4719a0a42d717b13b262464653577754349cb1d91f480659b66ae7ce55ab76ed54772e5cddf8af6beaea056b5e557ffdf557f5d71dbd562f5ab876edc245abc9479b4b4a366f292ed93cc4b57ffe5b9f7efad6fcfdaea8e3a5976eddba547a1c8f9ab170e10c287e14cf95408f823489718b11c1b8180557283bb90ab43420a2c2bc3a60b947743a236de1282aca69d004069adfe493be557f6e929780dae00f438e861e751e0dfb30bc3642acb4d658bfb3529098f69a6c5b6d7e0889527d521215839bba0534f8aa5f795f90938efb9ff952bd8fcd5f43c46051df54bfe9578ebbf8652902a4041bb075c893d8f4fdb738407367dbd427c2c9862649627dba0342738c736b7905a7d7282ce276813bd71217419219b0470af318777d4e9dd9853be7cf33d7ceb955962b604843fbb58c3c5e1b6007712bb708ed821085c7c15085a255a1818e1bf5cc2bdb7cd568d8e33c431f5051c3a526047209e5f297a10502eaef4d20e594a3b81c618e6d08e6051e950b7c36cf118c78ba5b784dc40445736e90e7ba141f88f04726dc0f0fa20c162fcbc481d3307ff9fe6f9c744fe509bda3ae56d71ec49fedc29f312a5cc279fc65badd4f0503801fa19c832e70c8cd88509ba281203f0c629f4b3c61f5dc53e9f6dd772a1f6af9406fa2508e007251be1c5a8eca01f308e5bc4008ce167800973cb71bbf260a241a6a17197d1e6ababfcdbe2241db6d6998355e7b2227d03b07d5a45d6ad2413c09dabd1614ad0a249282448ef5264687cb02a784d938642fb62d319705ae065e868518649e53c2b1c119c23981b32826c4e6619e44cf2caf4df38e000ceb348d63119e86126effa2debd6d3e0ba718cc3d385b9ea3cc71f9f25436370b6dfee0ed35451405f0f88203979c3efdd1fb1d468cc8485df4ccc0b746e57e30aefa5aaf11c3926225415055bc7af3d8854386a7e5b61dfe6c8fae35191d3edcd66fe990214969c18ecc760ce9a9e5e2547e3b588e7ea8cc9b12a4a7f29e604728ddd3cfd42ed5b437794f7bc7dee83dedbbf64f6d171e82e2ac42903e2e24313caeb7353121ae77abcefdcd57ea40d8c078661ed7f48d11f8422d3bf5c385e3e68f6ea7809b818e25235fc241cb3568491a5b136a7a0ff56f3c0a6ced0f1fafcf02caa60111039206640de0c0acb7b03258f0a70e58989796ea4bb8c4c64433caf8429f008ec58781023351b1be30283d1a004420d82d330468f756ce2d5cb16aceec521299b965dcde2ffef1fab8f24ea56b766679c7ab17ab0abfce7bf9cde9932660fbcb0b7e1f3f629e7a69e321b57afefce2252f2cc08fbd77013f5dd877a0faa17a8b0497beba63e5f29d3bd45efd7bfffef1c7f7faf65bd4e00ab8f6e6d335398b963de22d50dffe609bfaef89e3270d7d74f2a8718be6cdc3bddf3b88fbcc2b2ad95731fadb42f577f5530169737f103f5e43240afad0fb08b24020004ac77027b62854411602084511018c0aeca46ca18ac42e006611cb1862e1594e504b09cabc0298b8d69711bc71a1ceda3275d0bc917e6872413e99dfefd2b39440b6099b8849344926340c3d87a6a0e54816b144042a730138980cc1c3488e7e1c1e4f9ec7cf91b9741a374b7c5e2ac14bc87cfd46b289aee7027d908645133492ba498d7a9b78d4c26f48c6df97343cb5e4226f6c08a6fbee25e222750168d149f09e75d07309224517f82c77302a53e432eb025ca6fc2dc2a293882d3882474667001fec6c2323a7958b64c687a90fc3961abcd6f25319c9fb4d51d00788d87c82d2bce3896ce9b422f15adcedd5975f7e55adc189eb56af5ea7ea0877f3defcb9653bd53bf71b6e91930d574b962d5f4c0ad42e93a74d9db2ebe89b4bb7db5da7377efc4f10cfe98dd7f958d0ff6094ee0d31bc62dca79459f02b681f07aa6f591e22061b50b2dd1cc29ae87742bedc59f2015368442881e6314ce2c721e9ed1d20ca4da0848f2db8b9b011a977b019a385370b26fef0a2fa37750e2ec68f17ffc08fbef854ae7a42fd877a493d91fbd4f95ebdf0360c7cc0db7a82d40015f92a3f15db781da84c06fa99256256101f6c48414e99b36ab11ae8a08f64e05ff6e7d93472f9fd9d27d2b705fadc05eb17a17ea59e56b3e129fbf17a75bc9aa38ee293eecfc241b80d6e850377a91bd4f9ea0bea7aa009e3e13278ba8e3d5b28e348195a2095717f53782c8b8044393d23c785dada665e25ef8f30c0b33594e92f276955430839d190417eabefc240648fca86eb95fedadd50bb8ce2bd567feddcdfc05568552bbeaa7d5d62159b742d2b769fa4231aa6909c86aa53acce5e950ded919f8b0c2985a10caf0bf1a1b88c869649d6572cfb1c65c6d5d2f270829c96765c6a50b0ce0c20baaefe467d6d3337d50b9a29f368390130317efe71812d39cb1d530f12eb4cf5db0a75bb3a132fc3b96bb038794afd32f5b6fa03b661ebd3bb2fe2d5bb1a8a1e1f8c37e149f859bca9578f2f9eca533f513f53ffae7ee2f1f59cefa4d1b595d72e9591bf7168812240b7f90e326e226bbd8617326fc04ef2fe1c8daa10e25a527dc30d274f917f9d3ad51005bd6f2827f9f712198591af6ebc56cb12b47907bd4158755ad2caac8d9a6891b49659c05e4332ef4b5895f2db7881d50eb5427df70073e2c6f56a81568f0e657b6d3a82c432be0a2dd0f39290e16fe24375ded03c030013464156b7c16bc831e4194a0ddb0c5add66c11ff79d3c75f67afface267e1416bd59fee56aeffd04f91895a36e0476f9c64017c225a0470f196266b992d01d4a0e80d5900282148ac093a9f8468015b26cb223d48f33719400658f64b9419c035768239224b01248e8f93da9374be9dd493f4e0bb4a83c938f21c99c52f224bf852691dd922dd240eb08bbc2c84d26091076b2c06d1383e514810d3b9743e5d481393f58f502fd79df70a5ed1ab1f4df320521827cee2a7e897d165fc4aa1542cd56fa62f0b2f8b07e9dbe247f423f10bfab9788b7ec7dde2ff2dfc4a7fe37f175a8d9c8a464e05d28051857f8da75b31d7104a43d45f1a5219679792590dbdeaaf93730d6dfdbce518957840887a4d5db09376441ccb46f9c63f92bd72b29823cea7f339ce2730a080a7c817f54f01b92ffab54e88803af4e87d6f3b6a112591583091d886125991c12d2972b622122a01b9251df81f703ebc2238b92e0a50ddc0b48659684675162fb7c86037034516ffec9f6264741f4299d39189e22076d1a6c49018d125c6282ea59d98a64c207349a1385b994f168a0b95552480c33a6ac3a1d48d5bd158294e6e8733e91069b83c569a283f27cd06ebb78296e12dd4ae454c403696637533dae1d6781e2ec2ad3f528b4eab45b5fcc57a89fe762f918fa8471cbaf7955fc652357b33db1b2e5a58fecc02b8221bba0a1de5052c1227972efa6d4fbd2f3d9aa48d313e902c4da2229829f226a7930e622fd2539c400ac4f94414b00c782d44e8817b0b43f130612c9e20cc1616e3978432bc59d8a633fbda0c1aac311b9bc9fa5af54ec34468ebfd08eeab7b89dc57f723c0e6331b76a94576aecc8aca7cd9b960532a0d769883b4e6b5c8ce31d394aae5e5627d664afba6b157d4064caf5cc1586dbc823be2e7d525ea71f5239639e5fba9d5ea37eab76a35ee85437028eeb5437d42ddcaa21abc03226088817dde875ba1791f1beae80d02cfc31c90d5ac488463fe27cbc21c90dd67ad7c22a165e7bc3a9323c291e578caf18683d73c51b3bfe698a7765bdc78adba62f3e6156a07fcf17dd6befbea293ea9e1dc9a92e235bbae5fbefa75c36e4609f5373f25c2d063de048b9998b0dea0376283419f6d0ad76ba40902d218c20da126c0b6c1a11a81c29bf8c76c83b9562353460bb80445cbd1b5209ccd37d4f0807ce421f26561e5eed548b7d9473ddc8951f3b33f13f1de39f5ea8f109decc4a318093592d6ab2b91df930f025ada9013bde94d03544715c1c2421b0b8436d902871c947394c9f632c3021dc70bd4029828c0c82bc1c19c25cbae38f55c9846e85a46698bcfdb6732725b33ac7fe89c6f2cc81bae01bf3936cc231ef300f544ce811cd84e026820e7411eec21313456881163a418d9159e8ed3490fdc838ce7677233f959b625c21271a3b0518c18a9a5f1026d6ca4d4ad65b35c0c7635b395ae78a4b0cbd94beff759f6fc9553f8638cea17352c55d79495ad213501ab5e50c7e3a2f5a31b96f2173fffc78ac36460c3ed92458b16337bc6f2d0db81bfb1e8056fa6414f8c3a121e112ec9445448444478b6a20b8fe01c18395eb1af0b2ab37065689d07c0585cb8a28b0815515468b0b1b5186c8f8a335fa90586df60f189cf0fddf50f631e6f364f2dc7cdd840593c10e760447c52fcc078eac36e5a3a2030f0cf09cbd858962181302380eb35fdcc533bdf9ab56bced75fa857d59b137f9c5f5837ed6f35259b0bbf3e85037f9ef04f7ec747edd3e73f37666c4470e2a58397be4c4efab47b8f252f3c3b3722a8f5d1d78fdf8861bef51ee8159b8120a23e5ea3e033e45e003d5e5e325fb8517f43d3a39464dcb74a61192449cb2049486aca20d9901c81cc60402244b3ec95a7c8db647924f58f6708dc8f0db74f37dc065874ef22cb1f61b41f2c4a3c3ccf82bcde00895874882f332e97d102abe4543a802f7dc4fac09d6b435a3ef392e2c79510b446d84a6ddb6c94b9145fc00666cca729fb4fef3bf6e1bed3ea3550846fd46b607867de397ffe0e5d56ffa47a45fd1c27e068d686a6484840ef786339e6e1a985509f8f673397c10b61944d39fc0662e10ee2010736453b6082ff8b8fc991988c8f463481f6e47af223e83cba888a021289c4316b6c27215c089f8062700c89e7e2798fe0923aa0549c4a32b94cbebdd00b75c7dd496fae37df53188e860805640237819f839e83206836379b9f29cc9736a20d423ce8000b7de09ff469387e1e5fc2fffc7bc309b0dc81dc77f7d8e85e3784c45dccafe2426f6f3e44e0c19772218a4c43149d4242309b192130770bfacefbddad1eeeb620a4cf5600dc08e08574925ea7c8926f0e884e4406f305ff0c90ba9494bf76b4cddbe6800f697ef72781083c5100512956258e8f068fdb8574e1db29c94a3fd29fcf56bcca7032913ccd8f53f294425244e6f245fc7c653d29e3c3442413f0fe9c008603815fe440f64419c99ca2e89131843a388714ac371b5d5c24ef125ca24b72cbd18a47e732ba8c99a4234de352f964295dced065e9938d3d500fdc87686889cf06779b2d7925afdc4de9aff71abdc66104fcbb3ec75840c6d151dc683e4fc813f3a47c395fc9d7cd023e1492e7e92c6e063f5b982dce92a648cfeb8bf445c662524297704bf9c5f24bba52e3066e9bf10de313ccbf6a2c62312ac6ee6e67c04c675c675f67d5a52ad8ee0f55e09895bbcd0a6003f3bd3b6c44b3198d177805032720450f827705a29a03f351914246825e6ac8937121b96f5576ce30af5d83a7b20578ab61546023289568ae6bfef7dae19288249913112f7302260a15b009fe86fb1bc99a88175cc2d3f1cc4baa8ba04bea93eaf07f12877f0a516afd6fa4b061310d6316a31e2cc64dcd13aff3c6f95131263cdb5002dc616224653320231091f3f2604b4459b325d6ffbd022185094b264fec248d249364e05b0fe2255ede2b3d4a1ee51f95c69217c95a620ec021344289c1f1b43dee40bd0a44a8f4793a45d9a6b0a10eaaf508ac0f77096fc55b2e35dc390dbdd84c0aea7f82b8ef04d37fb6ee2a42435fabbca11aee94584a3d5b02eb47cb7810379ccd214161d934964952b4810dc137e076c3d21cdc3e9c63f77a41c6c520311e60a50f8cf592649eea24a40ba021925997a44ba3195296ae27ed230dd40da6c3a5023a419aac9b459f978a74db7401fed43b1b76c391d3b9b2fa1c7ae27e675a553f8ebfb8f9fee4cacddc6affd8fd30c10e16bb93d7c4ed11f6933de84d085569572435e7ffb448a8e5f400cd96d69f49d1c689ef6a294f96b18dacc2bbefdc51a1bed2dfeb4bff38b20bb602ce8450a00dfe3f8cec0268c195dad02e1bd915d6323a9fd046fd594b93bd66ba07efe7594b51574ef04f6e33f9a651b1d90bda0c2a6d729bd63c0c812f04816964b23aecc71f05fb6fff2a1538d6be4b74377f59b3dd415e054c345a20520cd27ee58cd6aa33205d7e71a63524e2a4da4bed759200b31bcee365ea4cc2961136d6a9619c5ddd0b7d34bd8df680bde7cc2c6f00681103e939fbfd7fa87b4b4b590f2ab93b64a9500077b6f5caf8007a8ba3dd3067bee29f67e1cf341ab5d422a7a51639f8f8528b5a3326e3904dea61a1407d093f079d2c0494d19a2b044be84135ded8e0085da06c447b028543468bab38e2b0f390bbdab23c508f0269904196741154b2778f01929cb90056d727798021ebefb2f93c2cb36b6170cbfb6c725872787244b22b3932392a2bd61be60df746785dde486f544e584e784e448e2b2732272a27764aece2b092f09288125749e4e2a855b115b17762c39b7edaf4a3a61fe485e745e4b9f222a7844f8998e29a12393f7c7ec47cd7fcc8a08746c0d2da039b9a93a5910f258fc9916b7b174cde74a8ba3aab66c9ded30df731796d43dec141638f8cf89f3b24b5a070f4f44b07e2fb352ca82c18f5c1f6f78e5a8b96b56953191b5bcf50ea61a0d50e901e1da0d40ede607a486f920f0539969baa43370423abb567905e90427a684834e5ae9649b8c1c6988edf4e3e98173e3fbc229c423b9bc656a0a998b589cd1b80b6c632e9a7dfbcb666cd6bac34acecf866e199c6c633856f763c7488249dbe79f33414f258fe28b546fd0d3e35a3f277436380c3531bafd39bc0c36094e50d45c57809672c362c510e59b84381d52c3d6735a05ef6ee21e6fa1b4de939334bbaff7c9b0523a1e6d0f9a1ab422b4279dc02eaa5fad37451fe341dbd39e0e59cb78e1f7f2be7e501fd778e6c00ecd21a0b83b773697b1313af9f3d7b3d31b1323a1a77c1466cc51ddd402d681537021a68f6512be41032da0ff1d2726335de00101b49a4a7c5aaeb1ea6a9574a4a33b56a1fa2164be968ccf44db208689911a7dbabab3bbe39f77463e3e9b96f369c00b2edde0da4a30749eeef75bbf347e16e58824fb751aac34f3ee46f571150cb8e42d1146f34607eb9585ac23bf660fe901ebf1b74c85aad5fee0c7510c921a1bec46aeaeed49a58eb9f0678b7ce37207bd737c2169f153625ac22ecd3b03b617c16cac25924cb9115cab71293a424b99532194dc693c964c7e45079e45446e0c88066dabafc1196a8115de48aeaf7ebcfbe33f1c4e8319f3eadde554fe0f8faafb1584d762ed97cc84872471c39d1aeddbe8456b80356b00d7755afd66e38b06f2b938024e8d86f406b1b1aee75f266ac97f608b8046d300a350ab189489479c960d2f5b3331ba73073acf39963a3b6af4d17aeadcfacadb5faa60ca7b031b414ab066ebd8e1c47858385014c321c3e20ed4e4b65ca457eab1ad31f27a99f1daaaadaf79e60df94337e4c697d12fdac74c0bbaf335aab43b811406b1d8a0334ef0ed687c9d6625bc021133d14e3ae8ead910f99de0b098b094692bea760b5babac76be3b23e71a8bde11308f5a236b6025291303fa122e10f3a1468262de29196a21298964ab7ef2c5bb773e7bab29dd5aa7a6fd4de471fddfad8db0732f6cffda4befe93b9fb33aa49e78faf5cf9f8c4952bdfab5fabdf8585bfd52ae1bdf79f18331a60111bc3ee387a4c25a3ef614018f91a7ddb81decb881ab15062b454eb37281810c60066197b68a1bea6f6996c6899cde34ade9fe7d0b2cd6e8bafc91636f95ab3445c7ef5dcb9657b0f1dca7e6be607c7c98e8627c9d66d5b8fec682811ec0d5bc7e6ffc864f50378f86cc1ae8d1726423474847b13d5101e4b1cead13c6a7aa39e2515cccd33af792db7a50da27e500d7f5cdefd0ac1fe1dd4d778591da2d5a74326d4cdebd41111198fe8c512fe3d54a37fd32c997961a0014b7ad4c3acd57e23c3fa606c5c63023cc8e2b5e458f22c532cbe07d99b7297be07befa768fb613fa694f5dfef9d1f2519b84b8effc142c87272be065e2ff7b0eb3066d684a624aa8c7c349cc1bff358969d646719ee2882205905812cf274a43086066693a99c52f244bf995d25ab29edf20bd4aac2c7349745411e3682cc7f29689a2573f9ee6e997d2c580995708a5e266ba41aca4aff107c58fc4cfc55fe91dfa2b77870b6119499690d4d0a9c57df810f17cdfb08f3c7da7e1c421c15e3f015f6fb8dbb097b81bae427f1f702eea1db481b0de34cf5bf31acc7cd36cc83bbce06317b04ab0ff5ee79736310cb4260a8df0c6085639c8848430d1a12f0973d1ead09a60b3882c264912722c9229c719042ec7ad253feaebeb7c63aa999937ee6ae94726825e5b72744ef494e855d115f0793ffa5a7463b40c32e91b4c6d29990f44d4e113d1f8ee4717be71e4d0b499a5bb0e4d9bb562d7a1435955b3e7bc4e97ce7deee7af99c0be52ce04966cddbee5fd571b4ab8bc7de346cf6dd617e8810da53fac2f357fad2f379af4e5409ee39c83fc51631cff078d81073385f1d9f6999abd09047b63130e59d1217d35cb0e5a4d8f52aba3fb1fe6ee79dd59c185a85028128ba422b94829d215ea8b0c45c6225391b9c85268ad08be136c797876cd4353fca6afdbfb7ad9dabd7bd7dec156f5f69dffa83f620bbd76f3e4c99bb73e3ef15db9fab15aa7fe00863c03ecb51d776018022ce20e6821f38a5dbca14d5eb1dab81cbf476bc2c023f6d47c630b1461be71a3c9317a659f67fc329cc3233dcda4f1438887a0c5f443879a1104e9d0042b7637ec1394ca1618027fdfe41a5b5a6bad6d4df8a6dab43cf4bde09a300dddf4049cd3c26737b5edf81fdaf6a781eb0736d9e2c6494dae9a4c6ff6df1dabab9b514ec3be16ce3bbff2f75ffc3245fb40eb2c80dded02c4ff161d2d3156cb35a2224090d7c3ca5c87660fc1575f38c39cf3811cdb361b93a6983f885220ed13d1bb55f96b40a3c38b6d6d9cf480d572fa48c37e10a482313c0f4f9b0c98ea043c2d16ddf467df1ef727df1e7f907c03acb594b3173b960631ace5a97e907d7b2c54328a923daa7b1c6bd58587b26fe0d17e66e0cbfa70f6ad29f9866299319be4549c3aa7be0d408856ba56fa4e7227a593ae935ee7422e1c4de294385d822dc99ee44808880b8f8b8877c54746c7162bc5ba627db1c1cade7b4188a0083aaaa7066aa4266aa6c134848652271726c726c567c53f155f143f3f7e557c45fc9df82088f3a6fe31cdc700f41fd37c8c7674d980dd23962e1dbd2eab76e7afff1871ec9982e3a3162e1ffbbaf7f58d5f7e527080cbda1717376890b777a43161d3d2f2836ef791b4b4e18ff6cdf198a2cb166eddabcd1e6b0fcee8277e2bd8074086465e32d13dc8826ba41245073406f9375b8dcc3e68a024c51fdefa2620824f7dc3e7531912013103af03489f21120b9e850bd5c57da7bff7dec5ed2525fc56f5c3d2868aa503366ffb3bc92bc55d9847dd071662986699ec10ad3a1fd8a6e50aaeb157ebc132d97503c046f5703021cff049d48d94660335d9719419289ba545aecf1f6ee07dcc40fdadbabaeb9b333ff8189fc387c9ae8651dbb61dd9410aef57ec2d187387ee46be9c0a20d03c8818ef7b63ff98af1090c0f21502cb57bccf128104f31c12d97c5fa5451c6d1fc4e6df36c7d1ff875420f6aeec45261296c92a26f3c96ab28348ec413295b5ac77080de162104b60c4732e290da5e18eb423972cb1ec546fda9bebc1f712bcd21034040fa7c3b91ca90015e0097402378e1f2fe44933d10c5c480bb999fc1c61315a8c97d2a5e0498b85f5683dde4036d38ddc467e83b09b7f4da8928e4ad7a446a94b7336caddf918cec5b9c7d427ef7179f583e8defb1540a121408034a0901e7fefedcd0ff6e50b072b321dccf28583ffaff285efff45be90d1b06f9585cdbeb136cfc3d1f9c8c8e88a7d0ba90cfe893a4dd4fd7f4e33626f234f0248001fa5a429bd496fbe87e2559e204ff083951ce559f22c5fa0cc065ecce68bf812b2896ce4d72935a486ff849ca0e7f8309ec854e074bc22e964d8e81d24980670217ca8142adb750e3d1b9d7093581ac979f828214af448b172b412a973eb33683a972e65b0bc22e9457b705e2edb370a2b7593bb29dd742ca7c8b83884e4708ff28f098f8939d2e3f22065b06e0ccac763c9443a969bc84f14268acfcaa374e3f4938d33d14c3c9bcca3cf73f380bb45c21cb1487c5e9a2d17c985ca73ba79fa12362e6cdc8036e075642d2de7b6f06c546493e44d5aafdf66dc8576e11d64077d9d7b9ddf23ec115f9776e8df30be4ddea4ef71eff2d5f2fbc65a728c9ee14ef1b33589b069ffd84da97b48f5b7df5cfaf69b6af5f2a5fffc740964633d9dc8cafd0ababe7e22c84827d0a2d920233adcd5db836783959c857222dbf01c26985a08b0dd02772a1659c16ca3534064640b084cb62272989340c3887f0f1442df2420a6e6895a165fa2ad49e71e24dd6a2d817f185affa348fc5907372a1ca784700e2546e9ccb555067343c5614a81f21c9ec33d27ce5056700b954ddc366e83b84659a5ecc27bb837b89de2ab4a85e25428c7830ee842a88377c821ba781ac37be4049dcbd01167d0f67c3b91e593930dbd690fbebbdc47e7350c67ba4a86d3a1fc1061b838441a220fd7e518261b9ec745862d789df83ade215619ce19ae191a0d49407b9968292a066eb97cf5695c79493dac1ebe84df52a75dc2f1389ecb6bb8d6f001ae567b913e24409d8ab56c5467400ccc9299f0326f575122b2059918991132192d26643258f406c436460328aede026a9b6dd0c966a4e34be87b465d0d5bd7a9c8a0ad928933e9cc4d0c9034b2eb5a905de79b5caf51dd3ff662796860ef0fdac8ff1098c2687e4740bc24c8d410a0041acc06b721cdd05b19a80c308c904728139512c37cc35a835541d008d0349d51670ac40e62e6cc7ca062d7d9f521c610532c8a069febe25c7cbc14277b94685db43ed690604c30b92cedc156a691642e99efa0a4ebd2f51d0c19c60c53b2e511e4c55ee2a55eceebd7c06cb9bbd2d3d0dbd8dbe4b50c428fe247c9609ac3e5007f06037f86ca43410b07eb871b879b722c05b8808c5726182798f22c85d2f3c6e74d4bd14bf262dd62fd52c352e352d326b94c57a6df6cdc6cdaa1dba17fddf8baa9ca72ce72cdd268190bbce4057f48d6bebd96ef276b07ac9bbbf6997e835223d54e3e733bfee3399b7b150fe206d4afa3cf304e0e037475193829a397bd21926f3e37284bb6b407d5d03dbc4431e2b02f01adf34d656cd205ffda2c4d476a536aff6b323a9b59c418d293f416799d64d205d150295172e9d2698694ac63d4eaae51abab34940e979ed2e5e13c5240f3b83c7eb454a49baf7b4317fa503a7a2a9dd8d08f1ca89f470e348ce5f276d75f5ebb9b7aa02f18a9fbb94088bda2d12c6fbb6093432778e410b3234cc7bb2229d2ed91d11e7c5476ecb1bde9d1cb0a1f1d108cc214de46ecc815dc5531f11e26865ad2dab78cd60f427c535633fcf33cebeb6a59080198c09ad13c9f352319ef07373a92d730c983e51c0c39a5faf227be19790ca473815d7edff3cccace9d4b9fdef37b976e2b863cf1ece41143561c59b5eeea8f1b66944e2fbb73756de9b015bfbdbc32387465f96f2b86b1be716a18de2784415c697d07a337b57577e60b5a96fa4cb2b6a86e5fa510f61b7ba7da439428f1a647784203f4262954e7083671bc8ba2e03da1688ffb68a8698fe54d8f3338c461c200bd421c6e2b8742221c5d414d394f33f0e07cccd632469c8f2e2940183f49fe9232bed59d3eea3451c64f0eb662b1893e3e7234d3c7edc6a8c7f2c123264f1e3178798facdf5f7b6665972e2b9f79edf7ac23434a7f2b5f191abcf2e5df560e2d5d7bf54ed9f4d2191b7ebcba8e49f0257c9ebf4cdba230e4f69ab139548f6c5c79a8ad5c1f8e4ce1663659ce7ca1fe429df9a88f4f5a723336867d9ad3c38101ec032de42f4f786bd4b36b74bc68da923b6cef6876b456e125e396dc217b68dbfd03bb75e208e5bbf47f7cffc0ee99da6e3fc4d6e7abcb08022d62f3d4c77a2dbef5f9358a247288f218f966a9fb462bb465f9da7afdf7d8322fe6a6b4f58d5aa2be7920c23758f21ebbe2bbc39fca6f5ecf8f19ee755bc06f1274faf469c7763b1dadde4b24a578acba05f0ee5ef504e7e637827a46a247bd89b6003b32e9010d154b4b74e662d312fd217b80ee505884b33a607994d381e4709bce2472d6e028f395ba0b6c55bd3fce63f0db5ceb4b1b5bfd1c4ff6f8567fb3d02196a66b594d115a13c382e3f696545b4000d9b576c70e62eeb3a41beeb1b4d7234bfb17fc87ad83fb4f01eebd74111d66fdbafad0d7f495bdf109b4be824f88ad0c778bea0decb233c3054e3c25804dc9e422a1f30bc0df8fe6efa05094e78d1403245c8cacca1ebba4e72ad0bae0d5667d851119649de864ef0e709aaf649e3903e2e99b2499c2a63c5cc8bc9da2cd3d4fd6601e50d5a951d5091f1f550fb0591e0435a7c11dfe0995dac04f6a9a59cb420ce8b7a4f3ba19b8449d4d5ad747d49d38f1f9adce1bf80307e3e3b75cf8a2544daaacc49f95dec6fcff44b07823173dc6d570fbb5b5298bbcbda91ceae05a87a35827890cd35b5bb371509b0987b53e64fbde54177b28ecfbc8e4703db27209d1f664a7233421cce60c9269b44ec19444c791e9c28c8438e7f4a064f3951b75d029cdfc687ad6a4869a83bca05d64a2de7c1dfaad2d246d1f28fa56ee078adaf2e1985831d6b77cb87d6cfb402d3ab6b5c823d0c273d33ef144c7c47d36ed5ca7199d3b3edff9dcd4731e4f4cccb9e9e7dacff066ce7c72cbb4295b5f9e3ab59c7ef5d9f44f3acdea92353d036e898bf178ce4dffa4cb731dbd333a7c32fd5cac275a9d3b65f3e629d3ca5f66dafa1870f3187f1105a1e3de1e666209b09888d114c036669364908cc46090b24d0080d1f940c1aa3b6f97cd8605442f1b291f60a20eab99224b810d8dc54e4381c28f1569b099ad4bab635390fdbd0ef4e5b2d969562cd6ff161df9c52158138760f8f8a7e2c7159b569976992a4c6f9bf85870f9b1c678739c25cedade98612ed12fb1ee32ec34569af7588c6c12907fbd6c5a2c7cf986d94172444724b7421d7352cdc31583d40358528f1dc18578f6fbea87b0fff620bc0d9f5033f089c2d42d85a44f433752d370b0704b2ab3259cba1def03cdf5af15c13f23ee675e02832f1009a4bbae79ad08b3fa369fe507d9dbd8a0905f38c4be99fc3dd9d8996ed766897541abbd9949c909020a0c4b4ee70cb12fc5185ed2271c8ff9c86d3eaeff2873b53b2b09ae2573b6b0d6723ab50dcd683dd4250fd5478564c444d1a1a95960106eb05748f85670f896e86b53c81e2c72d4e6a66bc6de87e31ebc62c1372299a519ba2c94d564e87c2f8fd09632d89af20fcc0637cf5c7f280be14f4234af76c785595d96ddcbea527ae6f1d20ea39ef924c4787ed19323bb649cf95befcdc386aeeb5830f56af0e7f3473ed1a9d3c7bb7a6fa2bbdb8c68d36f7149eb27daf45d42d6ee888dcde93962ba499ab579ec88e569ed267957ee0e0b83b383fa15141a9fdf54f04469db5653ba2fdc16c6e8f805df83c60b668d1b6bd8bca44f387456c2f988cfe7801df53e17cce640205fd70d5a87ff383ba96580a9bd7022d0779b267912bbbda50308fecb3abc16068df2f83c610a9e42a6f05304692406efc996cc90dcd3a7d5d9a74f0be653a74e01a4c3a110497fc39f4581607f7aa3aede98cea7bb743cf3c8a9e8b6a793db9de9792ae824fa38faa4befda86e9d93731364a15b6eb82c58fb98af9cd196b180c1f4add169b8fdf96d33fb4ac66c4189b622fee185268151da9a1c3be31ec39efef52931817f1e53f4b38f431bb13869d233cf4c9aa4febe71a3fabb6f1f8b1b177d9d9b9b97979bfbf5a217afe78e1c99fb64eef5d7b2176697bdf6fa16ef9cecae4b7bfce3fefd7ff45ec29f7d167e7a6ff346f5fea449cfc23ee6376ec602ec8fcbcdcdfd66e182ebb9b94f3d953bf2eb458baf8fcccdfd7941a4eb8d97b7ed8b882a0a73defdf4b39f9c6cfde0747c9176d2d63685a378f49437354ef47011d62033b98e22ae9ad1579eabbc127c2de85f8eabca97ced50928c810618e12088eb3084f73cf04453d6d4800d538c3d2b5dad267fffb42c0c3df6549db1f3ef72dc6d360a2b6b00bb71c9f4e7d687c9a7f308abd8c5435e4907d65ad568d9cbff1fd9a8333677659d2adf7eaeeefbca5d6bdf2c2e8c7c62f243985a45af54ec9ea5632b5e425ee8927a2a28a9cceaa3b5d077afbaf9a16a6bd636705e7e1dce0fd0da818bccf2d966bbae5cb35ddf2e59a6e818028b7747a9d7c4b92f56ca3c806d120dd124543b64c74dc4d11ed32ca7a9e88144de61571b2fe59a3b9be3ef302cbc6f9bbfa8779c00f96c4fdf1188cad03b3756636df86f3b037c2a8896edf8673bfafde55efbe8fb73f86b737effad05d04a0bb5c40e4815e852b2748a0ecd5b2e62b9ae25da865f3479801bec493ddf777d15c8855cbd0ffd3bb06b88774a503ea073823bd7b76d7ac9493bd924f66f4e97a4a9f710a9d0cfa587f32ba57f7d464ae6d766656467aefb6797dd3f3ba66e65ae5f0beb9821cfe54427f70cedabab05ae03c4b595a3334b7ccf4e80733d3a9cfd98c5b6da1e95faa4cec7f51319bdbd2f22d3360200303ddb1fe79a71cfa0bad79f1bf68d8bcc2c267870e2ba8da37212fa86b9ba57b1774ea9d9ebd852ff82bb519f7df944c1dadd675e9db2f6bdcacd943a658a4febdaf7d9697aa96d36e40f78bfc689ac8ff02744f7a87fc886e6b846f7a29c4ff76960ae3ca4532a4a192ff651db3bcc7e84cda59f36021c8e5b508c71cb5e8987e75a83cc2fa041d1114aa2dc2d366bfb097803cfc2a9ee64436681a4139cf3e9b93f3ece481dee712dbb439545c72a09a9f3c3967e0a44903074e59d0b64deb69d92fbe73a0a4585baffae07d1926d4c61bc47f2ad272f4a98cf5e54683f6de0cbde45004b386399a56afc23eec3ef4f20c86015abc40a3e1bcb69e9353e755aaf3f0a24abce8fe2eb6ee2097949303da8adf3ede68344f80fae7090297cd1164bc6a4257c9afbaab26ebea6064945ec00e23609d2b806cebb419dc77d9ec5edf725f3fba094c113558a3bd2da13dfac3ea492c603ddedd50199585878d1fdc6e4eaffe8b3356ef53dfee408dd39e8de880dbe6663fea76173a9d2f3eb34cbd910cad1b4d5690b3da1b127a7963d91b12aeca11575db6ab0ec355f937e157e755d76feed5f10136640f7e21c6fc027b37423c34b096a113df5c6c308675f53ee4e07f0fc29f4718fefce603760bd13f39f6c89b19f37ab49bd575d2f3939f19929b3b2affa9b882477bcf6fbf6acf082ecf3ae9b1b9c50efbecd090813dfaf47b262bb363676be0748bf5b931ddf320029ecedda68f35cd9722cdf3a52efc5fcd9762ef065976423dbc49285097306bb24f1dc27d03f19d0bf5f77a6cc1113440a0b29e62ab49287106b02104f45e64b06c9525dd8008368810e91be3acf54d1d61af90aabbc29258da58c2c188a8bca87351f40fa3092d1da51fa25bf655bf54b2aeacdaed915dcef8deeeee8f9952568f2e284d5087084a43afd5eb76ef262beab76766e8f4eb020306e40c1c386040c317487b7742272e0370b60179bc5689701fa00502312271240fb1a3ce68be70a1fe8ab630b856cba9256b30967db459dd64363ebae2c8ca2fbec71c7ff1f70221e2f7afe800cbd5ea23b7b477b3905e781feda1e522c0c4b277bff829cb8cabefe52cb4870a5c70ab33c90708211b8af01a654131fc8f00fbe6582adb9905677621e9423d502939f22f869ec8a0f6e9cf3fd7666862549fa44e9989adbb4c481efe845ebfc8624a6e133eb433b46429e8cf47fc35088f5b7983447455a657397255fe955fad93e60a23e95c3c17e9cc57ee6ad3c781ef9a24a6401b2d625a7bf61a8ac8f233d7be5d7ab6e10baa9031f133621b129f65d8200fb041be860d4c1077b6f1060326f82a007080f92ab7da896c061cfcb4f88ced698353b3424deeb04eb3459aab6ff1caafc016b64973ee78d85b9f7cf2167b15c084178ac64f9837171c3a177af5fdf72f5f39f2fed5e9af2c595c51b1786985360f6405d7eb811fd7df32e86545d6dd52c057df1225510f0e5c9244fe96c0134ab85b147cfb2da00b0f0e9fcd1cd7f30ad5fcb85ec23c92262b229e4cd114f0e399f560b5ac7fe1c7ffda7fb7582eaead16c71edfe6037c514d040f7e1eef6fdae3dc6aee636aeefb606df4ef3fd86d6c444b1baf8b45fc1d730c9a8d4008d0bfb8650df966601b4d43c87f3dabc5f5697fb83ebaf9f7d3fffc7bf6c60df559ba57d3d268a056922b84279c108cb474078a5ce4d697d9de73d77884a8e00099c728244a464e1ce58c8c31c9ce000fcb7b68eb6c9bb21cd6e661dbb3e6bbb7adbe85ea2c3bf36010098c8747331e1ef8f88347dd0c6e063f4398213ee7e4193ef72d5bff230c66cbdb99dfb781f5c3778fb41f31a263eaa249030ee4e51e1d57fd65efe1c392632451a83d758a9c2b1fbb70e8b0bf5ccc9e8e8d2ad0455b45203e6d8d4151401711d5733578e65f9cbff7d0f949bef3161135b0f3c87c8037581431d1cb9b0cc84246b66dbe33b7f9cefbda9df6038addcdc39db2d73ed0edb227b9b916770f68befbf7a6bbad06edee646b9601594d06b81b34cbdf0af0b44614894e7b07e92d067da833d4687186864309b3389da1064ba429526f31ea4da64897c51419c18eb3f5a126834c3f70c8e1650679a5cb191ee60c7245441aac8231482f84a221414e93f0bfba7bf6f8a88aabcfdc7b77ef6ef6fd4ab279ed6e36d9ddbc434288603017411479c5aabc042560784a8204508834e08387800610118a245ab4a24011a9218022855a11dacf7e815fdbafa16a4b7d50a4b422454cee7e67e6dedd6c4250acfafdf1edcddedc9d7b66e69c336766ce3cce9951f6145f3a6a88a8af5a4f50754c19bb46a62b0bca3e4205fd04dbddd4d5663c662127d682c0eba7ebf3de2463adf127466abf975ce19f629a6e9e67aa332f4859903adf3bdfb7d86fa45302b1f328c447625d892876e2fc1d63cba5d163cacbc73e239fe77cf298fe3734d6ce79aebc8c732a76e3da71e563470f281f3346febcc3cd8fc8aa1d52dbf4dc9cc1f3b32eaf64a6e428ed3a00f1166ce12dd8a22e93fada6c668bd96ab358cc269bc56ca4bf6ed4ace70deb6d64bd753d2cb189ebf91d26bdcd6a311935e63810745a2ec51e6776625750c6ec959539a482b2b3741e97f5d8dd4de995ddf18be932bce4986a7bc0fa806da9f131ebd3b6065793eba04b4fb739daa256cebc9f2460b722967424ab96cefd3bce37fd86bb7fa5fc3a3916357aa6f4684e6e693fcf5b51866ae579d4e21c652883c9ec83248fd57d6675cd6439a0caf81626cbddc32f77099fa5843319c77010255e321214bf28c48828c4970c422f6924a364e51498ebb1bbdbc752cf5672e50b58eacf63017862c22f2be16119c327b25cb3955c6938e8f6106d1c8839b48e5007086358ae0ac4972a0460d38c10cc270268f6315b54374c95bc56fd368309cbcfbede6c1045e276081653bc5b288ab3995274b0208935de74e25dd90af07611735459542885bcc9f5c9bb92f9467d635ca3a1d1d8686eb4345a1b6d07f507e30e1a0e1a0f9a0f5a0e5a0fdaac13a805b96a0d4fe73b1dacf8543bf956d2445e254fcbd3e50a79e2d1a3c74885bcebf388c1bce664c42e9e3bd040fe2aa736749c8998cc2b1cd614b3d6a3406d3d64d61e80235d60ed81a33cddeaf0a42bad07b3f0643c2d5478ad09325e770fbfdc257c96124e794dc3b115b324a5b9682be649b2a6713129df1d85fc8a4126eee17d857a843415faca0bbdbe8242abcf53a88d8931221ae34b16c3b987f724e959bbe7199964f57892684b4650fd29d76c167e852dd963d2f0b8cdca6af366ec9785cd6c615ab3992e526f5656a737d3d5e9cd74527f335b9dbe318ebab2e008e834bc414f772e881a81273aace07461baec789132b3cb1e3abb684dd70d0831ffa9371a91902021a5846836cba5e4e80372895c329fbc235f379f1c23c78461f8bb74013926972c2047c9b105720939862df294f03ecddfb409a0c7162507b64865a99e24534eae230e95635356c0eb3409d981b424617dc0b43e694d60556e4e6eb633c1ea4df33390d42cabe811ddfe62ab3bc19acbac4dd9b448cc547464039ef52d6539860d90d51534297b348c738d76dfe99be1aaf2d5b9e6a7ccf3e9073bc6c228c70cb8d7716fca8cd04350eb989fb23064a0fbfe09d513c1c606ce745b1e8ea6451c30b35deb0974b6dbee627e8d82625078bda3f886e7ee6943ae2ce88fffe58e6070e98891d466f5e153a39f9ff2f2880a6a05bcf8d45dcf4f15c6b4ef960652dbd5d97bf74a03a931ebec0383b64c21ba266abd3a7ce8c1b16f4f952f32abe0a1430f8e41696196844c42fba86dd33926a1ddc32f77099fa584b3b6e99cdaab260295ae02a737d1e3b4262af542811e1185fe9241a7ec216e2795455b85fb1ea7e41ee9f4ba0b9c56b7c7a9a3b114db2896773f35ef5a8cd569bd6c0417f49792cdebf5a6f5dc4558627059f4bc40ec6e6db9298e3a128867fb10a316ccedcc84596f49f0249427dc93a0d8d117472d971d11b3d7a3efca11d3e577e5d59b363e816dc4a50fdbdafe22ef14821dbf5bbb7429b51ca21615dbb54e6c1736498579419f51d09abc2064c72f4d486a7164b7f01b1cabf28d7a53aad717d4eb32823a6daa2ec31a9fa7b3c260eac2abfdb8f5ed7327141f5e8aa256705a3e47778ca33cd1bdaf924563d15a444bd0127adcf8b8498cd3c6897427429c29ce63f2c6f98ce942c06d727bdcde7ede7ebee19ee1de21be21e9333c33bc2f685f105ff452cb1287e27247fb0d5be34a239b0cf7fde37fdefb13bfe1a57e03fabe38f1c35669f9908a5503e63e787dd5f889a37fb641f7c8fd0f2fdf2fdcffce9f3ef940573bb1e0b6eccc194fdcbbbdd99db8352df59ebbcaefb8a1f4fa6577d56f4f9d3a7be5235fada3bd0fb3d1d14ec132bc114b5e0b037e046090c4f24041c013e0951eaa3bccdc6b80398a30ba3d8650ae53e99394f7a5d1f7c7f1bd738f33bfcc40a5d19b5f5066cdf79429d2a8c05aa3b0d310d6bbc79917a2b0aefa504da822ef9e909437325498571e823c4b28ae339ea88dc63b86f132257320d7991b308845d739af2bc214ac47f0af1748faf292f2024b89a540985048c763185bac11eab0f72c861b082f0d0ce665f6379ba0f7b6ccf8a5aee576d866ee676f4971e72fcddb97cdb798f78bbde2f67adcab32cb7b9706b416c82c4d11031617e84cfd033a4b5ea92efda67266cb44a7338fa8cbd591d1d0113a5c3f72babd8c4de31631930fc5c289197e2c29cc29cc2dcc2bcc2f2c282c9472a45c294fca970aa4c28a9c8adc8abc8afc8a828ac2c7721e2b5c2c35484dd22ee92de93de903bcce4ba9e5508ef5abdc5c6ed144d288c48fc4ad811a6d8da9c65c6399983b316f62fec482d9b9b3f366e7cf2e589cbb386f71fee282546650a2d88ea8cefe62ad4b229307571a41f19d93ccdad7c90b2b36b69807dd7ae2d1bf105dfb6ee3f1e669efdc7bef7b337e7669f8903f3cf9c67fc79a483d71f21f8af914f714b53c2185e3ee964f5d1e77f09d92929dd9b90b1e78f0c1fd2f75da4c4d9413557b2a2cf7fbe579d44609cb7d90a2cfc1934c9f63d6384c2607b3f001b0b2c7f0b93d85632b789486a314bbd2d29315295620ac5188690c826a7c5e45e30b5393cb17b55370e438209c0a60d7c25b2ced06d4c96a58f8dcd8f0f09f317c3ccbf32d254ffa966a73a241d1e6c217106230cb538198a6428041a76a736c673ab674660891a07477665d2033cd9f9651e7f7a759eafc69a1ba60087f0782a16066466628144cf7a77b7028e3f57a6e0c050399e93eaf47e74fe32d7ebe2559dfe25a95ec7f352b10b41b7ddec45026c26ad22c5aa3dd7e9bd69e488d6814a747d11e97da70289b3294ae56dd777c14f504f5cb9e3f13cdb1ceb1cab3a9823f3f3e33c7134a2ff017646465e605f282d9a13e998333c778c7f8a82dde94f479de79be79e98e4c7f66462080ad61a84f060264dc9439ce3bce37c93bc9570ff5a49e5bc8d7b11df6f5313becebedf58e7a679d6b61f2c294fad4fa343a767a30bd29fb7c76908e9f62168ee802219d1207d55b2136c8414d3033589c9099a0e107178dc9fa59cbceb56b76f6d1ff788e7cfaa38fe5bf11e7297befec46f9908fb87f71ba9e0cf7c97fe4d7d9ac7f387ce0cf7f3eb0f000093c297fb0232c1f25a5e1cba454a3d93373f2f8e36b6a2a275159502c7e685b3892c9df7178262a7ff3982c546038b6c5b53d85cebd3294b6b7b5542614bdb457f47d69f4fd717ad4c71e9737dfc2da5b6f41bed5ebc957da5b05d61a859dc66063f5d0424f799232a2fe233cadf99350c3d62a0d902539e10ca73d2370bacd429c51af217304a02e9f99ab67c5631d3b14a090a8ae17e9c431f7fe45fc745c66de006b2ecaf62fb8012f638ab7849f17360b0754ddf0b45496931bf0a4265da11bb6044c2d497bafd00d51334c15edfedbb2acf6849b7295c9d1a2aedb147ad40dd53d44d2ec1029cf1beb1c957267ea28ef0cd71494ad3aa15e531f63c1516fac332d74d525d527d73399aaf7d47beb7cf5e9f5fefa8c7aac773f71afcf7cc9dd94773e2f4075ca3b53c785a6c3144715ea950b612ed32b57a4ad4fdc94f17ce28e0c5b54c3549766d41df22276f9562685ca7e0a6a1142354c7e85ecce9a3a60dd76e7f8eca9376cd8e6702eead387d8fe39a171e0ca7bd696f491cf9d9ff85cf9ca89bcaf635776e8937746cedb9495f5f7d65baaf3370cffd503d446a4b8f74b235f1bfef683d46ea477f14b23b0ecd99e752647a31499ab831e42e75e194a65ae8ef5f109c9449139e5bd35fa7e1abe4fdcc32527d2191f93943c32b130b93c11922d89ca0888edf064e98d5372b91b22562caa6de70d5232b560a1962cab747bc91bfc869ead58cef66c2992193589fb56562ce29b1dcff768c612c5d9aae04c69449ce3f72426d8dd48a3a130a1dcee4d28b07bec9a09bd223676a853f02040ae6410f6c2414ea0f65a1ac49ded653c5d28d904a1b73048b06a256d8576a276b656a7586d390eeddd3b9e1ad86102d4270f32db885ab515c7ecd74b1ecd7ade4670cc9e48e75cf489766b9c4bcba5d840d0b9dc26e62eef045d2529b247fcd3b1ea406b62e7fc8932fc4e509def148b9723fee2befabd3c521e400e9257a72e910f52c7a664c092ced99487c86c328b3cf4328ecf3f90df97df47fae8191a8799f644cfcf7854ea25ead449d16dba7c634bbc23c4b7e8f6a7677af6ba1dab7a6b213ebd97de023a71682fbbfeb61c7bca4dbd69c7d2ae98c2f68d1e8a71e4f4d9a2a882c46a696679c93d25b34b1a4bfeabe4bd92f325225377c4725db95ec3d41ab14657a3d7c4a82f9a1e1417c538369e6d4982cc987e408ce3b6529d85bf85a92b33de9984ea4ad3bf6ebbf977ab9801d63f57b5de38e29327519db9bc4bb5cfe29e7ae6b59d5b4a2216b4d5b3aa67456cb26aee9b395b3eb52c62b345e58779de61e3b2deac37978595386632ecc9f19ad3d3ad4326f763da34b3106235e30e06f51b21887d7e372875fc3542197fb1515bad32cf6335084a8d64be1f586ed7b39e4616de64a343b62397a57f1793e27793f1f51e62a13a87a4b158c04027a748b85e1ec56c7f93a14ac246d6b2ccf446aa2691385513e078ed81142e59310176253886a5444d801dcaf6eaf8a877d61813606ba709b0f5c259c50e38b522b529b58b1d70a7e967777be09d6fecc4a718a3e0affebeff157c10b29965308143c239be5c3b0565b154320a1aba32270adc3cad686d53fdd416f5edba3a27b209767a6e726475cee10f8a7ef2fa535facdcb367255da2fbe28bee29f3b04720af89bc661e89a65c76f69b52e68b134a8b79f23a4bf80b1c673ff8c517f272acdfe7840f79bba865f6855ec9c61f72fd4b7fc8f2cf4418657c503bca9e683da1581732c7f7b10d59a9b373db0bf7cc1869c0e8d103a4310b1b6b6b1be95773a17ccc680c1c23d53635d130c4e7754d2a7fabb614cb75b2940176d16cc061b9683108f6c36e5138ec327c96622166105da3e21f1047e9e6a7b01570d5d5a5bab0135dc3a0d5b2d30b6d0f5b1f89d2b7897ec53e4edd9050acd835b5f78df7990219dc226eca5d0129b3cb2fcdb852a763c88f96ad4bf1451eb0256cff9550171ec84a418432c9a296c35e1d2b0a1d2d0aa5a3bfd6c2103bf629a53122521cb56c77c7a7fc666e015d45789ddb069f0a040ade568feda09b3bf8ebdadfe116342890a20269f9054252c0d85d20e2759718205de3e53f25adcc8f60a264802dfc122d2f809b68e926afe3ea6926fe1207cac712ea579aff740729970f314f52bc4c7e1f89c96f8125ca79185abaa21489c95c521381c6d49c7c463e44ca599e613b6965276928311f89c43c113d48235389093127697014577e16cbd10041c9a1852d7a7e89511fa7758bbc2022d6f4648fe3278e5be513bf8d9ed2c590d7c4904036c510b24321e78ab4f5fc162dd0b445b79630ec8c8c2e6bdbb998b41992b1a82a696b4e328cb747f10edbf9598cdeceb41f31b254459643d7b4d9bebacc98b43996aa3ca593196ad2c8cbbee1ebf95f338f4541c9a9135ae2382c885f1af9b11a325a3f56043a997a961d7682e27742c1ba73c706796917a991d7ec92d7d0036ee4f11bbffaa93061636cba0ed478bc766d0b58752d710270e638e312ee974e0b8cb5993007cd5883c83bad6ce3747b99b24d13151fec21b183a47f859991cd21f45bacae91fc5acd937e7729ffde97c793ad9b38cf46b215f1e8f810e89ed2dff18f093ea4cddeacff356fd48ea7e4a82bee24b2b844ab6cf18e1f3ff4caf6458bb673971f7ae59587166ddf4ee74fcee240d8c94e531195936074023c12a7e504b7068545efc66101dd237f821965d39ddf94ebfec8977ffac4096edbc99397779c3c29b30f2647b58ab8615d4ee62a87a1b0531a14733a97046b8df96bd35687d6260ed6aeed6d5cdd2f605f9591b86658e69081c15e39034dfdf5268b9937b97a9992fb9b87985ca539a664b3cf30cc4a778d1c513c6e5c540f2e8b2a1e65a78ba8b6a4ac73743f5e801a48ea55f33e750faaa97323ea30b6a772180c8beccbbcda115e31cf3e7a8457ec390b5759dbd75d187defbdb1477b7d39573dcc4bc864477b450efadaadbe6f548f02ebe9acaf0f22c77b7df9b9e689c8b95f1d8d91f7f591186caf07ace66ad92e819ba5cc9ef7fa696fe4848fe145ead5b346531de3d0be677ff6ea663daef68aed79c07c1cace69e66f90d910257dd7ba0e169861ab6e120c60dfdd5bcd077db4f10bb8b00f3945784ffcaf622f1902339c042fd945ad8393fab608d80ed92b2c7ecf4e91e4ef9c96b6a1fdfa439ffe5e754532fe736731734efb3d3504e48f1f41094531aa2ff37bfc64c8f4199a01e83123df5c47aa15d3df6845019ea6623a84a591c932d33932d339855d9020a12113c33ebdecc1448d926708781a49202d4468790c1fc587e3abf927f85dfcf1b0830a7e4caf4b5ce62b0182d2607788887f3683c5a8fe8d1790c1ea3c7940e2570330c35dd0e7799aae05178017e01696cd4aa1eb0e2f297f84ac829f91829897f71d9b2067992668a3c814be9383d6bdfbe05c03c6c29271ef52229523fafbd35dd9a23b6eaddcf25ed8c5f9faab8f92e5893ba2a4b5f9493eecbf207701cc39bf4365dae37e0106d3a9b29c50d816c5f41d9892345ed4c81548d119451bdb249bc28ea141c6beba9b273cc8363d42bbe493dba906d881eba2b91f1aa88f1aa082f95570b916ff46cc75e7738a71bef33575b6aac35b61a7b8d63ba73a6a7c65be3ab49aff15767dc97393d383daf516cd445d73c4d9155cf467ba3e3694fa3b7d1d798dee86fcc68cc6c0c34061b438d598dd98d398db9cfe615810ef4569d55efd579f577ba6e4f9be19aea899b10b50a117da24f590bc08798510bf0fed2e2deb43128c1073b1dbb084fdeb56dcab3ef7ab901a51d1f71d49ee5cdebe4c7bdef3e3b65db5d635b267e261f0bb596ae24e497a59b43a4cfd9492d9a4927a78f7b677f5d62bedf9b9f58b7ffdd71d3a9cff374c2d7251478fd0509758490f49b8123417e9d76305bbf71627fe423a838c70976b39ed71e356187e7227acd245e3fc9609a6c99e4986c73317777ca863cd659979d4d28a24766d22d5f0ee62e86f7f374e3173b91c75f22dcba73ebcbf71f2e3d36e7fe63738e6a4e86b1243ade24a7e5dfa17a9fc2dd78b79c424edf4da56757473b5f21aec5f61f50b5b03aec8e62e0391ba93ddcb4efc526b97d5c7d47fb197e03f90b5748f88ecfe5a51de7da3f53e2915a7105d664a0f9ef3a7c585c71b196a5283b31c5152c45174dd08f0d8bad84d4d6af3bd6f45e4393b8e24cfb0bf268d92957919bc8392ec0179de98e498995e748b1dd61b7b9b8d5f5e3e4f6a617f73551441c9c9d2ce0cc7247c77b725afbf43340b8d52cde0a1cff03b5a528e42b182afad5dd70297661a2bc9f26caad3edcd4f05ed3b175f51499df74fc49b6cbfbc94fc859b28dbfab139759a8e12057681f8ffce09a647f47bbfefec3d7443d8dc99403524b4e754c1457fc7bc461fdbcee693325825b2dfb39a44eb7f3f0456a97ab52b490a68eca8d1fb13d2c2ebcf87034f5852c6e318d8cef3a269253f87a13e2c5fdb4e38c660ca66d6278f72eed538c28a48b5a173f615fcd827dc4217f5c35a86fc71971defb6bb6ec9a327a233d0b08739b202e85448c139f106f431e5a8381cc6049b1b7b48f8dfa4215b5dc53fdb2abf6550f95bfeadf9ff0c3abf75585b843defeebe4811d9f7046d27ccf0081ecbf6932798d33767c22dff24c19c54576222e4b192e3667423c43251828b1f113fa0eaa226ef9b3bd7535e2d24b4f6d1a3565d796273f14ef0546c105c46615a39dba549bb06f5fc705fd330ccf33f846a1cdd63b18f023f94509f12e1bf7534c4ffe9838f62da841d2166d1c8de9ad79ffd24a25bd768605a52e100c307a12e27dc52e5110b58cd6d23efc7d6521a46e38e1fbf797bf1a8ad46573877c65cf90bd5c62c70579f8e49bf61361c03df2908e0b5c2279631dddb3f81296c40495ba629b53d432744afb94703fdd5753b757fe8cb891d348dee60f9f444e8fdaa4f8f9d2bcccec396f911c0136a637fa124d693a9bd167750ecb6467c8d051bc95ceed521782924d6fb26db37349cb207183d6633f60b014947d54542433633854f0bab8f58a71ed45cd3145fa82fed0bc1cf1f3258bccd5178eee8301f265179f5f11bf5f1b43a1699315ff5f05f46439c4d7056ef891644b1e0c09ba788b53d0e9f8f838edb0a44e7c65aa904b761dbf0daccbcc896fc6bf6adea087031a42b13d2733eba2a242c9104e6e4a6e485e9c6c65eeeaae441931a6d3d8c2ad0aa63b5e6ba1987fd9d24227e9223836ff9c224d767faafa4e53712c952c0983894e8833ea74566c4c87c553fc14f42876268b619b5e58061b6cfa03268e222633ac14d3afeeced1b85b3968919b3bfda351f74e9aba6e1ed230776d3be69e0579304e4a2c189c90a3cbb626bb7449d97af068751969faf4c0b0fc4e4631a35b2b1bbf4809c91effb60c1b5906796f66bf6a850df162c60177aa8f3a802a2aa256f2565490cfaaa5ac9666699fd228ab22651ec3440db522baa414efe894e08847e8440eb79bb2532d7b1eb989c5ae94f29d298e20656684b911d2b8086f1975011821c587069b74d6f8442776adf498395fb2dee31f168ca18c11c6c42031c5bb0d9bb565c6c00697e83b60494a5348a283cceef4600bd595fdddfcd329721a5b162a1d511a5e892d97ceb269ffbdc61cced2fc918d965e904c02fc56cb454dbe4e28075f9f504dbecc8a5f919e4dbecc1193afab5a7bd9ae6aed05541bea21520f5660246a0626ab66609a3f1e3b760c4847ad704e3ecfac31ea251beafe3c2a7dfc8dc05d46951975e623d6b798ab525569568ff403d52cb2fbb678462d0d67980acc309c61e4d5722e8e3a4eefc30de6467133c8544e6f4135d6836a6b0114102d554b8b79bf5cda727aa3e6a27c0948fbebc8e35b359f422acc937cf1560bef308a04785d82f1b0e0389cacbb9c66251610e347258aa3f469d68849813a9147e7ced5cdf4116cd318b6697875c5368d619b46df2bb6be568327899ba0ce7bb95cfede31135f2525cacc57477b5fb7c798115a34755446ffc2be09e9166f681137f58ef4eb357d7d6643519eb66abe3539cd642cced2defb8015396d444eaf649c5e21d908ea2d407dd502f97e399d4d4773f16027199081c3a581e44eb893344223f939fc9c9891e73cf29c479ef38ce70e3fdff1eb231b3fa23c273ae4fa7f09e7c2bd349770e4f68014477d085c16054e4b5d8a2b8c3dd2c9cfeef371119cba9fdc4722e1dde025071501a340852055a0629027e8519956666f3b9e3fd0baf2c517576a2ec91777efee82d952c59bee6591579c9d2bb62e452a66eae03e2ee2c0e7fb4014eb040f5a2bd879abd60be9bc574b1155e61f3b9e6778b60ae748dceeddf245601f11c66149132408482180fa4c201e7f29cf1ce8c860f5998f0917629e35904846a8cf5a70922930106a60362c8039301da6c234980b5e08c164ec25bc381a2ac4ab189f262184176e4498b9508bdf39500595300b7231740854237c3e3e0d80fbf0f2c28fa269d5b25f55f8bf0ae3ccc7fbbd0819770db9f689e67a07e6341ff39a8171aa119ae2518971be5d8e83f06906c61b05f3106232c256b2d4aa588c4a46911753a9c6fb6c849984e94e47382fc6afc1dc2bd9bbeee9dcce52a9458c6af09a89a134d75a84ad61291561dec550da2556240eaf146cf80f74edb0c70fdd71cd85c3b4bcf097311aaac5df07d9acc851bc1fc78bc06fa10defefc3e778bf0097108ac689c3fccb801b3478d81d60beaf726e35ea9602cb358cb7c813852433abe6542bbe3cd857c0148075039c4da690f6a71ce75073288e20176e0d37ab8f4391e6be7887f020fc2e0fef086f0a9b7aa428108d7d94dddbaef69ea5df86effb46a0e89d8540b812bf8bc20dca93128a57733466273ce282f779ca3b2505e52b5f0af3546788c9afad3b0cde0fd19834a76bf920745b579ac20d78edb8c6d86dd70ad70364e09bd351296af84f73c1f2384acb1779d71cae549ebe2e8602a1e4179ec9eecdeaff865808e58995663372ab15d35ffeb5987596f3a6ef404beb5524f07bfc203d8afc347f7f39f5400bcd85722f2b2abf0d9df2c7ee9594d60826aa1cc4f02ef21cfd3f33bc4895de361a86b57913e67128868a822b4b44fe08a13cb44ce5f33dc962e439fa7f50d7779432b9b2e32316d017db90b6af9364a5feff67f58ab52cb4a56aa58b690aad578d8df218deda4925fb8d6d8dda12b55d41dd5685cff83b000199c6e90b3fe087d1821420bfa81cecb8b256d03aa7b4420cae55c132e6fdd66eff699bd5c64abd958621455ba944c4f031003fe8075b03134a126de5977f5d59ca3b64c44f564a8749a7bc556e959152f9287d8bdf436acbb23c6c933fc0df17e48f59b95fbaf6faf61d69598e3dcdd8ae32d6539a6a4f561991b1c833edbd223d667844b43e57b2fb3ca5deb1d277218ddf5823d47abd3c2697e5b1d2cd64bb416d211651387cdfacf497b192a5b4e33129f644d1d6afc524da2f44e5ae12a9a0b5cb2457cae71985dddab1ae1f99b5144a5ba3b6406abb137645e37914e9973fa2ef305517a58ed1d2f6834a70dbd55bafff2cbdafe725d6cfe6ef9abada06375f91d780588e5e736acd57f6d84a1dedd283b7a9ade521f83ff9209f1a98bc05bea7def8d0557269666ded226c7ddaaeb9156fed2c09fa3be6edd12e3c6b8dd45d1845db396c172aafb52ffc4f744bac2fe73b75b41f2a9788fef26da42c96fb5f2741f45d17d836b9adb305fb2168915baf6c0b3a21598fa4f4b133af257535de86abcb12ca5b7324fde87faae18c60bdb9e75be4d2735bfe7f3216fbff94cb0fdc8eed409dace1fbe83bae6d5cf9ddfa976ba8c9837e68adf2db8cc4bf432e582a9d9c425938c4b472e5dedca54f5cde65f4d01cd3933774d6e9a866b34895b4e61e5a8c001b373733f8024aa7a21bc9cbc37cb839762c1dade1cd9db8a0465416d5af02aa56168b298121608674f0430664421042900539900b795008bda0088aa13794401f2885ebb04ef583eb6130dc0cc3602454c0ed301ac6c058180733a10e16c31278181e814761292c8306580bebe029580f4fc346d8043f81cdf02c6c81467809b6c1cbf00aec82576137bc067be017f03abc0107e130fc0ade865638091ce6958e1741bce809501978f1cc258680380641837886408bb866d1f36cf0d221ceb9a047bcf3208ecd301a10ff5e6064bb3e4c484731d2d91b2f0bd2530256a4a90fd890ae52b0236dd78103f3ec0b4ea4b11fb890ceeb211e691d0c0948efcd9048b778811be91e0949487b052423fdb7430af26034a4221fc6401af2622c78901fe3c08b3c99093ee40b3d7d65315e7ec69f0ce4d02348c7a3786520a79662bd5886571039d680d4ad457e1990639b11b767f17221cfb620ad8d786521ef5e417c76e1958ddc7b1531d98dbc4b46eebd81391ec4cb8b5c3c8c34fe0a2f1772f36da4a215af1ce4ea49e410dd31f40e3d07f42a22ce77f925d0832991c34077b2b0d9c338b670443f06fc6fc4af0953b4203f6dc8477a1642ec87ea95f1887122722e09af64169a824fa9c82dc0371ec4d81795bf6f6e2382dff03e14837be402e45c768fd086e8453f16f572301a7310fb1cf5a254e4221554c6229f3ca4211fa9c86797326b928edf024645841213d2d79d2bb11fa5962973b95b603b38d95ceec2ca399593a0a172ceac6a689834a7723a344caeacaec5fbb4aa39785f30e73e68985a5583cf53e754cd84866995d50833ad6a1286ccacacae8486fb2a6bbcf43eb71a1e9d5539771a3454cfa42135532b6741c39c79d50839774af554bc4fa3e95f65de98b511f74d9f5ad965ee5850e78e09d621fa5fc3760fa520fd21b8843274330c877fb3ffb7c24594b5e1f005de6f850b78bf19631076a7347f009f605d2a3382788a4d7e3f0cd4eb31684eaa8538b12bbb22bfc934f5f9ce6f6eb58919d39d7f0dcdfb380596cdd7479e63d2e8123e2ee6f79cce67ee3a80af9ec4e7b218894cc35216911bfd60123c8e35f67f483ce94d669327c876b66ea4473e94c10d301e26c0dd18c2b325c61aa51c589dfc2b4d876ed981bfd0968fed27fa90cabafee9487931b88fa2707f8bc29dee01eed328dc2751b88f19dcfd5de0ce32b82978ff3b83fb31c29db9024e03ff6070940fe7191cdd23738e3d3dde25ec3316f79198b81cd28c7159933281bed529121649f9f31e52fe570f29ffb38794690b13d2d0962e8dbed570312973c8617c2bd0f642a26ff129f66d0d7dcb8dc27b0d7d8b4f28afff0bf1031148>","bytes":44028,"widths":[318,401,460,838,636,950,780,275,390,390,500,838,318,361,318,337,636,636,636,636,636,636,636,636,636,636,337,337,838,838,838,531,1000,684,686,698,770,632,575,775,752,295,295,656,557,863,748,787,603,787,695,635,611,732,684,989,685,611,685,390,337,390,838,500,500,613,635,550,635,615,352,635,634,278,278,579,278,974,634,612,635,635,411,521,392,634,592,818,592,592,525,636,337,636,838,600,636,531,318,352,518,1000,500,500,500,1342,635,400,1070,531,685,531,531,318,318,518,518,590,500,1000,500,1000,521,400,1023,531,525,611,318,401,636,636,636,636,337,500,500,1000,471,612,838,361,1000,500,500,838,401,401,500,636,636,318,500,401,471,612,969,969,969,531,684,684,684,684,684,684,974,698,632,632,632,632,295,295,295,295,775,748,787,787,787,787,787,838,787,732,732,732,732,611,605,630,613,613,613,613,613,613,982,550,615,615,615,615,278,278,278,278,612,634,612,612,612,612,612,838,612,634,634,634,634,592,635,592],"bbox":[-411,-261,1287,946],"ascent":928,"descent":-236},{"nome":"NVDejaVuSans-Bold","hex":"78dadcbd79785445d6305e75ebeebdefe94e3add9da4134208d91312409a7d87a8ec04882c610d0101150103a3b8801115c18028eb20320c46400464d5e00a8243d0414064005109e8f8226a482abf53b73b2138cef3bddff3fcfefaba5277bfb59cfd9caaba41182164810d8fcc3dbb75efc1f7e2af20b4a4175ccdee5938f0feae0f76fc1f389f8f90e18b9ef70feeb2eab9adf722543908eedf1c787f5ae6d422eb4b08e14a381f32aef481199fbd38331521819def1ff7d06cff3d7b3364848c5b10e20695cc98583a929bfa1342227b7fdbc40766cd401224b4a4039ceb274e9b5bf23637af1021eb3f119ad365d28407c6b7ad7be9df507e0cdccf9d04174c7de59fe19cbd9f30a974f623077a8ca2700e6592cdd3cac63df0f9fbef1084ccf570edabd2071e992121ee37387e049ef74f7fa074421b7de707117a1acac37446d9acd98d67d108a89f95ef9ff1e08419f31fd87015b12621e975c460c38dde537ca872ec1853875f900fba02bf6fea3ecf67fb6f7ff4ccaa5f4cbdba21d22c7856461c0affe03da9947a11d22d86fb937443b4925afeae6a576ad100a8aa3bc09e436614821290709d0b2002e7985fc1ed47025cc912564191b1e13df91295705668964e2644e4398e5f88501a94a536155d58d27d3cf2237f204eb4533b5e2d95e24be136b11f7f1cdeff98410bfbf814f4beb80b2d155e40eb641e7511ebd03c6e167a9f6c41559037f1692819ee9f212a2a25f7a132d87fced5428b5e4063215f85bc01f233908b20bf06b93c72be00f2149285ae405ec4ca68cafc265401dd7c4acc40aae846fb850ba844dc04fb87c3597c01ce77a0fd5c1dcb8d1562165c87e7a45b700fae8bd07ee17c782f26c3bdf7d172610e94550ed7a04cf914ea28a6a024e1d3c65ae1382a627d616d86fd52a8ff04cf6080d068a1040d13f6a16dfc416d5f2494a261641ebcc78e77a06ddc41961bf70bf7858fe521682bbb2e9487df63cf919fe1fdf7a19fa75034dc5b27e4219f341ef51292910f8eddfc165616465c2de6d99ef5bf09f6009fed1a9c5ca80fecddec19689711f25119e168fe7180670a7a4d833fc05ebb06f720efd0ae2d029c2c422378844b854b50960b2d62f8817311aecf83f7e7c0fb47e45e687c244f62b0d7e0fe2759de0e78055c34e1a129031e9c615c2002b933d41d68c2c37fe45dd0c7e32855c3458bace1e22aec8f00dc18dcff24cb63d1300d17a57767c0c1e9082eaec03e5e837f131efe90195c603f40c345cb0cb8d070067b5696320495c847e01da01d86bf265a61f822f31a97028c9f8ae44b90372154bf18f6d3816ea7038c4f4166b05e2e7441a720ef87bc1ceee740ce12bc38099edba05b8cba907ee835c847f0103a0970d24e78a1f10ce0314964747603a5404e926b21c31eea38da505abfa97e47fd53f54f69accaa409c83264872dd6f63c02398a1281bb7924a2c75023be1f3f801fc18fe117b90fb8737ebbdfe38ff5c7f913fde9fe02ffb6405c6323936b681dbe0f17c3730b22cfd9fc51fe18bf5f7b2e3ffc5ce3c5c6c38d658de31afb37f66ecca5a4e1a76fdefd66cf37ef7cb3fb9b9ddf6cfd66c33759170efe8714fb2fbf772451e00987511bbfb98a0bf61e5f15ba7798ffa3e181d4367f38f59b257f152aac32ccf5ef696c2c1cc6470bc3ab84982a1294abf860fcc5ff76f3626a9bbe85c3fc7b70abeedd22c5762fee0617ef1f0687ec0c2ec3f5eeddb47bacd62a21087fbd8babfce326f9979897c4172c314f2848edfc04b71027228a080e220b6c1370001520012720a0781c8f9cb08d8b5c8bd39e63c704fbb5fb3ef42e6c63d178d87ab5bb31c80ddb68140b5b8f76c5ad6da3b4ad4bdb3ab5ad03db91114a756867ec98609b766cd5b6266c440be0be493b63c7041bb01e3d0bd70cda35033a8c78acc73a341caeb13b04b60be19a0eab4027827687c03604d7d8158215ed4d59db4a48af6dd91be28e97db0a9d6d58d4fa25685b5e7b8a683de2b42b58dba250e302d2780fa194d4df6e23d45372bb0da9a3e4f7df7a0abf2f20bff524bfd6915b94fc42c94d4afee75df23325ffa6e4274a7e8c253728b95eab0ad729a955496d88bff6832a5ccb243fa8e4fb3af2dd0b4ee13b4aaed6916febc81538b942c9654a2e51f22f4a2e52f20d251728f9ba8e9c3f17259c1f4fce4591b3eb6285b3e3c9576782c25775e44c90fcf3f3a0f0cf3af2e51776e14b27f9e2b459f8c24e4e9b49cd299d50e327a774e41ff0c43feac8e750fee74172f225bd70329e9cf8cc2e9c48249f1db70a9fd9c9712b3906b78f79c9a776f2c9c7ef0a9f50f2f147a3848fdf251f2fe43f0a357e18143e1a453e0af11f06c907941c1d4faa9f370bd594bc1f43dea3e40825870f150887ebc8a1bf470b870ac8c1031ee1602639b0df221cf090fdef9a84fd16f2ee3ebdf0ae89ecd393bd50d95e4af650f28e83ecb692b729d945c94e4a76b8c85b6e52e5246f42396fd691edb0db5e47fe0ecfff3d9a6c83ddb605e46f946c4d246f50b28592d729d94cc95f55b289928d1b8cc2464a3618c98610bf1e00b5be8eac8357d6c592b5b05b5b475e83cebf16435ea564cd2bef0a6b287965f528e19577c92b0bf9d5cb82c2ea516475885f454925504725252fb7252be1c595b1a146b2025e5de1272fe9c972b8b4bc2f7911762f52f202c0e1052779de4c9605c973945450f22c254b295942c933943cfd5450789a92a782e4494a1653f24426797c25f90b258b2859e826e52a798c920594cca7645e1d79b48ecca5e4e187360b0f53f2d066326776b430a78ecc8e26b3eac8830bc84c4a6694b511cada90e975a4b48e4cab2353299942c9644a268dd30b9332c9444a4a32c984f1aa308192f12a191fe2c78d5585717a3256250f143b84075692626c118a1d648c4a4653328a9222382fa264e4886861242523e06c4434194ec9b03a32949221701e6a1c42c9604a06c592fbede4be7bddc27d75e45eb871af9b140e740b857564e0008b30d04d065848ff58d2afaf5de8e7207dfb5884be76d2a7b751e86321bd8da4571de9d9c32ef474901e76d2bd8e74eb6a14ba99485723e9d2392874a9239da1ccce4112ea6412429474bac7287432917b8ca4630783d0d1493a1848fbf1a480927c3b6947499e8de4e67884dc20c9c9b60b391e927398cf560d42b69d642fe4b332f542969d6485f84c3dc948df2c6450920ee5a76f26697ad2d64652db1408a975a48d2328b4292029e349ebf1249992560e92e4b20849b124d14f82b124211e009092104be22d240e1984b83a1230914088f7db894f25b1b1c41be316bc411263b209316e12b30764c60b7cb48178dc7d05cf02e2864add7d4914252e0b71426dce3ae2806b8e20b18f27360bb1526281730b25e6f1c464340b261b311de68d66625cc81be08ea18ee833890ebaa67312dd425e351035c42b94c894489488822a8894082a11423c5f47c87850481681a320bd0c02b6106420780f1ebfb802a7fcbff14329ffeffebc0897e02c5c82f6a3efc195e98836a03ae2030b8943257095edb7814f580bf7c7c2938bf8c57810ec4bc1e2e5e07e39783d604fe12c3416cd84a320bf09ef47fbd015787b11ae107a0923d8d311ab8b43b784f7f14f423e970f366929df91dfc12fe277c01373f8127e11aa826d3ef739bf869fc79fe0e7a161ac65b81fcbac1d6835ee0376c36a6e35ee86ddb81b771c1d41acfd9df06adc5ef854f8149d46a771213cb90d3dcca9f843fc334ec3c3f00e78eb16ba857d7096c3e5e01bf82ab4b8127d4e86092a5a8d96815d50093d3c0eedbe827e46b3c0d62f41cb84d35c8a701abd8f2ea22fe13a425330b31cbd2455380de927b019a700642e624e382ddaa5005f021e712d7e9cdbccfd86e33107c98a7d00cdd1e4385fcc7fc83f0377013a982359c447bac0b6883d219cc6aba11517c5123c179e63691ef361b9f7b93dd0c783e83cf40b6ae78ab879dc6a741e6fc7fba0c5082dc6dbf962692c1f8d568babf961e806830d7892c7011e851a3c96826f96816ef122fa89f4c3c560871f6158128e608403521fd18a56e23ed2e3ccfa2579681e58c2087d8c9170249ce02959f4a2957c12790ddace710b9ae086e7a2e35c3e198bd6686939de8396a33d689666542746ccd564d40f6dc7edf03bdc7a6e2ff72db19011e409b281ec2527c8553e991fc27f28b416a608fb44bbd847dc2359a46c698cf484f457e92339413ea9942ac754973a52ad50f7ea6cba7eba19ba37f4a23e4ebf45df68e865586cb8662c36fe8fc96f2a32ed343f6b095a9eb67c6ef91fabdedad65a681d6f7dc596609b69db6797ec45f6cd0ebd63a0e311c72ea7d399e5dce0bce26aed7ac4f56114897ad32dbb0bdd273c6f462f8de911b3c14bbc6eef3cef0148dfc5de1fbbce97eedbeb3be72ff3bf19e8123819a78b4b8abb27eedb7867fce0f867e32f27f449989df051c2ada021d83bf868f0682297684d8c4bcc4c7c3e714de296c43d89c7137f48bad46a54abc9ade6b45ad4aaa2d5da5655ad8eb4aa697523b92c795ef253c9cb93d726ef4a3ed55adffa93d65fb4fe57eb9f534c29f1292fb431b5896e93d426ab4db736856d4a525352f352bba60e4c1d995a9a5a9efa7ceac6d4036dcbdb2e6dfb72db8d6d77b6ad6e7b3a4d49db9e7628edd3b4afd37e4cbb9dde277d48faacf49a8cb119d3331ecd589af172c6864c9cd9367354e65fb3da6575ce1a965596f55cd6dfb38e65356667668fcf7e31fb8b1c39a75dcee55c2937257740ee94dc7fe7dd9bf7663bb55d61bb23f949f9bdf267152805d905930bd66bdcee83cd53c0190252902f6422cf8a4b5185cc1309732252cd351d6a33f3f33350dae5fada741cb09000b1042c0160bf49599466e149b45238ddf03e1d8d37341ca36b9864789f6c2593a0448224141b3209f8399e4533788ee745229bebebcfd56620f34d2818946abc96c8a4eb9f5e877280495966a52c45484c160ea268e4437d43196e01bf18e3926c26dd8bb10e85a06516832fd61b13ed8972396d568bd96434e855450e7b541ed1ee37d71c73b17677b89c59d301ea8a6cd33109d8b248c011d072bc4dcb39012d63b848961563f981f30f6007dddd1dc7d0aae2f3c5f4b7e20bc5f47bdcab07bd82ef2bc685f4b71e58160ed272bc88969fa637bea48b7039cb5f62eb69bca8612bbdc1bcd275f494208a76148f5aa30c342bd429461583d15116973d41e74de1a344a54d3c27ac1457b471ad8c5a11bddc6a6fb31c71ba56d89b8604a3d82ac1a280e391126d23284d74f933cd35d5f535ae0ef5ae0e35f5d5166b3efc410fab6be1f2cd5af32f372cf990acaefcf02d6b7e7e3a8e2789894916a7d365494a4cccc9cecdcbcb72c099835d75399d0ebb28118b283aec4e9b253737273b91446fc00b7e289b756d6ee0c78f7fb984378cff6802fcf9e9f19bbf6ee83978c04f438716d2533855689b8cc5f69d789c27b6def5c6ce8f95ab97e4b868da3a4da017c556efbeb3e728d86658e0bbe7b4ef4adfa23fe02e5dba75052aebd278497a1fe4ad0eb900b749280b8d0be544eb3c1eb75b1715151d44afeadbbe1ab7aad5ab1ef155fdaa286b658c674db63b23255a21b24351645386ec5352645330db7caeba16ba7de316eb378384f972e6cd0e97b52be61be9e0e54a66e13acbc3e3701ceb625626eb615226eb767c1c030788f6ac408b73578be7c4ac9e03faf7ead5af7fcf7d5f7cb16fdf975f3604cf93bf7e7dbb62dfe9d3fb58ee356040af5efd077093e63d386bdebc590fcedbf2cf0307ce9e3db0ff4cfd29d170e6c081afbe3a70e0cc96f90fce5ab060d683f31955cf6bbc246e82de27a2749c1b1aaec7069d49915593acc86d52dba6f129e926f01e5be1e42413c228989e24639ed7a52a76c4c7bee04d5d6f0cacf5bee65963ace495a4d628017b81e275e9095e7beb0483d7c5634171b53658f419e6fadaea9a9a5af307373452089383255fa3970f2edffa16006406b06994e2ca0fc3ca781d0e9b770039811d0d8fdb212761342af484884cc4c42b8a4935ea94245dba13813ee4dd8a57f5ea62d283284d4dd305133ba99d7421a9afda57d737ad6ffa083c821b2c8d5047e806b72a6a5b943e2c734ce67834999b28154b93d5c9baf1890b33db283a35c9adf324b5d6e5eb7262d2bde9b139be10d747d73ba977aba1782857a41b9934115e99a6738cc2a330cecdcd0b889c840349a218ef478caa35daceca04324f4c8cd77048c40826f3880fafcac913709ea96c1c0ed26163277ff717fa3b7d77d986d6ade8a99147a78ede52d87f70c6cb9dbb6c7db8ebec4c709defe9b17dfa6e7a792a3d58daa31b769c7df1e2949c29051babbd5efa437adbf6b97143e9a9b4877bceda909c0c58027987ab3479e708a9f83954c183ac233ca08089b95a4dc8e1aa887883e7abe8cf84076d6d60f2166d92361a25cccb4867e1cd46908ed599562670cd9abc4de472b2adacb70ebb95f0f4cb552f2eafc4c90b1796d39f7fc5406bf8c82fd769fbf3e769018b5d6fa23f73bf6925c7840c6893b8d16890548b8888112447666d53b1b65c6b4e369714705a1d764edab4107e38b972f98babe8cf37f007e7cfe3a3d77fa19dce9ea55d7f65a52673f9bc08346b413d42adcc069daa483c0859552f13e1af16bd718d55d6ab44112d04130e99789d6210ada038aa33cf417669128941a23a13fe18b5614190820014212918cc132c5996202fd2ddb84f3fba732bddd10f0fd0365b717ffec8dfb757eca15bf0b03d15dbff5eb11b0fa35b76438bce20249c1578902171213392c8eb0ade2cc83cb272aaa86735d777a80642bfd901f6007e10f4501b08780bf99c531b6edd68b8c5a902df70b3b6e126a7afe5f4ac97a5f43c978f1f0709e50ee9c91b688b487830116d2240ace65804705042bced733ce9d7d3e3f1e3f4045d8ae7b077cbf07eee12770128c0fa0ef737b495c788078887d10f2f05cab8d90dcf7217e879f6f4e72008584d0459de415b3856499858d2c20f7fce942a14bf8045121bbb70b51a6dd9dee180b23884495ab586c89bc7d2c1a48ee78c5f37fcfbbc70faf752265fc6365e12d222d2353e6453b699c836c71a53651472ea5da2d36a8f829a34c2bccc44673a363376b19819a360330af89145db92ed93e7cf9f3265febc29a0e10ed3afe8197a188770124ec421ae16475db942bfa357befb0e47d10a5a8a97e35978365e4e4b59ffae02767868b38a5a851c643bcf6d172a24b45d91a3440f415102d6016c6aabc33dcebc595ba3755bb00403ccb2f8090fa21bf1483c1d0fba5d8b5572b417167bddcea1b7a0e40d08f117a0775168692819797981776167945710f8a010858ccf9b74dbac6b78f42617e5109051763a70b491b8cde7fa5619060ddb8b48e3e176c34183d632c197df5c3b9cdd2500357d114ae45cad9dad5d8420a34b8872b95c517128ce15179583725c39515d501fa187ab479469141a8559bbb1a63c019612a8d12c3fcf142b37807be1f6fb5ca0778f8a3923be78f42ff451acc7c98f7d82a3c18c88c617bb3cd66df2c2fefd70af94d4da538f9e7a0b7af84ce325fe06f4b015ea174a418e6d3665a5fa96619be85fe97b2b669bad2a7e8d5899ecb4b9edc8ec76269a9dc467f7f995d86473fd6500684d6d58da6be8bdcc6c02fa0bc879e038a6e9f9409c660a84b55b7c7c4ee4a0659bc9be975fa5dbe8be5957674e3b3d71d5c6d737aedef0c2734b1e1b7570f483df4c036d195842824947567c7d3518c4c9b97953c6954cfe6de4a821a35b27638fdf7fe8f0e3af03151669e371a7e1c880ba86fc386020061420c4104444276d1730a950b05e053b4de6f576107ac0b2b5991a4a2e3383d31a4108dfa4bd99610672229e118885fb998ec09b4378dbe9d3f4a586297c65c332b2bdfe3efa3dfd099b711f80e26bc005e0c7212fea188ae325ef0acf36c9bcd2b2c2be4dda61e0de441586ca581287b0cba9fa9039160c095097e61b11aef896018d5e8646306e7430d020871ddd0d3d00da1972a0e1a136c341c0e074fa36fdaafcf7798f9e7de0d9f5eb9fbd7fff34e134bd72556fa03fdefc99dec8c8c4693d7a3c33e7a1a7535219979643fbe2851bc0a509282fe4b3a16d4e715b8c7ea56185795bdc9a98caa05ef1b849d0e671bb7c0941c6b197cd37aab5e631a4def882a1b485a582c35a4f82a6666a4d0db371a693bb32017e251326e087c66c29dc76d8dc65f5c82bd84d3fa0bfd1f3f4089e83bb4f7c8fbbf878e4c71da7b5a92987f66764d09b677ea217f03378327e10bfee679409bc7703602aa2ee2197e0e608c7bb09e18202809380d94d3092cce7c2363748bdbbacaf1d12c178544827118f904872480f228cb2051c388003cff0131af6d167b8a4860ce1f499db3cbf0f64dd02808f559362f1280df50cb58ad2276d43e2b65854950a1c1e5b991ee550f424c1636aed71242a9ee824e231250612d2810d40ba3110599b4cc29bb59799ad937f37c482cc60480884f934cc1cfe0430216cf63b08e63e9e367bf6b4a90f3e48e73fbd047b00cd26ec59fa74e52b200cbf06f07df9cacfe38a468c1d3ba2681cb7e6a1e9d3e7cc995e36a73c796bf9810f8e1e2cdf9adcfac0f35f5fbaf4f5f307f0e0e1c5c5c3878f2966b89f027d3302eea3c2b897dcdb54f0db57f0db8016b799d7382b833141c96373a1388f41c37d757dfde57047aa9bd8392f4c877960fec481f9d384efb844dcd476e8e8f1a22df76d3b6ce9b67ac4157a15e7630927e0105d42f74d3e8ccb27940051949404b03d05f09d9989755ffd1bc7d18768257d8e0ef771371e7ffc2f4f3cf197c71f87165f81660fe08b357f2e2664e4b6a09dfc1651c01c8f6ce0ce01bf32511ad1742c5dc193e9cb2cf3c57401dd0c8a0c4a5904fa9595c2fccc60c826837e654a76a74a78cdd5b4a95a519ad6045f13745358db460afc0d342e2b35a27579232b9559021d85b3fc874095be905960668940de16774189889798d1a369ca5a303a14ce8173b070b6be03a9aea302478ed35d74771d3e518b4fb0f69dc149c2597236d24b037a9ddb2dbececb02e691ac193350504dad660438b47446e0583975949cbd76eefa1fdb220a600b09fcdb78972402a0245644735b6c399835462b811c25c7eb68462dcda803d9053a1ef8cc07b4ef4501d42b94e4f5081c2fba4de8d958f30ba615faf5b68ad8a57e5150b0c78d14ce69f2212e16c7697e7a0d93ff1105000861a2e23a283766710534d7ef2e1d95a9d1be0466b20020e68ed297bb4c09e5e7140fb9777fc9dc8f46ddc468c0e850b7d6614ce2df32ee2b1f5b905dd4b6c7c0ae5d7041eb561f1e1afbcaf0fc7bfaa61e097bfd4fd1355299b00e78b63f9a162ad09b48767abffe59a628b7124df698b2d2953d6e47fa1ed33b79097b1cef745d36202bbb9f478cd2b7f6a0d6d6d8644fabded656ad93b33b0e60c6016832a00033edf08155d3d40036ed52f50d33c8e94c4bc4a961db74dc8265b118f1e3982b909315f668931213589f351bdae5e419e3b8443e3e2e21296c5de726002c982f0c2c144f3a4d1e317ccad411c326e3d5b18b876ffbf29f7f1bbe38f6f3f9cf15b41f432f6d9e5d33e2a5bf4e9d301e93e58fd50f9fba809ea9dc4bf72c5cf8e4d38f3d8607eefa064f9fd7b73fdd47bf4ce2a2e73db7ecd1b915157444cf81bf7ff4515d61cfc71bfada3e7e75fc9bbd1f7da263fbb1f4e3b757d0dbe3c74e1c5db8e181898f2f58807b1f002378c1fca7ffb67eec95c7e8bf690d83ab8a909804725782231a0a21af28485e511454afac0a4007ec98f3f2044396bd8427aa5751799e04551e6d97f90a91531559d258431109985e3b7c048faa8ec44618c58465b57c3de2f34961a9dde20a33871646a969ea10b5442d47e5b85c2e5766ab4bd4b5ea214827205d50cd563946f1e983726bc5afefcdf7107acabd946164383f44182a4e2293f91261a258ac9f8de6e147f939c23c79b6f20cffa4f0a4fc8cb28a5f29ac90572bbbe5bdcaa7e8283eca7d2abd271f57cea02ff017dc19e9b4fc9592a6195a2480b544f81e0d9bc7d0055c32fe944ba60b1ab6e055c7b099fe249cae4be182dc7d2cfab21fac9067007232782e7e54180a5ad15ed34171afa742d91b2582db608dd59b94a8685e22ce583da05f72ba4900246e660db30a9bc228616682949f1e52509c392e2dae308e073f346246596c4d07112b0bb8296c4b59478e1e3df2f4bf66cf993de75f5caff94fd373f48b86455c179c875d256479e180fef7d2ea865963c73df0009dcbb913deabf8678d707aff89d255204d4a404f14811c70a3f6218fdeac20273180cdb79d98b72b6b48a5c796aa47628ac70cfe6293394fabcd47c36d4edf95163d269ac3a3829a871c3606c2be31e302c60242d1946f17d0a5b41fde85e72cf876cad493b33eabadfd6cd6c9a9f7e5b5c3ebf1045c82d7b7cba39ff6ee467ffbee2afdad5b6fa04680a998afc1d485da861ce8b052810f3b65cea92221d5dc16391512f63040ee34412e7d47a11bd43fb644d81403785c61df530468711d97d4fefedbf5865ff04a3c08f77f787249c9e4476815a429fc8efa993f5cf8fa3b1cffc0ec09f4b7d7dfa0bf4e98fd0093fbd00efe22b44387d24376feb078903b8c2ae4c32a1614c026227a0d8dd5d54db84bdf6d36141a661880f49bb4144bfb7953c383dcc48655dca6db67c1643b4f7f80bc35eca7b13a3e853a149412b234d72160ad02355c8166ec68c5eb0a7533747715df5c382d6f2abae1a90866eb3409df3714747b9c4dc8f5ec8d69466f4c6cb43b439f85d26ca9624a2cd405e63cd38cd59adb0629826886eb1d637c98619a6fc2347f37a699d92cd43d4f3ff9ab86eefdf82f2bb065ee825fe77ffbfb4fe73b4c4cbec60d2bebd14343f964fc1a4379cf1eb4f1c7eb949acc388e0d9368b0106e69f0be2764e30ecb077954a18a00095044cde0d60c810e373b003c420e162b320926d12499e4424331c07ead41fd03f4f122ae1d8ba0367cc440d4f021970fdc3b178014ae91eba879be6dde414738560b78c97dab4c83fa5699078d04770ea150bbe161b719ef360b21a150205af9fb59994c1240398d15b4442b47873a876c3a0e498785f750855e9045ec14b596ff4799d5b5111f4a236356b82104d4a315ce748446c8ac92cfe9f1011d1e990755ed07efa316c73ff99770cbc5999affbb08ec1cb034083aa280bdc48b32eb852e4c399ab7034a1bb473688853708a667d07d25eea47fa4a23c93061945446263289294e928af5e5e411a95c9aa15fcc3f296e955c495c26d75eeec2f5950771c38561f218b9982b114ae519dc232058cbe5254285fc37d9364a0337c84bf80b433b051f6ac8206e1adbb05d83f8052ed0d0b1fe06d7af61574bae12902ba463d4ce632741440421c3e07cb9c9c46345690c737b00b08af69ec4a4821e7d16ca22b9922c71b99893d98e708aaae05c555582aac411240330748222130e0baa98c1ab190848bf3e2c70c310a96e8e48366921b9c98f30697e4489c2996493e2e31c924ff6290e3585ebc4f5e20672fda47eea506eb8345c9dc4954965ea0aee79f979e50dae4aaa523d3ce6c197776237311b5be32029c03964200e919ef21079b852689c84279209f214a5d8b8585ea2bc2c4781c6b131d831ef3e5e03e00f20a086e0efe94b74cb4dba852e174ed75f24beba14be5bfd5912bcbdbf25a728687ec82be5b291c35c303e82acf3476441c41297c14b196109a2051fc2bdce6fe1f3f25a5f251675cd5645a4738bed704fdc471c82878b85ba89789258acdb87778b4637e791eee1b2a4ded0f99034981b21957093259d8678ac8dd3b0666fe77cb894ded770516b31e211b418d56ba3b8208bc49248bc28336413b75bd176fd1a6b6594926aca23a98e943fc48b423ae476d9ccee347727b700323d2264583c9134c58e604b4aaade7bafeaadf7de7b0b4fc2957412b815abe844bc8a3f43eb6bafd17acc5fabc53c76d1f174055d49c7e335780a9e8ad784358ca6b55564431921a77ebba4db8e2a149b41c2b23995d7c9c042f6b0b869d2315a0869077260d66da67a79e0d140b3bed9cf95632fce00c7e112652336a7673cfae80c20fe1fae3534d4f107e998d2f1e3a73158d0d31a2c4c281a8d0d790cceedc8bc5d5a832a8d3146151b6cee5435cf96caa7c4342938cd320d4b6460e236b21e79dd7ab33709a57987e8ef3794e88b0d0feb1f06c96790f4c375c30dc3edc3a2a6e8261b1ed1cb802121be19607616ccd660e98cc072592c5d464bf02a3c11c0b2e2cb4f702a7d815eaa7aefe02e006a34aec4d318b800b02fd4d3978a6895c803607f6a0cc335a2a791a6a763d053a1cc680f17e3f63a5dce28afcbe50cba9daa0d6d57c4edfa0a97eab44511738c5b44bc01e4b9cbac484e1df1868514f4d2951f614c06656d4ca9856b1f1e1f888a615ce98b8e8a767b3cd1d19e985c47aeb3bba3bb73886388b33076826382b338d6d46c30b9b9260b093c6f972d4040597117e64e9e3c77032de7fae1246c5bf6fcc005a1cf69c9eebc99a349a711134b86d145f4560368e30fbe78e960aab57c111d8667cdb80ff86d3968d354c05a127a3dd41a05797b9445d5c5fa78077e9f77bc1fb5ddc26f0faeb154b68a5575be680945bb8d76c91dd7ca7caeb6baa6960da2e547e265603f5d315f6936fbd243836624e37c6f7e6cbe2fdfdf27b68faf8f7f983aca5b143bda37da3f223025a6cc5b165be69be42ff34f0fccd6cdd6cf36ccf7cdf7cf0facd4bdac7f2576b56f8d7f7560b36eb37eb361ab776bec56df56ffd6402b3680d13c46e17245e272094916cd3161de4a52383491c9f39fcefb61d2922786cfd9f4fb3fe8597aea39faaf65cbb06efe634f8e7c7ac53727b01f1be7615ed84cabf3daf52becd0352a90796cffafffcecdc1ddfbf51f34a047bfd840fa3f765cf8290850022f4298a279115921a31816ededc08e69278073dbb74a050568d414a0a029552d367b930dd0ee08297794b62a14530b2da76666cfdc1ec0ef60f20ee0ff3e946c81925d169d0cceae70d858a9a00aabec54f399c6b336cb90cc9b4ccca7ef0ed966d8d6dac2d652d87db30422bc00ba65ee334be682767d0ffca877e97b20b216ed5dbb762f29af5f44dfa79fe05cdc31dc23cd2f12d1e3a124c262c19c177302db214e4422f6c20341267405e68b634173c2772d43e03047dc1f10ba7fae6770a80de2cc9c9fabe278103bc485a34814ef127cb25fee897ae25ea417df5de8230ec5c3c832d9d2a4287040c58fe367f152fc78c3973407d4e30e7e806685a08e08c9cb9986c4a5a13ea21734a4004d060da9e6ea5468bb920b2dd7e5728453731595108ef3124e0f8f432ff441158c0891294e59af036f2e3c6f58272103c39d3288e16f64df2a1ddbe8ef9831c79a146ae69febd33febf731a23aa0e776c12c98d5a0ea875400cab540e82464a9e990425a1acd8d161e50f7706fa955903c02a7824a57144127ea9d5c1471f16ec121db158fcea34fe25a9124be95008ea13ecd980b1641269f29a48be952ba9ca96443ff3b197b931e7c2fa1bbd247c7bcbc11dc0832981f2cdc27de27dd278f5006eb46e9cb50192ee3a69349fc2469823c4999aa4ed74dd697e91f260fcb8f280fe91ed13f2d2d969fd1bfc3ed23bbf93dc25bf2417ddf66bc684e230e74c433411d233c0b3287a7d375b41b78d9376937c0d4fb7c4796413396dd7e81612c09c887d3ecc69f42dd792f23222f608139de3aa453bcb282d84e5540b9cb5e49128106d90c74a04214044f1bf1aa7484c7da91a4c392a06f623413c393e50eb7559fab6eb67d22986ae17edf85b03b881a2613131115a4f888594923898a5fe940b29431a4505946162a874895625138116c4e458de6ecbc5d8e565310f8c67c8218945300ab397c8e5ca0161a26a0296299612ff736ffb6bc4ff5300ce040f31fa9e7445a4637d2cdb4148e8cf845b0447ae097b8ba061153ca7175dc59eac317c1d2666b5e2e683a6745a8d5dd1c493819c98c96658d23454ee20b04272a9094260a3630a09834a048111164fddff16810482b9d0b71855c31f0ab0a8e28c87e0f09e2d6240717907475a05aa632c2221143d862c77f05436e10dedcf0a16605d772f6fa750d4b396d2c8f8d5dccd4ec37b00108e35419f0ce05659099e4b000f62b2858510551e2134d228812c05eb3a77bf79c83904f203ad9413c729024cbb9245feea4eb417ac9037543c8185d99ce140e825b023938308bbf5a7f81b4abbb4602f5603e7e5f9f47cf7f4f3e4691f162af6807b8f84266be5adcc455a38de087120b32b3e934c732b5d1c94868928d765671a5f42a76372c17ed17ebd65dfcc33822c26c1c91e03be38802cec29cb1e1e7f39ce9a0b8fc776d146fa936966c0fcfe1811a3741cd1b6564817a41651cd3820e5aa5980dac42e67e6b588eddf42ad4fdf345a198d57a826c11ae68323a2aa4121ea30a896001c4f0b170c5805b0ca635fc91d39cf9dfb4844efc9903e5d2700aec9d535caab61e8b7a7944595cd6b88b819e4b637e70cdb174ec08e43033969e3dc8d65c8ce66f70cbc512786ec03bf8037494c7e02f6a03b78017142632a6e20e20bef1303ccf430ab5b3e4b51b8ed9cd3fb9becbc37908374a6be15ceca9a6cbc412fa345b24c7a1618d97f8a3fc3cd04241f46aa8b52222b74f87fee13a21ae359eb4f88ff93e8d591bff89a5528fe25d24caa018741d7dc4606f9fc802faa058332d61d3353ca0f3ed8d5b37f2235647bfb4a48efe8e814e49fdfdfd03a3fca302d3c1bc78ccff586046d2b3fe6703affa5f0dfcddfff7c001ff8180233336ddd73536e4bb3fb6d0372eb6d8b73876a16f79ecf3be0db1eb7c3b62ab7c66666d348f7ae404014d9100694220ebaea13f6ec38c9923ef9db084c57a7bed5ab4fd0c36e1b8534f3e37eb83c1b3be9b8dd3b001ffd6af4fb7fe2f94263fd5b06873c9a84f371cdd13337860dbb6d812e3fd91cde8043b6034d08b0e2cce76a16871bdfea409ad77549a3e89de1875d24dba5843517ac5e0316ba62518029a43a98db7dd48df3530b6389685ab5a8c5f106d340bac02687012a36b8266cd9d3b6bd6bc79f3faec9a7302abf4d68939bbfad0d5b8e4ea9675ebb6bcb176ed1bdce9b1a3e83bb401d23ba3c66e80e6004619ae7200576e9417f2a063b886371e33d4a8eb2dfc7a17a0c8237531207bfbbb2369376f987f81668d892e6751b43b169b164f691153e3737a2f1fb8f2f5d7570e7a3934e8ef43e9e7742b788869c3fec677a4e732d3df7cf5d5373333e8599f0fe76107a43c36dd0e15b13120689c390c2bd77a74d268592f9c942b8d9fe08dc4ce230317f274d1b567b062d4c2c4cbe59b976bcd97efc04af3ef347cb2b664653a494be06d669308faec987382dec2ea89d93b3730d83d38772ed9cf0dfbbd76c3b822dc1b1348bd47d57fcca0c77298ae0595677347a351d7500039fe899563728db0568fbf8c5a6bfd445f1913ede064870175e30ca6f6315afbaa5b0cb531c8dd60f1476f272f6ba423e0fc03d0fc4808539ea0d6bf6b58f3eccceb0bcac1a63c49dfc47d711c967147fafcc3c593fe62e6b24a1e7bac6b375a9b9e8173b00b5b71017d6f79c98239d323fa9954000c6de8de508c59c07a79bd88d7a28d4671a7cad924242982c1d0dda4b38787ff9bec5b1d532e1d6aeb3b54578743bb9733d96053a636592e242c9416cac0f20e064547d8ea8db764b1010552f141bf0e38937e4657efd871ec0bd17e2dafdb804654bf8e146310396f6a78a53d04233f17b0da0af50d25c69808721c73d6b8d75abdc00eca27869df1ebad5fa19324518f0cc690c3df456c9fdc2411585b2e87b14c7fb9c11c134075ebe2d69128ae36d0a70d6b04c2637d4d83d1a4c5b026d90c283f4e6f62fdf1393bfa0009fc8dee9f5c3d6ef4ae91559b6acbe63f326bc6fcf907c716e1ae75b771e7a2719beb2df4677ac91fc0aedc9cd59b88b869e5eab59b56acdc04f0dd067ad00af075a19c50948147583d6b3de9f8c4bcd1883903ea6931184c66161c087372875a68379369e9bb8add0bdd61f2ccb1b0c1178d2235483286760a565a69303b7ab59db190b1eebdbba7bff731b7b56148195eb57cba273ee9efab1ace88f6862d6347ddd0e689238eb5828dca2583e7721eede4377202860699ef1a7b0c29854ab1324359a8f077fc956db884d54157f3c5b7d789767a0e718dfb690fad441df8f91d436e16115c2b18a15ce12bfd46b3208b066cd023b3592b3cac213529c566cbb15a2cc59619968596702d7631328d2252db3f8fbf754f49bf488dbb2e5ebf56f49488a0da083ce742bd2a7a3664d7a2823bd1c6a6b0a00199ef0e0b5e6661c16237718325ed16db4bbd496f690419250e93c66881c172f210ff90384f7a9a2ce69f12964a6bc90a61a5f88ab497789c9c532890bb713d853ef2106e943c11eca209c2c3dc0cee2161befc14f7b4b0547e917b59784576dc1d2084f6e335785dc3796e001d40fbd2d5a2bdfe2dfc0a08d30df8144d0df721828dd877d0468e35bb79e6128046281666080b85080234e08bf6df6b59efb72224ed02b912449343c9d10eabc24bc82f4a51a6b3fe93f1e493d89d31c0b276ab5e3688bdec066b2f5fb4c16b4e0cc766816bbd8c6beb3b307b2332e9b54387cb6cae67a636e5958d70864cbea4f4a4c2a419490b939e4f7a33491a85357a736884d7a4ec0296ec667a7468f7f97dddde9d71e4135a89718f0125651cad0cdd3771069c4eeaf2b789b37790cd934a6f5c6a18c2f532c4781e9eba656dc3575caf7d53df78b5e10c5fbc694cf18c26dc5aa1777fe4959d7fce2b97ffcfbce2f83ff0ca2b2f34f10ab482b14a447627412b582c2f356413d75bd17afd272c96d7c5d48f7471b4ff432c6f779ead93bb27f3c25bce8c6819c6e38e3cbc60c1c373e6cf9f0304d21d9cf10bf46bba17f724f3feb67efddf58c6887e446b217d84db613ba476ac25dbe8106134b484e9b7f621ef1dfdf689b1127f4d767a41b785342dd7c21a305fbefc4715176c0645c40eb0b5682867653069610a6c62937041cd6d68d825aa9b5a1802248fd906110d57046d63325a176e5bc44e890274b977467f6daaf46a564a08ec9516dab7a96d2d4c959630b3b5d0c24c3e07b87da06a1f84b6cc6d56c161795c491e6ed2b60d29cd4ab82788e2df6f452889d402e42c60ab382d46702e1139ac7bc9f889b25352450392cd56c61436c614b2369d4d93806cb657756438fc8f44e422b569a3d296ac60d0eabe7381b5752b92e674bcf5d7867abe78cff4094460f54e011b692cd49b84ce8542063d67d4e5c6fa62055192158157737dbed86038aaa6d94ff6638e9aa8b5167e6df0933b91b5fba3ef33daa5c2b8feadb4c9c7b597ef8eadfdc22c2aeb9fcd3566338c752c82385a511455d1e9f43a836212e23d7a8fc1638c32b591db2a6dd5b6bab6fab686647fbedc5e69afb6d715e80b0c7d953e6a1f5d1f7d2f2dceba4fdea7ec53f7e9f6e9f7198246d1281965a362540dba3c43a7e431c90af36c5b84def8ff9812170ebd6942c135eb8b3125e3fa3ed009db0ed2df685dd9f505532fce9e3ca57769a71f0fdfac1ff715d8773fa5a767e5a4b4d529f1ebfeb673577c3c36676717e4a7a719e4d80d7fddb12d96c1351af0b949780dac94d290c728c826b2de8277caeb912aeb144e0116305b8d83ec2d06a1b4d040df2aab66ad18356ba5fa8eb5525dcbd64d68a352a1a84ea8938d2dc42226b3c952c81592424731574cc21d650a10e833cb025dcc61468c85cbc233e9b27b8af6d0e3356fedd821bc46df6b44343820af11bd5583cf6284ef8116af032922f2c5dab873341830587fd67ed25569c63bad22876c2683a527c834b327cc1b61617c39f38e448b5ec82c661b509f9dc5b35dcea6f05ec4f758872771468bb327c834a620ee7dbbf4bd4ff12e6edb8c91f47adba71e8e8e4fdcb68a4bbebd6e8326d53002835970437b4474ea8f713e72579cefc25d71beb5ffbb38df7cb692cdacc511580c610857c22de49ee7d67155917418d24948df68e927486e0181e6232af0820dc7100f9f8812700a49e6735136ce27f97cbadc03f5c0a0b1f962f911f129fc34794a785a5c8956e2556415bf42582d6e21bbf15e9270276ee803d5ebc24e3c91f6a40ff3c5f57544bcbd8ef5be17e84d2ff45e8ffff287b86176386e98cde286d92c6e98fd5fe38617fe346ec84251ff7f840cbf75a87e3587cb11d2d59e5a70708c3a4d2d5735f009905400a1f0b97a5205000a3faa2e2767070fc72a984533146355ecaa53978813b81421596c2da72809baa03ecd9883727036d75e28100ba43cb99dbe93b127170e13f6947be9879321fc1079a43248375c3fc658c215f3638562b1582a96c7abc5ba39dc0c7e9630439c21cd9067ab33748002f109f919e549dd52fd32e34bf22bfae78d9bb937c866fe0de1aff21bca66dd563d2044dc2defd57f80abc927fcc7e269ee0cf992ff4ab8227faf7cabfb413f5243964dfbc3014202bd70d1fe03380572113d43e71ed84fe702e2ea09dfc073f5b7d711ae9e46a85705fce9f0dc508fff16396c195dbc13456c0a23f2f8822a69475890b0eeee30a2956dec773c9bea9aff8825fe2f50f8158810c54c7c8a9fa42959a483d295f453ee2345ca58324d99451e55169185a44259a6bc8c9e27cf9397c535ca5a651d7953a9222c1d52583a4c0e9313ca09e52439492e2817946fc837e447e547e557f413f9556c5432813079bd4c541b17c3c7c836d56700a4f32972820a88e6dbcbd96abaa11bd797ef2b7753cb0c4fa285dc32fe197199bc507d19ade056f3abc4d5f24af575b18a3bc41f92195d9de04fc887d52fd149ee02ff4ff1827c52bd8abee17ee4bf137f94bf517f47b7c4827038d3a6f119600d7f48a7e17957bec3f360bf852eaeff9d2ee63a72f17417eed770a1e1081e4b5f637ce7064fce0a7833e1dc505793179980cbf406626473cdff28844cf014b09b29685439b380d4b5f25704ed349b8c3a45661209a4bcb909692df0159e6ae0ca6f1a17d116e8fc378c81b29435546dba23b058c87302379b7b1244d64b9ad0dad54268d5448456148f152208406192203bb14370880e294148101324c663ed48ae982be51bf34ddd5177dc87f4e1bb0bddc589dc04f149ee49e149f169c3d3c697b995e05cac32ac326ee1b692adfc1bc6374c6fe3fd640f5fa554a987747b0d7b8d1f719f1a3e357e6cfa82bbc2e5370b3631e21fe5e5b941c2a5828a29a1c93d0fbc7262c6c8fb5dc0170d32f7dbeddc77575c2be8eb0bc75ef91e0075053d13f26861572d001b047db993ac67b1571edf157b3d96f95f63afdd867343a4c95c8934977b487a425a2ec940e4b21903ec08782d8259974892e5341d0bcaf691c7e89e935f93df2207642062190858be446a65b7d691a610ed1cf279c30e6e40bd931bd0f0295f5cd7b0ba11d57125083895eee077805f9480468732dc26874e0c2a1eb3c3ab13fc0182946add45548dbf7154db3606bd6ebda20a094e1b67477eb745350941734d8763a0e13399b5c46c266b78990e9b57c44623f3c3733ab58080e060d1bb3bb3f799b592150e5684e731339394df71e6ab8fa63dd7b1e373d33efaea4cf78ac123a6970d1f5c517ab1eac8e195732ecc5e79fcc89b17873eb7f9d5e7dcd1cfadd9bc6c28f480a75e7c55f4b23529bbb51828c79b6b6a238156b67ee9ea25d1fb1bfbf456cbde1687327dc168a7de2447eb1c6e132ff8098aae76436fe3bf31555b360663dc1ed961c2f1561e797c0e309075bcd6ddccfa0ec7c2e6a1d6bdbbfa1b9ed8a9f5395d887492adef6aea75b893cdbd06bb0bf57876f088b2b211839fedd1b2e7a543976d5ef35cb4fbb957373f37f4e29b478eaf9c7d61cecac347aad85c5dbc43384bee03c7323e043411ad4736fef568fdebb658648a0d2fdda9a93d576b3eac811d3b98e99294c8127323739861ed72b2040d14ce4ed9593c759951964caf8c1eb66decd41d706692d8d99037c87d370bbb178884881dfbdfdf7cd8575b794b97724f456644c7852c9cb6f256daa9124ee6b5b5b7e7226b6fcd37b5c5b716503e1666d8615f16e6b2988b0a2574c41be8e886f7f999783c65f327b6d30ff967844ab097e2d1d050db28bb45341b904e3a26d7e82cc7cc3586f5769f6e7d20f6137ba533c1ae93fc0ebd6496625d8874894e30d7d4d77400520c07a8c3b31b3ab079e75a3cb479c619d6d6d6b9346b3a1ebc6b2dbac7d6f126204b360a5ab26c4e27777040fffe03f0a77d9675360d7f39fffe170bd40db40e5c21f08937e09ecbc98836cba795bed49ae4d373e9990d9371661a3d1beba797b1bf156e8bb99b1830eba3178997c9e3052019ae0a3f813d1d0a059cc0cb6ccabc15442dbfcdbdc6acdf66978dc8a0e8248fc9e6b0c4b0c9d6cc68d6e6e7b1de307f3753eb01343ee203380291005f9605c82ac79ccbc2b9677bbcd4ffa199780e00d6737be5a5f7dea3d856f4b6b08ffe2b2971c1e35b7fa4fb9833877bfcb8159b7e8b66be6e1fd4913fc11fd5562a5484a2ec563d5886a65814c3f10125da41bc016cd32590ce2a7603ef44a100f6a0d6c801673a1c154a34a5c7d86dde68071f65e5d2d558bd55a710cc8b28c9bac03e3feab154b4409d2fa69bcfd5d666d6d7327bdbd52c0f5ce1092835915b1aad6af223bce42e1d4b49e17591794979aeb02b98e792c26b7e5d5292668de7b58819e31d27569d8889898dfd7cd589f4691d73a7e59fa83ce18df1c69e587da2ed944e05d3368f5c585e3472e163580f5732a676ea34adedf1d52762bdd131709e373db7d3e4b413ab3e83f3dde54545e5e545a31e639a94c5bd84d3280aed0a75317b2d560b53a756b6339bf406bdd16b30e88326838e47bfba44bbf2ab55673654708a5e3011871559a683ebe4c41ec374552895885b9be85ecb6273b59aa8b44482b8351dea3bb05b16eb7f9b3b065a1a8d0ab5118caad96e8c36271853ccb9c602730f636fb36a060fca0f29dd14322d84f4bca90a129b47a54dff0ae40472926013194a76042447401840f3e9e3b4007f9041a7e204fa165e06f7fcf8795a8583744a06fe10afa3c578dd7b5d861ce6a269163ede70e5f0902ec0f73cdd80af028786571ae83102974506912b72b2d63bc67635d5e60f34c16b0b0bdf4b9784ca0695bb558fd896d19db1b123f90d38220b75425343ed3c2117cae00bb27596600a1f8df9e8d8ef5cfc77196b5c215dc7408a2798975d10902c1d9154d4365064ef381219dbe68df4b40ab145d4505b6d0d8b7046e827bf693d753573dc8f9a8f8258ce6fe67d47c48566d2cfd9b47c86d152524ec491666232b1e5aadc88bc08af2f9f33eeb5fcbefdf67b0cff583b734effbe3f9f1efc76c9acddf99d07ec4ab07dbaae6c66dfce573e1eb48baeeed675deeece3d9608bb2f252565a4751da81386ff7dc19cb5e9c9337bbff0bad77b3d3925b3558f3e4679e8cebf4c5a9d9555d6f7f90dde86c531fd32bb8eede21a98dd750a83d251a13d692f6668b02e62335ffecda39f6430edb0952deba8af69fe14016ae11169a6b54d1b2c945148fb68250bb644060bf56cb050d6060b65765fbb6e038514847cf4da35bcf4da3531e3d6ad5bda17ce907845380e5c90817aa35ea156468b8a5cbc41fdd182f91f5dd73cdf665e4ffcd672ed1ea9c4de6698018d6b37c13fcc3ea95b1fc6d6f540e46c555a5aed0d7aa31e1041abff88046d6cc5d162d543125be920363bde7991151089499977e65cb75cfa20a4e497e5cf2c7fecc1d0acb69d1fbfe714a5a7ba2fbc31f7e450f61bf2f9dc799f6947c34eccadc45269e9b469a5a5f4f7ca4afa7bf8184b7cc997c1f8850fce7a2c21feb4d3f5c37bef7fef78075e38f1e8dc1343870c190c47731f3d3174d890d5d3e1cdbad595f47669e97438c642e56a2cc231e0e6353c877c0fb44c901125a3b521734292dfa0f2def868ab593545f3dc1e2cef407c746723969019836ed466250bc881e231417e3873603ee44a5ad31ac5476193818ff6c610c932cb142fcd8a6a0db0acd6e697e637533668d4cbe6eb372edffaac89ecefcca70e793bf19d84f6627ba9bddcc9d0c9d8ded53eaabdbb93a75374a798f65e23b30803778daac6e73423a0695455b3109c5524b5fe143eb578529782e10f62fd2f79cf8e7e61d33ffef5ccf0c143370f2c7aa3ef37ffe43a7ec45567df9355f0e050e7201a2aefd7ebc9d9154fd8dbb58f8fdf1513f32650f06be8197e0a9f04fadc8072762a9c8e7f17dbd8a757b1356432727a4141aa34574fd05cc10804dda1468b89873b199e560a36bfc0961b8577dc527a1604948d1ca3e7406cd9f8a49fcf9fff19cfdc8767450eb47555d807f65185361358e55fe79048ac607a9b6bc24661b5361338dec216415dbbfd3da96878112ffabf5d09cd3773870bf95136ea87c686daa5b64e49f2dc488fba11b886becdb9aeff3633e55ae7a4d66d48427a6a54341feb4e49b0066233dc13b3624b12c65987b59f200ecb1ad7b37f985fb4a13c4bb37a8c447f18f7b03593d6f022c03fe50f12ef68f975083633d1159fa4d9372080ff0bf3f0e84f1865477cfc8081fd53aab64f2e4eeee92dbb3235b1c0ab3f8d33fe0bff08597fc62df4cc899cececcc250fcf1d32c3e22c2c387f7a4067ba8674c379ff958d00fa47856120edd8f84cf7b7397407f660c4a33b93fc0eb0190ee1990e77849af1cf6640304a3fca3dd4b044b4b3e9f86807194ffa0914e9c06e666bdcbe8dba8abed5c72ac3acc3c9b0e8586d7d5cd332b93f7c7123a22b9a188543bdc68febdd6bfc849e5d1e4d4fcbc8484d9fdfade2d011a1687caf5e63c7f5ec357e43565afa23ddbace4d4dcf3a545171445ba1d7bceadf84da86a2845f24f23afa45c1fad78d066e1a8fac7a799a2a9a351dda343258c3867a6beffa0600d3df2dbe03d0704b5bc7c7d3d76ae96b786c2d1e7bfb871bec7b00dc1a62d4d69a8f0a595178a5395b686eb2ea842823da83fd3b38a36e1f8e038d1e1b3259d7b8c38bce9f76606dcd39fbfc46d31ce19bb5f5d54d9fdb8858271fb3f8b7f03178aad09c9c3babc7c38283810aafc10f368cc1f91db37bb7bfe7b9414337f67d6d57cf09a4db965558cd296c95794f6adabee8e84565bde60e61b81fc15510abb6727c6848e78f8f510c2272d854c31e1cb743f4c5ec8786da703c12a1b1b6f8354d6bc89f4e343f4dec3e25191a5c5dd37201f9cd5ad668503a9f356bfeff50f4772f226f6e3a575854f2c1c7f7bed4adcbc20e63264d7db0cfa0b123061466cfebd1f9e5a1afbf35822fb64ebf77d12297737b4230d43ed4f199b4acd4544ff4668b75c6e4eec5ccc32ce56f900dda5c9ebc77b8ffabb93cbb1cd8c1b1d199008ee79ec2d17459359bb403cf6ca783840de06df9519750c06ad22b44c036b78f8867639c952ade89be0eb8158355e763d16d6d151858465a70867d55a6569326e9bb16c6f9e2c2e1ed3bf3565b2ae1b0559d64d98e278f2f99381e4f0a245903b69c51a9c367c6a73d35bccfa4583a48d437cc993d73e66c6e6983ad673b555fe772f6bd7fe0c0b4746a85762e6a6ccf8f077bd9801243565e4615226744824ec2a389349a897866aa5587cdb3cc9bd5c7d84799c21f51d2e60d73459c7cf0c0c1635f635e38fd7b8928fdfe3b19e03ebbe3e077eccb139cc8e59367c2d219f177be3cc12444f3a727c833dada5a2cd232ee5384900de584f42aa3279b82cc44b183163816fe8042cd31161f60a2057061d770618714c645a0995e929a4758b8110579f3cad34bb271e6fd8182ce29a9f74c491b33d260a8349bdab6f2dcd78151f23c8df32e2015e5ede27822a183d80f2e32fb8c2c8f14a05fbdb05a272f169f246831fb96c4e56a6d81f44dcd86d51c005b9645cac9cbb264390215272e5ef9d7b1867292cf29d9eb321a46bc0abd9fc316106bab1ed85cfffcce2a326219e9c1a070024c44cc8391c1858c684d8cdea618dc73886d8e12a341be49b3d6ded4645c8b2f0791bbac82ec44aecbe95f6f7df1c5afbf7e40f2ea3fc66b068d1c39e8fe9123859fbe3e78f0dcb98307bfaeefff11f9fcb1d9b3e7cf9f3dfb3126df8e80a6af68d6f47a41252d35bd2063bd84e71224cf552520830ee0a9d75affa0e9d9b2e2548e6d83416e1dbe4e6da0eacfd200be461da0eccff149b4621f5dc6147dd3016a6c44e31b2f495b849fcc49e86bfed186f1b03f4f56226416d1dcef9bee5fd1ee87af27a107f92fe1b9a6fb93feebfbb38cac6715743aef03de636b9afb875a47d634236d41337a3676a95fbfdef6957f675c7859b3535bd26c5238671cf8bd3535e101afe6ef5a804b72dd7c93b9f2dac2e6a645cc77e666c525342d76665f14c157f1e4cea5a176d9c543ee3d30e1e14f8b6e368617368717a9732519f73e36be20ab28ad4761b72ef483d6ad3e3c38ee9561051dfba5be8fc743dfb479e6d2546b228a831e49e87b01e1397f72fdea9f5db748e807210acf41e25b26d5dc21a3f9feace6fbdfc1fd79c8bc4b4c7410292524a43b3a2572a332fea4a46f052b94e4df255a8cec49c7f3c6b59619c6724bc838d0e237a659cc469f451dc57c9df09ba5c88a625100cf0bdd4fbc91218580d7170016f3b363c1cb861e24d1e705bd1cf0fa0300c76040424eb2dd17f32f8373994fc0019b1fb9cd3ec926f0aa4838ec1e6cc6b6c12a16e3c0b2007eabb91159716e69dab1b1870fbefde206fb0443feff6a6d71447cc469e2230e52587c840e8379ef44aeb4405aa02050162827e57cb9afdcbf5bd96dd9677bc75ee5a87256b9de89dae7dee739147d28e690775feca1c0a140b48815d185dda22fdeaff855bf2ecd94664eb3f86d7e7b5a549a3bcde38f8df3a5f8fdf1dd515f69301a21152bc56ab1aecc54662eb314db8aed655165ee324f716c896fb2bf387e369a43e6f28f4af37cb3fd8bd11269b16f897f055a2db1d07795ae4a7fc878c874c87cc85265abb21f8a3ae43ee479c75b15bbd3b7dfdf2d3cf640d8aae5264f18a835d862bd3adce365ce47178c0e2f67f6b99caf3f347b8b933edc3f37b7ff809cdcfe7df0aa63c29eba5edae2e63d717d53e66cd93227addfbcdcfeec89feb7d7b2b5ceda7f5490dde1f9bd687d280f7b791bf2f2bccd0a0716af8db70591c8cb8755f3762c1e560ff215fac3d86ab45ac046146c3ac969e204c5604bab0123807d7f253c8454cd2675691f0a6b115411febfe29e053aaaeada7dee6fe64e6632ff4f32ff4c92c98790648624844f18f9ca3768d300168180090124413e225a0d482bfa78aca6d5b648d110a4956785f20045a90828ea03a9fd08b5b6b4d682daaa2fed7bcf529e0d77de3ee7de994c42e2a776ad3727f7e6dc73f7f9edb3efb97b9fbbf73efd464e333e1864f64fe4f0387a4e9223149239e43eb80f5fb187c853d6a76c468a152bc93004b55224dd9504b241b95bfce6d5355ccbd51dd4c050b13da86c13ce5f7d945b4ca0cf38972c5076e3f3d1a2b4530b697c3ef2d91378075903743662568cecb929549f58e1307b3207a6bf3744fafb83a5d3e78fa6839c1013e6841d1f515a978b5aa932981206f327fe1684d125f884405408ca381fcc8078ef1a081e21fe9a01f13eff5584c83aac0f116ccfd425a318d47508752403ea5d069573986449a02b9d7ec072c3dc1fd36f802021533f725e25a58a30ce0333985d6610be9d0806c8b33e1e4e98b68927728d526eb6c0815ce618ee17c0e5357d2da46abca108a57e35efb9dcf3cb313db18ac45c08cf0e2f0af3e5a49c2be7cb85725fb9bf3c501eac27f55c3d5f2fd4fbeafdf581fae042b2905bc82f1416fa16fa17061606bb4817d7c577095dbe2e7f57a02b789c1ce78ef3c705faa81e0f1c0faab650d4abcfe086e1f40637fb830f1e60e6e197c9b7c997c98c3b5a972e6dddc0ccc357ecdf2f1c548e2bbdcad3d71a89732b89a0625fbcac5b89582b6763fb47b18a8d2db37b64d8acd066f55983a6bf3744fafbfdd257aae96c365f8aa362396c8ee739e96c9ec8ab8fabb379bf12d86cde8290f987cd012f85ccd9e5fd5160a3f71b8155de8ec06cefc240c85b1e00af39604422c1c91a8ac5c3c26f7080cb133e831ef1c311d08b7c964cbfeceb4481277a0ef4ccfbd9d918fba8a8462a644e474894901a42c4c3ca2c7270af324b99b5971c6427725088e3f5ecbde4003bb1dbe420d26459f269e93b5210192f3b94c21f1375fe60aea97498dd2083c087724dc50ebea43090cbef2f34edcfdd59b87d58e9b01287db120a44188854ecb6f8a5a05416a9b194b94b8731d5b313aa5f4a77e6db425546b39cb09cd0dc14bad5459ada8ac42a2873438ec15256e28cfa0bc3e565b5ce1a7f75b8b6785cd914ff3c67a3af213caf685ef1726773ce525f737879c1f2a21c8fc79d1ff5171757fb47164f774cf64f0a4d2dbec9b1c0f9255fa3bf31d4106eccfb4ad172b9d9bedc71abb3c9d7125a125e517487fcb0bcddf0841ca004e9524d30993210b3a177b9e9ecad7a5050d7cf55f55b5d949b3f62f397fefd05b36566fcde1b0fbc909dadbc3f6d1ab5d9dc71a5e595db4ecf9c410d5f1f4eb69cb98daca91b4d840f26aeab7c7054add2fb61e2b6e1cafbb77cfc5d6ac4397de62b6b5e5992dc41ed60ebeb5fbd8d522db5a963b452ad5167549d9106a4bf37583ae339128ce770892acf31f0febbec7ee8b0ec7112ca49ec72fec8d3e9ecf2ac7276781639db3dc883780c946a559b1e9673943a7b093fc19ca684bc4a6e9717ca6659b899cd3429ab5d23beb3ff35e1c9de0fa6fd22bf8d38cd46096c65b209e7188e773165bf3ec3dd4b94a54e097446bae89aadadbcaa1fc98f818bbd555c18b4b7ca307013aa1f81142a54900aae82af106613a6fc24ec22bbb85dfc2ee10039c01de00f088e9b352d796b5cb50ae653330d3796b96e4d9b05339360c2298a785ee9bdfac1fb57b9a3cacd2b9734b355156ad9d02a39f0b95d9e1831bc28cfa413b3c31208a5ee2e8fb7cb51dac53fe6d85e9ee70e7bf8a2025376403234150c2f6a9216064cd6e1284c5632436fa4f2dff6a8ae38dd6ae7951e8b729eaac4515d5f13b8c1531eab8fad8a75c524943055ef544ea9cf4eb4bfe81d4dafb1abea7e4f926c622512317eb7b3f2e6496b57bcf3de75ff326de49aeaebe7d62c9e3cb761eb37c9a2af3453c5e49b7e77e1f7bf9e629835ada0764441e2dfd61d7b2ec7f391d7777d6df9c49a68e5969bd63e1afbf2bcb6957f3f4cdf3accce456ac1f11fcf28ee3a380a83a5af1d22fd74bff45a351de9e82c4d07fde1ac7115415d69651aa2329db33533a7ce9bcef92acb694d9836166e8cd517d6c7c6158e8b49940a790aab07e12e94a0ac50076713e347d6555b8201d0fda21a7e158c9e2d3c17317555ffb4acc476b6eed5d17c57f00d8fd779a6a264fb389dc520419927546d31148229506331850c265b7cf438eafa80adaab2a5f7da5a5b86abd953977ac7e0b09e7a5719f391e65055d5c14cccaab3d5d9c72566da66daeb130b6c0bec0b136db6367b7ba223b1cdb6cdfe88ed117b67629f6d9ffd98ed98dd151b5b51377e6ca2eec6b1b3eb168f5d54b779ecc6ba6f8dedacdb337657ddc1b107ea98198f6633d1b7eeacaa37bb997b3a6ba699455e7ef41a2b1fe91beb172ddd68b9fab66ae67375c1fab79abef3e6949967ef243219db7b34fb7bdba81d46f29e43cadfae6f7e6beb0b7fe83300e29ea036170735f31f6e9acf3fb37e66bdf28272396d9fb1e29615b7bcb457b30862a3a6b4539b1b1cb5892a6f06cfa446533430fa98acd1d39b83a6af1d22fd74bff44a35dd4aa905d3296fb6cab72aa4f266c9f34c5b9de63dc160ae4baed7608484a0f16f54df362703662d8341ee6c95c69d25a9f7b33732204e271720c440ee2c82500fb3f6a850ad0cea93b933a6af2dd11d6d8ae0af897985d1a268417e415151342f92170c05c3a150302f1ce2835545e6229f9f0b5499cd450545d1c2024c0dea2301de1ce1bbbd72b773bb37f258b1395ac8db8ca17084f71415e4058580641c6f93c67b9881c93966c86f4bfb62a51627544063afdb146baffabe74c77496ecd328a16947f669c6e8a75ca41c8362b6785c0cc5dae271a2ba254cca4b6a82d579e34aea4bda8576b15d6ad7b5ebdb5ded6e559642c14dec903a741dfa0e5787bbc3d391d3914b756b48c6572caa468dbc9faa7a3e82bd6da362b4201a7617b8457e7bcdad23d675dcbb7add574d8fad5b9ed6442f23fae1b3f29f57b61690f87364513bb923a2bcc4bde7f57e7dc3437b7fd85d369f3c74bf927c28a59ffe1e914dd9bf59bfa9e9ccdad59b1669e32fdad8bc54cfe8eb2cfc779abea26cd4676b74fac6a0e96b074ba75402c771fca57ff719d537b07abf367dff2c3ccfe63fb9328f4fcf7f08519986684d4104bc140267b737a151fc8db09f7dcbcc828ae740206e9cea38e24e58c1f0b8a4ff8151be532477e9ef1480f28174e59bf9dded3dc75cbd6aa296187686b99324aefc841e8a872e7f93adcaabc25ce5d54d1f52fbc9e46eb15838a9717ecf24ea82fe5c95ed7314979a42b98cef337517f2ddb9670ab797960e730742110b327f2ae3e78f588add52d0323e32431aef1ead717ed681ac9faa389ce2fd32541728e79718055586d1c8ed55854722b73715261ba63ba7f82786af2ffe8ab3d1df10fe72d13258e16cf137879b8b5c55fe51c593fcd38abfec5f50b4ccd0ec5f5924d31933d3cb82f6ce1c8a93e3e7faa797afbf5ba7bb3e585fb1eeab3addd5d113269229246ff9a1e90faedc3699d93edcfaf4cc8756f1137dde1f76175fe7dd1a08fcb0bb7482ffeaa559ff7117357c1836ecd1e66fcf3e730f25b6b2b2ef2dc03165bad48c2a1ad51988521793fd7235d9af1f04a32795fe06e63c0de7d8ac1308590949cf3a2a54651aaa9541e90f5b427e4ea52aa6c7c8cab9492b7f27a42d34340bc4d1093f33ce60661adbf567c8eff8c706b7d0f8f01a2b8882b461d7e7b4d0d03d4f4dbc0633d148b7ba32ddea56d66acdfe8879a20c1c81b73e8bfd1135fc52fddc28fa93e21ba04749787622cf6df7cba613e6e7b3a80333abee845d471cb26031bac0906d13ca724b4374d2a45f4462b69423334401d5234262a55e70c296f0b8707d7861987ac189a8ec659ccf58d1c8cb3012ddb90ce7ab3f9020092dbb49684daf6f6c32951b95c94a21f935399a55211cfcc3a5772ea1449b5ee7e0c8d7c932d24a36731a6fb380f136d467feda442c2f88fcb45107bfd25bce9acf19bb8677db8bbaf56ff05d05c13339f6ed232470e555ca6032eb2a4d72e978dfe811b44fbdd4a94b4ac9907dd9a04b3caad566eafbb7a3bc6a5c553d868555ed183aaaf493f348060fd2c76c08da278fb48b39c68d14643ad1ef61b69cfc75295bcf7b9270cff77f79fd8de7ef556d8948de7dafdd70e32b5b888b8cff7889666fa4b21cebd3fcc50d731a1a5206463736ceb941797954ca0289d20bf301c3a494118c5e3e104e33b98859b5482d9628fc44980f6093a0813e5dd74835ef0aefa054a33f2c9a8d7af5b9615e0018c468adc49fb21299862a7b9ebec2d6b7cf34501f635b9546668bea856509abc564cfe6bcaa01aa7392dbeeeb6f806aef6780aa9a7524dc06bbc3dc65fab5cf23128766c8ea920ef92c7dd6a9968f54676483d8a8a2641056ad1007daaa9e7b4de9c1e8c183e75e931c1f8c9c400d56e73ff704c6f83d04663df7047daab6083dfc06a90529ab3a912588f4839b4ee0a4b4993e359fe8f7d14dc784321d73d4c03e1fc74924aa8b902dff4de0e02baf1ca45fdcde7e7b60c93cbc2c909774bc48d2258ff9f0d34a2671774d9c902d49567012841e72c7c58bcafdf499be28bccdfb755e66ef36e118db3cd049fc20134fc260f6489b6da360b3d1d3efa374bfca3cac320f06adb28c85595d6ab516099cdc3db3ba66063d763c7efbed8fd3435468025d8355af1f67def7452f3f5faa85009c4e38dc560bef30e909f03e31c7e3301964d1f11cf1818f784124be84d9f452d04a2ca0776fccd16f3404d9d7254d2ea6df8b539e5cad296dbe7e4d0fb2a60731686271838cfd963999371aa94e9dd16cb418ad469bd16e74189d6697d96df69873ccb97220177209f56ba01a5779cd5e8bd7eab579ed5e87d7197405dd414f3027989b1b287266b1475e5379753a23aa5355ed5d5a1567a8e1b81a412acfc92fdcbaf4e6fca9c5635d05e6fc221a9f2036147042b06eb4fefe87bc8152b325518b314f32d9fb75a127b91e9f491d9cf9bbc266f5367280ff1647d79ceccf2237e33cccd446ca5fee531a69e3f37b2f7007154585d60d027d36035a977f2505fd3a3f97dbca3cda799fc5ba5c09191f545e0094942d177a539f949135b2c7792eaa3c79f1fc2dfc5ce2278b945df45b2ce6ae4de5e6696ea0b9891524fa65aaaf4e3e627f87346066f1bc7251d945e8576c9c95246e06db51209d7bef80dce93d05ae9086775f6f269b53b939da72e1ebacee2c283d8a8f106dbd059b6f64cd970d44b2ea8cd889b3e7ce5a9473afa5b7d4617d51cf4298f54891521df352fb06e51dad8374dd066b69efab4566edc4796d9b5136e8ac1261cd35b2e65a2ef4f4ab055b9d3a93864be79bc9c7ec5f0a03c4afbcadec260b682d88096132c344ff5af60e5d0b5d8bd670433231a456924254ba120255c9d1fc8bcc5f4f49c2a517dee1a48bb0cdc05d32f27344d228cfd1319e1825f64b9ac1054eab8c27766a1a9ea491ee48866fdea795b74818bbb1b9e7ef3f17caa92e485c2bdb0ee312610b966dd4bf932d19b0021b77c961725875fc1c196bb1ce31678103aba1f58cb9144b2f15d06fb5b1cc0a53956656ac554effa71aa08ce9513693bb7bc8296a0b47a2e49bfc65e47fdc603b62fb93e431de0c1e4d4d1f897804d5668af757b5891616926855bceadea95337c7465455c7e39ba74dbd179f60eee369f7c6e255d5b1119ba64edb1c8f57d35b740d653732a80bd8ee1454ca8824ac7a01f61a24ba4d85cce9454ea034a72a4e966b3b2ad1afacda215ea61a041f3f49cfdc13a98d2c5207dd327c7cf26256636a870a2867faabd3e1ab8909f1ac58acb232aba2225e9080478c81474a1ef63c923f597a6484f1e15115b6edb1fc9d33e253275486bdb2de4c37039aa01f1bd647c7ca53f5ce1aaf3e2a97cdb05cb88424a43a7c67fb0265aed6e078d031a07b03c53ee3e6409fb069103fc4a641f22b7457a02933664c397afe97cf1efdd51b575ed2b6099aa26d1b44b6d05d84acda9e4247b53d8606d944881b99da39686f6a2fa1fffd1fc974359402d89bca42679b47e1016e2bd31e083e0754b9c34e15079ea66e273750973b1f6aaed0d3fa802945c0b402202de52496b23f558ac8b6da65a58854f3803a31ff30558a5dd53238c9940cfaa916d04de35b9317b91ea6d1599ab04315f58259c5035f00dbb99d024f346d9e4b97fa0f04f210f1677ecfffe0f77ec944e78d91dc4e7eb848b509cd5868051fe72ba85247c419a90a5791e37ffeb3edca030fbcab6c107dca314ebafaf1f776efde4bf9b137911fd463ed95b03a31dae373c270be44fa5b913e68fd9bb972f87e3ec7b7dfb993df1e36c74a8af2f8827071c8aa8f99656369b0d8261943c5052e8bce0346badf56ec54ac97716aea5f7acb24a67e73e923aa22453d92ff764cca2b7985ea72391aa989ab0bb418a9ee73bf2ce9c2bab0baa88b11958f16f50b7fba4af9587978fa9b731713fc1d9dbb69266926d2aa9f2ebce199251d87ca386fa362e7e8ad7df394f3b11fddb3e4a906eaa659fceb8bd9419f3f647ef132e1a8e7de59f577ddfea2253fdf14b4be78e79df5f5d4ce24ca3f28ddc8d6e61d707ba20e393b8900d1e199237a590fb2ac2f203a59cac6013608b6ec1e1307db9c7a1d75a62f8bf6e55671192f2fcb322db72e333b9190d8aabde5526a5b1f3a0950a311f5834e4abdad6f018929b9211747b7798bf05453c9c9f495aa844debd75f7ce281190f3c79dbfe279f14cf5fbc78f579f25412a95099ce8dff8632931cfa46ca131be5aea3301969c92b9b5cd9c51e47874f32852705230d45f45d81a2d998b367cff68e41b24a583dbe5077d8c27599a28f3975e143b901ba0b1c95756216366121ebaca3bc73d5889aea7838759596dd18175da3b2d18100d9d1d2f24b626351e6fe4569a12e603011596aaf6fe2ac5947e6cc6511d51b4cca23cc9cb948c1a528478c671a9939b02061977264c104a62cd261964df6494e6b436eaaf5d4228ac9027697ccd9b2bbb9df1ac42e011e73180e598cb4fd0867f94fd5514dc2fa17ef09ef01ef460cabbc8bbc09af5eb554e0331dd7f4b9ae7993eaba4c7b79fa284e51beabac50be7be000f560431580a9179bbf67b4fa471ac659ab9d90485845d01b7813e930ea4d9649b6ec0697d6e25eadbd16bb5e306775cb02ca2c56f99089638d4dfbd4d184e1fede74b8bbb857b0253d28a5e428ef318f3ad45388587cad4f1d6c8b3e816d2981e1d098c8c9ce293555585cc33a20209b721d1d41c9943f29afb0a13c038f1f51f18a1282333718e91efedb7c2485525309d242fe218f3f4c7d87506a60e4f069f410e94f12d4b97b7fb298eef7ab58e5332843984f313e903e5278eea310e5828a6d3dc57631cc4cb83d5653a925bb03fcd83b574740324526850b1a4a327bf7612fed9b2d3790d71db12191173fe6d6450e597ca154c7062773360e9f4ae8dab8e0151b98c1689d8ed3a0e40e5cef4b2224478b9753bb6808f05f1237d0dce21c6320357b895ecd6042bc4c0d26805c5d89f2c12c56c2c8a78053353f990ef3292a02190753534e98a8092e4a43a41cca89c4943f9538f12a174f8997952b586aef1e2c75be7805398e1713590ebbdb42253339d7f26314c94470a340660fcbf90e7cdde59a0c7a6feec6000a65f94c283ba16ea558ab7e53fff01c538f611fa853edc967edc9c7a0b5677e4a1acb326759b2ac59b62cbbecc87219dd46268599bd669fd96f0e98837224258ff597c4bc2eafdbcb24b1a037e80bfa8381603037522a65bbb2b9815259553fc10ce532952f51b891bcaecc172adacaad9853302d3ada19b51444e945e1643118e184dc3131497488cbefcdf144b3cd636a258c6f7221ae0e0a3dca83a911209f7d04781c011e4780c711b047c8d59fbc7c4ab9480780e8b1d42d38021bb054ba7f902c80c8696b0ca754bc9eea43e7c04580849d0eaf59a0031c14e810970b320eb29d2e3a5c6d2123dea26b03b4a2ee6ee857d37414f75038d4d61cd49a4ec53ea1a61cac87a37eebb1262e280445a6f322948bc69b094f9722f8ab2dacb6b7841ea2dfbd9b12175dd1859b80fa8594299702a0c509b8f04a8d73a02793b538355899a5c5858cb8081ed2a6c5250890fb6002b4c32ad800ab61192c8556580b2128822538538420061518e2185b8c1021188f306b610d1eaba1199a60250cc3d4a9d086f0c331761ddc8a210437a6cb5ac3ae9af17f33e6b91dcfb720a4e133d45a9daeb5016bba1deb5a8e79da109ab6a309f37cbe1a27626c39e66b847508b104619b5869cd2c4713eb51084b69c3f32a84598ce52e43b810e66fc7da9bd8bd81e57c8995b2065bd48ef0b70c713794bedfc85ab506cb6a6735c5b06d71a8e9972f95ab2c9d8b8e36fb257f4557ab07fde1e803c734bd085e19d3a9125e1f675cf7693c9fc540e035a0ef84b7e0f7787e1bde41289ac7806d1903dcc4c9331a20fbd6a6b56de041da01f6ad00d2310a495634af6ea386daea15084c3b909aaa71864e0a996531e661ef4a066ba8f23a96b322b927398fc6fea15f213b0afb12924dc993c975c93d181b732d78f2887a0c726722aca6c7501525f7253bf1dc09ffe8affc9a76ff63bfe9daf189a524577cbe429317d44339923ca9bc9eec4c3a0785ba9fe241c3068ad7c91d2cdea9dec3b08f851d0caa50414865df50b569b17f74dc21394bfbbf473d324bedbbea77a62d3ead5e6b6107bb53381826299528fb92479477934d183b39442bd60da42796af180fa7d6bf42da47b5de34cc690a37381d7efa4fb93f79812e4923b50ed6a2d38362ba50bdd7ff2ed42a4d384e4d5f90223ff9d9cc6ccd9e746c88e7a80fe23352c19e2fde4ce582f2ba721a69be69b06755b9a2fc45f90b8bfd2519a407d61a4c9a58edf3936392c392099c73c6d2998742ab47ba7d27ff79e854ae2457e0b187d2dc406a57318a7db8907e1e8ff4d100a6a7c2117a457ba0d24f721e9d7d71c61c148f7db325cd37f05e2af4af8d5dcdfbe4d976001566d4d6774fcba7d190b20fc7685f7216e27b9032594f26a66299b31ff676623ad037cd44fafca86f9e6b71f8fff3fb341aa1a3fa05de3b99bf6d78347ec6569dfe8491c279449db933ef539c2aff1c8c36a667ac797dd4f44fc3f7ddeaf14f2db369a8f9f80b94997a775cf35ebbf669fcdc653bfbcd9d8569ce628899e773ce5474267c3749df823bbee89c37c81c3fe49bea13b9480275900d792893e743014451c618867c75055422e71d8711508572460d8c845a1805a391df9e023390ff9e037391cfde089be05ed80c5f83fb600b74c2b7e0417808be0ddf81edf030ec80efc14e7804764137ec86c7600f7c1f8e21a7fd22bc042fc3cfe017f03ad0dd89cb98b911c11644f08a0af03cb6a400b9e42806115b54843cfa300c3a842d431e9a4a3f32b6b01239f218862c6c691c39fa11184cd8e22aec51350633b6bc062cd8fa9160c51ed4820d7b310aecd893d1e0c0de8c0727f6680ab8b05733c08d3dfb12f2f47330e4600fe7422ef6f226f0624fbf862dbc0f83037bba055bd809948fff16f655c6de6e071ff67827d6f808063bf6f9fb58f2310c5eecf1713cbf88c1843d7f09efbe8cc18118f819f8110bbf800062e275082236ce639c4319c38481602fb2f10ae56eaccf8b35080c5322c39104a518740c177ad67399f5dcc07a9ec57a6e643d37b19e67b39e9b599f2d284d4da43bc963b0c1340c769889c101b3313819165c28553620461a310c85119161c4c73022315ce8192efc0c17590c1766c4c52eec5537060bd2c1f731fe030c41781c8315f66208c1bf61b0c113f0438c1fc4108643189c70189ec6f83318f2e0590c11388ac1033f86e7309e89df9318f2e1050c050cd7329cc2e0661837c3cf3114325c47e11c862286eb624d3e33c0a3f02438985c7767d3eaa6c5d0d9b47a651b742e5eddb40c3a9734b5adc1736bf36a3c6f587d2b742e6d6ec7f8d2d5cd2ba0b3b5a90d615a9b1763ca8aa6b626e8bcb5a93d44cf281f7e6d65d3da56e86c5b4153da9736ad84ced5ebda10726d4bdb523cb7d2f2879021d9d379ebb2a54dfde448419323098e32fd2fb22f0a3ec44f11caa93cd2f24cb8c4fe4f838b483d33e10fcc3fd2db789e02546b7fcaff01a69dddfc>","bytes":39240,"widths":[348,456,521,838,696,1002,872,306,457,457,523,838,380,415,380,365,696,696,696,696,696,696,696,696,696,696,400,400,838,838,838,580,1000,774,762,734,830,683,683,821,837,372,372,775,637,995,837,850,733,850,770,720,682,812,774,1103,771,724,725,457,365,457,838,500,500,675,716,593,716,678,435,716,712,343,343,665,343,1042,712,687,716,716,493,595,478,712,652,924,645,652,582,712,365,712,838,600,696,580,380,435,657,1000,500,500,500,1440,720,412,1167,580,725,580,580,380,380,657,657,639,500,1000,500,1000,595,412,1094,580,582,724,348,456,696,696,636,696,365,500,500,1000,564,646,838,415,1000,500,500,838,438,438,500,736,636,380,500,438,564,646,1035,1035,1035,580,774,774,774,774,774,774,1085,734,683,683,683,683,372,372,372,372,838,837,850,850,850,850,850,838,850,812,812,812,812,724,738,719,675,675,675,675,675,675,1048,593,678,678,678,678,343,343,343,343,687,712,687,687,687,687,687,838,687,712,712,712,712,652,716,652],"bbox":[-435,-236,1417,931],"ascent":928,"descent":-236}];
  const paginas = [];
  let comandos = [];
  const n = value => Number(value).toFixed(2);
  const rgb = color => color.slice(1).match(/../g).map(v => n(parseInt(v, 16) / 255)).join(' ');
  const especiais = { '€':128, '‚':130, 'ƒ':131, '„':132, '…':133, '†':134, '‡':135, 'ˆ':136, '‰':137, 'Š':138, '‹':139, 'Œ':140, 'Ž':142, '‘':145, '’':146, '“':147, '”':148, '•':149, '–':150, '—':151, '˜':152, '™':153, 'š':154, '›':155, 'œ':156, 'ž':158, 'Ÿ':159 };
  const hex = value => Array.from(String(value).normalize('NFC')).map(c => {
    const code = c.codePointAt(0);
    return (especiais[c] ?? (code >= 32 && code <= 255 ? code : 63)).toString(16).padStart(2, '0');
  }).join('');
  function ret(x, y, largura, altura, cor) {
    comandos.push(`${rgb(cor)} rg ${n(x)} ${n(H-y-altura)} ${n(largura)} ${n(altura)} re f`);
  }
  function texto(value, x, y, tamanho=10, cor=cores.tinta, negrito=false) {
    comandos.push(`BT /${negrito ? 'F2' : 'F1'} ${n(tamanho)} Tf ${rgb(cor)} rg 1 0 0 1 ${n(x)} ${n(H-y-tamanho)} Tm <${hex(value)}> Tj ET`);
  }
  // Usa as métricas das próprias fontes incorporadas para garantir a quebra de linhas.
  function largura(value, tamanho, negrito=false) {
    return Array.from(String(value).normalize('NFC')).reduce((s,c)=>{
      const code=especiais[c] ?? c.codePointAt(0);
      return s+(fontes[negrito?1:0].widths[(code>=32&&code<=255?code:63)-32]||0);
    },0)*tamanho/1000;
  }
  function linhas(value, limite, tamanho) {
    const resultado = [];
    for (const paragrafo of String(value).split('\n')) {
      let linha = '';
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        if (linha && largura(linha+' '+palavra,tamanho)>limite) { resultado.push(linha); linha=''; }
        // Também quebra tokens sem espaços (URLs ou descrições importadas).
        for (const letra of palavra) {
          if (!linha) linha=letra;
          else {
            if (largura(linha+letra,tamanho)>limite) {resultado.push(linha);linha='';}
            linha+=letra;
          }
        }
        linha+=' ';
      }
      resultado.push(linha.trimEnd());
    }
    return resultado;
  }
  function paragrafo(value,x,y,limite,tamanho=10,cor=cores.suave,negrito=false,passo=tamanho*1.5) {
    const ls=linhas(value,limite,tamanho);
    ls.forEach((l,i)=>texto(l,x,y+i*passo,tamanho,cor,negrito));
    return y+ls.length*passo;
  }
  const fmt=(v,d=1)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const impactos = new Map((dados.impactos || []).map(item => [item.questao, item.delta]));
  const quantidade=dados.itens.length;
  const brancos=dados.respostas.filter(r=>!r).length;
  const anulados=dados.itens.filter(it=>it.IN_ITEM_ABAN===1).length;
  const acertos=dados.itens.filter((it,i)=>it.TX_GABARITO===dados.respostas[i]).length;
  const info=dados.info;
  const precisao=info&&Number.isFinite(info.erro_medio)&&Number.isFinite(info.erro_maximo);
  const totalPaginas=1+Math.ceil(quantidade/46);
  function pagina(titulo,subtitulo) {
    comandos=[];paginas.push(comandos);
    ret(0,0,W,H,cores.fundo);ret(0,0,W,7,cores.violeta);
    ret(M,30,28,28,cores.violeta);texto('N',M+7,32,19,cores.branco,true);
    texto('nota',M+37,30,21,cores.tinta,true);texto('viva',M+37+largura('nota',21,true),30,21,cores.violeta,true);
    texto('SEU ENEM, MAIS CLARO',W-M-145,40,8,cores.suave,true);
    texto(titulo,M,87,25,cores.tinta,true);
    texto(subtitulo,M,122,9,cores.suave);
    ret(M,784,CW,1,cores.linha);
    texto('NotaViva · Estimativa educacional independente',M,795,8,cores.suave);
    texto(`${paginas.length} / ${totalPaginas}`,W-M-26,795,8,cores.violeta,true);
    texto('Cálculo TRI/EAP baseado no projeto de Pedro Mantovani.',M,810,7,cores.suave);
  }
  pagina('Seu resultado, com mais clareza.','RELATÓRIO DE DESEMPENHO · ENEM '+dados.ano);
  ret(M,154,CW,157,cores.violeta);
  texto('NOTA ESTIMADA',M+22,174,9,cores.branco,true);
  texto(fmt(dados.nota),M+19,194,55,cores.branco,true);
  texto('pontos',M+220,233,13,cores.branco);
  texto(dados.areaNome,M+22,271,11,cores.branco,true);
  const cards=[['ACERTOS',acertos+' / '+quantidade,cores.menta,cores.verde],['EM BRANCO',brancos,cores.lilas,cores.violeta],['DESCONSIDERADOS',anulados,cores.areia,cores.ambar]];
  cards.forEach(([titulo,valor,bg,fg],i)=>{
    const cw=(CW-20)/3, x=M+i*(cw+10);
    ret(x,326,cw,72,bg);texto(titulo,x+13,340,8,fg,true);texto(valor,x+13,358,22,fg,true);
  });
  texto('Acertos: contagem bruta, incluindo eventuais itens desconsiderados.',M,409,8,cores.suave);
  texto('Sobre a sua simulação',M,443,15,cores.tinta,true);
  const campos=[
    ['PROVA',String(dados.ano)+' · Código '+dados.prova],
    ['CADERNO',info ? info.aplicacao+' · '+info.descricao : 'Não informado'],
    ...(dados.area==='LC' ? [['IDIOMA',dados.lingua===0?'Inglês':'Espanhol']] : []),
    ['HABILIDADE (THETA)',fmt(dados.theta,4)],
    ['GERADO EM',dados.geradoEm]
  ];
  let yy=473;
  campos.forEach(([label,value])=>{
    texto(label,M,yy,8,cores.suave,true);
    const fim=paragrafo(value,M+130,yy-1,CW-130,10,cores.tinta);
    yy=Math.max(yy+24,fim+7);
  });
  yy+=10;
  texto('Precisão e interpretação',M,yy,15,cores.tinta,true);yy+=28;
  yy=paragrafo(precisao ? `Erro médio da amostra: ${fmt(info.erro_medio,3)} pontos. Erro máximo observado: ${fmt(info.erro_maximo,1)} pontos.` : 'Não há métricas de precisão disponíveis para esta prova.',M,yy,CW,10,cores.tinta);
  yy+=9;
  const notaLimite=precisao&&info.erro_medio>1 ? 'Atenção: erro amostral elevado nesta prova. Pode haver inconsistências nos dados. As métricas não garantem o erro da sua nota.' : 'As métricas descrevem a amostra de validação. Não são um intervalo de confiança nem uma garantia do erro da sua nota.';
  yy=paragrafo(notaLimite,M,yy,CW,9,cores.suave);
  // Esta faixa tem posição reservada, longe dos campos e do rodapé.
  ret(M,729,CW,40,cores.lilas);
  texto('UMA ESTIMATIVA, NÃO UM LIMITE.',M+12,737,8,cores.violeta,true);
  texto('A nota oficial é divulgada pelo Inep. Use este resultado como apoio aos estudos.',M+12,751,8,cores.suave);
  for(let inicio=0;inicio<quantidade;inicio+=46){
    pagina('Seu cartão-resposta.',`ENEM ${dados.ano} · Prova ${dados.prova} · ${dados.areaNome}`);
    paragrafo('Branco conta como erro nos itens válidos. Itens anulados ou abandonados não entram no cálculo da nota.',M,151,CW,9,cores.suave);
    const itensPagina=dados.itens.slice(inicio,inicio+46);
    const cw=(CW-18)/2;
    for(let col=0;col<2;col++){
      const x=M+col*(cw+18), top=201;
      ret(x,top,cw,28,cores.violeta);
      ['Q.','SUA','GAB.','SITUAÇÃO','IMPACTO'].forEach((t,i)=>texto(t,x+[8,40,70,99,195][i],top+9,7,cores.branco,true));
      itensPagina.slice(col*23,col*23+23).forEach((it,j)=>{
        const resposta=dados.respostas[inicio+col*23+j];
        const anulado=it.IN_ITEM_ABAN===1;
        const certo=resposta===it.TX_GABARITO;
        const status=anulado?'Desconsiderada':!resposta?'Em branco':certo?'Acerto':'Erro';
        const cor=anulado?cores.ambar:!resposta?cores.suave:certo?cores.verde:cores.coral;
        const bg=anulado?cores.areia:!resposta?cores.lilas:certo?cores.menta:cores.rosa;
        const y=top+28+j*22;
        ret(x,y,cw,22,j%2===0?cores.branco:'#f2eef8');
        ret(x+94,y+4,94,14,bg);
        texto(it.CO_POSICAO,x+8,y+6,8,cores.tinta,true);
        texto(resposta||'-',x+47,y+6,8,cores.tinta,true);
        texto(it.TX_GABARITO||'-',x+79,y+6,8,cores.suave);
        texto(status,x+99,y+7,7,cor,true);
        const delta = impactos.get(it.CO_POSICAO);
        const impacto = Number.isFinite(delta) ? (delta >= 0 ? "+" : "") + fmt(delta) : "-";
        texto(impacto,x+195,y+6,8,cores.violeta,true);
      });
    }
    texto('Impacto (pontos): nota atual menos nota com a resposta invertida.',M,746,8,cores.suave);
    texto('Positivo: pontos perdidos ao inverter. Negativo: pontos ganhos. Item desconsiderado: zero.',M,759,8,cores.suave);
  }
  // PDF 1.4 com objetos e offsets calculados sobre bytes ASCII reais.
  const objetos=[null];
  const add=body=>(objetos.push(body),objetos.length-1);
  const raiz=add(''),arvore=add('');
  function incorporarFonte(f) {
    const arquivo=add(`<< /Length ${f.hex.length} /Length1 ${f.bytes} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${f.hex}\nendstream`);
    const descricao=add(`<< /Type /FontDescriptor /FontName /${f.nome} /Flags 32 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.ascent} /StemV 80 /FontFile2 ${arquivo} 0 R >>`);
    return add(`<< /Type /Font /Subtype /TrueType /BaseFont /${f.nome} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(' ')}] /FontDescriptor ${descricao} 0 R >>`);
  }
  const regular=incorporarFonte(fontes[0]),bold=incorporarFonte(fontes[1]);
  const ids=paginas.map(cmd=>{
    const stream=cmd.join('\n')+'\n';
    const conteudo=add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    return add(`<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${conteudo} 0 R >>`);
  });
  objetos[raiz]=`<< /Type /Catalog /Pages ${arvore} 0 R /Lang (pt-BR) >>`;
  objetos[arvore]=`<< /Type /Pages /Kids [${ids.map(id=>id+' 0 R').join(' ')}] /Count ${ids.length} >>`;
  const metadata=add(`<< /Title <${hex('NotaViva - Relatório ENEM '+dados.ano)}> /Author (NotaViva) /Subject <${hex('Nota estimada, cartão-resposta e métricas da prova')}> >>`);
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objetos.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objetos[i]}\nendobj\n`;}
  const xref=pdf.length;
  pdf+=`xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objetos.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objetos.length} /Root ${raiz} 0 R /Info ${metadata} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf,c=>c.charCodeAt(0));
}

/* Fontes incorporadas: licença e atribuição
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: DejaVu fonts
Upstream-Author: Stepan Roh <src@users.sourceforge.net> (original author),
                  see /usr/share/doc/fonts-dejavu-core/AUTHORS for full list
Source: https://dejavu-fonts.github.io/

Files: *
Copyright: Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved. 
 Bitstream Vera is a trademark of Bitstream, Inc.
 DejaVu changes are in public domain.
License: bitstream-vera
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of the fonts accompanying this license ("Fonts") and associated
 documentation files (the "Font Software"), to reproduce and distribute the
 Font Software, including without limitation the rights to use, copy, merge,
 publish, distribute, and/or sell copies of the Font Software, and to permit
 persons to whom the Font Software is furnished to do so, subject to the
 following conditions:
 .
 The above copyright and trademark notices and this permission notice shall
 be included in all copies of one or more of the Font Software typefaces.
 .
 The Font Software may be modified, altered, or added to, and in particular
 the designs of glyphs or characters in the Fonts may be modified and
 additional glyphs or characters may be added to the Fonts, only if the fonts
 are renamed to names not containing either the words "Bitstream" or the word
 "Vera".
 .
 This License becomes null and void to the extent applicable to Fonts or Font
 Software that has been modified and is distributed under the "Bitstream
 Vera" names.
 .
 The Font Software may be sold as part of a larger software package but no
 copy of one or more of the Font Software typefaces may be sold by itself.
 .
 THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT,
 TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL BITSTREAM OR THE GNOME
 FOUNDATION BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING
 ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
 THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE
 FONT SOFTWARE.
 .
 Except as contained in this notice, the names of Gnome, the Gnome
 Foundation, and Bitstream Inc., shall not be used in advertising or
 otherwise to promote the sale, use or other dealings in this Font Software
 without prior written authorization from the Gnome Foundation or Bitstream
 Inc., respectively. For further information, contact: fonts at gnome dot
 org.

*/
