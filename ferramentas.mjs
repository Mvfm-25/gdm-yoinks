// gdm-yoinks — onde estão as ferramentas externas (yt-dlp, ffmpeg, ffprobe e o
// runtime JS do yt-dlp) e o que elas oferecem. Funções puras: o sistema de
// arquivos chega por `ctx`, para os testes (tests/ferramentas.test.mjs).
// Ordem e regras: docs/Instalador-Implement.md, seções 2.1, 2.2, 2.5, 2.6 e 9.
import path from "node:path";

/**
 * Contexto da resolução:
 * { plataforma, env, config, dirApp, home, existe(p), executavel(p), execPath?, versaoNode? }.
 * `dirApp` é a pasta do gdm-yoinks.mjs; numa instalação, as embutidas ficam em `<dirApp>/../tools/`.
 */

/** `ffmpeg` → `ffmpeg.exe` só no Windows. */
export const nomeExecutavel = (nome, plataforma) => (plataforma === "win32" ? `${nome}.exe` : nome);

const caminhos = (plataforma) => (plataforma === "win32" ? path.win32 : path.posix);

/** `GDM_YOINKS_YT_DLP`, `GDM_YOINKS_FFMPEG`… */
const variavelDe = (nome) => `GDM_YOINKS_${nome.toUpperCase().replace(/-/g, "_")}`;

/** Pasta das ferramentas embutidas pelo instalador (seção 3). */
export const pastaEmbutida = (ctx) => caminhos(ctx.plataforma).join(ctx.dirApp, "..", "tools");

/** No Windows, o PATH aceita o nome com .exe ou .cmd. No Linux, o arquivo precisa ser executável. */
function noPath(nome, ctx) {
  const p = caminhos(ctx.plataforma);
  const delim = ctx.plataforma === "win32" ? ";" : ":";
  const exts = ctx.plataforma === "win32" ? [".exe", ".cmd"] : [""];
  for (const dir of (ctx.env.PATH ?? ctx.env.Path ?? "").split(delim)) {
    if (!dir) continue;
    for (const e of exts) {
      const c = p.join(dir, nome + e);
      if (ctx.plataforma === "win32" ? ctx.existe(c) : ctx.executavel(c)) return c;
    }
  }
  return null;
}

/**
 * Caminho de uma ferramenta e de onde ele veio:
 * env → config → embutida → PATH → yoinks (só o yt-dlp). Sem nenhuma, devolve o
 * nome puro com origem `ausente`, e o spawn falha como antes.
 * No Linux, o que vem do PATH dentro de /usr/ tem origem `sistema` (pacman).
 */
export function resolveFerramenta(nome, ctx) {
  const p = caminhos(ctx.plataforma);
  const exe = nomeExecutavel(nome, ctx.plataforma);

  const doEnv = ctx.env[variavelDe(nome)];
  if (doEnv) return { caminho: doEnv, origem: "env" };

  const daConfig = ctx.config?.ferramentas?.[nome];
  if (typeof daConfig === "string" && daConfig) return { caminho: daConfig, origem: "config" };

  const embutida = p.join(pastaEmbutida(ctx), exe);
  if (ctx.existe(embutida)) return { caminho: embutida, origem: "embutida" };

  const doPath = noPath(nome, ctx);
  if (doPath) {
    const sistema = ctx.plataforma !== "win32" && doPath.startsWith("/usr/");
    return { caminho: doPath, origem: sistema ? "sistema" : "path" };
  }

  if (nome === "yt-dlp") {
    const doYoinks = p.join(ctx.home, ".yoinks", "bin", exe);
    if (ctx.existe(doYoinks)) return { caminho: doYoinks, origem: "yoinks" };
  }
  return { caminho: nome, origem: "ausente" };
}

/** As três ferramentas obrigatórias. */
export const resolveFerramentas = (ctx) => ({
  ytdlp: resolveFerramenta("yt-dlp", ctx),
  ffmpeg: resolveFerramenta("ffmpeg", ctx),
  ffprobe: resolveFerramenta("ffprobe", ctx),
});

// ── Encoders (§6) ─────────────────────────────────────────────────────────────
/** Na ordem em que o --diagnostico mostra. O AV1 vale com qualquer um dos dois. */
const ENCODERS = [
  { nome: "libvpx-vp9", obrigatorio: true },
  { nome: "libsvtav1", av1: true },
  { nome: "libaom-av1", av1: true },
  { nome: "libopus", obrigatorio: true },
  { nome: "gif", obrigatorio: true },
];

/** Lê a saída de `ffmpeg -encoders`: { itens: [{ nome, tem, obrigatorio }], ok, svtAv1 }. */
export function avaliaEncoders(texto) {
  const tem = (nome) => new RegExp(`^\\s*\\S+\\s+${nome.replace(/-/g, "\\-")}\\s`, "m").test(texto ?? "");
  const itens = ENCODERS.map((e) => ({ nome: e.nome, tem: tem(e.nome), obrigatorio: Boolean(e.obrigatorio) }));
  const av1 = itens.some((i) => i.tem && ENCODERS.find((e) => e.nome === i.nome).av1);
  return { itens, ok: av1 && itens.every((i) => !i.obrigatorio || i.tem), svtAv1: tem("libsvtav1") };
}

