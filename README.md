# gdm-yoinks

Baixa mídia do **X/Twitter** e do **YouTube** no terminal e entrega o arquivo no menor tamanho
possível, em um de três formatos:

| Formato | Vídeo | Áudio | Limite | Quando usar |
|---|---|---|---|---|
| **WEBM** | VP9 | Opus | até 720p | o padrão: arquivo pequeno, rápido de gerar |
| **WEBM AV1** | AV1 | Opus | até 720p | arquivo ainda menor, re-encode mais lento (nome com sufixo `_av1`) |
| **GIF** | GIF com paleta própria | — | 480 px de largura, 15 fps (configurável) | reações e trechos curtos, em loop infinito |

Qualquer formato pode ser só um **trecho** do vídeo (`--inicio`, `--fim`, `--duracao`, ou a
tecla `r` no menu).

Nomes: **gdm-yoinks** é o projeto e o repositório, **gdm-extractor** é o comando instalado e
«G.D.M. Extractor» é o que o logo diz.

> **Protótipo** (v0.1.0). O comportamento completo está na
> [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md), e o §10 dela lista o que já foi feito.

## Dependências

O `gdm-extractor` não tem dependências npm. Ele chama programas externos, que precisam estar
no PATH:

| Software | Para quê | Obrigatório |
|---|---|---|
| [Node.js](https://nodejs.org/) ≥ 18 | roda o programa | sim |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | lê as informações e baixa a mídia | sim |
| [FFmpeg](https://ffmpeg.org/) (`ffmpeg` e `ffprobe`) | junta, re-encoda e converte para GIF | sim |
| [Deno](https://deno.com/) | runtime JavaScript que o yt-dlp usa para o YouTube ([detalhes](https://github.com/yt-dlp/yt-dlp/wiki/EJS)) | só para o YouTube |
| [wl-clipboard](https://github.com/bugaevc/wl-clipboard) ou [xclip](https://github.com/astrand/xclip) | colar a URL com Tab (Linux, Wayland ou X11) | não |

O FFmpeg precisa dos codificadores `libvpx-vp9`, `libopus` e `gif`, e de `libsvtav1` ou
`libaom-av1` para o AV1 (o SVT-AV1 é bem mais rápido e é o preferido quando existe). Para
conferir:

```sh
ffmpeg -hide_banner -encoders | grep -E "libvpx-vp9|libsvtav1|libaom-av1|libopus| gif "
```

No Windows, o PowerShell usa `Select-String` no lugar do `grep`. Os builds "essentials" do
FFmpeg para Windows costumam vir sem o `libsvtav1`. O AV1 funciona, só fica mais lento.

### Windows (10 ou mais novo)

```powershell
winget install OpenJS.NodeJS.LTS yt-dlp.yt-dlp Gyan.FFmpeg DenoLand.Deno
```

Os binários também podem ser baixados direto das páginas oficiais: [Node.js](https://nodejs.org/en/download),
[yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest), [FFmpeg](https://ffmpeg.org/download.html#build-windows)
e [Deno](https://docs.deno.com/runtime/getting_started/installation/). Para a tela cheia, use
o [Windows Terminal](https://github.com/microsoft/terminal), que já vem no Windows 11.

### Arch Linux

```sh
sudo pacman -S nodejs yt-dlp ffmpeg deno wl-clipboard   # ou xclip no X11
```

O `ffmpeg` do repositório `extra` já tem todos os codificadores.

## Instalação

### Windows 10 ou mais novo: instalador

O `gdm-extractor-<versão>-setup.exe` já traz o Node, o yt-dlp e o ffmpeg (com SVT-AV1), então
não é preciso instalar nada antes. Ele instala sem pedir admin, em
`%LOCALAPPDATA%\Programs\gdm-yoinks`, põe o comando no PATH, cria o atalho no Menu Iniciar
e pergunta a pasta de saída e o formato padrão. Depois, abra um terminal **novo** e digite
`gdm-extractor`. O setup ainda não é assinado, então o Windows pode mostrar o aviso do
SmartScreen ("o Windows protegeu o computador" → "Mais informações" → "Executar assim mesmo").

Para gerar o instalador (precisa do [Inno Setup 6](https://jrsoftware.org/isinfo.php)):

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

O build baixa as versões fixadas em `installer/versoes.json`, confere o SHA-256 e os
encoders, roda os testes e gera `installer\saida\gdm-extractor-<versão>-setup.exe`.

### Windows 7 SP1: instalador win7 (experimental)

O `gdm-extractor-<versão>-win7-setup.exe` é o mesmo assistente, com versões das dependências
que ainda rodam no Windows 7. Nenhuma delas é oficial: são forks e builds da comunidade.

| No Windows 10+ | No Windows 7 |
|---|---|
| Node 22 oficial | Node 20 do [`vladimir-andreevich/node.js-windows-7`](https://github.com/vladimir-andreevich/node.js-windows-7) |
| yt-dlp oficial | `yt-dlp_win7.exe` do [`nicolaasjan/yt-dlp`](https://github.com/nicolaasjan/yt-dlp/releases) |
| o próprio Node como runtime JS do YouTube | [QuickJS-NG](https://github.com/quickjs-ng/quickjs) (`tools\qjs.exe`) |
| ffmpeg do BtbN, com SVT-AV1 | ffmpeg "essentials" do [gyan.dev](https://www.gyan.dev/ffmpeg/builds/): o AV1 sai pelo `libaom`, mais lento |

Antes de instalar, o Windows 7 precisa do Service Pack 1 e do Universal C Runtime
([KB2999226](https://support.microsoft.com/kb/2999226)); o assistente confere e avisa. Não há
"atualizar o yt-dlp": o `-U` do fork pode trazer o `yt-dlp.exe` comum, que só roda no 10. Para
atualizar, rode um instalador win7 mais novo ou troque o `tools\yt-dlp.exe` pelo
`yt-dlp_win7.exe` mais recente do fork. A tela cheia não funciona no console do Windows 7, então
o programa usa o modo linha.

Para gerar: `installer\build.ps1 -Alvo win7`. Além das conferências de sempre, esse build lê os
imports de cada `.exe` e `.dll` e para se algum usar uma função do Windows 8 ou mais novo
(`installer/confere-win7.mjs`).

### Arch Linux: pacote

```sh
cd installer/linux
makepkg -si
```

O `PKGBUILD` instala as dependências pelo pacman (`nodejs`, `yt-dlp`, `ffmpeg`), roda os
testes e cria o comando `gdm-extractor` e o atalho no menu de aplicativos.

### Pelo código-fonte (qualquer sistema)

```sh
git clone https://github.com/Mvfm-25/gdm-yoinks.git
cd gdm-yoinks
npm link
```

O `npm link` cria o comando global `gdm-extractor`. Como é um link, editar o
`gdm-yoinks.mjs` já vale para o comando, sem reinstalar. Para remover:
`npm unlink -g gdm-extractor`. Nesse caso, as dependências da seção anterior precisam estar
no PATH.

Para conferir qualquer instalação: `gdm-extractor --diagnostico`. Ele mostra cada
ferramenta, de onde ela veio e os encoders do ffmpeg, e sai com código `1` se faltar algo.

## Uso

```sh
gdm-extractor                                            # pede o link (Tab cola o da área de transferência)
gdm-extractor https://x.com/usuario/status/123           # abre o menu de formato
gdm-extractor https://youtu.be/abc --formato webm -o ~/Videos
gdm-extractor https://youtu.be/abc --formato gif --inicio 1:23 --duracao 5
```

| Opção | Padrão | Descrição |
|---|---|---|
| `-o, --out <pasta>` | `~/Downloads` | pasta de destino |
| `--formato webm\|av1\|gif` | menu | pula o menu (obrigatório sem terminal interativo) |
| `--gif-fps <n>` | `15` | teto de quadros por segundo do GIF |
| `--gif-largura <n>` | `480` | largura máxima do GIF em px |
| `--inicio <tempo>` | `0` | início do trecho (`83`, `90s`, `1:23` ou `1:02:03`) |
| `--fim <tempo>` | fim do vídeo | fim do trecho |
| `--duracao <tempo>` | — | duração do trecho, no lugar do `--fim` |
| `--configurar` | — | pasta de saída e formato padrão (pergunta; com `-o`/`--formato`, grava sem perguntar) |
| `--diagnostico` | — | mostra as ferramentas e os encoders encontrados |
| `-h, --help` / `-v, --version` | — | ajuda / versão |

Os padrões ficam em `~/.gdm-yoinks/config.json` no Windows e em `~/.config/gdm-yoinks/config.json`
no Linux. Na primeira execução sem argumentos, o programa pergunta a pasta e o formato. Para
usar outra ferramenta, defina `GDM_YOINKS_YT_DLP`, `GDM_YOINKS_FFMPEG`, `GDM_YOINKS_FFPROBE` ou
`GDM_YOINKS_JS` com o caminho dela.

Com `--formato gif`, o `&t=` de um link do YouTube vira o início de um trecho de 10 s. No menu:
`↑`/`↓` (ou `j`/`k`) e `Enter` escolhem, `r` abre o recorte e `Esc`/`q` cancelam. Com
`NO_COLOR` definido, a saída sai sem cores.

**Links aceitos:** posts do X/Twitter (`x.com`, `twitter.com`, `…/video/N`) e vídeos do YouTube
(`watch?v=`, `youtu.be`, Shorts, `embed`, `live` gravado). Playlists, canais e transmissões em
andamento são recusados. Os detalhes estão no §2 da especificação.

**Códigos de saída:** `0` sucesso ou cancelado, `1` erro do yt-dlp/ffmpeg, `2` argumento ou URL
inválida, `130` Ctrl+C.

## Testes

```sh
npm test
```

Roda os testes de `tests/` com o `node --test`. Eles cobrem as funções de tempo do recorte
(`tempo.mjs`), a resolução das ferramentas (`ferramentas.mjs`), a configuração (`config.mjs`) e
a versão do `package.json`.

## Documentação

- [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md): comportamento completo, formatos, erros e
  estado do protótipo.
- [`docs/IDEIAS.md`](docs/IDEIAS.md): revisão da especificação e ideias de funcionalidades.
- [`docs/Instalador-Implement.md`](docs/Instalador-Implement.md): instalador para Windows,
  pacote para o Arch e instalador do Windows 7 (experimental). Os scripts ficam em `installer/`.
- [`docs/F3-Implement.md`](docs/F3-Implement.md), [`docs/X5-Implement.md`](docs/X5-Implement.md):
  propostas de implementação de funcionalidades.

## Inspiração: Yoinks

O gdm-yoinks nasceu do [**Yoinks**](https://github.com/pablostanley/yoinks), de
[Pablo Stanley](https://github.com/pablostanley), um baixador de vídeos para o terminal feito
com o yt-dlp ("paste. yoink. done."). Daí vêm o nome e a ideia de colar o link e já sair com
o arquivo. O campo de URL que oferece o link da área de transferência e a interface em tela
cheia seguem o estilo dele.

A diferença é o foco. O Yoinks baixa de mais de 1800 sites no formato original. O gdm-yoinks
cuida só do X e do YouTube e entrega o **menor arquivo possível** em WEBM (VP9 ou AV1) ou GIF.

O `patch-yoinks.mjs` adiciona o formato WEBM ao menu de um Yoinks já instalado
(`npm i -g yoinks`):

```sh
node patch-yoinks.mjs          # aplica (rodar de novo depois de um npm update)
node patch-yoinks.mjs --undo   # volta ao original
```

O código do gdm-yoinks é próprio. O Yoinks é distribuído sob a
[licença MIT](https://github.com/pablostanley/yoinks/blob/main/LICENSE) e não é incluído neste
repositório.

## Licença

[GPL-3.0-or-later](LICENSE). Você pode usar, estudar, modificar e redistribuir o programa,
desde que as versões redistribuídas continuem sob a GPL e com o código-fonte disponível.

As dependências são programas separados, cada um com a sua licença: Node.js
([MIT](https://github.com/nodejs/node/blob/main/LICENSE)), yt-dlp
([Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE)), FFmpeg
([LGPL-2.1+ ou GPL, conforme o build](https://ffmpeg.org/legal.html)) e Deno
([MIT](https://github.com/denoland/deno/blob/main/LICENSE.md)).

## Aviso

Use o programa só com conteúdo que você tem direito de baixar, respeitando os termos de uso do
X e do YouTube e os direitos autorais de quem publicou.
