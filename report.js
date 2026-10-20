/* PDF vetorial A4, gerado localmente, com texto selecionável e sem CDN.
   Coordenadas em pontos; fontes DejaVu Sans incorporadas, com codificação WinAnsi. */
function gerarRelatorioPDFMeuENEM(dados, logo) {
  if (!logo) throw new Error("Carregue o ícone da marca antes de gerar o PDF.");
  const W = 595.28,
    H = 841.89,
    M = 38,
    CW = W - 2 * M;
  const cores = {
    tinta: "#29243c",
    suave: "#746a87",
    violeta: "#6547de",
    lilas: "#eee8fc",
    verde: "#267451",
    menta: "#e5f3eb",
    coral: "#b43f59",
    rosa: "#fbeaf0",
    linha: "#e7e1ee",
    branco: "#ffffff",
    fundo: "#faf9fd",
    ambar: "#88621e",
    areia: "#fff4dc",
  };
  const fontes = FONTES_RELATORIO;
  const paginas = [];
  let comandos = [];
  const n = (value) => Number(value).toFixed(2);
  const rgb = (color) =>
    color
      .slice(1)
      .match(/../g)
      .map((v) => n(parseInt(v, 16) / 255))
      .join(" ");
  const especiais = {
    "€": 128,
    "‚": 130,
    ƒ: 131,
    "„": 132,
    "…": 133,
    "†": 134,
    "‡": 135,
    ˆ: 136,
    "‰": 137,
    Š: 138,
    "‹": 139,
    Œ: 140,
    Ž: 142,
    "‘": 145,
    "’": 146,
    "“": 147,
    "”": 148,
    "•": 149,
    "–": 150,
    "—": 151,
    "˜": 152,
    "™": 153,
    š: 154,
    "›": 155,
    œ: 156,
    ž: 158,
    Ÿ: 159,
  };
  const hex = (value) =>
    Array.from(String(value).normalize("NFC"))
      .map((c) => {
        const code = c.codePointAt(0);
        return (especiais[c] ?? (code >= 32 && code <= 255 ? code : 63))
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
  function ret(x, y, largura, altura, cor) {
    comandos.push(`${rgb(cor)} rg ${n(x)} ${n(H - y - altura)} ${n(largura)} ${n(altura)} re f`);
  }
  function texto(value, x, y, tamanho = 10, cor = cores.tinta, negrito = false) {
    comandos.push(
      `BT /${negrito ? "F2" : "F1"} ${n(tamanho)} Tf ${rgb(cor)} rg 1 0 0 1 ${n(x)} ${n(H - y - tamanho)} Tm <${hex(value)}> Tj ET`,
    );
  }
  // Usa as métricas das próprias fontes incorporadas para garantir a quebra de linhas.
  function largura(value, tamanho, negrito = false) {
    return (
      (Array.from(String(value).normalize("NFC")).reduce((s, c) => {
        const code = especiais[c] ?? c.codePointAt(0);
        return (
          s + (fontes[negrito ? 1 : 0].widths[(code >= 32 && code <= 255 ? code : 63) - 32] || 0)
        );
      }, 0) *
        tamanho) /
      1000
    );
  }
  function linhas(value, limite, tamanho) {
    const resultado = [];
    for (const paragrafo of String(value).split("\n")) {
      let linha = "";
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        if (linha && largura(linha + " " + palavra, tamanho) > limite) {
          resultado.push(linha);
          linha = "";
        }
        // Também quebra tokens sem espaços (URLs ou descrições importadas).
        for (const letra of palavra) {
          if (!linha) linha = letra;
          else {
            if (largura(linha + letra, tamanho) > limite) {
              resultado.push(linha);
              linha = "";
            }
            linha += letra;
          }
        }
        linha += " ";
      }
      resultado.push(linha.trimEnd());
    }
    return resultado;
  }
  function paragrafo(
    value,
    x,
    y,
    limite,
    tamanho = 10,
    cor = cores.suave,
    negrito = false,
    passo = tamanho * 1.5,
  ) {
    const ls = linhas(value, limite, tamanho);
    ls.forEach((l, i) => texto(l, x, y + i * passo, tamanho, cor, negrito));
    return y + ls.length * passo;
  }
  const fmt = (v, d = 1) =>
    Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const impactos = new Map((dados.impactos || []).map((item) => [item.questao, item.delta]));
  const quantidade = dados.itens.length;
  const brancos = dados.respostas.filter((r) => !r).length;
  const anulados = dados.itens.filter((it) => it.IN_ITEM_ABAN === 1).length;
  const acertos = dados.itens.filter((it, i) => it.TX_GABARITO === dados.respostas[i]).length;
  const info = dados.info;
  const precisao = info && Number.isFinite(info.erro_medio) && Number.isFinite(info.erro_maximo);
  const totalPaginas = 1 + Math.ceil(quantidade / 46);
  function pagina(titulo, subtitulo) {
    comandos = [];
    paginas.push(comandos);
    ret(0, 0, W, H, cores.fundo);
    ret(0, 0, W, 7, cores.violeta);
    comandos.push(`q 28 0 0 28 ${n(M)} ${n(H - 30 - 28)} cm /Logo Do Q`);
    texto("Meu ", M + 37, 30, 21, cores.tinta, true);
    texto("ENEM", M + 37 + largura("Meu ", 21, true), 30, 21, cores.violeta, true);
    texto("SEU ENEM, MAIS CLARO", W - M - 145, 40, 8, cores.suave, true);
    texto(titulo, M, 87, 25, cores.tinta, true);
    texto(subtitulo, M, 122, 9, cores.suave);
    ret(M, 784, CW, 1, cores.linha);
    texto("Meu ENEM · Estimativa educacional independente", M, 795, 8, cores.suave);
    texto(`${paginas.length} / ${totalPaginas}`, W - M - 26, 795, 8, cores.violeta, true);
    texto("Cálculo TRI/EAP baseado no projeto de Pedro Mantovani.", M, 810, 7, cores.suave);
  }
  pagina("Seu resultado, com mais clareza.", "RELATÓRIO DE DESEMPENHO · ENEM " + dados.ano);
  ret(M, 154, CW, 157, cores.violeta);
  texto("NOTA ESTIMADA", M + 22, 174, 9, cores.branco, true);
  texto(fmt(dados.nota), M + 19, 194, 55, cores.branco, true);
  texto("pontos", M + 220, 233, 13, cores.branco);
  texto(dados.areaNome, M + 22, 271, 11, cores.branco, true);
  const cards = [
    ["ACERTOS", acertos + " / " + quantidade, cores.menta, cores.verde],
    ["EM BRANCO", brancos, cores.lilas, cores.violeta],
    ["DESCONSIDERADOS", anulados, cores.areia, cores.ambar],
  ];
  cards.forEach(([titulo, valor, bg, fg], i) => {
    const cw = (CW - 20) / 3,
      x = M + i * (cw + 10);
    ret(x, 326, cw, 72, bg);
    texto(titulo, x + 13, 340, 8, fg, true);
    texto(valor, x + 13, 358, 22, fg, true);
  });
  texto(
    "Acertos: contagem bruta, incluindo eventuais itens desconsiderados.",
    M,
    409,
    8,
    cores.suave,
  );
  texto("Sobre a sua simulação", M, 443, 15, cores.tinta, true);
  const campos = [
    ["PROVA", String(dados.ano) + " · Código " + dados.prova],
    ["CADERNO", info ? info.aplicacao + " · " + info.descricao : "Não informado"],
    ...(dados.area === "LC" ? [["IDIOMA", dados.lingua === 0 ? "Inglês" : "Espanhol"]] : []),
    ["HABILIDADE (THETA)", fmt(dados.theta, 4)],
    ["GERADO EM", dados.geradoEm],
  ];
  let yy = 473;
  campos.forEach(([label, value]) => {
    texto(label, M, yy, 8, cores.suave, true);
    const fim = paragrafo(value, M + 130, yy - 1, CW - 130, 10, cores.tinta);
    yy = Math.max(yy + 24, fim + 7);
  });
  yy += 10;
  texto("Precisão e interpretação", M, yy, 15, cores.tinta, true);
  yy += 28;
  yy = paragrafo(
    precisao
      ? `Erro médio da amostra: ${fmt(info.erro_medio, 3)} pontos. Erro máximo observado: ${fmt(info.erro_maximo, 1)} pontos.`
      : "Não há métricas de precisão disponíveis para esta prova.",
    M,
    yy,
    CW,
    10,
    cores.tinta,
  );
  yy += 9;
  const notaLimite =
    precisao && info.erro_medio > 1
      ? "Atenção: erro amostral elevado nesta prova. Pode haver inconsistências nos dados. As métricas não garantem o erro da sua nota."
      : "As métricas descrevem a amostra de validação. Não são um intervalo de confiança nem uma garantia do erro da sua nota.";
  yy = paragrafo(notaLimite, M, yy, CW, 9, cores.suave);
  // Esta faixa tem posição reservada, longe dos campos e do rodapé.
  ret(M, 729, CW, 40, cores.lilas);
  texto("UMA ESTIMATIVA, NÃO UM LIMITE.", M + 12, 737, 8, cores.violeta, true);
  texto(
    "A nota oficial é divulgada pelo Inep. Use este resultado como apoio aos estudos.",
    M + 12,
    751,
    8,
    cores.suave,
  );
  for (let inicio = 0; inicio < quantidade; inicio += 46) {
    pagina("Seu cartão-resposta.", `ENEM ${dados.ano} · Prova ${dados.prova} · ${dados.areaNome}`);
    paragrafo(
      "Branco conta como erro nos itens válidos. Itens anulados ou abandonados não entram no cálculo da nota.",
      M,
      151,
      CW,
      9,
      cores.suave,
    );
    const itensPagina = dados.itens.slice(inicio, inicio + 46);
    const cw = (CW - 18) / 2;
    for (let col = 0; col < 2; col++) {
      const x = M + col * (cw + 18),
        top = 201;
      ret(x, top, cw, 28, cores.violeta);
      ["Q.", "SUA", "GAB.", "SITUAÇÃO", "IMPACTO"].forEach((t, i) =>
        texto(t, x + [8, 40, 70, 99, 195][i], top + 9, 7, cores.branco, true),
      );
      itensPagina.slice(col * 23, col * 23 + 23).forEach((it, j) => {
        const resposta = dados.respostas[inicio + col * 23 + j];
        const anulado = it.IN_ITEM_ABAN === 1;
        const certo = resposta === it.TX_GABARITO;
        const status = anulado
          ? "Desconsiderada"
          : !resposta
            ? "Em branco"
            : certo
              ? "Acerto"
              : "Erro";
        const cor = anulado
          ? cores.ambar
          : !resposta
            ? cores.suave
            : certo
              ? cores.verde
              : cores.coral;
        const bg = anulado
          ? cores.areia
          : !resposta
            ? cores.lilas
            : certo
              ? cores.menta
              : cores.rosa;
        const y = top + 28 + j * 22;
        ret(x, y, cw, 22, j % 2 === 0 ? cores.branco : "#f2eef8");
        ret(x + 94, y + 4, 94, 14, bg);
        texto(it.CO_POSICAO, x + 8, y + 6, 8, cores.tinta, true);
        texto(resposta || "-", x + 47, y + 6, 8, cores.tinta, true);
        texto(it.TX_GABARITO || "-", x + 79, y + 6, 8, cores.suave);
        texto(status, x + 99, y + 7, 7, cor, true);
        const delta = impactos.get(it.CO_POSICAO);
        const impacto = Number.isFinite(delta) ? (delta >= 0 ? "+" : "") + fmt(delta) : "-";
        texto(impacto, x + 195, y + 6, 8, cores.violeta, true);
      });
    }
    texto(
      "Impacto (pontos): nota atual menos nota com a resposta invertida.",
      M,
      746,
      8,
      cores.suave,
    );
    texto(
      "Positivo: pontos perdidos ao inverter. Negativo: pontos ganhos. Item desconsiderado: zero.",
      M,
      759,
      8,
      cores.suave,
    );
  }
  // PDF 1.4 com objetos e offsets calculados sobre bytes ASCII reais.
  const objetos = [null];
  const add = (body) => (objetos.push(body), objetos.length - 1);
  const raiz = add(""),
    arvore = add("");
  function incorporarFonte(f) {
    const arquivo = add(
      `<< /Length ${f.hex.length} /Length1 ${f.bytes} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${f.hex}\nendstream`,
    );
    const descricao = add(
      `<< /Type /FontDescriptor /FontName /${f.nome} /Flags 32 /FontBBox [${f.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.ascent} /StemV 80 /FontFile2 ${arquivo} 0 R >>`,
    );
    return add(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${f.nome} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(" ")}] /FontDescriptor ${descricao} 0 R >>`,
    );
  }
  const regular = incorporarFonte(fontes[0]),
    bold = incorporarFonte(fontes[1]);
  // The same image and alpha mask are shared by every page of the report.
  function incorporarImagem(canal, espacoCor, mascara = "") {
    return add(
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /${espacoCor} /BitsPerComponent 8 /Filter ${canal.filter} ${mascara} /Length ${canal.hex.length} >>\nstream\n${canal.hex}\nendstream`,
    );
  }
  const alpha = incorporarImagem(logo.alpha, "DeviceGray");
  const imagemLogo = incorporarImagem(logo.rgb, "DeviceRGB", `/SMask ${alpha} 0 R`);
  const ids = paginas.map((cmd) => {
    const stream = cmd.join("\n") + "\n";
    const conteudo = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    return add(
      `<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> /XObject << /Logo ${imagemLogo} 0 R >> >> /Contents ${conteudo} 0 R >>`,
    );
  });
  objetos[raiz] = `<< /Type /Catalog /Pages ${arvore} 0 R /Lang (pt-BR) >>`;
  objetos[arvore] =
    `<< /Type /Pages /Kids [${ids.map((id) => id + " 0 R").join(" ")}] /Count ${ids.length} >>`;
  const metadata = add(
    `<< /Title <${hex("Meu ENEM - Relatório ENEM " + dados.ano)}> /Author (Meu ENEM) /Subject <${hex("Nota estimada, cartão-resposta e métricas da prova")}> >>`,
  );
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 1; i < objetos.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objetos.length; i++)
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objetos.length} /Root ${raiz} 0 R /Info ${metadata} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

