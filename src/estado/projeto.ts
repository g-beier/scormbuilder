/**
 * Store do projeto aberto (zustand + immer + zundo).
 *
 * - `projeto` é a única parte do estado que entra no histórico de desfazer
 *   (limite de 100 passos). Seleção e estado do salvamento ficam de fora.
 * - Edições de texto passam um `grupo` (ex. "s-1/b-2/paras[0]"): digitações
 *   seguidas no mesmo campo, com menos de JANELA_GRUPO_MS entre elas, viram
 *   um único passo de desfazer, em vez de um passo por tecla.
 * - Toda ação que muda o projeto atualiza `atualizadoEm`.
 * - O salvamento automático (ver `ligarAutosave`) observa `projeto` e agenda
 *   `salvarRascunho` a cada mudança, inclusive desfazer/refazer.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { Draft } from "immer";
import { duplicarBloco, duplicarSlide, novoBloco, novoSlide } from "../modelo/fabrica";
import type { Bloco, Meta, Projeto, Slide, SlideConteudo, TipoBloco, TipoSlide } from "../modelo/tipos";
import { criarAutosave, type Autosave, type EstadoAutosave } from "../servicos/autosave";

export const LIMITE_DESFAZER = 100;
export const JANELA_GRUPO_MS = 1000;

/** Campos simples de tela (cada tipo usa só os seus). */
export type CamposSlide = Partial<{ kicker: string; titulo: string; sub: string; texto: string }>;

export interface EstadoProjeto {
  projeto: Projeto | null;
  slideSelecionadoId: string | null;
  blocoSelecionadoId: string | null;

  /** Abre um projeto (zera o histórico de desfazer). */
  abrir(projeto: Projeto): void;
  fechar(): void;
  selecionarSlide(id: string | null): void;
  selecionarBloco(slideId: string, blocoId: string | null): void;

  atualizarMeta(parcial: Partial<Meta>, grupo?: string): void;

  /** Adiciona uma tela e a seleciona. Sem `indice`: conteúdo entra antes do fim, capa no início, fim no final. */
  adicionarSlide(tipo?: TipoSlide, indice?: number): string;
  duplicarSlide(id: string): string | null;
  excluirSlide(id: string): void;
  moverSlide(de: number, para: number): void;
  /** Muda campos simples da tela (kicker, título…). */
  atualizarSlide(id: string, parcial: CamposSlide, grupo?: string): void;

  adicionarBloco(slideId: string, tipo: TipoBloco, indice?: number): string | null;
  duplicarBloco(slideId: string, blocoId: string): string | null;
  excluirBloco(slideId: string, blocoId: string): void;
  moverBloco(slideId: string, de: number, para: number): void;
  /** Edita um bloco com uma receita immer (listas internas, campos aninhados). */
  editarBloco<B extends Bloco = Bloco>(
    slideId: string,
    blocoId: string,
    receita: (rascunho: Draft<B>) => void,
    grupo?: string,
  ): void;
}

// ---------- Agrupamento de passos de desfazer ----------

let grupoAtual: string | undefined;
let ultimoGrupo: string | undefined;
let ultimoTempo = 0;
/** Relógio injetável nos testes. */
let relogio: () => number = () => Date.now();

export function _definirRelogio(fn: () => number) {
  relogio = fn;
}

function reiniciarGrupo() {
  ultimoGrupo = undefined;
  ultimoTempo = 0;
}

// ---------- Utilitários ----------

function mover<T>(lista: T[], de: number, para: number) {
  if (de === para || de < 0 || de >= lista.length || para < 0 || para >= lista.length) return;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item);
}

function acharSlide(p: Draft<Projeto>, id: string) {
  return p.slides.find((s) => s.id === id);
}

function acharConteudo(p: Draft<Projeto>, id: string): Draft<SlideConteudo> | undefined {
  const s = acharSlide(p, id);
  return s && s.tipo === "conteudo" ? s : undefined;
}

function indicePadrao(slides: readonly Slide[], tipo: TipoSlide): number {
  if (tipo === "capa") return 0;
  if (tipo === "fim") return slides.length;
  const ultimo = slides[slides.length - 1];
  return ultimo?.tipo === "fim" ? slides.length - 1 : slides.length;
}

// ---------- Store ----------

