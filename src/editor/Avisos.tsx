import { dispensar, useAvisos } from "../estado/avisos";
import { Icone } from "./Icones";

export function Avisos() {
  const avisos = useAvisos((s) => s.avisos);
  return (
    <div className="avisos" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={`aviso aviso-${a.tipo}`}>
          <Icone nome={a.tipo === "erro" ? "erro" : a.tipo === "ok" ? "ok" : "info"} />
          <div className="aviso-texto">
            <p>{a.texto}</p>
            {a.detalhes && a.detalhes.length > 0 && (
              <ul>
                {a.detalhes.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar mensagem" title="Fechar" onClick={() => dispensar(a.id)}>
            <Icone nome="fechar" />
          </button>
        </div>
      ))}
    </div>
  );
}
