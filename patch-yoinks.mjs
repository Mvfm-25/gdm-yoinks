#!/usr/bin/env node
// Aplica o patch "webm vp9 720p, menor arquivo" no yoinks instalado globalmente.
// Uso: node patch-yoinks.mjs          (aplica; seguro rodar várias vezes)
//      node patch-yoinks.mjs --undo   (restaura o cli.js original)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MARKER = "/* gdm-yoinks patch v1 */";
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const cli = path.join(root, "yoinks", "dist", "cli.js");
const backup = `${cli}.orig`;

if (!fs.existsSync(cli)) {
  console.error(`yoinks não encontrado em ${cli}. Instale com: npm i -g yoinks`);
  process.exit(1);
}

if (process.argv.includes("--undo")) {
  if (!fs.existsSync(backup)) {
    console.error("Não há backup (cli.js.orig) para restaurar.");
    process.exit(1);
  }
  fs.copyFileSync(backup, cli);
  console.log("cli.js original restaurado.");
  process.exit(0);
}

let src = fs.readFileSync(cli, "utf8");
if (src.includes(MARKER)) {
  console.log("Patch já aplicado. Nada a fazer.");
  process.exit(0);
}

// Opção do menu: primeira da lista, então fica selecionada por padrão.
const WEBM_CHOICE = `${MARKER}
  {
    const bySize = (a, b) => (a.filesize ?? a.filesize_approx ?? Infinity) - (b.filesize ?? b.filesize_approx ?? Infinity);
    const isVp9 = (f) => /^vp0?9/.test(f.vcodec ?? "");
    const upTo720 = videos.filter((f) => f.height <= 720);
    const topHeight = Math.max(0, ...upTo720.map((f) => f.height));
    const vp9 = upTo720.filter((f) => isVp9(f) && f.height === topHeight).sort(bySize)[0];
    const opus = audioOnly.filter((f) => f.acodec === "opus").sort(bySize)[0];
    const vSize = vp9 ? vp9.filesize ?? vp9.filesize_approx ?? 0 : 0;
    const aSize = vp9 && !(vp9.acodec && vp9.acodec !== "none") ? opus?.filesize ?? opus?.filesize_approx ?? 0 : 0;
    const size = vSize > 0 ? vSize + aSize : 0;
    choices.push({
      kind: "video",
      label: \`\${topHeight || 720}p \\xB7 webm vp9\${vp9 ? "" : " (recode)"}\${size > 0 ? \` \\xB7 ~\${formatBytes(size)}\` : ""}\`,
      args: [
        "-f", "bv*+ba/b",
        "-S", "res:720,vcodec:vp9,acodec:opus,+size",
        "--merge-output-format", "webm/mkv",
        "--recode-video", "webm",
        "--postprocessor-args",
        "VideoConvertor:-c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 -c:a libopus -b:a 64k"
      ]
    });
  }
`;

const patches = [
  {
    name: "opção webm no menu",
    find: "  for (const height of heights.slice(0, MAX_VIDEO_CHOICES)) {",
    replace: (m) => WEBM_CHOICE + m,
  },
  {
    name: "detectar fase de recode",
    find: `line.includes("[Merger]") || line.includes("[ExtractAudio]")`,
    replace: () => `line.includes("[Merger]") || line.includes("[ExtractAudio]") || line.includes("[VideoConvertor]")`,
  },
];

for (const p of patches) {
  const count = src.split(p.find).length - 1;
  if (count !== 1) {
    console.error(`Falha no patch "${p.name}": trecho encontrado ${count} vezes (esperado 1).`);
    console.error("O yoinks provavelmente mudou de versão; o patch precisa ser revisto.");
    process.exit(1);
  }
  src = src.replace(p.find, p.replace(p.find));
}

if (!fs.existsSync(backup)) fs.copyFileSync(cli, backup);
fs.writeFileSync(cli, src);
console.log(`Patch aplicado em ${cli}`);
