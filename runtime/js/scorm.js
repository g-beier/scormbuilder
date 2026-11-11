/*! SCORM Builder — MIT License — Copyright (c) 2026 Gustav Eckard Gorniski Beier. Ver LICENSE em https://github.com/g-beier/scormbuilder */
/* Wrapper mínimo para SCORM 1.2, com fallback em localStorage para testes fora do LMS.
   Scorm.init(chave): a chave do localStorage vem do pacote (CONTEUDO.id), para não misturar projetos. */
var Scorm = (function () {
  var api = null;
  var connected = false;
  var finished = false;
  var LS_KEY = "scorm_estudo_caso_protecao";   // padrão antigo; substituído por Scorm.init(chave)
  var fallback = {};
  var inicio = new Date();
  var contaInteracoes = 0;   // usado quando o LMS não informa cmi.interactions._count

  function dois(n) { return (n < 10 ? "0" : "") + n; }

  /* Tempo desta sessão no formato SCORM 1.2 (HHHH:MM:SS). */
  function tempoDaSessao() {
    var s = Math.max(0, Math.round((new Date() - inicio) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    var h4 = (h < 10 ? "000" : h < 100 ? "00" : h < 1000 ? "0" : "") + h;
    return h4 + ":" + dois(m) + ":" + dois(s % 60);
  }

  function findAPI(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 20) {
      tries++;
      win = win.parent;
    }
    return win && win.API ? win.API : null;
  }

  function locateAPI() {
    var found = findAPI(window);
    if (!found && window.opener) {
      try { found = findAPI(window.opener); } catch (e) { found = null; }
    }
    return found;
  }

  function init(chave) {
    if (chave) LS_KEY = String(chave);
    api = locateAPI();
    if (api) {
      try {
        connected = String(api.LMSInitialize("")) === "true";
      } catch (e) {
        connected = false;
      }
    }
    if (!connected) {
      try {
        fallback = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      } catch (e) {
        fallback = {};
      }
    }
    return connected;
  }

  function get(key) {
    if (connected) {
      try { return String(api.LMSGetValue(key)); } catch (e) { return ""; }
    }
    return fallback[key] || "";
  }

  function set(key, value) {
    if (connected) {
      try { return String(api.LMSSetValue(key, String(value))) === "true"; } catch (e) { return false; }
    }
    fallback[key] = String(value);
    try { localStorage.setItem(LS_KEY, JSON.stringify(fallback)); } catch (e) {}
    return true;
  }

  function commit() {
    if (connected) {
      try { return String(api.LMSCommit("")) === "true"; } catch (e) { return false; }
    }
    return true;
  }

  /* Grava um texto livre como interação “fill-in” (aparece no Relatório de interações do Moodle).
     O SCORM 1.2 limita cada resposta a 255 caracteres: textos maiores são divididos em partes. */
  function gravarResposta(id, texto) {
    var limpo = String(texto).replace(/\s*[\r\n]+\s*/g, " / ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!limpo) return false;
    var partes = [];
    for (var i = 0; i < limpo.length; i += 250) partes.push(limpo.substring(i, i + 250));

    var n = parseInt(get("cmi.interactions._count"), 10);
    if (isNaN(n)) n = contaInteracoes;
    var agora = new Date();
    var hora = dois(agora.getHours()) + ":" + dois(agora.getMinutes()) + ":" + dois(agora.getSeconds());
    var ok = true;
    for (var p = 0; p < partes.length; p++) {
      var base = "cmi.interactions." + (n + p) + ".";
      ok = set(base + "id", partes.length > 1 ? id + "_p" + (p + 1) : id) && ok;
      ok = set(base + "type", "fill-in") && ok;
      ok = set(base + "student_response", partes[p]) && ok;
      ok = set(base + "result", "neutral") && ok;
      set(base + "time", hora);
    }
    contaInteracoes = n + partes.length;
    commit();
    return ok;
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (connected) {
      try {
        api.LMSSetValue("cmi.core.session_time", tempoDaSessao());
        var st = String(api.LMSGetValue("cmi.core.lesson_status"));
        // “suspend” permite retomar de onde parou; ao concluir, sai normalmente.
        api.LMSSetValue("cmi.core.exit", (st === "completed" || st === "passed") ? "" : "suspend");
      } catch (e) {}
      try {
        api.LMSCommit("");
        api.LMSFinish("");
      } catch (e) {}
    }
  }

  return {
    init: init,
    get: get,
    set: set,
    commit: commit,
    gravarResposta: gravarResposta,
    finish: finish,
    isConnected: function () { return connected; }
  };
})();