/** Read the shared favicon URL from the page, never a second copy of the artwork.
 * Rasterize at 256px (over 650 dpi at the printed size), preserving transparency.
 * Text and the rest of the report remain vector-based and selectable.
 */
async function carregarLogoPDF() {
  const url = document.querySelector('link[rel="icon"]').href;
  const resposta = await fetch(url, { cache: "no-cache" });
  if (!resposta.ok) throw new Error("Não foi possível carregar a logo do relatório.");
  const imagemURL = URL.createObjectURL(await resposta.blob());
  try {
    const imagem = new Image();
    imagem.src = imagemURL;
    await imagem.decode();
    const tamanho = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = tamanho;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("O navegador não disponibilizou a conversão da logo.");
    const escala = tamanho / Math.max(imagem.naturalWidth, imagem.naturalHeight);
    const largura = imagem.naturalWidth * escala;
    const altura = imagem.naturalHeight * escala;
    ctx.drawImage(imagem, (tamanho - largura) / 2, (tamanho - altura) / 2, largura, altura);
    return prepararLogoPDF(ctx.getImageData(0, 0, tamanho, tamanho).data, tamanho, tamanho);
  } finally {
    URL.revokeObjectURL(imagemURL);
  }
}

/** Split RGBA into PDF color and soft-mask streams; compress when supported. */
async function prepararLogoPDF(pixels, width, height) {
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    rgb.set(pixels.subarray(i * 4, i * 4 + 3), i * 3);
    alpha[i] = pixels[i * 4 + 3];
  }
  async function codificarCanal(bytes) {
    const comprimir = typeof CompressionStream !== "undefined";
    if (comprimir) {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return {
      hex: Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("") + ">",
      filter: comprimir ? "[/ASCIIHexDecode /FlateDecode]" : "/ASCIIHexDecode",
    };
  }
  const [cor, mascara] = await Promise.all([codificarCanal(rgb), codificarCanal(alpha)]);
  return { width, height, rgb: cor, alpha: mascara };
}
