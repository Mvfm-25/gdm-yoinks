// A versão mora no package.json (o build.ps1 passa ela ao Inno) e no VERSAO do
// .mjs; os dois precisam bater (Instalador-Implement.md, seção 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
const pacote = JSON.parse(fs.readFileSync(new URL("package.json", raiz), "utf8"));
const programa = fs.readFileSync(new URL("gdm-yoinks.mjs", raiz), "utf8");

test("VERSAO do gdm-yoinks.mjs é a do package.json", () => {
  assert.equal(programa.match(/^const VERSAO = "([^"]+)";/m)?.[1], pacote.version);
});

test("package.json lista todo módulo local que o programa importa", () => {
  const importados = [...programa.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(importados.length > 0);
  for (const m of importados) assert.ok(pacote.files.includes(m), `${m} falta no "files" do package.json`);
});
