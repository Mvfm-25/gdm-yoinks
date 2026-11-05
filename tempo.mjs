// gdm-yoinks — tempos do recorte de trecho (F3). Funções puras, sem E/S, para
// poderem ser testadas com `node --test` (tests/tempo.test.mjs).

/** Duração do trecho quando só o início é conhecido (o `&t=` do link): abaixo do aviso de GIF longo. */
export const DURACAO_PADRAO_S = 10;

/** Trecho mais curto que a fase de recorte da tela cheia aceita. */
export const MIN_TRECHO_S = 1;

const arredonda = (s) => Math.round(s * 1000) / 1000;
const limita = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Põe a ponta `ponta` ("inicio" ou "fim") de um trecho em `v`, dentro de
 * [0, total] e com pelo menos `min` segundos. Se ela atropelar a outra ponta,
 * a outra é empurrada junto, mantendo a duração. Devolve o trecho novo.
 */
export function movePonta({ inicio, fim }, ponta, v, total, min = MIN_TRECHO_S) {
  const dur = Math.max(fim - inicio, min);
  if (ponta === "inicio") {
    inicio = arredonda(limita(v, 0, total - min));
    if (fim < inicio + min) fim = arredonda(Math.min(total, inicio + dur));
  } else {
    fim = arredonda(limita(v, min, total));
    if (inicio > fim - min) inicio = arredonda(Math.max(0, fim - dur));
  }
  return { inicio, fim };
}

/**
 * Lê um tempo em segundos. Aceita `83`, `83.5`, `90s`, `1:23`, `1:02:03` e o
 * formato do `&t=` do YouTube (`1m30s`, `1h2m3s`). Devolve null se não entender.
 */
export function leTempo(texto) {
  const s = String(texto ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)s?$/);
  if (m) return arredonda(Number(m[1]));
  // h:mm:ss ou m:ss; minutos e segundos depois de «:» ficam abaixo de 60.
  m = s.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const [h, min, seg] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
    if (seg >= 60 || (m[1] !== undefined && min >= 60)) return null;
    return arredonda(h * 3600 + min * 60 + seg);
  }
  m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return arredonda(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  return null;
}

/** Separa em horas, minutos, segundos inteiros e o resto (décimos), já arredondado a 0.1 s. */
function partes(s) {
  const d = Math.round(Math.max(0, s) * 10); // em décimos
  const total = Math.floor(d / 10);
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, decimo: d % 10 };
}

/** `83` → `1:23`, `3723` → `1:02:03`, `90.5` → `1:30.5`. */
export function formataTempo(seg) {
  const { h, m, s, decimo } = partes(seg);
  const ss = String(s).padStart(2, "0") + (decimo ? `.${decimo}` : "");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Tempo para o nome do arquivo, sem «:» (proibido no Windows): `90` → `1m30s`, `5` → `5s`. */
export function formataTempoNome(seg) {
  const { h, m, s, decimo } = partes(seg);
  const ss = `${s}${decimo ? `.${decimo}` : ""}s`;
  if (h) return `${h}h${String(m).padStart(2, "0")}m${ss.padStart(decimo ? 5 : 3, "0")}`;
  if (m) return `${m}m${ss.padStart(decimo ? 5 : 3, "0")}`;
  return ss;
}

/** Sufixo do nome do arquivo com o trecho (`_1m30s-1m40s`), ou "" sem recorte. */
export const sufixoDoTrecho = (r) => (r ? `_${formataTempoNome(r.inicio)}-${formataTempoNome(r.fim)}` : "");

/** `1:30 → 1:40 · 10.0 s`, a linha «trecho» do cartão. */
export const textoDoTrecho = (r) => `${formataTempo(r.inicio)} → ${formataTempo(r.fim)} · ${(r.fim - r.inicio).toFixed(1)} s`;

/**
 * Tempo de início que vem no link do YouTube (`&t=90s`, `?t=1m30s`, `?start=90`,
 * `#t=90`), em segundos, ou null. Só no YouTube: no X o `?t=` é outra coisa
 * (um código de compartilhamento).
 */
export function tempoDoLink(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return null;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const valor = u.searchParams.get("t") ?? u.searchParams.get("start") ?? hash.get("t");
  const s = valor === null ? null : leTempo(valor);
  return s === null || s <= 0 ? null : s;
}

/**
 * Recorte `{ inicio, fim }` pedido pelas opções `--inicio`, `--fim` e
 * `--duracao` (já lidas com leTempo), conferido contra a duração do vídeo.
 * Devolve { recorte } (null se não houver recorte, ou se ele pega o vídeo
 * inteiro) ou { erro } com a mensagem.
 */
export function recorteDasOpcoes({ inicio, fim, duracao: dur }, duracaoVideo) {
  if (inicio == null && fim == null && dur == null) return { recorte: null };
  if (!duracaoVideo) return { erro: "Não foi possível saber a duração do vídeo; sem ela não dá para recortar." };
  const total = formataTempo(duracaoVideo);
  const ini = inicio ?? 0;
  const ate = fim ?? (dur != null ? ini + dur : duracaoVideo);
  if (ini >= duracaoVideo) return { erro: `--inicio ${formataTempo(ini)} passa do fim do vídeo (${total}).` };
  // Folga de 0.05 s: a duração do yt-dlp às vezes vem arredondada.
  if (ate > duracaoVideo + 0.05) return { erro: `O trecho termina em ${formataTempo(ate)}, depois do fim do vídeo (${total}).` };
  const recorte = { inicio: ini, fim: arredonda(Math.min(ate, duracaoVideo)) };
  if (recorte.inicio <= 0 && recorte.fim >= duracaoVideo - 0.05) return { recorte: null };
  return { recorte };
}
