# gdm-yoinks — especificação

Wrapper próprio do [yt-dlp](https://github.com/yt-dlp/yt-dlp) que baixa mídia do **X/Twitter** e
do **YouTube** em um de três formatos:

- **WEBM** (VP9 + Opus), até 720p, com o menor tamanho de arquivo possível;
- **WEBM AV1** (AV1 + Opus), mesmas regras, arquivo ainda menor e re-encode mais lento (§4.1);
- **GIF** de verdade, convertido do vídeo com paleta otimizada.

Status: protótipo em `gdm-yoinks.mjs` (X/Twitter e YouTube; ver §10). Enquanto o wrapper
não estiver completo, `patch-yoinks.mjs` adiciona o formato WEBM ao `yoinks` como primeira
opção do menu.

Nomes: **gdm-yoinks** é o projeto (e o repositório); **gdm-extractor** é o comando instalado
(§3); «G.D.M. Extractor» é o que o logo diz (§6.3).

---

## 1. Objetivo

| Requisito | WEBM | WEBM AV1 (§4.1) | GIF |
|---|---|---|---|
| Container | `.webm` (sempre) | `.webm` (sempre), sufixo `_av1` no nome | `.gif` (sempre) |
| Vídeo | VP9 | AV1 | GIF (256 cores por quadro, paleta própria do vídeo) |
| Áudio | Opus | Opus | nenhum (GIF não tem áudio) |
| Resolução | a maior disponível **≤ 720p** (lado menor do quadro) | igual ao WEBM | largura **≤ 480 px** (configurável) |
| Quadros por segundo | os da fonte | os da fonte | **≤ 15 fps** (configurável), nunca acima da fonte |
| Desempate | **menor arquivo** (ex.: 720p30 em vez de 720p60, Opus ~50 kbps em vez de ~130 kbps) | igual ao WEBM | — |
| Re-encode | só quando a fonte não tem VP9/Opus (caso do X) | só quando não há AV1 nativo na resolução escolhida | sempre (conversão de vídeo → GIF) |
| Loop | — | — | infinito (`-loop 0`) |

Qualquer um dos três formatos pode ser só um **trecho** do vídeo (§3.4).

Fora do escopo: playlists, legendas, MP3/áudio, outras resoluções.

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
(`--playlist-items 1` no download, senão o yt-dlp baixaria todas) e avisa no cartão de
informações (`post tem N mídias; usando a primeira`). Se o post tiver `…/video/N` na URL, o
`--no-playlist` já faz o yt-dlp devolver só a N-ésima, e não há aviso. O N conta todas as
mídias do post, inclusive fotos; apontar para uma foto dá `Media #N is not a video` (código `1`).

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

**Parâmetro de tempo** (`&t=90s`, `?t=1m30s`, `?start=90`, `#t=1:30`): vira o início do
recorte (§3.4). Com `--formato gif`, recorta sozinho um trecho de 10 s a partir dele; na tela
cheia, com menu, só preenche a fase de recorte, e o cartão avisa
(`vídeo inteiro · início do link 1:30 (r para recortar)`). Nos outros casos, o vídeo é
baixado inteiro. No X o `?t=` é um código de compartilhamento e é sempre ignorado.

Transmissões ao vivo **em andamento** são recusadas (`is_live` no JSON do yt-dlp), código `1`.

## 3. Interface de linha de comando

```
gdm-extractor <url> [opções]
gdm-extractor                 # sem url: abre o campo de URL (§3.1)
```

Os padrões de `-o`, `--formato`, `--gif-fps` e `--gif-largura` vêm do `config.json` (`~/.gdm-yoinks/` no Windows, `~/.config/gdm-yoinks/` no Linux) quando ele existe; a linha de comando tem prioridade. O comando `gdm-extractor` vem do `bin` do `package.json`. Para instalar a partir da pasta do
projeto, rode `npm link`, que cria um link global. Como é um link, editar o
`gdm-yoinks.mjs` já vale para o comando, sem reinstalar. Para remover:
`npm unlink -g gdm-extractor`.

| Opção | Padrão | Descrição |
|---|---|---|
| `-o, --out <pasta>` | `~/Downloads` | pasta de destino |
| `--formato webm\|av1\|gif` | — | pula o menu (obrigatório sem terminal interativo); `av1` = WEBM AV1 |
| `--max-height <n>` | `720` | **(planejado)** teto de resolução do WEBM |
| `--crf <n>` | `36` | **(planejado)** qualidade do re-encode WEBM (maior = menor/pior; faixa útil 30–42) |
| `--audio-kbps <n>` | `64` | **(planejado)** bitrate do Opus no re-encode |
| `--no-recode` | — | **(planejado)** WEBM: falha em vez de re-encodar quando não há VP9 nativo |
| `--gif-fps <n>` | `15` | teto de quadros por segundo do GIF |
| `--gif-largura <n>` | `480` | largura máxima do GIF em px |
| `--inicio <tempo>` | `0` | início do recorte (§3.4) |
| `--fim <tempo>` | fim do vídeo | fim do recorte |
| `--duracao <tempo>` | — | duração do recorte, no lugar do `--fim` |
| `--dry-run` | — | **(planejado)** mostra o formato escolhido e o tamanho estimado, sem baixar |
| `-h, --help` / `-v, --version` | — | ajuda / versão |
| `--configurar` | — | grava pasta e formato padrão no `config.json` (pergunta; com `-o`/`--formato webm\|av1\|gif\|menu`, grava sem perguntar; `--mostra` imprime em `chave=valor`). Roda sozinho na primeira execução sem argumentos |
| `--diagnostico` | — | mostra as ferramentas, de onde vieram, os encoders e o runtime JS; sai com `1` se faltar algo |

As opções **(planejado)** ainda não existem: hoje são recusadas como `Opção desconhecida`
(código `2`) e não aparecem no `--help`. Opção sem valor (`-o` no fim da linha) também é
argumento inválido (código `2`).

### 3.1. Fluxo interativo

0. **Campo de URL** (só sem argumento, no estilo do yoinks):

   ```
   Cole a URL (X ou YouTube):
   › █https://x.com/… ou https://youtu.be/…
     link na área de transferência — tab para colar
   ```

   - A área de transferência é lida em paralelo ao cabeçalho (`Get-Clipboard` no Windows).
     Se tiver um link válido (§2), a dica oferece **Tab** para colá-lo.
   - **Colar** um link válido com o campo vazio envia direto, sem precisar de Enter.
   - **Enter** envia; URL inválida mostra o aviso em `--perigo` e o campo continua aberto.
   - **Backspace** apaga, **Ctrl+U** limpa, **Esc**/**Ctrl+C** sai (código `0`).
   - Ao enviar, o campo vira `✔ <url>` e a dica some.
   - Na tela cheia (§6.2) o campo fica dentro da caixa «Cole um link», com as mesmas teclas;
     ao enviar, a caixa continua com a URL e o botão vira o spinner da análise.

1. **Análise:** `yt-dlp -J` na URL (com spinner).
2. **Cartão de informações:** título, site, tipo da mídia (vídeo ou GIF do X), dimensões,
   fps, duração e tamanho da fonte. Com recorte, uma linha `trecho 1:23 → 1:28 · 5.0 s`.
3. **Menu**, com a primeira opção já selecionada:

   ```
   › 1 WEBM · vp9 720p · tamanho mínimo  re-encode H.264 → VP9/Opus
     2 WEBM · av1 720p · menor ainda  re-encode → AV1/Opus · mais lento
     3 GIF · 480px · 10 fps  paleta otimizada · loop infinito · ~3.0 MB
     4 Cancelar
     ↑↓ mover · enter escolher · esc sair
   ```

   Teclas: `↑`/`↓` ou `k`/`j`, `1`–`4`, `Enter`; `Esc`/`q` cancelam (código `0`) e `Ctrl+C`
   sai com código `130` (§3.2).
   Os rótulos mostram os valores **efetivos** (ex.: `10 fps` se a fonte tem 10 fps, mesmo com
   teto 15). Com fonte nativa, o detalhe do WEBM vira `VP9/Opus nativo · sem re-encode` (e o do
   AV1, `AV1/Opus nativo · sem re-encode`; com recorte, `VP9/Opus · corte sem perda`). O GIF
   mostra a estimativa do §5.4, ou o aviso de vídeo longo. Com recorte, as estimativas e o
   aviso usam a duração do trecho. Na tela cheia, `r` abre a fase de recorte (§3.4).
4. **Progresso:** barra de download (`baixando`), barra de re-encode WEBM (`re-encodando`, com o
   codec e a velocidade do ffmpeg, ex.: `VP9 1.6x`; antes dela, a etapa com o teto de bitrate), barra de
   conversão no GIF (`convertendo`, via `ffmpeg -progress`).
5. **Fim:** tamanho do arquivo gerado, comparado ao da fonte, e o caminho absoluto.

Saída sem terminal (pipe, CI): sem cores, sem animações e sem menu, o que exige
`--formato`. Com `NO_COLOR` definido, sem cores.

### 3.2. Códigos de saída

| Código | Quando |
|---|---|
| `0` | sucesso, ou cancelado pelo usuário (`Esc`/`q` no menu, `Esc`/`Ctrl+C` no campo de URL) |
| `1` | erro do yt-dlp/ffmpeg (post sem vídeo, conta suspensa, rede, conversão) |
| `2` | argumentos inválidos, URL fora dos padrões do §2, ou trecho (§3.4) fora do vídeo |
| `130` | `Ctrl+C` fora do campo de URL (menu, análise, download), nos dois modos de tela |

### 3.3. Nome do arquivo

| Site | Modelo | Exemplo |
|---|---|---|
| X/Twitter | `%(uploader_id)s_%(id)s.<ext>` | `Deadlock_Game_2117966491932930048.gif` |
| YouTube | `%(title).60s [%(id)s].<ext>` | `Meu vídeo [SnswGrb3e3s].webm` |

No X o "título" é o texto do post (longo, cheio de emoji e hashtags), por isso o nome usa o
usuário e o id da mídia. Atenção: o `id` da mídia **não é** o id do post (no exemplo, post
`2117991507332395252` → mídia `2117966491932930048`).

O nome é sempre montado pelo yt-dlp, inclusive no GIF (a fonte é baixada com o modelo acima e
o GIF herda o nome). Assim os caracteres proibidos no Windows são trocados do mesmo jeito em
todos os formatos (`:` → `：`, por exemplo).

Com recorte (§3.4), o nome ganha o trecho antes do `_av1`, sem `:`, para não sobrescrever a
versão inteira: `Meu vídeo [SnswGrb3e3s]_1m30s-1m40s_av1.webm` (`5s`, `1m05s`, `1h02m03s`,
`1m30.5s`).

### 3.4. Recorte de trecho

Implementado em 2026-11-05 (proposta em `docs/F3-Implement.md`). O recorte é um trecho
`{ início, fim }` em segundos; as funções puras ficam em `tempo.mjs`, com testes em
`tests/tempo.test.mjs` (`npm test`).

**Tempos aceitos** (opções, fase de recorte e `&t=`): `83`, `83.5`, `90s`, `1:23`, `1:02:03`,
`1m30s`, `1h2m3s`. Outra coisa → `--inicio não entendeu «…»` (código `2`).

**Modo linha:** `--inicio` com `--fim` ou `--duracao` (os dois juntos → código `2`). Sem
`--inicio`, começa do zero; sem `--fim`/`--duracao`, vai até o fim. `--fim` antes do
`--inicio` → código `2`. Depois da análise, o trecho é conferido contra a duração: início
depois do fim do vídeo, ou fim depois dele → código `2`. Um trecho que pega o vídeo inteiro
vale como sem recorte. Na tela cheia, as opções valem só para o primeiro link.

**Download:**

- **YouTube:** baixa só o trecho, com `--download-sections "*<início>-<fim>"` e
  `--downloader-args "ffmpeg_o:-copyts"`. O yt-dlp chama `ffmpeg -ss <início> -t <dur> -i …
  -c copy` uma vez, para vídeo e áudio juntos. O `-c copy` começa no keyframe anterior ao
  início (no Puzzle, 10.24 s para um pedido de 15 s), e o `-copyts` mantém no arquivo os
  tempos do vídeo original. Sem ele, o keyframe vira o tempo 0 e não dá para saber onde o
  trecho começa. Por isso não é preciso margem nem `--force-keyframes-at-cuts`.
- **X:** baixa o vídeo inteiro e corta só no ffmpeg. Os vídeos são curtos, e cortar HLS é frágil.
- Com `--download-sections` o yt-dlp não manda progresso (só uma linha no fim), então a barra
  `baixando` vira a etapa `baixando o trecho…`, que termina em `trecho baixado · 1.2 MB`.

**Corte:** o ffmpeg que já roda depois recebe `-ss <início − start_time> -t <dur>` antes do
`-i` (o `-ss` de entrada conta a partir do `start_time` do arquivo, lido com ffprobe). No
trecho do YouTube, o início no arquivo é o próprio início; no X, é `start_time + início`.

- **GIF e re-encode** (VP9, AV1): o corte sai no quadro exato. Medido no Puzzle, 15–25 s: o
  primeiro quadro tem SSIM 0.989 com o quadro original de 15 s e 0.21 com o de 14.5 s.
- **VP9/AV1 nativo:** `-c copy`, **sem perda** e sem re-encode. O tamanho fica proporcional
  ao trecho, mas o corte começa no keyframe anterior ao início, então o arquivo pode ter até
  alguns segundos a mais no começo (Rick Astley, 1:30–1:40: começou em 1:29.4, 10.6 s, 1.0 MB).
  Nativo em mkv (áudio que não é Opus): `-c:v copy` com o mesmo corte, e o áudio vira Opus.
- O teto de bitrate do §4 e as amostras do §4.1 medem só os pacotes de dentro do trecho, e as
  barras de progresso usam a duração dele.

**Tela cheia:** no menu, `r` abre a fase **recorte** (fora da lista de opções: o palco tem 9
linhas e as 4 opções já chegam na última). Ela começa no recorte atual; sem ele, no `&t=` do
link ou no zero, com 10 s.

```
Título do vídeo
tipo   vídeo do YouTube
fonte  1280×720 · 25 fps · 213.0 s · 18.0 MB
trecho 1:30 → 1:40 · 10.0 s

0:00 ━━━━━━━━━━━━━━━━━━━━━━━━━┫██┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3:33
› início 1:30█        fim 1:40
GIF ~4.1 MB · WEBM ~867.4 KB
```

- `←`/`→` movem a ponta ativa 1 s e `Shift+←/→`, 5 s. `Tab` alterna início e fim. Digitar
  (números, `:`, `.`, `h`/`m`/`s`) escreve o tempo no campo; `Backspace` apaga. O texto vale
  ao trocar de campo, mover ou confirmar; se não for um tempo, é descartado.
- As pontas ficam dentro do vídeo, com pelo menos 1 s. Se uma passar da outra, a outra é
  empurrada junto, mantendo a duração.
- A linha `trecho` do cartão, a linha do tempo e as estimativas (GIF do §5.4; WEBM pela fração
  da fonte, que o teto de bitrate não deixa passar) são refeitas a cada tecla. Acima de 15 s,
  a estimativa do GIF fica em `--perigo` com `GIF longo: mais de 15 s`.
- `Enter` confirma e volta ao menu, com a mesma opção selecionada; `Esc` volta **sem
  recorte**. Só aparece com a duração conhecida e o vídeo com 2 s ou mais.

## 4. Formato WEBM

O download e o re-encode são duas etapas separadas: o yt-dlp só baixa e junta vídeo e áudio
numa pasta temporária, e o ffmpeg re-encoda direto (não pelo `--recode-video`). Assim o
re-encode tem barra de progresso real (`-progress pipe:1`, como o GIF) e a fonte é medida antes
de codificar, para o teto de bitrate. Atualizado em 2026-11-05 (yt-dlp 2026.08.19, ffmpeg
essentials 2025-08-20).

1. Download (yt-dlp):

   ```
   yt-dlp <url>
     -f "bv*+ba/b"
     -S "lang,res:720,vcodec:vp9,acodec:opus,+size"
     --merge-output-format "webm/mkv"
     --no-playlist
     -o "<pasta temporária>/<nome do §3.3>"
     --ffmpeg-location <ffmpeg>     # planejado (§6); hoje usa o ffmpeg do PATH
   ```

2. Se a fonte já é VP9 e saiu em `.webm`, o arquivo só é **movido** para o destino, sem
   re-encode. Se é VP9 mas saiu em mkv (áudio que não é Opus), o vídeo é copiado
   (`-c:v copy`) e só o áudio vira Opus. «VP9 nativo» é o vídeo que a própria seleção pegou
   (`requested_formats` do `-J`): um VP9 só em outra resolução não conta (o Puzzle tem VP9 só
   em 360p; antes de 2026-11-05 isso fazia o H.264 de 720p ir com `-c:v copy` para o webm, e o
   ffmpeg falhava). Com recorte, ver §3.4.
3. Senão, mede o bitrate de vídeo da fonte (soma dos pacotes da trilha de vídeo com `ffprobe
   -show_entries packet=size`, dividida pela duração; sem ffprobe, usa o `vbr`/`tbr`
   informado pelo yt-dlp) e re-encoda:

   ```
   ffmpeg -y -i <fonte>
     -vf "scale=w='if(lte(iw,ih),min(iw,720),-2)':h='if(gt(iw,ih),min(ih,720),-2)'"
     -c:v libvpx-vp9 -crf 36 -b:v <bitrate da fonte>k -row-mt 1 -deadline good -cpu-used 4
     -c:a libopus -b:a 64k
     -progress pipe:1 -nostats <destino>.webm
   ```

Como funciona:

- `-S` define a ordem de preferência, campo por campo:
  1. `lang`: o áudio no **idioma original**, e não a dublagem automática do YouTube. Num
     vídeo com dublagens, cada idioma é um formato de áudio próprio; o original vem com
     `language_preference` 10 e as dublagens com −1. Sem o `lang` na frente, ele ficaria
     atrás do `+size`, e a faixa dublada ganharia sempre que fosse uns KB menor (aconteceu
     com `n7alj9-6KAE`: original em pt-BR, saiu em espanhol ou inglês). Os ids dessas faixas
     (`251-0`, `251-1`…) mudam de ordem a cada requisição, então não servem para escolher.
     Em vídeos sem dublagem, todas as faixas têm o mesmo valor e o campo não muda nada.
  2. `res:720`: a maior resolução que não passe de 720.
  3. `vcodec:vp9`: entre elas, VP9 (AV1 fica atrás, porque é "melhor" que o teto vp9).
  4. `acodec:opus`: áudio Opus.
  5. `+size`: entre os empatados, o **menor** arquivo.
- `-f "bv*+ba/b"`: melhor vídeo + melhor áudio segundo essa ordem; se o site só tem arquivo
  único (caso dos GIFs do X, que nem têm áudio), usa ele.
- `--merge-output-format "webm/mkv"`: junta em webm quando os codecs permitem; se não
  (H.264/AAC), junta em mkv para não falhar.
- O destino tem o nome que o yt-dlp deu na pasta temporária, com extensão `.webm`. Um arquivo
  de mesmo nome no destino é **sobrescrito**, como no GIF.

Parâmetros do re-encode:

| Parâmetro | Motivo |
|---|---|
| `scale=…` | **reduz para 720 no lado menor só quando a fonte passa disso.** O `-S res:720` apenas escolhe entre os formatos oferecidos; se o site tem um formato só (GIF do X a 800×800), nada mais limitaria a resolução. `-2` mantém a proporção com dimensão par |
| `-crf 36 -b:v <fonte>k` | modo «constrained quality»: qualidade do CRF 36, com o bitrate de vídeo da fonte como **teto** da média. Assim o VP9 nunca gasta mais bits que o H.264 original (§9). Sem bitrate da fonte, `-b:v 0` (qualidade constante pura) |
| `-row-mt 1` | usa vários núcleos |
| `-deadline good -cpu-used 4` | velocidade razoável; `-cpu-used` mais baixo (0–2) gera arquivo um pouco menor, mas é bem mais lento |
| `-c:a libopus -b:a 64k` | Opus a 64 kbps é transparente para fala e aceitável para música. Sem faixa de áudio na fonte (GIF do X), o parâmetro é ignorado e o webm sai só com vídeo |

O `scale` só roda no re-encode. Um VP9 nativo do YouTube não é tocado, e já vem ≤ 720 pelo `-S`.

### 4.1. WEBM AV1

Mesmo fluxo do §4, com estas diferenças:

- `-S "lang,res:720,vcodec:av01,acodec:opus,+size"`: prefere AV1 na resolução escolhida.
- Há AV1 nativo só quando existe um `av01` **na mesma resolução** que a seleção do VP9 pegou
  (o `-S` decide a resolução antes do codec). Sem AV1 nativo, sempre há re-encode, mesmo que
  a junção tenha dado um webm VP9.
- Codificador: **SVT-AV1** quando o ffmpeg tem `libsvtav1` (conferido com `ffmpeg -encoders`
  no início, em paralelo com a análise); senão, **libaom**. O SVT é bem mais rápido com
  tamanho parecido. O ffmpeg essentials não tem SVT-AV1, então o libaom é a reserva. O menu
  mostra `re-encode → AV1/Opus · SVT-AV1` ou `re-encode → AV1/Opus · mais lento`.

  | Codificador | Parâmetros | Teto de bitrate |
  |---|---|---|
  | `libsvtav1` | `-crf 38 -preset 8 -pix_fmt yuv420p` | «capped CRF»: `-maxrate <alvo>k -bufsize <2× alvo>k` |
  | `libaom-av1` | `-crf <escolhido> -b:v 0 -row-mt 1 -tiles 2x2 -cpu-used 6` | CRF escolhido por amostras (abaixo) |

  O CRF do AV1 vai de 0 a 63; 38 fica perto do VP9 a 36 em qualidade, com arquivo menor.
- **Alvo do AV1: 70% do bitrate de vídeo da fonte.** O AV1 é bem mais eficiente que o H.264, e
  re-encodar para o mesmo tamanho não economiza nada (ver `P1-Puzzle.md`).
- **CRF por amostras no libaom.** Nenhum modo de bitrate de uma passada do libaom respeita o
  alvo: com `-crf` + `-b:v` o `-b:v` é tratado como alvo e o arquivo cresce quando a fonte é
  boa (GIF do X: 162 KB → 198 KB), e com alvo de 1172 kbps o Puzzle saiu com 1493 kbps
  (`-crf -b:v`) ou 1753 kbps (VBR). `-maxrate` sem `-b:v` não é aceito. O que controla bem o
  tamanho é o próprio CRF, então:
  1. Codifica 3 amostras de 3 s (a 25, 50 e 75% da duração; vídeos com menos de 18 s viram uma
     amostra só, inteira) a CRF 38, sem áudio.
  2. Prevê o bitrate do vídeo inteiro pela **razão** entre o tamanho codificado e o tamanho dos
     **mesmos trechos** na fonte, vezes o bitrate da fonte. A razão é mais estável que o
     bitrate da amostra, porque a fonte varia muito ao longo do vídeo.
  3. Se a previsão couber no alvo, usa CRF 38. Senão, codifica as amostras de novo a CRF 46 e
     interpola o CRF que acerta o alvo (log do bitrate é uma reta no CRF), arredondado para
     cima e limitado a **50** (limite de qualidade).
  4. Rede de segurança: se o vídeo final passar do bitrate da fonte, refaz uma vez com CRF + 6
     (barra `refazendo`).

  A previsão erra para cima (cada amostra começa num quadro-chave): no Puzzle, 2234 kbps
  previstos contra 2006 reais a CRF 38.
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

  Valores do yt-dlp, quando existem, têm prioridade sobre os do ffprobe. Sem ffprobe, o cartão
  avisa `ffprobe não encontrado; dimensões e fps incompletos` e os campos ficam com `?`.

A opção GIF fica disponível para **qualquer** fonte (GIF do X, vídeo do X, YouTube). Para
GIFs do X ela é a opção natural. Para vídeos, ver o aviso de duração no §5.4.

### 5.3. Conversão

1. **Download** só do vídeo, para uma pasta temporária (`os.tmpdir()/gdm-yoinks-XXXX`, apagada
   ao final, inclusive em caso de erro):

   ```
   yt-dlp <url> -f "bv*/b" -S "res:720,+size" --no-playlist -o "<tmp>/<nome do §3.3>.%(ext)s"
   ```

   A limpeza da pasta temporária fica num gancho de saída do processo, porque as falhas e o
   Ctrl+C encerram com `process.exit()`, que não executa os blocos `finally`.

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
não há confirmação. Na tela cheia, o detalhe vira `vídeo longo (42 s) · r para recortar`.
Com recorte (§3.4), vale a duração do trecho (`trecho longo (20 s) · …`).

### 5.5. Tamanho da fonte no cartão

A análise roda `yt-dlp -J` **com a mesma seleção do WEBM** (`-f`/`-S` do §4). Assim,
`requested_formats` diz exatamente o que seria baixado (ex.: vídeo `hls-764` + áudio
separado), e o tamanho da fonte é a soma de cada parte: `filesize`, senão `filesize_approx`,
senão `tbr × duração`. O ffprobe completa dimensões e fps. O **tamanho** medido por ele só é
usado nos GIFs do X, porque em vídeos HLS a URL é uma playlist `.m3u8` e o ffprobe
devolveria o tamanho da playlist (1.6 KB, no teste).

Quando vídeo e áudio chegam separados, a barra mostra `baixando 1/2` e `baixando 2/2`.

## 6. Dependências

- **Onde achar cada ferramenta** (`ferramentas.mjs`; detalhes na seção 2.1 do
  `Instalador-Implement.md`): variável `GDM_YOINKS_<NOME>` → `ferramentas.<nome>` na config →
  embutida pelo instalador (`<pasta do .mjs>/../tools/`) → PATH → `~/.yoinks/bin/` (só o
  yt-dlp). O yt-dlp recebe `--ffmpeg-location` com a pasta do ffmpeg resolvido.
- **yt-dlp**, com um runtime JavaScript para o YouTube: o próprio Node, se for ≥ 22
  (`--js-runtimes node:<node>`); senão, o padrão do yt-dlp (Deno).
- **ffmpeg** com `libvpx-vp9`, `libaom-av1` (ou `libsvtav1`, preferido quando existe, §4.1),
  `libopus` e o codificador `gif`, e **ffprobe**. O ffprobe é obrigatório para as informações
  dos GIFs do X (§5.2). O `--diagnostico` confere tudo isso e sai com `1` se faltar algo.
- **Instalação sem nada antes:** o instalador do Windows traz Node, yt-dlp e ffmpeg; no Arch,
  o pacote depende dos do pacman (`installer/`, ver o `Instalador-Implement.md`). Isso
  substitui o download do yt-dlp e o `ffmpeg-static` que esta seção previa.
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
| letras do logo: linha de cima / corpo / lateral direita do traço | `--pico` / `--texto` / `--fraco` | |
| banda viva: bits `1` / bits `0` | `--p2` a 60% / 32% sobre `--fundo` | `#2c5916` / `#1f3717` |
| banda viva: rastro de célula morta `·` | `--borda` → `--superficie-2` | |
| banda viva: o `7` escondido | `--p4` | `#96E072` |
| letreiro: bits `1` / bits `0` / costura `★` | `--acento` / `--fraco` / `--p4` | |
| letreiro: fundo da faixa | `--superficie-2` | `#212623` |

Na tela cheia, o fundo inteiro é pintado de `--fundo` (`#101119`). No modo linha, o fundo do
terminal não é pintado, exceto a faixa do letreiro e as células do logo com duas cores.

### 6.2. Tela cheia

Com terminal interativo (stdin e stdout), cor e janela de pelo menos **86×22**, o programa
assume a janela inteira, como o yoinks: entra no buffer alternativo do terminal (`ESC[?1049h`,
o mesmo do vim), esconde o cursor e redesenha a tela a cada 70 ms. Só as linhas que mudaram são
reescritas, dentro de saída sincronizada (`ESC[?2026h`…`l`) para não tremer.

De cima para baixo, centralizado na vertical e na horizontal:

| Bloco | Linhas | Conteúdo |
|---|---|---|
| logo | 4 | desenho do `logo.md` em meia célula |
| letreiro | 1 | «please be nice» em binário, da largura do logo |
| frase e formatos | 2 | `baixa vídeo e GIF do X e do YouTube. cola. extrai.` / `webm · webm av1 · gif · vX` |
| palco | 9 | muda com a fase (abaixo) |
| atalhos | 1 | teclas da fase atual |

Fases do palco:

| Fase | Palco | Atalhos |
|---|---|---|
| URL | caixa «Cole um link» com o botão `extrair` à direita; embaixo, a dica da área de transferência ou o erro de URL | `↵ extrair · tab colar · esc sair` |
| análise | a mesma caixa com a URL; o botão vira um spinner; `analisando o link…` | `^c cancelar` |
| menu | cartão (título, tipo, fonte, aviso, trecho) e as quatro opções | `↑↓ mover · ↵ escolher · r recortar · esc sair` (o `r` só quando dá para recortar) |
| recorte | cartão, linha do tempo, campos início/fim e estimativas (§3.4) | `←→ ±1 s ⇧ ±5 s · tab início/fim · 0-9 digitar · ↵ ok · esc inteiro` |
| download | cartão, barra de progresso e a etapa atual (spinner ou `✔`) | `^c cancelar` |
| pronto | cartão, `✔` tamanho final (e o da fonte) e o caminho do arquivo | `↵ novo link · esc sair` |

- **Várias extrações:** no «pronto», **Enter** volta à fase URL com o campo vazio (a área de
  transferência é lida de novo) para extrair outro link; **Esc**/`q` sai.
- **Saída:** ao terminar, cancelar (Esc, `q` no menu, Ctrl+C) ou falhar, a tela original volta e
  o resultado, `cancelado.` ou o erro é impresso nela, para ficar no histórico do terminal.
  Com várias extrações, todos os arquivos gerados são impressos, mesmo saindo por erro ou
  Ctrl+C; `cancelado.` só aparece se nada foi extraído ou se o menu foi cancelado.
  Fora do campo de URL, Ctrl+C sai com código 130 e encerra o yt-dlp/ffmpeg que estiver rodando.
- **Janela redimensionada:** a tela se refaz no novo tamanho (a vida recomeça). Se ficar menor
  que 86×22, mostra só `aumente a janela (mínimo 86×22)` até voltar a caber.
- Com `--formato` o menu é pulado; com a URL como argumento, a fase URL também.

### 6.3. Logo, vida e letreiro

- **Logo:** lido de `logo.md`, ao lado do script. As linhas de `.` e `%` são o desenho (fonte
  5×7, 82 colunas), e a linha de `0`/`1` é «G.D.M. Extractor» em binário. Cada linha de
  terminal mostra duas linhas do desenho com `▀`/`▄`. Sem o arquivo, o programa usa o modo linha
  com o selo simples.
- **Abertura (o logo nasce da vida):** ao abrir a tela cheia, o logo não aparece pronto. Cada
  pixel do desenho sai de uma célula viva sorteada (que morre ali, sem rastro) e voa até o seu
  lugar em **1 s**. A partida de cada pixel é sorteada nos primeiros 300 ms, e o voo desacelera
  na chegada (cúbica). Nos primeiros 40% do voo o pixel ainda é o bit da célula, na cor da vida;
  depois vira meio bloco (`▀`/`▄`) e passa para a cor do logo. Se faltarem células vivas, os
  pixels restantes partem de pontos sorteados. Durante a abertura só o logo e a vida aparecem; o
  resto da interface surge no fim, e a tela é redesenhada a cada 30 ms. **Qualquer tecla** pula
  a abertura e não chega ao campo de URL (exceto Ctrl+C, que sai como sempre). A abertura só
  acontece uma vez, ao abrir; redimensionar a janela durante ela a encerra. A análise de uma URL
  passada como argumento já começa por trás da abertura, sem esperar.
- **Jogo da Vida:** na tela cheia, roda o Jogo da Vida de Conway por trás de tudo (B3/S23, bordas
  que dão a volta), uma célula por caractere, a **6 gerações por segundo**. Cada célula viva
  mostra o bit da linha binária do `logo.md` na sua posição; célula que morre deixa um `·` que
  esfria em poucas gerações. A vida só aparece onde a interface não escreveu. Se a população cai
  abaixo de 12%, caem respingos novos a cada 30 gerações. Em média a cada 45 gerações, uma única
  célula viva (fora da interface) vira um `7` em `--p4` até morrer, por no máximo 18 gerações.
- **Letreiro:** diz «please be nice» em binário e rola para a esquerda, como a barra «novo no
  acervo» do catálogo do sistemaGDM (`base.html`/`estilo.css`): uma fita contínua que emenda a
  volta sozinha, com `★` como costura entre uma volta e a próxima. Um caractere a cada 70 ms.

### 6.4. Modo linha

Sem terminal interativo, com `NO_COLOR` ou com janela menor que 86×22, o programa imprime linha a
linha, sem tela cheia e sem Jogo da Vida:

- logo parado e letreiro embaixo dele. O letreiro **continua andando** durante a análise, o menu
  e o download: cada quadro sobe até a linha dele (salva/restaura o cursor), contando as linhas
  impressas depois. Ele para no fim, num erro, no Ctrl+C, ou antes, se já tiver rolado para fora
  da tela;
- terminal mais estreito que o logo (82 colunas + margem): só o selo, com o letreiro na
  largura disponível. Sem terminal ou com `NO_COLOR`: logo e letreiro parados.

## 7. Comportamento esperado por site

| Site | Fonte típica | WEBM | GIF |
|---|---|---|---|
| YouTube | VP9 + Opus nativos (ex.: formato 247 + 249) | sem re-encode, sem perda; rápido (só download) | baixa só o vídeo e converte |
| X: GIF | MP4 H.264 sem áudio, formato único (`tweet_video`) | re-encode, reduzido a 720 se maior; webm sem áudio | converte direto; é o caso de uso principal |
| X: vídeo | H.264 + AAC, várias resoluções | re-encode para VP9/Opus; lento (proporcional à duração) | converte; aviso se > 15 s |
| Instagram / Threads / TikTok (**futuro**: hoje o §2 recusa esses sites) | H.264 + AAC | re-encode | idem |

Testes feitos:

- Short do YouTube `SnswGrb3e3s` → WEBM `247+249-drc` (vp9 720p + opus), 256 KB, sem
  re-encode.
- GIF do X `Deadlock_Game/status/2117991507332395252` → WEBM vp9 720×720, 217.5 KB; GIF
  480×480 10 fps, 2.9 MB (2026-11-04).
- Vídeo do X `drogbagfbpa/status/2117748505997631955` (H.264 956×540 25 fps + AAC 128k, 42 s,
  HLS `amplify_video`, fonte de 3.8 MB) → WEBM vp9 956×540 + opus, **4.9 MB, maior que a
  fonte** (ver §9); GIF 480×271 15 fps, 16.8 MB (2026-11-04).
- Re-encode WEBM num clipe H.264 720p sintético: saída VP9/Opus válida.
- Teto de bitrate e progresso do re-encode (2026-11-05, ffmpeg direto): vídeo do X → VP9
  956×540 + opus, **3.5 MB** (teto de 633 kbps; antes 4.9 MB), barra `re-encodando` de 0 a
  100%; AV1 (libaom) 3.1 MB, sem refazer. GIF do X → VP9 215.7 KB (teto de 544 kbps, sem efeito), AV1
  158.4 KB (sem refazer). A rede de segurança do §4.1 (refazer com CRF + 6) foi testada
  forçando a condição: GIF do X refeito a CRF 44, 114.5 KB.
  Short do YouTube: VP9 e AV1 nativos só movidos, mesmos tamanhos de antes. SVT-AV1
  **não testado** (o ffmpeg essentials não tem `libsvtav1`).
- CRF do AV1 por amostras (2026-11-05, ver `P1-Puzzle.md`): YouTube `2NZBD0DyoK8` («puzzle»,
  só H.264 1280×720 a 1674 kbps, fonte de 11.0 MB) → AV1 CRF 50, **6.6 MB** (antes 12.7 MB a
  CRF 38), SSIM 0.961, 116 s no total. Vídeo do X → AV1 CRF 45, 2.1 MB (antes 3.1 MB), SSIM
  0.977, igual ao VP9 de 3.5 MB. GIF do X → AV1 CRF 38, 158.4 KB, sem mudança.
- Short do YouTube `https://youtu.be/SnswGrb3e3s` (720×740, 25 fps, 4 s, fonte de 250.3 KB),
  pelo `gdm-yoinks.mjs` (2026-11-04): WEBM vp9+opus 250.4 KB sem re-encode; WEBM AV1
  av1+opus 163.5 KB (AV1 nativo, sem re-encode); GIF 480×493, 2.6 MB. Nomes
  `luigi screams [SnswGrb3e3s].webm`, `…_av1.webm` e `….gif`.
- Recorte (§3.4, 2026-11-05), todos com a duração pedida e o nome com o trecho:
  - Rick Astley `dQw4w9WgXcQ` (VP9 nativo, 213 s, fonte de 18.0 MB), `--inicio 1:30 --fim 1:40`
    → WEBM `-c copy` 1.0 MB, 10.6 s (começa no keyframe de 1:29.4); `&t=90s` com
    `--formato gif` → GIF 1:30–1:40, 10.0 s, 6.1 MB.
  - Puzzle `2NZBD0DyoK8` (H.264), 15–25 s → VP9 2.4 MB e AV1 2.0 MB, 10.0 s, corte no quadro
    exato (SSIM 0.989 e 0.945 com o quadro original de 15 s).
  - Vídeo do X, 5–10 s (vídeo inteiro baixado) → GIF 5.0 s, 2.6 MB; VP9 5.0 s, 505 KB
    (SSIM 0.970 com o quadro de 5 s).
  - Short `SnswGrb3e3s`, `--inicio 1.5 --fim 3.5` → GIF 2.0 s; sem recorte, WEBM e AV1 com os
    mesmos tamanhos de antes.
  - Erros de argumento e trecho fora do vídeo → código 2. Tela cheia (simulada, 100×30):
    `&t=` no cartão, `r`, setas, `Shift`, `Tab`, digitar, `Backspace`, `Esc` e `Enter`.

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
| opção sem valor | `A opção <opção> precisa de um valor.` | 2 |
| tempo que não é tempo | `--inicio não entendeu «abc»: use segundos (83, 90s), 1:23 ou 1:02:03.` | 2 |
| `--fim` e `--duracao` juntos | `Use --fim ou --duracao, não os dois.` | 2 |
| `--fim` antes do `--inicio` | `--fim precisa ser depois do --inicio.` | 2 |
| trecho fora do vídeo | `--inicio 5:00 passa do fim do vídeo (3:33).` / `O trecho termina em 3:40, depois do fim do vídeo (3:33).` | 2 |

Mensagens do yt-dlp perdem o prefixo `ERROR: [extrator] ` e o id que ele põe na frente
(`ERROR: [twitter] 1: No video…` → `No video…`), tanto na análise quanto no download.

## 9. Pontos em aberto

- ~~**Recorte para GIF** (`--inicio`, `--duracao`)~~ **Feito em 2026-11-05** (§3.4), para os
  três formatos. Decisões: VP9/AV1 nativo corta com `-c copy` (sem perda, começa no keyframe);
  só com o `&t=`, o trecho tem 10 s. Falta a prévia do quadro na fase de recorte (D5).
- **Áudio `-drc`**: o YouTube às vezes oferece uma variante do Opus com compressão de faixa
  dinâmica, de mesmo tamanho. Para evitar, adicionar `-f "bv*+ba[format_id!*=drc]/bv*+ba/b"`.
- ~~**Um vídeo H.264 pode ficar maior após o re-encode**~~ **Resolvido em 2026-11-05** pela
  opção (c), o teto de bitrate do §4. Medição original, com o vídeo do X do §7 (fonte de
  3.8 MB, 633 kbps de vídeo):

  | Configuração | WEBM | vs. fonte |
  |---|---|---|
  | VP9 CRF 36, sem teto (antigo) | 4.9 MB | +27% |
  | VP9 CRF 40, sem teto | 3.8 MB | −1% |
  | VP9 CRF 44, sem teto | 3.0 MB | −22% |
  | **VP9 CRF 36, teto de 633 kbps (atual)** | **3.5 MB** | **−8%** |
  | AV1 (libaom) CRF 38, sem teto | 3.1 MB | −19% |

  Com o teto, o vídeo fica no máximo com o bitrate da fonte e o ganho vem do áudio (AAC
  128k → Opus 64k). Fontes leves ficam menores que antes, e fontes boas (GIF do X) não mudam.
- **Re-encode também no YouTube**: um CRF alto (40+) reduziria ainda mais os arquivos do
  YouTube, com perda de qualidade e muito mais tempo. Hoje não fazemos isso.
- **Estimativa de tamanho do GIF**: o fator fixo do §5.4 acertou nos dois testes, mas vem de
  só duas amostras. Se errar muito em outros vídeos, converter alguns quadros de amostra.
- **Posts do X que exigem login** (conteúdo sensível): o yt-dlp precisa de
  `--cookies-from-browser`. Ainda não há opção para isso.

## 10. Estado do protótipo (`gdm-yoinks.mjs`)

```
gdm-extractor [url do X ou do YouTube] [-o pasta] [--formato webm|av1|gif]
              [--inicio t] [--fim t | --duracao t]
gdm-extractor --diagnostico
gdm-extractor --configurar [-o pasta] [--formato webm|av1|gif|menu] [--mostra]
```

| Item | Estado |
|---|---|
| URLs do X/Twitter (§2.1) | feito, inclusive `i/web/status/<id>` (testado). `…/video/N` e post com várias mídias: feitos, não testados (sem post de exemplo) |
| URLs do YouTube (§2.2) | feito e testado (Short); playlist/canal recusados com código 2; live em andamento recusada (não testada) |
| Menu, cartão, cores, progresso (§3.1, §6.1) | feito |
| WEBM (§4), inclusive o `scale` | feito e testado |
| Teto de bitrate no re-encode (§4, §9) | feito e testado (VP9) |
| CRF do libaom por amostras, alvo de 70% da fonte (§4.1) | feito e testado |
| Progresso real do re-encode WEBM (§3.1) | feito e testado |
| SVT-AV1 quando o ffmpeg tiver (§4.1) | feito e testado (ffmpeg 8.1 do instalador e 9.0 do Arch) |
| GIF (§5), com estimativa e aviso de duração (§5.4) | feito e testado |
| Abertura do logo nascendo da vida (§6.3) | feito e testado num terminal simulado (pty 120×36) |
| Recorte de trecho (§3.4): opções, `&t=`, fase de recorte, sufixo no nome | feito e testado (`npm test` e §7); tela cheia testada só num terminal simulado |
| tamanho da fonte e download em partes (§5.5) | feito e testado |
| comando `gdm-extractor`, campo de URL com área de transferência (§3, §3.1) | feito |
| `--max-height`, `--crf`, `--audio-kbps`, `--no-recode`, `--dry-run` | **falta** |
| Nome de arquivo do YouTube (§3.3) | feito, inclusive no GIF (nome dado pelo yt-dlp) e com sufixo `_av1` |
| Mensagens de erro e códigos de saída (§3.2, §8) | feito, inclusive o `130` do Ctrl+C nos dois modos |
| Limpeza da pasta temporária em falha (§5.3) | feito e testado (ffmpeg sem permissão de escrita) |
| Dependências (§6): yt-dlp do yoinks | feito |
| Dependências (§6): resolução das ferramentas, `--ffmpeg-location`, runtime JS, `--diagnostico` | feito e testado (`npm test`, Windows e Arch) |
| Configuração (`config.json`, `--configurar`) | feito e testado |
| Instalador do Windows e pacote do Arch (`installer/`) | feito e testado (instalação silenciosa, atualização e desinstalação; `makepkg` num contêiner) |
| Instalador do Windows 7 SP1 (`build.ps1 -Alvo win7`, experimental) | feito; imports conferidos, instalação e extração testadas no Windows 11 com os binários do win7. **Falta** testar numa VM com o Windows 7 |
| Modo texto em terminal limitado (Windows antes do 1809, `TERM=linux`) | feito; testado com `TERM=linux` |

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
