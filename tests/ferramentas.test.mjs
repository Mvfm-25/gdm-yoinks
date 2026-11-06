// Testes da resolução de ferramentas (Instalador-Implement.md, seções 2.1, 2.2, 2.5, 2.6 e 9).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nomeExecutavel, resolveFerramenta, avaliaEncoders, runtimeJs, argsJsRuntime, comparaVersao,
  ytDlpDesatualizado, dicaAtualizacao, terminalLimitado, windowsAntesDo10, comandoProvaJs, nomeDoRuntime,
  etapaDoYtDlp, nivelDeCor, glifosAscii, ansi16, paraAscii,
} from "../ferramentas.mjs";

/** Contexto falso: `arquivos` são os caminhos que "existem" (e são executáveis). */
const ctxWin = (arquivos, extra = {}) => ({
  plataforma: "win32",
  env: { PATH: "C:\\bin;C:\\outro" },
  config: {},
  dirApp: "C:\\Prog\\gdm-yoinks\\app",
  home: "C:\\Users\\ana",
  existe: (p) => arquivos.includes(p),
  executavel: (p) => arquivos.includes(p),
  ...extra,
});

const ctxLinux = (arquivos, extra = {}) => ({
  plataforma: "linux",
  env: { PATH: "/home/ana/.local/bin:/usr/bin" },
  config: {},
  dirApp: "/usr/lib/gdm-yoinks",
  home: "/home/ana",
  existe: (p) => arquivos.includes(p) || arquivos.includes(`!x ${p}`),
  executavel: (p) => arquivos.includes(p),
  ...extra,
});

test("nomeExecutavel só acrescenta .exe no Windows", () => {
  assert.equal(nomeExecutavel("ffmpeg", "win32"), "ffmpeg.exe");
  assert.equal(nomeExecutavel("ffmpeg", "linux"), "ffmpeg");
  assert.equal(nomeExecutavel("ffmpeg", "darwin"), "ffmpeg");
});

test("variável de ambiente vem antes de tudo", () => {
  const ctx = ctxWin(["C:\\Prog\\gdm-yoinks\\tools\\ffmpeg.exe", "C:\\bin\\ffmpeg.exe"],
    { env: { PATH: "C:\\bin", GDM_YOINKS_FFMPEG: "D:\\debug\\ffmpeg.exe" } });
  assert.deepEqual(resolveFerramenta("ffmpeg", ctx), { caminho: "D:\\debug\\ffmpeg.exe", origem: "env" });
});

test("config vem antes da embutida", () => {
  const ctx = ctxWin(["C:\\Prog\\gdm-yoinks\\tools\\ffmpeg.exe"],
    { config: { ferramentas: { ffmpeg: "E:\\meu\\ffmpeg.exe" } } });
  assert.deepEqual(resolveFerramenta("ffmpeg", ctx), { caminho: "E:\\meu\\ffmpeg.exe", origem: "config" });
});

test("embutida (tools\\ ao lado de app\\) vem antes do PATH", () => {
  const ctx = ctxWin(["C:\\Prog\\gdm-yoinks\\tools\\ffmpeg.exe", "C:\\bin\\ffmpeg.exe"]);
  assert.deepEqual(resolveFerramenta("ffmpeg", ctx),
    { caminho: "C:\\Prog\\gdm-yoinks\\tools\\ffmpeg.exe", origem: "embutida" });
});

test("PATH na ordem das pastas", () => {
  const ctx = ctxWin(["C:\\outro\\ffprobe.exe", "C:\\bin\\ffprobe.exe"]);
  assert.deepEqual(resolveFerramenta("ffprobe", ctx), { caminho: "C:\\bin\\ffprobe.exe", origem: "path" });
});

test("yt-dlp do yoinks só quando não há outro", () => {
  const doYoinks = "C:\\Users\\ana\\.yoinks\\bin\\yt-dlp.exe";
  assert.deepEqual(resolveFerramenta("yt-dlp", ctxWin([doYoinks])), { caminho: doYoinks, origem: "yoinks" });
  assert.equal(resolveFerramenta("yt-dlp", ctxWin([doYoinks, "C:\\bin\\yt-dlp.exe"])).origem, "path");
  // o ffmpeg nunca vem do yoinks
  assert.equal(resolveFerramenta("ffmpeg", ctxWin(["C:\\Users\\ana\\.yoinks\\bin\\ffmpeg.exe"])).origem, "ausente");
});

test("ausente devolve o nome puro, para o spawn falhar como hoje", () => {
  assert.deepEqual(resolveFerramenta("ffmpeg", ctxWin([])), { caminho: "ffmpeg", origem: "ausente" });
});

