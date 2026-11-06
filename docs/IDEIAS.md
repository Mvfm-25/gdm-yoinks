# gdm-yoinks — ideias

Novas funcionalidades para o `gdm-extractor`, separadas em **Funcionalidade**, **Decoração** e
**Divertido**. Antes delas, uma revisão da `ESPECIFICACAO.md` comparada ao `gdm-yoinks.mjs`
(2026-11-05, yt-dlp 2026.08.19, ffmpeg essentials 2025-08-20).

As referências `§N` apontam para a especificação.

---

## Parte 1 — Revisão da especificação

> **Aplicada em 2026-11-05.** Os itens E1–E11 foram corrigidos na `ESPECIFICACAO.md` e os
> bugs B1–B7 no `gdm-yoinks.mjs`. Para o E8, a regra escolhida foi: `Esc`/`q` cancelam com
> código 0 e `Ctrl+C` sai com 130, nos dois modos. O B5 foi confirmado lendo o extrator do
> yt-dlp: sem `/video/N`, ele devolve todas as mídias. Com `/video/N` e `--no-playlist`, já
> devolve só a N-ésima. Os itens do §1.3 continuam em aberto.

### 1.1. Erros no texto da especificação

| # | Onde | Problema | Correção sugerida |
|---|---|---|---|
| E1 | introdução | "em um de **dois** formatos", mas a lista tem três (WEBM, WEBM AV1, GIF) | "em um de três formatos" |
| E2 | §1 | a tabela de objetivos não tem coluna para o AV1 | acrescentar a coluna AV1 (AV1 + Opus, CRF 38, sufixo `_av1`) ou remeter ao §4.1 |
| E3 | §1, §7 | citam Instagram, Threads e TikTok, mas o §2 recusa esses sites (código 2) | marcar como futuro ou remover |
| E4 | §2.1 | diz que `i/web/status/<id>` é aceita e que `…/video/N` usa a N-ésima mídia. Nenhum dos dois funciona (testado: `i/web/status` sai com código 2). Só o §10 avisa | marcar no próprio §2.1 como pendente |
| E5 | §3 | a tabela lista `--max-height`, `--crf`, `--audio-kbps`, `--no-recode` e `--dry-run` como se existissem. Hoje dão `Opção desconhecida` com código 2 (testado com `--dry-run`) e não aparecem no `--help` | marcar "(planejado)" na tabela |
| E6 | §3.1 | os textos do menu no exemplo não batem com o código: WEBM diz `re-encode do MP4 · menor arquivo, mantém qualidade` (o código diz `re-encode H.264 → VP9/Opus` ou `VP9/Opus nativo · sem re-encode`); GIF diz `paleta otimizada em 2 passadas · … · arquivo maior` (o código mostra `~2.9 MB`) | copiar os rótulos do `opcoesDoMenu` |
| E7 | §3.2 | a tabela de códigos não tem o **130** (Ctrl+C), que o §6.2 cita e o modo linha também usa | acrescentar a linha `130` |
| E8 | §3.2 × §6.2 | contradição: o §3.2 diz que cancelar no menu sai com `0`, e o §3.1 lista Ctrl+C como tecla de cancelar. Na tela cheia, Ctrl+C no menu sai com `130`; no modo linha, com `0` | decidir uma regra única (sugestão: Esc/`q` → 0, Ctrl+C → 130 nos dois modos) |
| E9 | §4, §6 | o comando do §4 passa `--ffmpeg-location <ffmpeg>`, e o §6 promete `ffmpeg-static`, download do yt-dlp para `~/.gdm-yoinks/bin/` e conferência com `ffmpeg -encoders`. Nada disso existe no código, e o §10 não lista como falta | incluir no §10 como "falta" |
| E10 | §6.1 | a tabela de cores está quebrada em duas por uma linha em branco. A segunda metade (logo, banda viva, letreiro) não tem cabeçalho e não é renderizada como tabela | tirar a linha em branco |
| E11 | geral | três nomes sem explicação: projeto `gdm-yoinks`, comando `gdm-extractor`, logo «G.D.M. Extractor». O `package.json` e o cabeçalho do `.mjs` também não citam o AV1 | uma frase no topo explicando os nomes; atualizar a descrição |

