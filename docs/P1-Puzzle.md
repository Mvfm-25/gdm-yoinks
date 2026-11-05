# P1 — WEBM AV1 maior que a fonte («puzzle»)

Relatório de problema do `gdm-extractor`, opção **WEBM AV1** (§4.1 da `ESPECIFICACAO.md`).
Data: 2026-11-05. Ambiente: Windows 11, yt-dlp 2026.08.19, ffmpeg essentials 2025-08-20
(gyan.dev, com `libaom-av1` e sem `libsvtav1`), Node ≥ 18.

Vídeo: `https://www.youtube.com/watch?v=2NZBD0DyoK8` («puzzle», 51 s).

---

## 1. O que ocorreu

Ao extrair o vídeo como WEBM AV1, o cartão mostrou uma fonte de **11.0 MB**, e o arquivo
gerado (`puzzle [2NZBD0DyoK8]_av1.webm`) saiu com **12.7 MB**, ou seja, **15% maior que a
fonte**. A opção do menu promete o contrário: `WEBM · av1 720p · menor ainda`.

O relato inicial citava o vídeo `uKxfjtKxhnQ`, mas o arquivo de 12.7 MB encontrado em
`~/Downloads` é do `2NZBD0DyoK8`. O `uKxfjtKxhnQ` tem AV1 nativo no YouTube e sai com 5.3 MB, sem
re-encode.

Arquivo inspecionado com `ffprobe`:

| Campo | Valor |
|---|---|
| Tamanho | 13 294 409 B (12.7 MB) |
| Vídeo | AV1, 1280×720 |
| Áudio | Opus |
| Bitrate total | 2070 kbps (vídeo ≈ 2006 kbps + Opus 64 kbps) |
| Criado em | 2026-11-05 10:25:31 |

## 2. Como isso ocorreu

### 2.1. A fonte é só H.264

O YouTube oferece esse vídeo em 720p **apenas em H.264** (formatos `136`, DASH, e `232`, HLS).
Não há VP9 nem AV1, que costumam faltar em vídeos novos ou com poucas visualizações. O yt-dlp
escolhe `136+251`:

| Trilha | Formato | Codec | Bitrate |
|---|---|---|---|
| vídeo | 136 | H.264 Main, 1280×720, 25 fps | 1674 kbps (medido nos pacotes) |
| áudio | 251 | Opus | 126 kbps |

Sem AV1 nativo, o programa precisa **re-encodar** o H.264 com o `libaom-av1`.

### 2.2. CRF fixa a qualidade, não o tamanho

O re-encode usava `-crf 38 -b:v 0`, ou seja, **qualidade constante**. O CRF diz ao encoder qual
qualidade manter, e ele gasta os bits que precisar para isso. O tamanho não é relativo à fonte.
O CRF 38 foi calibrado com os dois vídeos de teste do §7, que são leves (um GIF do X e um vídeo
do X com bitrate baixo). Neles, o AV1 sai bem menor que a fonte.

O Puzzle é diferente: tem bitrate alto e que varia muito ao longo do vídeo, sinal de cenas
difíceis de comprimir.

| Trecho | 0–5 s | 5–10 | 10–15 | 15–20 | 20–25 | 25–30 | 30–35 | 35–40 | 40–45 | 45–50 |
|---|---|---|---|---|---|---|---|---|---|---|
| kbps da fonte | 953 | 1411 | 1046 | 2215 | 2284 | 2409 | 2014 | 1567 | 1523 | 1402 |

Além disso, a fonte já tem perdas. O encoder não sabe o que é imagem e o que é artefato do
H.264 (blocos, ruído, mosquito), e gasta bits reproduzindo os dois. Para chegar à qualidade do
CRF 38 nesse vídeo, o libaom precisou de **2006 kbps**, 20% acima dos 1674 da fonte.

### 2.3. Por que o teto de bitrate não entrou

