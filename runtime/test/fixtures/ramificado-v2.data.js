// Fixture escrita à mão para runtime/test/ramificado.mjs: data.js v2 com o bloco "ramificado" (M6),
// no formato do CTGESTAO_UD11_QUIZ. enunciado e texto vêm como HTML; retorno vem cru (textContent).
window.CONTEUDO = {
  formato: 2,
  id: "TESTE_UD1_RAM1",
  contexto: "Teste · Caminhos",
  titulo: "Caminhos",
  slides: [
    { id: "s-capa", tipo: "capa", kicker: "Teste", titulo: "Caminhos", sub: "Questionário ramificado" },
    { id: "s-q", tipo: "conteudo", kicker: "Autodiagnóstico", titulo: "Situação jurídica", blocos: [
      { id: "b-q", tipo: "ramificado", perguntas: [
        { id: "q-cnpj", enunciado: "A UEL tem <strong>CNPJ</strong> próprio?", alternativas: [
          { texto: "Sim.", retorno: "Associação própria. Siga para a pergunta 3.", proxima: "q-conta" },
          { texto: "Não.", retorno: "Siga para a pergunta 2.", proxima: "q-conv" } ] },
        { id: "q-conv", enunciado: "Há convênio com uma patrocinadora?", alternativas: [
          { texto: "Sim.", retorno: "UEL patrocinada & <ok>.", proxima: "q-conta" },
          { texto: "Não.", retorno: "", proxima: "q-sit" } ] },
        { id: "q-conta", enunciado: "Em nome de quem está a conta?", alternativas: [
          { texto: "Da UEL.", retorno: "Coerente.", proxima: "q-sit" },
          { texto: "De um adulto.", retorno: "Atenção: isso confunde patrimônios.", proxima: "q-sit" } ] },
        { id: "q-sit", enunciado: "Registre a situação da UEL.", alternativas: [
          { texto: "Associação própria.", retorno: "Trilha A.", proxima: "fim" },
          { texto: "Tenho dúvida.", retorno: "Fale com seu tutor.", proxima: "fim" } ] }
      ] }
    ] },
    { id: "s-fim", tipo: "fim", titulo: "Fim", texto: "Obrigado." }
  ]
};
