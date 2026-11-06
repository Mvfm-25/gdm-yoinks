#!/usr/bin/env node
// Conferência estática dos binários do instalador win7 (Instalador-Implement.md, seção 11.2).
//
//   node installer/confere-win7.mjs <arquivo ou pasta>...
//
// Lê a tabela de imports (e a de imports atrasados) de cada .exe/.dll e procura
// funções e DLLs que só existem do Windows 8 em diante. Um import desses faz o
// Windows 7 recusar o programa na hora ("ponto de entrada não encontrado").
//
// É uma conferência por lista, não uma prova: não vê o que o programa carrega
// com GetProcAddress nem flags novas em funções antigas. O teste de verdade é
// a VM com o Windows 7 (seção 11.2). Sai com 1 se achar algum import proibido.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Funções que o Windows 7 SP1 não exporta, com a versão em que apareceram. */
export const FUNCOES_NOVAS = {
  // kernel32 / kernelbase
  GetSystemTimePreciseAsFileTime: "8", CreateFile2: "8", CopyFile2: "8",
  WaitOnAddress: "8", WakeByAddressSingle: "8", WakeByAddressAll: "8",
  GetCurrentThreadStackLimits: "8", PrefetchVirtualMemory: "8", GetOverlappedResultEx: "8",
  GetProcessMitigationPolicy: "8", SetProcessMitigationPolicy: "8",
  GetProcessInformation: "8", SetProcessInformation: "8",
  GetThreadInformation: "8", SetThreadInformation: "8",
  GetCurrentPackageFullName: "8", GetCurrentPackageId: "8", GetPackageFamilyName: "8",
  GetPackagePathByFullName: "8", GetCurrentPackagePath: "8",
  GetFirmwareType: "8", InitializeSynchronizationBarrier: "8", EnterSynchronizationBarrier: "8",
  DeleteSynchronizationBarrier: "8", CreateFileMappingFromApp: "8", MapViewOfFileFromApp: "8",
  VirtualAllocFromApp: "10", VirtualProtectFromApp: "10",
  DiscardVirtualMemory: "8.1", OfferVirtualMemory: "8.1", ReclaimVirtualMemory: "8.1",
  SetThreadDescription: "10", GetThreadDescription: "10",
  VirtualAlloc2: "10", MapViewOfFile3: "10", CreateFileMapping2: "10",
  GetSystemCpuSetInformation: "10", SetThreadSelectedCpuSets: "10", GetThreadSelectedCpuSets: "10",
  SetProcessDefaultCpuSets: "10", QueryUnbiasedInterruptTimePrecise: "10", QueryInterruptTimePrecise: "10",
  CreatePseudoConsole: "10", ResizePseudoConsole: "10", ClosePseudoConsole: "10",
  GetSystemTimeAdjustmentPrecise: "10", GetOsSafeBootMode: "10",
  // user32
  SetCoalescableTimer: "8", GetPointerType: "8", GetPointerInfo: "8", EnableMouseInPointer: "8",
  GetDpiForWindow: "10", GetDpiForSystem: "10", SetProcessDpiAwarenessContext: "10",
  SetThreadDpiAwarenessContext: "10", GetSystemMetricsForDpi: "10", AdjustWindowRectExForDpi: "10",
  // ws2_32
  GetAddrInfoExOverlappedResult: "8", GetAddrInfoExCancel: "8",
  // bcryptprimitives: o gerador de números do Rust desde a 1.78, que tirou o Windows 7
  ProcessPrng: "10",
};

/** Funções que o Windows 7 só tem com uma atualização (avisa, mas não reprova). */
export const FUNCOES_COM_KB = {
  SetDefaultDllDirectories: "KB2533623", AddDllDirectory: "KB2533623", RemoveDllDirectory: "KB2533623",
};

/** DLLs que não existem no Windows 7 (comparação sem diferenciar maiúsculas). */
export const DLLS_NOVAS = [
  /^combase\.dll$/, /^shcore\.dll$/, /^dxcore\.dll$/, /^d3d12\.dll$/, /^windows\.storage\.dll$/,
  /^api-ms-win-core-path-l1-/, /^api-ms-win-core-winrt-/, /^api-ms-win-core-synch-l1-2-/,
  /^api-ms-win-core-.*-l1-[2-9]-/, /^api-ms-win-core-.*-l[2-9]-/, /^api-ms-win-core-.*-l1-1-[1-9]\.dll$/,
  /^api-ms-win-(?:shcore|appmodel|gaming|ro)-/,
];

// ── Leitura do PE ─────────────────────────────────────────────────────────────

