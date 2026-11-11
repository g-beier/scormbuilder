/**
 * Bloco "Imagem" (M9): escolher o arquivo (copiado para o rascunho pelo
 * backend), miniatura, descrição para leitor de tela, decorativa e legenda.
 */
import { useEffect, useId, useState } from "react";
import { ALT_LONGO, type BlocoImagem } from "../../modelo/tipos";
import { useProjeto } from "../../estado/projeto";
import { mensagemDeErro } from "../../servicos/ambiente";
import { escolherArquivoImagem, importarImagem, urlDaImagem } from "../../servicos/imagens";
import { tamanhoLegivel } from "../../servicos/exportacao";
import { CampoRico, CampoTexto } from "../campos";
import { Icone } from "../Icones";
import type { PropsFormBloco } from "./comum";

/** Tamanho aproximado do arquivo a partir da `data:` URL (base64). */
export function bytesDaDataUrl(url: string): number {
  const b64 = url.slice(url.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

type Miniatura = { estado: "carregando" } | { estado: "pronta"; url: string } | { estado: "falha" };

export function FormImagem({ bloco, editar, f }: PropsFormBloco<BlocoImagem>) {
  const id = useId();
  const projetoId = useProjeto((s) => s.projeto?.id);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Anúncio para leitor de tela (região sempre montada, para o anúncio não se perder)
  const [anuncio, setAnuncio] = useState("");
  const [mini, setMini] = useState<Miniatura>({ estado: "carregando" });
  const [dimensoes, setDimensoes] = useState<{ nome: string; largura: number; altura: number } | null>(null);
  const arquivo = bloco.arquivo ?? "";
  const decorativa = bloco.decorativa === true;

  useEffect(() => {
    if (!arquivo || !projetoId) return;
    let vivo = true;
    setMini({ estado: "carregando" });
    urlDaImagem(projetoId, arquivo).then((url) => {
      if (vivo) setMini(url ? { estado: "pronta", url } : { estado: "falha" });
    });
    return () => {
      vivo = false;
    };
  }, [projetoId, arquivo]);

  async function escolher() {
    if (ocupado) return;
    setErro(null);
    setAnuncio("Abrindo…");
    setOcupado(true);
    try {
      const caminho = await escolherArquivoImagem();
      if (!caminho) {
        setAnuncio("");
        return;
      }
      if (!projetoId) throw new Error("Abra um projeto antes de escolher a imagem.");
      const r = await importarImagem(projetoId, caminho);
      setDimensoes({ nome: r.nome, largura: r.largura, altura: r.altura });
      editar((b) => {
        b.arquivo = r.nome;
      });
      setAnuncio(`Imagem escolhida. ${r.largura} × ${r.altura} px, ${tamanhoLegivel(r.bytes)}.`);
    } catch (e) {
      setAnuncio("");
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const dim = dimensoes?.nome === arquivo ? dimensoes : null;
  const altLongo = !decorativa && (bloco.alt ?? "").trim().length > ALT_LONGO;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  return (
    <>
      <div className="campo campo-imagem">
        <span className="rotulo" id={`${id}-rotulo`}>
          Arquivo da imagem
        </span>
        {arquivo && (
          <div className="imagem-escolhida">
            <div className="imagem-miniatura">
              {mini.estado === "pronta" ? (
                <img
                  src={mini.url}
                  alt=""
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setDimensoes({ nome: arquivo, largura: img.naturalWidth, altura: img.naturalHeight });
                  }}
                />
              ) : (
                <span className="ajuda">{mini.estado === "carregando" ? "Carregando a miniatura…" : "Não foi possível mostrar a miniatura. Use “Trocar imagem” para escolher o arquivo de novo."}</span>
              )}
            </div>
            <p className="ajuda imagem-info">
              {dim ? `${dim.largura} × ${dim.altura} px` : ""}
              {dim && mini.estado === "pronta" ? " · " : ""}
              {mini.estado === "pronta" ? tamanhoLegivel(bytesDaDataUrl(mini.url)) : ""}
            </p>
          </div>
        )}
        <div className="imagem-acoes">
          <button
            type="button"
            className="btn btn-imagem"
            data-foco={f("arquivo")}
            aria-describedby={`${idAjuda}${erro ? ` ${idErro}` : ""}`}
            aria-disabled={ocupado || undefined}
            onClick={escolher}
          >
            <Icone nome="imagem" />
            {ocupado ? "Abrindo…" : arquivo ? "Trocar imagem" : "Escolher imagem…"}
          </button>
        </div>
        <p id={idAjuda} className="ajuda">
          PNG, JPEG, WebP ou GIF, com até 2 MB. A imagem vai junto com o pacote.
        </p>
        <p role="status" className="so-leitor">
          {anuncio}
        </p>
        {erro && (
          <p id={idErro} className="erro-campo" role="alert">
            {erro}
          </p>
        )}
      </div>
      <div className="campo campo-check campo-check-grande">
        <input
          id={`${id}-decorativa`}
          type="checkbox"
          checked={decorativa}
          data-foco={f("decorativa")}
          aria-describedby={`${id}-decorativa-ajuda`}
          onChange={(e) => editar((b) => void (b.decorativa = e.target.checked))}
        />
        <label htmlFor={`${id}-decorativa`}>Imagem decorativa (não precisa de descrição)</label>
        <p id={`${id}-decorativa-ajuda`} className="ajuda">
          Marque só se a imagem não traz informação, como um enfeite ou uma textura.
        </p>
      </div>
      <CampoTexto
        rotulo="Descrição da imagem (texto alternativo)"
        ajuda={
          decorativa
            ? "Imagem decorativa: o leitor de tela ignora a imagem, então a descrição não é usada. O que você já escreveu fica guardado."
            : `Diga em uma ou duas frases o que a imagem mostra, para quem usa leitor de tela. Não comece com “Imagem de”.${altLongo ? ` Está longa: prefira até ${ALT_LONGO} caracteres.` : ""}`
        }
        multilinha
        desabilitado={decorativa}
        valor={bloco.alt ?? ""}
        foco={f("alt")}
        aoMudar={(v) => editar((b) => void (b.alt = v), f("alt"))}
      />
      <CampoRico
        rotulo="Legenda (opcional)"
        ajuda="Aparece abaixo da imagem. Use para a fonte ou um comentário curto."
        valor={bloco.legenda ?? ""}
        foco={f("legenda")}
        aoMudar={(v) => editar((b) => void (b.legenda = v), f("legenda"))}
      />
    </>
  );
}
