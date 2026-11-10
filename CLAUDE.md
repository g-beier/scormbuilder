# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Aplicativo desktop (Tauri 2 + React 19 + TypeScript + Vite) para **construir pacotes SCORM 1.2** de forma amigável, para o Moodle do Campo Escola Virtual (CEV) dos Escoteiros do Brasil. O usuário escolhe tipos de slide (capa, cards, quiz, arrastar para ordenar, linha do tempo, "Confira", fim etc.), preenche formulários e o app gera o `js/data.js`, o `imsmanifest.xml` e o `.zip` pronto para o Moodle.

É um **builder**: cria SCORMs novos a partir de um projeto próprio, com um runtime próprio. O `~/Dev/ead-scorm` é fonte de conhecimento e de importação, não modelo a copiar. Plano de módulos (M0–M7): `~/.claude/plans/vamos-planejar-o-desenvolvimento-enumerated-trinket.md`. Idioma da interface e dos textos: português do Brasil.

## Comandos

```bash
npm install
npm run tauri dev        # app desktop com hot reload (Vite em localhost:1420)
npm run dev              # só o front no navegador (sem APIs do Tauri)
npm run build            # tsc + vite build (checagem de tipos do front)
npm run tauri build      # bundle de produção (.app/.dmg)
cd src-tauri && cargo check   # checagem do backend Rust
cd src-tauri && cargo test    # testes Rust
npm test                          # vitest (src/**/*.test.ts)
npx vitest run src/modelo/compilar.test.ts   # um arquivo
npx vitest run -t "nomePacote"               # um teste pelo nome
cd src-tauri && cargo clippy -- -D warnings
# runtime: converte os 18 LEITURA2 do ead-scorm, compara com o original (Playwright) e testa bloqueio/conclusão/retomada
node runtime/test/montar.mjs "$TMPDIR"cev-m0 && node runtime/test/comparar.mjs "$TMPDIR"cev-m0
node runtime/test/tipos-kit.mjs "$TMPDIR"cev-m6 && node runtime/test/categorizar.mjs "$TMPDIR"cev-m6 && node runtime/test/ramificado.mjs "$TMPDIR"cev-m6   # tipos do M6
node runtime/test/impressao.mjs "$TMPDIR"cev-m7 "$TMPDIR"cev-m0   # PDF da leitura (M7)
```

O teste de ouro em `src/modelo/importar.test.ts` lê `~/Dev/ead-scorm/*_LEITURA2/js/data.js`. Se a pasta não existir, ele é pulado.

## Estrutura

```
runtime/        motor que vai DENTRO de cada pacote: ES5, sem build, offline (index.html com {{TITULO}}, js/motor.js, js/scorm.js, css/tema.css, fonts/)
                ORIGEM.md registra de qual commit do ead-scorm veio; test/ não vai para o pacote
src/modelo/     TS puro: tipos do Projeto, fábrica, validar (mensagens pt-BR), compilar (Projeto → data.js v2), importar (data.js legado/v2 → Projeto)
src/servicos/   wrappers de invoke() (rascunhos.ts) e autosave com debounce (autosave.ts)
src/estado/, src/telas/, src/editor/, src/previa/   UI (store zustand+immer+zundo, Início, Editor, prévia)
src-tauri/src/  projetos.rs (rascunhos atômicos em <app_data>/rascunhos/<id>.json e arquivos .cevscorm), lib.rs (registro)
```

- Todo acesso a disco é feito por comandos Rust (`std::fs`). O webview não tem permissão `fs`, só `dialog` (open/save/confirm). A lógica Rust fica em funções `*_em(base: &Path, …)` testáveis. Os comandos só resolvem `app_data_dir`.
- A prévia e o pacote exportado usam **o mesmo** `runtime/`. Nunca duplique a lógica do motor no front.

### Projeto (`.cevscorm` / rascunho) ≠ `data.js`

O projeto (`src/modelo/tipos.ts`) é `{ formato: "cev-scorm-builder", versao: 1, id (uuid), meta: { curso, ud, atividade, numero, titulo, contexto }, slides, criadoEm, atualizadoEm, extras? }`. Slides e blocos têm ids curtos estáveis (`s-xxxxxxxx`, `b-xxxxxxxx`). Campos desconhecidos vindos de importação ficam em `extras` e nunca são descartados, mas também não vão para o pacote. `compilarDataJs` é determinístico. O nome do pacote vem de `nomePacote(meta)` = `CURSO_UD<n>_<ATIVIDADE><n>`, que também é o `CONTEUDO.id` e a chave de storage.

## Agentes (`.claude/agents/`)

