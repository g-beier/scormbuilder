# Origem do runtime

Extraído de `~/Dev/ead-scorm`, commit `b53fc4cd6785a9e61fe2616e391a13809366fdce`
(último commit que tocou `app.js`/`scorm.js`: `81ef8ccd97419db23ebea88290f7276345aa6bcf`).
Os arquivos usados como fonte estavam sem alterações locais naquele checkout.

| Arquivo | Fonte | Mudanças |
|---|---|---|
| `css/tema.css` | `CTGESTAO_UD18_LEITURA2/css/tema.css` | cópia exata até a linha do `.source a`; depois dela, só regras novas dos blocos do kit (M6), vindas de `base/scorm-kit/css/kit.css` |
| `fonts/*` | `base/scorm-kit/fonts/` | nenhuma (woff2 + licenças OFL) |
| `js/scorm.js` | `base/scorm-kit/js/scorm.js` (igual ao `js/scorm.js` da UD18) | `Scorm.init(chave)`: a chave do localStorage passa a ser configurável (o padrão antigo `scorm_estudo_caso_protecao` só vale se nenhuma chave for passada) |
| `js/motor.js` | `CTGESTAO_UD18_LEITURA2/js/app.js` + `base/scorm-kit/js/kit.js` (`quiz`, `reflexao`, `escolha`) | refatorado no motor v2 (abaixo) |
| `index.html` | `CTGESTAO_UD18_LEITURA2/index.html` | `{{TITULO}}` no `<title>` e no `h1.topo-h1`; carrega `js/motor.js` e chama `Motor.iniciar(window.CONTEUDO)` |

## O que mudou do `app.js` para o `motor.js`

- Lê o conteúdo no **formato 2** (`formato: 2`, `id`, `slides[].blocos[]`), passado a `Motor.iniciar(conteudo, opcoes)`, em vez de ler `window.CONTEUDO` sozinho ao carregar.
- Os blocos são renderizados **na ordem do array** e cada tipo é um registro em `Motor.bloco(tipo, def)` com os ganchos `render`, `pendentes`, `aviso`, `falta`, `estado`, `restaurar`.
- O `expandirFluxos` saiu do motor: cada bloco `ordenar` é independente e o autor decide as telas.
- O aviso de pendência continua no fim da tela, antes dos blocos `fonte` finais.
- Opções: `chave` (localStorage; padrão `conteudo.id`), `telaInicial` (sobrepõe `lesson_location`) e `livre` (modo autor: "Próximo" nunca bloqueia e o aviso some; as pendências continuam contando para a conclusão).
- Fora do LMS, o progresso agora é gravado no localStorage (o `app.js` só gravava com LMS conectado).
- `suspend_data` novo e compacto: `{"v":[telas vistas],"b":{"<tela>.<bloco>":estado}}`.
- Validação: sem tela `fim`, com mais de uma ou com formato diferente de 2, mostra uma mensagem de erro na tela. Tipo de bloco desconhecido vira um aviso discreto (`p.nota`).
- Todo o resto (bloqueio, pendências, texto do fim, aviso de rolagem, teclado/toque/swipe, modais, embaralhar, arrastar) é o mesmo código.
- `ordenar`: o `aria-label` da lista usa o texto visível do `.flow-name` já renderizado (o `nome` chega escapado como HTML no `data.js`; antes as entidades, como `&amp;`, iam literais para o rótulo).

## Blocos do kit (M6, parte 1)

Portados de `base/scorm-kit/js/kit.js` (`Kit.quiz`, `Kit.reflexao`, `Kit.escolha`) e do visual de `base/scorm-kit/css/kit.css` (`.opcao`, `.fb`, `.resultado`, `.card.pergunta`, `textarea`, `.aviso-refl`, `.enviada`), com os tokens do `tema.css`. Uso real de referência: `MAPIJ_UD4_LEITURA3/` e `CTGESTAO_UD11_QUIZ/`.

