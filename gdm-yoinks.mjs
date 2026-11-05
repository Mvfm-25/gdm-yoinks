#!/usr/bin/env node
// gdm-yoinks — protótipo. Baixa mídia do X/Twitter e do YouTube como WEBM (VP9 ou AV1, com Opus,
// até 720p, menor arquivo) ou como GIF de verdade (convertido do vídeo).
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

/** A tela cheia, quando ativa. Fora dela o app roda no modo linha. */
let tela = null;

function falha(msg, codigo = 1) {
  tela?.encerra(); // a mensagem precisa ficar na tela normal, não no buffer alternativo
  letreiro.para();
  process.stderr.write(`\n${t.perigo("✖")} ${t.texto(msg)}\n`);
  process.exit(codigo);
}

// Programas filhos ainda rodando. No Windows eles não morrem junto com o Node,
// então quem sai no meio de um download (Ctrl+C, erro) os encerra aqui.
const filhos = new Set();
process.on("exit", () => { for (const p of filhos) p.kill(); });

/** Roda um programa e devolve { codigo, saida, erro }. `aoLer` recebe cada linha. */
function roda(cmd, args, aoLer) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    filhos.add(p);
    p.on("exit", () => filhos.delete(p));
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

/** O que o letreiro rolante diz, em binário como o resto do cabeçalho. */
const LETREIRO = emBinario("please be nice");

/** Mistura duas cores hex: `k` = 1 é só `a`, `k` = 0 é só `b`. */
function misturaHex(a, b, k) {
  const x = rgb(a).split(";"), y = rgb(b).split(";");
  return "#" + x.map((v, i) => Math.round(v * k + y[i] * (1 - k)).toString(16).padStart(2, "0")).join("");
}

// ── Logo em meia célula ───────────────────────────────────────────────────────
// Cada linha de terminal mostra duas linhas do desenho do logo.md: «▀» com a
// cor de cima na frente e a de baixo no fundo. Letras em branco, a linha de
// cima em --pico e a lateral direita de cada traço em --fraco (o sombreado do
// Yoinks).
function corPixelLogo(desenho, x, py) {
  const tem = (xx) => desenho[py]?.[xx] === "%";
  if (!tem(x)) return null;
  if (!tem(x + 1) && tem(x - 1)) return PALETA.fraco;
  return py === 0 ? PALETA.pico : PALETA.texto;
}

/** Célula (x, linha) do logo como [caractere, frente, fundo], ou null se vazia. */
function celulaLogo(desenho, x, linha, fundoHex) {
  const cima = corPixelLogo(desenho, x, 2 * linha), baixo = corPixelLogo(desenho, x, 2 * linha + 1);
  if (!cima && !baixo) return null;
  if (cima === baixo) return ["█", cima, fundoHex];
  if (!baixo) return ["▀", cima, fundoHex];
  if (!cima) return ["▄", baixo, fundoHex];
  return ["▀", cima, baixo];
}

/** Junta células [caractere, frente, fundo] numa linha, trocando a cor só quando ela muda. */
function serializa(celulas) {
  if (semCor) return celulas.map(([c]) => c).join("").trimEnd();
  let s = "", frente, fundoAtual;
  for (const [c, fg, bg] of celulas) {
    if (bg !== fundoAtual) { s += bg ? `\x1b[48;2;${rgb(bg)}m` : "\x1b[49m"; fundoAtual = bg; }
    if (fg !== frente && c !== " ") { s += fg ? `\x1b[38;2;${rgb(fg)}m` : "\x1b[39m"; frente = fg; }
    s += c;
  }
  return s + "\x1b[39;49m";
}

// ── Jogo da Vida em binário ───────────────────────────────────────────────────
// Roda por trás de toda a tela cheia, uma célula por caractere. Cada célula
// viva mostra o bit da linha binária de logo.md na sua posição, então o fundo é
// «G.D.M. Extractor» em ASCII recortado pela vida. Célula que morre deixa um
// «·» que esfria em poucas gerações. De vez em quando, uma única célula viva
// vira um «7» em --p4 até morrer. Tudo em tons escuros para não competir com
// o logo.
const VIDA_GERACOES_POR_SEGUNDO = 6;
const COR_VIDA = {
  um: misturaHex(PALETA.p2, PALETA.fundo, 0.6),
  zero: misturaHex(PALETA.p2, PALETA.fundo, 0.32),
  rastroQuente: PALETA.borda,
  rastroFrio: PALETA.superficie2,
  sete: PALETA.p4,
};

class VidaBinaria {
  constructor(w, h, binario) {
    this.w = w; this.h = h;
    this.fita = binario.replace(/\s/g, "") || "01";
    this.vivas = new Uint8Array(w * h);
    this.proximas = new Uint8Array(w * h);
    this.calor = new Uint8Array(w * h);
    this.geracao = 0;
    this.sete = null;        // { x, y, ate }
    this.querSete = false;   // sorteio pendente: quem desenha sabe onde há interface
    for (let k = 0; k < this.vivas.length; k++) this.vivas[k] = Math.random() < 0.25 ? 1 : 0;
  }

