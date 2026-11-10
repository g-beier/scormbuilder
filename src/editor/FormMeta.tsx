/** Dados do pacote (curso, UD, atividade…), usados no "Novo SCORM" e no editor. */
import { useId, useState } from "react";
import type { Meta } from "../modelo/tipos";
import { nomePacote } from "../modelo/compilar";

export const CURSOS = [
  { sigla: "CTGESTAO", nome: "Curso Técnico de Gestão de UELs" },
  { sigla: "MAPIJ", nome: "MAPIJ" },
] as const;

export const ATIVIDADES = [
  { sigla: "LEITURA", nome: "Leitura" },
  { sigla: "QUIZ", nome: "Questionário" },
] as const;

/** Sugestão de "contexto" no padrão do ead-scorm: "Curso … · UD n – título". */
export function sugerirContexto(meta: Pick<Meta, "curso" | "ud" | "titulo">): string {
  const curso = CURSOS.find((c) => c.sigla === meta.curso)?.nome ?? meta.curso;
  const partes = [curso, meta.ud > 0 ? `UD ${meta.ud}` : ""].filter(Boolean).join(" · ");
  return [partes, meta.titulo].filter(Boolean).join(" – ");
}

export function FormMeta({
  meta,
  aoMudar,
  focoPrefixo,
  autoFocar,
  erroTitulo,
}: {
  meta: Meta;
  aoMudar(parcial: Partial<Meta>, campo: keyof Meta): void;
  /** Se houver, os campos ganham data-foco (para o painel de problemas). */
  focoPrefixo?: string;
  autoFocar?: boolean;
  erroTitulo?: string;
}) {
  const id = useId();
  const fid = (c: string) => `${id}-${c}`;
  const foco = (c: string) => (focoPrefixo ? `${focoPrefixo}${c}` : undefined);
  const cursoConhecido = CURSOS.some((c) => c.sigla === meta.curso);
  const atividadeConhecida = ATIVIDADES.some((a) => a.sigla === meta.atividade);
  const [cursoOutro, setCursoOutro] = useState(!cursoConhecido);
  const [atividadeOutra, setAtividadeOutra] = useState(!atividadeConhecida);
  const nome = nomePacote(meta);

  const numero = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return (
    <div className="form-meta">
      <div className="campo">
        <label htmlFor={fid("titulo")}>Título da atividade</label>
        <input
          id={fid("titulo")}
          type="text"
          autoFocus={autoFocar}
          value={meta.titulo}
          data-foco={foco("titulo")}
          aria-describedby={erroTitulo ? `${fid("titulo-erro")} ${fid("titulo-ajuda")}` : fid("titulo-ajuda")}
          aria-invalid={erroTitulo ? true : undefined}
          onChange={(e) => aoMudar({ titulo: e.target.value }, "titulo")}
        />
        {erroTitulo && (
          <p id={fid("titulo-erro")} className="erro-campo" role="alert">
            {erroTitulo}
          </p>
        )}
        <p id={fid("titulo-ajuda")} className="ajuda">
          Aparece no topo do pacote, na aba do navegador e no Moodle.
        </p>
      </div>

      <div className="linha-campos">
        <div className="campo">
          <label htmlFor={fid("curso")}>Curso</label>
          <select
            id={fid("curso")}
            value={cursoOutro ? "outro" : meta.curso}
            data-foco={foco("curso")}
            onChange={(e) => {
              const v = e.target.value;
              setCursoOutro(v === "outro");
              aoMudar({ curso: v === "outro" ? "" : v }, "curso");
            }}
          >
            {CURSOS.map((c) => (
              <option key={c.sigla} value={c.sigla}>
                {c.nome} ({c.sigla})
              </option>
            ))}
            <option value="outro">Outro…</option>
          </select>
        </div>
        {cursoOutro && (
          <div className="campo">
            <label htmlFor={fid("curso-outro")}>Sigla do curso</label>
            <input
              id={fid("curso-outro")}
              type="text"
              value={meta.curso}
              aria-describedby={fid("curso-ajuda")}
              onChange={(e) => aoMudar({ curso: e.target.value }, "curso")}
            />
            <p id={fid("curso-ajuda")} className="ajuda">
              Só letras e números, sem espaço. Ex.: CTGESTAO.
            </p>
          </div>
        )}
        <div className="campo campo-numero">
          <label htmlFor={fid("ud")}>Número da UD</label>
          <input
            id={fid("ud")}
            type="number"
            min={1}
            inputMode="numeric"
            value={meta.ud > 0 ? meta.ud : ""}
            data-foco={foco("ud")}
            onChange={(e) => aoMudar({ ud: numero(e.target.value) }, "ud")}
          />
        </div>
      </div>

      <div className="linha-campos">
        <div className="campo">
          <label htmlFor={fid("atividade")}>Tipo de atividade</label>
          <select
            id={fid("atividade")}
            value={atividadeOutra ? "outro" : meta.atividade}
            data-foco={foco("atividade")}
            onChange={(e) => {
              const v = e.target.value;
              setAtividadeOutra(v === "outro");
              aoMudar({ atividade: v === "outro" ? "" : v }, "atividade");
            }}
          >
            {ATIVIDADES.map((a) => (
              <option key={a.sigla} value={a.sigla}>
                {a.nome}
              </option>
            ))}
            <option value="outro">Outro…</option>
          </select>
        </div>
        {atividadeOutra && (
          <div className="campo">
            <label htmlFor={fid("atividade-outra")}>Nome do tipo</label>
            <input
              id={fid("atividade-outra")}
              type="text"
              value={meta.atividade}
              onChange={(e) => aoMudar({ atividade: e.target.value }, "atividade")}
            />
          </div>
        )}
        <div className="campo campo-numero">
          <label htmlFor={fid("numero")}>Número da atividade</label>
          <input
            id={fid("numero")}
            type="number"
            min={1}
            inputMode="numeric"
            value={meta.numero > 0 ? meta.numero : ""}
            data-foco={foco("numero")}
            aria-describedby={fid("numero-ajuda")}
            onChange={(e) => aoMudar({ numero: numero(e.target.value) }, "numero")}
          />
          <p id={fid("numero-ajuda")} className="ajuda">
            Diferencia duas atividades do mesmo tipo na mesma UD.
          </p>
        </div>
      </div>

      <div className="campo">
        <label htmlFor={fid("contexto")}>Linha de contexto</label>
        <input
          id={fid("contexto")}
          type="text"
          value={meta.contexto}
          data-foco={foco("contexto")}
          placeholder={sugerirContexto(meta) || "Curso Técnico de Gestão de UELs · UD 11 – Título da UD"}
          aria-describedby={fid("contexto-ajuda")}
          onChange={(e) => aoMudar({ contexto: e.target.value }, "contexto")}
        />
        <p id={fid("contexto-ajuda")} className="ajuda">
          Linha pequena no alto de todas as telas, com o curso e a unidade.
        </p>
      </div>

      <p className="nome-pacote">
        Nome do pacote:{" "}
        <output htmlFor={`${fid("curso")} ${fid("ud")} ${fid("atividade")} ${fid("numero")}`} aria-live="polite">
          <code>{nome}</code>
        </output>
      </p>
    </div>
  );
}
