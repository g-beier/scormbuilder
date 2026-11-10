# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Aplicativo desktop (Tauri 2 + React 19 + TypeScript + Vite) para **construir pacotes SCORM 1.2** de forma amigável, para o Moodle do Campo Escola Virtual (CEV) dos Escoteiros do Brasil. O usuário escolhe tipos de slide (capa, cards, quiz, arrastar para ordenar, linha do tempo, "Confira", fim etc.), preenche formulários e o app gera o `js/data.js`, o `imsmanifest.xml` e o `.zip` pronto para o Moodle.

Estado: scaffold do `create-tauri-app` (template `react-ts`); o editor ainda não foi escrito. Idioma da interface e dos textos: português do Brasil.

## Comandos

```bash
npm install
npm run tauri dev        # app desktop com hot reload (Vite em localhost:1420)
npm run dev              # só o front no navegador (sem APIs do Tauri)
npm run build            # tsc + vite build (checagem de tipos do front)
npm run tauri build      # bundle de produção (.app/.dmg)
cd src-tauri && cargo check   # checagem do backend Rust
cd src-tauri && cargo test    # testes Rust
```

Não há test runner JS configurado ainda.

## Estrutura

- `src/`: front React (editor, prévia, formulários).
- `src-tauri/`: backend Rust (`src/lib.rs` registra os comandos `#[tauri::command]`; `tauri.conf.json` define janela, bundle e CSP). Use o backend para acesso a disco e geração do zip, não o front.

## Agentes (`.claude/agents/`)

| Agente | Responsável por |
|---|---|
| `scorm-engine` | runtime do pacote (motor LEITURA2, kit, novos tipos de slide) em `~/Dev/ead-scorm` |
| `tauri-backend` | `src-tauri/`: comandos, disco, manifesto, zip, capabilities |
| `editor-frontend` | `src/`: editor, tipos TS do esquema, importar/serializar `data.js`, prévia |
| `scorm-qa` | verificação de pacotes (estrutura, navegador 1200/375px, conclusão); só reporta |
| `ux-a11y-reviewer` | revisão de acessibilidade, UX para não técnicos e textos pt-BR; só reporta |

Fluxo de um tipo novo: `scorm-engine` implementa no motor e documenta o contrato no esquema abaixo, depois `editor-frontend` + `tauri-backend` implementam, por fim `scorm-qa` + `ux-a11y-reviewer` verificam.

## Repositório de referência: `~/Dev/ead-scorm`

Fonte da verdade dos modelos SCORM. Leia o `README.md`, o `.claude/CLAUDE.md` e o `.claude/docs/` de lá antes de mudar algo que afete o pacote gerado. O pacote gerado precisa ficar idêntico ao que é feito à mão lá.

Há três modelos:

1. **LEITURA2** (ex.: `CTGESTAO_UD11_LEITURA2/`, 18 pacotes): motor genérico de slides. `js/app.js` + `css/tema.css` + `js/scorm.js` + `fonts/` são iguais entre os pacotes (UD1–3 têm uma versão um pouco mais antiga; use a da UD4+). **Todo o conteúdo fica em `js/data.js`.** É o alvo principal do construtor.
2. **QUIZ ramificado** (`CTGESTAO_UD11_QUIZ/`): questionário sem nota em que cada alternativa aponta a `proxima` pergunta (número ou `"fim"`). Usa o kit `base/scorm-kit` (`Kit.*`, `kit.css`, `moodle.js`).
3. **Estudo de caso** (`MAPIJ_UD4_LEITURA3/`): pacote sob medida com o kit (`Kit.quiz` de múltipla seleção, reflexão enviada ao LMS, variações). O `data.js` tem estrutura livre.

### Esquema do `data.js` do LEITURA2

```js
window.CONTEUDO = {
  contexto: "Curso … · UD n – …",          // eyebrow do cabeçalho
  slides: [
    { tipo: "capa", kicker, titulo, sub },
    { /* slide de conteúdo: todos os blocos são opcionais e renderizados nesta ordem */
      kicker, titulo,
      paras: [html],
      lista: [html],
      cards: [{ cor: "navy"|"green"|"red"|"yellow", titulo, breve, paras, lista }], colunas: 2,
      fluxos: [{ nome, passos: [ordem correta], porque, nota }],   // arrastar para ordenar
      linha: [{ titulo, texto }],                                // linha do tempo
      quiz: [{ pergunta, opcoes: [html], correta: índice, explica }],
      contraste: [{ cor, titulo, texto }],
      destaque: html,                                            // callout
      modais: [{ id único, botao, titulo, paras }],              // "Confira" / saiba mais
      fonte: html },
    { tipo: "fim", titulo, texto }                               // obrigatório: o motor procura [data-fim]
  ]
};
```

Comportamentos do motor que o editor precisa refletir na prévia e na validação:
- Os textos são inseridos com `innerHTML`, então aceitam `<strong>`, `<a href target='_blank' rel='noopener'>` etc.
- Um slide com 2 ou mais `fluxos` vira uma tela por fluxo ("· k de n"). `paras` só aparece na primeira tela; `contraste`, `destaque` e `fonte`, só na última.
- O botão "Próximo" fica bloqueado até o aluno responder os quizzes, abrir a sugestão de cada fluxo e abrir os modais da tela. A conclusão SCORM exige tudo isso em todas as telas.
- O estado vai para `cmi.suspend_data` (limite de 4096 caracteres no SCORM 1.2). Por isso, pacotes muito grandes podem estourar.
- `index.html` tem o título fixo no `<h1 class="topo-h1">` e no `<title>`. O manifesto também repete o título.

### Regras de exportação (espelhar o `build.py` do ead-scorm)

- Zip com `imsmanifest.xml` **na raiz**, sem pasta extra e sem arquivos ocultos (`.DS_Store`).
- Manifesto SCORM 1.2 (`schemaversion 1.2`, `adlcp:scormtype="sco"`, `href="index.html"`) listando **todos** os arquivos do pacote. Cada `<file href>` deve existir.
- Nome de pasta/pacote: `CURSO_UD<n>_<TIPO><n>`, maiúsculas, sem acento (cursos: `CTGESTAO`, `MAPIJ`).
- `node --check` no `data.js` gerado.

## Novos tipos de slide

O escopo inclui tipos que o motor ainda não tem (ex.: arrastar para categorias, reflexão). Um tipo novo precisa existir **no runtime do pacote** antes de existir no editor:
1. Implementar no motor (app.js/tema.css) seguindo o guia visual (`ead-scorm/.claude/docs/guia-visual-scorm.md`) e os princípios (`principios-scorm.md`): acessível por teclado, alvos de 44px, sem rolagem horizontal em 375px, cabe em ~666,5px de altura no iframe do Moodle, conta para a conclusão e é salvo no `suspend_data`.
2. Reaproveitar o `Kit.*` de `base/scorm-kit` quando o componente já existir lá (reflexão, quiz de múltipla seleção). No ead-scorm, mudanças no kit são feitas em `base/` e depois copiadas.
3. Só então adicionar o formulário, o tipo TS e a validação no editor.

Não mudar cores, fontes ou formas do visual aprovado pelo cliente (Poppins/Krona One, cantos arredondados, rodapé tricolor) sem pedido explícito.

## Cuidados de conteúdo

- Conteúdo jurídico (leis, artigos, regras) só da fonte oficial. Não completar de memória nem inventar URLs.
- Reflexões de alunos não podem conter dados de casos reais. Em proteção infantojuvenil, o foco é o fluxo de proteção, não os detalhes do caso.
- Não commitar sem pedido do usuário.