| Agente | Responsável por |
|---|---|
| `scorm-engine` | `runtime/`: motor do pacote, novos tipos de bloco, SCORM 1.2 |
| `tauri-backend` | `src-tauri/`: comandos, disco, manifesto, zip, capabilities |
| `editor-frontend` | `src/`: editor, tipos TS do esquema, importar/serializar `data.js`, prévia |
| `scorm-qa` | verificação de pacotes (estrutura, navegador 1200/375px, conclusão); só reporta |
| `ux-a11y-reviewer` | revisão de acessibilidade, UX para não técnicos e textos pt-BR; só reporta |

Fluxo de um tipo novo: `scorm-engine` implementa no motor e documenta o contrato no esquema abaixo, depois `editor-frontend` + `tauri-backend` implementam, por fim `scorm-qa` + `ux-a11y-reviewer` verificam.

## Runtime v2 e formato `data.js` v2

O pacote gerado roda `runtime/js/motor.js`. Ele foi derivado do motor LEITURA2 do ead-scorm, e o DOM sai idêntico ao dos 18 pacotes originais.

```js
window.CONTEUDO = { formato: 2, id: "CTGESTAO_UD11_LEITURA2", contexto, titulo, slides: [
  { id, tipo: "capa", kicker, titulo, sub },
  { id, tipo: "conteudo", kicker, titulo, blocos: [ /* renderizados NA ORDEM do array */ ] },
  { id, tipo: "fim", titulo, texto } ] }            // exatamente uma "fim"
// blocos (todos com id único):
{ tipo: "texto", paras: [html] }        { tipo: "lista", itens: [html] }
{ tipo: "cards", colunas?: 2, cards: [{ cor: "navy"|"green"|"red"|"yellow", titulo?, breve?, paras?, lista? }] }
{ tipo: "ordenar", nome, passos: [html na ordem correta], porque, nota? }   // arrastar/setas + sugestão
{ tipo: "linha", itens: [{ titulo, texto }] }
{ tipo: "quiz", perguntas: [{ pergunta, opcoes: [html], correta, explica }] }
{ tipo: "contraste", itens: [{ cor, titulo, texto }] }
{ tipo: "destaque", html }              { tipo: "confira", botao, titulo, paras }   // modal; id do bloco = id do modal
{ tipo: "fonte", html }
{ tipo: "multipla", enunciado, opcoes: [{ texto, correta: bool, fb }], msgAcerto?, msgRevisar? }   // "Verificar respostas"
{ tipo: "reflexao", pergunta, aviso?, minChars? (10), maxChars? (500), opcional? (true) }   // envia via Scorm.gravarResposta
{ tipo: "escolha", pergunta, opcoes: [{ texto, retorno }] }                                    // sem gabarito
{ tipo: "categorizar", enunciado, categorias: [texto 2–4], itens: [{ texto, categoria: índice, fb }], msgAcerto?, msgRevisar? }   // "Verificar"
{ tipo: "ramificado", perguntas: [{ id, enunciado, alternativas: [{ texto, retorno, proxima: id da pergunta | "fim" }] }] }   // uma por vez; resumo + "Registrar respostas"
```

Escape: campos HTML e campos simples inseridos via innerHTML são escapados pelo compilador. Já os campos que o motor insere via **textContent** não são escapados: `quiz.explica`, `multipla.opcoes[].fb`, `msgAcerto`, `msgRevisar`, `reflexao.aviso`, `escolha.opcoes[].retorno`, `categorizar.itens[].fb`, `ramificado.perguntas[].alternativas[].retorno` e `contexto`. Os títulos de `categorizar.categorias` são texto simples e são escapados. Na reflexão, `aviso` ausente usa o texto padrão, e `""` deixa a reflexão sem aviso (o compilador omite o campo quando está vazio).

- `Motor.imprimir(conteudo, raiz)` (M7): a leitura numa página corrida para PDF, com a capa como cabeçalho, sem a tela de fim, os blocos interativos em versão para preencher (sem gabarito) e o Confira num anexo. Tipo novo pode trazer `imprimir(b, ctx)`.
- `Motor.iniciar(conteudo, { chave?, telaInicial?, livre? })`. `livre` é o modo autor: não bloqueia o "Próximo" e esconde o aviso, mas as pendências continuam contando. `telaInicial` tem prioridade sobre `lesson_location`. A chamada devolve `{ ir, tela, total, pendencias, pendenciaTela, concluido }`.
- Tipo novo de bloco: `Motor.bloco(tipo, { render(b, ctx), pendentes, aviso, falta: [sing, plural], estado, restaurar })`. Tipo desconhecido gera um aviso discreto, sem quebrar.
- Textos vão por `innerHTML`, então aceitam `<strong>`, `<em>` e `<a target='_blank' rel='noopener'>`.
- O "Próximo" fica bloqueado até o aluno responder os quizzes, abrir a sugestão de cada `ordenar` e abrir cada `confira`. A conclusão exige isso em todas as telas.
- `suspend_data` = `{"v":[telas visitadas],"b":{"<tela>.<bloco>":estado}}`. O estado é: quiz = índices escolhidos (`null` = não respondida); ordenar, confira e reflexao (enviada) = `1`; multipla = índices marcados na última verificação; escolha = índice; categorizar = categoria de cada item na última verificação; ramificado = `{"r":[alternativa de cada pergunta, -1 = sem resposta],"e":1 se registrado}`. O texto da reflexão nunca entra no suspend_data, só em `cmi.interactions` (o ramificado também grava lá uma interação por pergunta do caminho, `<id do bloco>-P<n>`). O limite do SCORM 1.2 é 4096 caracteres; o maior valor medido nos pacotes reais foi 133. Ao mudar esse formato, atualize `estimarSuspendData` em `src/modelo/validar.ts`.
- Diferente do motor antigo: o runtime **não** divide `ordenar` em várias telas (a importação de legado faz isso), e o progresso também é salvo em localStorage fora do LMS.
- Mudar o runtime exige rodar `runtime/test/` (comparação com o original) e atualizar o `runtime/ORIGEM.md`.