### 1.2. O código não faz o que a especificação diz (bugs)

| # | Especificação | O que acontece | Causa |
|---|---|---|---|
| B1 | §5.3: a pasta temporária do GIF é "apagada ao final, **inclusive em caso de erro**" | se o ffmpeg ou o yt-dlp falhar, ou se o usuário apertar Ctrl+C, a pasta `gdm-yoinks-XXXX` fica no `%TEMP%` | `falha()` chama `process.exit()` dentro do `try`, e o `finally` nunca roda. Corrigir com uma limpeza registrada em `process.on("exit")` |
| B2 | §8: "mensagens do yt-dlp perdem o prefixo `ERROR: [extrator] `" | só na análise. Um erro **durante o download** aparece com o prefixo | `baixa()` não aplica o `replace` que `analisa()` aplica |
| B3 | §6.2: "`cancelado.` só aparece se nada foi extraído" | Ctrl+C na tela cheia, depois de uma ou mais extrações, imprime os arquivos **e** `cancelado.` | `TelaCheia.tecla()` imprime sem olhar o `historico` |
| B4 | §3.2: argumento inválido → código 2 | `-o` sem valor mostra um stack trace de `mkdirSync` com código 1 (testado). `--formato` sem valor é ignorado e abre o menu | `leArgs` não confere se o `argv[++i]` existe |
| B5 | §2.1: post com várias mídias → usa a primeira | a análise usa a primeira, mas o download não restringe o item. **Não testado**, mas o provável é baixar todas as mídias e devolver só uma | falta `--playlist-items 1` (ou `N` com `…/video/N`) em `baixa()` |
| B6 | §3.3: o GIF do YouTube usa o mesmo nome do WEBM | o `nomeDoGif` troca caracteres proibidos por `_`, e o yt-dlp troca pelos equivalentes de largura total (`:` → `：`, `"` → `＂`). Um título com `:` gera nomes diferentes para o WEBM e para o GIF | dois sanitizadores diferentes. Dá para pedir o nome ao yt-dlp com `--print filename` |
| B7 | §6: "o ffprobe é obrigatório" | sem ffprobe, o cartão de um GIF do X mostra `?` em tudo, sem aviso | `sondaRemoto` engole o erro. Avisar uma vez que o ffprobe não foi encontrado |

### 1.3. O que falta na especificação

- ~~**Decisão do re-encode maior que a fonte (§9).**~~ Resolvido pelo F1 em 2026-11-05.
- **Arquivo de destino que já existe.** Desde o D1, o WEBM também sobrescreve, como o GIF (antes o
  yt-dlp pulava o download). Falta a especificação dizer se isso é o certo ou se deveria perguntar.
- **Cancelamento no meio do download.** O yt-dlp deixa `.part` e `.ytdl` na pasta de destino. A
  especificação não diz se o programa deve apagá-los.
- **Plataformas.** O §3.1 fala só de `Get-Clipboard`, mas o código já trata macOS (`pbpaste`) e
  Linux (`wl-paste`/`xclip`). Os caminhos do §6 são todos `.exe`. Falta dizer se macOS e Linux são
  suportados.
- **Arquivos do repositório.** O `package.json` declara GPL-3.0, mas não há `LICENSE`. Também
  não há `README.md` nem `.gitignore` (a pasta `x/` vazia está solta no repo).
- **Testes.** Só existem testes manuais (§7). Os padrões de URL (§2) poderiam ter testes
  automáticos com `node --test`, sem rede.
- **Tabela do §10.** Faltam as dependências do §6 (fallbacks e conferência de encoders) e a
  correção da contradição do E8.

---

## Parte 2 — Ideias

Prioridade: **alta** = resolve um problema que já existe; **média** = melhora o uso do dia a dia;
**baixa** = "seria legal".
Esforço: **P** (até 1 h), **M** (uma tarde), **G** (mais de um dia).

### 2.1. Funcionalidade

