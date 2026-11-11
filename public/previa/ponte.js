/*
 * Ponte da prévia do SCORM Builder (roda DENTRO do iframe isolado da prévia; não
 * vai para o pacote). Lida pelo srcdoc montado em src/previa/montarSrcdoc.ts.
 *
 * - Lê o bloco JSON #previa-dados (CONTEUDO, opções do motor, sessão, estado SCORM).
 * - Cria window.API (SCORM 1.2) com cache local: as leituras do motor são
 *   síncronas, então são respondidas daqui; cada gravação é repassada ao app por
 *   postMessage, onde fica o LMS simulado (src/previa/apiScorm.ts).
 * - Chama Motor.iniciar e avisa o app: "pronto", "falha" e cada troca de tela.
 * - Atende o pedido "ir" do app (saltar para uma tela).
 * Protocolo: src/previa/ponteScorm.ts. ES5, sem dependências.
 */
(function () {
  "use strict";
  var bloco = document.getElementById("previa-dados");
  var dados;
  try {
    dados = JSON.parse(bloco.textContent);
  } catch (e) {
    return;
  }
  var sessao = String(dados.sessao);
  var temProp = Object.prototype.hasOwnProperty;

  function enviar(tipo, extra) {
    var m = { cev: "previa", sessao: sessao, tipo: tipo };
    for (var k in extra) if (temProp.call(extra, k)) m[k] = extra[k];
    try {
      window.parent.postMessage(m, "*");
    } catch (e) {}
  }

  // ---------- API SCORM 1.2 simulada ----------
  var estado = dados.scorm || {};
  var cmi = estado.dados || {};
  var fixos = estado.fixos || {};
  var iniciada = false;
  var encerrada = false;
  var erro = "0";

  function contarInteracoes() {
    var max = -1;
    for (var k in cmi) {
      var m = temProp.call(cmi, k) && /^cmi\.interactions\.(\d+)\./.exec(k);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }
  function ativa() {
    if (iniciada && !encerrada) return true;
    erro = "301";
    return false;
  }
  function repassar(metodo, args) {
    enviar("scorm", { metodo: metodo, args: args });
  }

  window.API = {
    LMSInitialize: function () {
      if (iniciada && !encerrada) {
        erro = "101";
        return "false";
      }
      iniciada = true;
      encerrada = false;
      erro = "0";
      if (!cmi["cmi.core.lesson_status"]) cmi["cmi.core.lesson_status"] = "not attempted";
      repassar("LMSInitialize", []);
      return "true";
    },
    LMSFinish: function () {
      if (!ativa()) return "false";
      encerrada = true;
      erro = "0";
      repassar("LMSFinish", []);
      return "true";
    },
    LMSGetValue: function (el) {
      if (!ativa()) return "";
      erro = "0";
      el = String(el);
      if (el === "cmi.interactions._count") return String(contarInteracoes());
      if (temProp.call(fixos, el)) return String(fixos[el]);
      return temProp.call(cmi, el) ? String(cmi[el]) : "";
    },
    LMSSetValue: function (el, valor) {
      if (!ativa()) return "false";
      erro = "0";
      el = String(el);
      valor = String(valor);
      cmi[el] = valor;
      repassar("LMSSetValue", [el, valor]);
      return "true";
    },
    LMSCommit: function () {
      if (!ativa()) return "false";
      erro = "0";
      repassar("LMSCommit", []);
      return "true";
    },
    LMSGetLastError: function () {
      return erro;
    },
    LMSGetErrorString: function () {
      return "";
    },
    LMSGetDiagnostic: function () {
      return "";
    }
  };

  // ---------- Motor ----------
  window.CONTEUDO = dados.conteudo;
  var h = null;
  var motivo = "";
  try {
    h = window.Motor ? window.Motor.iniciar(dados.conteudo, dados.opcoes) : null;
  } catch (e) {
    motivo = String((e && e.message) || e);
  }
  if (!h) {
    var p = document.querySelector("#stage p");
    enviar("falha", { mensagem: (p && p.textContent ? p.textContent.replace(/^\s+|\s+$/g, "") : "") || motivo });
    return;
  }

  var ultima = h.tela();
  function avisarTela(pedido) {
    var t = h.tela();
    if (pedido === undefined) {
      if (t === ultima) return;
      ultima = t;
      enviar("tela", { tela: t });
    } else {
      ultima = t;
      enviar("tela", { tela: t, pedido: pedido });
    }
  }

  var contador = document.getElementById("counter");
  if (contador && window.MutationObserver) {
    new MutationObserver(function () {
      avisarTela();
    }).observe(contador, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.cev !== "previa" || m.tipo !== "ir") return;
    var n = Number(m.tela);
    if (n >= 0 && n < h.total) h.ir(n);
    avisarTela(Number(m.pedido) || 0);
  });

  enviar("pronto", { tela: h.tela(), total: h.total });
})();