export const useProjeto = create<EstadoProjeto>()(
  temporal(
    immer((set, get) => {
      /** Muda o projeto (se houver), marca `atualizadoEm` e registra o grupo do passo. */
      function mudar(receita: (p: Draft<Projeto>) => void, grupo?: string) {
        if (!get().projeto) return;
        grupoAtual = grupo;
        try {
          set((st) => {
            if (!st.projeto) return;
            receita(st.projeto);
            st.projeto.atualizadoEm = new Date(relogio()).toISOString();
          });
        } finally {
          grupoAtual = undefined;
        }
      }

      return {
        projeto: null,
        slideSelecionadoId: null,
        blocoSelecionadoId: null,

        abrir(projeto) {
          set((st) => {
            st.projeto = projeto;
            st.slideSelecionadoId = projeto.slides[0]?.id ?? null;
            st.blocoSelecionadoId = null;
          });
          useProjeto.temporal.getState().clear();
          reiniciarGrupo();
        },

        fechar() {
          set((st) => {
            st.projeto = null;
            st.slideSelecionadoId = null;
            st.blocoSelecionadoId = null;
          });
          useProjeto.temporal.getState().clear();
          reiniciarGrupo();
        },

        selecionarSlide(id) {
          set((st) => {
            st.slideSelecionadoId = id;
            st.blocoSelecionadoId = null;
          });
        },

        selecionarBloco(slideId, blocoId) {
          set((st) => {
            st.slideSelecionadoId = slideId;
            st.blocoSelecionadoId = blocoId;
          });
        },

        atualizarMeta(parcial, grupo) {
          mudar((p) => {
            Object.assign(p.meta, parcial);
          }, grupo);
        },

        adicionarSlide(tipo = "conteudo", indice) {
          const slide = novoSlide(tipo);
          mudar((p) => {
            const i = Math.max(0, Math.min(indice ?? indicePadrao(p.slides, tipo), p.slides.length));
            p.slides.splice(i, 0, slide);
          });
          set((st) => {
            st.slideSelecionadoId = slide.id;
            st.blocoSelecionadoId = null;
          });
          return slide.id;
        },

        duplicarSlide(id) {
          const p = get().projeto;
          const i = p?.slides.findIndex((s) => s.id === id) ?? -1;
          if (!p || i < 0) return null;
          const copia = duplicarSlide(p.slides[i]);
          mudar((d) => {
            d.slides.splice(i + 1, 0, copia);
          });
          set((st) => {
            st.slideSelecionadoId = copia.id;
            st.blocoSelecionadoId = null;
          });
          return copia.id;
        },

        excluirSlide(id) {
          const p = get().projeto;
          const i = p?.slides.findIndex((s) => s.id === id) ?? -1;
          if (!p || i < 0) return;
          mudar((d) => {
            d.slides.splice(i, 1);
          });
          if (get().slideSelecionadoId === id) {
            const restantes = get().projeto?.slides ?? [];
            set((st) => {
              st.slideSelecionadoId = restantes[Math.min(i, restantes.length - 1)]?.id ?? null;
              st.blocoSelecionadoId = null;
            });
          }
        },

        moverSlide(de, para) {
          mudar((p) => mover(p.slides, de, para));
        },

        atualizarSlide(id, parcial, grupo) {
          mudar((p) => {
            const s = acharSlide(p, id);
            if (s) Object.assign(s, parcial);
          }, grupo);
        },

        adicionarBloco(slideId, tipo, indice) {
          if (!get().projeto?.slides.some((s) => s.id === slideId && s.tipo === "conteudo")) return null;
          const bloco = novoBloco(tipo);
          mudar((p) => {
            const s = acharConteudo(p, slideId);
            if (!s) return;
            const i = Math.max(0, Math.min(indice ?? s.blocos.length, s.blocos.length));
            s.blocos.splice(i, 0, bloco);
          });
          set((st) => {
            st.slideSelecionadoId = slideId;
            st.blocoSelecionadoId = bloco.id;
          });
          return bloco.id;
        },

        duplicarBloco(slideId, blocoId) {
          const s = get().projeto?.slides.find((x) => x.id === slideId);
          if (!s || s.tipo !== "conteudo") return null;
          const i = s.blocos.findIndex((b) => b.id === blocoId);
          if (i < 0) return null;
          const copia = duplicarBloco(s.blocos[i]);
          mudar((p) => {
            acharConteudo(p, slideId)?.blocos.splice(i + 1, 0, copia);
          });
          set((st) => {
            st.blocoSelecionadoId = copia.id;
          });
          return copia.id;
        },

        excluirBloco(slideId, blocoId) {
          mudar((p) => {
            const s = acharConteudo(p, slideId);
            if (!s) return;
            const i = s.blocos.findIndex((b) => b.id === blocoId);
            if (i >= 0) s.blocos.splice(i, 1);
          });
          if (get().blocoSelecionadoId === blocoId) {
            set((st) => {
              st.blocoSelecionadoId = null;
            });
          }
        },

        moverBloco(slideId, de, para) {
          mudar((p) => {
            const s = acharConteudo(p, slideId);
            if (s) mover(s.blocos, de, para);
          });
        },

        editarBloco(slideId, blocoId, receita, grupo) {
          mudar((p) => {
            const b = acharConteudo(p, slideId)?.blocos.find((x) => x.id === blocoId);
            if (b) receita(b as never);
          }, grupo);
        },
      };
    }),
    {
      limit: LIMITE_DESFAZER,
      partialize: (st) => ({ projeto: st.projeto }),
      // Só a seleção mudou: não é um passo de desfazer.
      equality: (a, b) => a.projeto === b.projeto,
      handleSet: (registrar) => (passado, substituir, atual, delta) => {
        const agora = relogio();
        const mesmoGrupo =
          grupoAtual !== undefined && grupoAtual === ultimoGrupo && agora - ultimoTempo < JANELA_GRUPO_MS;
        ultimoGrupo = grupoAtual;
        ultimoTempo = agora;
        if (mesmoGrupo) {
          // Continua o mesmo passo; uma edição nova invalida o "refazer".
          useProjeto.temporal.setState({ futureStates: [] });
          return;
        }
        (registrar as (...a: unknown[]) => void)(passado, substituir, atual, delta);
      },
    },
  ),
);

