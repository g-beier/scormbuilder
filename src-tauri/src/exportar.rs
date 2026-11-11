//! Exportação do pacote SCORM 1.2 (pasta ou .zip) e preferências de exportação.
//!
//! Espelha o `~/Dev/ead-scorm/build.py`: copia o motor (`runtime/`), grava
//! `js/data.js` recebido do front, gera `index.html` e `imsmanifest.xml`
//! listando todos os arquivos gravados, valida (XML bem-formado, todo `href`
//! existe, todo arquivo listado, sem ocultos) e compacta com o manifesto na
//! raiz do zip.
//!
//! A lógica fica em funções `*_em(...)` testáveis com pasta temporária; os
//! comandos só resolvem a pasta do runtime e a `app_data_dir`.
//!
//! Onde fica o runtime:
//! - no app instalado, em `<resource_dir>/runtime/` (ver `bundle.resources`
//!   em `tauri.conf.json`, que leva só `index.html`, `css/`, `js/` e `fonts/`);
//! - em build de debug (`tauri dev`, `cargo test`), primeiro em
//!   `CARGO_MANIFEST_DIR/../runtime` (a pasta do repositório, sempre atual),
//!   com o `resource_dir` como reserva.

use crate::imagens;
use crate::projetos::gravar_atomico;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Manager};

pub const MANIFESTO: &str = "imsmanifest.xml";
pub const PREFIXO_JA_EXISTE: &str = "JA_EXISTE:";
const PASTAS_RUNTIME: [&str; 3] = ["css", "js", "fonts"];
const OBRIGATORIOS_RUNTIME: [&str; 4] = ["index.html", "js/motor.js", "js/scorm.js", "css/tema.css"];
const ARQUIVO_PREFERENCIAS: &str = "preferencias.json";

// ---------- Tipos de IPC ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaExportacao {
    pub nome_pacote: String,
    pub titulo: String,
    pub data_js: String,
    /// Id do projeto (rascunho) de onde vêm as imagens. Obrigatório se
    /// `imagens` não estiver vazia.
    #[serde(default)]
    pub projeto_id: Option<String>,
    /// Imagens a copiar de `<app_data>/rascunhos/<projetoId>/img/` para
    /// `img/` do pacote (nomes `<hash>.<ext>`). Toda `img/...` citada no
    /// `data.js` (campo `src`) precisa estar aqui.
    #[serde(default)]
    pub imagens: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Formato {
    Pasta,
    Zip,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoExportacao {
    /// Pasta do pacote ou arquivo .zip gerado.
    pub caminho: String,
    /// Quantidade de arquivos do pacote (inclui o manifesto).
    pub arquivos: usize,
    /// Tamanho em bytes: soma dos arquivos (pasta) ou tamanho do .zip.
    pub bytes: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferencias {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ultimo_destino: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pasta_ead_scorm: Option<String>,
}

/// O que `montar_pacote_em` gravou: caminhos relativos (com `/`) e bytes.
#[derive(Debug, Clone, PartialEq)]
pub struct PacoteMontado {
    pub arquivos: Vec<String>,
    pub bytes: u64,
}

// ---------- Utilidades ----------

fn erro_io(acao: &str, e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => format!("Não foi possível {acao}: o local não foi encontrado."),
        io::ErrorKind::PermissionDenied => {
            format!("Não foi possível {acao}: sem permissão para gravar nesse local.")
        }
        _ => format!("Não foi possível {acao}: {e}."),
    }
}

fn oculto(nome: &str) -> bool {
    nome.starts_with('.')
}

/// Escape para texto e atributos XML/HTML (`&`, `<`, `>`, `"`, `'`).
pub fn escapar(texto: &str) -> String {
    let mut s = String::with_capacity(texto.len());
    for c in texto.chars() {
        match c {
            '&' => s.push_str("&amp;"),
            '<' => s.push_str("&lt;"),
            '>' => s.push_str("&gt;"),
            '"' => s.push_str("&quot;"),
            '\'' => s.push_str("&#39;"),
            _ => s.push(c),
        }
    }
    s
}

/// `CURSO_UD<n>_<ATIVIDADE><n>`: só `[A-Z0-9_]`, começando com letra, até 100
/// caracteres. Impede path traversal e serve como `identifier` XML.
pub fn validar_nome_pacote(nome: &str) -> Result<(), String> {
    let ok = !nome.is_empty()
        && nome.len() <= 100
        && nome.starts_with(|c: char| c.is_ascii_uppercase())
        && nome
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!(
            "Nome de pacote inválido: “{nome}”. Use só letras maiúsculas sem acento, números e “_” (ex.: CTGESTAO_UD11_LEITURA2)."
        ))
    }
}

/// Lista recursiva de arquivos (caminhos relativos com `/`), em ordem, sem
/// ocultos. Devolve também os ocultos encontrados, para a validação.
fn varrer(base: &Path, rel: &str, arquivos: &mut Vec<String>, ocultos: &mut Vec<String>) -> io::Result<()> {
    let dir = if rel.is_empty() { base.to_path_buf() } else { base.join(rel) };
    let mut entradas: Vec<_> = fs::read_dir(&dir)?.collect::<Result<_, _>>()?;
    entradas.sort_by_key(|e| e.file_name());
    for e in entradas {
        let nome = e.file_name().to_string_lossy().into_owned();
        let caminho = if rel.is_empty() { nome.clone() } else { format!("{rel}/{nome}") };
        if oculto(&nome) {
            ocultos.push(caminho);
            continue;
        }
        let tipo = e.file_type()?;
        if tipo.is_dir() {
            varrer(base, &caminho, arquivos, ocultos)?;
        } else if tipo.is_file() {
            arquivos.push(caminho);
        }
    }
    Ok(())
}

fn caminho_rel(base: &Path, rel: &str) -> PathBuf {
    rel.split('/').fold(base.to_path_buf(), |p, parte| p.join(parte))
}