Na versão em que o arquivo foi gerado, o AV1 ainda não comparava o resultado com a fonte. O
`gdm-extractor` é um `npm link` para a pasta do projeto e lê o script do disco ao iniciar. A
checagem "refazer com teto se passar da fonte" entrou por volta das 10:24, e o arquivo é das
10:25:31. O tamanho bate exatamente com uma passada a CRF 38 sem teto, o que confirma que a
execução usou uma versão anterior.

Com a checagem, o mesmo link dava:

```
✔ fonte com 1674 kbps de vídeo; teto só se passar disso
✔ 2021 kbps passou da fonte; refazendo com teto de 1674
✔ 10.9 MB (fonte 11.0 MB)
```

## 3. Por que isso é ruim

1. **Quebra a promessa da opção.** O AV1 existe para gerar o menor arquivo. Sair maior que a
   fonte, e maior que o próprio VP9 (9.2 MB nesse vídeo), torna a opção pior que as outras
   duas e pior que simplesmente baixar o MP4.
2. **Não há ganho de qualidade que compense.** Re-encodar uma fonte com perdas nunca melhora
   a imagem em relação a ela. Os bits a mais só reproduzem com mais fidelidade os artefatos
   do H.264.
3. **O teto antigo resolvia o tamanho, mas não a economia.** Com o teto igual à fonte, o arquivo
   ficava do mesmo tamanho dela (10.9 contra 11.0 MB). O usuário espera minutos pelo AV1 e
   recebe praticamente o mesmo arquivo.
4. **Custava o dobro do tempo.** O libaom roda a ~0.5× nesse vídeo, e o teto antigo só era
   aplicado depois de uma passada completa. Foram duas codificações inteiras: **3 min 35 s**
   para 51 s de vídeo.
5. **Falha silenciosa.** Nada avisava que o arquivo saiu maior. O usuário só percebe se
   comparar os números do «pronto».

## 4. Ideias para resolver

Cada ideia foi testada no próprio Puzzle, com o ffmpeg direto. O SSIM compara cada resultado
com a fonte (1 = idêntico).

| # | Ideia | Resultado no Puzzle | Avaliação |
|---|---|---|---|
| a | Teto via `-crf 38 -b:v <alvo>` («constrained quality», o que funciona no VP9) | alvo 1172 → **1493 kbps** (+28%), 10.0 MB, SSIM 0.9694 | o libaom trata o `-b:v` como alvo aproximado e passa dele. Num vídeo leve, faz o contrário: o arquivo **cresce** (GIF do X: 162 → 198 KB) |
| b | Igual a (a), com `-undershoot-pct 0 -overshoot-pct 0` | **1623 kbps** (+38%), 10.8 MB, SSIM 0.9726 | pior que (a) |
| c | VBR puro, `-b:v 1172k` sem CRF | **1753 kbps** (+50%), 11.7 MB, SSIM 0.9707 | o rate control de uma passada do libaom erra muito |
| d | VBR em duas passadas | — (não testado) | acerta o alvo, mas são sempre duas codificações completas, o mesmo custo do problema 4 |
| e | Só subir o CRF fixo (ex.: 44) | **1443 kbps**, 9.7 MB, SSIM **0.9719** | melhor qualidade por bit que (a)–(c), mas um CRF fixo não se adapta: nos vídeos leves desperdiça qualidade, nos pesados ainda pode passar |
| f | Prever o bitrate com **uma amostra** de 5 s | 1356 a 3877 kbps conforme a posição (real: 2006) | instável demais: a fonte varia 2.5× ao longo do vídeo |
| g | **Várias amostras, comparadas com os mesmos trechos da fonte**, e escolher o CRF por interpolação | previsão de 2255 kbps (real 2006, erro de +12%, para o lado seguro) em ~24 s. CRF escolhido: 50 → **1021 kbps**, 6.97 MB, SSIM 0.961 | **escolhida** |
| h | Alvo de **70% da fonte** em vez de 100% | ver (g) | **escolhida**: o AV1 é bem mais eficiente que o H.264, e re-encodar para o mesmo tamanho não economiza nada |
| i | Usar o SVT-AV1, que tem «capped CRF» de verdade | — (não testado) | depende de um ffmpeg "full". Já implementado (F9), e passa a usar o alvo de 70% |
| j | Manter o MP4 da fonte quando o re-encode não ajudar | — | contraria a regra "sempre webm" do §1. Fica como ideia |