- `multipla`: checkboxes nativos; "Verificar respostas" mostra o retorno por alternativa e o resultado geral; "Tentar de novo" reabilita. Diferenças do kit: os botões usam `.btn-act` (o mesmo visual do `.btn` do kit); o foco vai para "Tentar de novo" depois de verificar e volta para "Verificar" ao refazer; alternativa correta marcada com `fb` vazio não mostra retorno.
- `reflexao`: igual ao kit (contador, mínimo sem contar espaços, `Scorm.gravarResposta(id do bloco, texto)`, partes de 250, não editável depois de enviada). Diferenças: o contador mostra "· mínimo de N caracteres" enquanto o mínimo não foi atingido; o campo é nomeado pela pergunta + rótulo (`aria-labelledby`) e descrito pelo contador e pelo aviso; depois do envio o foco vai para a mensagem de status. Na retomada mostra só "✓ Reflexão enviada…" (o texto não é guardado no `suspend_data`).
- `escolha`: rádios nativos num `role="radiogroup"`, retorno num card "Retorno" (`.card.pergunta`), troca livre. O `nome` do grupo é gerado pelo motor.
- Motor: as setas ←/→ (e PageUp/PageDown) não trocam de tela quando o foco está num `input`, `textarea` ou `select`, e o gesto de deslizar não começa dentro de um `textarea`. Os 18 pacotes LEITURA2 não têm campos de formulário, então nada muda para eles.
- `css/tema.css`: `.btn-act[disabled]` ganhou estilo de desabilitado (o kit tinha `.btn[disabled]`); nenhum pacote antigo tem `.btn-act` desabilitado.

Teste: `node runtime/test/tipos-kit.mjs "$TMPDIR"cev-m6` monta um pacote com a fixture `test/fixtures/kit-v2.data.js` e roda tudo dentro de um iframe de 666px com uma API SCORM 1.2 simulada no pai (1200x666 e 375x666; modo livre com localStorage; falha de gravação). Rodar junto com `montar.mjs` + `comparar.mjs`.

## Classificar em categorias (M6, parte 2)

Tipo novo, sem equivalente no kit nem nos pacotes do ead-scorm. Visual montado com os tokens e peças já aprovados (`.bloco-q`, `.btn-act`, `.resultado`, `.fb`, borda superior colorida com as 4 cores do tema).

- `categorizar`: itens (`button.cat-item`, `aria-pressed`) começam numa bandeja e vão para as categorias (`.cat-zona`, até 4, empilhadas abaixo de 520px). Três formas de mover: arrastar com o ponteiro (com rolagem automática do `#stage` perto da borda); tocar no item e depois no título da categoria (`button.cat-alvo`, ativo só com um item selecionado); ou teclado (Tab, Enter/Espaço no item, Tab até a categoria, Enter; Escape cancela). Cada movimento é anunciado numa região `aria-live` escondida (limpa antes de escrever, para repetir frases iguais). Os itens aparecem embaralhados. Enter/Espaço num item leva o foco à primeira categoria e, enquanto houver seleção, os outros itens saem da ordem de Tab; depois de colocar, o foco fica no item movido; Escape devolve o foco ao item.
- "Verificar" exige todos os itens colocados; pinta cada item de verde/vermelho e escreve "Certo." ou "Errado. O lugar dele é “<categoria>”." antes do `fb` (o resultado não depende só da cor), e mostra o resumo com "(n de m no lugar certo.)". Itens verificados ficam com `aria-disabled` (continuam no Tab, com o retorno em `aria-describedby`). "Tentar de novo" mantém as posições e destrava. Os listeners de arrasto no `document` só existem durante o arrasto. Pendência: verificar uma vez.
- `suspend_data`: a categoria de cada item na última verificação, na ordem do `data.js` (ex.: `[0,1,1,0]`). Estado com tamanho ou índice inválido é ignorado.
- Motor: o gesto de deslizar não começa sobre um `.cat-item`.
- Motor: dentro de um `.ramificado`, as setas ←/→ e o gesto de deslizar não trocam de tela (o foco fica no enunciado entre as perguntas).

Teste: `node runtime/test/categorizar.mjs "$TMPDIR"cev-m6` (fixture `test/fixtures/categorizar-v2.data.js`; 1200x666 e 375x666; clique, teclado, arrastar com rolagem, verificação, retomada, estado inválido, conclusão). O `comparar.mjs` passou a usar `tipo-inexistente` como exemplo de tipo desconhecido e espera 200 ms (em vez de 30) pelo `toggle` do `<details>`, que falhava de forma intermitente.