/// Pasta temporária apagada ao sair do escopo.
struct Temporaria(PathBuf);
impl Temporaria {
    fn em(pai: &Path, prefixo: &str) -> io::Result<Self> {
        static N: AtomicUsize = AtomicUsize::new(0);
        let p = pai.join(format!(
            "{prefixo}-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p)?;
        Ok(Temporaria(p))
    }
}
impl Drop for Temporaria {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

// ---------- Manifesto ----------

/// `imsmanifest.xml` SCORM 1.2 no padrão dos pacotes do ead-scorm: um SCO
/// (`index.html`) e um `<file>` para cada arquivo do pacote.
pub fn gerar_manifesto(nome_pacote: &str, titulo: &str, arquivos: &[String]) -> String {
    let t = escapar(titulo);
    let id = escapar(nome_pacote);
    let mut lista = String::new();
    for a in arquivos {
        lista.push_str(&format!("      <file href=\"{}\"/>\n", escapar(a)));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<manifest identifier="{id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_{id}">
    <organization identifier="ORG_{id}">
      <title>{t}</title>
      <item identifier="ITEM_{id}" identifierref="RES_{id}" isvisible="true">
        <title>{t}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_{id}" type="webcontent" adlcp:scormtype="sco" href="index.html">
{lista}    </resource>
  </resources>
</manifest>
"#
    )
}

// ---------- Imagens ----------

/// Nomes citados como `"src": "img/<nome>"` no `data.js` (na ordem, sem
/// repetição). O compilador gera JSON, então basta procurar a chave `src`.
pub fn imagens_citadas(data_js: &str) -> Vec<String> {
    let mut saida: Vec<String> = Vec::new();
    let mut resto = data_js;
    while let Some(i) = resto.find("\"src\"") {
        resto = &resto[i + 5..];
        let depois = resto.trim_start();
        let Some(depois) = depois.strip_prefix(':') else { continue };
        let Some(valor) = depois.trim_start().strip_prefix('"') else { continue };
        let Some(fim) = valor.find('"') else { break };
        if let Some(nome) = valor[..fim].strip_prefix("img/")
            && !saida.iter().any(|n| n == nome)
        {
            saida.push(nome.to_string());
        }
    }
    saida
}

/// Confere as imagens pedidas e devolve `(nome, caminho de origem)`.
/// Erros: nome inválido, projeto sem id, imagem ausente do rascunho e
/// imagem citada no `data.js` que não veio na lista.
fn imagens_da_entrada(base: &Path, entrada: &EntradaExportacao) -> Result<Vec<(String, PathBuf)>, String> {
    let mut nomes: Vec<&str> = Vec::new();
    for n in &entrada.imagens {
        imagens::validar_nome_imagem(n)?;
        if !nomes.contains(&n.as_str()) {
            nomes.push(n);
        }
    }
    for citada in imagens_citadas(&entrada.data_js) {
        if !nomes.contains(&citada.as_str()) {
            return Err(format!(
                "O conteúdo usa a imagem img/{citada}, mas ela não foi enviada para o pacote."
            ));
        }
    }
    if nomes.is_empty() {
        return Ok(Vec::new());
    }
    let id = entrada
        .projeto_id
        .as_deref()
        .ok_or_else(|| "O pacote usa imagens, mas veio sem a identificação do projeto.".to_string())?;
    let pasta = imagens::pasta_imagens(base, id)?;
    nomes
        .into_iter()
        .map(|n| {
            let origem = pasta.join(n);
            if origem.is_file() {
                Ok((n.to_string(), origem))
            } else {
                Err(format!(
                    "A imagem {n} usada no conteúdo não foi encontrada no rascunho. Escolha a imagem de novo no bloco Imagem."
                ))
            }
        })
        .collect()
}

// ---------- Montagem ----------

/// Monta o pacote em `destino` (criada se faltar; deve estar vazia ou não
/// existir). Copia `index.html`, `css/`, `js/` e `fonts/` do runtime (sem
/// ocultos, sem `test/`, sem `ORIGEM.md`, sem um `js/data.js` antigo), grava
/// `js/data.js`, troca `{{TITULO}}` no `index.html` e gera o manifesto.
pub fn montar_pacote_em(
    runtime: &Path,
    base: &Path,
    destino: &Path,
    entrada: &EntradaExportacao,
) -> Result<PacoteMontado, String> {
    validar_nome_pacote(&entrada.nome_pacote)?;
    if entrada.titulo.trim().is_empty() {
        return Err("O pacote está sem título.".to_string());
    }
    if !entrada.data_js.contains("window.CONTEUDO") {
        return Err("O conteúdo do pacote (data.js) veio vazio ou inválido.".to_string());
    }
    for obrig in OBRIGATORIOS_RUNTIME {
        if !caminho_rel(runtime, obrig).is_file() {
            return Err(format!(
                "O motor do pacote está incompleto: falta {obrig}. Reinstale o aplicativo."
            ));
        }
    }

    let imagens = imagens_da_entrada(base, entrada)?;

    // Arquivos do runtime a copiar.
    let mut copiar = Vec::new();
    let mut ignorados = Vec::new();
    for pasta in PASTAS_RUNTIME {
        varrer(runtime, pasta, &mut copiar, &mut ignorados)
            .map_err(|e| erro_io("ler o motor do pacote", &e))?;
    }
    copiar.retain(|a| a != "js/data.js");

    fs::create_dir_all(destino).map_err(|e| erro_io("criar a pasta do pacote", &e))?;
    let mut gravados: Vec<String> = Vec::new();
    let mut bytes = 0u64;
    let mut gravar = |rel: &str, conteudo: &[u8]| -> Result<(), String> {
        let alvo = caminho_rel(destino, rel);
        if let Some(pai) = alvo.parent() {
            fs::create_dir_all(pai).map_err(|e| erro_io("criar as pastas do pacote", &e))?;
        }
        fs::write(&alvo, conteudo).map_err(|e| erro_io(&format!("gravar {rel}"), &e))?;
        gravados.push(rel.to_string());
        bytes += conteudo.len() as u64;
        Ok(())
    };

    let modelo = fs::read_to_string(runtime.join("index.html"))
        .map_err(|e| erro_io("ler o modelo index.html", &e))?;
    if !modelo.contains("{{TITULO}}") {
        return Err("O modelo index.html do motor não tem o marcador {{TITULO}}.".to_string());
    }
    gravar("index.html", modelo.replace("{{TITULO}}", &escapar(entrada.titulo.trim())).as_bytes())?;
    for rel in &copiar {
        let conteudo = fs::read(caminho_rel(runtime, rel)).map_err(|e| erro_io(&format!("ler {rel}"), &e))?;
        gravar(rel, &conteudo)?;
    }
    gravar("js/data.js", entrada.data_js.as_bytes())?;
    for (nome, origem) in &imagens {
        let conteudo = fs::read(origem).map_err(|e| erro_io(&format!("ler a imagem {nome}"), &e))?;
        gravar(&format!("img/{nome}"), &conteudo)?;
    }

    let manifesto = gerar_manifesto(&entrada.nome_pacote, entrada.titulo.trim(), &gravados);
    fs::write(destino.join(MANIFESTO), manifesto.as_bytes())
        .map_err(|e| erro_io("gravar o imsmanifest.xml", &e))?;
    bytes += manifesto.len() as u64;
    gravados.push(MANIFESTO.to_string());
    Ok(PacoteMontado { arquivos: gravados, bytes })
}

// ---------- Validação ----------

/// Confere o pacote como o `build.py` (e um pouco mais). Devolve a lista de
/// problemas em pt-BR; vazia quando está tudo certo.
pub fn validar_pacote_em(pasta: &Path) -> Vec<String> {
    let mut problemas = Vec::new();
    let texto = match fs::read_to_string(pasta.join(MANIFESTO)) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return vec!["O pacote não tem o imsmanifest.xml na raiz.".to_string()];
        }
        Err(e) => return vec![erro_io("ler o imsmanifest.xml", &e)],
    };
    let doc = match roxmltree::Document::parse(&texto) {
        Ok(d) => d,
        Err(e) => return vec![format!("O imsmanifest.xml não é XML válido: {e}.")],
    };

    let mut listados = std::collections::BTreeSet::new();
    let mut tem_sco = false;
    for no in doc.descendants().filter(|n| n.is_element()) {
        let tag = no.tag_name().name();
        if tag == "resource" {
            tem_sco |= no
                .attributes()
                .any(|a| a.name() == "scormtype" && a.value() == "sco");
        }
        if !(tag == "file" || tag == "resource") {
            continue;
        }
        let Some(href) = no.attribute("href") else { continue };
        let seguro = !href.is_empty()
            && Path::new(href)
                .components()
                .all(|c| matches!(c, Component::Normal(_)));
        if !seguro {
            problemas.push(format!("Caminho inválido no manifesto: {href}"));
            continue;
        }
        if tag == "file" {
            listados.insert(href.to_string());
        }
        if !caminho_rel(pasta, href).is_file() {
            problemas.push(format!("Arquivo citado no manifesto não existe: {href}"));
        }
    }
    if !tem_sco {
        problemas.push("O manifesto não tem um recurso SCO (adlcp:scormtype=\"sco\").".to_string());
    }

    let mut arquivos = Vec::new();
    let mut ocultos = Vec::new();
    if let Err(e) = varrer(pasta, "", &mut arquivos, &mut ocultos) {
        problemas.push(erro_io("ler a pasta do pacote", &e));
    }
    for o in ocultos {
        problemas.push(format!("Arquivo oculto no pacote: {o}"));
    }
    for a in arquivos {
        if a != MANIFESTO && !listados.contains(&a) {
            problemas.push(format!("Arquivo do pacote não listado no manifesto: {a}"));
        }
    }
    if let Ok(data_js) = fs::read_to_string(pasta.join("js").join("data.js")) {
        for nome in imagens_citadas(&data_js) {
            let ok = imagens::validar_nome_imagem(&nome).is_ok()
                && pasta.join("img").join(&nome).is_file();
            if !ok {
                problemas.push(format!("Imagem citada no conteúdo não existe no pacote: img/{nome}"));
            }
        }
    }
    problemas
}

// ---------- Zip ----------

/// Data/hora atual (UTC) no formato do zip; 1980-01-01 se não der.
pub(crate) fn agora_zip() -> zip::DateTime {
    let segs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dias = (segs / 86_400) as i64;
    let resto = segs % 86_400;
    // Dias desde 1970-01-01 → data civil (algoritmo de H. Hinnant).
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dia = (doy - (153 * mp + 2) / 5 + 1) as u8;
    let mes = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
    let ano = (yoe + era * 400 + i64::from(mes <= 2)) as u16;
    zip::DateTime::from_date_and_time(
        ano,
        mes,
        dia,
        (resto / 3600) as u8,
        ((resto % 3600) / 60) as u8,
        (resto % 60) as u8,
    )
    .unwrap_or_default()
}

/// Compacta o conteúdo de `pasta` em `destino_zip` (deflate), com os
/// arquivos na raiz do zip (sem pasta extra) e sem ocultos. Grava em `.tmp`
/// e renomeia; depois reabre e confere o manifesto na raiz. Devolve o tamanho.
pub fn zipar_em(pasta: &Path, destino_zip: &Path) -> Result<u64, String> {
    let mut arquivos = Vec::new();
    let mut ocultos = Vec::new();
    varrer(pasta, "", &mut arquivos, &mut ocultos).map_err(|e| erro_io("ler a pasta do pacote", &e))?;
    if !arquivos.iter().any(|a| a == MANIFESTO) {
        return Err("O pacote não tem o imsmanifest.xml na raiz.".to_string());
    }

    let mut nome_tmp = destino_zip
        .file_name()
        .ok_or_else(|| "Destino do .zip inválido.".to_string())?
        .to_os_string();
    nome_tmp.push(".tmp");
    let tmp = destino_zip.with_file_name(nome_tmp);

    let resultado = (|| -> Result<(), String> {
        let f = fs::File::create(&tmp).map_err(|e| erro_io("criar o arquivo .zip", &e))?;
        let mut z = zip::ZipWriter::new(f);
        let opcoes = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .last_modified_time(agora_zip())
            .unix_permissions(0o644);
        let erro_zip = |e: zip::result::ZipError| format!("Não foi possível montar o .zip: {e}.");
        for rel in &arquivos {
            let conteudo = fs::read(caminho_rel(pasta, rel)).map_err(|e| erro_io(&format!("ler {rel}"), &e))?;
            z.start_file(rel.as_str(), opcoes).map_err(erro_zip)?;
            z.write_all(&conteudo).map_err(|e| erro_io("gravar o .zip", &e))?;
        }
        let f = z.finish().map_err(erro_zip)?;
        f.sync_all().map_err(|e| erro_io("gravar o .zip", &e))?;
        drop(f);
        conferir_zip(&tmp)?;
        fs::rename(&tmp, destino_zip).map_err(|e| erro_io("gravar o .zip no destino", &e))
    })();
    if let Err(e) = resultado {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::metadata(destino_zip)
        .map(|m| m.len())
        .map_err(|e| erro_io("conferir o .zip", &e))
}

/// Reabre o zip: manifesto na raiz, nenhum oculto, nenhum caminho absoluto
/// ou com `..`, e todo arquivo legível.
pub fn conferir_zip(caminho: &Path) -> Result<Vec<String>, String> {
    let f = fs::File::open(caminho).map_err(|e| erro_io("reabrir o .zip", &e))?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| format!("O .zip gerado está corrompido: {e}."))?;
    let mut nomes = Vec::new();
    for i in 0..z.len() {
        let mut item = z.by_index(i).map_err(|e| format!("O .zip gerado está corrompido: {e}."))?;
        let nome = item
            .name()
            .map_err(|e| format!("O .zip gerado está corrompido: {e}."))?
            .into_owned();
        if nome.starts_with('/') || nome.split('/').any(|p| p == ".." || oculto(p)) {
            return Err(format!("O .zip gerado tem um caminho indevido: {nome}"));
        }
        let mut lixo = Vec::new();
        item.read_to_end(&mut lixo)
            .map_err(|e| format!("O .zip gerado está corrompido ({nome}): {e}."))?;
        nomes.push(nome);
    }
    if !nomes.iter().any(|n| n == MANIFESTO) {
        return Err("O .zip não ficou com o imsmanifest.xml na raiz.".to_string());
    }
    Ok(nomes)
}

// ---------- Exportação ----------

fn ja_existe(mensagem: String) -> String {
    format!("{PREFIXO_JA_EXISTE}{mensagem}")
}

fn montar_e_validar(
    runtime: &Path,
    base: &Path,
    pasta: &Path,
    entrada: &EntradaExportacao,
) -> Result<PacoteMontado, String> {
    let montado = montar_pacote_em(runtime, base, pasta, entrada)?;
    let problemas = validar_pacote_em(pasta);
    if problemas.is_empty() {
        Ok(montado)
    } else {
        Err(format!(
            "O pacote gerado não passou na conferência:\n- {}",
            problemas.join("\n- ")
        ))
    }
}

/// Exporta para `<destino>/<nomePacote>/` (pasta) ou `<destino>/<nomePacote>.zip`.
/// Se o alvo existir e `sobrescrever` for falso, devolve erro com o prefixo
/// `JA_EXISTE:`. A pasta é montada num temporário ao lado e só então troca de
/// lugar com a antiga, para nunca deixar um pacote pela metade.
pub fn exportar_em(
    runtime: &Path,
    base: &Path,
    entrada: &EntradaExportacao,
    destino: &Path,
    formato: Formato,
    sobrescrever: bool,
) -> Result<ResultadoExportacao, String> {
    validar_nome_pacote(&entrada.nome_pacote)?;
    if !destino.is_dir() {
        return Err("A pasta de destino não foi encontrada. Escolha outra pasta.".to_string());
    }
    let nome = &entrada.nome_pacote;
    match formato {
        Formato::Pasta => {
            let alvo = destino.join(nome);
            if alvo.exists() && !alvo.is_dir() {
                return Err(format!(
                    "Já existe um arquivo (não uma pasta) chamado {nome} em {}. Remova-o ou escolha outro destino.",
                    destino.display()
                ));
            }
            if alvo.exists() && !sobrescrever {
                return Err(ja_existe(format!(
                    "Já existe uma pasta {nome} em {}. Substituir pelo pacote novo?",
                    destino.display()
                )));
            }
            let tmp = Temporaria::em(destino, &format!(".{nome}.montando"))
                .map_err(|e| erro_io("preparar a pasta do pacote", &e))?;
            let montado = montar_e_validar(runtime, base, &tmp.0, entrada)?;
            if alvo.exists() {
                let antiga = Temporaria::em(destino, &format!(".{nome}.antigo"))
                    .map_err(|e| erro_io("preparar a substituição", &e))?;
                let _ = fs::remove_dir(&antiga.0);
                fs::rename(&alvo, &antiga.0).map_err(|e| erro_io("substituir a pasta antiga", &e))?;
                if let Err(e) = fs::rename(&tmp.0, &alvo) {
                    let _ = fs::rename(&antiga.0, &alvo); // devolve a antiga
                    return Err(erro_io("colocar o pacote novo no lugar", &e));
                }
                // `antiga` (agora com o pacote anterior) é apagada no drop.
            } else {
                fs::rename(&tmp.0, &alvo).map_err(|e| erro_io("colocar o pacote no destino", &e))?;
            }
            Ok(ResultadoExportacao {
                caminho: alvo.to_string_lossy().into_owned(),
                arquivos: montado.arquivos.len(),
                bytes: montado.bytes,
            })
        }
        Formato::Zip => {
            let alvo = destino.join(format!("{nome}.zip"));
            if alvo.is_dir() {
                return Err(format!(
                    "Já existe uma pasta chamada {nome}.zip em {}. Remova-a ou escolha outro destino.",
                    destino.display()
                ));
            }
            if alvo.exists() && !sobrescrever {
                return Err(ja_existe(format!(
                    "Já existe o arquivo {nome}.zip em {}. Substituir pelo pacote novo?",
                    destino.display()
                )));
            }
            let tmp = Temporaria::em(&std::env::temp_dir(), "scorm-builder-exportar")
                .map_err(|e| erro_io("preparar a pasta temporária", &e))?;
            let pasta = tmp.0.join(nome);
            let montado = montar_e_validar(runtime, base, &pasta, entrada)?;
            let bytes = zipar_em(&pasta, &alvo)?;
            Ok(ResultadoExportacao {
                caminho: alvo.to_string_lossy().into_owned(),
                arquivos: montado.arquivos.len(),
                bytes,
            })
        }
    }
}

// ---------- Preferências ----------

/// Lê `<base>/preferencias.json`. Arquivo ausente ou corrompido = padrão.
pub fn ler_preferencias_em(base: &Path) -> Preferencias {
    match fs::read(base.join(ARQUIVO_PREFERENCIAS)) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|e| {
            eprintln!("[preferencias] arquivo ignorado: {e}");
            Preferencias::default()
        }),
        Err(_) => Preferencias::default(),
    }
}

