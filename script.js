/*
CÓDIGO GERADO COM CLOUDE AI COM BASE NOS CÓDIGOS ORIGINAIS EM PYTHON
Os códigos originais foram intensamente testados e estão disponíveis em:
https://github.com/pedro-mantovani/calculadora_ENEM
O erro médio é de 0,03 pontos
*/

"use strict";

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
  totalQuestoesResultado: document.getElementById("total-questoes-resultado"),
  loadingDeltas: document.getElementById("loading-deltas"),
  deltaTable: document.getElementById("delta-table"),
  btnRefazer: document.getElementById("btn-refazer"),
};

function mostrarPasso(secao) {
  secao.classList.remove("hidden");
  secao.scrollIntoView({ behavior: "smooth", block: "start" });
}

function esconderPasso(secao) {
  secao.classList.add("hidden");
}

function setHint(elemento, mensagem, tipo) {
  elemento.textContent = mensagem || "";
  elemento.classList.remove("error", "ok");
  if (tipo) elemento.classList.add(tipo);
}

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

  const anoDaProva = infoProva.ano;

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
      // Atributo adicionado para saber o acerto
      bubble.dataset.isCorrect = (letra === item.TX_GABARITO);

      bubble.addEventListener("click", () => {
        state.respostas[pos] = letra;
        atualizarLinhaCartao(row, letra);
      });
      row.appendChild(bubble);
    });

    el.bubbleSheet.appendChild(row);
  });
}

function atualizarLinhaCartao(row, letraSelecionada) {
  row.classList.toggle("answered", Boolean(letraSelecionada));
  row.querySelectorAll(".bubble").forEach((b) => {
    b.classList.toggle("filled", b.dataset.letra === letraSelecionada);
  });
}

el.checkCorrecao.addEventListener('change', (e) => {
  if(e.target.checked) {
    el.bubbleSheet.classList.add('mostrar-gabarito');
  } else {
    el.bubbleSheet.classList.remove('mostrar-gabarito');
  }
});

el.btnColar.addEventListener("click", () => {
  const texto = el.inputColar.value.trim().toUpperCase().replace(/[^A-E]/g, "");

  if (texto.length !== state.itens.length) {
    setHint(
      el.hintRespostas,
      `Você colou ${texto.length} respostas, mas a prova tem ${state.itens.length} questões.`,
      "error"
    );
    return;
  }

  state.respostas = texto.split("");

  [...el.bubbleSheet.children].forEach((row, pos) => {
    atualizarLinhaCartao(row, state.respostas[pos]);
  });

  setHint(el.hintRespostas, "Cartão preenchido a partir do texto colado.", "ok");
});

/* =========================================================
   Passo 3 — Calcular nota + impacto por questão
   ========================================================= */

el.btnCalcular.addEventListener("click", async () => {
  const faltando = state.respostas.filter((r) => !r).length;
  if (faltando > 0) {
    setHint(el.hintRespostas, `Faltam ${faltando} respostas no cartão.`, "error");
    return;
  }

  el.btnCalcular.disabled = true;
  setHint(el.hintRespostas, "Calculando...", null);

  await new Promise((resolve) => setTimeout(resolve, 30));

  try {
    const { nota } = calcularNota(state.respostas, state.itens, state.area);

    // Cálculo da quantidade de acertos
    let qtdAcertos = 0;
    state.respostas.forEach((resp, i) => {
       if (resp === state.itens[i].TX_GABARITO) qtdAcertos++;
    });

    el.scoreAreaLabel.textContent = SIGLAS[state.area] || state.area;
    el.scoreNota.textContent = nota.toFixed(1);
    el.scoreAcertos.textContent = qtdAcertos;
    el.totalQuestoesResultado.textContent = state.itens.length;

    esconderPasso(el.stepRespostas);
    mostrarPasso(el.stepResultado);

    el.deltaTable.innerHTML = "";
    el.loadingDeltas.classList.remove("hidden");

    await new Promise((resolve) => setTimeout(resolve, 30));

    const resultados = calcularDeltas(state.respostas, state.itens, state.area, nota);
    renderizarDeltas(resultados);

    el.loadingDeltas.classList.add("hidden");
  } catch (erro) {
    setHint(el.hintRespostas, `Erro ao calcular: ${erro.message}`, "error");
  } finally {
    el.btnCalcular.disabled = false;
  }
});

function renderizarDeltas(resultados) {
  el.deltaTable.innerHTML = "";

  const maiorAbs = Math.max(1e-6, ...resultados.map((r) => Math.abs(r.delta)));

  resultados.forEach((r) => {
    const foiAcerto = r.alteracao === "Acerto → Erro";
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
        <span class="delta-badge ${classe}">${foiAcerto ? "acerto" : "erro"}</span>
      </span>
    `;

    el.deltaTable.appendChild(row);
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
    const res = await fetch('dados/provas_mapeadas.json');
    if (!res.ok) throw new Error("JSON não encontrado");
    catalogoProvas = await res.json();
    
    const anos = [...new Set(catalogoProvas.map(p => p.ano))].sort((a, b) => b - a);
    popularSelect(selAno, anos.map(a => ({ value: a, text: a })), "Selecione o ano...");
    
    selAno.addEventListener('change', () => {
      resetSelect(selArea, "Selecione a área...");
      resetSelect(selAplicacao, "Selecione a área antes...");
      resetSelect(el.selCor, "Selecione a aplicação...");
      if (!selAno.value) return;
      
      const areas = [...new Set(catalogoProvas.filter(p => p.ano == selAno.value).map(p => p.area))];
      const areasObj = areas.map(a => ({ value: a, text: NOME_AREAS[a] || a }));
      popularSelect(selArea, areasObj, "Selecione a área...");
    });
    
    selArea.addEventListener('change', () => {
      resetSelect(selAplicacao, "Selecione a aplicação...");
      resetSelect(el.selCor, "Selecione a aplicação antes...");
      if (!selArea.value) return;
      
      const aplicacoes = [...new Set(catalogoProvas.filter(p => 
        p.ano == selAno.value && p.area === selArea.value
      ).map(p => p.aplicacao))];
      popularSelect(selAplicacao, aplicacoes.map(a => ({ value: a, text: a })), "Selecione a aplicação...");
    });
    
    selAplicacao.addEventListener('change', () => {
      resetSelect(el.selCor, "Selecione a cor/formato...");
      if (!selAplicacao.value) return;
      
      const opcoes = catalogoProvas.filter(p => 
        p.ano == selAno.value && 
        p.area === selArea.value && 
        p.aplicacao === selAplicacao.value
      );
      
      const coresObj = opcoes.map(op => ({ value: op.codigo, text: op.descricao }));
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

  } catch (e) {
    console.warn("Filtros em cascata não inicializados. Erro:", e);
    resetSelect(selAno, "Indisponível (use o código abaixo)");
  }
}

function popularSelect(selectElem, arrayObjetos, placeholder) {
  selectElem.innerHTML = `<option value="">${placeholder}</option>`;
  arrayObjetos.forEach(obj => {
    const option = document.createElement('option');
    option.value = obj.value;
    option.textContent = obj.text;
    selectElem.appendChild(option);
  });
  selectElem.disabled = false;
}

function resetSelect(selectElem, placeholder) {
  selectElem.innerHTML = `<option value="">${placeholder}</option>`;
  selectElem.disabled = true;
}

document.addEventListener('DOMContentLoaded', iniciarFiltrosCascata);