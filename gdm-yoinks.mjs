#!/usr/bin/env node
// gdm-yoinks — protótipo. Baixa mídia do X/Twitter como WEBM (VP9 ou AV1, com Opus,
// até 720p, menor arquivo) ou como GIF de verdade (convertido do MP4 que o X guarda).
// Sem dependências: Node ≥ 18, yt-dlp e ffmpeg/ffprobe no PATH.
//
// Uso: node gdm-yoinks.mjs <url> [-o pasta] [--formato webm|av1|gif]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const VERSAO = "0.1.0";

// ── Paleta do sistemaGDM (docs/paleta.md, tema «Fósforo») ─────────────────────
const PALETA = {
  fundo: "#101119",
  superficie: "#191c1a",
  borda: "#2c3330",
  texto: "#e4e6e4",
  fraco: "#8a9690",
  acento: "#96E072", // --p4
  sobreAcento: "#0e1020",
  perigo: "#d2564f",
  superficie2: "#212623",
  p2: "#3E8914",
  p3: "#3DA35D",
  p4: "#96E072",
  p5: "#E8FCCF",
  pico: "#FFFFFF",
};

const semCor = "NO_COLOR" in process.env || !process.stdout.isTTY;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";");
const cor = (hex, s) => (semCor ? s : `\x1b[38;2;${rgb(hex)}m${s}\x1b[39m`);
const fundo = (hex, s) => (semCor ? s : `\x1b[48;2;${rgb(hex)}m${s}\x1b[49m`);
const negrito = (s) => (semCor ? s : `\x1b[1m${s}\x1b[22m`);

const t = {
  texto: (s) => cor(PALETA.texto, s),
  fraco: (s) => cor(PALETA.fraco, s),
  borda: (s) => cor(PALETA.borda, s),
  acento: (s) => cor(PALETA.acento, s),
  pico: (s) => negrito(cor(PALETA.pico, s)),
  perigo: (s) => cor(PALETA.perigo, s),
  selo: (s) => negrito(fundo(PALETA.acento, cor(PALETA.sobreAcento, ` ${s} `))),
};

// ── Utilidades ────────────────────────────────────────────────────────────────
function formataBytes(n) {
  if (!n || n <= 0) return "?";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function falha(msg, codigo = 1) {
  letreiro.para();
  process.stderr.write(`\n${t.perigo("✖")} ${t.texto(msg)}\n`);
  process.exit(codigo);
}

/** Roda um programa e devolve { codigo, saida, erro }. `aoLer` recebe cada linha. */
function roda(cmd, args, aoLer) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let saida = "", erro = "", resto = "";
    const linhas = (buf, guarda) => {
      const s = buf.toString();
      guarda(s);
      if (!aoLer) return;
      resto += s;
      const partes = resto.split(/\r?\n|\r/);
      resto = partes.pop();
      partes.forEach(aoLer);
    };
    p.stdout.on("data", (b) => linhas(b, (s) => (saida += s)));
    p.stderr.on("data", (b) => linhas(b, (s) => (erro += s)));
    p.on("error", (e) => resolve({ codigo: -1, saida, erro: e.message }));
    p.on("close", (codigo) => resolve({ codigo, saida, erro }));
  });
}

function achaYtDlp() {
  const doYoinks = path.join(os.homedir(), ".yoinks", "bin", "yt-dlp.exe");
  return fs.existsSync(doYoinks) && !temNoPath("yt-dlp") ? doYoinks : "yt-dlp";
}

function temNoPath(nome) {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  return (process.env.PATH ?? "").split(path.delimiter).some((d) =>
    exts.some((e) => fs.existsSync(path.join(d, nome + e))));
}

// ── Logo e letreiro em binário ────────────────────────────────────────────────
// O logo vem de logo.md, ao lado deste script: as linhas de «.» e «%» são o
// desenho, e a linha de 0/1 é «G.D.M. Extractor» em binário. Se o arquivo
// faltar, o cabeçalho cai para o selo simples.
function leLogo() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const linhas = fs.readFileSync(path.join(dir, "logo.md"), "utf8").split(/\r?\n/);
    const desenho = linhas.filter((l) => /^[.%]+$/.test(l));
    const binario = linhas.find((l) => /^[01 ]+$/.test(l) && /[01]/.test(l));
    return desenho.length ? { desenho, binario: binario?.trim() } : null;
  } catch { return null; }
}