  vivo(x, y) { return this.vivas[y * this.w + x]; }

  /** Uma geração (B3/S23, bordas que dão a volta). */
  passo() {
    const { w, h, vivas, proximas, calor } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (dx || dy) n += vivas[((y + dy + h) % h) * w + (x + dx + w) % w];
      const k = y * w + x;
      proximas[k] = n === 3 || (vivas[k] && n === 2) ? 1 : 0;
      calor[k] = proximas[k] ? 255 : Math.max(0, calor[k] - 26);
    }
    this.vivas = proximas; this.proximas = vivas; this.geracao++;

    // Sem isto a tela acaba parada em blocos e osciladores: respinga vida nova.
    if (this.geracao % 30 === 0 && this.vivas.reduce((s, v) => s + v, 0) < this.vivas.length * 0.12) {
      for (let i = 0; i < Math.max(3, Math.round((w * h) / 800)); i++) {
        const x0 = Math.floor(Math.random() * (w - 5)), y0 = Math.floor(Math.random() * Math.max(1, h - 5));
        for (let y = y0; y < Math.min(h, y0 + 5); y++) for (let x = x0; x < x0 + 5; x++)
          if (Math.random() < 0.5) this.vivas[y * w + x] = 1;
      }
    }

    // O «7» escondido: dura enquanto a célula viver, até 18 gerações.
    const s = this.sete;
    if (s && (this.geracao > s.ate || !this.vivo(s.x, s.y))) this.sete = null;
    if (!this.sete && !this.querSete && Math.random() < 1 / 45) this.querSete = true;
  }

  /** Resolve o sorteio do «7» entre as células vivas onde `livre(x, y)`. */
  escolheSete(livre) {
    if (!this.querSete) return;
    this.querSete = false;
    const candidatas = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (this.vivo(x, y) && livre(x, y)) candidatas.push([x, y]);
    if (!candidatas.length) return;
    const [x, y] = candidatas[Math.floor(Math.random() * candidatas.length)];
    this.sete = { x, y, ate: this.geracao + 18 };
  }

  /** [caractere, frente] da célula, ou null se ela está vazia. */
  celula(x, y) {
    const k = y * this.w + x;
    if (this.vivas[k]) {
      if (this.sete && this.sete.x === x && this.sete.y === y) return ["7", COR_VIDA.sete];
      const bit = this.fita[(x + y * 13) % this.fita.length];
      return [bit, bit === "1" ? COR_VIDA.um : COR_VIDA.zero];
    }
    if (this.calor[k] > 150) return ["·", COR_VIDA.rastroQuente];
    if (this.calor[k] > 60) return ["·", COR_VIDA.rastroFrio];
    return null;
  }
}

// ── Tela cheia ────────────────────────────────────────────────────────────────
// Igual ao yoinks: o programa assume a janela inteira (buffer alternativo, como
// o vim) e redesenha tudo a cada quadro. O fundo é pintado de --fundo, a vida
// ocupa a tela toda e a interface fica por cima, centralizada:
//
//     logo (4 linhas) · letreiro · frase · formatos · palco (9 linhas) · atalhos
//
// O «palco» muda conforme a fase: campo da URL, análise, menu, download, pronto.
// Ao sair, a tela original volta e o resultado é impresso nela, para ficar no
// histórico do terminal.
const ALTURA_PALCO = 9;
const LARGURA_PALCO = 68;
const LARGURA_BOTAO = 12;
const MIN_LINHAS = 22;

/** Grade de células da tela; o que a interface escreve fica marcado em `ui`. */
class Quadro {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ch = new Array(n).fill(" ");
    this.fg = new Array(n).fill(null);
    this.bg = new Array(n).fill(PALETA.fundo);
    this.ui = new Uint8Array(n);
  }
  poe(x, y, c, fg = PALETA.texto, bg = PALETA.fundo) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = y * this.w + x;
    this.ch[k] = c; this.fg[k] = fg; this.bg[k] = bg; this.ui[k] = 1;
  }
  /** Escreve trechos [texto, cor, fundo?] a partir de x; devolve onde parou. */
  trechos(x, y, partes) {
    for (const [s, fg, bg] of partes) for (const c of s) this.poe(x++, y, c, fg, bg);
    return x;
  }
  centro(y, partes) {
    const n = partes.reduce((soma, [s]) => soma + [...s].length, 0);
    return this.trechos(Math.floor((this.w - n) / 2), y, partes);
  }
  linha(y) {
    const celulas = [];
    for (let x = 0; x < this.w; x++) { const k = y * this.w + x; celulas.push([this.ch[k], this.fg[k], this.bg[k]]); }
    return serializa(celulas);
  }
}

/** Corta um texto em `n` colunas; `inicio` mantém o fim (bom para caminhos). */
const corta = (s, n, inicio = false) => {
  const cs = [...s];
  if (cs.length <= n) return s;
  return inicio ? "…" + cs.slice(cs.length - n + 1).join("") : cs.slice(0, n - 1).join("") + "…";
};

