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