Conclusão dos testes: no libaom, **quem controla bem o tamanho é o CRF**, e não os modos de
bitrate. O CRF 44 em qualidade constante tem arquivo menor **e** qualidade melhor que o modo
com alvo (a). A solução é escolher o CRF certo para cada vídeo, de forma barata.

Comparação final no Puzzle:

| Versão | Tamanho | vs. fonte | SSIM | Tempo de codificação |
|---|---|---|---|---|
| fonte (H.264 + Opus) | 11.0 MB | — | 1 | — |
| AV1 CRF 38, sem teto (o problema) | 12.7 MB | **+15%** | 0.9797 | ~100 s |
| AV1 CRF 38 + refazer com teto = fonte (versão anterior) | 10.9 MB | −1% | 0.9744 | ~200 s (2 passadas) |
| VP9 CRF 36, teto = fonte (opção WEBM) | 9.2 MB | −16% | 0.9540 | — |
| **AV1 com CRF por amostras, alvo 70% (atual)** | **6.6 MB** | **−39%** | **0.9611** | ~40 s de amostras + 77 s |

A versão atual tem **qualidade maior que o VP9** com 72% do tamanho dele.

## 5. Como a solução foi implementada

Arquivo: `gdm-yoinks.mjs`. Especificação atualizada no §4.1 e no §7 da `ESPECIFICACAO.md`.

### 5.1. Configuração dos codificadores (`CODECS_WEBM`, linha ~948)

- Cada sabor ganhou `fatorAlvo`: **1** no VP9 (o teto do F1 continua igual ao da fonte) e
  **0.7** nos dois AV1.
- O libaom ganhou `escolheCrf: true`, e o CRF saiu dos argumentos fixos. Agora é
  `crf: (n) => ["-crf", n, "-b:v", "0"]`, sempre em qualidade constante.
- O SVT-AV1 usa o alvo de 70% no `-maxrate`.
- Constantes (linha ~964): `CRF_AV1 = 38` (padrão), `CRF_AV1_SONDA = 46` (segundo ponto de
  medição), `CRF_AV1_MAX = 50` (limite de qualidade), `AMOSTRA_S = 3` e
  `POSICOES_AMOSTRA = [0.25, 0.5, 0.75]`.

### 5.2. Medição dos pacotes (`pacotesDoVideo`, linha ~1244)

Uma chamada ao `ffprobe -show_entries packet=pts_time,size` devolve todos os pacotes de vídeo
como `[tempo, bytes]`. A partir deles, `somaBytes(pacotes, de, ate)` dá o tamanho de qualquer
trecho. O `kbpsDoVideo` passou a usar a mesma função.

### 5.3. Previsão por amostras (`prevêKbps`, linha ~1271)

1. Codifica 3 trechos de 3 s, centrados em 25, 50 e 75% da duração, com o mesmo `scale` e o
   mesmo encoder do re-encode final, sem áudio (`-ss <início> -t 3 -i fonte … -an`). Vídeos com
   menos de 18 s viram uma amostra só, do vídeo inteiro (é barato e exato).
2. Soma os bytes codificados e os bytes dos **mesmos trechos** na fonte.
3. Previsão = bitrate da fonte × (bytes codificados ÷ bytes da fonte nos trechos).

Comparar com os mesmos trechos é o que torna a previsão estável. Uma amostra isolada mede o
quanto aquele trecho é difícil, enquanto a razão mede o quanto o encoder comprime aquele
conteúdo **em relação à fonte**, o que varia bem menos. A previsão erra para cima, porque cada
amostra começa num quadro-chave. Isso é intencional: o erro leva a um arquivo um pouco menor,
nunca maior.