class TelaCheia {
  constructor(desenho, binario) {
    this.desenho = desenho;
    this.binario = binario;
    this.larguraLogo = Math.max(...desenho.map((l) => l.length));
    this.alturaLogo = Math.ceil(desenho.length / 2);
    this.fase = "url";
    this.passoFita = 0;
    this.campo = { valor: "", aviso: "", clip: "", url: "" };
    this.cartao = null;
    this.menu = null;
    this.prog = null;
    this.etapaAtual = null;
    this.resultado = null;
    this.aoTecla = null;
    this.ativa = false;
    this.historico = []; // linhas dos arquivos gerados, impressas na tela normal ao sair
  }

  /** Volta ao estado inicial (campo de URL vazio) para a próxima extração. */
  reinicia() {
    this.campo = { valor: "", aviso: "", clip: "", url: "" };
    this.cartao = null;
    this.menu = null;
    this.prog = null;
    this.etapaAtual = null;
    this.resultado = null;
  }

  /** Terminal comporta a tela cheia? (Senão o app usa o modo linha.) */
  static cabe(desenho) {
    const largura = Math.max(...desenho.map((l) => l.length));
    return (process.stdout.columns ?? 0) >= Math.max(largura, LARGURA_PALCO) + 4 && (process.stdout.rows ?? 0) >= MIN_LINHAS;
  }

  abre() {
    this.ativa = true;
    // buffer alternativo, cursor escondido, sem quebra automática (escrever na
    // última coluna da última linha não rola a tela)
    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[?7l");
    this.dimensiona();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    this.leTecla = (b) => this.tecla(b.toString("utf8"));
    process.stdin.on("data", this.leTecla);
    this.aoRedimensionar = () => { this.dimensiona(); this.desenha(); };
    process.stdout.on("resize", this.aoRedimensionar);
    this.aoSair = () => this.encerra();
    process.on("exit", this.aoSair);
    this.ultimaGeracao = Date.now();
    this.id = setInterval(() => this.tique(), 70);
    this.desenha();
  }

  /** Devolve o terminal como estava. Pode ser chamada mais de uma vez. */
  encerra() {
    if (!this.ativa) return;
    this.ativa = false;
    clearInterval(this.id);
    process.stdin.removeListener("data", this.leTecla);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.removeListener("resize", this.aoRedimensionar);
    process.removeListener("exit", this.aoSair);
    process.stdout.write("\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l");
    // O que foi extraído fica no histórico do terminal, mesmo saindo por erro ou Ctrl+C.
    for (const l of this.historico) console.log(l);
  }

  dimensiona() {
    this.w = process.stdout.columns ?? 80;
    this.h = process.stdout.rows ?? 24;
    this.vida = new VidaBinaria(this.w, this.h, this.binario);
    this.anteriores = [];
    process.stdout.write("\x1b[2J");
  }

  tique() {
    this.passoFita++;
    // O letreiro anda a cada 70 ms; a vida acumula o tempo para dar 6 ger/s.
    const intervalo = 1000 / VIDA_GERACOES_POR_SEGUNDO;
    if (Date.now() - this.ultimaGeracao >= intervalo) {
      this.ultimaGeracao = Math.max(this.ultimaGeracao + intervalo, Date.now() - intervalo);
      this.vida.passo();
    }
    this.desenha();
  }

  tecla(s) {
    if (s === "\x03" && this.fase === "url") s = "\x1b"; // no campo, Ctrl+C é como Esc (§3.1: código 0)
    if (s === "\x03") { // Ctrl+C: o modo cru não gera SIGINT, então sai daqui
      this.encerra();
      console.log(`  ${t.fraco("cancelado.")}\n`);
      process.exit(130);
    }
    this.aoTecla?.(s);
    this.desenha();
  }

  desenha() {
    if (!this.ativa) return;
    const q = new Quadro(this.w, this.h);
    if (this.w < Math.max(this.larguraLogo, LARGURA_PALCO) + 4 || this.h < MIN_LINHAS) {
      q.centro(Math.floor(this.h / 2), [[`aumente a janela (mínimo ${Math.max(this.larguraLogo, LARGURA_PALCO) + 4}×${MIN_LINHAS})`, PALETA.fraco]]);
    } else this.compoe(q);

    // A vida aparece onde a interface não escreveu.
    const livre = (x, y) => !q.ui[y * q.w + x];
    this.vida.escolheSete(livre);
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
      if (!livre(x, y)) continue;
      const c = this.vida.celula(x, y);
      if (c) { const k = y * q.w + x; q.ch[k] = c[0]; q.fg[k] = c[1]; }
    }

    // Só reescreve as linhas que mudaram; a saída sincronizada (2026) evita
    // tremer nos terminais que a entendem e é ignorada nos outros.
    let s = "";
    for (let y = 0; y < q.h; y++) {
      const l = q.linha(y);
      if (this.anteriores[y] !== l) { s += `\x1b[${y + 1};1H${l}`; this.anteriores[y] = l; }
    }
    if (s) process.stdout.write(`\x1b[?2026h${s}\x1b[?2026l`);
  }