test("Linux: sem .exe, exige permissão de execução e marca /usr como sistema", () => {
  assert.deepEqual(resolveFerramenta("yt-dlp", ctxLinux(["/usr/bin/yt-dlp"])),
    { caminho: "/usr/bin/yt-dlp", origem: "sistema" });
  assert.deepEqual(resolveFerramenta("yt-dlp", ctxLinux(["/home/ana/.local/bin/yt-dlp", "/usr/bin/yt-dlp"])),
    { caminho: "/home/ana/.local/bin/yt-dlp", origem: "path" });
  // existe, mas sem +x: pula para o próximo
  assert.deepEqual(resolveFerramenta("yt-dlp", ctxLinux(["!x /home/ana/.local/bin/yt-dlp", "/usr/bin/yt-dlp"])),
    { caminho: "/usr/bin/yt-dlp", origem: "sistema" });
});

const ENCODERS = `Encoders:
 V..... = Video
 ------
 V....D gif                  GIF (Graphics Interchange Format)
 V....D libaom-av1           libaom AV1 (codec av1)
 V....D libvpx-vp9           libvpx VP9 (codec vp9)
 A....D libopus              libopus Opus (codec opus)
`;

test("avaliaEncoders: obrigatórios e AV1 por qualquer um dos dois", () => {
  const r = avaliaEncoders(ENCODERS);
  assert.equal(r.ok, true);
  assert.equal(r.svtAv1, false);
  assert.deepEqual(r.itens.map((i) => [i.nome, i.tem]), [
    ["libvpx-vp9", true], ["libsvtav1", false], ["libaom-av1", true], ["libopus", true], ["gif", true],
  ]);
  assert.equal(avaliaEncoders(ENCODERS.replace(/^.*libaom-av1.*$/m, "")).ok, false);
  assert.equal(avaliaEncoders(ENCODERS.replace(/^.*libopus.*$/m, "")).ok, false);
  assert.equal(avaliaEncoders("").ok, false);
  const svt = avaliaEncoders(ENCODERS.replace(/^.*libaom-av1.*$/m, " V....D libsvtav1            SVT-AV1"));
  assert.equal(svt.ok, true);
  assert.equal(svt.svtAv1, true);
});

test("runtimeJs: env, config, Node ≥ 22, QuickJS embutido, nenhum", () => {
  const base = { execPath: "C:\\Prog\\gdm-yoinks\\runtime\\node.exe", versaoNode: "22.11.0" };
  assert.equal(runtimeJs(ctxWin([], { ...base, env: { GDM_YOINKS_JS: "deno:D:\\deno.exe" } })), "deno:D:\\deno.exe");
  assert.equal(runtimeJs(ctxWin([], { ...base, env: { GDM_YOINKS_JS: "D:\\x\\qjs.exe" } })), "quickjs:D:\\x\\qjs.exe");
  assert.equal(runtimeJs(ctxWin([], { ...base, config: { ferramentas: { js: "bun" } } })), "bun");
  assert.equal(runtimeJs(ctxWin([], base)), "node:C:\\Prog\\gdm-yoinks\\runtime\\node.exe");
  const qjs = "C:\\Prog\\gdm-yoinks\\tools\\qjs.exe";
  assert.equal(runtimeJs(ctxWin([qjs], { ...base, versaoNode: "18.20.0" })), `quickjs:${qjs}`);
  assert.equal(runtimeJs(ctxWin([], { ...base, versaoNode: "18.20.0" })), null);
});

test("argsJsRuntime só passa a opção para um yt-dlp que a conhece", () => {
  assert.deepEqual(argsJsRuntime("node:/usr/bin/node", "2026.08.19"), ["--js-runtimes", "node:/usr/bin/node"]);
  assert.deepEqual(argsJsRuntime("node:/usr/bin/node", "2025.11.12"), ["--js-runtimes", "node:/usr/bin/node"]);
  assert.deepEqual(argsJsRuntime("node:/usr/bin/node", "2025.10.22"), []);
  assert.deepEqual(argsJsRuntime("node:/usr/bin/node", null), []);
  assert.deepEqual(argsJsRuntime(null, "2026.08.19"), []);
});

test("comparaVersao compara partes numéricas", () => {
  assert.ok(comparaVersao("2026.08.19", "2025.11.12") > 0);
  assert.ok(comparaVersao("2025.9.1", "2025.11.12") < 0);
  assert.equal(comparaVersao("2025.11.12", "2025.11.12"), 0);
  assert.ok(comparaVersao("2025.11.12.123456", "2025.11.12") > 0);
});

