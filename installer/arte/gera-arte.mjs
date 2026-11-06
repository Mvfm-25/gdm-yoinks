// Gera as imagens do assistente do Inno a partir do logo.md (o «G.D.M.» em
// --p4 e o «EXTRACTOR» em --texto, sobre --fundo). BMP de 24 bits, que o Inno
// aceita em qualquer versão. Uso: node gera-arte.mjs <pasta de saída>
// Saída: assistente-100.bmp (164×314), assistente-200.bmp (328×628),
//        assistente-p-100.bmp (55×55), assistente-p-200.bmp (110×110).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COR = { fundo: "#101119", acento: "#96E072", p2: "#3E8914", texto: "#e4e6e4", fraco: "#8a9690" };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const linhas = fs.readFileSync(path.join(raiz, "logo.md"), "utf8").split(/\r?\n/);
// Só o primeiro bloco de «.»/«%»: o segundo é a versão de 80 colunas do terminal (Win7-Patch.md, seção 2.2).
const eDesenho = (l) => /^[.%]+$/.test(l);
const inicioDesenho = linhas.findIndex(eDesenho);
const fimDesenho = linhas.findIndex((l, i) => i > inicioDesenho && !eDesenho(l));
const desenho = linhas.slice(inicioDesenho, fimDesenho < 0 ? linhas.length : fimDesenho);
const binario = (linhas.find((l) => /^[01 ]+$/.test(l) && /[01]/.test(l)) ?? "").replace(/\s/g, "");

/** Colunas [de, ate) de um pedaço do desenho. «G.D.M.» acaba antes da coluna 29. */
const pedaco = (de, ate) => desenho.map((l) => l.slice(de, ate));
const GDM = pedaco(0, 27), EXTRACTOR = pedaco(29, Infinity), G = pedaco(0, 5);

function imagem(larg, alt) {
  const px = Array.from({ length: alt }, () => Array.from({ length: larg }, () => rgb(COR.fundo)));
  return {
    larg, alt, px,
    ponto(x, y, cor) { if (x >= 0 && y >= 0 && x < larg && y < alt) px[y][x] = rgb(cor); },
    bloco(x, y, l, a, cor) { for (let j = 0; j < a; j++) for (let i = 0; i < l; i++) this.ponto(x + i, y + j, cor); },
    /** Desenha `arte` (linhas de «.»/«%») com `escala` px por célula, centrado em x. */
    arte(arte, y, escala, cor) {
      const w = Math.max(...arte.map((l) => l.length)) * escala;
      const x0 = Math.floor((larg - w) / 2);
      arte.forEach((l, j) => [...l].forEach((c, i) => {
        if (c === "%") this.bloco(x0 + i * escala, y + j * escala, escala, escala, cor);
      }));
      return arte.length * escala;
    },
  };
}

/** BMP de 24 bits, linhas de baixo para cima, cada uma alinhada a 4 bytes. */
function bmp(img) {
  const linha = Math.ceil((img.larg * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + linha * img.alt);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(img.larg, 18);
  buf.writeInt32LE(img.alt, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(linha * img.alt, 34);
  for (let y = 0; y < img.alt; y++) {
    const off = 54 + (img.alt - 1 - y) * linha;
    for (let x = 0; x < img.larg; x++) {
      const [r, g, b] = img.px[y][x];
      buf[off + x * 3] = b; buf[off + x * 3 + 1] = g; buf[off + x * 3 + 2] = r;
    }
  }
  return buf;
}

/** Faixa lateral: o «G.D.M. Extractor» em binário, um bit por quadradinho, como o letreiro. */
function letreiro(img, x, escala, cor) {
  for (let y = 0, i = 0; y < img.alt; y += escala * 2, i++) {
    if (binario[i % binario.length] === "1") img.bloco(x, y, escala, escala, cor);
  }
}

function grande(f) {
  const img = imagem(164 * f, 314 * f);
  letreiro(img, 8 * f, 3 * f, COR.p2);
  letreiro(img, img.larg - 11 * f, 3 * f, COR.p2);
  let y = 110 * f;
  y += img.arte(GDM, y, 5 * f, COR.acento) + 14 * f;
  img.arte(EXTRACTOR, y, 2 * f, COR.texto);
  return img;
}

function pequena(f) {
  const img = imagem(55 * f, 55 * f);
  img.arte(G, Math.floor((55 * f - 7 * 6 * f) / 2), 6 * f, COR.acento);
  return img;
}

const saida = process.argv[2] ?? ".";
fs.mkdirSync(saida, { recursive: true });
for (const f of [1, 2]) {
  fs.writeFileSync(path.join(saida, `assistente-${f}00.bmp`), bmp(grande(f)));
  fs.writeFileSync(path.join(saida, `assistente-p-${f}00.bmp`), bmp(pequena(f)));
}
console.log(`arte gerada em ${saida}`);