  compoe(q) {
    const total = this.alturaLogo + 1 + 1 + 1 + 2 + 1 + ALTURA_PALCO + 1 + 1;
    const y0 = Math.max(0, Math.floor((this.h - total) / 2));
    const xl = Math.floor((this.w - this.larguraLogo) / 2);

    for (let l = 0; l < this.alturaLogo; l++) for (let x = 0; x < this.larguraLogo; x++) {
      const c = celulaLogo(this.desenho, x, l, PALETA.fundo);
      if (c) q.poe(xl + x, y0 + l, ...c);
    }

    // Letreiro: «please be nice» em binário, sob o logo e da largura dele.
    const yL = y0 + this.alturaLogo + 1, fita = `${LETREIRO}  ★  `;
    q.poe(xl, yL, " ", null, PALETA.superficie2);
    q.poe(xl + this.larguraLogo - 1, yL, " ", null, PALETA.superficie2);
    for (let i = 0; i < this.larguraLogo - 2; i++) {
      const c = fita[(this.passoFita + i) % fita.length];
      q.poe(xl + 1 + i, yL, c, c === "★" ? PALETA.p4 : c === "1" ? PALETA.acento : PALETA.fraco, PALETA.superficie2);
    }

    const yT = yL + 2;
    q.centro(yT, [["baixa vídeo e GIF do X e do YouTube. cola. extrai.", PALETA.texto]]);
    q.centro(yT + 1, [[`webm · webm av1 · gif · v${VERSAO}`, PALETA.fraco]]);

    const yP = yT + 3, xP = Math.floor((this.w - LARGURA_PALCO) / 2);
    ({ url: this.palcoUrl, analisando: this.palcoUrl, menu: this.palcoMenu,
      baixando: this.palcoDownload, pronto: this.palcoPronto })[this.fase].call(this, q, xP, yP);

    q.centro(yP + ALTURA_PALCO + 1, this.atalhos());
  }

  atalhos() {
    const T = PALETA.texto, F = PALETA.fraco, sep = "   ·   ";
    switch (this.fase) {
      case "url": return [["↵", T], [" extrair" + sep, F], ["tab", T], [" colar" + sep, F], ["esc", T], [" sair", F]];
      case "menu": return [["↑↓", T], [" mover" + sep, F], ["↵", T], [" escolher" + sep, F], ["esc", T], [" sair", F]];
      case "pronto": return [["↵", T], [" novo link" + sep, F], ["esc", T], [" sair", F]];
      default: return [["^c", T], [" cancelar", F]];
    }
  }

  /** Caixa «Cole um link» com o botão à direita, como no yoinks. */
  caixa(q, x0, y, conteudo, rotuloBotao) {
    const xb = x0 + LARGURA_PALCO - LARGURA_BOTAO, F = PALETA.fraco;
    for (let x = x0 + 1; x < xb; x++) { q.poe(x, y, "─", F); q.poe(x, y + 1, " "); q.poe(x, y + 2, "─", F); }
    q.poe(x0, y, "╭", F); q.poe(x0, y + 1, "│", F); q.poe(x0, y + 2, "╰", F);
    q.trechos(x0 + 2, y, [[" Cole um link ", PALETA.texto]]);
    q.trechos(x0 + 2, y + 1, conteudo);
    for (let yy = y; yy < y + 3; yy++) for (let x = xb; x < xb + LARGURA_BOTAO; x++) q.poe(x, yy, " ", PALETA.sobreAcento, PALETA.acento);
    const n = [...rotuloBotao].length;
    q.trechos(xb + Math.floor((LARGURA_BOTAO - n) / 2), y + 1, [[rotuloBotao, PALETA.sobreAcento, PALETA.acento]]);
  }

  palcoUrl(q, x0, y) {
    const c = this.campo, cabe = LARGURA_PALCO - LARGURA_BOTAO - 6;
    const piscando = Math.floor(Date.now() / 530) % 2 === 0;
    if (this.fase === "analisando") {
      const giro = QUADROS[this.passoFita % QUADROS.length];
      this.caixa(q, x0, y, [["› ", PALETA.acento], [corta(c.url, cabe, true), PALETA.texto]], giro);
      q.centro(y + 4, [["analisando o link…", PALETA.fraco]]);
      return;
    }
    const cursor = [piscando ? "█" : " ", PALETA.texto];
    const conteudo = c.valor
      ? [["› ", PALETA.acento], [corta(c.valor, cabe - 1, true), PALETA.texto], cursor]
      : [["› ", PALETA.acento], cursor, [PLACEHOLDER_URL, PALETA.fraco]];
    this.caixa(q, x0, y, conteudo, "extrair");
    const A = PALETA.acento, F = PALETA.fraco;
    const dica = c.aviso ? [[c.aviso, PALETA.perigo]]
      : c.clip && !c.valor ? [["link na área de transferência · ", F], ["tab", A], [" para colar", F]]
      : c.clip && c.valor === c.clip ? [["da área de transferência · ", F], ["enter", A], [" para baixar", F]]
      : [];
    if (dica.length) q.centro(y + 4, dica);
  }