test("ytDlpDesatualizado: mais de 90 dias pela data da versão", () => {
  const hoje = new Date("2026-11-06T12:00:00Z");
  assert.equal(ytDlpDesatualizado("2026.08.19", hoje), false);
  assert.equal(ytDlpDesatualizado("2026.07.01", hoje), true);
  assert.equal(ytDlpDesatualizado("lixo", hoje), false);
  assert.equal(ytDlpDesatualizado(null, hoje), false);
});

test("dicaAtualizacao depende de quem instalou o yt-dlp", () => {
  assert.match(dicaAtualizacao({ origem: "sistema" }), /gerenciador de pacotes/);
  assert.match(dicaAtualizacao({ origem: "embutida", caminho: "C:\\x\\yt-dlp.exe" }), /yt-dlp\.exe" -U/);
  assert.match(dicaAtualizacao({ origem: "path", caminho: "yt-dlp" }), /-U/);
});

test("dicaAtualizacao no Windows antes do 10 não sugere o -U (traria o yt-dlp do Windows 10)", () => {
  const dica = dicaAtualizacao({ origem: "embutida", caminho: "C:\\x\\yt-dlp.exe" }, { windowsAntigo: true });
  assert.doesNotMatch(dica, /-U/);
  assert.match(dica, /nicolaasjan\/yt-dlp/);
  assert.match(dica, /yt-dlp_win7\.exe/);
  assert.match(dica, /C:\\x\\yt-dlp\.exe/);
});

test("windowsAntesDo10: só o Windows 7, 8 e 8.1", () => {
  assert.equal(windowsAntesDo10({ plataforma: "win32", release: "6.1.7601" }), true);
  assert.equal(windowsAntesDo10({ plataforma: "win32", release: "6.3.9600" }), true);
  assert.equal(windowsAntesDo10({ plataforma: "win32", release: "10.0.17134" }), false);
  assert.equal(windowsAntesDo10({ plataforma: "win32", release: "10.0.26200" }), false);
  assert.equal(windowsAntesDo10({ plataforma: "linux", release: "6.1.0" }), false);
});

test("terminalLimitado: TERM=dumb, Windows antes do 1809, console do Linux", () => {
  assert.equal(terminalLimitado({ plataforma: "win32", release: "10.0.26200", env: {} }), false);
  assert.equal(terminalLimitado({ plataforma: "win32", release: "10.0.17763", env: {} }), false);
  assert.equal(terminalLimitado({ plataforma: "win32", release: "10.0.17134", env: {} }), true);
  assert.equal(terminalLimitado({ plataforma: "win32", release: "6.1.7601", env: {} }), true);
  assert.equal(terminalLimitado({ plataforma: "linux", release: "6.6.1", env: { TERM: "xterm-256color" } }), false);
  assert.equal(terminalLimitado({ plataforma: "linux", release: "6.6.1", env: { TERM: "linux" } }), true);
  assert.equal(terminalLimitado({ plataforma: "linux", release: "6.6.1", env: { TERM: "dumb" } }), true);
});

// ── Patch 0.1.1 (docs/Win7-Patch.md, seção 1.6) ───────────────────────────────
test("comandoProvaJs: cada runtime imprime 1 do seu jeito", () => {
  assert.deepEqual(comandoProvaJs("quickjs:C:\\x\\qjs.exe"), { cmd: "C:\\x\\qjs.exe", args: ["-e", "print(1)"] });
  assert.deepEqual(comandoProvaJs("quickjs"), { cmd: "qjs", args: ["-e", "print(1)"] });
  assert.deepEqual(comandoProvaJs("node:/usr/bin/node"), { cmd: "/usr/bin/node", args: ["-e", "console.log(1)"] });
  assert.deepEqual(comandoProvaJs("deno"), { cmd: "deno", args: ["eval", "console.log(1)"] });
  assert.deepEqual(comandoProvaJs("bun:/x/bun"), { cmd: "/x/bun", args: ["-e", "console.log(1)"] });
  assert.equal(comandoProvaJs(null), null);
  assert.equal(comandoProvaJs("lixo"), null);
});

test("nomeDoRuntime tira o caminho", () => {
  assert.equal(nomeDoRuntime("quickjs:C:\\x\\qjs.exe"), "quickjs");
  assert.equal(nomeDoRuntime("deno"), "deno");
  assert.equal(nomeDoRuntime(null), null);
});

test("etapaDoYtDlp traduz as linhas do -v em etapas da análise", () => {
  assert.equal(etapaDoYtDlp("[youtube] 9N7oSJiKwiQ: Downloading webpage"), "baixando a página");
  assert.equal(etapaDoYtDlp("[youtube] 9N7oSJiKwiQ: Downloading tv samsung player API JSON"), "consultando o YouTube");
  assert.equal(etapaDoYtDlp("[youtube] 9N7oSJiKwiQ: Downloading player a5c2aafe-main"), "baixando o player");
  assert.equal(etapaDoYtDlp("[youtube] [jsc:quickjs] Solving JS challenges using quickjs"), "resolvendo o desafio JS");
  assert.equal(etapaDoYtDlp("[youtube] 9N7oSJiKwiQ: Downloading m3u8 information"), "lendo os formatos");
  assert.equal(etapaDoYtDlp("[twitter] 1880040599519703372: Downloading guest token"), "consultando o X");
  assert.equal(etapaDoYtDlp("[twitter] 1880040599519703372: Downloading GraphQL JSON"), "consultando o X");
  assert.equal(etapaDoYtDlp("[info] 9N7oSJiKwiQ: Downloading 1 format(s): 137+251"), "escolhendo o formato");
  assert.equal(etapaDoYtDlp("[debug] [youtube] [jsc:quickjs] Running QuickJS: qjs.exe --script x.js"), null);
  assert.equal(etapaDoYtDlp("[youtube] Extracting URL: https://youtu.be/x"), null);
  assert.equal(etapaDoYtDlp(""), null);
});

// ── Terminal do Windows 7 (docs/Win7-Patch.md, seção 2.2) ─────────────────────
test("nivelDeCor: truecolor, 16 ou nenhuma", () => {
  const win = (release, env = {}, tty = true) => nivelDeCor({ plataforma: "win32", release, env, tty });
  assert.equal(win("10.0.26200"), "truecolor");
  assert.equal(win("6.1.7601"), "16");
  assert.equal(win("10.0.17134"), "16");
  assert.equal(win("6.1.7601", { NO_COLOR: "" }), "nenhuma");
  assert.equal(win("10.0.26200", {}, false), "nenhuma");
  const linux = (TERM) => nivelDeCor({ plataforma: "linux", release: "6.6.1", env: { TERM }, tty: true });
  assert.equal(linux("xterm-256color"), "truecolor");
  assert.equal(linux("linux"), "16");
  assert.equal(linux("dumb"), "nenhuma");
});

test("glifosAscii: Windows antes do 10 e o console de texto do Linux", () => {
  assert.equal(glifosAscii({ plataforma: "win32", release: "6.1.7601", env: {} }), true);
  assert.equal(glifosAscii({ plataforma: "win32", release: "10.0.17134", env: {} }), false);
  assert.equal(glifosAscii({ plataforma: "linux", release: "6.6.1", env: { TERM: "linux" } }), true);
  assert.equal(glifosAscii({ plataforma: "linux", release: "6.6.1", env: { TERM: "xterm" } }), false);
});

test("ansi16: a paleta Fósforo nas 16 cores do console", () => {
  assert.equal(ansi16("#96E072"), 92); // acento / p4
  assert.equal(ansi16("#d2564f"), 91); // perigo
  assert.equal(ansi16("#8a9690"), 90); // fraco
  assert.equal(ansi16("#2c3330"), 90); // borda: visível no fundo preto
  assert.equal(ansi16("#e4e6e4"), 37); // texto
  assert.equal(ansi16("#FFFFFF"), 97); // pico
  assert.equal(ansi16("#0e1020"), 30); // sobreAcento
  assert.equal(ansi16("#3E8914"), 32); // p2: verde escuro
});

test("paraAscii troca o que a fonte do console do Windows 7 não tem", () => {
  assert.equal(paraAscii("✔ 3.2 MB"), "+ 3.2 MB");
  assert.equal(paraAscii("✖ falhou"), "x falhou");
  assert.equal(paraAscii("  › link"), "  > link");
  assert.equal(paraAscii("╭───"), "+---");
  assert.equal(paraAscii("│ tipo"), "| tipo");
  assert.equal(paraAscii("analisando…"), "analisando...");
  assert.equal(paraAscii("↑↓ mover · enter"), "^v mover · enter");
  assert.equal(paraAscii("0:01 → 0:11"), "0:01 -> 0:11");
  assert.equal(paraAscii("01  ★  "), "01  *  ");
  // acentos, «», × e · existem na página de código do console: ficam
  assert.equal(paraAscii("vídeo «x» 1280×720 · ok"), "vídeo «x» 1280×720 · ok");
  assert.equal(paraAscii("\x1b[92m✔\x1b[39m"), "\x1b[92m+\x1b[39m");
});
