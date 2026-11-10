/** Janela modal acessível com <dialog> nativo (foco preso, Esc fecha). */
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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    else if (!aberto && d.open) d.close();
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