  /** Título e dados da mídia, nas primeiras linhas do palco. */
  palcoCartao(q, x0, y) {
    const d = this.cartao;
    q.trechos(x0, y, [[corta(d.titulo, LARGURA_PALCO), PALETA.pico]]);
    q.trechos(x0, y + 1, [["tipo   ", PALETA.fraco], [d.tipo, PALETA.texto]]);
    q.trechos(x0, y + 2, [["fonte  ", PALETA.fraco], [d.fonte, PALETA.texto]]);
    if (d.aviso) q.trechos(x0, y + 3, [["aviso  ", PALETA.fraco], [d.aviso, PALETA.texto]]);
  }

  palcoMenu(q, x0, y) {
    this.palcoCartao(q, x0, y);
    this.menu.opcoes.forEach((o, i) => {
      const ativo = i === this.menu.sel;
      q.trechos(x0, y + 5 + i, [
        [ativo ? "› " : "  ", PALETA.acento], [`${i + 1} `, PALETA.fraco],
        [o.rotulo, ativo ? PALETA.pico : PALETA.texto],
        [o.detalhe ? "  " + o.detalhe : "", o.alerta ? PALETA.perigo : PALETA.fraco],
      ]);
    });
  }

  palcoDownload(q, x0, y) {
    this.palcoCartao(q, x0, y);
    const p = this.prog;
    if (p) {
      const largura = 34, cheio = Math.round(Math.max(0, Math.min(1, p.fracao)) * largura);
      q.trechos(x0, y + 5, [
        [p.rotulo.padEnd(13), PALETA.texto], ["━".repeat(cheio), PALETA.acento], ["━".repeat(largura - cheio), PALETA.borda],
        [` ${String(Math.round(p.fracao * 100)).padStart(3)}%`, PALETA.pico], [p.extra ? `  ${p.extra}` : "", PALETA.fraco],
      ]);
    }
    const e = this.etapaAtual;
    if (e) q.trechos(x0, y + 7, e.feito
      ? [["✔ ", PALETA.acento], [e.texto, PALETA.texto]]
      : [[QUADROS[this.passoFita % QUADROS.length] + " ", PALETA.acento], [e.texto, PALETA.texto]]);
  }

  palcoPronto(q, x0, y) {
    this.palcoCartao(q, x0, y);
    const r = this.resultado;
    q.trechos(x0, y + 5, [["✔ ", PALETA.acento], [formataBytes(r.tamanho), PALETA.pico],
      [r.fonte ? ` (fonte ${formataBytes(r.fonte)})` : "", PALETA.fraco]]);
    q.trechos(x0, y + 6, [[corta(r.caminho, LARGURA_PALCO, true), PALETA.texto]]);
  }

  // ── Fases ──
  /** Campo da URL. Resolve com a URL, ou null se o usuário saiu (Esc). */
  pedeUrl(promessaClip) {
    this.fase = "url";
    const c = this.campo;
    promessaClip?.then((s) => { if (eUrlAceita(s)) c.clip = s.trim(); });
    return new Promise((resolve) => {
      const fim = (url) => { this.aoTecla = null; if (url) { c.url = url; this.fase = "analisando"; } resolve(url); };
      this.aoTecla = (s) => {
        c.aviso = "";
        if (s === "\x1b") return fim(null);
        if (s === "\r" || s === "\n") {
          if (eUrlAceita(c.valor)) return fim(c.valor.trim());
          c.aviso = c.valor ? msgUrlRecusada(c.valor) : "cole um link primeiro";
          return;
        }
        if (s === "\t") { if (c.clip) c.valor = c.clip; return; }
        if (s === "\x7f" || s === "\b") { c.valor = [...c.valor].slice(0, -1).join(""); return; }
        if (s === "\x15") { c.valor = ""; return; }           // Ctrl+U limpa
        if (s.startsWith("\x1b")) return;                     // setas etc.
        const texto = s.replace(/[\x00-\x1f\x7f]/g, "");
        if (!texto) return;
        const colou = texto.length > 1 && c.valor === "";
        c.valor += texto;
        if (colou && eUrlAceita(c.valor)) return fim(c.valor.trim()); // colou um link: vai direto
      };
    });
  }

  analisando(url) { this.campo.url = url; this.fase = "analisando"; this.desenha(); }

  mostraCartao(m) { this.cartao = dadosDoCartao(m); }

