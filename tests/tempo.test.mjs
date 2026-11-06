// Testes do recorte de trecho (F3). Rodar com `npm test` (ou `node --test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leTempo, formataTempo, formataTempoNome, sufixoDoTrecho, textoDoTrecho, tempoDoLink, recorteDasOpcoes, movePonta,
} from "../tempo.mjs";

test("leTempo aceita segundos, m:ss, h:mm:ss e o formato do &t=", () => {
  assert.equal(leTempo("83"), 83);
  assert.equal(leTempo("83.5"), 83.5);
  assert.equal(leTempo("90s"), 90);
  assert.equal(leTempo("1:23"), 83);
  assert.equal(leTempo("1:02:03"), 3723);
  assert.equal(leTempo("0:05.5"), 5.5);
  assert.equal(leTempo("1m30s"), 90);
  assert.equal(leTempo("1h2m3s"), 3723);
  assert.equal(leTempo("2m"), 120);
  assert.equal(leTempo(" 1:23 "), 83);
  assert.equal(leTempo("0"), 0);
});

test("leTempo recusa o que não é tempo", () => {
  for (const s of ["", "abc", "-5", "1:60", "1:60:00", "1::2", ":30", "1:2:3:4", "1m30", "s", "1.2.3", undefined, null])
    assert.equal(leTempo(s), null, `«${s}» deveria ser recusado`);
});

test("formataTempo e formataTempoNome", () => {
  assert.equal(formataTempo(0), "0:00");
  assert.equal(formataTempo(83), "1:23");
  assert.equal(formataTempo(90.5), "1:30.5");
  assert.equal(formataTempo(212.4), "3:32.4");
  assert.equal(formataTempo(3723), "1:02:03");
  assert.equal(formataTempoNome(5), "5s");
  assert.equal(formataTempoNome(65), "1m05s");
  assert.equal(formataTempoNome(90), "1m30s");
  assert.equal(formataTempoNome(90.5), "1m30.5s");
  assert.equal(formataTempoNome(65.5), "1m05.5s");
  assert.equal(formataTempoNome(3723), "1h02m03s");
  assert.equal(sufixoDoTrecho({ inicio: 90, fim: 100 }), "_1m30s-1m40s");
  assert.equal(sufixoDoTrecho(null), "");
  assert.equal(textoDoTrecho({ inicio: 90, fim: 100 }), "1:30 → 1:40 · 10.0 s");
});

test("tempoDoLink lê o tempo só de links do YouTube", () => {
  assert.equal(tempoDoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s"), 90);
  assert.equal(tempoDoLink("https://youtu.be/dQw4w9WgXcQ?t=90"), 90);
  assert.equal(tempoDoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"), 90);
  assert.equal(tempoDoLink("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42"), 42);
  assert.equal(tempoDoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=1:30"), 90);
  assert.equal(tempoDoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(tempoDoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0"), null);
  assert.equal(tempoDoLink("https://x.com/u/status/123?s=20&t=AbCdEf"), null); // no X, o t= não é tempo
  assert.equal(tempoDoLink("não é url"), null);
});

test("movePonta limita ao vídeo e empurra a outra ponta", () => {
  const r = { inicio: 90, fim: 100 };
  assert.deepEqual(movePonta(r, "inicio", 91, 212.4), { inicio: 91, fim: 100 });
  assert.deepEqual(movePonta(r, "fim", 105, 212.4), { inicio: 90, fim: 105 });
  assert.deepEqual(movePonta(r, "inicio", -3, 212.4), { inicio: 0, fim: 100 });
  assert.deepEqual(movePonta(r, "fim", 999, 212.4), { inicio: 90, fim: 212.4 });
  // início passa do fim: o fim vai junto, com os mesmos 10 s
  assert.deepEqual(movePonta(r, "inicio", 150, 212.4), { inicio: 150, fim: 160 });
  // ...mas não passa do fim do vídeo
  assert.deepEqual(movePonta(r, "inicio", 210, 212.4), { inicio: 210, fim: 212.4 });
  assert.deepEqual(movePonta(r, "inicio", 999, 212.4), { inicio: 211.4, fim: 212.4 });
  // fim antes do início: o início recua
  assert.deepEqual(movePonta(r, "fim", 50, 212.4), { inicio: 40, fim: 50 });
  assert.deepEqual(movePonta(r, "fim", 0, 212.4), { inicio: 0, fim: 1 });
});

test("recorteDasOpcoes monta e confere o trecho", () => {
  const dur = 212.4;
  assert.deepEqual(recorteDasOpcoes({}, dur), { recorte: null });
  assert.deepEqual(recorteDasOpcoes({ inicio: 83, duracao: 5 }, dur), { recorte: { inicio: 83, fim: 88 } });
  assert.deepEqual(recorteDasOpcoes({ inicio: 83, fim: 88 }, dur), { recorte: { inicio: 83, fim: 88 } });
  assert.deepEqual(recorteDasOpcoes({ inicio: 200 }, dur), { recorte: { inicio: 200, fim: 212.4 } });
  assert.deepEqual(recorteDasOpcoes({ fim: 10 }, dur), { recorte: { inicio: 0, fim: 10 } });
  assert.deepEqual(recorteDasOpcoes({ inicio: 0, fim: 212.4 }, dur), { recorte: null }); // vídeo inteiro
  assert.ok(recorteDasOpcoes({ inicio: 300 }, dur).erro);
  assert.ok(recorteDasOpcoes({ inicio: 210, duracao: 5 }, dur).erro);
  assert.ok(recorteDasOpcoes({ inicio: 5 }, undefined).erro);
});
