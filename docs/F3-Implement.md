# F3 — Recorte de trecho: proposta de implementação

Proposta para a ideia **F3** do `IDEIAS.md` (2026-11-05). As referências `§N` apontam para a
`ESPECIFICACAO.md`.

> **Implementada em 2026-11-05** (ver §3.4 da especificação). Decisões em aberto do §5:
> VP9/AV1 nativo com recorte usa `-c copy` (sem perda, começa no keyframe anterior), e só
> com o `&t=` o trecho tem 10 s. Diferenças desta proposta:
>
> - Sem a margem de 5 s no `--download-sections`: com `--downloader-args "ffmpeg_o:-copyts"`
>   o arquivo guarda os tempos do vídeo original (o `-c copy` do yt-dlp já começa no keyframe
>   anterior). Sem o `-copyts`, o keyframe vira o tempo 0 e o `start_time` não diz onde o
>   trecho começa (testado).
> - O `--progress-template` de fato não traz progresso com `--download-sections` (só uma linha
>   no fim): ficou a etapa com spinner `baixando o trecho…`.
> - Com `--formato gif`, o `&t=` também recorta na tela cheia, porque sem menu não há fase de
>   recorte para preencher.
> - As funções puras ficaram em `tempo.mjs`, com testes em `tests/tempo.test.mjs` (`npm test`).
> - Falta a prévia em meia célula (D5).

A F3 foi escrita pensando em flags (`--inicio`, `--duracao`). Na tela cheia ninguém digita flags.
O usuário cola o link e escolhe no menu, então o recorte precisa de uma fase própria na
interface. A implementação se divide em três camadas: um núcleo comum, as flags para o modo
linha e a interface da tela cheia.

---

## 1. Núcleo comum (serve aos dois modos)

O recorte vira um objeto `{ inicio, fim }` em segundos, guardado em `m.recorte`, e quase tudo
que hoje lê `m.duracao` passa a ler a duração do trecho. Os pontos afetados no código:

- **Estimativas do menu** (`opcoesDoMenu`): a estimativa do GIF e o aviso de "vídeo longo"
  (§5.4) passam a usar a duração do trecho.
- **Barras de progresso** (`ffmpegComProgresso` recebe `m.duracao`).
- **Bitrate da fonte** (`kbpsDoVideo` divide os bytes pela duração; sem a correção, o teto do
  F1 sairia errado).
- **Nome do arquivo:** um sufixo como `_1m30s-1m40s`, no mesmo padrão do `_av1`, para o trecho
  não sobrescrever a versão inteira.

**Download do trecho:**

- **No YouTube:** `--download-sections "*<início−5s>-<fim>"`. O corte do yt-dlp com `-c copy`
  só acontece em keyframes, então o trecho é pedido com uma margem e o corte preciso é feito no
  ffmpeg que já roda depois (GIF e re-encode), lendo o `start_time` com ffprobe. Isso evita o
  `--force-keyframes-at-cuts`, que faria dois re-encodes.
- **No X:** baixar o vídeo inteiro e cortar só no ffmpeg. Os vídeos do X são curtos, e o corte
  em HLS com ffmpeg é frágil.
- **VP9 nativo** (hoje é só movido): com recorte, o trecho precisa passar pelo ffmpeg. Há duas
  opções: `-c copy`, que corta no keyframe mais próximo e pode errar uns segundos, ou
  re-encode, que é preciso e barato num trecho curto. A sugestão é o re-encode.

**A testar:** com `--download-sections`, o yt-dlp baixa usando o ffmpeg. É provável que aí o
`--progress-template` não traga `total_bytes`, e a regex do `baixa()` não acharia nada. Nesse
caso, a alternativa é uma etapa com spinner, `baixando o trecho…`.

## 2. Modo linha (só as flags)

- `--inicio 1:23` com `--duracao 5` ou `--fim 1:28`. O parser aceita `83`, `1:23`, `1:02:03` e
  `90s`, o mesmo formato do `&t=`.
- O valor só é conferido contra a duração do vídeo depois da análise. Fora do intervalo, sai
  com código `2`.
- O cartão ganha uma linha `trecho 1:23 → 1:28 · 5.0 s`.
- O parser é uma função pura, o primeiro bom candidato a `node --test` (§1.3 do `IDEIAS.md`).

## 3. Tela cheia (a parte que a F3 não cobre)

No menu, uma tecla `r` (recortar) abre uma fase nova, `recorte`. Ela não entra como 5ª opção da
lista porque o palco tem 9 linhas (`ALTURA_PALCO`) e as 4 opções já vão até a última. O palco
ficaria assim (68 colunas):

```
Título do vídeo
tipo    vídeo do YouTube
fonte   1280×720 · 30 fps · 212.4 s · 18.3 MB
trecho  1:30 → 1:40 · 10.0 s

0:00 ━━━━━━━━━━━━━━━━━━━━━━━━┫████┣━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3:32
› início 1:30█      fim 1:40
GIF ~2.1 MB · WEBM ~0.9 MB
```

Atalhos da fase: `←→ mover · tab início/fim · ↵ ok · esc inteiro`.

- **Teclas:** `←`/`→` movem a ponta ativa 1 s e `Shift+←/→` movem 5 s (o terminal manda
  `\x1b[1;2D`/`\x1b[1;2C`). `Tab` alterna entre início e fim, e digitar números escreve o tempo
  direto no campo. `Enter` confirma e volta ao menu. `Esc` volta sem recorte. `Backspace` apaga
  um dígito do campo ativo.
- **Estimativa ao vivo:** o ganho real sobre a versão por flags. O tamanho do GIF e do WEBM é
  recalculado a cada tecla, então dá para ajustar até caber.
- **Ligação com o §5.4:** quando o GIF está com o aviso de vídeo longo, o detalhe vira
  `vídeo longo (212 s) · r para recortar`. É justamente o caso em que o usuário precisa do
  recorte.
- **O bônus do `&t=90s`:** na tela cheia, o tempo do link só preenche o início da fase de
  recorte, sem aplicar sozinho. Vale mostrar `início do link: 1:30` no cartão, porque um recorte
  silencioso surpreenderia. No modo linha, a regra da F3 continua: com `--formato gif`, o `&t=`
  vira o `--inicio`.
- **Futuro:** a prévia em meia célula (D5) encaixa aqui, mostrando o quadro da ponta ativa.

## 4. Ordem sugerida

1. Parser de tempo com testes, depois as flags e o núcleo (download, corte preciso, sufixo,
   durações). Testar primeiro no modo linha com o vídeo do §7.
2. Fase `recorte` na `TelaCheia`, com a estimativa ao vivo.
3. O `&t=` e a atualização da especificação: §1 (hoje marca o recorte como fora do escopo),
   §2.2, §3, §6.2 e §9.

## 5. Decisões em aberto

- **VP9 nativo com recorte:** re-encode (preciso) ou `-c copy` (sem perda, mas corta no
  keyframe)?
- **Duração padrão quando só o `&t=` dá o início:** sugestão de 10 s, abaixo do limite de 15 s
  do aviso de GIF longo (`GIF_LONGO_S`).