pub fn salvar_preferencias_em(base: &Path, prefs: &Preferencias) -> Result<(), String> {
    fs::create_dir_all(base).map_err(|e| erro_io("criar a pasta de dados", &e))?;
    let json = serde_json::to_vec_pretty(prefs)
        .map_err(|e| format!("Não foi possível preparar as preferências: {e}."))?;
    gravar_atomico(&base.join(ARQUIVO_PREFERENCIAS), &json)
        .map_err(|e| erro_io("salvar as preferências", &e))
}

// ---------- Comandos ----------

fn pasta_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let tem_motor = |p: &Path| p.join("index.html").is_file() && p.join("js").join("motor.js").is_file();
    // Em debug (`tauri dev`), usa a pasta do repositório: sempre a versão atual.
    #[cfg(debug_assertions)]
    {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("runtime");
        if tem_motor(&repo) {
            return Ok(repo);
        }
    }
    let recurso = app
        .path()
        .resource_dir()
        .map_err(|_| "Não foi possível localizar os recursos do aplicativo.".to_string())?
        .join("runtime");
    if tem_motor(&recurso) {
        Ok(recurso)
    } else {
        Err("O motor do pacote não foi encontrado nos recursos do aplicativo. Reinstale o aplicativo.".to_string())
    }
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar a pasta de dados do aplicativo.".to_string())
}