// ---------- Desfazer / refazer ----------

export function desfazer() {
  reiniciarGrupo();
  useProjeto.temporal.getState().undo();
}

export function refazer() {
  reiniciarGrupo();
  useProjeto.temporal.getState().redo();
}

/** Encerra o passo em digitação (ex. ao sair do campo). */
export function fecharPassoDeDesfazer() {
  reiniciarGrupo();
}

// ---------- Salvamento automático ----------

export interface EstadoSalvamento {
  estado: EstadoAutosave;
  erro?: string;
  /** Hora (ms) da última gravação bem-sucedida. */
  salvoEm?: number;
}

export const useSalvamento = create<EstadoSalvamento>(() => ({ estado: "salvo" }));

let autosave: Autosave<Projeto> | undefined;
let desligar: (() => void) | undefined;

/**
 * Liga o salvamento automático: toda mudança de `projeto` agenda `salvar`.
 * Devolve a função que desliga (sem descartar gravação em curso).
 */
export function ligarAutosave(salvar: (p: Projeto) => Promise<unknown>, atrasoMs = 1000): () => void {
  desligarAutosave();
  autosave = criarAutosave<Projeto>(salvar, {
    atrasoMs,
    aoMudarEstado(estado, erro) {
      useSalvamento.setState({
        estado,
        erro: erro === undefined ? undefined : String((erro as Error)?.message ?? erro),
        ...(estado === "salvo" ? { salvoEm: Date.now() } : {}),
      });
    },
  });
  const unsub = useProjeto.subscribe((st, ant) => {
    if (st.projeto && st.projeto !== ant.projeto && st.projeto.id === ant.projeto?.id) {
      autosave?.agendar(st.projeto);
    }
  });
  desligar = () => {
    unsub();
    autosave?.cancelar();
  };
  return desligarAutosave;
}

export function desligarAutosave() {
  desligar?.();
  desligar = undefined;
}

/** Agenda a gravação do projeto atual (ex. projeto novo ou importado, ainda sem rascunho). */
export function agendarSalvamento() {
  const p = useProjeto.getState().projeto;
  if (p) autosave?.agendar(p);
}

/** Grava já o que estiver pendente e espera terminar. */
export async function salvarAgora(): Promise<void> {
  await autosave?.flush();
}
