// Testes da conferência de imports do instalador win7 (Instalador-Implement.md, seção 11.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lePe, avaliaWin7 } from "../installer/confere-win7.mjs";

test("avaliaWin7: função do Windows 8+ num import normal é grave", () => {
  const p = avaliaWin7([{ dll: "KERNEL32.dll", funcoes: ["CloseHandle", "GetSystemTimePreciseAsFileTime"], atrasado: false }]);
  assert.deepEqual(p, [{ grave: true, dll: "KERNEL32.dll", funcao: "GetSystemTimePreciseAsFileTime", motivo: "Windows 8+" }]);
});

test("avaliaWin7: DLL que o Windows 7 não tem, e o ProcessPrng do Rust", () => {
  const p = avaliaWin7([
    { dll: "api-ms-win-core-synch-l1-2-0.dll", funcoes: ["WaitOnAddress"], atrasado: false },
    { dll: "bcryptprimitives.dll", funcoes: ["ProcessPrng"], atrasado: false },
  ]);
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.grave));
});

test("avaliaWin7: o Universal CRT (api-ms-win-crt-*) e a synch l1-1-0 do Windows 7 passam", () => {
  assert.deepEqual(avaliaWin7([
    { dll: "api-ms-win-crt-runtime-l1-1-0.dll", funcoes: ["_initterm"], atrasado: false },
    { dll: "api-ms-win-core-synch-l1-1-0.dll", funcoes: ["AcquireSRWLockExclusive"], atrasado: false },
  ]), []);
});

test("avaliaWin7: import atrasado e função com KB só avisam", () => {
  const p = avaliaWin7([
    { dll: "KERNEL32.dll", funcoes: ["SetDefaultDllDirectories"], atrasado: false },
    { dll: "USER32.dll", funcoes: ["GetDpiForWindow"], atrasado: true },
  ]);
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => !x.grave));
});

test("avaliaWin7: DLL que vem junto na pasta não é do sistema", () => {
  assert.deepEqual(avaliaWin7([{ dll: "shcore.dll", funcoes: ["X"], atrasado: false }], new Set(["shcore.dll"])), []);
});

test("lePe recusa o que não é executável", () => {
  assert.throws(() => lePe(Buffer.from("não sou um PE, só texto qualquer com mais de 64 bytes de tamanho....")), /MZ/);
});

test("lePe lê os imports do node.exe que roda os testes", { skip: process.platform !== "win32" }, () => {
  const imports = lePe(fs.readFileSync(process.execPath));
  const kernel = imports.find((i) => i.dll.toLowerCase() === "kernel32.dll");
  assert.ok(kernel, "node.exe importa a KERNEL32.dll");
  assert.ok(kernel.funcoes.includes("CloseHandle"));
});