| # | Ideia | Prioridade | Esforço |
|---|---|---|---|
| F1 | ~~CRF adaptativo para fontes H.264~~ (feito) | alta | M |
| F2 | Limite de tamanho (`--max-mb`) | alta | M |
| F3 | Recorte de trecho (`--inicio`, `--duracao`) | alta | M |
| F4 | Escolher a mídia em posts com várias | média | M |
| F5 | Copiar o resultado para a área de transferência | média | P |
| F6 | Abrir a pasta ou o arquivo no fim | média | P |
| F7 | Mais formas de URL | média | P |
| F8 | Login por cookies do navegador | média | P |
| F9 | ~~AV1 rápido com SVT-AV1~~ (feito, não testado) | média | P |
| F10 | Fila de links | média | M |
| F11 | Vigiar a área de transferência | baixa | M |
| F12 | Formato MP4 de compatibilidade | baixa | P |
| F13 | Arquivo de configuração | baixa | P |
| F14 | Lembrete de atualizar o yt-dlp | baixa | P |
| F15 | Estimativa do GIF por amostra | baixa | M |
| F16 | Baixar fotos de posts sem vídeo | baixa | M |

**F1. CRF adaptativo para fontes H.264.** Resolve o §9 pela opção (c). A análise já sabe o
bitrate da fonte (`tbr`). No re-encode, passar `-maxrate` igual ao bitrate de vídeo da fonte
(com `-bufsize` igual a 2× esse valor) junto do `-crf 36`. Assim o VP9 nunca gasta mais bits que
o H.264 original, e o arquivo continua webm. Fontes leves ficam menores, e fontes boas não perdem
nada. Medir com o vídeo do X do §7.

> **Feito em 2026-11-05.** O teto vem do bitrate **medido** no arquivo baixado (soma dos pacotes
> de vídeo), não do `tbr`, que no HLS do X é o nominal (764 kbps contra 633 reais). No VP9 o
> teto é o `-b:v` do modo «constrained quality» (o `-maxrate` não faz efeito com `-b:v 0`):
> 4.9 MB → 3.5 MB. No libaom o `-b:v` vira alvo e aumenta o arquivo, então ele só refaz com teto
> se passar da fonte (§4.1).

**F2. Limite de tamanho.** `--max-mb 10` (ou uma tecla no menu, "caber no Discord"). Calcula o
bitrate alvo com `(tamanho × 8 − áudio) / duração` e faz VP9 em duas passadas (`-pass 1/2`).
No GIF, reduz fps e largura até a estimativa do §5.4 caber no limite. É o uso mais comum de quem
baixa um clipe para mandar em chat.

**F3. Recorte de trecho.** Já está nos pontos em aberto (§9). Com `--inicio 1:23 --duracao 5`,
usar `--download-sections "*1:23-1:28"` do yt-dlp, que baixa só o trecho. Bônus: o `&t=90s`
da URL do YouTube, que hoje é ignorado (§2.2), vira o início padrão quando o formato é GIF.

**F4. Escolher a mídia em posts com várias.** Hoje o cartão avisa `post tem N mídias; usando a
primeira`. Em vez disso, um submenu com as N mídias (tipo, duração, dimensões) antes do menu de
formato, respeitando o `…/video/N` da URL. Corrige o B5 de quebra.

**F5. Copiar o resultado.** No «pronto», a tecla `c` copia o **arquivo** para a área de
transferência (`Set-Clipboard -Path` no Windows), pronto para colar no Discord ou no WhatsApp
Web. `C` copia só o caminho.

**F6. Abrir no fim.** No «pronto», `o` abre o Explorer com o arquivo selecionado
(`explorer /select,<arquivo>`) e `a` abre o arquivo no programa padrão.

**F7. Mais formas de URL.** Aceitar os espelhos do X que o pessoal compartilha (`fxtwitter.com`,
`vxtwitter.com`, `fixupx.com`, `fixvx.com`), convertendo para `x.com` antes do yt-dlp. Também
`music.youtube.com/watch?v=` e `youtube-nocookie.com/embed/`.

**F8. Login por cookies.** `--cookies-from <navegador>`, repassado como
`--cookies-from-browser` ao yt-dlp, para posts com conteúdo sensível (§9). Quando o yt-dlp
pedir login, o erro sugere a opção.

**F9. AV1 rápido.** Se o ffmpeg tiver `libsvtav1` (`ffmpeg -encoders`), usar esse encoder em
vez do `libaom-av1`. Ele é bem mais rápido com tamanho parecido. O ffmpeg essentials instalado
hoje não tem SVT-AV1, então o `libaom` continua como reserva.

