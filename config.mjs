// gdm-yoinks — arquivo de configuração (o F13 do IDEIAS.md, em versão mínima).
// Funções puras, sem E/S, para os testes (tests/config.test.mjs). Regras:
// docs/Instalador-Implement.md, seções 2.3 e 2.4.
import path from "node:path";

export const VERSAO_CONFIG = 1;
export const FORMATOS = ["webm", "av1", "gif"];

/** `~/.gdm-yoinks/config.json` no Windows; `$XDG_CONFIG_HOME/gdm-yoinks/config.json` nos outros. */
export function caminhoConfig({ plataforma, env, home }) {
  if (plataforma === "win32") return path.win32.join(home, ".gdm-yoinks", "config.json");
  // A especificação do XDG manda ignorar um caminho relativo.
  const xdg = env.XDG_CONFIG_HOME && path.posix.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME : path.posix.join(home, ".config");
  return path.posix.join(xdg, "gdm-yoinks", "config.json");
}

/** Texto do arquivo (ou null se não existe) → { config, aviso }. Nunca lança. */
export function leConfig(texto) {
  if (texto == null) return { config: {}, aviso: null };
  try {
    const c = JSON.parse(texto.replace(/^﻿/, ""));
    if (c && typeof c === "object" && !Array.isArray(c)) return { config: c, aviso: null };
  } catch {}
  return { config: {}, aviso: "config.json inválido; usando os padrões." };
}

const positivo = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Valores válidos da config por cima dos padrões de `op`. As chaves desconhecidas ficam de fora. */
export function aplicaConfig(op, c) {
  if (typeof c.saida === "string" && c.saida.trim()) op.saida = c.saida;
  if (FORMATOS.includes(c.formato)) op.formato = c.formato;
  if (positivo(c.gifFps)) op.gifFps = c.gifFps;
  if (positivo(c.gifLargura)) op.gifLargura = c.gifLargura;
  if (typeof c.verificarYtDlp === "boolean") op.verificarYtDlp = c.verificarYtDlp;
  // Limite da análise, em segundos (Win7-Patch.md, seção 1.5, item 3).
  if (positivo(c.tempoLimite)) op.tempoLimite = c.tempoLimite;
  return op;
}

/** Junta as mudanças na config existente. `undefined` não apaga nada; o desconhecido fica. */
export function mesclaConfig(existente, mudancas) {
  const nova = { ...existente, versao: VERSAO_CONFIG };
  for (const [k, v] of Object.entries(mudancas)) if (v !== undefined) nova[k] = v;
  // versao sempre primeiro, para o arquivo ficar legível
  const { versao, ...resto } = nova;
  return { versao, ...resto };
}

export const serializaConfig = (c) => `${JSON.stringify(c, null, 2)}\n`;

/** `chave=valor` por linha, para o [Code] do Inno ler sem parser de JSON (`--configurar --mostra`). */
export function linhasDaConfig(op) {
  return [
    `saida=${op.saida}`,
    `formato=${op.formato ?? "menu"}`,
    `gifFps=${op.gifFps}`,
    `gifLargura=${op.gifLargura}`,
    `verificarYtDlp=${op.verificarYtDlp === false ? 0 : 1}`,
  ].join("\n") + "\n";
}
