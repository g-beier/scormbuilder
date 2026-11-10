# SCORM Builder

Aplicativo desktop para **montar pacotes SCORM 1.2** de leituras e atividades do Moodle do **Campo Escola Virtual (CEV)** dos Escoteiros do Brasil, sem programar. Você escolhe as telas e os blocos, preenche formulários, confere na prévia e exporta o `.zip` pronto para o Moodle. Também gera o **PDF da leitura** para o aluno guardar como registro.

## Baixar e instalar

Os instaladores ficam em [Releases](https://github.com/g-beier/scormbuilder/releases).

- **Mac:** baixe o `.dmg` do seu processador (Apple Silicon = `aarch64`, Intel = `x64`) e arraste o app para Aplicativos. O app ainda não é assinado pela Apple: na primeira vez, abra com **clique direito → Abrir**, ou vá em **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**.
- **Windows:** baixe o `.msi` ou o `-setup.exe`. Se o SmartScreen avisar, clique em **Mais informações → Executar assim mesmo**.

## O que a versão 0.1.0 faz

- **Projetos:** criar do zero, abrir rascunhos (salvos automaticamente), salvar como `.cevscorm` e importar um `data.js` de pacotes existentes (LEITURA2 do ead-scorm).
- **Telas:** capa, conteúdo e fim, numa faixa de cards que dá para reordenar (arrastando ou com Alt + setas).
- **Blocos:** Texto, Lista, Cartões, Ordenar passos, Linha do tempo, Perguntas, Comparação, Destaque, Confira, Fonte, Múltipla escolha, Reflexão, Escolha com retorno, Classificar em categorias e Questionário com caminhos.
- **Conferência:** itens "a corrigir" com atalho para o campo, desfazer/refazer.
- **Prévia ao vivo:** o mesmo motor do pacote, em computador ou celular, no modo autor (navegação livre) ou modo aluno, com a simulação do Moodle (situação, progresso salvo, interações).
- **Exportar:** `.zip` para o Moodle, pasta, ou **PDF da leitura**: acessível (PDF/UA-1, marcado para leitores de tela), com as atividades para preencher à mão, sem as respostas.

## Desenvolvimento

Requisitos: Node 22+, Rust estável e os [pré-requisitos do Tauri 2](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # app com recarga automática
npm test               # testes do front (vitest)
cd src-tauri && cargo test && cargo clippy -- -D warnings
npm run tauri build    # instalador local
```

Detalhes de arquitetura, formato do `data.js` e convenções do projeto: [`CLAUDE.md`](CLAUDE.md). Origem e mudanças do motor do pacote: [`runtime/ORIGEM.md`](runtime/ORIGEM.md).

### Lançar uma versão

1. Atualize a versão em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.
2. Crie e envie a tag: `git tag v0.1.1 && git push origin v0.1.1`.
3. O GitHub Actions (`.github/workflows/release.yml`) gera os instaladores de Mac e Windows num **rascunho** de Release. Confira e publique.

## Fontes e licenças

As fontes Poppins e Krona One são distribuídas sob a SIL Open Font License (ver `runtime/fonts/` e `src-tauri/fonts/`).
