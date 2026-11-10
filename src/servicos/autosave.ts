/**
 * Agendador de salvamento automático com debounce, sem React.
 *
 * - `agendar(valor)`: guarda o valor mais recente e (re)inicia o atraso.
 * - `flush()`: salva já o pendente (se houver) e espera terminar.
 * - Nunca há duas gravações simultâneas: o que mudar durante uma gravação
 *   é salvo depois dela, respeitando o atraso.
 * - Estado via `aoMudarEstado`: "pendente" → "salvando" → "salvo" | "erro".
 */

export type EstadoAutosave = "salvo" | "salvando" | "erro" | "pendente";

export interface OpcoesAutosave {
  /** Atraso do debounce em ms (padrão 1000). */
  atrasoMs?: number;
  aoMudarEstado?: (estado: EstadoAutosave, erro?: unknown) => void;
}

export interface Autosave<T> {
  agendar(valor: T): void;
  flush(): Promise<void>;
  /** Cancela o timer pendente (ex.: ao desmontar). Não descarta gravação em curso. */
  cancelar(): void;
  readonly estado: EstadoAutosave;
}

export function criarAutosave<T>(
  salvar: (valor: T) => Promise<unknown>,
  { atrasoMs = 1000, aoMudarEstado }: OpcoesAutosave = {},
): Autosave<T> {
  let estado: EstadoAutosave = "salvo";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendente: { valor: T } | undefined;
  let emCurso: Promise<void> | undefined;

  function mudar(novo: EstadoAutosave, erro?: unknown) {
    if (novo === estado && novo !== "erro") return;
    estado = novo;
    aoMudarEstado?.(novo, erro);
  }

  function limparTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  async function salvarUm(): Promise<void> {
    if (!pendente) return;
    const { valor } = pendente;
    pendente = undefined;
    mudar("salvando");
    try {
      await salvar(valor);
      mudar(pendente ? "pendente" : "salvo");
    } catch (erro) {
      // Se já há um valor mais novo, ele será tentado a seguir.
      if (pendente) mudar("pendente");
      else mudar("erro", erro);
    }
  }

  /** Salva já o pendente, ou devolve a gravação em curso. */
  function disparar(): Promise<void> {
    limparTimer();
    if (!emCurso) {
      emCurso = salvarUm().finally(() => {
        emCurso = undefined;
        // O atraso venceu durante a gravação: salva o valor mais novo agora.
        if (pendente && timer === undefined) void disparar();
      });
    }
    return emCurso;
  }

  return {
    agendar(valor: T) {
      pendente = { valor };
      if (!emCurso) mudar("pendente");
      limparTimer();
      timer = setTimeout(() => {
        timer = undefined;
        // Se há gravação em curso, o `finally` dela dispara a próxima.
        if (!emCurso) void disparar();
      }, atrasoMs);
    },
    async flush() {
      // Espera a gravação em curso e, depois, qualquer valor pendente.
      limparTimer();
      while (emCurso || pendente) {
        await (emCurso ?? disparar());
      }
    },
    cancelar() {
      limparTimer();
    },
    get estado() {
      return estado;
    },
  };
}