async fn em_segundo_plano<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "A exportação foi interrompida inesperadamente.".to_string())?
}

#[tauri::command]
pub async fn exportar_pacote(
    app: AppHandle,
    entrada: EntradaExportacao,
    destino: String,
    formato: Formato,
    sobrescrever: bool,
) -> Result<ResultadoExportacao, String> {
    let runtime = pasta_runtime(&app)?;
    let base = app_data(&app)?;
    em_segundo_plano(move || exportar_em(&runtime, &base, &entrada, Path::new(&destino), formato, sobrescrever)).await
}

#[tauri::command]
pub async fn ler_preferencias(app: AppHandle) -> Result<Preferencias, String> {
    Ok(ler_preferencias_em(&app_data(&app)?))
}

#[tauri::command]
pub async fn salvar_preferencias(app: AppHandle, preferencias: Preferencias) -> Result<(), String> {
    salvar_preferencias_em(&app_data(&app)?, &preferencias)
}

// ---------- Testes ----------

#[cfg(test)]
mod testes {
    use super::*;

    struct PastaTemp(PathBuf);
    impl PastaTemp {
        fn nova() -> Self {
            static N: AtomicUsize = AtomicUsize::new(0);
            let p = std::env::temp_dir().join(format!(
                "scorm-builder-exp-teste-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            PastaTemp(p)
        }
    }
    impl Drop for PastaTemp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn runtime() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("runtime")
    }

