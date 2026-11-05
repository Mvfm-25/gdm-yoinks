#!/usr/bin/env node
// gdm-yoinks — protótipo. Baixa mídia do X/Twitter e do YouTube como WEBM (VP9 ou AV1, com Opus,
// até 720p, menor arquivo) ou como GIF de verdade (convertido do vídeo).
// Sem dependências: Node ≥ 18, yt-dlp e ffmpeg/ffprobe no PATH.
//
// Uso: gdm-extractor <url> [-o pasta] [--formato webm|av1|gif] [--inicio t] [--fim t | --duracao t]
// (gdm-yoinks é o nome do projeto; gdm-extractor, o do comando.)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  DURACAO_PADRAO_S, MIN_TRECHO_S, leTempo, formataTempo, sufixoDoTrecho, textoDoTrecho, tempoDoLink,
  recorteDasOpcoes, movePonta,
} from "./tempo.mjs";

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

// Pastas temporárias (§5.3). falha() e o Ctrl+C saem com process.exit(), que
// não roda os `finally`; por isso a limpeza fica no «exit», que sempre roda.
const temporarias = new Set();
process.on("exit", () => {
  for (const d of temporarias) try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
});

// Ctrl+C fora do modo cru (download no modo linha): código 130 (§3.2).
process.on("SIGINT", () => { letreiro.para(); process.exit(130); });

/**
 * Mensagem de erro do yt-dlp sem o prefixo «ERROR: [extrator] <id>: » (§8).
 * O id só sai se tiver dígito, para não comer um «Unsupported URL: …».
 */
function msgDoYtDlp(erro, padrao = "yt-dlp falhou") {
  const msg = (erro.match(/ERROR:.*$/m) ?? [erro.trim() || padrao])[0];
  return msg.replace(/^ERROR:\s*(\[[\w:]+\]\s*)?([\w-]*\d[\w-]*:\s+)?/, "");
}

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

  /**
   * Tira até `n` células vivas sorteadas da vida (elas morrem ali, sem
   * rastro) e devolve [x, y, bit] de cada uma. É de onde o logo nasce (X5).
   */
  colhe(n) {
    const vivas = [];
    for (let k = 0; k < this.vivas.length; k++) if (this.vivas[k]) vivas.push(k);
    for (let i = vivas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vivas[i], vivas[j]] = [vivas[j], vivas[i]];
    }
    return vivas.slice(0, n).map((k) => {
      const x = k % this.w, y = Math.floor(k / this.w);
      const bit = this.fita[(x + y * 13) % this.fita.length];
      this.vivas[k] = 0;
      this.calor[k] = 0;
      return [x, y, bit];
    });
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

// ── Abertura: o logo nasce da vida (X5) ───────────────────────────────────────
// Ao abrir a tela cheia, cada pixel do logo sai de uma célula viva sorteada
// (que morre ali) e voa até o seu lugar no desenho em ABERTURA_MS. Cada um
// parte num instante sorteado e desacelera ao chegar. No começo do voo ainda é
// o bit da vida; perto do destino vira meio bloco e pega a cor do logo. O resto
// da interface só aparece no fim. Qualquer tecla pula.
const ABERTURA_MS = 1000;
const ABERTURA_ATRASO_MS = 300;  // a partida de cada pixel é sorteada até aqui
const ABERTURA_VIRA_PIXEL = 0.4; // fração do voo em que o bit vira meio bloco
const ABERTURA_QUADRO_MS = 30;   // a abertura redesenha mais rápido que o tique

class AberturaDoLogo {
  /**
   * `alvos`: [{ x, y, cor }] em pixels do logo (x em colunas, y em meias
   * linhas). `origens`: [x, y, bit] em células, vindas de VidaBinaria.colhe;
   * os pixels que sobrarem partem de um ponto qualquer da tela.
   */
  constructor(alvos, origens, w, h, agora = Date.now()) {
    this.inicio = agora;
    const sorteia = (n) => Math.floor(Math.random() * n);
    this.particulas = alvos.map((a, i) => {
      const [x0, y0, bit] = origens[i] ?? [sorteia(w), sorteia(h), Math.random() < 0.5 ? "0" : "1"];
      return { ...a, x0, y0: 2 * y0 + sorteia(2), bit, atraso: Math.random() * ABERTURA_ATRASO_MS };
    });
  }

  acabou(agora = Date.now()) { return agora - this.inicio >= ABERTURA_MS; }

  desenha(q, agora = Date.now()) {
    const voo = ABERTURA_MS - ABERTURA_ATRASO_MS;
    const meios = new Map(); // célula → [cor de cima, cor de baixo]
    const bits = [];
    for (const p of this.particulas) {
      const k = Math.max(0, Math.min(1, (agora - this.inicio - p.atraso) / voo));
      const e = 1 - (1 - k) ** 3; // sai rápido e pousa devagar
      const x = Math.round(p.x0 + (p.x - p.x0) * e), y = Math.round(p.y0 + (p.y - p.y0) * e);
      const corDaVida = p.bit === "1" ? COR_VIDA.um : COR_VIDA.zero;
      if (k < ABERTURA_VIRA_PIXEL) {
        bits.push([x, y >> 1, p.bit, misturaHex(p.cor, corDaVida, (k / ABERTURA_VIRA_PIXEL) * 0.5)]);
        continue;
      }
      const cor = misturaHex(p.cor, corDaVida, Math.min(1, 0.5 + (k - ABERTURA_VIRA_PIXEL) * 2));
      const chave = (y >> 1) * q.w + x;
      const celula = meios.get(chave) ?? [null, null];
      celula[y & 1] = cor;
      meios.set(chave, celula);
    }
    // Primeiro os bits; os meios blocos, que já estão chegando, ficam por cima.
    for (const [x, y, bit, cor] of bits) if (!meios.has(y * q.w + x)) q.poe(x, y, bit, cor);
    for (const [chave, [cima, baixo]] of meios) {
      const x = chave % q.w, y = Math.floor(chave / q.w);
      if (cima && baixo) q.poe(x, y, cima === baixo ? "█" : "▀", cima, cima === baixo ? PALETA.fundo : baixo);
      else q.poe(x, y, cima ? "▀" : "▄", cima ?? baixo);
    }
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
    this.abertura = null; // X5, só enquanto o logo está se formando
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
    this.aoRedimensionar = () => { this.fimDaAbertura(); this.dimensiona(); this.desenha(); };
    process.stdout.on("resize", this.aoRedimensionar);
    this.aoSair = () => this.encerra();
    process.on("exit", this.aoSair);
    this.ultimaGeracao = Date.now();
    this.id = setInterval(() => this.tique(), 70);
    this.comecaAbertura();
    this.desenha();
  }