// ── Runtime JS do yt-dlp (seção 2.6) ──────────────────────────────────────────
const RUNTIMES = ["deno", "node", "quickjs", "bun"];
/** Primeira versão do yt-dlp com --js-runtimes (o EJS, novembro de 2025). */
export const YTDLP_COM_JS_RUNTIMES = "2025.11.12";

/** `node:C:\x\node.exe`, `quickjs:/x/qjs` ou só o nome; um caminho solto vira `<runtime>:<caminho>`. */
function normalizaRuntime(valor, plataforma) {
  const m = valor.match(/^([a-z]+)(?::(.*))?$/s);
  if (m && RUNTIMES.includes(m[1])) return valor;
  const base = caminhos(plataforma).basename(valor).toLowerCase().replace(/\.exe$/, "");
  const nome = base === "qjs" || base === "quickjs" ? "quickjs" : RUNTIMES.find((r) => base === r);
  return nome ? `${nome}:${valor}` : valor;
}

/**
 * O runtime JS para o yt-dlp: env `GDM_YOINKS_JS` → config `ferramentas.js` →
 * o próprio Node, se for ≥ 22 → QuickJS embutido (`tools/qjs`) → null (o
 * yt-dlp fica com o Deno, o padrão dele, se houver).
 */
export function runtimeJs(ctx) {
  const doEnv = ctx.env.GDM_YOINKS_JS;
  if (doEnv) return normalizaRuntime(doEnv, ctx.plataforma);
  const daConfig = ctx.config?.ferramentas?.js;
  if (typeof daConfig === "string" && daConfig) return normalizaRuntime(daConfig, ctx.plataforma);
  if (ctx.execPath && Number(String(ctx.versaoNode ?? "0").split(".")[0]) >= 22) return `node:${ctx.execPath}`;
  const qjs = caminhos(ctx.plataforma).join(pastaEmbutida(ctx), nomeExecutavel("qjs", ctx.plataforma));
  if (ctx.existe(qjs)) return `quickjs:${qjs}`;
  return null;
}

/** Compara versões por partes numéricas (`2025.11.12` < `2026.8.19`). */
export function comparaVersao(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Argumentos do runtime JS; vazio se o yt-dlp for antigo demais (ele recusaria a opção). */
export function argsJsRuntime(spec, versaoYtDlp) {
  if (!spec || !/^\d{4}\.\d+\.\d+/.test(versaoYtDlp ?? "")) return [];
  return comparaVersao(versaoYtDlp, YTDLP_COM_JS_RUNTIMES) >= 0 ? ["--js-runtimes", spec] : [];
}

// ── Atualização do yt-dlp ─────────────────────────────────────────────────────
/** As versões do yt-dlp são datas (`2026.08.19`): passou de `dias`, o aviso aparece. */
export function ytDlpDesatualizado(versao, hoje = new Date(), dias = 90) {
  const m = String(versao ?? "").match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return false;
  const data = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (hoje.getTime() - data) / 86_400_000 > dias;
}

/** Página do fork do yt-dlp que ainda roda no Windows 7 (seção 11.1). */
export const YTDLP_WIN7 = "https://github.com/nicolaasjan/yt-dlp/releases";

/**
 * Como atualizar, conforme quem instalou (seção 10.3). No Windows antes do 10,
 * o `-U` traria o yt-dlp.exe comum, que só roda do 10 em diante (seção 11.2):
 * a dica é trocar o arquivo pelo yt-dlp_win7.exe do fork.
 */
export function dicaAtualizacao(ytdlp, { windowsAntigo = false } = {}) {
  if (ytdlp.origem === "sistema") return "atualize pelo gerenciador de pacotes (ex.: sudo pacman -Syu)";
  if (windowsAntigo) return `baixe o yt-dlp_win7.exe de ${YTDLP_WIN7} e ponha no lugar de "${ytdlp.caminho}"`;
  return `atualize com "${ytdlp.caminho}" -U`;
}

/** Windows 7, 8 ou 8.1: os binários oficiais do Node 22 e do yt-dlp não rodam nele. */
export function windowsAntesDo10({ plataforma, release }) {
  return plataforma === "win32" && Number(String(release).split(".")[0]) < 10;
}

// ── Terminal (seção 9) ────────────────────────────────────────────────────────
/** Build do Windows 10 1809: antes dele, o conhost trata mal truecolor e a tela alternativa. */
const WINDOWS_MIN_VT = 17763;

/**
 * Terminal em que a tela cheia e as cores não funcionam: `TERM=dumb`, Windows
 * antes do 1809 (inclusive o 7) e o console de texto do Linux (`TERM=linux`).
 * Nele, o programa usa o modo linha sem cores.
 */
export function terminalLimitado({ plataforma, release, env }) {
  if (env.TERM === "dumb") return true;
  if (plataforma === "win32") {
    const [maior, , build] = String(release).split(".").map(Number);
    return maior < 10 || (build ?? 0) < WINDOWS_MIN_VT;
  }
  return env.TERM === "linux";
}