    const TITULO: &str = "Gestão & ação: <UEL> \"jurídica\"";

    fn entrada() -> EntradaExportacao {
        EntradaExportacao {
            nome_pacote: "CTGESTAO_UD11_LEITURA2".into(),
            titulo: TITULO.into(),
            data_js: "/* gerado pelo SCORM Builder */\nwindow.CONTEUDO = {\"formato\":2,\"id\":\"CTGESTAO_UD11_LEITURA2\",\"contexto\":\"Curso · UD 11\",\"titulo\":\"Gestão\",\"slides\":[{\"id\":\"s-1\",\"tipo\":\"capa\",\"kicker\":\"K\",\"titulo\":\"T\",\"sub\":\"S\"},{\"id\":\"s-2\",\"tipo\":\"fim\",\"titulo\":\"Fim\",\"texto\":\"Ok\"}]};\n".into(),
            projeto_id: None,
            imagens: Vec::new(),
        }
    }

    /// Base de dados sem rascunhos (pacotes sem imagem não a leem).
    fn sem_base() -> PathBuf {
        std::env::temp_dir().join("scorm-builder-sem-base-inexistente")
    }

    fn arquivos_da_pasta(p: &Path) -> Vec<String> {
        let (mut a, mut o) = (Vec::new(), Vec::new());
        varrer(p, "", &mut a, &mut o).unwrap();
        a.extend(o);
        a.sort();
        a
    }