## Repositório de referência: `~/Dev/ead-scorm`

Fonte do visual aprovado e dos pacotes existentes (só leitura a partir daqui). Leia o `README.md`, o `.claude/CLAUDE.md` e o `.claude/docs/` de lá antes de mudar algo que afete o pacote gerado.

- **LEITURA2** (18 pacotes, ex.: `CTGESTAO_UD11_LEITURA2/`): a origem do runtime. O `data.js` legado tem blocos em ordem fixa (`paras`, `lista`, `cards`, `fluxos`, `linha`, `quiz`, `contraste`, `destaque`, `modais`, `fonte`) e é convertido por `src/modelo/importar.ts`.
- **QUIZ ramificado** (`CTGESTAO_UD11_QUIZ/`) e **Estudo de caso** (`MAPIJ_UD4_LEITURA3/`): usam o kit `base/scorm-kit` (`Kit.quiz` de múltipla seleção, `Kit.escolha`, `Kit.reflexao`). São a referência para os tipos novos do M6.

### Regras de exportação (espelhar o `build.py` do ead-scorm)

- Zip com `imsmanifest.xml` **na raiz**, sem pasta extra e sem arquivos ocultos (`.DS_Store`).
- Manifesto SCORM 1.2 (`schemaversion 1.2`, `adlcp:scormtype="sco"`, `href="index.html"`) listando **todos** os arquivos do pacote. Cada `<file href>` deve existir.
- Nome de pasta/pacote: `CURSO_UD<n>_<TIPO><n>`, maiúsculas, sem acento (cursos: `CTGESTAO`, `MAPIJ`).
- `node --check` no `data.js` gerado.

## Novos tipos de slide

O escopo inclui tipos que o motor ainda não tem (ex.: arrastar para categorias, reflexão). Um tipo novo precisa existir **no runtime do pacote** antes de existir no editor:
1. Registrar no runtime (`Motor.bloco` em `runtime/js/motor.js`, CSS em `runtime/css/tema.css`) seguindo o guia visual (`ead-scorm/.claude/docs/guia-visual-scorm.md`) e os princípios (`principios-scorm.md`): acessível por teclado, alvos de 44px, sem rolagem horizontal em 375px, cabe em ~666,5px de altura no iframe do Moodle, conta para a conclusão e é salvo no `suspend_data`.
2. Portar o comportamento do `Kit.*` (`ead-scorm/base/scorm-kit/js/kit.js`) quando o componente já existir lá (reflexão, quiz de múltipla seleção, escolha).
3. Só então adicionar o formulário, o tipo TS e a validação no editor.

Não mudar cores, fontes ou formas do visual aprovado pelo cliente (Poppins/Krona One, cantos arredondados, rodapé tricolor) sem pedido explícito.

## Vocabulário da interface (decidido com o usuário)

- No editor, um campo mal preenchido é **"a corrigir"** (ex.: "4 a corrigir", "11 a corrigir · 1 aviso"). Não use "pendência" para isso: no pacote, "pendência" é o que o aluno ainda não fez.
- Nomes dos blocos na interface: Texto (`texto`), Lista, Cartões, Ordenar passos, Linha do tempo, Perguntas (`quiz`), Comparação (`contraste`), Destaque, Confira, Fonte / referência (`fonte`). Os valores de `tipo` no `data.js` não mudam.
- A interface nunca mostra nomes de campo do `data.js` (`kicker`, `paras`, `html`).

## Cuidados de conteúdo

- Conteúdo jurídico (leis, artigos, regras) só da fonte oficial. Não completar de memória nem inventar URLs.
- Reflexões de alunos não podem conter dados de casos reais. Em proteção infantojuvenil, o foco é o fluxo de proteção, não os detalhes do caso.
- Não commitar sem pedido do usuário.