/** «G.D.M. Extractor» em binário, para quando logo.md não tiver a linha. */
const emBinario = (s) => [...s].map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");

/** Pinta uma linha do logo: «%» na cor da rampa, «.» como trama discreta. */
function pintaDesenho(linha, hexLetra) {
  if (semCor) return linha;
  return linha.replace(/%+|\.+/g, (trecho) =>
    trecho[0] === "%" ? negrito(cor(hexLetra, trecho)) : cor(PALETA.borda, trecho));
}

// Rampa da paleta, de cima para baixo: as letras clareiam no topo e afundam
// no pé, como a rampa --p5 → --p2 do sistemaGDM.
const RAMPA_LOGO = [PALETA.p5, PALETA.p4, PALETA.p4, PALETA.p3, PALETA.p2, PALETA.p2];

// O letreiro é a barra «novo no acervo» do catálogo do sistemaGDM trazida
// para o terminal: uma fita que anda para a esquerda, com ★ em --p4 como
// costura entre uma volta e a próxima, sobre --superficie-2.
//
// Ele fica ACIMA de tudo o que é impresso depois, então cada quadro sobe até
// a linha dele e volta (salva/restaura o cursor). Para saber quanto subir,
// `process.stdout.write` é observado: cada «\n» é uma linha a mais abaixo do
// letreiro, e cada «\x1b[NA» (o menu redesenhando) são N a menos.
const letreiro = {
  id: null, abaixo: 0, passo: 0, fita: "", largura: 0, escritaOriginal: null,

  inicia(binario, largura) {
    this.fita = `${binario}  ★  `;
    this.largura = largura;
    if (!process.stdout.isTTY || semCor) { console.log("  " + this.quadro()); return; }
    process.stdout.write("\x1b[?25l"); // cursor escondido enquanto anda
    process.on("exit", () => process.stdout.write("\x1b[?25h"));
    process.on("SIGINT", () => { this.para(); process.exit(130); });
    this.desenhaAqui();
    this.observaSaida();
    this.id = setInterval(() => this.avanca(), 70);
  },

  /** O trecho visível da fita, a partir do passo atual, já colorido. */
  quadro() {
    const n = this.fita.length;
    let s = "";
    for (let i = 0; i < this.largura; i++) s += this.fita[(this.passo + i) % n];
    if (semCor) return s;
    const pintado = s.replace(/1+|0+|★/g, (t) =>
      t === "★" ? cor(PALETA.p4, t) : t[0] === "1" ? cor(PALETA.acento, t) : cor(PALETA.fraco, t));
    return fundo(PALETA.superficie2, ` ${pintado} `);
  },

  desenhaAqui() { process.stdout.write(`  ${this.quadro()}\n`); },

  observaSaida() {
    this.escritaOriginal = process.stdout.write.bind(process.stdout);
    process.stdout.write = (dado, ...resto) => {
      const s = String(dado);
      this.abaixo += (s.match(/\n/g)?.length ?? 0);
      for (const m of s.matchAll(/\x1b\[(\d+)A/g)) this.abaixo -= Number(m[1]);
      return this.escritaOriginal(dado, ...resto);
    };
  },

  avanca() {
    this.passo = (this.passo + 1) % this.fita.length;
    const subir = this.abaixo + 1;
    // Se o letreiro já rolou para fora da tela, subir até ele bagunçaria a
    // saída; nesse caso ele simplesmente para.
    if (subir >= (process.stdout.rows ?? 24)) return this.para();
    this.escritaOriginal(`\x1b7\x1b[${subir}A\r\x1b[2K  ${this.quadro()}\x1b8`);
  },

  para() {
    if (this.id) clearInterval(this.id);
    this.id = null;
    if (this.escritaOriginal) process.stdout.write = this.escritaOriginal;
    this.escritaOriginal = null;
  },
};

function cabecalho() {
  const logo = leLogo();
  const binario = logo?.binario ?? emBinario("G.D.M. Extractor");
  const colunas = process.stdout.columns ?? 80;
  const larguraLogo = logo ? Math.max(...logo.desenho.map((l) => l.length)) : 0;

  console.log("");
  if (logo && colunas >= larguraLogo + 4) {
    logo.desenho.forEach((l, i) =>
      console.log("  " + pintaDesenho(l, RAMPA_LOGO[Math.min(i, RAMPA_LOGO.length - 1)])));
    letreiro.inicia(binario, larguraLogo - 2); // -2: o espaço de cada lado do fundo
  } else {
    // Terminal estreito: o logo não cabe sem quebrar, fica só o selo.
    console.log(`  ${t.selo("gdm-extractor")}`);
    letreiro.inicia(binario, Math.max(20, colunas - 6));
  }
  console.log(`  ${t.fraco(`gdm-extractor v${VERSAO} · X/Twitter`)}\n`);
}

// ── Spinner e barra de progresso ──────────────────────────────────────────────
const QUADROS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function spinner(texto) {
  if (!process.stdout.isTTY) { console.log(t.fraco(`… ${texto}`)); return { para() {}, muda() {} }; }
  let i = 0;
  const desenha = () => process.stdout.write(`\r\x1b[2K  ${t.acento(QUADROS[i++ % QUADROS.length])} ${t.texto(texto)}`);
  desenha();
  const id = setInterval(desenha, 80);
  return {
    muda(novo) { texto = novo; },
    para(final) {
      clearInterval(id);
      process.stdout.write(`\r\x1b[2K${final ? `  ${final}\n` : ""}`);
    },
  };
}

// A barra deixa o cursor no fim da linha dela; quem imprime depois chama
// garanteNovaLinha() para descer uma vez só, sem deixar linhas em branco.
let linhaAberta = false;
function garanteNovaLinha() {
  if (linhaAberta && process.stdout.isTTY) process.stdout.write("\n");
  linhaAberta = false;
}

function barra(rotulo, fracao, extra = "") {
  linhaAberta = true;
  const largura = 28;
  const cheio = Math.round(Math.max(0, Math.min(1, fracao)) * largura);
  const desenho = cor(PALETA.acento, "━".repeat(cheio)) + t.borda("━".repeat(largura - cheio));
  const pct = `${Math.round(fracao * 100)}`.padStart(3);
  const linha = `  ${t.texto(rotulo.padEnd(12))} ${desenho} ${t.pico(pct + "%")} ${t.fraco(extra)}`;
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${linha}`);
}

// ── Argumentos ────────────────────────────────────────────────────────────────
function leArgs(argv) {
  const op = { url: null, saida: path.join(os.homedir(), "Downloads"), formato: null, gifFps: 15, gifLargura: 480 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") ajuda();
    else if (a === "-v" || a === "--version") { console.log(VERSAO); process.exit(0); }
    else if (a === "-o" || a === "--out") op.saida = argv[++i];
    else if (a === "--formato") op.formato = argv[++i];
    else if (a === "--gif-fps") op.gifFps = Number(argv[++i]);
    else if (a === "--gif-largura") op.gifLargura = Number(argv[++i]);
    else if (a.startsWith("-")) falha(`Opção desconhecida: ${a}`, 2);
    else op.url = a;
  }
  // Sem URL, ela é pedida depois do cabeçalho (ver pedeUrl), como no yoinks.
  if (op.url && !eUrlDoX(op.url)) falha(MSG_URL_INVALIDA, 2);
  if (op.formato && !["webm", "av1", "gif"].includes(op.formato)) falha("--formato aceita webm, av1 ou gif.", 2);
  if (!(op.gifFps > 0) || !(op.gifLargura > 0)) falha("--gif-fps e --gif-largura precisam ser números positivos.", 2);
  return op;
}

const MSG_URL_INVALIDA = "A URL não parece um post do X/Twitter (…/usuario/status/123).";
const eUrlDoX = (s) => /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[^/\s]+\/status\/\d+\S*$/i.test(s.trim());

// ── Entrada da URL (sem argumento) ────────────────────────────────────────────
/** Lê a área de transferência sem travar o início (o PowerShell demora a abrir). */
function leAreaDeTransferencia() {
  const cmds = process.platform === "win32" ? [["powershell", ["-NoProfile", "-Command", "Get-Clipboard"]]]
    : process.platform === "darwin" ? [["pbpaste", []]]
    : [["wl-paste", ["--no-newline"]], ["xclip", ["-selection", "clipboard", "-o"]]];
  return (async () => {
    for (const [cmd, args] of cmds) {
      const r = await roda(cmd, args);
      if (r.codigo === 0) return r.saida.trim();
    }
    return "";
  })();
}

/**
 * Campo de texto da URL, no estilo do yoinks: se a área de transferência já tem
 * um link do X, a dica oferece Tab para colá-lo; colar um link válido com o
 * campo vazio já envia. Enter envia, Esc/Ctrl+C sai.
 */
function pedeUrl(promessaClip) {
  if (!process.stdin.isTTY) falha("Informe a URL de um post do X/Twitter. Veja --help.", 2);
  return new Promise((resolve) => {
    let valor = "", aviso = "", clip = "";
    const PLACEHOLDER = "https://x.com/usuario/status/…";

    const desenha = () => {
      const campo = valor ? t.texto(valor) : t.borda(PLACEHOLDER);
      const cursor = semCor ? "_" : fundo(PALETA.acento, " ");
      const dica = aviso ? t.perigo(aviso)
        : clip && !valor ? t.fraco("link na área de transferência — ") + t.acento("tab") + t.fraco(" para colar")
        : clip && valor === clip ? t.fraco("da área de transferência — ") + t.acento("enter") + t.fraco(" para baixar")
        : t.borda("cole o link · enter baixar · esc sair");
      // Duas linhas (campo e dica); o cursor volta para a do campo.
      process.stdout.write(`\r\x1b[2K  ${t.acento("›")} ${valor ? campo + cursor : cursor + campo}\n\x1b[2K    ${dica}\x1b[1A\r`);
    };

    console.log(`  ${t.texto("Cole a URL do post:")}`);
    desenha();
    promessaClip.then((s) => { if (eUrlDoX(s)) { clip = s; desenha(); } });

    process.stdin.setRawMode(true);
    process.stdin.resume();
    const fim = (url) => {
      process.stdin.removeListener("data", aoLer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      // Fixa o campo com o link escolhido e apaga a dica; a próxima saída
      // ocupa a linha onde a dica estava.
      const final = url ? `${t.acento("✔")} ${t.texto(url)}` : t.fraco("cancelado.");
      process.stdout.write(`\r\x1b[2K  ${final}\n\x1b[2K`);
      if (!url) { letreiro.para(); process.stdout.write("\n"); process.exit(0); }
      resolve(url);
    };
    const envia = () => {
      if (eUrlDoX(valor)) return fim(valor.trim());
      aviso = valor ? MSG_URL_INVALIDA : "cole um link primeiro";
      desenha();
    };
    const aoLer = (buf) => {
      const s = buf.toString("utf8");
      aviso = "";
      if (s === "\x03" || s === "\x1b") return fim(null);         // Ctrl+C / Esc
      if (s === "\r" || s === "\n") return envia();
      if (s === "\t") { if (clip) valor = clip; return desenha(); }
      if (s === "\x7f" || s === "\b") { valor = valor.slice(0, -1); return desenha(); }
      if (s === "\x15") { valor = ""; return desenha(); }          // Ctrl+U limpa
      if (s.startsWith("\x1b")) return;                           // setas etc.: ignora
      const texto = s.replace(/[\x00-\x1f\x7f]/g, "");
      if (!texto) return;
      const colou = texto.length > 1 && valor === "";
      valor += texto;
      if (colou && eUrlDoX(valor)) return fim(valor.trim());     // colou um link: vai direto
      desenha();
    };
    process.stdin.on("data", aoLer);
  });
}

function ajuda() {
  console.log(`
${t.selo("gdm-extractor")} ${t.fraco(`v${VERSAO} · protótipo`)}

${t.texto("Uso:")} gdm-extractor ${t.acento("[url do X]")} [opções]
     ${t.fraco("sem url: pede o link (Tab cola o que estiver na área de transferência)")}

${t.texto("Opções:")}
  ${t.acento("-o, --out <pasta>")}      ${t.fraco("destino (padrão: ~/Downloads)")}
  ${t.acento("--formato webm|av1|gif")} ${t.fraco("pula o menu (webm = VP9, av1 = WEBM AV1)")}
  ${t.acento("--gif-fps <n>")}          ${t.fraco("quadros por segundo do GIF (padrão 15)")}
  ${t.acento("--gif-largura <n>")}      ${t.fraco("largura máxima do GIF em px (padrão 480)")}
  ${t.acento("-h, --help / -v")}        ${t.fraco("ajuda / versão")}
`);
  process.exit(0);
}

// ── Análise da mídia ──────────────────────────────────────────────────────────
// Mesma seleção do download WEBM: com ela, o -J já devolve em
// `requested_formats` o que seria baixado, e o tamanho da fonte sai daí.
const SELECAO_WEBM = ["-f", "bv*+ba/b", "-S", "res:720,vcodec:vp9,acodec:opus,+size"];

// Os dois sabores de WEBM. Mudam só a preferência de codec no -S e o
// codificador do re-encode; o resto (scale, Opus, nome do arquivo) é igual.
// AV1: libaom com -cpu-used 6 e tiles para não ficar lento demais; o CRF do
// AV1 vai de 0 a 63, e 38 dá tamanho/qualidade parecidos com o VP9 a 36.
const CODECS_WEBM = {
  webm: { nome: "VP9", sort: "vp9",
    encoder: "-c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 4" },
  av1: { nome: "AV1", sort: "av01",
    encoder: "-c:v libaom-av1 -crf 38 -b:v 0 -row-mt 1 -tiles 2x2 -cpu-used 6" },
};

/** Lado menor do quadro: é o que o «res» do -S compara. */
const resDe = (f) => (f.width && f.height ? Math.min(f.width, f.height) : f.height);

/** Tamanho de um formato: o informado, o aproximado, ou bitrate × duração. */
const tamanhoDe = (f, duracao) =>
  f.filesize ?? f.filesize_approx ?? (f.tbr && duracao ? f.tbr * 125 * duracao : undefined);

async function analisa(ytdlp, url) {
  const r = await roda(ytdlp, ["-J", "--no-warnings", "--no-playlist", ...SELECAO_WEBM, url]);
  if (r.codigo !== 0) {
    const msg = (r.erro.match(/ERROR:.*$/m) ?? [r.erro.trim() || "yt-dlp falhou"])[0];
    falha(msg.replace(/^ERROR:\s*(\[\w+\]\s*)?/, ""));
  }
  let info = JSON.parse(r.saida);
  let total = 1;
  if (info._type === "playlist") { // post com várias mídias: usa a primeira
    total = info.entries.length;
    info = info.entries[0];
  }
  const formatos = info.formats ?? [];
  // O X guarda GIFs como MP4 sem áudio em /tweet_video/.
  const fonteGif = formatos.find((f) => /\/tweet_video\//.test(f.url ?? ""));
  const eGif = Boolean(fonteGif);

  const vp9Nativo = formatos.some((f) => /^vp0?9/.test(f.vcodec ?? ""));
  const pedidos = info.requested_formats ?? [info];
  // O -S do AV1 também escolhe primeiro a resolução (a maior ≤ 720) e só
  // depois o codec. Então só há AV1 nativo se existir um av01 exatamente na
  // resolução que a seleção do VP9 pegou; um av01 só em 1080p não conta.
  const resEscolhida = resDe(pedidos.find((f) => f.vcodec !== "none") ?? pedidos[0]);
  const av1Nativo = formatos.some((f) => /^av01/.test(f.vcodec ?? "") && resDe(f) === resEscolhida);

  // O yt-dlp nem sempre informa dimensões e fps (nos GIFs do X, nada): o
  // ffprobe completa, lendo o vídeo escolhido. O tamanho medido só vale para
  // GIFs, que são um MP4 direto; em vídeos HLS a URL é uma playlist .m3u8 e o
  // «tamanho» seria o da playlist.
  const video = fonteGif ?? pedidos.find((f) => f.vcodec !== "none") ?? pedidos[0];
  const sonda = video?.url ? await sondaRemoto(video.url) : {};
  const duracao = info.duration ?? sonda.duracao;
  const tamanhos = pedidos.map((f) => tamanhoDe(f, duracao));
  const tamanho = tamanhos.every(Boolean) ? tamanhos.reduce((a, b) => a + b, 0)
    : eGif ? sonda.tamanho : undefined;
  return {
    info, eGif, total, vp9Nativo, av1Nativo,
    partes: pedidos.length, // vídeo + áudio separados = 2 downloads
    largura: info.width ?? sonda.largura,
    altura: info.height ?? sonda.altura,
    fps: info.fps ?? sonda.fps,
    duracao,
    tamanho,
  };
}

async function sondaRemoto(url) {
  const r = await roda("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate:format=duration,size", "-of", "json", url]);
  if (r.codigo !== 0) return {};
  try {
    const j = JSON.parse(r.saida);
    const s = j.streams?.[0] ?? {};
    const [n, d] = (s.avg_frame_rate ?? "0/1").split("/").map(Number);
    return {
      largura: s.width, altura: s.height,
      fps: d ? Math.round((n / d) * 100) / 100 : undefined,
      duracao: Number(j.format?.duration) || undefined,
      tamanho: Number(j.format?.size) || undefined,
    };
  } catch { return {}; }
}

// ── Cartão de informações ─────────────────────────────────────────────────────
function mostraCartao(m) {
  const titulo = (m.info.title ?? m.info.id).replace(/\s+/g, " ");
  const curto = titulo.length > 58 ? titulo.slice(0, 57) + "…" : titulo;
  const tipo = m.eGif ? "GIF (o X guarda como MP4 sem áudio)" : "vídeo";
  const dims = m.largura ? `${m.largura}×${m.altura}` : "?";
  const linhas = [
    [t.pico(curto)],
    [t.fraco("tipo     "), t.texto(tipo)],
    [t.fraco("fonte    "), t.texto(`${dims} · ${m.fps ? m.fps + " fps" : "? fps"} · ${m.duracao ? m.duracao.toFixed(1) + " s" : "? s"} · ${formataBytes(m.tamanho)}`)],
  ];
  if (m.total > 1) linhas.push([t.fraco("aviso    "), t.texto(`post tem ${m.total} mídias; usando a primeira`)]);
  console.log(t.borda("  ╭" + "─".repeat(64)));
  for (const l of linhas) console.log(t.borda("  │ ") + l.join(""));
  console.log(t.borda("  ╰" + "─".repeat(64)));
}

// ── Menu ──────────────────────────────────────────────────────────────────────
// Custo médio de um GIF com a paleta do §5.3: bytes por pixel por quadro.
// Medido em 2026-11-04: 0,218 (GIF do X, 480×480, 10 fps, 6 s → 2,9 MB) e
// 0,216 (vídeo do X, 480×271, 15 fps, 42 s → 16,8 MB). Varia com o conteúdo.
const BYTES_POR_PIXEL_QUADRO = 0.22;
const GIF_LONGO_S = 15;

function opcoesDoMenu(m, op) {
  const alturaWebm = Math.min(m.altura ?? 720, 720);
  const larguraGif = Math.min(m.largura ?? op.gifLargura, op.gifLargura);
  const fpsGif = m.fps ? Math.min(m.fps, op.gifFps) : op.gifFps;
  const alturaGif = m.largura && m.altura ? Math.round((m.altura * larguraGif) / m.largura) : larguraGif;
  const estimativaGif = m.duracao ? larguraGif * alturaGif * fpsGif * m.duracao * BYTES_POR_PIXEL_QUADRO : 0;
  const longo = m.duracao > GIF_LONGO_S;
  return [
    { id: "webm", rotulo: `WEBM · vp9 ${alturaWebm}p · tamanho mínimo`,
      detalhe: m.vp9Nativo ? "VP9/Opus nativo · sem re-encode" : "re-encode H.264 → VP9/Opus" },
    { id: "av1", rotulo: `WEBM · av1 ${alturaWebm}p · menor ainda`,
      detalhe: m.av1Nativo ? "AV1/Opus nativo · sem re-encode" : "re-encode → AV1/Opus · mais lento" },
    { id: "gif", rotulo: `GIF · ${larguraGif}px · ${fpsGif} fps`,
      detalhe: longo
        ? t.perigo(`vídeo longo (${Math.round(m.duracao)} s) · GIF de ~${formataBytes(estimativaGif)}`)
        : `paleta otimizada · loop infinito${estimativaGif ? ` · ~${formataBytes(estimativaGif)}` : ""}` },
    { id: "sair", rotulo: "Cancelar", detalhe: "" },
  ];
}

function escolhe(opcoes) {
  if (!process.stdin.isTTY) falha("Sem terminal interativo: use --formato webm|av1|gif.", 2);
  return new Promise((resolve) => {
    let sel = 0;
    const desenha = (primeira) => {
      if (!primeira) process.stdout.write(`\x1b[${opcoes.length + 1}A`);
      opcoes.forEach((o, i) => {
        const ativo = i === sel;
        const marca = ativo ? t.acento("›") : " ";
        const num = t.fraco(`${i + 1}`);
        const rot = ativo ? t.pico(o.rotulo) : t.texto(o.rotulo);
        const det = o.detalhe ? "  " + t.fraco(o.detalhe) : "";
        process.stdout.write(`\x1b[2K  ${marca} ${num} ${rot}${det}\n`);
      });
      process.stdout.write(`\x1b[2K  ${t.borda("↑↓ mover · enter escolher · esc sair")}\n`);
    };
    console.log(`\n  ${t.texto("Baixar como:")}`);
    process.stdout.write("\x1b[?25l"); // esconde o cursor
    desenha(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    // pedeUrl deixa o stdin pausado; depois de um pause() explícito, só
    // adicionar o listener não volta a ler — precisa do resume().
    process.stdin.resume();
    const fim = (escolha) => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", tecla);
      process.stdin.pause();
      process.stdout.write("\x1b[?25h\n");
      resolve(escolha);
    };
    const tecla = (_s, k = {}) => {
      if (k.name === "up" || k.name === "k") sel = (sel + opcoes.length - 1) % opcoes.length;
      else if (k.name === "down" || k.name === "j") sel = (sel + 1) % opcoes.length;
      else if (/^[1-9]$/.test(k.sequence ?? "") && Number(k.sequence) <= opcoes.length) sel = Number(k.sequence) - 1;
      else if (k.name === "return") return fim(opcoes[sel].id);
      else if (k.name === "escape" || k.name === "q" || (k.ctrl && k.name === "c")) return fim("sair");
      else return;
      desenha(false);
    };
    process.stdin.on("keypress", tecla);
  });
}

// ── Download com yt-dlp (progresso via --progress-template) ───────────────────
async function baixa(ytdlp, url, args, rotulo, partes, aoFase) {
  // Vídeo e áudio separados chegam como dois downloads seguidos; um total
  // novo na linha de progresso marca o começo da próxima parte.
  let parte = 1, totalAnterior = null;
  const r = await roda(ytdlp, [
    // --print deixa o yt-dlp em modo silencioso; --progress traz a barra de volta.
    ...args, "--no-playlist", "--no-warnings", "--newline", "--progress",
    "--progress-template", "download:@@%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s",
    // Pelo mesmo motivo, as linhas «[VideoConvertor]» não aparecem: o gancho
    // post_process marca o fim do download e o início do pós-processamento.
    "--print", "post_process:@@FASE",
    "--print", "after_move:@@ARQ %(filepath)s",
    url,
  ], (linha) => {
    const p = linha.match(/^@@(\d+)\|(\d+(?:\.\d+)?)/);
    if (p) {
      if (totalAnterior !== null && p[2] !== totalAnterior && parte < partes) parte++;
      totalAnterior = p[2];
      const nome = partes > 1 ? `${rotulo} ${parte}/${partes}` : rotulo;
      return barra(nome, Number(p[1]) / Number(p[2]), formataBytes(Number(p[2])));
    }
    if (linha.startsWith("@@FASE")) aoFase?.();
  });
  if (r.codigo !== 0) {
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
    falha((r.erro.match(/ERROR:.*$/m) ?? ["yt-dlp falhou"])[0]);
  }
  const arq = r.saida.match(/^@@ARQ (.+)$/m)?.[1]?.trim();
  if (!arq || !fs.existsSync(arq)) falha("yt-dlp terminou, mas o arquivo final não foi encontrado.");
  return arq;
}

/** `sabor` é uma chave de CODECS_WEBM: "webm" (VP9) ou "av1". */
async function baixaWebm(ytdlp, url, pasta, m, sabor = "webm") {
  let sp = null;
  const codec = CODECS_WEBM[sabor];
  const nativo = sabor === "av1" ? m.av1Nativo : m.vp9Nativo;
  const arq = await baixa(ytdlp, url, [
    "-f", "bv*+ba/b", "-S", `res:720,vcodec:${codec.sort},acodec:opus,+size`,
    // --recode-video webm não faz nada se o arquivo já sai webm. No AV1 sem
    // fonte AV1, a junção poderia dar um webm VP9 (YouTube) e o re-encode
    // seria pulado; juntar em mkv garante que ele aconteça.
    "--merge-output-format", sabor === "av1" && !nativo ? "mkv" : "webm/mkv",
    "--recode-video", "webm",
    "--postprocessor-args",
    // O scale só reduz quando o lado menor passa de 720 (fontes únicas, como GIFs
    // do X, não têm uma versão menor para o -S escolher).
    "VideoConvertor:-vf \"scale=w='if(lte(iw,ih),min(iw,720),-2)':h='if(gt(iw,ih),min(ih,720),-2)'\"" +
      ` ${codec.encoder} -c:a libopus -b:a 64k`,
    // Sufixo no AV1 para não colidir com o WEBM VP9 do mesmo post (o yt-dlp
    // pularia o download achando que o arquivo já existe).
    "-o", path.join(pasta, `%(uploader_id)s_%(id)s${sabor === "av1" ? "_av1" : ""}.%(ext)s`),
  ], "baixando", m.partes, () => {
    if (sp) return;
    garanteNovaLinha();
    sp = spinner(nativo ? "juntando vídeo e áudio…" : `re-encodando para ${codec.nome}/Opus…`);
  });
  sp?.para(`${t.acento("✔")} ${t.texto(nativo ? "pronto" : "re-encode concluído")}`);
  return arq;
}

async function baixaGif(ytdlp, url, pasta, m, op) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gdm-yoinks-"));
  try {
    const mp4 = await baixa(ytdlp, url, [
      "-f", "bv*/b", "-S", "res:720,+size",
      "-o", path.join(tmp, "fonte.%(ext)s"),
    ], "baixando", 1);
    garanteNovaLinha();

    const base = `${m.info.uploader_id ?? "x"}_${m.info.id}`;
    const destino = path.join(pasta, `${base}.gif`);
    const fps = m.fps ? Math.min(m.fps, op.gifFps) : op.gifFps;
    // 1ª passada: gera a paleta de 256 cores do próprio vídeo; 2ª: aplica.
    // stats_mode=diff prioriza as cores do que se mexe; diff_mode=rectangle
    // só redesenha a área que mudou entre quadros (GIF menor).
    const filtro =
      `fps=${fps},scale='min(${op.gifLargura},iw)':-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    const duracaoUs = (m.duracao ?? 0) * 1e6;
    const r = await roda("ffmpeg", ["-y", "-v", "error", "-i", mp4, "-vf", filtro, "-loop", "0",
      "-progress", "pipe:1", "-nostats", destino], (linha) => {
      const us = linha.match(/^out_time_us=(\d+)/);
      if (us && duracaoUs) barra("convertendo", Number(us[1]) / duracaoUs);
    });
    if (r.codigo !== 0) falha(`ffmpeg falhou: ${r.erro.trim().split("\n").at(-1)}`);
    if (duracaoUs) barra("convertendo", 1);
    return destino;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Principal ─────────────────────────────────────────────────────────────────
async function main() {
  const op = leArgs(process.argv.slice(2));
  fs.mkdirSync(op.saida, { recursive: true });
  const ytdlp = achaYtDlp();
  if (!op.url && !process.stdin.isTTY) falha("Informe a URL de um post do X/Twitter. Veja --help.", 2);
  const promessaClip = op.url ? null : leAreaDeTransferencia();

  cabecalho();
  if (!op.url) op.url = await pedeUrl(promessaClip);

  const sp = spinner("analisando o post…");
  const m = await analisa(ytdlp, op.url);
  sp.para();
  mostraCartao(m);

  const escolha = op.formato ?? await escolhe(opcoesDoMenu(m, op));
  if (escolha === "sair") { letreiro.para(); console.log(`  ${t.fraco("cancelado.")}\n`); return; }

  const arq = escolha === "gif"
    ? await baixaGif(ytdlp, op.url, op.saida, m, op)
    : await baixaWebm(ytdlp, op.url, op.saida, m, escolha);

  letreiro.para();
  garanteNovaLinha();
  const tam = fs.statSync(arq).size;
  const comparacao = m.tamanho ? t.fraco(` (fonte ${formataBytes(m.tamanho)})`) : "";
  console.log(`\n  ${t.acento("✔")} ${t.pico(formataBytes(tam))}${comparacao}`);
  console.log(`  ${t.texto(path.resolve(arq))}\n`);
}

main().catch((e) => falha(e.stack ?? String(e)));