  escolhe(opcoes) {
    this.fase = "menu";
    this.menu = { opcoes, sel: 0 };
    return new Promise((resolve) => {
      const n = opcoes.length;
      this.aoTecla = (s) => {
        const m = this.menu;
        if (s === "\x1b[A" || s === "k") m.sel = (m.sel + n - 1) % n;
        else if (s === "\x1b[B" || s === "j") m.sel = (m.sel + 1) % n;
        else if (/^[1-9]$/.test(s) && Number(s) <= n) m.sel = Number(s) - 1;
        else if (s === "\r" || s === "\n") { this.aoTecla = null; resolve(opcoes[m.sel].id); }
        else if (s === "\x1b" || s === "q") { this.aoTecla = null; resolve("sair"); }
      };
    });
  }

  baixando() { this.fase = "baixando"; this.prog = null; this.etapaAtual = null; }
  progresso(rotulo, fracao, extra = "") { this.prog = { rotulo, fracao, extra }; }
  etapa(texto) {
    this.etapaAtual = { texto, feito: false };
    return { para: (final) => { this.etapaAtual = final ? { texto: final, feito: true } : null; } };
  }

  /** Mostra o resultado. Resolve true no Enter (novo link) e false no Esc/q (sair). */
  pronto(resultado) {
    this.fase = "pronto";
    this.resultado = resultado;
    return new Promise((resolve) => {
      this.aoTecla = (s) => {
        if (["\r", "\n", " "].includes(s)) { this.aoTecla = null; resolve(true); }
        else if (s === "\x1b" || s === "q") { this.aoTecla = null; resolve(false); }
      };
    });
  }
}

// O letreiro é a barra «novo no acervo» do catálogo do sistemaGDM trazida
// para o terminal: uma fita que anda para a esquerda, com ★ em --p4 como
// costura entre uma volta e a próxima, sobre --superficie-2.
//
// Ele fica ACIMA de tudo o que é impresso depois, então cada quadro sobe até
// a linha dele e volta (salva/restaura o cursor). Para saber quanto subir,
// `process.stdout.write` é observado: cada «\n» é uma linha a mais abaixo do
// letreiro, e cada «\x1b[NA» (o menu redesenhando) são N a menos.
//
// Este é o letreiro do modo linha (terminal pequeno, NO_COLOR, sem TTY). Na
// tela cheia ele é desenhado pela própria TelaCheia.
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