    #[test]
    fn manifesto_escapa_titulo_e_lista_todos_os_arquivos() {
        let t = PastaTemp::nova();
        let pasta = t.0.join("P");
        let m = montar_pacote_em(&runtime(), &sem_base(), &pasta, &entrada()).unwrap();
        let xml = fs::read_to_string(pasta.join(MANIFESTO)).unwrap();
        assert!(xml.contains("<title>Gestão &amp; ação: &lt;UEL&gt; &quot;jurídica&quot;</title>"));
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let titulos: Vec<_> = doc
            .descendants()
            .filter(|n| n.has_tag_name("title"))
            .map(|n| n.text().unwrap())
            .collect();
        assert_eq!(titulos, vec![TITULO, TITULO]);
        assert_eq!(doc.root_element().attribute("identifier"), Some("CTGESTAO_UD11_LEITURA2"));
        let res = doc.descendants().find(|n| n.has_tag_name("resource")).unwrap();
        assert_eq!(res.attribute("href"), Some("index.html"));
        assert_eq!(
            res.attribute(("http://www.adlnet.org/xsd/adlcp_rootv1p2", "scormtype")),
            Some("sco")
        );

        let mut listados: Vec<String> = doc
            .descendants()
            .filter(|n| n.has_tag_name("file"))
            .map(|n| n.attribute("href").unwrap().to_string())
            .collect();
        listados.push(MANIFESTO.into());
        listados.sort();
        assert_eq!(listados, arquivos_da_pasta(&pasta));
        assert_eq!(m.arquivos.len(), listados.len());
        for esperado in [
            "index.html",
            "js/data.js",
            "js/motor.js",
            "js/scorm.js",
            "css/tema.css",
            "fonts/poppins-400.woff2",
            "fonts/LICENSE-Poppins-OFL.txt",
        ] {
            assert!(listados.iter().any(|l| l == esperado), "falta {esperado}");
        }
        assert!(!listados.iter().any(|l| l.starts_with("test/") || l == "ORIGEM.md"));

        let html = fs::read_to_string(pasta.join("index.html")).unwrap();
        assert!(!html.contains("{{TITULO}}"));
        assert_eq!(html.matches("Gestão &amp; ação: &lt;UEL&gt; &quot;jurídica&quot;").count(), 2);
        assert_eq!(fs::read_to_string(pasta.join("js/data.js")).unwrap(), entrada().data_js);
        assert!(validar_pacote_em(&pasta).is_empty());
    }

    #[test]
    fn validacao_detecta_faltando_nao_listado_oculto_e_xml_invalido() {
        let t = PastaTemp::nova();
        let pasta = t.0.join("P");
        montar_pacote_em(&runtime(), &sem_base(), &pasta, &entrada()).unwrap();

        fs::remove_file(pasta.join("js/scorm.js")).unwrap();
        fs::write(pasta.join("extra.txt"), "x").unwrap();
        fs::write(pasta.join(".DS_Store"), "x").unwrap();
        let p = validar_pacote_em(&pasta);
        assert!(p.iter().any(|x| x.contains("não existe: js/scorm.js")), "{p:?}");
        assert!(p.iter().any(|x| x.contains("não listado no manifesto: extra.txt")), "{p:?}");
        assert!(p.iter().any(|x| x.contains("oculto no pacote: .DS_Store")), "{p:?}");

        fs::write(pasta.join(MANIFESTO), "<manifest><sem-fechar></manifest>").unwrap();
        let p = validar_pacote_em(&pasta);
        assert_eq!(p.len(), 1);
        assert!(p[0].contains("não é XML válido"));

        fs::remove_file(pasta.join(MANIFESTO)).unwrap();
        assert!(validar_pacote_em(&pasta)[0].contains("não tem o imsmanifest.xml"));
    }

    #[test]
    fn oculto_no_runtime_nao_entra_no_pacote() {
        let t = PastaTemp::nova();
        // Cópia do runtime real com sujeira: .DS_Store, test/, ORIGEM.md, data.js antigo.
        let rt = t.0.join("runtime");
        let mut arqs = Vec::new();
        let mut ocultos = Vec::new();
        varrer(&runtime(), "", &mut arqs, &mut ocultos).unwrap();
        for a in &arqs {
            let d = caminho_rel(&rt, a);
            fs::create_dir_all(d.parent().unwrap()).unwrap();
            fs::copy(caminho_rel(&runtime(), a), d).unwrap();
        }
        fs::write(rt.join(".DS_Store"), "x").unwrap();
        fs::write(rt.join("css/.DS_Store"), "x").unwrap();
        fs::create_dir_all(rt.join("fonts/.cache")).unwrap();
        fs::write(rt.join("fonts/.cache/a"), "x").unwrap();
        fs::write(rt.join("js/data.js"), "antigo").unwrap();
        fs::create_dir_all(rt.join("test")).unwrap();
        fs::write(rt.join("test/x.mjs"), "x").unwrap();

        let pasta = t.0.join("P");
        montar_pacote_em(&rt, &sem_base(), &pasta, &entrada()).unwrap();
        let lista = arquivos_da_pasta(&pasta);
        assert!(!lista.iter().any(|a| a.split('/').any(|p| p.starts_with('.'))), "{lista:?}");
        assert!(!lista.iter().any(|a| a.starts_with("test/") || a == "ORIGEM.md"));
        assert_eq!(fs::read_to_string(pasta.join("js/data.js")).unwrap(), entrada().data_js);
        assert!(validar_pacote_em(&pasta).is_empty());
    }

    #[test]
    fn zip_tem_manifesto_na_raiz_sem_pasta_extra_e_sem_ocultos() {
        let t = PastaTemp::nova();
        let pasta = t.0.join("CTGESTAO_UD11_LEITURA2");
        let m = montar_pacote_em(&runtime(), &sem_base(), &pasta, &entrada()).unwrap();
        fs::write(pasta.join(".DS_Store"), "x").unwrap();
        let zip = t.0.join("saida.zip");
        let bytes = zipar_em(&pasta, &zip).unwrap();
        assert_eq!(bytes, fs::metadata(&zip).unwrap().len());
        assert!(!t.0.join("saida.zip.tmp").exists());

        let mut nomes = conferir_zip(&zip).unwrap();
        nomes.sort();
        let mut esperado = m.arquivos.clone();
        esperado.sort();
        assert_eq!(nomes, esperado);
        assert!(nomes.iter().all(|n| !n.starts_with("CTGESTAO_UD11_LEITURA2/")));

        let mut z = zip::ZipArchive::new(fs::File::open(&zip).unwrap()).unwrap();
        let item = z.by_name("js/motor.js").unwrap();
        assert_eq!(item.compression(), zip::CompressionMethod::Deflated);
        drop(item);
        let mut data = String::new();
        z.by_name("js/data.js").unwrap().read_to_string(&mut data).unwrap();
        assert_eq!(data, entrada().data_js);

        // Sem manifesto: recusa e não deixa zip nem .tmp.
        fs::remove_file(pasta.join(MANIFESTO)).unwrap();
        let outro = t.0.join("outro.zip");
        assert!(zipar_em(&pasta, &outro).unwrap_err().contains("imsmanifest"));
        assert!(!outro.exists() && !t.0.join("outro.zip.tmp").exists());
    }

