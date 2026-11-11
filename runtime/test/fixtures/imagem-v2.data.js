// Fixture escrita à mão para runtime/test/imagem.mjs: data.js v2 com o bloco "imagem" (M9).
// As imagens de img/ foram geradas (faixas nas cores do tema), sem direitos de terceiros.
// legenda vem como HTML (innerHTML); alt vem cru (vai por atributo, não é HTML).
window.CONTEUDO = {
  formato: 2,
  id: "TESTE_UD1_IMG1",
  contexto: "Teste · Imagens",
  titulo: "Imagens",
  slides: [
    { id: "s-capa", tipo: "capa", kicker: "Teste", titulo: "Imagens", sub: "Bloco imagem" },
    { id: "s-pais", tipo: "conteudo", kicker: "Mapa", titulo: "Uma imagem larga com legenda", blocos: [
      { id: "b-pais", tipo: "imagem", src: "img/paisagem.png", alt: "Gráfico \"A\" & <b>faixas</b> do tema",
        legenda: "Faixas do <strong>tema</strong> &amp; rodapé." }
    ] },
    { id: "s-ret", tipo: "conteudo", kicker: "Retrato", titulo: "Uma imagem alta, decorativa", blocos: [
      { id: "b-ret", tipo: "imagem", src: "img/retrato.png", alt: "não deve aparecer", decorativa: true },
      { id: "b-ret-t", tipo: "texto", paras: ["Texto depois da imagem."] }
    ] },
    { id: "s-erro", tipo: "conteudo", kicker: "Erro", titulo: "Imagens que não carregam", blocos: [
      { id: "b-e1", tipo: "imagem", src: "img/nao-existe.png", alt: "Mapa da região" },
      { id: "b-e2", tipo: "imagem", src: "img/nao-existe-2.png", alt: "", decorativa: true },
      { id: "b-e3", tipo: "imagem", src: "img/nao-existe-3.png", decorativa: true, legenda: "Legenda que fica." }
    ] },
    { id: "s-src", tipo: "conteudo", kicker: "Endereços", titulo: "Endereços aceitos e recusados", blocos: [
      { id: "b-ok", tipo: "imagem", alt: "Miniatura embutida", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAIAAAD3UuoiAAAAJ0lEQVR42mOQlvemCmIYNWjUoEFlkGSqHVa0UlYJK/qzUxgroppBAOiGs3FA2OJrAAAAAElFTkSuQmCC" },
      { id: "b-x1", tipo: "imagem", alt: "x", src: "https://exemplo.org/a.png" },
      { id: "b-x2", tipo: "imagem", alt: "x", src: "javascript:alert(1)" },
      { id: "b-x3", tipo: "imagem", alt: "x", src: "img/../js/data.js" },
      { id: "b-x4", tipo: "imagem", alt: "x", src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
      { id: "b-x5", tipo: "imagem", alt: "x", src: "img/sub/a.png" },
      { id: "b-x6", tipo: "imagem", alt: "x", src: "/img/a.png", decorativa: true },
      { id: "b-x7", tipo: "imagem" }
    ] },
    { id: "s-quiz", tipo: "conteudo", kicker: "Junto", titulo: "Imagem e pergunta", blocos: [
      { id: "b-qi", tipo: "imagem", src: "img/paisagem.png", alt: "Faixas" },
      { id: "b-q", tipo: "quiz", perguntas: [{ pergunta: "Qual é a cor de cima?", opcoes: ["Azul", "Verde"], correta: 0, explica: "É azul-marinho." }] }
    ] },
    { id: "s-fim", tipo: "fim", titulo: "Fim", texto: "Obrigado." }
  ]
};
