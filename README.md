# Meu ENEM

## Sobre o projeto
Esse é o repositório com os códigos públicos do site [pedro-mantovani.github.io/site_calculadora_ENEM/](https://pedro-mantovani.github.io/site_calculadora_ENEM/), ele foi feito inteiramente por inteligências artificiais (Claude, Gemini e ChatGPT) com base no trabalho disponível em https://github.com/pedro-mantovani/calculadora_ENEM. Nele é possível ver o código bruto em Python, explicações sobre o cálculo da nota e os testes realizados indicando erro praticamente nulo de cálculo.

Apesar de ter sido feito totalmente por IA seus dados estão seguros, pois todos os cálculos são feitos localmente. Apenas o tráfico do site é monitorado a fim de medir o impacto do projeto.

Projeto sem fins lucrativos, seu uso é livre, gratuito e sem anúnicos, o objetivo é ajudar os estudantes.

Melhorias são sempre bem-vindas.

## Organização do código

- `index.html`: calculadora; as outras páginas apresentam a TRI, o projeto e o contato.
- `style.css`: estilos responsivos, componentes e paleta escura.
- `theme.js`: preferência de tema, aplicada antes da primeira renderização. Sem preferência salva, acompanha o sistema.
- `script.js`: seleção da prova, cálculo TRI, cartão-resposta e persistência.
- `ui-helpers.js`: explicação acessível da precisão e ordenação/filtros dos impactos.
- `report.js`: geração local do relatório PDF.
- `pdf-fonts.js`: fontes incorporadas e sua licença, separadas do código de comportamento.
- `dados/`: itens e catálogo das provas.

Sirva a pasta por HTTP (por exemplo, `python3 -m http.server 8765`) e abra `http://localhost:8765`. Não há etapa de compilação. A chave antiga do progresso foi mantida para preservar cartões já salvos.

O impacto continua sendo **nota atual menos nota com a resposta invertida**. Ordenar ou filtrar altera apenas a exibição; a nota e os relatórios usam o cartão completo. Na mesclagem, marcadores de branco substituem a resposta daquela posição. Listas numeradas usam seus próprios destinos.

Verificação da lógica de importação, filtros e relatório: `node --test tests/calculator.test.cjs`.

## Logo compartilhada

Edite apenas `favicon.svg` para trocar o ícone. Cabeçalhos, rodapés e a aba do navegador referenciam esse arquivo. O gerador de PDF lê a mesma URL declarada no favicon da página a cada exportação e incorpora a imagem com transparência, sem manter uma cópia do desenho no código. Sirva o site por HTTP para permitir o carregamento dos dados e da logo. Depois de publicar, recarregue a página para atualizar imagens eventualmente armazenadas em cache.
