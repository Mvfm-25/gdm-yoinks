// Testes do arquivo de configuração (Instalador-Implement.md, seções 2.3 e 2.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { caminhoConfig, leConfig, aplicaConfig, mesclaConfig, serializaConfig, linhasDaConfig } from "../config.mjs";

test("caminhoConfig: ~/.gdm-yoinks no Windows, XDG no Linux", () => {
  assert.equal(caminhoConfig({ plataforma: "win32", env: {}, home: "C:\\Users\\ana" }),
    "C:\\Users\\ana\\.gdm-yoinks\\config.json");
  assert.equal(caminhoConfig({ plataforma: "linux", env: {}, home: "/home/ana" }),
    "/home/ana/.config/gdm-yoinks/config.json");
  assert.equal(caminhoConfig({ plataforma: "linux", env: { XDG_CONFIG_HOME: "/x/cfg" }, home: "/home/ana" }),
    "/x/cfg/gdm-yoinks/config.json");
  // XDG relativo é inválido pela especificação: ignora
  assert.equal(caminhoConfig({ plataforma: "linux", env: { XDG_CONFIG_HOME: "cfg" }, home: "/home/ana" }),
    "/home/ana/.config/gdm-yoinks/config.json");
});

test("leConfig: ausente, válido, inválido e não-objeto", () => {
  assert.deepEqual(leConfig(null), { config: {}, aviso: null });
  assert.deepEqual(leConfig('{"versao":1,"formato":"gif"}'), { config: { versao: 1, formato: "gif" }, aviso: null });
  const ruim = leConfig("{ isto não é json");
  assert.deepEqual(ruim.config, {});
  assert.match(ruim.aviso, /config\.json inválido/);
  assert.match(leConfig("[1,2]").aviso, /inválido/);
  // BOM do Bloco de Notas não atrapalha
  assert.deepEqual(leConfig('\uFEFF{"gifFps":10}').config, { gifFps: 10 });
});

test("aplicaConfig usa só os valores válidos e ignora chaves desconhecidas", () => {
  const padrao = { saida: "/home/ana/Downloads", formato: null, gifFps: 15, gifLargura: 480, verificarYtDlp: true };
  assert.deepEqual(aplicaConfig({ ...padrao }, { saida: "/v", formato: "av1", gifFps: 10, gifLargura: 320,
    verificarYtDlp: false, chaveDoFuturo: 1 }),
  { saida: "/v", formato: "av1", gifFps: 10, gifLargura: 320, verificarYtDlp: false });
  assert.deepEqual(aplicaConfig({ ...padrao }, { saida: "", formato: "mp4", gifFps: -1, gifLargura: "x",
    verificarYtDlp: "sim" }), padrao);
  assert.deepEqual(aplicaConfig({ ...padrao }, { formato: null }), padrao);
});

test("mesclaConfig grava versão, preserva o desconhecido e aceita formato null", () => {
  const existente = { versao: 1, saida: "/a", formato: "gif", chaveDoFuturo: { x: 1 } };
  assert.deepEqual(mesclaConfig(existente, { saida: "/b", formato: null }),
    { versao: 1, saida: "/b", formato: null, chaveDoFuturo: { x: 1 } });
  assert.deepEqual(mesclaConfig({}, { gifFps: 12 }), { versao: 1, gifFps: 12 });
  // undefined não apaga o que já existe
  assert.deepEqual(mesclaConfig({ saida: "/a" }, { saida: undefined }), { versao: 1, saida: "/a" });
});

test("serializaConfig escapa barras e aspas do Windows", () => {
  const s = serializaConfig({ versao: 1, saida: 'C:\\Users\\Jo"ão\\Vídeos' });
  assert.equal(JSON.parse(s).saida, 'C:\\Users\\Jo"ão\\Vídeos');
  assert.ok(s.endsWith("\n"));
});

test("linhasDaConfig: chave=valor para o [Code] do Inno ler", () => {
  assert.equal(linhasDaConfig({ saida: "C:\\v", formato: null, gifFps: 15, gifLargura: 480, verificarYtDlp: true }),
    "saida=C:\\v\nformato=menu\ngifFps=15\ngifLargura=480\nverificarYtDlp=1\n");
});