> **Feito em 2026-11-05, não testado**: falta um ffmpeg com `libsvtav1` para conferir. Usa
> `-crf 38 -preset 8` e o teto do F1 como «capped CRF» (`-maxrate`).

**F10. Fila de links.** Aceitar várias URLs nos argumentos ou um arquivo (`--lista links.txt`),
com o mesmo formato para todos. Na tela cheia, colar vários links de uma vez (um por linha) monta
a fila, e o palco mostra `2/5`.

**F11. Vigiar a área de transferência.** `--vigiar`: fica aberto e, a cada link válido copiado,
extrai no formato padrão sem perguntar. Combina com a tela cheia e com o Jogo da Vida rodando ao
fundo.

**F12. Formato MP4 de compatibilidade.** O WEBM não toca no WhatsApp nem no iPhone. Uma opção
`mp4` (H.264 + AAC, `-crf 28 -preset slow`, `+faststart`) para esses casos. Contraria o "sempre
webm" do §1, então entraria como formato separado no menu.

**F13. Arquivo de configuração.** `~/.gdm-yoinks.json` com os padrões (`saida`, `formato`,
`gifFps`, `gifLargura`). Os argumentos continuam com prioridade.

**F14. Lembrete de atualizar o yt-dlp.** O extrator do X quebra com frequência. Se o yt-dlp
tiver mais de 60 dias (a versão é a data), avisar no cartão. Se a análise falhar, sugerir
`yt-dlp -U`.

**F15. Estimativa do GIF por amostra.** Já está nos pontos em aberto (§9). Converter 1 s do
meio do vídeo e multiplicar pela duração. É mais lento que o fator fixo, então só valeria para
vídeos longos, que é onde o erro custa mais caro.

**F16. Fotos de posts sem vídeo.** Hoje um post só com foto sai com erro (§2.1). Poderia baixar
as fotos na resolução original (`?name=orig`), como faz a opção de imagem do yoinks.

### 2.2. Decoração

| # | Ideia | Prioridade | Esforço |
|---|---|---|---|
| D1 | ~~Progresso real do re-encode~~ (feito) | alta | M |
| D2 | Velocidade e tempo restante no download | média | P |
| D3 | Progresso na barra de tarefas do Windows | média | P |
| D4 | Caminho clicável | média | P |
| D5 | Prévia do vídeo em meia célula | média | M |
| D6 | Comparação de tamanho em barra | baixa | P |
| D7 | Título da janela com a fase | baixa | P |
| D8 | Outros temas do sistemaGDM | baixa | M |

**D1. Progresso real do re-encode.** Hoje o re-encode WEBM mostra só um spinner, e um vídeo de
42 s demora bastante. Rodar o ffmpeg direto (sem o `--recode-video` do yt-dlp) permite usar
`-progress pipe:1`, como o GIF já faz, e mostrar barra e porcentagem também no WEBM e no AV1.

> **Feito em 2026-11-05.** O yt-dlp baixa para uma pasta temporária, e o ffmpeg re-encoda com a
> barra `re-encodando` e a velocidade (`VP9 1.6x`). VP9 nativo é só movido.

**D2. Velocidade e tempo restante.** O `--progress-template` já tem `progress.speed` e
`progress.eta`. Mostrar `1.2 MB/s · 4 s` ao lado da barra.

**D3. Progresso na barra de tarefas.** O Windows Terminal entende `ESC ] 9 ; 4 ; 1 ; <0–100> BEL`
e pinta o ícone da barra de tarefas com a porcentagem (em vermelho no erro, com `;2;`). Permite
acompanhar o download com o terminal minimizado.