/** Cabeçalho do modo linha: logo parado (a vida só roda na tela cheia) e letreiro. */
function cabecalho(logo) {
  const colunas = process.stdout.columns ?? 80;
  const larguraLogo = logo ? Math.max(...logo.desenho.map((l) => l.length)) : 0;

  console.log("");
  if (logo && colunas >= larguraLogo + 4) {
    for (let l = 0; l < Math.ceil(logo.desenho.length / 2); l++) {
      const celulas = [];
      for (let x = 0; x < larguraLogo; x++) celulas.push(celulaLogo(logo.desenho, x, l, null) ?? [" ", null, null]);
      console.log("  " + serializa(celulas));
    }
    letreiro.inicia(LETREIRO, larguraLogo - 2); // -2: o espaço de cada lado do fundo
  } else {
    // Terminal estreito: o logo não cabe sem quebrar, fica só o selo.
    console.log(`  ${t.selo("gdm-extractor")}`);
    letreiro.inicia(LETREIRO, Math.max(20, colunas - 6));
  }
  console.log(`  ${t.fraco(`gdm-extractor v${VERSAO} · X/Twitter · YouTube`)}\n`);
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

// O download fala com estas duas funções; elas mandam para a tela cheia ou
// para a barra e o spinner do modo linha.
function progresso(rotulo, fracao, extra = "") {
  if (tela) tela.progresso(rotulo, fracao, extra);
  else barra(rotulo, fracao, extra);
}

/** Etapa com spinner; `para(final)` troca por «✔ final» (ou some, sem texto). */
function etapa(texto) {
  if (tela) return tela.etapa(texto);
  garanteNovaLinha();
  const sp = spinner(texto);
  return { para: (final) => sp.para(final ? `${t.acento("✔")} ${t.texto(final)}` : undefined) };
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
  if (op.url && !eUrlAceita(op.url)) falha(msgUrlRecusada(op.url), 2);
  if (op.formato && !["webm", "av1", "gif"].includes(op.formato)) falha("--formato aceita webm, av1 ou gif.", 2);
  if (!(op.gifFps > 0) || !(op.gifLargura > 0)) falha("--gif-fps e --gif-largura precisam ser números positivos.", 2);
  return op;
}

const MSG_URL_INVALIDA = "A URL não parece um post do X/Twitter nem um vídeo do YouTube.";
const MSG_URL_LISTA = "Playlists e canais não são suportados; use o link de um vídeo.";

// URLs aceitas (§2). No YouTube, o id do vídeo tem 11 caracteres; o `v=` pode
// vir depois de outros parâmetros (watch?feature=x&v=…). `&list=` e `&t=` são
// aceitos: o --no-playlist baixa só o vídeo, e o tempo é ignorado.
const RE_X = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[^/\s]+\/status\/\d+\S*$/i;
const RE_YOUTUBE = /^https?:\/\/(((www|m)\.)?youtube\.com\/(watch\?(\S*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}(?![\w-])\S*$/i;
const RE_YOUTUBE_LISTA = /^https?:\/\/((www|m)\.)?youtube\.com\/(playlist\?|channel\/|c\/|user\/|@)/i;

/** "x", "youtube", "lista" (playlist/canal do YouTube, recusado) ou null. */
function siteDaUrl(s) {
  const u = s.trim();
  if (RE_X.test(u)) return "x";
  if (RE_YOUTUBE.test(u)) return "youtube";
  if (RE_YOUTUBE_LISTA.test(u)) return "lista";
  return null;
}
const MSG_SEM_URL = "Informe a URL de um post do X/Twitter ou de um vídeo do YouTube. Veja --help.";
const PLACEHOLDER_URL = "https://x.com/… ou https://youtu.be/…";
const eUrlAceita = (s) => ["x", "youtube"].includes(siteDaUrl(s));
const msgUrlRecusada = (s) => (siteDaUrl(s) === "lista" ? MSG_URL_LISTA : MSG_URL_INVALIDA);

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
  if (!process.stdin.isTTY) falha(MSG_SEM_URL, 2);
  return new Promise((resolve) => {
    let valor = "", aviso = "", clip = "";

    const desenha = () => {
      const campo = valor ? t.texto(valor) : t.borda(PLACEHOLDER_URL);
      const cursor = semCor ? "_" : fundo(PALETA.acento, " ");
      const dica = aviso ? t.perigo(aviso)
        : clip && !valor ? t.fraco("link na área de transferência — ") + t.acento("tab") + t.fraco(" para colar")
        : clip && valor === clip ? t.fraco("da área de transferência — ") + t.acento("enter") + t.fraco(" para baixar")
        : t.borda("cole o link · enter baixar · esc sair");
      // Duas linhas (campo e dica); o cursor volta para a do campo.
      process.stdout.write(`\r\x1b[2K  ${t.acento("›")} ${valor ? campo + cursor : cursor + campo}\n\x1b[2K    ${dica}\x1b[1A\r`);
    };

    console.log(`  ${t.texto("Cole a URL (X ou YouTube):")}`);
    desenha();
    promessaClip.then((s) => { if (eUrlAceita(s)) { clip = s.trim(); desenha(); } });

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
      if (eUrlAceita(valor)) return fim(valor.trim());
      aviso = valor ? msgUrlRecusada(valor) : "cole um link primeiro";
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
      if (colou && eUrlAceita(valor)) return fim(valor.trim());  // colou um link: vai direto
      desenha();
    };
    process.stdin.on("data", aoLer);
  });
}

function ajuda() {
  console.log(`
${t.selo("gdm-extractor")} ${t.fraco(`v${VERSAO} · protótipo`)}

${t.texto("Uso:")} gdm-extractor ${t.acento("[url do X ou do YouTube]")} [opções]
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
  // O yt-dlp baixaria uma live em andamento até ela acabar (§2.2).
  if (info.is_live) falha("Transmissão ao vivo em andamento: tente depois que ela terminar.");
  const site = siteDaUrl(url);
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
  // No YouTube o yt-dlp já traz tudo, então o ffprobe só roda se faltar algo.
  const video = fonteGif ?? pedidos.find((f) => f.vcodec !== "none") ?? pedidos[0];
  const completo = info.width && info.height && info.fps && info.duration && !eGif;
  const sonda = video?.url && !completo ? await sondaRemoto(video.url) : {};
  const duracao = info.duration ?? sonda.duracao;
  const tamanhos = pedidos.map((f) => tamanhoDe(f, duracao));
  const tamanho = tamanhos.every(Boolean) ? tamanhos.reduce((a, b) => a + b, 0)
    : eGif ? sonda.tamanho : undefined;
  return {
    info, site, eGif, total, vp9Nativo, av1Nativo,
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
/** O que o cartão mostra, em texto puro (o modo linha e a tela cheia pintam cada um do seu jeito). */
function dadosDoCartao(m) {
  const dims = m.largura ? `${m.largura}×${m.altura}` : "?";
  return {
    titulo: (m.info.title ?? m.info.id).replace(/\s+/g, " "),
    tipo: m.eGif ? "GIF do X (guardado como MP4 sem áudio)" : m.site === "youtube" ? "vídeo do YouTube" : "vídeo do X",
    fonte: `${dims} · ${m.fps ? m.fps + " fps" : "? fps"} · ${m.duracao ? m.duracao.toFixed(1) + " s" : "? s"} · ${formataBytes(m.tamanho)}`,
    aviso: m.total > 1 ? `post tem ${m.total} mídias; usando a primeira` : "",
  };
}

function mostraCartao(m) {
  const d = dadosDoCartao(m);
  const curto = d.titulo.length > 58 ? d.titulo.slice(0, 57) + "…" : d.titulo;
  const linhas = [
    [t.pico(curto)],
    [t.fraco("tipo     "), t.texto(d.tipo)],
    [t.fraco("fonte    "), t.texto(d.fonte)],
  ];
  if (d.aviso) linhas.push([t.fraco("aviso    "), t.texto(d.aviso)]);
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
  // «720p» é o lado menor do quadro (Shorts são verticais).
  const ladoMenor = m.largura && m.altura ? Math.min(m.largura, m.altura) : m.altura;
  const alturaWebm = Math.min(ladoMenor ?? 720, 720);
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
      alerta: longo,
      detalhe: longo
        ? `vídeo longo (${Math.round(m.duracao)} s) · GIF de ~${formataBytes(estimativaGif)}`
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
        const det = o.detalhe ? "  " + (o.alerta ? t.perigo : t.fraco)(o.detalhe) : "";
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
      return progresso(nome, Number(p[1]) / Number(p[2]), formataBytes(Number(p[2])));
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

// Nome do arquivo (§3.3). No X o «título» é o texto do post (longo, com emoji
// e hashtags), então vai usuário_id; no YouTube, o título e o id.
const MODELO_NOME = { x: "%(uploader_id)s_%(id)s", youtube: "%(title).60s [%(id)s]" };

/** Mesmo nome do MODELO_NOME, montado aqui porque o GIF é gerado pelo ffmpeg, não pelo yt-dlp. */
function nomeDoGif(m) {
  if (m.site !== "youtube") return `${m.info.uploader_id ?? "x"}_${m.info.id}`;
  // Tira o que o Windows não aceita em nomes de arquivo.
  const titulo = [...(m.info.title ?? "")].slice(0, 60).join("")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim();
  return titulo ? `${titulo} [${m.info.id}]` : m.info.id;
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
    "-o", path.join(pasta, `${MODELO_NOME[m.site]}${sabor === "av1" ? "_av1" : ""}.%(ext)s`),
  ], "baixando", m.partes, () => {
    if (sp) return;
    sp = etapa(nativo ? "juntando vídeo e áudio…" : `re-encodando para ${codec.nome}/Opus…`);
  });
  sp?.para(nativo ? "pronto" : "re-encode concluído");
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

    const destino = path.join(pasta, `${nomeDoGif(m)}.gif`);
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
      if (us && duracaoUs) progresso("convertendo", Number(us[1]) / duracaoUs);
    });
    if (r.codigo !== 0) falha(`ffmpeg falhou: ${r.erro.trim().split("\n").at(-1)}`);
    if (duracaoUs) progresso("convertendo", 1);
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
  if (!op.url && !process.stdin.isTTY) falha(MSG_SEM_URL, 2);
  const promessaClip = op.url ? null : leAreaDeTransferencia();

  const logo = leLogo();
  if (logo && process.stdout.isTTY && process.stdin.isTTY && !semCor && TelaCheia.cabe(logo.desenho))
    return mainTelaCheia(op, ytdlp, promessaClip, logo);

  cabecalho(logo);
  if (!op.url) op.url = await pedeUrl(promessaClip);

  const sp = spinner("analisando o link…");
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

/**
 * Mesmo fluxo de main(), na tela cheia. Depois de cada extração, Enter volta
 * ao campo de URL para a próxima; Esc sai. Os arquivos gerados vão para a tela
 * normal no fim (ver TelaCheia.encerra).
 */
async function mainTelaCheia(op, ytdlp, promessaClip, logo) {
  tela = new TelaCheia(logo.desenho, logo.binario ?? emBinario("G.D.M. Extractor"));
  tela.abre();
  // Sair do campo de URL depois de já ter extraído algo não é «cancelar».
  const sai = (cancelou) => {
    tela.encerra();
    if (cancelou || !tela.historico.length) console.log(`  ${t.fraco("cancelado.")}\n`);
  };

  let url = op.url;
  for (;;) {
    if (url) tela.analisando(url);
    else url = await tela.pedeUrl(promessaClip);
    if (!url) return sai(false);

    const m = await analisa(ytdlp, url);
    tela.mostraCartao(m);

    const escolha = op.formato ?? await tela.escolhe(opcoesDoMenu(m, op));
    if (escolha === "sair") return sai(true);

    tela.baixando();
    const arq = escolha === "gif"
      ? await baixaGif(ytdlp, url, op.saida, m, op)
      : await baixaWebm(ytdlp, url, op.saida, m, escolha);

    const tam = fs.statSync(arq).size;
    const comparacao = m.tamanho ? t.fraco(` (fonte ${formataBytes(m.tamanho)})`) : "";
    tela.historico.push(`  ${t.acento("✔")} ${t.pico(formataBytes(tam))}${comparacao}`,
      `  ${t.texto(path.resolve(arq))}\n`);

    if (!await tela.pronto({ tamanho: tam, fonte: m.tamanho, caminho: path.resolve(arq) })) return sai(false);

    // Próxima rodada: campo vazio e área de transferência lida de novo (o
    // usuário pode ter copiado outro link enquanto baixava).
    tela.reinicia();
    url = null;
    promessaClip = leAreaDeTransferencia();
  }
}

main().catch((e) => falha(e.stack ?? String(e)));
