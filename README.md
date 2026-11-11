# SCORM Builder

Aplicativo desktop para **montar pacotes SCORM 1.2** de leituras e atividades do Moodle do **Campo Escola Virtual (CEV)** dos Escoteiros do Brasil, sem programar. Você escolhe as telas e os blocos, preenche formulários, confere na prévia e exporta o `.zip` pronto para o Moodle. Também gera o **PDF da leitura** para o aluno guardar como registro.

## Baixar e instalar

Os instaladores ficam em [Releases](https://github.com/g-beier/scormbuilder/releases).

- **Mac:** baixe o `.dmg` do seu processador (Apple Silicon = `aarch64`, Intel = `x64`) e arraste o app para Aplicativos. O app ainda não é assinado pela Apple: na primeira vez, abra com **clique direito → Abrir**, ou vá em **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**.
- **Windows:** baixe o `.msi` (recomendado: é o formato que a atualização automática usa) ou o `-setup.exe`. Se o SmartScreen avisar, clique em **Mais informações → Executar assim mesmo**.

### Atualização automática

O app avisa quando há uma versão nova. Ao abrir a tela inicial, ele confere em silêncio (sem internet, nada acontece) e, se houver novidade, mostra **"Nova versão X disponível"** com **Atualizar agora** e **Agora não**. A atualização só é oferecida na tela inicial, com os rascunhos já salvos: depois do download, clique em **Reiniciar para concluir** (no Windows o instalador fecha e reabre o app sozinho). Para conferir na hora, use **Procurar atualizações**, no alto da tela inicial.

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

O CI (`.github/workflows/ci.yml`) roda a cada push em `main`/`feat/**` e em PRs para `main`: testes e build do front com a verificação de segurança no navegador, `cargo clippy` e `cargo test`, e os testes do motor que usam só as fixtures de `runtime/test/`.

Detalhes de arquitetura, formato do `data.js` e convenções do projeto: [`CLAUDE.md`](CLAUDE.md). Origem e mudanças do motor do pacote: [`runtime/ORIGEM.md`](runtime/ORIGEM.md).

### Lançar uma versão

1. Atualize a versão em `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.
2. Crie e envie a tag: `git tag v0.1.1 && git push origin v0.1.1`.
3. O GitHub Actions (`.github/workflows/release.yml`) gera os instaladores de Mac e Windows num **rascunho** de Release, com os arquivos da atualização automática (`.app.tar.gz`, `.sig` e um único `latest.json` com `darwin-aarch64`, `darwin-x86_64` e `windows-x86_64`). O job "conferir-latest-json" falha se faltar alguma plataforma.
4. Confira e **publique** o rascunho. Só um release publicado (e não marcado como pré-lançamento) vale como `releases/latest`: enquanto for rascunho, os apps instalados não veem a versão nova.

**Chave da atualização.** Os pacotes de atualização são assinados com a chave do Tauri (independe da assinatura de código da Apple/Microsoft). A chave privada fica em `~/.tauri/scormbuilder.key` no Mac de quem lança as versões, a senha no Porta-chaves do macOS (item "scormbuilder-tauri-updater-key"), e as duas estão nos segredos do repositório (`TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). A chave pública está em `plugins.updater.pubkey` do `src-tauri/tauri.conf.json`. Guarde uma cópia de segurança da chave e da senha: **se a chave se perder, os apps já instalados não aceitam mais atualizações** e cada pessoa terá de baixar e instalar a versão nova à mão.

Para gerar os `.sig` localmente (teste):

```bash
TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/scormbuilder.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s scormbuilder-tauri-updater-key -w)" \
npm run tauri build -- --bundles app
```

## Licença

O código é distribuído sob a [licença MIT](LICENSE) (Copyright (c) 2026 Gustav Eckard Gorniski Beier). O motor que vai dentro de cada pacote exportado (`motor.js`, `scorm.js`, `tema.css`) leva um cabeçalho com o aviso da licença.

## Fontes e licenças

As fontes Poppins e Krona One são distribuídas sob a SIL Open Font License (ver `runtime/fonts/` e `src-tauri/fonts/`).
