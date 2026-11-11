/**
 * Atualização automática do app (plugin updater do Tauri).
 *
 * A checagem, o download e a conferência da assinatura rodam no Rust; o front
 * só pergunta, mostra o progresso e reinicia. Tudo isso só é oferecido na tela
 * Início, sem projeto aberto, e o salvamento automático é concluído antes de
 * instalar e antes de reiniciar.
 */
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { emTauri } from "./ambiente";
import { salvarAgora, useProjeto } from "../estado/projeto";

export interface AtualizacaoDisponivel {
  versao: string;
  /** Versão instalada agora. */
  atual: string;
  /** Referência ao pacote no Rust, usada para baixar e instalar. */
  pacote: Update;
}

/** Progresso do download: `fracao` de 0 a 1, ou `null` se o tamanho não é conhecido. */
export type AoProgresso = (fracao: number | null) => void;

/** Procura uma versão nova. `null` = já está na mais recente (ou fora do app). Erros de rede propagam. */
export async function procurarAtualizacao(): Promise<AtualizacaoDisponivel | null> {
  if (!emTauri()) return null;
  const pacote = await check({ timeout: 15000 });
  if (!pacote) return null;
  return { versao: pacote.version, atual: pacote.currentVersion, pacote };
}

/** Garante que nada do projeto se perde: salva o pendente e exige estar fora do editor. */
async function garantirSemProjetoAberto() {
  await salvarAgora();
  if (useProjeto.getState().projeto) {
    throw new Error("Feche o projeto e volte ao Início para atualizar.");
  }
}

/**
 * Baixa e instala. No Windows o instalador fecha e reabre o app sozinho;
 * no Mac a nova versão vale depois de `reiniciar()`.
 */
export async function baixarEInstalar(a: AtualizacaoDisponivel, aoProgresso: AoProgresso): Promise<void> {
  await garantirSemProjetoAberto();
  let total: number | undefined;
  let baixado = 0;
  await a.pacote.downloadAndInstall((ev: DownloadEvent) => {
    switch (ev.event) {
      case "Started":
        total = ev.data.contentLength || undefined;
        aoProgresso(total ? 0 : null);
        break;
      case "Progress":
        baixado += ev.data.chunkLength;
        aoProgresso(total ? Math.min(1, baixado / total) : null);
        break;
      case "Finished":
        aoProgresso(1);
        break;
    }
  });
}

/** Reinicia o app para concluir a atualização (depois de salvar o que estiver pendente). */
export async function reiniciar(): Promise<void> {
  await garantirSemProjetoAberto();
  await relaunch();
}