  /** O logo nasce da vida (X5). Só na abertura, e só se a janela comporta a interface. */
  comecaAbertura() {
    if (!this.cabeAgora()) return;
    const { xl, y0 } = this.posicaoLogo(), alvos = [];
    this.desenho.forEach((linha, py) => [...linha].forEach((_, x) => {
      const cor = corPixelLogo(this.desenho, x, py);
      if (cor) alvos.push({ x: xl + x, y: 2 * y0 + py, cor });
    }));
    this.abertura = new AberturaDoLogo(alvos, this.vida.colhe(alvos.length), this.w, this.h);
    this.idAbertura = setInterval(() => this.desenha(), ABERTURA_QUADRO_MS);
  }

  fimDaAbertura() {
    if (!this.abertura) return;
    this.abertura = null;
    clearInterval(this.idAbertura);
  }

  /** Devolve o terminal como estava. Pode ser chamada mais de uma vez. */
  encerra() {
    if (!this.ativa) return;
    this.ativa = false;
    clearInterval(this.id);
    this.fimDaAbertura();
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
      // Com extrações feitas, o histórico já foi impresso; «cancelado.» só se
      // nada foi extraído ou se o menu foi cancelado (§6.2).
      if (!this.historico.length || this.fase === "menu" || this.fase === "recorte") console.log(`  ${t.fraco("cancelado.")}\n`);
      process.exit(130);
    }
    // Qualquer outra tecla na abertura só a pula: não chega ao campo de URL.
    if (this.abertura) { this.fimDaAbertura(); this.desenha(); return; }
    this.aoTecla?.(s);
    this.desenha();
  }

  desenha() {
    if (!this.ativa) return;
    const q = new Quadro(this.w, this.h);
    if (this.abertura?.acabou()) this.fimDaAbertura();
    if (!this.cabeAgora()) {
      this.fimDaAbertura();
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

  cabeAgora() {
    return this.w >= Math.max(this.larguraLogo, LARGURA_PALCO) + 4 && this.h >= MIN_LINHAS;
  }

  /** Canto de cima à esquerda do logo; o resto da interface é posto a partir dele. */
  posicaoLogo() {
    const total = this.alturaLogo + 1 + 1 + 1 + 2 + 1 + ALTURA_PALCO + 1 + 1;
    return { y0: Math.max(0, Math.floor((this.h - total) / 2)), xl: Math.floor((this.w - this.larguraLogo) / 2) };
  }

  compoe(q) {
    if (this.abertura) return this.abertura.desenha(q);
    const { y0, xl } = this.posicaoLogo();

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
    ({ url: this.palcoUrl, analisando: this.palcoUrl, menu: this.palcoMenu, recorte: this.palcoRecorte,
      baixando: this.palcoDownload, pronto: this.palcoPronto })[this.fase].call(this, q, xP, yP);

    q.centro(yP + ALTURA_PALCO + 1, this.atalhos());
  }

  atalhos() {
    const T = PALETA.texto, F = PALETA.fraco, sep = "   ·   ";
    switch (this.fase) {
      case "url": return [["↵", T], [" extrair" + sep, F], ["tab", T], [" colar" + sep, F], ["esc", T], [" sair", F]];
      case "menu": return [["↑↓", T], [" mover" + sep, F], ["↵", T], [" escolher" + sep, F],
        ...(this.menu?.recortavel ? [["r", T], [" recortar" + sep, F]] : []), ["esc", T], [" sair", F]];
      case "recorte": {
        const s = "  ·  ";
        return [["←→", T], [" ±1 s  ", F], ["⇧", T], [" ±5 s" + s, F], ["tab", T], [" início/fim" + s, F],
          ["0-9", T], [" digitar" + s, F], ["↵", T], [" ok" + s, F], ["esc", T], [" inteiro", F]];
      }
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

  /**
   * Título e dados da mídia, nas primeiras linhas do palco. Aviso e trecho
   * usam as linhas 3 e 4 (a 4 só quando há os dois; as opções começam na 5).
   */
  palcoCartao(q, x0, y, trechoAoVivo) {
    const d = this.cartao;
    q.trechos(x0, y, [[corta(d.titulo, LARGURA_PALCO), PALETA.pico]]);
    q.trechos(x0, y + 1, [["tipo   ", PALETA.fraco], [d.tipo, PALETA.texto]]);
    q.trechos(x0, y + 2, [["fonte  ", PALETA.fraco], [d.fonte, PALETA.texto]]);
    // Na fase de recorte, a linha «trecho» acompanha o que está sendo ajustado.
    const extras = trechoAoVivo
      ? [...d.extras.filter(([r]) => r !== "trecho"), ["trecho", trechoAoVivo]] : d.extras;
    extras.slice(0, 2).forEach(([rotulo, texto], i) =>
      q.trechos(x0, y + 3 + i, [[rotulo.padEnd(7), PALETA.fraco], [corta(texto, LARGURA_PALCO - 7), PALETA.texto]]));
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

  /**
   * Fase de recorte: o cartão com o trecho ao vivo, a linha do tempo, os dois
   * campos e as estimativas, que são refeitas a cada tecla.
   *
   *   0:00 ━━━━━━━━━┫████┣━━━━━━━━━━━━ 3:32
   *   › início 1:30█      fim 1:40
   *   GIF ~2.1 MB · WEBM ~0.9 MB
   */
  palcoRecorte(q, x0, y) {
    const r = this.rec, vivo = this.trechoAoVivo(), dur = vivo.fim - vivo.inicio;
    const { A, F, T, P, B } = { A: PALETA.acento, F: PALETA.fraco, T: PALETA.texto, P: PALETA.pico, B: PALETA.borda };
    this.palcoCartao(q, x0, y, textoDoTrecho(vivo));

    // Linha do tempo: «┫» e «┣» nas pontas, a ativa em --pico.
    const esq = `${formataTempo(0)} `, dir = ` ${formataTempo(r.total)}`;
    const largura = LARGURA_PALCO - esq.length - dir.length;
    const coluna = (s) => Math.round((s / r.total) * (largura - 1));
    const a = Math.min(coluna(vivo.inicio), largura - 2), b = Math.max(a + 1, coluna(vivo.fim));
    const barra = [];
    for (let i = 0; i < largura; i++) {
      if (i === a) barra.push(["┫", r.ativo === "inicio" ? P : A]);
      else if (i === b) barra.push(["┣", r.ativo === "fim" ? P : A]);
      else barra.push(i > a && i < b ? ["█", A] : ["━", B]);
    }
    q.trechos(x0, y + 5, [[esq, F], ...barra, [dir, F]]);

    // Campos: o ativo com «›» e o cursor; digitando, mostra o texto cru.
    const piscando = Math.floor(Date.now() / 530) % 2 === 0;
    const campo = (ponta, rotulo) => {
      const ativo = r.ativo === ponta;
      const valor = ativo && r.texto !== null ? r.texto : formataTempo(vivo[ponta]);
      return [[ativo ? "› " : "  ", A], [rotulo + " ", F], [valor, ativo ? P : T], [ativo && piscando ? "█" : " ", T]];
    };
    const x = q.trechos(x0, y + 6, campo("inicio", "início"));
    q.trechos(Math.max(x + 4, x0 + 20), y + 6, campo("fim", "fim"));

    const gif = estimativaGif(r.m, r.op, dur), webm = estimativaWebm(r.m, dur);
    q.trechos(x0, y + 7, [
      ["GIF ", F], [gif ? `~${formataBytes(gif)}` : "?", dur > GIF_LONGO_S ? PALETA.perigo : T],
      [" · WEBM ", F], [webm ? `~${formataBytes(webm)}` : "?", T],
      [dur > GIF_LONGO_S ? `   GIF longo: mais de ${GIF_LONGO_S} s` : "", PALETA.perigo],
    ]);
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

  /** Menu de formatos. Resolve com o id da opção, "sair", ou "recortar" (tecla r, se `recortavel`). */
  escolhe(opcoes, recortavel = false) {
    this.fase = "menu";
    // A seleção sobrevive à ida e volta da fase de recorte.
    this.menu = { opcoes, sel: this.menu?.sel ?? 0, recortavel };
    return new Promise((resolve) => {
      const n = opcoes.length;
      const fim = (id) => { this.aoTecla = null; resolve(id); };
      this.aoTecla = (s) => {
        const m = this.menu;
        if (s === "\x1b[A" || s === "k") m.sel = (m.sel + n - 1) % n;
        else if (s === "\x1b[B" || s === "j") m.sel = (m.sel + 1) % n;
        else if (/^[1-9]$/.test(s) && Number(s) <= n) m.sel = Number(s) - 1;
        else if (s === "\r" || s === "\n") fim(opcoes[m.sel].id);
        else if ((s === "r" || s === "R") && recortavel) fim("recortar");
        else if (s === "\x1b" || s === "q") fim("sair");
      };
    });
  }

  /**
   * Fase de recorte (F3). Começa no recorte atual; sem ele, no início do link
   * (&t=) ou no zero, com DURACAO_PADRAO_S. Resolve com { inicio, fim }, ou
   * null para o vídeo inteiro (Esc, ou um trecho que pega o vídeo todo).
   */
  recorta(m, op) {
    this.fase = "recorte";
    const total = m.duracao, min = Math.min(MIN_TRECHO_S, total);
    const inicio = m.recorte?.inicio ?? Math.min(m.inicioDoLink ?? 0, total - min);
    const fim = m.recorte?.fim ?? Math.min(total, inicio + DURACAO_PADRAO_S);
    const r = this.rec = { m, op, total, min, inicio, fim, ativo: "inicio", texto: null };
    const poe = (v) => Object.assign(r, movePonta(r, r.ativo, v, r.total, r.min));
    /** Aplica o que foi digitado no campo ativo (se for um tempo válido) e fecha a edição. */
    const confirma = () => {
      if (r.texto === null) return;
      const v = leTempo(r.texto);
      r.texto = null;
      if (v !== null) poe(v);
    };

    return new Promise((resolve) => {
      // this.rec fica: a tecla que fechou a fase ainda redesenha a tela antes
      // de o menu voltar (ver tecla()).
      const fim = (recorte) => { this.aoTecla = null; resolve(recorte); };
      this.aoTecla = (s) => {
        const passo = { "\x1b[D": -1, "\x1b[C": 1, "\x1bOD": -1, "\x1bOC": 1, "\x1b[1;2D": -5, "\x1b[1;2C": 5 }[s];
        if (passo) { confirma(); poe(r[r.ativo] + passo); }
        else if (s === "\t") { confirma(); r.ativo = r.ativo === "inicio" ? "fim" : "inicio"; }
        else if (s === "\r" || s === "\n") {
          confirma();
          fim(r.inicio <= 0 && r.fim >= r.total - 0.05 ? null : { inicio: r.inicio, fim: r.fim });
        }
        else if (s === "\x1b") fim(null);
        else if (s === "\x7f" || s === "\b") r.texto = (r.texto ?? formataTempo(r[r.ativo])).slice(0, -1);
        else if (/^[0-9:.hms]+$/.test(s)) r.texto = ((r.texto ?? "") + s).slice(0, 10);
      };
    });
  }

  /** Início e fim que a fase de recorte mostra agora, contando o que está sendo digitado. */
  trechoAoVivo() {
    const r = this.rec, v = r.texto === null ? null : leTempo(r.texto);
    return v === null ? { inicio: r.inicio, fim: r.fim } : movePonta(r, r.ativo, v, r.total, r.min);
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
  const op = { url: null, saida: path.join(os.homedir(), "Downloads"), formato: null, gifFps: 15, gifLargura: 480,
    trecho: {} }; // { inicio, fim, duracao } em segundos, das opções do recorte (F3)
  /** Valor da opção `a`; sem valor é argumento inválido (código 2). */
  const valor = (i, a) => {
    if (argv[i] === undefined || argv[i] === "") falha(`A opção ${a} precisa de um valor.`, 2);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") ajuda();
    else if (a === "-v" || a === "--version") { console.log(VERSAO); process.exit(0); }
    else if (a === "-o" || a === "--out") op.saida = valor(++i, a);
    else if (a === "--formato") op.formato = valor(++i, a);
    else if (a === "--gif-fps") op.gifFps = Number(valor(++i, a));
    else if (a === "--gif-largura") op.gifLargura = Number(valor(++i, a));
    else if (a === "--inicio" || a === "--fim" || a === "--duracao") op.trecho[a.slice(2)] = tempo(valor(++i, a), a);
    else if (a.startsWith("-")) falha(`Opção desconhecida: ${a}`, 2);
    else op.url = a;
  }
  // Sem URL, ela é pedida depois do cabeçalho (ver pedeUrl), como no yoinks.
  if (op.url && !eUrlAceita(op.url)) falha(msgUrlRecusada(op.url), 2);
  if (op.formato && !["webm", "av1", "gif"].includes(op.formato)) falha("--formato aceita webm, av1 ou gif.", 2);
  if (!(op.gifFps > 0) || !(op.gifLargura > 0)) falha("--gif-fps e --gif-largura precisam ser números positivos.", 2);
  // O trecho só é conferido contra a duração do vídeo depois da análise (recorteDasOpcoes).
  const { inicio = 0, fim, duracao } = op.trecho;
  if (fim != null && duracao != null) falha("Use --fim ou --duracao, não os dois.", 2);
  if (fim != null && fim <= inicio) falha("--fim precisa ser depois do --inicio.", 2);
  if (duracao != null && duracao <= 0) falha("--duracao precisa ser maior que zero.", 2);
  return op;
}

/** Tempo de uma opção (--inicio etc.), ou sai com código 2. */
function tempo(s, opcao) {
  const v = leTempo(s);
  if (v === null) falha(`${opcao} não entendeu «${s}»: use segundos (83, 90s), 1:23 ou 1:02:03.`, 2);
  return v;
}

const MSG_URL_INVALIDA = "A URL não parece um post do X/Twitter nem um vídeo do YouTube.";
const MSG_URL_LISTA = "Playlists e canais não são suportados; use o link de um vídeo.";

// URLs aceitas (§2). No YouTube, o id do vídeo tem 11 caracteres; o `v=` pode
// vir depois de outros parâmetros (watch?feature=x&v=…). `&list=` e `&t=` são
// aceitos: o --no-playlist baixa só o vídeo, e o tempo vira o início do
// recorte (F3: na tela cheia, só preenche a fase de recorte; no modo linha,
// vale com --formato gif; ver tempoDoLink).
const RE_X = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/(i\/web|[^/\s]+)\/status\/\d+\S*$/i;
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
  ${t.acento("--inicio <tempo>")}       ${t.fraco("recorta a partir daqui (83, 90s, 1:23 ou 1:02:03)")}
  ${t.acento("--fim <tempo>")}          ${t.fraco("recorta até aqui (padrão: o fim do vídeo)")}
  ${t.acento("--duracao <tempo>")}      ${t.fraco("ou: duração do trecho, no lugar do --fim")}
  ${t.acento("-h, --help / -v")}        ${t.fraco("ajuda / versão")}

${t.fraco(`Com --formato gif, o &t= de um link do YouTube vira o --inicio (trecho de ${DURACAO_PADRAO_S} s).`)}
${t.fraco("Na tela cheia, a tecla r do menu abre o recorte.")}
`);
  process.exit(0);
}

// ── Análise da mídia ──────────────────────────────────────────────────────────
// Mesma seleção do download WEBM: com ela, o -J já devolve em
// `requested_formats` o que seria baixado, e o tamanho da fonte sai daí.
const SELECAO_WEBM = ["-f", "bv*+ba/b", "-S", "res:720,vcodec:vp9,acodec:opus,+size"];

// Os sabores de WEBM. Mudam só a preferência de codec no -S e o codificador
// do re-encode; o resto (scale, Opus, nome do arquivo) é igual.
// AV1: libaom com -cpu-used 6 e tiles para não ficar lento demais; o CRF do
// AV1 vai de 0 a 63, e 38 dá tamanho/qualidade parecidos com o VP9 a 36.
// SVT-AV1 (F9): bem mais rápido que o libaom com tamanho parecido; é usado
// quando o ffmpeg instalado tem o libsvtav1.
//
// Teto de bitrate (F1): o re-encode não deve gastar mais bits de vídeo que a
// fonte. `teto(kbps)` são os argumentos com o teto; `semTeto`, sem ele.
// - libvpx (VP9): CRF com -b:v diferente de 0 é o modo «constrained quality»,
//   em que o -b:v é o teto da média. Medido no vídeo do X do §7: 4.9 MB sem
//   teto, 3.5 MB com teto de 633 kbps; no GIF do X, o teto não aumenta nada.
// - libsvtav1: «capped CRF» (-maxrate, com -bufsize de 2×).
// - libaom (AV1): nenhum modo de bitrate de uma passada respeita o alvo
//   (P1-Puzzle.md): com -crf e -b:v o -b:v vira alvo e o arquivo cresce, e
//   tanto esse modo quanto o VBR passam do alvo em 28–50%. O que controla bem
//   o tamanho é o próprio CRF. Então o libaom escolhe o CRF por amostras
//   (`escolheCrf`, ver crfPorAmostras), sempre em qualidade constante.
//
// No AV1 o alvo é 70% da fonte (FATOR_ALVO_AV1): o AV1 é bem mais eficiente
// que o H.264, e re-encodar para o mesmo tamanho não economiza nada.
const CODECS_WEBM = {
  webm: { nome: "VP9", sort: "vp9", fatorAlvo: 1,
    encoder: ["-c:v", "libvpx-vp9", "-crf", "36", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"],
    semTeto: ["-b:v", "0"], teto: (kbps) => ["-b:v", `${kbps}k`] },
  av1: { nome: "AV1", sort: "av01", fatorAlvo: 0.7, escolheCrf: true,
    encoder: ["-c:v", "libaom-av1", "-row-mt", "1", "-tiles", "2x2", "-cpu-used", "6"],
    crf: (n) => ["-crf", String(n), "-b:v", "0"] },
  av1Svt: { nome: "AV1", sort: "av01", fatorAlvo: 0.7,
    encoder: ["-c:v", "libsvtav1", "-crf", "38", "-preset", "8", "-pix_fmt", "yuv420p"],
    semTeto: [], teto: (kbps) => ["-maxrate", `${kbps}k`, "-bufsize", `${2 * kbps}k`] },
};

// Escolha do CRF do libaom (P1-Puzzle.md). CRF_AV1 é o padrão; CRF_AV1_MAX
// é o limite de qualidade (no Puzzle, CRF 50 ainda tem SSIM 0.961, acima do
// VP9 com teto, 0.954). As amostras são trechos de AMOSTRA_S segundos nas
// posições de POSICOES_AMOSTRA; vídeos curtos viram uma amostra só, inteira.
const CRF_AV1 = 38, CRF_AV1_SONDA = 46, CRF_AV1_MAX = 50;
const AMOSTRA_S = 3, POSICOES_AMOSTRA = [0.25, 0.5, 0.75];

/** Codificador de um sabor ("webm" ou "av1"); no AV1, o SVT quando houver. */
const codecDoSabor = (sabor, m) => CODECS_WEBM[sabor === "av1" && m.svtAv1 ? "av1Svt" : sabor];

/** Lista de encoders do ffmpeg instalado (texto do `ffmpeg -encoders`), ou "" se falhar. */
const leEncoders = () => roda("ffmpeg", ["-hide_banner", "-encoders"]).then((r) => (r.codigo === 0 ? r.saida : ""));

// Reduz para 720 no lado menor só quando a fonte passa disso (§4); -2 mantém
// a proporção com dimensão par.
const ESCALA_720 = "scale=w='if(lte(iw,ih),min(iw,720),-2)':h='if(gt(iw,ih),min(ih,720),-2)'";

/** Lado menor do quadro: é o que o «res» do -S compara. */
const resDe = (f) => (f.width && f.height ? Math.min(f.width, f.height) : f.height);

/** Tamanho de um formato: o informado, o aproximado, ou bitrate × duração. */
const tamanhoDe = (f, duracao) =>
  f.filesize ?? f.filesize_approx ?? (f.tbr && duracao ? f.tbr * 125 * duracao : undefined);

async function analisa(ytdlp, url) {
  const r = await roda(ytdlp, ["-J", "--no-warnings", "--no-playlist", ...SELECAO_WEBM, url]);
  if (r.codigo !== 0) falha(msgDoYtDlp(r.erro));
  let info = JSON.parse(r.saida);
  let total = 1;
  // Post com várias mídias e sem «…/video/N» na URL: usa a primeira. Com o
  // /video/N, o --no-playlist já faz o yt-dlp devolver só a N-ésima.
  if (info._type === "playlist") {
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

  const pedidos = info.requested_formats ?? [info];
  // VP9 nativo é o que a própria seleção do WEBM pegou (o -J já usa ela). Um
  // VP9 só em outra resolução não conta: o Puzzle tem VP9 só em 360p, e o
  // H.264 de 720p escolhido iria com -c:v copy para dentro do webm.
  const vp9Nativo = pedidos.some((f) => /^vp0?9/.test(f.vcodec ?? ""));
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
  // Bitrate de vídeo informado pelo site (kbps). É só a reserva do teto do
  // F1: o valor medido no arquivo baixado é mais exato (no HLS do X, o
  // informado é o nominal, ~20% acima do real).
  const temAudio = video && video.acodec && video.acodec !== "none";
  const kbpsVideo = video?.vbr || (video?.tbr ? video.tbr - (temAudio ? video.abr ?? 0 : 0) : undefined);
  return {
    info, site, eGif, total, vp9Nativo, av1Nativo, kbpsVideo,
    semFfprobe: Boolean(sonda.semFfprobe),
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
  if (r.codigo === -1) return { semFfprobe: true }; // não conseguiu nem iniciar
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
  const aviso = [
    m.total > 1 ? `post tem ${m.total} mídias; usando a primeira` : "",
    m.semFfprobe ? "ffprobe não encontrado; dimensões e fps incompletos" : "",
  ].filter(Boolean).join(" · ");
  // Na tela cheia, o &t= do link não recorta sozinho: o cartão avisa (F3).
  const trecho = m.recorte ? textoDoTrecho(m.recorte)
    : m.inicioDoLink ? `vídeo inteiro · início do link ${formataTempo(m.inicioDoLink)} (r para recortar)` : "";
  return {
    titulo: (m.info.title ?? m.info.id).replace(/\s+/g, " "),
    tipo: m.eGif ? "GIF do X (guardado como MP4 sem áudio)" : m.site === "youtube" ? "vídeo do YouTube" : "vídeo do X",
    fonte: `${dims} · ${m.fps ? m.fps + " fps" : "? fps"} · ${m.duracao ? m.duracao.toFixed(1) + " s" : "? s"} · ${formataBytes(m.tamanho)}`,
    // Linhas opcionais, embaixo da «fonte»: [rótulo, texto].
    extras: [["aviso", aviso], ["trecho", trecho]].filter(([, s]) => s),
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
  for (const [rotulo, texto] of d.extras) linhas.push([t.fraco(rotulo.padEnd(9)), t.texto(texto)]);
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

/** Duração do que vai ser extraído: a do trecho, se houver recorte (F3), ou a do vídeo. */
const duracaoUtil = (m, r = m.recorte) => (r ? r.fim - r.inicio : m.duracao);

/** Largura, altura e fps efetivos do GIF (§5.4). */
function dimensoesGif(m, op) {
  const largura = Math.min(m.largura ?? op.gifLargura, op.gifLargura);
  const altura = m.largura && m.altura ? Math.round((m.altura * largura) / m.largura) : largura;
  return { largura, altura, fps: m.fps ? Math.min(m.fps, op.gifFps) : op.gifFps };
}

/** Tamanho esperado do GIF de `dur` segundos (§5.4), ou 0 sem duração. */
function estimativaGif(m, op, dur) {
  const g = dimensoesGif(m, op);
  return dur ? g.largura * g.altura * g.fps * dur * BYTES_POR_PIXEL_QUADRO : 0;
}

/**
 * Tamanho esperado do WEBM VP9 de `dur` segundos: a fração da fonte (com o
 * teto do F1, o re-encode não passa do bitrate de vídeo dela), ou o bitrate
 * informado mais o Opus de 64k. É um teto aproximado, não uma previsão.
 */
function estimativaWebm(m, dur) {
  if (!dur) return 0;
  if (m.tamanho && m.duracao) return (m.tamanho * dur) / m.duracao;
  return m.kbpsVideo ? (m.kbpsVideo + 64) * 125 * dur : 0;
}

/** A fase de recorte faz sentido? (Precisa da duração, e o vídeo não pode ser curto demais.) */
const podeRecortar = (m) => m.duracao >= 2;

/** `telaCheia`: o aviso de vídeo longo sugere a tecla r (só existe na tela cheia). */
function opcoesDoMenu(m, op, telaCheia = false) {
  // «720p» é o lado menor do quadro (Shorts são verticais).
  const ladoMenor = m.largura && m.altura ? Math.min(m.largura, m.altura) : m.altura;
  const alturaWebm = Math.min(ladoMenor ?? 720, 720);
  const gif = dimensoesGif(m, op);
  const dur = duracaoUtil(m);
  const estimativa = estimativaGif(m, op, dur);
  const longo = dur > GIF_LONGO_S;
  // VP9/AV1 nativo com recorte: corte com -c copy, que começa no keyframe anterior.
  const nativo = (codec) => (m.recorte ? `${codec}/Opus · corte sem perda` : `${codec}/Opus nativo · sem re-encode`);
  return [
    { id: "webm", rotulo: `WEBM · vp9 ${alturaWebm}p · tamanho mínimo`,
      detalhe: m.vp9Nativo ? nativo("VP9") : "re-encode H.264 → VP9/Opus" },
    { id: "av1", rotulo: `WEBM · av1 ${alturaWebm}p · menor ainda`,
      detalhe: m.av1Nativo ? nativo("AV1")
        : m.svtAv1 ? "re-encode → AV1/Opus · SVT-AV1" : "re-encode → AV1/Opus · mais lento" },
    { id: "gif", rotulo: `GIF · ${gif.largura}px · ${gif.fps} fps`,
      alerta: longo,
      detalhe: longo
        ? `${m.recorte ? "trecho" : "vídeo"} longo (${Math.round(dur)} s) · ` +
          (telaCheia && podeRecortar(m) ? "r para recortar" : `GIF de ~${formataBytes(estimativa)}`)
        : `paleta otimizada · loop infinito${estimativa ? ` · ~${formataBytes(estimativa)}` : ""}` },
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
      else if (k.ctrl && k.name === "c") { // como na tela cheia: Ctrl+C sai com 130 (§3.2)
        fim("sair");
        letreiro.para();
        console.log(`  ${t.fraco("cancelado.")}\n`);
        process.exit(130);
      }
      else if (k.name === "escape" || k.name === "q") return fim("sair");
      else return;
      desenha(false);
    };
    process.stdin.on("keypress", tecla);
  });
}

// ── Download com yt-dlp (progresso via --progress-template) ───────────────────
/**
 * Args do yt-dlp para baixar só o trecho `r` (F3, só no YouTube). Com
 * --download-sections o yt-dlp chama `ffmpeg -ss <início> -t <dur> -i … -c copy`
 * (uma vez só, vídeo e áudio juntos). O -c copy começa no keyframe anterior ao
 * início, e o -copyts mantém no arquivo os tempos do vídeo original: o trecho
 * pedido fica em [início, fim] no próprio arquivo, e o corte preciso é feito
 * depois pelo ffmpeg que já roda (ver trechoDaFonte). Sem o -copyts, o
 * keyframe viraria o tempo 0 e não daria para saber onde o trecho começa.
 */
const argsDoTrecho = (r) => ["--download-sections", `*${r.inicio}-${r.fim}`, "--downloader-args", "ffmpeg_o:-copyts"];

/** No YouTube, o recorte é baixado só o trecho; no X, o vídeo inteiro (são curtos, e cortar HLS é frágil). */
const baixaSoOTrecho = (m) => Boolean(m.recorte) && m.site === "youtube";

/**
 * `partes` = { n: downloads separados (vídeo + áudio = 2), item: mídia do post
 * ou null, trecho: baixando só um trecho (o yt-dlp não manda progresso aí) }.
 */
async function baixa(ytdlp, url, args, rotulo, partes) {
  // Vídeo e áudio separados chegam como dois downloads seguidos; um total
  // novo na linha de progresso marca o começo da próxima parte.
  let parte = 1, totalAnterior = null;
  // Com --download-sections quem baixa é o ffmpeg, e o yt-dlp só manda uma
  // linha de progresso, já no fim: no lugar da barra, um spinner.
  const giro = partes.trecho ? etapa("baixando o trecho…") : null;
  const r = await roda(ytdlp, [
    // --print deixa o yt-dlp em modo silencioso; --progress traz a barra de volta.
    ...args, "--no-playlist", "--no-warnings", "--newline", "--progress",
    // Post com várias mídias (sem /video/N): sem isto o yt-dlp baixaria todas.
    ...(partes.item ? ["--playlist-items", String(partes.item)] : []),
    "--progress-template", "download:@@%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s",
    "--print", "after_move:@@ARQ %(filepath)s",
    url,
  ], (linha) => {
    const p = linha.match(/^@@(\d+)\|(\d+(?:\.\d+)?)/);
    if (!p || giro) return;
    if (totalAnterior !== null && p[2] !== totalAnterior && parte < partes.n) parte++;
    totalAnterior = p[2];
    const nome = partes.n > 1 ? `${rotulo} ${parte}/${partes.n}` : rotulo;
    progresso(nome, Number(p[1]) / Number(p[2]), formataBytes(Number(p[2])));
  });
  if (r.codigo !== 0) {
    giro?.para();
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
    falha(msgDoYtDlp(r.erro));
  }
  const arq = r.saida.match(/^@@ARQ (.+)$/m)?.[1]?.trim();
  if (!arq || !fs.existsSync(arq)) { giro?.para(); falha("yt-dlp terminou, mas o arquivo final não foi encontrado."); }
  giro?.para(`trecho baixado · ${formataBytes(fs.statSync(arq).size)}`);
  return arq;
}

/** start_time do arquivo (o tempo do primeiro pacote), ou null sem ffprobe. */
async function inicioDoArquivo(arquivo) {
  const r = await roda("ffprobe", ["-v", "error", "-show_entries", "format=start_time", "-of", "csv=p=0", arquivo]);
  const s = Number.parseFloat(r.saida);
  return r.codigo === 0 && Number.isFinite(s) ? s : null;
}

/**
 * A fonte baixada e o pedaço dela que vai para a saída:
 * - `de` é onde o trecho começa, no tempo do arquivo (o pts que o ffprobe
 *   mostra, que é o que pacotesDoVideo devolve);
 * - `zero` é o start_time do arquivo, de onde o -ss de entrada do ffmpeg conta;
 * - `dur` é a duração do trecho (ou do vídeo, sem recorte).
 * Sem recorte, `de` = `zero` e nada é cortado.
 */
async function trechoDaFonte(arquivo, m) {
  const zero = await inicioDoArquivo(arquivo);
  if (!m.recorte) return { arquivo, zero: zero ?? 0, de: zero ?? 0, dur: m.duracao, recortado: false };
  if (zero === null) falha("ffprobe não leu o início do arquivo baixado; sem ele não dá para recortar.");
  // Trecho do YouTube (-copyts): o tempo do arquivo já é o do vídeo. X (vídeo
  // inteiro): o tempo 0 do vídeo é o start_time do arquivo.
  const de = baixaSoOTrecho(m) ? m.recorte.inicio : zero + m.recorte.inicio;
  return { arquivo, zero, de, dur: duracaoUtil(m), recortado: true };
}

/** Args de entrada do ffmpeg (antes do -i) que cortam o trecho `f`; sem recorte, nenhum. */
const corteDe = (f) => (f.recortado
  ? ["-ss", (f.de - f.zero).toFixed(3), "-t", f.dur.toFixed(3)]
  : []);

// Nome do arquivo (§3.3). No X o «título» é o texto do post (longo, com emoji
// e hashtags), então vai usuário_id; no YouTube, o título e o id.
const MODELO_NOME = { x: "%(uploader_id)s_%(id)s", youtube: "%(title).60s [%(id)s]" };

/** Pasta temporária apagada no fim, inclusive em erro ou Ctrl+C (§5.3). */
function criaTemporaria() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gdm-yoinks-"));
  temporarias.add(tmp);
  return tmp;
}
function apagaTemporaria(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
  temporarias.delete(tmp);
}

/** Move um arquivo, copiando quando origem e destino estão em discos diferentes. */
function move(de, para) {
  try { fs.renameSync(de, para); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.copyFileSync(de, para);
    fs.rmSync(de, { force: true });
  }
}

/**
 * Roda o ffmpeg com `-progress pipe:1` e mostra a barra `rotulo` (D1). A
 * fração vem de out_time / duração; `extra(velocidade)` monta o texto ao lado
 * da barra, com o «speed=» do ffmpeg (ex.: «1.6x»).
 */
async function ffmpegComProgresso(args, duracao, rotulo, extra = () => "") {
  const duracaoUs = (duracao ?? 0) * 1e6;
  let velocidade = "";
  const r = await roda("ffmpeg", ["-y", "-v", "error", ...args.slice(0, -1),
    "-progress", "pipe:1", "-nostats", args.at(-1)], (linha) => {
    const v = linha.match(/^speed=\s*([\d.]+x)/);
    if (v) velocidade = v[1];
    const us = linha.match(/^out_time_us=(\d+)/);
    if (us && duracaoUs) progresso(rotulo, Math.min(1, Number(us[1]) / duracaoUs), extra(velocidade));
  });
  if (r.codigo !== 0) falha(`ffmpeg falhou: ${r.erro.trim().split("\n").at(-1)}`);
  if (duracaoUs) progresso(rotulo, 1, extra(velocidade));
}

/** Pacotes da trilha de vídeo como [tempo em s, bytes], ou [] sem ffprobe. */
async function pacotesDoVideo(arquivo) {
  const r = await roda("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "packet=pts_time,size", "-of", "csv=p=0", arquivo]);
  if (r.codigo !== 0) return [];
  return r.saida.split(/\r?\n/).map((l) => l.split(",").map(Number)).filter(([, b]) => b > 0);
}
const somaBytes = (pacotes, de = -Infinity, ate = Infinity) =>
  pacotes.reduce((s, [t, b]) => (t >= de && t < ate ? s + b : s), 0);

/**
 * Bitrate real do vídeo de um arquivo local, em kbps: soma o tamanho dos
 * pacotes da trilha de vídeo (o mkv juntado pelo yt-dlp não guarda o bitrate
 * por trilha). Com `de`, só os pacotes de [de, de + dur), no tempo do arquivo
 * (o trecho do recorte); sem, todos. Sem ffprobe ou sem duração, devolve `reserva`.
 */
async function kbpsDoVideo(arquivo, dur, reserva, de) {
  if (!dur) return reserva;
  const pacotes = await pacotesDoVideo(arquivo);
  const bytes = de === undefined ? somaBytes(pacotes) : somaBytes(pacotes, de, de + dur);
  return bytes ? Math.round((bytes * 8) / 1000 / dur) : reserva;
}

/** Bitrate de vídeo do trecho `f` da fonte (ver trechoDaFonte). */
const kbpsDoTrecho = (f, m) => kbpsDoVideo(f.arquivo, f.dur, m.kbpsVideo, f.recortado ? f.de : undefined);

/**
 * Prevê o bitrate de vídeo (kbps) do trecho `f` inteiro codificado com `args`:
 * codifica as amostras e compara com os MESMOS trechos da fonte. A razão
 * codificado/fonte é bem mais estável que o bitrate absoluto da amostra,
 * porque a fonte varia muito ao longo do vídeo (Puzzle: de 953 a 2409 kbps
 * por trecho de 5 s). Erra para cima (cada amostra começa num quadro-chave).
 * As janelas estão no tempo do arquivo; o -ss conta a partir do start_time.
 */
async function prevêKbps(f, pacotesFonte, kbpsFonte, args, tmp) {
  const janelas = f.dur >= AMOSTRA_S * POSICOES_AMOSTRA.length * 2
    ? POSICOES_AMOSTRA.map((p) => f.de + Math.max(0, f.dur * p - AMOSTRA_S / 2))
    : [f.de];
  const dur = janelas.length > 1 ? AMOSTRA_S : f.dur;
  let codificado = 0, original = 0;
  for (const ini of janelas) {
    const saida = path.join(tmp, "amostra.webm");
    const r = await roda("ffmpeg", ["-y", "-v", "error", "-ss", (ini - f.zero).toFixed(3), "-t", String(dur), "-i", f.arquivo,
      "-vf", ESCALA_720, ...args, "-an", saida]);
    if (r.codigo !== 0) return null;
    codificado += somaBytes(await pacotesDoVideo(saida));
    original += somaBytes(pacotesFonte, ini, ini + dur);
  }
  return codificado && original ? Math.round((kbpsFonte * codificado) / original) : null;
}

/**
 * CRF do libaom que acerta o `alvo` (kbps). Mede a CRF_AV1; se passar do
 * alvo, mede também a CRF_AV1_SONDA e interpola: o bitrate cai de forma
 * exponencial com o CRF, então log(kbps) é uma reta no CRF.
 */
async function crfPorAmostras(codec, f, kbpsFonte, alvo, tmp) {
  const pacotes = await pacotesDoVideo(f.arquivo);
  if (!pacotes.length || !f.dur) return CRF_AV1;
  const prevê = (crf) => prevêKbps(f, pacotes, kbpsFonte, [...codec.encoder, ...codec.crf(crf)], tmp);

  let e = etapa(`testando amostras a crf ${CRF_AV1}…`);
  const p1 = await prevê(CRF_AV1);
  if (!p1 || p1 <= alvo) {
    e.para(p1 ? `crf ${CRF_AV1}: ~${p1} kbps previstos, dentro do alvo` : `amostras falharam; crf ${CRF_AV1}`);
    return CRF_AV1;
  }
  e.para(`crf ${CRF_AV1}: ~${p1} kbps previstos, acima do alvo de ${alvo}`);
  e = etapa(`testando amostras a crf ${CRF_AV1_SONDA}…`);
  const p2 = await prevê(CRF_AV1_SONDA);
  let crf = CRF_AV1_MAX;
  if (p2 && p2 < p1) {
    const exato = CRF_AV1 + ((CRF_AV1_SONDA - CRF_AV1) * Math.log(alvo / p1)) / Math.log(p2 / p1);
    crf = Math.min(CRF_AV1_MAX, Math.max(CRF_AV1, Math.ceil(exato)));
  }
  e.para(`crf ${CRF_AV1_SONDA}: ~${p2 ?? "?"} kbps · usando crf ${crf}${crf === CRF_AV1_MAX ? " (limite de qualidade)" : ""}`);
  return crf;
}

/** `sabor` é "webm" (VP9) ou "av1". */
async function baixaWebm(ytdlp, url, pasta, m, sabor = "webm") {
  const codec = codecDoSabor(sabor, m);
  const nativo = sabor === "av1" ? m.av1Nativo : m.vp9Nativo;
  const tmp = criaTemporaria();
  try {
    // O yt-dlp só baixa e junta (em webm quando os codecs permitem; senão,
    // em mkv). O re-encode é feito aqui pelo ffmpeg, e não pelo
    // --recode-video, para ter progresso real (D1) e medir a fonte antes (F1).
    const fonte = await baixa(ytdlp, url, [
      "-f", "bv*+ba/b", "-S", `res:720,vcodec:${codec.sort},acodec:opus,+size`,
      "--merge-output-format", "webm/mkv",
      ...(baixaSoOTrecho(m) ? argsDoTrecho(m.recorte) : []),
      // Sufixo do trecho para não sobrescrever a versão inteira (F3), e no AV1
      // para não colidir com o WEBM VP9 do mesmo post.
      "-o", path.join(tmp, `${MODELO_NOME[m.site]}${sufixoDoTrecho(m.recorte)}${sabor === "av1" ? "_av1" : ""}.%(ext)s`),
    ], "baixando", { n: m.partes, item: m.total > 1 ? 1 : null, trecho: baixaSoOTrecho(m) });
    garanteNovaLinha();
    const destino = path.join(pasta, `${path.parse(fonte).name}.webm`);

    // Fonte já no codec pedido e já em webm: só move, sem re-encode. Nativo
    // em mkv (áudio que não é Opus) copia o vídeo e converte só o áudio.
    if (nativo && path.extname(fonte) === ".webm" && !m.recorte) { move(fonte, destino); return destino; }

    const f = await trechoDaFonte(fonte, m);
    const corte = corteDe(f);
    // Nativo com recorte: -c copy, sem perda e sem re-encode. O corte começa
    // no keyframe anterior ao início (até alguns segundos antes); o arquivo
    // também sai com o tempo começando do zero, e não do tempo do vídeo.
    if (nativo && path.extname(fonte) === ".webm") {
      await ffmpegComProgresso([...corte, "-i", fonte, "-c", "copy", destino], f.dur, "cortando", () => "sem perda");
      return destino;
    }

    const encoda = (video, rotulo, nomeCodec) => ffmpegComProgresso(
      [...corte, "-i", fonte, ...video, "-c:a", "libopus", "-b:a", "64k", destino],
      f.dur, rotulo, (vel) => `${nomeCodec}${vel ? " " + vel : ""}`);
    if (nativo) { await encoda(["-c:v", "copy"], "re-encodando", "Opus"); return destino; }

    const e = etapa("medindo o bitrate da fonte…");
    const kbps = await kbpsDoTrecho(f, m);
    const alvo = kbps ? Math.round(kbps * codec.fatorAlvo) : 0;
    e.para(!kbps ? "sem bitrate da fonte; qualidade constante"
      : codec.escolheCrf ? `fonte com ${kbps} kbps de vídeo; alvo de ${alvo} kbps`
      : `teto de ${alvo} kbps${codec.fatorAlvo < 1 ? ` (${Math.round(codec.fatorAlvo * 100)}% da fonte)` : " (bitrate de vídeo da fonte)"}`);

    if (!codec.escolheCrf) {
      await encoda(["-vf", ESCALA_720, ...codec.encoder, ...(alvo ? codec.teto(alvo) : codec.semTeto)],
        "re-encodando", codec.nome);
      return destino;
    }

    // libaom: CRF escolhido por amostras (ver crfPorAmostras).
    let crf = alvo ? await crfPorAmostras(codec, f, kbps, alvo, tmp) : CRF_AV1;
    await encoda(["-vf", ESCALA_720, ...codec.encoder, ...codec.crf(crf)], "re-encodando", `${codec.nome} crf ${crf}`);

    // Rede de segurança: a previsão errou e o vídeo passou da fonte? Refaz
    // uma vez com o CRF 6 pontos acima (≈ −30% de bitrate no Puzzle).
    if (kbps) {
      const saiu = await kbpsDoVideo(destino, f.dur, m.kbpsVideo); // a saída já é só o trecho
      if (saiu > kbps) {
        crf = Math.min(63, crf + 6);
        garanteNovaLinha();
        etapa("").para(`${saiu} kbps passou da fonte; refazendo com crf ${crf}`);
        await encoda(["-vf", ESCALA_720, ...codec.encoder, ...codec.crf(crf)], "refazendo", `${codec.nome} crf ${crf}`);
      }
    }
    return destino;
  } finally {
    apagaTemporaria(tmp);
  }
}

async function baixaGif(ytdlp, url, pasta, m, op) {
  const tmp = criaTemporaria();
  try {
    // A fonte já sai com o nome do §3.3, tratado pelo próprio yt-dlp; assim o
    // GIF tem exatamente o mesmo nome do WEBM do mesmo vídeo.
    const mp4 = await baixa(ytdlp, url, [
      "-f", "bv*/b", "-S", "res:720,+size",
      ...(baixaSoOTrecho(m) ? argsDoTrecho(m.recorte) : []),
      "-o", path.join(tmp, `${MODELO_NOME[m.site]}${sufixoDoTrecho(m.recorte)}.%(ext)s`),
    ], "baixando", { n: 1, item: m.total > 1 ? 1 : null, trecho: baixaSoOTrecho(m) });
    garanteNovaLinha();

    const destino = path.join(pasta, `${path.parse(mp4).name}.gif`);
    // O GIF sempre re-codifica, então o corte do recorte sai no quadro exato.
    const f = await trechoDaFonte(mp4, m);
    const fps = dimensoesGif(m, op).fps;
    // 1ª passada: gera a paleta de 256 cores do próprio vídeo; 2ª: aplica.
    // stats_mode=diff prioriza as cores do que se mexe; diff_mode=rectangle
    // só redesenha a área que mudou entre quadros (GIF menor).
    const filtro =
      `fps=${fps},scale='min(${op.gifLargura},iw)':-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    await ffmpegComProgresso([...corteDe(f), "-i", mp4, "-vf", filtro, "-loop", "0", destino], f.dur, "convertendo");
    return destino;
  } finally {
    apagaTemporaria(tmp);
  }
}

// ── Principal ─────────────────────────────────────────────────────────────────
/**
 * Recorte com que a extração começa (F3): o das opções --inicio/--fim/--duracao,
 * conferido contra a duração (fora dela, código 2). Sem opções, o &t= do link
 * do YouTube vira o início quando o formato já é GIF (--formato gif, sem menu);
 * na tela cheia, com menu, ele só fica guardado para preencher a fase de
 * recorte, sem recortar sozinho.
 */
function recorteInicial(m, op, url, comOpcoes, telaCheia) {
  if (comOpcoes) {
    const r = recorteDasOpcoes(op.trecho, m.duracao);
    if (r.erro) falha(r.erro, 2);
    if (r.recorte) return r.recorte;
  }
  const doLink = tempoDoLink(url);
  if (!doLink || !(doLink < m.duracao)) return null;
  if (op.formato === "gif") return { inicio: doLink, fim: Math.min(m.duracao, doLink + DURACAO_PADRAO_S) };
  if (telaCheia && !op.formato) m.inicioDoLink = doLink;
  return null;
}

async function main() {
  const op = leArgs(process.argv.slice(2));
  fs.mkdirSync(op.saida, { recursive: true });
  const ytdlp = achaYtDlp();
  if (!op.url && !process.stdin.isTTY) falha(MSG_SEM_URL, 2);
  const promessaClip = op.url ? null : leAreaDeTransferencia();
  // Lido em paralelo com o resto do início; só é preciso depois da análise (F9).
  const promessaEncoders = leEncoders();

  const logo = leLogo();
  if (logo && process.stdout.isTTY && process.stdin.isTTY && !semCor && TelaCheia.cabe(logo.desenho))
    return mainTelaCheia(op, ytdlp, promessaClip, logo, promessaEncoders);

  cabecalho(logo);
  if (!op.url) op.url = await pedeUrl(promessaClip);

  const sp = spinner("analisando o link…");
  const m = await analisa(ytdlp, op.url);
  m.svtAv1 = /\blibsvtav1\b/.test(await promessaEncoders);
  sp.para();
  m.recorte = recorteInicial(m, op, op.url, true, false);
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
async function mainTelaCheia(op, ytdlp, promessaClip, logo, promessaEncoders) {
  tela = new TelaCheia(logo.desenho, logo.binario ?? emBinario("G.D.M. Extractor"));
  tela.abre();
  // Sair do campo de URL depois de já ter extraído algo não é «cancelar».
  const sai = (cancelou) => {
    tela.encerra();
    if (cancelou || !tela.historico.length) console.log(`  ${t.fraco("cancelado.")}\n`);
  };

  let url = op.url;
  for (let rodada = 0; ; rodada++) {
    if (url) tela.analisando(url);
    else url = await tela.pedeUrl(promessaClip);
    if (!url) return sai(false);

    const m = await analisa(ytdlp, url);
    m.svtAv1 = /\blibsvtav1\b/.test(await promessaEncoders);
    // --inicio/--fim/--duracao valem só para o primeiro link; os seguintes
    // recortam pela tecla r.
    m.recorte = recorteInicial(m, op, url, rodada === 0, true);
    tela.mostraCartao(m);

    // A tecla r do menu abre a fase de recorte e volta ao menu (F3).
    let escolha = op.formato;
    while (!escolha) {
      escolha = await tela.escolhe(opcoesDoMenu(m, op, true), podeRecortar(m));
      if (escolha !== "recortar") break;
      m.recorte = await tela.recorta(m, op);
      tela.mostraCartao(m);
      escolha = null;
    }
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