/** Imports de um PE: [{ dll, funcoes: [nome | "#ordinal"], atrasado }]. Lança erro se não for PE. */
export function lePe(buf) {
  if (buf.length < 64 || buf.readUInt16LE(0) !== 0x5a4d) throw new Error("não é um executável (sem MZ)");
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) throw new Error("não é um executável (sem PE)");
  const coff = pe + 4;
  const nSecoes = buf.readUInt16LE(coff + 2);
  const tamOpcional = buf.readUInt16LE(coff + 16);
  const opc = coff + 20;
  const pe64 = buf.readUInt16LE(opc) === 0x20b;
  const imageBase = pe64 ? Number(buf.readBigUInt64LE(opc + 24)) : buf.readUInt32LE(opc + 28);
  const dirs = opc + (pe64 ? 112 : 96);
  const dir = (i) => ({ rva: buf.readUInt32LE(dirs + i * 8), tam: buf.readUInt32LE(dirs + i * 8 + 4) });

  const secoes = [];
  for (let i = 0, s = opc + tamOpcional; i < nSecoes; i++, s += 40)
    secoes.push({ va: buf.readUInt32LE(s + 12), tamV: buf.readUInt32LE(s + 8),
      bruto: buf.readUInt32LE(s + 20), tamB: buf.readUInt32LE(s + 16) });
  const off = (rva) => {
    const s = secoes.find((x) => rva >= x.va && rva < x.va + Math.max(x.tamV, x.tamB));
    if (!s) throw new Error(`RVA 0x${rva.toString(16)} fora das seções`);
    return rva - s.va + s.bruto;
  };
  const texto = (rva) => { const o = off(rva); return buf.toString("latin1", o, buf.indexOf(0, o)); };

  const tamThunk = pe64 ? 8 : 4;
  const thunks = (rva) => {
    const nomes = [];
    for (let o = off(rva); ; o += tamThunk) {
      const v = pe64 ? buf.readBigUInt64LE(o) : BigInt(buf.readUInt32LE(o));
      if (v === 0n) break;
      const ordinal = pe64 ? (v >> 63n) === 1n : (v >> 31n) === 1n;
      nomes.push(ordinal ? `#${Number(v & 0xffffn)}` : texto(Number(v & 0x7fffffffn) + 2));
    }
    return nomes;
  };

  const res = [];
  const imp = dir(1);
  if (imp.rva) {
    for (let o = off(imp.rva); ; o += 20) {
      const oft = buf.readUInt32LE(o), nome = buf.readUInt32LE(o + 12), ft = buf.readUInt32LE(o + 16);
      if (!oft && !nome && !ft) break;
      res.push({ dll: texto(nome), funcoes: thunks(oft || ft), atrasado: false });
    }
  }
  const atr = dir(13);
  if (atr.rva) {
    for (let o = off(atr.rva); ; o += 32) {
      const attrs = buf.readUInt32LE(o), nome = buf.readUInt32LE(o + 4), int = buf.readUInt32LE(o + 16);
      if (!nome) break;
      // Formato antigo (attrs sem o bit 1): os campos são endereços virtuais, não RVAs.
      const rva = (v) => (attrs & 1 ? v : v - imageBase);
      res.push({ dll: texto(rva(nome)), funcoes: int ? thunks(rva(int)) : [], atrasado: true });
    }
  }
  return res;
}

/**
 * Problemas de um binário para o Windows 7: [{ grave, dll, funcao?, motivo }].
 * `locais` são as DLLs que vêm junto (na mesma pasta), que não são do sistema.
 * Imports atrasados nunca são graves: só falham se o programa chegar a usá-los.
 */
export function avaliaWin7(imports, locais = new Set()) {
  const problemas = [];
  for (const { dll, funcoes, atrasado } of imports) {
    const nome = dll.toLowerCase();
    if (locais.has(nome)) continue;
    if (DLLS_NOVAS.some((re) => re.test(nome)))
      problemas.push({ grave: !atrasado, dll, motivo: "DLL que o Windows 7 não tem" });
    for (const f of funcoes) {
      if (FUNCOES_NOVAS[f])
        problemas.push({ grave: !atrasado, dll, funcao: f, motivo: `Windows ${FUNCOES_NOVAS[f]}+` });
      else if (FUNCOES_COM_KB[f])
        problemas.push({ grave: false, dll, funcao: f, motivo: `precisa da ${FUNCOES_COM_KB[f]} no Windows 7` });
    }
  }
  return problemas;
}

// ── Linha de comando ──────────────────────────────────────────────────────────

function binarios(alvo) {
  if (!fs.statSync(alvo).isDirectory()) return [alvo];
  return fs.readdirSync(alvo).filter((n) => /\.(exe|dll)$/i.test(n)).map((n) => path.join(alvo, n));
}

function principal(alvos) {
  if (!alvos.length) { console.error("uso: node confere-win7.mjs <arquivo ou pasta>..."); return 2; }
  let graves = 0;
  for (const arq of alvos.flatMap(binarios)) {
    const locais = new Set(fs.readdirSync(path.dirname(arq)).map((n) => n.toLowerCase()));
    const problemas = avaliaWin7(lePe(fs.readFileSync(arq)), locais);
    const g = problemas.filter((p) => p.grave).length;
    graves += g;
    console.log(`${g ? "✗" : "ok"}  ${path.basename(arq)}`);
    for (const p of problemas)
      console.log(`      ${p.grave ? "ERRO " : "aviso"} ${p.dll}${p.funcao ? `!${p.funcao}` : ""}: ${p.motivo}`
        + `${p.grave ? "" : p.funcao && FUNCOES_COM_KB[p.funcao] ? "" : " (import atrasado)"}`);
  }
  return graves ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = principal(process.argv.slice(2));
