# Origem do runtime

Extraído de `~/Dev/ead-scorm`, commit `b53fc4cd6785a9e61fe2616e391a13809366fdce`
(último commit que tocou `app.js`/`scorm.js`: `81ef8ccd97419db23ebea88290f7276345aa6bcf`).
Os arquivos usados como fonte estavam sem alterações locais naquele checkout.

| Arquivo | Fonte | Mudanças |
|---|---|---|
| `css/tema.css` | `CTGESTAO_UD18_LEITURA2/css/tema.css` | nenhuma (cópia exata) |
| `fonts/*` | `base/scorm-kit/fonts/` | nenhuma (woff2 + licenças OFL) |
| `js/scorm.js` | `base/scorm-kit/js/scorm.js` (igual ao `js/scorm.js` da UD18) | `Scorm.init(chave)`: a chave do localStorage passa a ser configurável (o padrão antigo `scorm_estudo_caso_protecao` só vale se nenhuma chave for passada) |
| `js/motor.js` | `CTGESTAO_UD18_LEITURA2/js/app.js` | refatorado no motor v2 (abaixo) |
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
