/** Ícones SVG em linha (traço, 20px), decorativos: o texto acessível fica no botão. */
const PATHS: Record<string, string> = {
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  arrastar: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  copiar: "M9 9h10v10H9zM5 15V5h10",
  lixeira: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  cima: "M12 19V5M6 11l6-6 6 6",
  baixo: "M12 5v14M6 13l6 6 6-6",
  mais: "M12 5v14M5 12h14",
  desfazer: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  refazer: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  inicio: "M3 11 12 4l9 7M5 10v10h14V10",
  alerta: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  erro: "M12 8v5M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  ok: "m5 12 5 5L20 7",
  fechar: "M6 6l12 12M18 6 6 18",
  recolher: "m15 18-6-6 6-6",
  expandir: "m9 18 6-6-6-6",
  seta: "m6 9 6 6 6-6",
  pasta: "M3 6h6l2 2h10v11H3z",
  arquivo: "M6 3h8l4 4v14H6zM14 3v4h4",
  salvar: "M5 3h11l3 3v15H5zM8 3v5h7M8 21v-7h8v7",
  exportar: "M12 3v12M7 8l5-5 5 5M5 15v6h14v-6",
  info: "M12 11v6M12 7h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  // Tipos de bloco
  texto: "M4 6h16M4 10h16M4 14h16M4 18h10",
  lista: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  cards: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  ordenar: "M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3",
  linha: "M6 4v16M6 6h.01M6 12h.01M6 18h.01M10 6h10M10 12h8M10 18h10",
  quiz: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  contraste: "M3 5h8v14H3zM13 5h8v14h-8z",
  destaque: "M4 5h16v11H8l-4 4zM12 8v3M12 13h.01",
  confira: "M4 5h16v14H4zM4 9h16M12 12v4M10 14h4",
  fonte: "M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-4a3 3 0 0 0-3 3",
  capa: "M5 3h14v18H5zM8 8h8M8 12h5",
  conteudo: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  fim: "M5 21V4M5 4h12l-2 4 2 4H5",
};

export function Icone({ nome, tamanho = 20 }: { nome: string; tamanho?: number }) {
  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[nome] ?? PATHS.info} />
    </svg>
  );
}
