# NotaViva

**Seu ENEM, mais claro.** Reconstrução visual em português brasileiro da calculadora de Pedro Mantovani, com interface responsiva, identidade violeta/menta/coral e o motor TRI original preservado.

## Abrir no computador

1. Extraia todo o ZIP, mantendo a pasta `dados` ao lado dos arquivos HTML.
2. Abra um terminal na pasta extraída e execute `python3 iniciar.py` (no Windows, `py iniciar.py`). É necessário ter Python 3 instalado.
3. O navegador abrirá automaticamente. Se não abrir, acesse o endereço mostrado no terminal, normalmente `http://127.0.0.1:8000/index.html`.
4. Para encerrar o servidor, pressione Ctrl+C.

Alternativa: execute `python3 -m http.server 8000 --bind 127.0.0.1` e abra `http://127.0.0.1:8000/`.

Não abra o HTML por duplo clique: os navegadores restringem a leitura de JSON/CSV por `file://`. O iniciador resolve isso sem instalar dependências. Os cálculos e os dados das provas funcionam localmente; fontes e estatísticas de acesso usam serviços externos, com fontes de sistema como alternativa.

## Publicar

Envie os arquivos desta pasta e `dados/` a qualquer hospedagem estática, como a já usada pelo projeto. Não é necessário npm, framework, compilação ou backend. `index.html` é a página inicial. Mantenha os caminhos relativos. Nenhuma publicação foi realizada nesta entrega.

## Arquivos e compatibilidade

- `index.html`: calculadora e resultado.
- `como-funciona.html`: explicações, matemática, dúvidas recolhidas e laboratório TRI.
- `contato.html`: contato, cópia do e-mail e links do projeto.
- `style.css`: novo sistema visual, layouts responsivos e impressão.
- `script.js`: comportamento original e melhorias de interface.
- `dados/`: catálogo e 17 arquivos CSV de 2009 a 2025.
- `favicon.svg`: símbolo vetorial da marca.
- `iniciar.py`: iniciador local opcional; não participa da hospedagem estática.

Os nomes exatos dos anexos também estão preservados: `index(1).html`, `como-funciona(1).html`, `contato(1).html`, `style(1).css` e `script(1).js`. São cópias da reconstrução, com referências entre si. Para hospedagem, prefira as versões sem `(1)`. Se editar as duas versões, mantenha-as sincronizadas.

## Funcionalidades preservadas

- Seleção por ano, área, aplicação e cor/formato, ou por código de prova.
- Escolha entre inglês e espanhol em Linguagens.
- Cartão-resposta vertical com linhas alternadas, marcação/desmarcação e itens em branco.
- Colagem de respostas curtas ou longas, numeradas, com separadores e marcadores de branco.
- Substituir ou mesclar respostas, escolher a posição inicial e desfazer o preenchimento.
- Correção opcional, progresso, salvamento e restauração local, troca de prova e limpeza com confirmação.
- Nota estimada, habilidade, acertos, itens anulados, métricas de precisão e impacto por questão.
- Curva TRI manipulável diretamente, ponto de habilidade, controles por sliders e teclado, restauração do exemplo.
- Perguntas recolhidas, explicações EAP/MLE, coeficientes, limites, fontes e contato.

## Melhorias

- Nova marca NotaViva e interface reorganizada nas três páginas.
- Etapas em destaque, botões consistentes, ajuda contextual, layout para celulares e foco de teclado ao avançar.
- Download de um relatório TXT com nota, respostas, gabarito e métricas.
- Impressão / PDF pelo diálogo do navegador. Abra o painel de impacto antes de imprimir se quiser incluí-lo.
- Cadernos sem dados identificados explicitamente, evitando avançar para uma prova sem itens.
- Mensagem orientativa quando o site é aberto por `file://`.

## Cálculo e dados

O trecho do motor original, do início de `TRANSFORMACAO` até a declaração dos elementos de interface, foi preservado integralmente: parser CSV, modelo 3PL, integração em 400 pontos entre −4 e 4, priori normal, EAP, transformação por área e cálculo dos impactos. Não foram alterados coeficientes ou parâmetros para acompanhar o redesign.

Os anexos não incluíam `dados/`. A pasta foi recuperada do repositório original do site:

https://github.com/pedro-mantovani/site_calculadora_ENEM

Referência: commit `53a2897269f0e91b3fc21ab5de71b6491c13b859`.

O catálogo contém 760 entradas. Em 724 há itens correspondentes nos CSVs; 36 entradas já não tinham itens na base de origem (4 de 2009, 8 de 2020 e 24 de 2025). Todas foram mantidas no catálogo, com `disponivel: false` apenas nas 36 sem dados. Elas aparecem desabilitadas nos filtros e recebem uma mensagem explicativa quando buscadas por código. Os CSVs são cópias integrais, sem inventar ou substituir parâmetros.

Se adicionar posteriormente itens para esses cadernos, remova `disponivel: false` da entrada correspondente no JSON. Os indicadores de precisão são os do catálogo de origem, sem promessa de erro individual. A nota é uma estimativa educacional, não a nota oficial do Inep.

## Privacidade e serviços externos

As respostas ficam no armazenamento local do navegador, sem sincronização entre dispositivos. A chave de armazenamento original foi mantida para compatibilidade. Use o mesmo endereço, navegador e dispositivo para retomar uma simulação. O Google Analytics da versão enviada foi preservado na calculadora, assim como as fontes do Google Fonts. Para retirar as estatísticas, remova o bloco Google tag de ambos os arquivos de entrada.

## Validação

Foram conferidos sintaxe JavaScript, IDs únicos, referências locais, catálogo/CSVs e os principais fluxos em DOM simulado: filtros, código, idiomas, marcação, colagem, brancos, excesso de respostas, mescla, desfazer, correção, restauração, cálculo, impactos, acionamento do download/impressão, controles da curva e cópia do e-mail. Os resultados numéricos foram comparados com o motor dos anexos em quatro áreas e padrões de resposta diferentes, com igualdade exata.

Limite da verificação: não houve inspeção visual em navegador real nem validação física do PDF impresso. O CSS inclui layouts para celulares e computadores, foco visível e respeito à preferência por movimento reduzido.

## Créditos

Modelo e dados: Pedro Mantovani. Projeto-base: https://github.com/pedro-mantovani/calculadora_ENEM. A licença MIT original está incluída em `LICENSE`.
