/**
 * Prévia do pacote (PLACEHOLDER do M3). O M4 implementa o iframe com o
 * runtime real, mantendo estas props.
 */
import { useId } from "react";
import type { Projeto } from "../modelo/tipos";
import { Icone } from "../editor/Icones";

export interface PropsPainelPrevia {
  projeto: Projeto;
  slideSelecionadoId: string | null;
  recolhido: boolean;
  aoAlternar(): void;
}

export function PainelPrevia({ projeto, slideSelecionadoId, recolhido, aoAlternar }: PropsPainelPrevia) {
  const id = useId();
  const n = projeto.slides.findIndex((s) => s.id === slideSelecionadoId);
  return (
    <aside className={`painel-previa${recolhido ? " recolhido" : ""}`} aria-label="Prévia">
      <div className="previa-cabecalho">
        <button
          type="button"
          className="btn-icone"
          aria-expanded={!recolhido}
          aria-controls={id}
          aria-label={recolhido ? "Mostrar prévia" : "Esconder prévia"}
          title={recolhido ? "Mostrar prévia" : "Esconder prévia"}
          onClick={aoAlternar}
        >
          <Icone nome={recolhido ? "recolher" : "expandir"} />
        </button>
        {!recolhido && <h2 className="coluna-titulo">Prévia</h2>}
      </div>
      <div id={id} className="previa-corpo" hidden={recolhido}>
        <div className="previa-quadro">
          <p>A prévia aparece aqui.</p>
          <p className="ajuda">
            Em breve você verá a tela {n >= 0 ? n + 1 : ""} exatamente como o aluno, no computador e no celular.
          </p>
        </div>
      </div>
    </aside>
  );
}
