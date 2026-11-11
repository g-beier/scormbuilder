/**
 * Recursos do runtime embutidos no srcdoc da prévia (o iframe tem origem opaca e
 * não carregaria as fontes de `/runtime/fonts/` sem CORS). Vêm dos mesmos
 * arquivos de `runtime/` que vão para o pacote.
 */
import temaCss from "../../runtime/css/tema.css?raw";
import { cssComFontesEmbutidas } from "./montarSrcdoc";

const fontes = import.meta.glob("../../runtime/fonts/*.woff2", {
  query: "?inline",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** `tema.css` com as fontes como `data:`. */
export const CSS_PREVIA = cssComFontesEmbutidas(
  temaCss,
  Object.fromEntries(Object.entries(fontes).map(([caminho, dataUrl]) => [caminho.split("/").pop() ?? caminho, dataUrl])),
);
