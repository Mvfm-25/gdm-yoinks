# gdm-yoinks — especificação

Wrapper próprio do [yt-dlp](https://github.com/yt-dlp/yt-dlp) que baixa mídia do **X/Twitter** e
do **YouTube** em um de dois formatos:

- **WEBM** (VP9 + Opus), até 720p, com o menor tamanho de arquivo possível;
- **WEBM AV1** (AV1 + Opus), mesmas regras, arquivo ainda menor e re-encode mais lento (§4.1);
- **GIF** de verdade, convertido do vídeo com paleta otimizada.

Status: protótipo em `gdm-yoinks.mjs` (só X/Twitter por enquanto; ver §10). Enquanto o wrapper
não estiver completo, `patch-yoinks.mjs` adiciona o formato WEBM ao `yoinks` como primeira
opção do menu.

---

## 1. Objetivo

| Requisito | WEBM | GIF |
|---|---|---|
| Container | `.webm` (sempre) | `.gif` (sempre) |
| Vídeo | VP9 | GIF (256 cores por quadro, paleta própria do vídeo) |
| Áudio | Opus | nenhum (GIF não tem áudio) |
| Resolução | a maior disponível **≤ 720p** (lado menor do quadro) | largura **≤ 480 px** (configurável) |
| Quadros por segundo | os da fonte | **≤ 15 fps** (configurável), nunca acima da fonte |
| Desempate | **menor arquivo** (ex.: 720p30 em vez de 720p60, Opus ~50 kbps em vez de ~130 kbps) | — |
| Re-encode | só quando a fonte não tem VP9/Opus (X, Instagram, Threads…) | sempre (conversão de vídeo → GIF) |
| Loop | — | infinito (`-loop 0`) |

Fora do escopo: playlists, legendas, MP3/áudio, outras resoluções, recorte de trecho
(ver §9).

## 2. URLs aceitas

A URL é validada **antes** de chamar o yt-dlp. URL fora destes padrões → código de saída `2`.

### 2.1. X / Twitter

| Forma | Exemplo |
|---|---|
| post | `https://x.com/<usuario>/status/<id>` |
| domínio antigo | `https://twitter.com/<usuario>/status/<id>` |
| subdomínios | `www.`, `mobile.` |
| sufixos de mídia | `…/status/<id>/video/1`, `…/status/<id>/photo/1` |
| sem usuário | `https://x.com/i/web/status/<id>`, `https://x.com/i/status/<id>` |

Parâmetros de consulta (`?s=20`, `?t=…`) são ignorados.

**Post com várias mídias:** o yt-dlp devolve uma playlist. O wrapper usa **a primeira mídia**
e avisa no cartão de informações (`post tem N mídias; usando a primeira`). Se o post tiver
`…/video/N` na URL, usa a N-ésima.

**Post sem vídeo/GIF** (só texto ou foto): o yt-dlp responde `No video could be found in this
tweet`. O wrapper repassa a mensagem e sai com código `1`.

### 2.2. YouTube

| Forma | Exemplo |
|---|---|
| vídeo | `https://www.youtube.com/watch?v=<id>` |
| link curto | `https://youtu.be/<id>` |
| Shorts | `https://www.youtube.com/shorts/<id>` |
| móvel | `https://m.youtube.com/watch?v=<id>` |
| incorporado | `https://www.youtube.com/embed/<id>` |
| ao vivo (gravado) | `https://www.youtube.com/live/<id>` |

**`watch?v=<id>&list=<lista>`:** baixa **só o vídeo** (`--no-playlist`). URLs só de playlist
(`/playlist?list=…`) e de canal são recusadas com código `2`.

**Parâmetro de tempo** (`&t=90s`): ignorado; o vídeo é baixado inteiro.

Transmissões ao vivo **em andamento** são recusadas (`is_live` no JSON do yt-dlp), código `1`.

## 3. Interface de linha de comando

```
gdm-extractor <url> [opções]
gdm-extractor                 # sem url: abre o campo de URL (§3.1)
```

O comando `gdm-extractor` vem do `bin` do `package.json`. Para instalar a partir da pasta do
projeto, rode `npm link`, que cria um link global. Como é um link, editar o
`gdm-yoinks.mjs` já vale para o comando, sem reinstalar. Para remover:
`npm unlink -g gdm-extractor`.

| Opção | Padrão | Descrição |
|---|---|---|
| `-o, --out <pasta>` | `~/Downloads` | pasta de destino |
| `--formato webm\|av1\|gif` | — | pula o menu (obrigatório sem terminal interativo); `av1` = WEBM AV1 |
| `--max-height <n>` | `720` | teto de resolução do WEBM |
| `--crf <n>` | `36` | qualidade do re-encode WEBM (maior = menor/pior; faixa útil 30–42) |
| `--audio-kbps <n>` | `64` | bitrate do Opus no re-encode |
| `--no-recode` | — | WEBM: falha em vez de re-encodar quando não há VP9 nativo |
| `--gif-fps <n>` | `15` | teto de quadros por segundo do GIF |
| `--gif-largura <n>` | `480` | largura máxima do GIF em px |
| `--dry-run` | — | mostra o formato escolhido e o tamanho estimado, sem baixar |
| `-h, --help` / `-v, --version` | — | ajuda / versão |

### 3.1. Fluxo interativo

0. **Campo de URL** (só sem argumento, no estilo do yoinks):

   ```
   Cole a URL do post:
   › █https://x.com/usuario/status/…
     link na área de transferência — tab para colar
   ```

   - A área de transferência é lida em paralelo ao cabeçalho (`Get-Clipboard` no Windows).
     Se tiver um link válido do X, a dica oferece **Tab** para colá-lo.
   - **Colar** um link válido com o campo vazio envia direto, sem precisar de Enter.
   - **Enter** envia; URL inválida mostra o aviso em `--perigo` e o campo continua aberto.
   - **Backspace** apaga, **Ctrl+U** limpa, **Esc**/**Ctrl+C** sai (código `0`).
   - Ao enviar, o campo vira `✔ <url>` e a dica some.

1. **Análise:** `yt-dlp -J` na URL (com spinner).
2. **Cartão de informações:** título, site, tipo da mídia (vídeo ou GIF do X), dimensões,
   fps, duração e tamanho da fonte.
3. **Menu**, com a primeira opção já selecionada:

   ```
   › 1 WEBM · vp9 720p · tamanho mínimo   re-encode do MP4 · menor arquivo, mantém qualidade
     2 WEBM · av1 720p · menor ainda      re-encode → AV1/Opus · mais lento
     3 GIF · 480px · 10 fps               paleta otimizada em 2 passadas · loop infinito · arquivo maior
     4 Cancelar
     ↑↓ mover · enter escolher · esc sair
   ```

   Teclas: `↑`/`↓` ou `k`/`j`, `1`–`4`, `Enter`, `Esc`/`q`/`Ctrl+C`.
   Os rótulos mostram os valores **efetivos** (ex.: `10 fps` se a fonte tem 10 fps, mesmo com
   teto 15).
4. **Progresso:** barra de download (`baixando`), spinner no re-encode WEBM, barra de
   conversão no GIF (`convertendo`, via `ffmpeg -progress`).
5. **Fim:** tamanho do arquivo gerado, comparado ao da fonte, e o caminho absoluto.

Saída sem terminal (pipe, CI): sem cores, sem animações e sem menu, o que exige
`--formato`. Com `NO_COLOR` definido, sem cores.

### 3.2. Códigos de saída

| Código | Quando |
|---|---|
| `0` | sucesso, ou cancelado pelo usuário no menu |
| `1` | erro do yt-dlp/ffmpeg (post sem vídeo, conta suspensa, rede, conversão) |
| `2` | argumentos inválidos ou URL fora dos padrões do §2 |

### 3.3. Nome do arquivo

| Site | Modelo | Exemplo |
|---|---|---|
| X/Twitter | `%(uploader_id)s_%(id)s.<ext>` | `Deadlock_Game_2117966491932930048.gif` |
| YouTube | `%(title).60s [%(id)s].<ext>` | `Meu vídeo [SnswGrb3e3s].webm` |

No X o "título" é o texto do post (longo, cheio de emoji e hashtags), por isso o nome usa o
usuário e o id da mídia. Atenção: o `id` da mídia **não é** o id do post (no exemplo, post
`2117991507332395252` → mídia `2117966491932930048`).

## 4. Formato WEBM

Chamada ao yt-dlp (validada em 2026-11-03 com yt-dlp 2026.08.19):

```
yt-dlp <url>
  -f "bv*+ba/b"
  -S "res:720,vcodec:vp9,acodec:opus,+size"
  --merge-output-format "webm/mkv"
  --recode-video webm
  --postprocessor-args "VideoConvertor:-vf \"scale=w='if(lte(iw,ih),min(iw,720),-2)':h='if(gt(iw,ih),min(ih,720),-2)'\" -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 -c:a libopus -b:a 64k"
  --no-playlist
  -o "<nome do §3.3>"
  --ffmpeg-location <ffmpeg>
```

Como funciona:

- `-S` define a ordem de preferência, campo por campo:
  1. `res:720`: a maior resolução que não passe de 720.
  2. `vcodec:vp9`: entre elas, VP9 (AV1 fica atrás, porque é "melhor" que o teto vp9).
  3. `acodec:opus`: áudio Opus.
  4. `+size`: entre os empatados, o **menor** arquivo.
- `-f "bv*+ba/b"`: melhor vídeo + melhor áudio segundo essa ordem; se o site só tem arquivo
  único (caso dos GIFs do X, que nem têm áudio), usa ele.
- `--merge-output-format "webm/mkv"`: junta em webm quando os codecs permitem; se não
  (H.264/AAC), junta em mkv para não falhar.
- `--recode-video webm`: não faz nada se o arquivo já é webm; senão converte o mkv/mp4 para
  VP9/Opus com os parâmetros de `--postprocessor-args`.

Parâmetros do re-encode:

| Parâmetro | Motivo |
|---|---|
| `scale=…` | **reduz para 720 no lado menor só quando a fonte passa disso.** O `-S res:720` apenas escolhe entre os formatos oferecidos; se o site tem um formato só (GIF do X a 800×800), nada mais limitaria a resolução. `-2` mantém a proporção com dimensão par |
| `-crf 36 -b:v 0` | qualidade constante (modo "Q"), sem teto de bitrate; bom equilíbrio tamanho/qualidade em 720p |
| `-row-mt 1` | usa vários núcleos |
| `-deadline good -cpu-used 4` | velocidade razoável; `-cpu-used` mais baixo (0–2) gera arquivo um pouco menor, mas é bem mais lento |
| `-c:a libopus -b:a 64k` | Opus a 64 kbps é transparente para fala e aceitável para música. Sem faixa de áudio na fonte (GIF do X), o parâmetro é ignorado e o webm sai só com vídeo |

O `scale` só roda no re-encode. Um VP9 nativo do YouTube não é tocado, e já vem ≤ 720 pelo `-S`.

### 4.1. WEBM AV1

Mesma chamada do §4, com estas diferenças:

- `-S "res:720,vcodec:av01,acodec:opus,+size"`: prefere AV1 na resolução escolhida.
- Re-encode com `-c:v libaom-av1 -crf 38 -b:v 0 -row-mt 1 -tiles 2x2 -cpu-used 6` (CRF do AV1
  vai de 0 a 63; 38 fica perto do VP9 a 36 em qualidade, com arquivo menor).
- Sem AV1 nativo, `--merge-output-format mkv` em vez de `webm/mkv`: senão um VP9+Opus do
  YouTube já sairia webm e o `--recode-video webm` seria pulado, entregando VP9.
- Há AV1 nativo só quando existe um `av01` **na mesma resolução** que a seleção do VP9 pegou
  (o `-S` decide a resolução antes do codec).
- Nome do arquivo ganha o sufixo `_av1`, para não colidir com o WEBM VP9 do mesmo post.

Medição (2026-11-04), GIF do X do §7: VP9 217.5 KB, AV1 158.4 KB, ambos 720×720.

## 5. Formato GIF

### 5.1. Como o X guarda GIFs

O X **não guarda o GIF original**. No upload ele converte o arquivo para **MP4 H.264 sem
áudio**, e é só isso que existe para baixar:

- endereço: `https://video.twimg.com/tweet_video/<chave>.mp4`. Vídeos comuns usam outros
  caminhos (`ext_tw_video`, `amplify_video`);
- na API, a mídia é `type: "animated_gif"` com **uma única** variante MP4;
- o loop é feito pelo player do site, porque o MP4 não tem flag de loop.

No JSON do yt-dlp isso aparece como **um formato só**, `format_id: "http"`, `ext: mp4`, **sem**
`vcodec`, `acodec`, `width`, `height`, `fps`, `duration` nem `filesize` (observado em
2026-11-04 com `https://x.com/Deadlock_Game/status/2117991507332395252`).

### 5.2. Detecção e informações da fonte

- **É GIF do X** quando algum formato tem URL contendo `/tweet_video/`.
- Como o yt-dlp não informa as propriedades, o wrapper roda `ffprobe` direto na URL do
  formato:

  ```
  ffprobe -v error -select_streams v:0
    -show_entries stream=width,height,avg_frame_rate:format=duration,size
    -of json <url do formato>
  ```

  Valores do yt-dlp, quando existem, têm prioridade sobre os do ffprobe.

A opção GIF fica disponível para **qualquer** fonte (GIF do X, vídeo do X, YouTube). Para
GIFs do X ela é a opção natural. Para vídeos, ver o aviso de duração no §5.4.

### 5.3. Conversão

1. **Download** só do vídeo, para uma pasta temporária (`os.tmpdir()/gdm-yoinks-XXXX`, apagada
   ao final, inclusive em caso de erro):

   ```
   yt-dlp <url> -f "bv*/b" -S "res:720,+size" --no-playlist -o "<tmp>/fonte.%(ext)s"
   ```

   No YouTube isso baixa só a trilha de vídeo (sem áudio, que o GIF descartaria), o que
   economiza banda.

2. **Conversão em duas passadas** num único comando ffmpeg:

   ```
   ffmpeg -y -i <fonte> -loop 0 -vf "
     fps=<min(fps da fonte, --gif-fps)>,
     scale='min(<--gif-largura>,iw)':-1:flags=lanczos,
     split[a][b];
     [a]palettegen=stats_mode=diff[p];
     [b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle
   " <destino>.gif
   ```

| Parâmetro | Motivo |
|---|---|
| `fps=` | GIF pesa por quadro; nunca sobe acima da fonte (um GIF de 10 fps continua com 10) |
| `scale='min(L,iw)':-1` | só reduz, nunca amplia |
| `flags=lanczos` | redução nítida |
| `palettegen` / `paletteuse` | sem paleta própria, o ffmpeg usa uma genérica e o GIF sai granulado |
| `stats_mode=diff` | a paleta prioriza as cores do que se **mexe** |
| `dither=bayer:bayer_scale=5` | pontilhado regular, que comprime melhor que o difuso (`sierra2_4a`) |
| `diff_mode=rectangle` | redesenha só a área que mudou entre quadros, o que dá um GIF menor |

### 5.4. Tamanho esperado e aviso de duração

Um GIF é **sempre bem maior** que o MP4/WEBM de onde veio. Medição com o tweet do §5.1
(fonte 800×800, 10 fps, 6 s, 399.6 KB):

| Saída | Dimensões | Tamanho |
|---|---|---|
| WEBM | 720×720 | 217.5 KB |
| GIF | 480×480, 10 fps | 2.9 MB |

O menu mostra uma **estimativa** do GIF: `largura × altura × fps × duração × 0,22 B`. O
fator é o custo médio por pixel por quadro com a paleta do §5.3, e foi medido em dois casos
bem diferentes, que deram quase o mesmo valor:

| Fonte | GIF | Real | Fator | Estimativa |
|---|---|---|---|---|
| GIF do X, 6 s | 480×480, 10 fps | 2.9 MB | 0,218 | 3.0 MB |
| vídeo do X, 42 s | 480×271, 15 fps | 16.8 MB | 0,216 | 17.1 MB |

O fator varia com o conteúdo: cenas paradas comprimem mais, ruído e cortes rápidos menos.

Quando a fonte tiver **mais de 15 s**, a linha da opção GIF fica em `--perigo`:
`vídeo longo (42 s) · GIF de ~17.1 MB`. A opção continua disponível, e com `--formato gif`
não há confirmação.

### 5.5. Tamanho da fonte no cartão

A análise roda `yt-dlp -J` **com a mesma seleção do WEBM** (`-f`/`-S` do §4). Assim,
`requested_formats` diz exatamente o que seria baixado (ex.: vídeo `hls-764` + áudio
separado), e o tamanho da fonte é a soma de cada parte: `filesize`, senão `filesize_approx`,
senão `tbr × duração`. O ffprobe completa dimensões e fps. O **tamanho** medido por ele só é
usado nos GIFs do X, porque em vídeos HLS a URL é uma playlist `.m3u8` e o ffprobe
devolveria o tamanho da playlist (1.6 KB, no teste).

Quando vídeo e áudio chegam separados, a barra mostra `baixando 1/2` e `baixando 2/2`.

## 6. Dependências

- **yt-dlp**: usar o do PATH; se não houver, o que o yoinks mantém em
  `~/.yoinks/bin/yt-dlp.exe`; se também não houver, baixar de
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe` para
  `~/.gdm-yoinks/bin/`.
- **ffmpeg** com `libvpx-vp9`, `libaom-av1`, `libopus` e o codificador `gif`, e **ffprobe**: usar os do
  PATH ou o pacote npm `ffmpeg-static` (conferir com `ffmpeg -encoders`). O ffprobe é
  obrigatório para as informações dos GIFs do X (§5.2).
- **Node ≥ 18**, sem dependências npm. As cores usam ANSI truecolor, e o menu usa
  `readline` em raw mode.

### 6.1. Cores

Paleta do sistemaGDM, tema «Fósforo» (`sistemaGDM/docs/paleta.md`):

| Uso no terminal | Token | Hex |
|---|---|---|
| selo `gdm-yoinks`, item selecionado, barra cheia, `✔` | `--acento` (`--p4`) | `#96E072` |
| texto sobre o selo | `--sobre-acento` | `#0e1020` |
| item selecionado, tamanho final, porcentagem | `--pico` | `#FFFFFF` |
| texto corrente | `--texto` | `#e4e6e4` |
| rótulos, detalhes, dicas | `--fraco` | `#8a9690` |
| moldura do cartão, barra vazia | `--borda` | `#2c3330` |
| erros (`✖`) | `--perigo` | `#d2564f` |

| letras do logo, de cima para baixo | `--p5` → `--p4` → `--p3` → `--p2` | `#E8FCCF` … `#3E8914` |
| trama de pontos do logo | `--borda` | `#2c3330` |
| letreiro: bits `1` / bits `0` / costura `★` | `--acento` / `--fraco` / `--p4` | |
| letreiro: fundo da faixa | `--superficie-2` | `#212623` |

O fundo do terminal não é pintado, exceto a faixa do letreiro.

### 6.2. Cabeçalho: logo e letreiro

- **Logo:** lido de `logo.md`, ao lado do script. As linhas de `.` e `%` são o desenho, e a
  linha de `0`/`1` é «G.D.M. Extractor» em binário. Sem o arquivo, o binário é gerado do texto
  e o cabeçalho usa o selo simples.
- **Letreiro:** a linha em binário rola para a esquerda, como a barra «novo no acervo» do
  catálogo do sistemaGDM (`base.html`/`estilo.css`): uma fita contínua que emenda a volta
  sozinha, com `★` como costura entre uma volta e a próxima. Um caractere a cada 70 ms.
- O letreiro **continua andando** durante a análise, o menu e o download. Cada quadro sobe até
  a linha dele (salva/restaura o cursor), contando as linhas impressas depois. Ele para no
  fim, num erro, no Ctrl+C, ou antes, se já tiver rolado para fora da tela.
- Terminal mais estreito que o logo (129 colunas + margem): só o selo, com o letreiro na
  largura disponível. Sem terminal ou com `NO_COLOR`: o binário aparece parado.

## 7. Comportamento esperado por site

| Site | Fonte típica | WEBM | GIF |
|---|---|---|---|
| YouTube | VP9 + Opus nativos (ex.: formato 247 + 249) | sem re-encode, sem perda; rápido (só download) | baixa só o vídeo e converte |
| X: GIF | MP4 H.264 sem áudio, formato único (`tweet_video`) | re-encode, reduzido a 720 se maior; webm sem áudio | converte direto; é o caso de uso principal |
| X: vídeo | H.264 + AAC, várias resoluções | re-encode para VP9/Opus; lento (proporcional à duração) | converte; aviso se > 15 s |
| Instagram / Threads / TikTok | H.264 + AAC | re-encode (quando suportados no §2) | idem |

Testes feitos:

- Short do YouTube `SnswGrb3e3s` → WEBM `247+249-drc` (vp9 720p + opus), 256 KB, sem
  re-encode.
- GIF do X `Deadlock_Game/status/2117991507332395252` → WEBM vp9 720×720, 217.5 KB; GIF
  480×480 10 fps, 2.9 MB (2026-11-04).
- Vídeo do X `drogbagfbpa/status/2117748505997631955` (H.264 956×540 25 fps + AAC 128k, 42 s,
  HLS `amplify_video`, fonte de 3.8 MB) → WEBM vp9 956×540 + opus, **4.9 MB, maior que a
  fonte** (ver §9); GIF 480×271 15 fps, 16.8 MB (2026-11-04).
- Re-encode WEBM num clipe H.264 720p sintético: saída VP9/Opus válida.

## 8. Erros

| Situação | Mensagem | Código |
|---|---|---|
| URL fora do §2 | `A URL não parece um post do X/Twitter nem um vídeo do YouTube.` | 2 |
| playlist/canal do YouTube | `Playlists e canais não são suportados; use o link de um vídeo.` | 2 |
| post sem vídeo/GIF | mensagem do yt-dlp (`No video could be found in this tweet`) | 1 |
| conta suspensa, post apagado, privado | mensagem do yt-dlp | 1 |
| ao vivo em andamento | `Transmissão ao vivo em andamento: tente depois que ela terminar.` | 1 |
| ffmpeg falhou | `ffmpeg falhou: <última linha do erro>` | 1 |
| sem terminal e sem `--formato` | `Sem terminal interativo: use --formato webm\|av1\|gif.` | 2 |

Mensagens do yt-dlp perdem o prefixo `ERROR: [extrator] `.

## 9. Pontos em aberto

- **Recorte para GIF** (`--inicio`, `--duracao`): converter só um trecho de vídeos longos do
  YouTube. Hoje está fora do escopo; o aviso do §5.4 é a mitigação.
- **Áudio `-drc`**: o YouTube às vezes oferece uma variante do Opus com compressão de faixa
  dinâmica, de mesmo tamanho. Para evitar, adicionar `-f "bv*+ba[format_id!*=drc]/bv*+ba/b"`.
- **Um vídeo H.264 pode ficar maior após o re-encode** se a fonte já for muito comprimida.
  **Confirmado** com o vídeo do X do §7 (fonte de 3.8 MB, 634 kbps de vídeo):

  | CRF | WEBM | vs. fonte |
  |---|---|---|
  | 36 (padrão) | 4.9 MB | +27% |
  | 40 | 3.8 MB | −1% |
  | 44 | 3.0 MB | −22% |

  Opções: (a) subir o CRF padrão para fontes H.264 (40–44); (b) comparar os tamanhos e
  manter o menor (o que quebraria a regra "sempre webm"); (c) limitar o bitrate do VP9 ao da
  fonte. Falta decidir.
- **Re-encode também no YouTube**: um CRF alto (40+) reduziria ainda mais os arquivos do
  YouTube, com perda de qualidade e muito mais tempo. Hoje não fazemos isso.
- **Estimativa de tamanho do GIF**: o fator fixo do §5.4 acertou nos dois testes, mas vem de
  só duas amostras. Se errar muito em outros vídeos, converter alguns quadros de amostra.
- **Posts do X que exigem login** (conteúdo sensível): o yt-dlp precisa de
  `--cookies-from-browser`. Ainda não há opção para isso.

## 10. Estado do protótipo (`gdm-yoinks.mjs`)

```
gdm-extractor [url do X] [-o pasta] [--formato webm|av1|gif]
```

| Item | Estado |
|---|---|
| URLs do X/Twitter (§2.1) | feito, menos `i/web/status/<id>` (recusada) e `…/video/N` (aceita, mas sempre usa a 1ª mídia) |
| URLs do YouTube (§2.2) | **falta**: a validação recusa |
| Menu, cartão, cores, progresso (§3.1, §6.1) | feito |
| WEBM (§4), inclusive o `scale` | feito e testado |
| GIF (§5), com estimativa e aviso de duração (§5.4) | feito e testado |
| tamanho da fonte e download em partes (§5.5) | feito e testado |
| comando `gdm-extractor`, campo de URL com área de transferência (§3, §3.1) | feito |
| `--max-height`, `--crf`, `--audio-kbps`, `--no-recode`, `--dry-run` | **falta** |
| Nome de arquivo do YouTube (§3.3) | **falta** (hoje sempre `usuario_id`) |
| Mensagens de erro (§8) | parcial: X e argumentos |

## 11. Relação com o patch no yoinks

`patch-yoinks.mjs` aplica os argumentos WEBM do §4 ao yoinks instalado
(`npm root -g`/yoinks/dist/cli.js), como primeira opção do menu ("720p · webm vp9 · ~X MB").
Ele é idempotente e guarda o original em `cli.js.orig`. O patch **não** inclui o `scale` do
§4 nem o formato GIF.

```
node C:\GDM-05\prog\pessoal\gdm-yoinks\patch-yoinks.mjs          # aplicar / reaplicar após npm update
node C:\GDM-05\prog\pessoal\gdm-yoinks\patch-yoinks.mjs --undo   # voltar ao original
```

Se o yoinks mudar a ponto de o patch não encaixar, o script avisa e não altera nada. Nesse
caso, usar o `gdm-yoinks`.