    #[test]
    fn nome_de_pacote_invalido_e_recusado() {
        for n in ["", "../X", "A/B", "a_ud1", "CTGESTAO UD1", "ÇA", "_X", "1X", "X.Y", &"A".repeat(101)] {
            assert!(validar_nome_pacote(n).is_err(), "{n:?} deveria ser inválido");
        }
        assert!(validar_nome_pacote("CTGESTAO_UD11_LEITURA2").is_ok());

        let t = PastaTemp::nova();
        let mut e = entrada();
        e.nome_pacote = "../FORA".into();
        assert!(exportar_em(&runtime(), &sem_base(), &e, &t.0, Formato::Pasta, true).is_err());
        assert!(montar_pacote_em(&runtime(), &sem_base(), &t.0.join("P"), &e).is_err());
        assert!(!t.0.join("P").exists());
        assert!(fs::read_dir(&t.0).unwrap().next().is_none());
    }

    #[test]
    fn exportar_pasta_ja_existe_e_sobrescrita_segura() {
        let t = PastaTemp::nova();
        let r = exportar_em(&runtime(), &sem_base(), &entrada(), &t.0, Formato::Pasta, false).unwrap();
        let alvo = t.0.join("CTGESTAO_UD11_LEITURA2");
        assert_eq!(r.caminho, alvo.to_string_lossy());
        assert_eq!(r.arquivos, arquivos_da_pasta(&alvo).len());
        assert!(r.bytes > 100_000);

        // De novo sem sobrescrever: erro identificável e nada muda.
        fs::write(alvo.join("marca.txt"), "antigo").unwrap();
        let erro = exportar_em(&runtime(), &sem_base(), &entrada(), &t.0, Formato::Pasta, false).unwrap_err();
        assert!(erro.starts_with(PREFIXO_JA_EXISTE), "{erro}");
        assert!(alvo.join("marca.txt").exists());

        // Falha na montagem (data.js inválido) com sobrescrever: a pasta antiga fica intacta.
        let mut ruim = entrada();
        ruim.data_js = "lixo".into();
        assert!(exportar_em(&runtime(), &sem_base(), &ruim, &t.0, Formato::Pasta, true).is_err());
        assert!(alvo.join("marca.txt").exists());

        // Sobrescreve: pacote novo completo, sem sobras nem temporários.
        let mut nova = entrada();
        nova.titulo = "Título novo".into();
        exportar_em(&runtime(), &sem_base(), &nova, &t.0, Formato::Pasta, true).unwrap();
        assert!(!alvo.join("marca.txt").exists());
        assert!(fs::read_to_string(alvo.join("index.html")).unwrap().contains("Título novo"));
        assert!(validar_pacote_em(&alvo).is_empty());
        let nomes: Vec<_> = fs::read_dir(&t.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(nomes, vec!["CTGESTAO_UD11_LEITURA2"]);
    }

    #[test]
    fn exportar_zip_ja_existe_e_sobrescreve() {
        let t = PastaTemp::nova();
        let r = exportar_em(&runtime(), &sem_base(), &entrada(), &t.0, Formato::Zip, false).unwrap();
        let alvo = t.0.join("CTGESTAO_UD11_LEITURA2.zip");
        assert_eq!(r.caminho, alvo.to_string_lossy());
        assert_eq!(r.bytes, fs::metadata(&alvo).unwrap().len());
        assert_eq!(conferir_zip(&alvo).unwrap().len(), r.arquivos);

        let erro = exportar_em(&runtime(), &sem_base(), &entrada(), &t.0, Formato::Zip, false).unwrap_err();
        assert!(erro.starts_with(PREFIXO_JA_EXISTE));
        exportar_em(&runtime(), &sem_base(), &entrada(), &t.0, Formato::Zip, true).unwrap();
        let nomes: Vec<_> = fs::read_dir(&t.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(nomes, vec!["CTGESTAO_UD11_LEITURA2.zip"]);

        assert!(
            exportar_em(&runtime(), &sem_base(), &entrada(), &t.0.join("nao-existe"), Formato::Zip, false)
                .unwrap_err()
                .contains("destino não foi encontrada")
        );
    }

    fn entrada_com_imagem(base: &Path) -> (EntradaExportacao, String) {
        let png = crate::imagens::testes::png(800, 600, 3);
        let arq = base.join("foto.png");
        fs::create_dir_all(base).unwrap();
        fs::write(&arq, &png).unwrap();
        let nome = imagens::importar_imagem_em(base, "proj-1", &arq).unwrap().nome;
        let mut e = entrada();
        e.data_js = e.data_js.replace(
            "{\"id\":\"s-2\",\"tipo\":\"fim\"",
            &format!(
                "{{\"id\":\"s-3\",\"tipo\":\"conteudo\",\"kicker\":\"K\",\"titulo\":\"T\",\"blocos\":[{{\"id\":\"b-1\",\"tipo\":\"imagem\",\"src\":\"img/{nome}\",\"alt\":\"Foto\"}}]}},{{\"id\":\"s-2\",\"tipo\":\"fim\""
            ),
        );
        assert!(e.data_js.contains(&format!("img/{nome}")));
        e.projeto_id = Some("proj-1".into());
        e.imagens = vec![nome.clone()];
        (e, nome)
    }

    #[test]
    fn imagens_citadas_no_data_js() {
        let js = r#"window.CONTEUDO = {"a":{"src":"img/0123456789abcdef.png"},"b":{"src" : "img/fedcba9876543210.webp"},"c":{"src":"https://x/y.png"},"d":{"src":"img/0123456789abcdef.png"},"texto":"\"src\": isto é texto"};"#;
        assert_eq!(
            imagens_citadas(js),
            vec!["0123456789abcdef.png", "fedcba9876543210.webp"]
        );
        assert!(imagens_citadas(&entrada().data_js).is_empty());
    }

    #[test]
    fn exportar_copia_as_imagens_para_o_pacote() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        let (e, nome) = entrada_com_imagem(&base);
        let saida = t.0.join("saida");
        fs::create_dir_all(&saida).unwrap();

        let r = exportar_em(&runtime(), &base, &e, &saida, Formato::Pasta, false).unwrap();
        let pasta = PathBuf::from(&r.caminho);
        let rel = format!("img/{nome}");
        assert_eq!(
            fs::read(caminho_rel(&pasta, &rel)).unwrap(),
            fs::read(base.join("rascunhos/proj-1/img").join(&nome)).unwrap()
        );
        let xml = fs::read_to_string(pasta.join(MANIFESTO)).unwrap();
        assert!(xml.contains(&format!("<file href=\"{rel}\"/>")));
        assert!(validar_pacote_em(&pasta).is_empty());

        let z = exportar_em(&runtime(), &base, &e, &saida, Formato::Zip, false).unwrap();
        assert!(conferir_zip(Path::new(&z.caminho)).unwrap().contains(&rel));

        // A validação acusa imagem citada que sumiu do pacote.
        fs::remove_file(caminho_rel(&pasta, &rel)).unwrap();
        let p = validar_pacote_em(&pasta);
        assert!(p.iter().any(|x| x.contains(&format!("Imagem citada no conteúdo não existe no pacote: {rel}"))), "{p:?}");
    }

    #[test]
    fn exportar_com_imagem_faltando_e_erro() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        let (e, nome) = entrada_com_imagem(&base);
        let saida = t.0.join("saida");
        fs::create_dir_all(&saida).unwrap();

        // Imagem citada e ausente do rascunho.
        fs::remove_file(base.join("rascunhos/proj-1/img").join(&nome)).unwrap();
        let erro = exportar_em(&runtime(), &base, &e, &saida, Formato::Pasta, false).unwrap_err();
        assert!(erro.contains(&nome) && erro.contains("não foi encontrada no rascunho"), "{erro}");
        assert!(fs::read_dir(&saida).unwrap().next().is_none(), "não pode sobrar pacote pela metade");

        // Imagem citada no data.js, mas fora da lista enviada.
        let (mut e2, nome2) = entrada_com_imagem(&base);
        e2.imagens.clear();
        let erro = exportar_em(&runtime(), &base, &e2, &saida, Formato::Zip, false).unwrap_err();
        assert!(erro.contains(&format!("img/{nome2}")) && erro.contains("não foi enviada"), "{erro}");

        // Lista com imagem, mas sem o id do projeto.
        let (mut e3, _) = entrada_com_imagem(&base);
        e3.projeto_id = None;
        assert!(exportar_em(&runtime(), &base, &e3, &saida, Formato::Pasta, false)
            .unwrap_err()
            .contains("identificação do projeto"));

        // Nome inválido (path traversal) e id inválido.
        let (mut e4, _) = entrada_com_imagem(&base);
        e4.imagens.push("../../etc/passwd".into());
        assert!(exportar_em(&runtime(), &base, &e4, &saida, Formato::Pasta, false).unwrap_err().contains("inválido"));
        let (mut e5, _) = entrada_com_imagem(&base);
        e5.projeto_id = Some("../fora".into());
        assert!(exportar_em(&runtime(), &base, &e5, &saida, Formato::Pasta, false).unwrap_err().contains("Identificador"));
        assert!(fs::read_dir(&saida).unwrap().next().is_none());
    }

