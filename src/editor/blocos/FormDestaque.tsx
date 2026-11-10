import type { BlocoDestaque, BlocoFonte } from "../../modelo/tipos";
import { CampoRico } from "../campos";
import type { PropsFormBloco } from "./comum";

export function FormDestaque({ bloco, editar, f }: PropsFormBloco<BlocoDestaque>) {
  return (
    <CampoRico
      rotulo="Texto em destaque"
      ajuda="Aparece numa caixa colorida, para a ideia principal da tela."
      valor={bloco.html}
      foco={f("html")}
      aoMudar={(v) => editar((b) => void (b.html = v), f("html"))}
    />
  );
}

export function FormFonte({ bloco, editar, f }: PropsFormBloco<BlocoFonte>) {
  return (
    <CampoRico
      rotulo="Fonte ou referência"
      ajuda="Aparece em letra pequena no fim da tela. Use o botão de link para apontar para o documento oficial."
      valor={bloco.html}
      foco={f("html")}
      aoMudar={(v) => editar((b) => void (b.html = v), f("html"))}
    />
  );
}