### 5.4. Escolha do CRF (`crfPorAmostras`, linha ~1293)

1. Prevê o bitrate a CRF 38. Se couber no alvo, usa 38 (vídeos leves, como o GIF do X, não
   mudam: 158.4 KB, como antes).
2. Senão, prevê também a CRF 46 e interpola. O bitrate cai de forma aproximadamente
   exponencial com o CRF, então `log(kbps)` é uma reta:

   ```
   crf = 38 + 8 × ln(alvo / p38) / ln(p46 / p38)
   ```

   O resultado é arredondado para cima e limitado a [38, 50]. No Puzzle: p38 = 2234,
   p46 = 1478, alvo = 1172 → 50.75 → **50** (limite).
3. As etapas aparecem na tela (no modo linha, todas; na tela cheia, a última):

   ```
   ✔ fonte com 1674 kbps de vídeo; alvo de 1172 kbps
   ✔ crf 38: ~2234 kbps previstos, acima do alvo de 1172
   ✔ crf 46: ~1478 kbps · usando crf 50 (limite de qualidade)
   re-encodando ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% AV1 crf 50 0.70x
   ✔ 6.6 MB (fonte 11.0 MB)
   ```

### 5.5. Rede de segurança (`baixaWebm`, linha ~1360)

Depois do re-encode completo, o bitrate de vídeo do arquivo final é medido. Se ainda passar do
bitrate da **fonte** (a promessa mínima de "nunca maior"), o programa refaz uma vez com
CRF + 6 (≈ −30% de bitrate no Puzzle), na barra `refazendo`. Com a previsão errando para cima,
isso deve ser raro. O caminho foi testado forçando a condição (GIF do X refeito a CRF 44,
114.5 KB).

O modo antigo ("codificar inteiro, e só então refazer com teto") foi removido. Era ele que
custava duas passadas completas e não trazia economia.

### 5.6. Testes

| Vídeo | Antes | Depois | Observação |
|---|---|---|---|
| Puzzle `2NZBD0DyoK8` (H.264, 11.0 MB) | 12.7 MB (CRF 38) / 10.9 MB (teto) | **6.6 MB**, CRF 50, SSIM 0.961 | 116 s no total, com download |
| Vídeo do X `drogbagfbpa/…` (H.264, 3.8 MB) | 3.1 MB, SSIM 0.985 | **2.1 MB**, CRF 45, SSIM 0.977 | mesma qualidade do VP9 de 3.5 MB (0.978) |
| GIF do X `Deadlock_Game/…` | 158.4 KB | 158.4 KB, CRF 38 | dentro do alvo, sem mudança |
| Short do YouTube `SnswGrb3e3s` | 163.5 KB | 163.5 KB | AV1 nativo, só movido |
| WEBM VP9 (GIF do X) | 215.7 KB | 215.7 KB | VP9 não mudou |

### 5.7. Limitações

- **CRF 50 é o limite.** Num vídeo ainda mais difícil, o alvo de 70% pode não ser atingido, e o
  arquivo fica entre 70% e 100% da fonte. A rede de segurança garante só os 100%.
- **As amostras custam tempo**: ~20 s por rodada no Puzzle, e duas rodadas quando a fonte é
  pesada. Em vídeos longos esse custo é fixo e pesa pouco. Em vídeos curtos (< 18 s) é uma
  codificação extra do vídeo inteiro, que também é rápida.
- **O alvo de 70% e o CRF 50 vêm de três vídeos.** Valem novas medições com outros conteúdos
  (animação, jogos, vídeos escuros).
- **SVT-AV1 continua sem teste** (o ffmpeg essentials não tem `libsvtav1`).
- O cartão ainda mostra a fonte pelo tamanho informado pelo site, que no HLS do X é o nominal
  (4.5 MB contra 3.8 MB reais). Não tem relação com este problema.