    #[test]
    fn preferencias_ida_e_volta() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        assert_eq!(ler_preferencias_em(&base), Preferencias::default());
        let p = Preferencias {
            ultimo_destino: Some("/Users/x/Área de Trabalho".into()),
            pasta_ead_scorm: None,
        };
        salvar_preferencias_em(&base, &p).unwrap();
        assert_eq!(ler_preferencias_em(&base), p);
        let json = fs::read_to_string(base.join(ARQUIVO_PREFERENCIAS)).unwrap();
        assert!(json.contains("\"ultimoDestino\"") && !json.contains("pastaEadScorm"));
        fs::write(base.join(ARQUIVO_PREFERENCIAS), "{ lixo").unwrap();
        assert_eq!(ler_preferencias_em(&base), Preferencias::default());
    }

    /// Ponta a ponta sem UI: monta, valida e zipa a partir de um data.js real.
    /// Rodar com `SCORM_E2E_DATAJS=<data.js> SCORM_E2E_SAIDA=<pasta> cargo test e2e -- --ignored`.
    #[test]
    #[ignore]
    fn e2e_pacote_de_data_js_real() {
        let data_js = std::env::var("SCORM_E2E_DATAJS").expect("SCORM_E2E_DATAJS");
        let saida = PathBuf::from(std::env::var("SCORM_E2E_SAIDA").expect("SCORM_E2E_SAIDA"));
        let titulo = std::env::var("SCORM_E2E_TITULO").unwrap_or_else(|_| "Pacote de teste".into());
        let nome = std::env::var("SCORM_E2E_NOME").unwrap_or_else(|_| "CTGESTAO_UD11_LEITURA2".into());
        fs::create_dir_all(&saida).unwrap();
        let e = EntradaExportacao {
            nome_pacote: nome,
            titulo,
            data_js: fs::read_to_string(data_js).unwrap(),
            projeto_id: None,
            imagens: Vec::new(),
        };
        let p = exportar_em(&runtime(), &sem_base(), &e, &saida, Formato::Pasta, true).unwrap();
        let z = exportar_em(&runtime(), &sem_base(), &e, &saida, Formato::Zip, true).unwrap();
        assert!(validar_pacote_em(Path::new(&p.caminho)).is_empty());
        println!("PASTA {} {} arquivos {} bytes", p.caminho, p.arquivos, p.bytes);
        println!("ZIP {} {} arquivos {} bytes", z.caminho, z.arquivos, z.bytes);
    }
}