**D4. Caminho clicável.** Envolver o caminho final num hyperlink OSC 8
(`ESC ] 8 ;; file:///… ESC \`). No Windows Terminal, Ctrl+clique abre o arquivo.

**D5. Prévia do vídeo em meia célula.** Extrair um quadro do meio do vídeo com
`ffmpeg -ss <meio> -frames:v 1 -vf scale=24:-2 -f rawvideo -pix_fmt rgb24` e desenhar ao lado do
cartão com `▀`, a mesma técnica do logo (§6.3), em truecolor. São 24×12 células para ver o que
vai ser baixado.

**D6. Comparação de tamanho.** No «pronto», duas barras proporcionais (fonte × resultado) com a
diferença em porcentagem (`−42%` em `--acento`, `+27%` em `--perigo`). Deixa claro quando o
re-encode piorou (§9).

**D7. Título da janela.** `ESC ] 0 ; gdm-extractor · baixando 42% BEL`, para a aba do terminal
mostrar a fase.

**D8. Outros temas.** `--tema` com as outras paletas do `sistemaGDM/docs/paleta.md`, se houver,
mantendo os nomes de token do §6.1.

### 2.3. Divertido

| # | Ideia | Esforço |
|---|---|---|
| X1 | Glider de comemoração | P |
| X2 | Caçar o `7` | M |
| X3 | Letreiro que se traduz | P |
| X4 | A vida reage à fase | M |
| X5 | ~~O logo nasce da vida~~ (feito) | M |
| X6 | Controles da vida | P |
| X7 | Datas especiais | P |
| X8 | Modo zen | P |
| X9 | Estatísticas de economia | P |

**X1. Glider de comemoração.** Ao terminar uma extração, um glider (ou uma esquadrilha deles) em
`--p4` nasce no botão e atravessa a tela na diagonal até sumir na borda. No erro, a população
inteira morre de uma vez, com o rastro `·` esfriando.

**X2. Caçar o `7`.** Apertar `7` enquanto o `7` escondido (§6.3) está na tela "pega" ele: a
célula pisca em `--pico`, e um contador em `~/.gdm-yoinks/setes` guarda quantos você já achou.
Com 7, 77 e 777, uma mensagem nova no letreiro.

**X3. Letreiro que se traduz.** Segurar `b` (fora do campo de URL) troca o binário do letreiro
por «please be nice» legível, letra por letra, como se estivesse sendo decodificado. Soltar volta
ao binário. Funciona também na linha do logo («G.D.M. Extractor»).

**X4. A vida reage à fase.** Durante o download, os respingos nascem perto da barra de progresso,
e a densidade acompanha a velocidade. Na análise, a vida desacelera para 3 gerações por segundo,
como se estivesse "pensando".

**X5. O logo nasce da vida.** Na abertura, as letras do logo começam como células soltas
espalhadas pela tela e convergem para o desenho do `logo.md` em cerca de 1 s. Pular com qualquer
tecla.

> **Feito em 2026-11-05** (§6.3, detalhes em `X5-Implement.md`). As células soltas são células
> vivas de verdade, tiradas da vida no instante da abertura.

**X6. Controles da vida.** Fora do campo de URL: `espaço` pausa, `+`/`−` mudam a velocidade e `r`
joga um respingo. São pequenos, mas convidam a mexer enquanto o re-encode roda.

**X7. Datas especiais.** No aniversário de Conway (26/12), o letreiro diz «happy birthday john»
em binário. No dia 31/10, a vida usa um laranja em vez do verde. No 1º de abril, as regras viram
B36/S23 (HighLife), que tem replicadores.

**X8. Modo zen.** `gdm-extractor --zen`: só o Jogo da Vida e o letreiro em tela cheia, sem
interface. Qualquer tecla sai. Um protetor de tela para o terminal.

**X9. Estatísticas de economia.** Um contador em `~/.gdm-yoinks/` com o total baixado e o total
economizado em relação às fontes. De vez em quando o «pronto» mostra
`você já economizou 312 MB · 216 disquetes`.

---

## Sugestão de ordem

1. ~~Corrigir a especificação (E1–E11) e os bugs B1–B7.~~ Feito em 2026-11-05.
2. ~~**F1** (CRF adaptativo), que fecha o ponto em aberto mais grave do §9.~~ Feito em 2026-11-05.
3. **D1** + **D2** (progresso real), que melhoram justamente a parte mais demorada. D1 feito em
   2026-11-05 (junto com o F9).
4. **F5** + **F6** + **D4** (copiar e abrir no fim), pequenos e de uso diário.
5. **F2** e **F3** (limite de tamanho e recorte), as maiores do lote.
6. As do Divertido entram nos intervalos. **X1** e **X3** são as mais baratas.