## Questionário com caminhos (M6, parte 3)

Portado do `CTGESTAO_UD11_QUIZ/js/app.js` (caminho pelas respostas, `proxima` por alternativa, resumo e registro), como **bloco** dentro de uma tela de conteúdo, não como tela especial: assim ele usa a navegação, o bloqueio do "Próximo" e a conclusão do motor sem mudar nada no núcleo.

- `ramificado`: mostra uma pergunta por vez ("Pergunta n", rádios `.opcao` num `radiogroup`, retorno no card "Retorno" igual ao da `escolha`). "Próxima pergunta" segue a `proxima` da alternativa escolhida (vira "Ver resumo" quando é `"fim"`); "Voltar" refaz o caminho percorrido. O foco vai para o enunciado de cada pergunta e para o título do resumo.
- Diferenças do UD11: `proxima` é o **id** da pergunta (não o número), para que reordenar perguntas no editor não quebre os caminhos; o resumo lista só as perguntas do caminho, com o número original; não há menu lateral nem a "situação registrada" específica da UD11; a interação gravada é `<id do bloco>-P<n>` com "Pergunta n: <enunciado> → <alternativa>" (texto puro), para o relatório do Moodle fazer sentido sozinho; o número "Pergunta n" fica dentro do enunciado focado; sem resposta, aparece "Escolha uma alternativa para continuar."; o título "Retorno" do card é um `p`, não `h3`, por estar numa região `aria-live`.
- Pendência: registrar uma vez (exige o caminho completo). Depois de registrado, as alternativas ficam travadas e o resumo mostra "✓ Respostas registradas.". Se a gravação falhar, aparece a mesma mensagem da reflexão e nada é perdido.
- Retomada: volta para a primeira pergunta sem resposta do caminho, ou para o resumo. Um destino inválido ou um ciclo encerram o caminho em vez de travar (o editor impede os dois).

Teste: `node runtime/test/ramificado.mjs "$TMPDIR"cev-m6` (fixture `test/fixtures/ramificado-v2.data.js`).

## Impressão / PDF da leitura (M7)

Sem equivalente no ead-scorm. `Motor.imprimir(conteudo, raiz)` monta a leitura inteira numa página corrida (classe `.impressao` em `<html>` e `<body>`), para o aluno salvar em PDF e guardar como registro. O pacote SCORM não muda: o modo só é usado pela janela de impressão do app.

- A **capa** vira o cabeçalho (contexto, rótulo, título, subtítulo) com campos "Nome" e "Data". A **tela de fim** não entra.
- Blocos passivos usam o próprio `render`. Os interativos têm versão para preencher à mão, **sem gabarito nem retornos**:
  - `quiz`, `multipla` e `escolha`: alternativas com caixas para marcar.
  - `ordenar`: passos embaralhados com espaço para numerar, mais a nota.
  - `reflexao`: linhas em branco (mais linhas quanto maior o `maxChars`) e o aviso sobre dados (o padrão do pacote fala do envio; no papel fica só o cuidado com nomes e casos).
  - `categorizar`: tabela de itens × categorias.
  - `ramificado`: roteiro com "→ vá para a pergunta N" em cada alternativa.
  - `confira`: vai para um anexo "Para conferir" no fim (nova página), porque costuma trazer as respostas; na tela fica a referência ao item do anexo.
- Tipo novo de bloco: pode registrar `imprimir(b, ctx)` em `Motor.bloco`. Bloco com pendência e sem `imprimir` vira um aviso discreto no documento.
- CSS no fim do `tema.css`: `@page` A4, cores exatas na impressão, quebras de página que mantêm perguntas e linhas inteiras, links com a URL visível no papel.

Teste: `node runtime/test/impressao.mjs "$TMPDIR"cev-m7 "$TMPDIR"cev-m0` (fixtures do M6 e, se existir a pasta do `montar.mjs`, os 18 LEITURA2): gera um PDF A4 de cada e confere cabeçalho, ausência da tela de fim, de controles e de gabarito, e o anexo do Confira.
