/**
 * Janela modal acessível com <dialog> nativo (foco preso, Esc fecha).
 * Ao abrir, foca o elemento com `data-autofoco` (se houver); ao fechar,
 * devolve o foco a quem o tinha antes.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icone } from "./Icones";

export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
  largo,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar(): void;
  children: ReactNode;
  rodape?: ReactNode;
  largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  /** Quem tinha o foco antes de abrir (recebe o foco de volta ao fechar). */
  const origem = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofoco]")?.focus();
    } else if (!aberto && d.open) {
      d.close();
      const volta = origem.current;
      origem.current = null;
      if (volta?.isConnected && volta !== document.body) volta.focus();
      else document.querySelector<HTMLElement>(".btn-problemas")?.focus();
    }
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={`dialogo${largo ? " largo" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
    >
      {aberto && (
        <>
          <header className="dialogo-cabecalho">
            <h2 id={id}>{titulo}</h2>
            <button type="button" className="btn-icone" aria-label="Fechar" title="Fechar" onClick={aoFechar}>
              <Icone nome="fechar" />
            </button>
          </header>
          <div className="dialogo-corpo">{children}</div>
          {rodape && <footer className="dialogo-rodape">{rodape}</footer>}
        </>
      )}
    </dialog>
  );
}
