# Instalador: proposta de implementação

Proposta de um instalador com assistente (wizard) para o `gdm-extractor` no Windows
(2026-11-06). Ele traz todas as dependências, faz a configuração inicial e põe o comando no
PATH. As referências `§N` apontam para a `ESPECIFICACAO.md`.

> **Implementada em 2026-11-06** para Windows 10+ e Arch (seção 14 tem o que foi feito, as
> decisões e o que ficou pendente). O instalador do Windows 7 (seção 11.2) veio no mesmo dia,
> como experimental (seção 14.5). As seções 1 a 8 tratam do Windows 10+ (x64), o alvo principal.
> A seção 9 traz os ajustes do Windows 10+, a 10 o pacote para o Arch Linux e a 11 a análise do
> Windows 7, com as dependências que ele exigiria. macOS e as outras distribuições continuam
> com o `npm link` do §3.

Hoje, para usar o programa, é preciso ter Node ≥ 18, yt-dlp, ffmpeg e ffprobe no PATH, clonar
o repositório e rodar `npm link`. O §6 promete fallbacks (baixar o yt-dlp, `ffmpeg-static`,
conferir `ffmpeg -encoders`) que o §10 marca como **falta**. O instalador resolve as duas
coisas: quem instala não precisa de nada antes, e o programa passa a saber onde estão as
ferramentas que ele mesmo trouxe.

A implementação se divide em quatro camadas: mudanças no código (para o programa achar as
ferramentas instaladas), o layout da instalação, o assistente em si e o build.

---

## 1. Escolhas principais

| Peça | Escolha | Por quê |
|---|---|---|
| Gerador do instalador | **Inno Setup 6** | gratuito, gera um `setup.exe` com assistente clássico, tem tradução `BrazilianPortuguese` oficial, instala sem admin e mexe no PATH do usuário com poucas linhas. NSIS e WiX (MSI) fazem o mesmo com bem mais trabalho; MSIX não deixa mexer no PATH |
| Escopo | **por usuário**, sem admin | `%LOCALAPPDATA%\Programs\gdm-yoinks`, como o VS Code e o Windows Terminal fazem. O `yt-dlp -U` consegue se atualizar sem UAC. Uma instalação para todos os usuários fica como opção do próprio Inno (`PrivilegesRequiredOverridesAllowed=dialog`) |
| Node | **`node.exe` portátil embutido** | o `node.exe` do zip oficial (`node-v22.x-win-x64.zip`), sem npm. Não depende do Node do sistema nem conflita com ele |
| yt-dlp | **`yt-dlp.exe` embutido**, atualizado no fim | o executável oficial. Ele envelhece rápido (§F14 do `IDEIAS.md`), então o assistente oferece rodar `yt-dlp -U` no fim |
| ffmpeg / ffprobe | **build GPL *shared* com `libsvtav1`** (BtbN) | `ffmpeg.exe`, `ffprobe.exe` e as DLLs que os dois dividem. No build estático, cada `.exe` traz uma cópia inteira das bibliotecas, e o instalador ficaria com quase o dobro do tamanho. Com o SVT-AV1 o F9 finalmente pode ser testado (§10). O build do instalador confere os encoders exigidos pelo §6 |
| Tipo de pacote | **offline** (tudo dentro do `setup.exe`) | instala sem internet. A única coisa que usa a rede é o `yt-dlp -U` opcional |

O `.mjs` continua sendo o programa: o instalador não compila nada, só leva o runtime e as
ferramentas para perto dele.

## 2. Mudanças no código (`gdm-yoinks.mjs`)

Hoje o `roda()` chama `"ffmpeg"`, `"ffprobe"` e o retorno de `achaYtDlp()` pelo nome, e o
yt-dlp acha o ffmpeg sozinho pelo PATH. Numa instalação, as ferramentas embutidas **não** vão
para o PATH (seção 3), então o programa precisa resolvê-las.

### 2.1. Resolução das ferramentas

Uma função nova, `resolveFerramentas()`, chamada uma vez no `main`, devolve
`{ ytdlp, ffmpeg, ffprobe, origem }` com caminhos absolutos. Ordem de busca para cada uma:

1. **Variável de ambiente** `GDM_YOINKS_<NOME>` (ex.: `GDM_YOINKS_FFMPEG`), para depurar.
2. **Config** (`ferramentas.ffmpeg` etc., seção 2.3).
3. **Embutida:** `<pasta do .mjs>\..\tools\<nome>.exe`, que só existe numa instalação.
4. **PATH** (o `temNoPath` que já existe).
5. **yoinks:** `~/.yoinks/bin/yt-dlp.exe`, só para o yt-dlp (o comportamento de hoje).

A embutida vem antes do PATH porque é a combinação testada (ver decisões em aberto). Fora de
uma instalação (rodando do repositório com `npm link`) o passo 3 não acha nada e tudo funciona
como hoje.

Pontos afetados:

- Toda chamada `roda("ffmpeg", …)` e `roda("ffprobe", …)` passa a usar `F.ffmpeg` e
  `F.ffprobe`, inclusive o `leEncoders()`.
- `baixa()` passa `--ffmpeg-location <pasta do ffmpeg>` ao yt-dlp. É o que o §4 já descreve e
  hoje não é feito. Sem isso, o yt-dlp embutido não acharia o ffmpeg embutido para juntar áudio
  e vídeo nem para o `--download-sections` do F3.
- `achaYtDlp()` é absorvida pela `resolveFerramentas()`.

### 2.2. `--diagnostico`

Uma opção nova que imprime o que foi resolvido e sai com `0` se estiver tudo certo:

```
gdm-extractor 0.2.0 · node 22.x
yt-dlp   2026.10.xx   C:\Users\…\Programs\gdm-yoinks\tools\yt-dlp.exe   (embutido)
ffmpeg   7.1          C:\Users\…\Programs\gdm-yoinks\tools\ffmpeg.exe    (embutido)
ffprobe  7.1          C:\Users\…\Programs\gdm-yoinks\tools\ffprobe.exe   (embutido)
encoders libvpx-vp9 ✓  libaom-av1 ✓  libsvtav1 ✓  libopus ✓  gif ✓
config   C:\Users\…\.gdm-yoinks\config.json
```

Falta de ferramenta ou de encoder obrigatório sai com código `1` e diz qual. O assistente roda
isso no fim da instalação (seção 4.3), e serve também para quem abrir uma issue. Fecha o item
"conferir `ffmpeg -encoders`" do §10.

### 2.3. Arquivo de configuração (o F13, em versão mínima)

A configuração inicial do assistente precisa de um lugar para morar, e é o F13 do `IDEIAS.md`.
Só o necessário para o instalador:

```json
{
  "versao": 1,
  "saida": "C:\\Users\\…\\Downloads",
  "formato": null,
  "gifFps": 15,
  "gifLargura": 480,
  "verificarYtDlp": true
}
```

- Lido no início do `leArgs`, antes dos argumentos, que continuam com prioridade.
- `formato: null` mantém o menu; `"webm"`, `"av1"` ou `"gif"` pulam o menu como o `--formato`.
- Arquivo ausente ou JSON inválido: usa os padrões de hoje, com um aviso no cartão no segundo
  caso (nunca falha por causa da config).
- Chaves desconhecidas são ignoradas, para uma versão nova do instalador poder gravar chaves
  que uma versão velha do programa não conhece.
- Local: `~/.gdm-yoinks/config.json` no Windows. No Linux, `$XDG_CONFIG_HOME/gdm-yoinks/`
  (padrão `~/.config/gdm-yoinks/`), que é a convenção lá (seção 10).

### 2.4. A configuração inicial é do programa: `--configurar`

A página de configuração (seção 4.2) não é escrita no `[Code]` do Inno, que só existe no
Windows. Ela vira uma tela do próprio programa, `gdm-extractor --configurar`, feita com os
mesmos componentes do menu de formato:

- roda sozinha na primeira execução, quando falta o `config.json`;
- serve igual para o Windows (o assistente a chama no fim) e para o Arch (que não tem
  assistente);
- grava o JSON pelo Node, sem escape à mão. Isso fecha a decisão em aberto "quem escreve o
  `config.json`" (seção 13).

O Inno mantém uma página própria, com a pasta de saída e o formato padrão, e passa as respostas
como argumentos: `--configurar --saida=… --formato=…` (modo não interativo). Quem quiser
mudar depois roda `gdm-extractor --configurar` de novo.

### 2.5. Nomes das ferramentas em cada sistema

O `.exe` não pode ficar fixo. Hoje o `achaYtDlp()` monta `~/.yoinks/bin/yt-dlp.exe` e o
`temNoPath` só olha a extensão. A `resolveFerramentas()`:

- acrescenta `.exe` só no `win32` (nos passos 3 e 5 da seção 2.1);
- no Linux, exige que o arquivo achado no PATH seja executável (`fs.accessSync(…, X_OK)`),
  em vez de só existir;
- guarda a **origem** de cada uma (`env`, `config`, `embutida`, `path`, `yoinks`, `sistema`).
  O `--diagnostico` mostra essa origem, e o aviso de yt-dlp desatualizado só aparece quando
  dá para atualizar (seção 10.3).

### 2.6. Runtime JavaScript do yt-dlp

Desde novembro de 2025, o yt-dlp precisa de um runtime JavaScript externo para o YouTube (o
EJS). Os aceitos são Deno ≥ 2.3 (o único ligado por padrão), Node ≥ 22, QuickJS-NG e Bun
(descontinuado). Sem um deles, os vídeos do YouTube falham ou saem em formatos piores. O X não
precisa.

- **Windows:** o `node.exe` que o instalador já leva serve. O `baixa()` passa
  `--js-runtimes node:<caminho do node.exe>`, usando o `process.execPath` (o Node que está
  rodando o programa), sem dependência nova. Isso exige que o Node embutido seja **22 ou
  maior**, o que o plano já faz.
- **Linux:** o mesmo `process.execPath` serve, se o `nodejs` do sistema for ≥ 22 (no Arch é).
- **Fora dessas versões:** o `--diagnostico` avisa "sem runtime JS: YouTube pode falhar".
  A ordem de busca é a da 2.1 com `GDM_YOINKS_JS`, e a config ganha `ferramentas.js`.

## 3. Layout da instalação

```
%LOCALAPPDATA%\Programs\gdm-yoinks\
├─ bin\
│  └─ gdm-extractor.cmd        ← só esta pasta entra no PATH
├─ app\
│  ├─ gdm-yoinks.mjs
│  ├─ tempo.mjs
│  ├─ logo.md
│  └─ package.json
├─ runtime\
│  └─ node.exe
├─ tools\
│  ├─ yt-dlp.exe
│  ├─ ffmpeg.exe
│  └─ ffprobe.exe
├─ licencas\                   ← GPL-3.0 do projeto, licenças do Node, yt-dlp e ffmpeg
└─ unins000.exe

%USERPROFILE%\.gdm-yoinks\
└─ config.json                 ← criado pelo assistente, preservado na desinstalação
```

- **Só `bin\` vai para o PATH.** Se `tools\` entrasse, o `ffmpeg` embutido passaria a valer
  para todo programa do usuário e poderia esconder o ffmpeg que ele já tem (este PC tem dois).
- **`app\` mantém os nomes do repositório**, então o `logo.md` continua sendo achado pelo
  `import.meta.url`, sem mudança.
- **`~/.gdm-yoinks\`** é a pasta que o X2 e o X9 já usam no `IDEIAS.md`. O F13 sugeria
  `~/.gdm-yoinks.json`; com a pasta, fica tudo num lugar só.

### 3.1. O comando `gdm-extractor`

`bin\gdm-extractor.cmd`:

```bat
@echo off
"%~dp0..\runtime\node.exe" "%~dp0..\app\gdm-yoinks.mjs" %*
exit /b %ERRORLEVEL%
```

Funciona no cmd, no PowerShell e no Windows Terminal. O problema conhecido é o do Ctrl+C: o cmd
pergunta `Deseja finalizar o arquivo em lotes (S/N)?` depois que o Node sai. O código `130`
(§3.2) chega, mas a pergunta atrapalha a tela cheia. O `npm link` de hoje tem o mesmo problema,
porque também gera um `.cmd`.

A correção é um lançador `.exe` pequeno no lugar do `.cmd` (ver decisões em aberto). O `.cmd`
serve para a primeira versão.

### 3.2. PATH

- Gravado em `HKCU\Environment\Path` pelo registro, **nunca** com `setx` (que corta o PATH em
  1024 caracteres). O tipo do valor é mantido: `REG_EXPAND_SZ` se ele tiver `%VARIAVEL%` (ou
  ainda não existir), `REG_SZ` se não tiver. O Pascal do Inno não lê o tipo, e trocá-lo de
  `REG_SZ` para `REG_EXPAND_SZ` deixava o PATH diferente do original depois da desinstalação.
- Só acrescenta se a pasta ainda não estiver lá (comparando sem diferenciar maiúsculas e sem a
  `\` final). Reinstalar não duplica.
- O Inno avisa as outras janelas da mudança (`ChangesEnvironment=yes`, que manda
  `WM_SETTINGCHANGE`). Terminais **já abertos** não veem o PATH novo, e a página final avisa:
  "abra um terminal novo".
- A desinstalação tira só a entrada que ela pôs.

**Conflito com o `npm link`.** Se o usuário já tiver o `gdm-extractor` do `npm link`
(`%APPDATA%\npm\gdm-extractor.cmd`), os dois comandos disputam o mesmo nome e vale o que vier
primeiro no PATH. O assistente detecta o arquivo e mostra na página de configuração:
"existe um `gdm-extractor` do npm link; rode `npm unlink -g gdm-extractor` para usar o
instalado". Ele não remove sozinho, porque esse link pode ser justamente o ambiente de
desenvolvimento.

## 4. O assistente

Páginas, na ordem (textos em português; o Inno já traz o inglês se o Windows não for pt-BR):

| # | Página | Conteúdo |
|---|---|---|
| 1 | Boas-vindas | logo do `logo.md` como imagem (o «G.D.M. Extractor» em `--p4` sobre `--fundo`) e uma frase do que o programa faz |
| 2 | Licença | GPL-3.0. Pede o `LICENSE` que o §1.3 do `IDEIAS.md` diz que falta |
| 3 | Pasta | padrão `%LOCALAPPDATA%\Programs\gdm-yoinks`. Numa atualização, a página é pulada e usa a pasta da instalação anterior |
| 4 | Componentes | ver 4.1 |
| 5 | Configuração inicial | página própria (ver 4.2) |
| 6 | Tarefas | `[x] colocar gdm-extractor no PATH` · `[x] atalho no Menu Iniciar` · `[ ] atalho na área de trabalho` · `[x] atualizar o yt-dlp agora (precisa de internet)` |
| 7 | Pronto para instalar | resumo das escolhas, o padrão do Inno |
| 8 | Instalando | cópia dos arquivos, PATH, config, `yt-dlp -U` se marcado |
| 9 | Fim | resultado do `--diagnostico` (ver 4.3), `[x] abrir o gdm-extractor agora` e o aviso de abrir um terminal novo |

### 4.1. Componentes

```
[x] gdm-extractor (obrigatório)          programa e Node embutido
[x] yt-dlp
[x] ffmpeg e ffprobe (com SVT-AV1)
```

Desmarcar yt-dlp ou ffmpeg é para quem já tem os seus no PATH. Nesse caso, a página de
componentes confere (com `where`) se a ferramenta existe no sistema e, se não, avisa que o
programa não vai funcionar sem ela. O `--diagnostico` do fim confirma.

### 4.2. Configuração inicial

Uma página feita no `[Code]` do Inno (`CreateInputDirPage` + `CreateCustomPage`):

```
Onde salvar os arquivos?
[ C:\Users\mvfmf\Downloads                          ] [Procurar…]

Formato padrão
(•) perguntar sempre (menu)
( ) WEBM (VP9) · menor arquivo
( ) WEBM AV1 · ainda menor, mais lento
( ) GIF

[x] avisar quando o yt-dlp estiver desatualizado
```

- Os rótulos dos formatos são os mesmos do `opcoesDoMenu` (a lição do E6 do `IDEIAS.md`).
- **Numa atualização** a página carrega os valores do `config.json` existente e só regrava o
  que o usuário mudar. Chaves que o assistente não conhece ficam como estão.
- A pasta de saída é criada se não existir, como o `-o` já faz.
- O JSON não é escrito pelo `[Code]`: o assistente chama
  `runtime\node.exe app\gdm-yoinks.mjs --configurar --saida=… --formato=…` depois de copiar os
  arquivos (seção 2.4). Na atualização, o Inno lê os valores atuais com
  `--configurar --mostra` para preencher a página.

### 4.3. Conferência no fim

Depois de copiar tudo, o assistente roda `runtime\node.exe app\gdm-yoinks.mjs --diagnostico`
(com o caminho completo, porque o PATH novo ainda não vale para o próprio instalador) e mostra a
saída numa caixa de texto da página final:

- código `0`: "tudo pronto";
- código `1`: a saída em vermelho e o botão "copiar diagnóstico". A instalação **não** é
  desfeita, porque o problema costuma ser uma escolha do usuário (ex.: desmarcou o ffmpeg).

### 4.4. Atalhos

- **Menu Iniciar → gdm-extractor:** abre o Windows Terminal (`wt.exe`) com
  `gdm-extractor.cmd`, para a tela cheia ter truecolor e meios blocos (§6.2). Se não houver
  `wt.exe`, abre o `cmd`.
- **Menu Iniciar → Desinstalar gdm-extractor.**
- Área de trabalho: o mesmo atalho, só se marcado.

## 5. Atualização e desinstalação

- **Atualização:** o mesmo `AppId` fixo (um GUID no `.iss`), então rodar um `setup.exe` mais
  novo instala por cima. Se o `gdm-extractor` estiver aberto, o `node.exe` em uso impede a
  cópia, e o Inno pede para fechá-lo antes (`CloseApplications=yes`).
- **Versão** em um lugar só: o `build.ps1` lê a versão do `package.json` e passa para o Inno
  (`/DVersao=0.2.0`). O `VERSAO` do `.mjs` precisa bater; um teste (`node --test`) compara os
  dois.
- **Desinstalação:** remove `bin\`, `app\`, `runtime\`, `tools\`, os atalhos e a entrada do
  PATH. Pergunta se apaga também `~/.gdm-yoinks\` (config, contador do X2, estatísticas do X9);
  o padrão é **manter**. Os arquivos baixados nunca são tocados.

## 6. Build (`installer/` no repositório)

```
installer/
├─ gdm-yoinks.iss          script do Inno Setup
├─ versoes.json            versão, URL e SHA-256 de cada dependência
├─ build.ps1               baixa, confere, monta a pasta e chama o ISCC
├─ arte/                   imagens do assistente geradas do logo.md
└─ saida/                  (ignorado) setup final
```

`versoes.json`, com versões **fixas** (nada de `latest`, senão dois builds do mesmo commit dão
instaladores diferentes):

```json
{
  "node":   { "versao": "22.x.y",  "url": "https://nodejs.org/dist/v22.x.y/node-v22.x.y-win-x64.zip", "sha256": "…" },
  "ytdlp":  { "versao": "2026.xx.xx", "url": "https://github.com/yt-dlp/yt-dlp/releases/download/…/yt-dlp.exe", "sha256": "…" },
  "ffmpeg": { "versao": "7.1.x", "url": "…", "sha256": "…" }
}
```

Passos do `build.ps1`:

1. Baixa cada item para `installer/cache/` (só se ainda não estiver lá) e confere o SHA-256.
   Hash diferente para o build.
2. Monta `installer/stage/` no layout da seção 3: extrai só o `node.exe` do zip do Node e só
   `ffmpeg.exe`/`ffprobe.exe` do zip do ffmpeg.
3. **Confere os encoders:** roda `stage\tools\ffmpeg.exe -hide_banner -encoders` e exige
   `libvpx-vp9`, `libaom-av1`, `libsvtav1`, `libopus` e `gif`. Falta algum, para o build.
4. Roda `stage\runtime\node.exe stage\app\gdm-yoinks.mjs --diagnostico` (o mesmo teste do fim
   da instalação, já no build) e `npm test`.
5. Chama `ISCC.exe /DVersao=<package.json> installer\gdm-yoinks.iss`, que gera
   `installer\saida\gdm-extractor-<versão>-setup.exe`.

O `.gitignore` (que o §1.3 do `IDEIAS.md` diz que falta) ganha `installer/cache/`,
`installer/stage/` e `installer/saida/`.

**Mais tarde:** um workflow do GitHub Actions em `windows-latest` que roda o `build.ps1` a cada
tag `v*` e anexa o `setup.exe` à release do `Mvfm-25/gdm-yoinks`. Com a release no ar, um
manifesto do winget (`winget install gdm-extractor`) é pouco trabalho.

## 7. Licenças

O projeto é GPL-3.0, e o ffmpeg escolhido é um build GPL, então as licenças são compatíveis. Mas redistribuir binários tem obrigações:

- `licencas\` com o texto da GPL-3.0 do projeto, a licença do Node (MIT e as das bibliotecas
  dele, no `LICENSE` do zip), a do yt-dlp (Unlicense) e a do ffmpeg (GPL).
- A GPL do ffmpeg pede que o código-fonte correspondente esteja disponível. O mais simples é um
  `licencas\FONTES.txt` com o link exato do build usado e do seu código. Conferir o que o
  autor do build escolhido já oferece.

## 8. Testes

Este PC é Windows 11 Home, que não tem o Windows Sandbox. Opções: uma conta de usuário local
nova (sem Node nem ffmpeg no PATH dela) ou uma VM no VirtualBox com uma imagem limpa.

| Caso | O que conferir |
|---|---|
| PC limpo, sem Node, yt-dlp nem ffmpeg | instala sem admin; `gdm-extractor` funciona num terminal novo; `--diagnostico` dá `0` |
| Este PC (Node, yt-dlp e dois ffmpeg no PATH) | o programa usa os embutidos; o ffmpeg do sistema continua sendo o do PATH para os outros programas |
| `npm link` já feito | o aviso da página de configuração aparece |
| Usuário com acento ou espaço no nome (`C:\Users\João Silva`) | o `.cmd`, o `node.exe` e o yt-dlp funcionam (o mesmo tipo de problema do commit `ae42ccc`) |
| Reinstalar a mesma versão / instalar uma mais nova | PATH sem duplicata; config preservada; página de configuração com os valores antigos |
| Desinstalar | PATH limpo; config mantida ou apagada conforme a resposta |
| Ctrl+C na tela cheia, pelo atalho e pelo terminal | código `130` (§3.2), com e sem a pergunta do cmd (ver 3.1) |
| Sem internet, com "atualizar o yt-dlp" marcado | a instalação termina; o aviso diz que a atualização falhou |
| Extração de ponta a ponta (os vídeos do §7) | WEBM, AV1 com SVT-AV1 (fecha o "não testado" do §10) e GIF |
| SmartScreen | o aviso "o Windows protegeu o computador" aparece num `setup.exe` sem assinatura; documentar no README |

## 9. Windows 10+: ajustes

As seções 1 a 8 já são para este caso. O que falta definir:

- **Versão mínima:** `MinVersion=10.0.17763` (Windows 10 1809) no `.iss`. O Node 22 não roda
  abaixo do Windows 10 / Server 2016 (o Node tirou o suporte ao 8.1 em julho de 2024, porque o
  V8 passou a usar APIs que ele não tem). O 1809 é o piso do console: antes dele, o conhost
  trata mal o truecolor e a tela alternativa (`\x1b[?1049h`), e a tela cheia sai quebrada.
- **`wt.exe` nem sempre existe.** O Windows Terminal vem instalado só no Windows 11. No 10, o
  atalho da seção 4.4 cai quase sempre no `cmd`, que funciona a partir do 1809, mas sem a
  mesma qualidade de cor. A página final pode sugerir o Windows Terminal quando ele faltar.
- **ARM64 (Windows 11 em ARM):** Node e yt-dlp têm binário ARM64, e o ffmpeg com SVT-AV1
  quase nunca tem. O instalador fica só x64 (`ArchitecturesAllowed=x64compatible`), e o Windows
  em ARM o roda por emulação.
- **Modo texto puro:** se o terminal não for de confiança (conhost antigo, sem `WT_SESSION`,
  `TERM=dumb`), o programa pula a tela cheia e usa o caminho do `semCor`. Ele vale para o
  Windows 7 (seção 11) e para terminais Linux sem truecolor, então entra no passo 1 da
  seção 12.

## 10. Linux (Arch)

No Linux não há assistente: o jeito do Arch é um pacote do pacman, e quem resolve as
dependências é ele. Nada é embutido. Por isso a seção 1 não se aplica, e o que muda é pouco.

### 10.1. Pacote

Um `PKGBUILD` no AUR. `gdm-extractor` sai das tags `v*`, e `gdm-extractor-git` sai do
`master`, para testar.

```bash
pkgname=gdm-extractor
pkgver=0.2.0
pkgrel=1
pkgdesc="Baixa mídia do X/Twitter e do YouTube como WEBM (VP9/AV1) ou GIF"
arch=(any)
url="https://github.com/Mvfm-25/gdm-yoinks"
license=(GPL-3.0-only)
depends=(nodejs yt-dlp ffmpeg)
optdepends=('wl-clipboard: colar a URL da área de transferência (Wayland)'
            'xclip: colar a URL da área de transferência (X11)'
            'deno: runtime JS alternativo para o yt-dlp')
source=("$pkgname-$pkgver.tar.gz::$url/archive/v$pkgver.tar.gz")
sha256sums=('…')

check() { cd "gdm-yoinks-$pkgver"; node --test; }

package() {
  cd "gdm-yoinks-$pkgver"
  install -Dm644 gdm-yoinks.mjs tempo.mjs logo.md package.json -t "$pkgdir/usr/lib/gdm-yoinks/"
  install -Dm755 /dev/stdin "$pkgdir/usr/bin/gdm-extractor" <<'EOF'
#!/bin/sh
exec node /usr/lib/gdm-yoinks/gdm-yoinks.mjs "$@"
EOF
  install -Dm644 installer/linux/gdm-extractor.desktop -t "$pkgdir/usr/share/applications/"
  install -Dm644 LICENSE -t "$pkgdir/usr/share/licenses/$pkgname/"
}
```

- `ffmpeg` do repositório `extra` já vem com `libsvtav1`, `libaom`, `libvpx` e `libopus`: as
  exigências do §6 são atendidas sem build próprio. O `--diagnostico` confere do mesmo jeito.
- O `nodejs` do Arch acompanha a versão atual (≥ 22). Ele também serve de runtime JS do yt-dlp
  (seção 2.6), então o `deno` fica opcional.
- `arch=(any)`: o pacote só tem JavaScript e serve para x86_64 e ARM.

### 10.2. Equivalências com o Windows

| No Windows | No Arch |
|---|---|
| Inno Setup e `setup.exe` | `PKGBUILD` e `makepkg -si` (ou um AUR helper) |
| Node, yt-dlp e ffmpeg embutidos | `depends` do pacman |
| `%LOCALAPPDATA%\Programs\gdm-yoinks\app\` | `/usr/lib/gdm-yoinks/` |
| `bin\gdm-extractor.cmd` e o PATH no registro | `/usr/bin/gdm-extractor`, que já está no PATH |
| Atalho no Menu Iniciar | `gdm-extractor.desktop` com `Terminal=true` |
| Página de configuração | `gdm-extractor --configurar` na primeira execução (seção 2.4) |
| `~/.gdm-yoinks\config.json` | `~/.config/gdm-yoinks/config.json` (seção 2.3) |
| `licencas\` | `/usr/share/licenses/gdm-extractor/` |
| `versoes.json` e SHA-256 | `sha256sums` do `PKGBUILD` |
| `build.ps1` | `makepkg` (`check()` roda o `node --test`) |
| Desinstalador | `pacman -R gdm-extractor` (a config em `~` fica, como no Windows) |

O `.desktop`, em `installer/linux/`:

```ini
[Desktop Entry]
Type=Application
Name=gdm-extractor
Comment=Baixa mídia do X e do YouTube como WEBM ou GIF
Exec=gdm-extractor
Terminal=true
Categories=AudioVideo;Network;
```

### 10.3. O que muda no programa

- **Ordem de resolução:** sem embutidas, a 2.1 cai direto no PATH. A regra "embutida antes do
  PATH" só existe no Windows.
- **Sem `yt-dlp -U`:** o yt-dlp instalado pelo pacman se recusa a se atualizar, e quem o
  atualiza é o `pacman -Syu`. Com origem `sistema` (o caminho começa com `/usr/`), o aviso de
  desatualizado diz "atualize pelo gerenciador de pacotes" em vez de oferecer o `-U`.
- **Área de transferência:** o código já tenta `wl-paste` e `xclip` (por isso o `optdepends`).
  Sem nenhum dos dois, a dica do Tab só não aparece.
- **Cor:** o `semCor` passa a conferir também `COLORTERM`. O console de texto do Linux (fora
  do ambiente gráfico) não tem truecolor e cai no modo texto puro (seção 9).
- **Ctrl+C:** sem o `.cmd`, o problema da seção 3.1 não existe. O `exec` do script faz o
  `node` receber o sinal direto e sair com `130`.

### 10.4. Testes

| Caso | O que conferir |
|---|---|
| `namcap` no `PKGBUILD` e no pacote | nenhuma dependência faltando ou sobrando |
| Build em chroot limpo (`extra-x86_64-build`, do `devtools`) | o `check()` passa sem nada além dos `depends`. É o equivalente à "conta limpa" da seção 8 |
| `gdm-extractor --diagnostico` | yt-dlp, ffmpeg e ffprobe com origem `sistema`; encoders ✓; runtime JS ✓ |
| Primeira execução | abre o `--configurar`; grava em `~/.config/gdm-yoinks/` |
| Wayland e X11 | a área de transferência funciona com `wl-paste` e com `xclip` |
| Console de texto (Ctrl+Alt+F3) | modo texto puro, sem lixo de escape |
| Extração de ponta a ponta (§7) | WEBM, AV1 e GIF |

### 10.5. Outras distribuições

Fica para depois. O caminho seria um `.tar.gz` com o layout da seção 3 (Node portátil,
`yt-dlp_linux` e um ffmpeg estático), já que a resolução de ferramentas embutidas da 2.1 também
funciona no Linux. Para o Arch, o pacote é melhor.

## 11. Windows 7

O Windows 7 está sem suporte desde janeiro de 2020, e nenhuma dependência do plano tem versão
**oficial** atual para ele. Ainda assim, há forks da comunidade para quase tudo. Esta seção
analisa o que existe (pesquisa de 2026-11-06) e o que custaria.

### 11.1. Dependências

| Dependência | Versão oficial no Win7 | Alternativa compatível | Risco |
|---|---|---|---|
| **Node** (o runtime do programa) | Não. A última testada foi a 13.6.0. Da 14 em diante só roda com `NODE_SKIP_PLATFORM_CHECK=1`, sem garantia, e o Node 22 exige Windows 10 / Server 2016 | Forks com backport para o Win7: [`Alex313031/nodejs-win7`](https://github.com/Alex313031/nodejs-win7) (Node 14, 16 e 18) e [`vladimir-andreevich/node.js-windows-7`](https://github.com/vladimir-andreevich/node.js-windows-7) (14 e mais novos) | Médio. O código usa `.at()` (Node 16.6+) e o `package.json` pede `>=18`. Com o backport do 18, o programa roda **sem mudança**. Com o 14, o `.at()` sai |
| **yt-dlp** | Não. Desde outubro de 2024 o mínimo é Python 3.9, e os `yt-dlp.exe`/`yt-dlp_x86.exe` oficiais pararam de funcionar no Win7 | Fork [`nicolaasjan/yt-dlp`](https://github.com/nicolaasjan/yt-dlp/releases), feito para o Win7 e ainda atualizado (há builds de dezembro de 2025) | Médio. Depende de uma pessoa manter o fork. O `yt-dlp -U` padrão buscaria o binário oficial, que não roda: no Win7, a atualização precisa de `--update-to nicolaasjan/yt-dlp` ou ficar desligada (**a confirmar** como o fork se atualiza) |
| **Runtime JS do yt-dlp** (seção 2.6) | Não. O Deno exige Windows 10, e o Node ≥ 22 não roda no Win7 | [**QuickJS-NG**](https://github.com/quickjs-ng/quickjs): é aceito pelo yt-dlp (`--js-runtimes quickjs:<caminho>`, todas as versões do NG) e lista o Windows 7 como suportado, mas só enquanto isso não atrapalhar o projeto | **Alto.** Sem ele, o **YouTube não funciona**. O suporte ao Win7 é "melhor esforço", e talvez precise compilar com Clang. O QuickJS também é mais lento que o Node no desafio do YouTube (recomenda-se o 2025-04-26 ou mais novo) |
| **ffmpeg / ffprobe** | Não para os builds "full". O gyan.dev "full" quebrou no Win7 na 7.0.1 (o `librav1e`, em Rust, passou a depender de uma DLL do Windows 10). O "essentials" 7.0.1 ainda rodava | Builds para o Win7 publicados na comunidade do [VideoHelp](https://forum.videohelp.com/showthread.php?p=2771128) (ffmpeg 7.1 "full" com toolchain Rust compatível, `--enable-libsvtav1`), ou um build próprio a partir de um fork do `FFmpeg-Builds` com alvo Win7 | Médio a alto. Há relato de `libsvtav1` removido de builds de 64 bits por usar uma função que o Win7 não tem. Reserva: AV1 só com `libaom-av1` (mais lento). O passo 3 do build (seção 6) confere os encoders de qualquer jeito |
| **Inno Setup** | **Sim.** A 6.5.0 tirou o Vista e deixou o **Win7 SP1** como mínimo (o `MinVersion` padrão é `6.1sp1`) | — | Baixo. O mesmo Inno gera os dois instaladores |
| **Windows Terminal** (atalho, seção 4.4) | Não existe para o Win7 | ConEmu (emula ANSI com 256 cores e 24 bits), ou o `cmd` com o modo texto puro | Baixo, se o modo texto puro existir (seção 9). Não vale levar o ConEmu dentro do instalador |
| **Console (conhost)** | Sem sequências VT: sem truecolor, sem tela alternativa | O libuv do Node tem um emulador de ANSI básico para o console antigo (16 cores, cursor). **A confirmar** na VM o que ele faz com `38;2` e `?1049h` | Baixo com o modo texto puro, que pula a tela cheia |
| **`Get-Clipboard`** (`leAreaDeTransferencia`, linha 1073) | Não: o Win7 vem com o PowerShell 2.0, e o `Get-Clipboard` é do 5.0 | `powershell -NoProfile -Sta -Command "Add-Type -A System.Windows.Forms; [Windows.Forms.Clipboard]::GetText()"`, que funciona no 2.0. Ou o WMF 5.1, que dá para instalar no Win7 SP1 | Baixo. Basta tentar o `Get-Clipboard` e, se falhar, o comando do Forms |
| **Atualizações do sistema** | — | SP1, Universal CRT (KB2999226) e TLS 1.2 ligado (para o yt-dlp e o `-U`) | Baixo, mas a página de boas-vindas precisa conferir e avisar |

### 11.2. O que mudaria no plano

- **Um segundo instalador**, `gdm-extractor-<versão>-win7-setup.exe`, com `MinVersion=6.1sp1` e
  `OnlyBelowVersion=6.2`, e o `setup.exe` normal com `MinVersion=10.0.17763`. Um instalador só
  com componentes condicionais (`Check: IsWin7`) carregaria os dois conjuntos de binários e
  dobraria o tamanho.
- **`versoes-win7.json`:** Node do fork (18.x), yt-dlp do `nicolaasjan`, QuickJS-NG e o ffmpeg
  para o Win7, cada um com SHA-256. O `build.ps1` recebe `-Alvo win7`.
- **Encoders exigidos (passo 3 da seção 6):** no Win7, o `libsvtav1` vira opcional. Sem ele,
  o formato AV1 usa o `libaom-av1`, e o `--diagnostico` avisa que vai ser mais lento.
- **Runtime JS:** o `baixa()` passa `--js-runtimes quickjs:<tools\qjs.exe>` quando o Node que
  roda o programa for menor que 22 (seção 2.6).
- **Atualização do yt-dlp:** a tarefa "atualizar o yt-dlp agora" usa o canal do fork ou some.
- **Programa:** modo texto puro (seção 9) e a reserva do `Get-Clipboard`. Se o Node do fork
  for o 18, nenhuma outra mudança no código.
- **Licenças:** `licencas\` ganha a do QuickJS-NG (MIT) e as dos forks.
- **Testes:** uma VM com Win7 SP1 x64 limpa (VirtualBox), com a matriz da seção 8. O mais
  importante é baixar do YouTube.
- **Só x64.** Os forks oferecem pouco ou nada em x86, e o plano principal já é x64.

### 11.3. Recomendação

> **Revista em 2026-11-06:** o instalador `win7` da seção 11.2 foi feito, como **experimental**
> (seção 14.5). Os itens 1 e 3 abaixo continuam valendo; o 2 e o 4 foram substituídos por ele.

**Não dar suporte oficial ao Win7 agora.** É viável, mas depende de quatro projetos de
terceiros mantidos por poucas pessoas (Node, yt-dlp, QuickJS-NG e o ffmpeg), num sistema sem
atualizações de segurança. E o YouTube, metade do programa, depende do elo mais fraco (o
QuickJS-NG). Fica assim:

1. O `setup.exe` normal recusa o Win7 com uma mensagem clara (`MinVersion`), que aponta para
   o README.
2. O README explica o caminho manual: os forks do Node e do yt-dlp, um ffmpeg para o Win7 e o
   `npm link`, com variáveis `GDM_YOINKS_*` (seção 2.1) apontando para cada ferramenta.
3. O modo texto puro e a reserva do `Get-Clipboard` entram de qualquer jeito, porque são
   baratos e ajudam o caminho manual.
4. Se aparecer demanda, o instalador `win7` da seção 11.2 é o passo seguinte. Os forks e o
   build do ffmpeg precisam ser reavaliados nesse momento, porque mudam rápido.

## 12. Ordem sugerida

1. **Código:** `resolveFerramentas()`, `--ffmpeg-location`, `--diagnostico`, a config mínima,
   o `--configurar`, os nomes por sistema, o runtime JS do yt-dlp e o modo texto puro
   (seções 2.1–2.6 e 9), com testes `node --test` da ordem de resolução e da leitura da
   config. Isso já melhora o `npm link` de hoje, no Windows e no Linux.
2. **Arquivos do repositório:** `LICENSE`, `README.md` (com a instalação) e `.gitignore`, que o
   §1.3 do `IDEIAS.md` pede e o instalador precisa.
3. **Build:** `versoes.json` e `build.ps1` até gerar a pasta `stage\` e passar no
   `--diagnostico`.
4. **Instalador básico:** `.iss` com pasta, componentes, PATH, atalhos e desinstalação, com o
   `.cmd`. Testar na conta limpa.
   **Em paralelo, o Arch:** `PKGBUILD` e `.desktop` (seção 10). Não tem build de dependências,
   então só depende do passo 1 e do `LICENSE` do passo 2.
5. **Assistente completo:** página de configuração, `yt-dlp -U`, diagnóstico na página final,
   arte do logo.
6. **Especificação:** §3 (instalação pelo `setup.exe` ao lado do `npm link`), §6 (a ordem de
   resolução da seção 2.1, no lugar do `ffmpeg-static`, que deixa de fazer sentido), §10 (as
   linhas de dependências) e uma linha para o instalador no `IDEIAS.md`.
7. **Depois:** lançador `.exe`, GitHub Actions, winget, assinatura de código, o `.tar.gz` para
   outras distribuições (seção 10.5). O instalador `win7` (seção 11.2) já foi feito (seção 14.5).

## 13. Decisões em aberto

- **Embutida antes ou depois do PATH?** A proposta é embutida primeiro, porque é a combinação
  que o build testou (encoders conferidos). O custo: quem atualiza o próprio ffmpeg não vê
  diferença no programa até mudar a config. A alternativa é PATH primeiro **se** passar na
  conferência de encoders, e embutida como reserva.
- **`.cmd` ou lançador `.exe`?** O `.cmd` é imediato, mas tem a pergunta do Ctrl+C. Um
  lançador de poucas linhas (C# compilado com o `csc.exe` que vem no Windows, ou Rust) repassa
  argumentos e código de saída sem esse problema. Outra opção é o Node SEA (um `.exe` único com
  o Node dentro); no Node 22 ele exige um script CommonJS único, então o `.mjs` teria que passar
  por um empacotador e o `logo.md` iria como asset. **A confirmar** o suporte a ESM nas versões
  mais novas do Node antes de escolher.
- ~~**Quem escreve o `config.json`**~~ **Decidido:** o próprio programa, com o `--configurar`
  (seção 2.4), porque o Arch não tem o `[Code]` do Inno.
- **Build do ffmpeg:** qual fonte fixar (BtbN ou gyan.dev "full"), considerando tamanho, se o
  link de uma versão específica é estável e o que cada um oferece de código-fonte (seção 7).
  Medir o tamanho final do `setup.exe` com cada um.
- **Instalador offline ou online?** A proposta é offline. Um instalador pequeno que baixa as
  ferramentas na hora (o Inno 6 tem página de download) deixaria o `setup.exe` com poucos MB e o
  yt-dlp sempre novo, mas não instala sem internet e depende dos links continuarem de pé.
- **Assinatura de código:** sem ela, o SmartScreen avisa a cada versão nova até ela ganhar
  reputação. Custa dinheiro (certificado ou Azure Trusted Signing); fica para quando houver
  usuários de fora.
- **Windows 7:** o instalador existe, mas como experimental (seção 14.5). Falta decidir se ele
  vai para as releases antes do teste numa VM com o Windows 7. A cada versão nova, reavaliar
  os forks (Node, yt-dlp), o QuickJS-NG e o build do ffmpeg, porque mudam rápido; o
  `confere-win7.mjs` pega a maior parte das quebras no próprio build.

## 14. Implementação (2026-11-06)

### 14.1. Arquivos

| Arquivo | O que é |
|---|---|
| `ferramentas.mjs` | resolução das ferramentas (2.1, 2.5), encoders (2.2), runtime JS (2.6), terminal limitado (9). Funções puras |
| `config.mjs` | leitura, mescla e gravação do `config.json` (2.3, 2.4). Funções puras |
| `gdm-yoinks.mjs` | `--diagnostico`, `--configurar [--mostra]`, `--formato menu`, `--ffmpeg-location` e `--js-runtimes` em toda chamada do yt-dlp, avisos do início, reserva do `Get-Clipboard` (11.1) |
| `tests/ferramentas.test.mjs`, `tests/config.test.mjs`, `tests/versao.test.mjs` | 29 testes no total com os do `tempo.mjs` |
| `installer/versoes.json` | Node 22.23.4, yt-dlp 2026.10.26, ffmpeg 8.1.3 (BtbN `autobuild-2026-10-31-12-59`, *shared*), com SHA-256 |
| `installer/build.ps1` | downloads, stage, encoders, testes e diagnóstico com o Node embutido, ISCC |
| `installer/gdm-yoinks.iss` | o assistente (Inno Setup 6.7.3) |
| `installer/gdm-extractor.cmd` | o comando no PATH (3.1) |
| `installer/arte/gera-arte.mjs` | imagens do assistente geradas do `logo.md` |
| `installer/linux/PKGBUILD`, `installer/linux/gdm-extractor.desktop` | o pacote do Arch (10) |
| `.gitignore`, `.gitattributes` | artefatos do build fora do git; CRLF nos scripts do Windows |

### 14.2. Testes feitos

- `npm test`: 29 de 29, com o Node do sistema e com o Node embutido (no build).
- `build.ps1`: o stage passa no `--diagnostico` com o PATH reduzido ao `System32`, ou seja,
  as três ferramentas vêm de `tools\`. O `setup.exe` tem **90,3 MB** (298 MB instalados).
- Instalação silenciosa numa pasta com acento e espaço (`…\João Silva\gdm-yoinks`), com uma
  pasta pessoal temporária: PATH com uma entrada só, config criada, atalhos criados, extração
  AV1 com o SVT-AV1 embutido. Atualização por cima: sem entrada duplicada, config alterada
  entre as duas preservada. Desinstalação: PATH idêntico ao original (conteúdo e tipo),
  pasta e atalhos apagados, config mantida.
- O Inno lê a saída UTF-8 do Node sem estragar (`✓`, `✗`, acentos) e enxerga o `wt.exe`, que
  é um alias de execução.
- Arch, num contêiner `archlinux:latest`: `namcap` no `PKGBUILD` sem avisos; `makepkg` com o
  `check()`; pacote instalado; `--diagnostico` com origem `sistema` (ffmpeg 9.0.2, com
  `libsvtav1`); `--configurar` gravando em `~/.config` e respeitando `XDG_CONFIG_HOME`;
  extração AV1; `TERM=linux` sem códigos de cor. O `namcap` do pacote dá os avisos de sempre
  de pacote só de script (dependências chamadas em tempo de execução).

### 14.3. Decisões tomadas na implementação

- **A página de configuração virou duas** (pasta; formato), feitas com as páginas prontas do
  Inno (`CreateInputDirPage` e `CreateInputOptionPage`), em vez de uma página desenhada à mão.
- **O "avisar quando o yt-dlp estiver desatualizado" não está no assistente.** Ele fica `true`
  por padrão e se muda no `config.json`. O aviso compara a data da versão do yt-dlp com a de
  hoje (mais de 90 dias), sem usar a rede.
- **Sem botão "copiar diagnóstico":** o Pascal do Inno não tem acesso à área de transferência.
  A caixa da página final é selecionável (Ctrl+A, Ctrl+C).
- **O atalho chama o `node.exe` direto**, não o `.cmd`. Assim o Ctrl+C não cai na pergunta do
  cmd (3.1). No cmd (sem Windows Terminal), o atalho usa `/k`, para o erro continuar na tela.
- **Valores da configuração numa atualização:** o assistente lê com o `--configurar --mostra`
  da instalação anterior. Sem instalação anterior, mostra os padrões, e só grava o que o
  usuário mudar (ou tudo, se ainda não houver `config.json`). Quem já tinha config pelo
  `npm link` não a perde.
- **Primeira execução:** o `--configurar` roda sozinho só sem argumentos e num terminal, para
  não travar scripts.
- **ffmpeg de fim de mês:** o BtbN apaga os builds diários depois de cerca de um mês, mas
  mantém o último de cada mês. Por isso o `versoes.json` aponta para o de 31/10.
- **O `yt-dlp.exe` é sempre substituído** numa atualização do instalador (mesmo se o `-U` já
  tinha baixado um mais novo). A tarefa "atualizar o yt-dlp agora" corrige isso na hora.
- **`sha256sums=('SKIP')` no `PKGBUILD`:** a tag `v0.1.0` ainda não existe no GitHub. Depois de
  publicá-la, rodar `updpkgsums`.

### 14.4. Pendente

- Passar pelo assistente **com interface** (os testes foram em modo silencioso): conferir as
  páginas de configuração, o aviso do `npm link` e a caixa do diagnóstico na página final.
- Testar numa conta de usuário limpa (sem Node nem ffmpeg) e o aviso do SmartScreen.
- Publicar a tag `v0.1.0`, anexar o `setup.exe` à release, rodar `updpkgsums` e mandar o
  pacote para o AUR.
- Seção 12, passo 7: lançador `.exe`, GitHub Actions, winget, assinatura de código.

### 14.5. Windows 7 (2026-11-06)

O instalador da seção 11.2, gerado pelo mesmo `.iss` e pelo mesmo `build.ps1`:
`installer\build.ps1 -Alvo win7` → `installer\saida\gdm-extractor-<versão>-win7-setup.exe`
(**91,6 MB**, quase o mesmo do Win10).

**Dependências** (`installer/versoes-win7.json`, todas com SHA-256):

| Peça | Escolhida | Por quê |
|---|---|---|
| Node | **20.19.2** do `vladimir-andreevich/node.js-windows-7`, fixado num commit (o arquivo mora no git do repositório, não numa release) | Mais novo que o 18 do `Alex313031/nodejs-win7`, que parou em 2024. A mensagem de plataforma do binário já diz "Windows 7 … or higher", então não precisa de `NODE_SKIP_PLATFORM_CHECK`. O zip tem a mesma estrutura do oficial |
| yt-dlp | `yt-dlp_win7.exe` **2026.10.29.091737** do `nicolaasjan/yt-dlp` | O hash bate com o que o GitHub publica. Licença igual à do yt-dlp |
| Runtime JS | **QuickJS-NG 0.18.0** (`qjs-windows-x86_64.exe`), em `tools\qjs.exe`, no componente do programa | O `runtimeJs()` já o usava quando o Node é menor que o 22 |
| ffmpeg | **gyan.dev 8.1.2 "essentials"** (estático) | Ver a conferência abaixo. Tem `libvpx`, `libaom` e `libopus`, sem `libsvtav1`: o AV1 sai pelo `libaom-av1` |

**Conferência dos imports** (`installer/confere-win7.mjs`, com testes em
`tests/confere-win7.test.mjs`). Lê a tabela de imports (normal e atrasada) de cada `.exe`/`.dll`
e reprova funções e DLLs do Windows 8+ (`GetSystemTimePreciseAsFileTime`, `WaitOnAddress`,
`SetThreadDescription`, `ProcessPrng`, `api-ms-win-core-synch-l1-2-0.dll`…). O build win7 roda a
conferência em `runtime\` e `tools\` e para se algo reprovar. O que ela encontrou nos candidatos:

| Binário | Resultado |
|---|---|
| `node.exe` 22 oficial (controle) | reprova: `GetSystemTimePreciseAsFileTime` |
| `node.exe` 20 do fork, `qjs.exe`, `yt-dlp_win7.exe` | passam |
| ffmpeg BtbN 8.1.3 *shared* (o do Win10) | reprova: o `avcodec` importa `ProcessPrng` (o `librav1e`, em Rust), `WaitOnAddress` e `SetThreadDescription` |
| gyan.dev *full shared* 7.0.1, 7.1 e 8.1.2 | reprovam: `WaitOnAddress` no `avcodec` (o 8.1.2 também `SetThreadDescription`/`SetThreadInformation`) |
| gyan.dev *essentials* 8.1.2 | **passa**. Importa só DLLs que o Windows 7 tem, mais o Universal CRT |

É uma conferência por lista: ela não vê o que é carregado com `GetProcAddress` nem flags novas
em funções antigas. Por isso o teste numa VM continua necessário. Com o `yt-dlp.exe`, ela só lê o
lançador do PyInstaller (o Python embutido não aparece), e o `yt-dlp.exe` oficial passa nela
mesmo sem rodar no Windows 7.

**Decisões:**

- **Um `.iss` só**, com `/DAlvo=win7`: `MinVersion=6.1sp1`, `OnlyBelowVersion=6.2`, o mesmo
  `AppId`, o setup com `-win7` no nome e o stage em `installer\stage-win7\`. Cada instalador
  recusa o Windows do outro com uma mensagem que aponta para o setup certo
  (`WindowsVersionNotSupported`; o Inno 6.7 não usa mais as `WinVersionToo*`).
- **Sem "atualizar o yt-dlp"** no win7. Os binários `_win7` do fork não saem do workflow dele
  (são publicados à parte), e o `update.py` do fork não tem variante win7: um `-U` deles pediria
  o `yt-dlp.exe`, que é o build do Windows 10+. No Windows antes do 10, o aviso de yt-dlp
  desatualizado manda trocar o arquivo pelo `yt-dlp_win7.exe` do fork (`dicaAtualizacao` com
  `windowsAntigo`, e `windowsAntesDo10` no `ferramentas.mjs`).
- **Universal CRT:** o ffmpeg e o QuickJS importam `api-ms-win-crt-*`. O assistente win7 confere
  o `{sys}\ucrtbase.dll` no `InitializeSetup` e, sem ele, para com o link da KB2999226. O TLS 1.2
  do sistema não importa: o yt-dlp e o Node levam o próprio OpenSSL, e o ffmpeg não baixa nada.
- **`--diagnostico`:** sem SVT-AV1, mostra "AV1 pelo libaom-av1: funciona, mas bem mais
  lento". Vale também para quem usa um ffmpeg "essentials" no Windows 10.
- **`licencas\`** ganha a do QuickJS-NG e o `ffmpeg-BUILD.txt` (o README do gyan.dev, com a
  configuração do build). O `FONTES.txt` cita os forks. Numa atualização, a pasta é recriada,
  para não sobrar licença do outro alvo.
- **`/DTesteForaDoWin7`** compila o win7 sem o `OnlyBelowVersion`, só para testar a instalação
  num Windows 10+. Não é para publicar.

**Testes feitos** (num Windows 11; sem VM com Windows 7 ainda):

- `build.ps1 -Alvo win7` completo: hashes, encoders, imports, 38 de 38 testes com o Node 20 do
  fork e o `--diagnostico` com PATH só no `System32` (tudo `(embutida)`, runtime JS
  `quickjs:…\tools\qjs.exe`). O `build.ps1` do Win10 continua igual (90,3 MB, tudo passando).
- Extração do YouTube (§7) com o stage win7: WEBM (vp9/opus), AV1 (av1/opus, pelo `libaom`) e
  GIF, com o QuickJS-NG como runtime JS.
- O setup win7 de verdade, no Windows 11: recusa com a mensagem certa.
- A variante de teste, instalação silenciosa em `…\João Silva\Programs\gdm-yoinks` com pasta
  pessoal temporária: `qjs.exe` e ffmpeg estático em `tools\` (sem DLLs), uma entrada no PATH,
  config criada com o acento certo, nenhum `-U`, `--diagnostico` pelo `.cmd` instalado dá `0`.
  Desinstalação: PATH idêntico (conteúdo e tipo), pasta e atalho apagados, config mantida.

**Pendente:**

- **VM com Windows 7 SP1 x64 limpa** e a matriz da seção 8. O mais importante: abrir o
  programa (Node do fork), baixar do YouTube (QuickJS-NG) e ver o modo linha no conhost.
- Confirmar no Windows 7 o aviso da falta do Universal CRT e a reserva do `Get-Clipboard`
  pelo PowerShell 2.0.
- O AV1 pelo `libaom` é bem mais lento: medir num vídeo do §7 de tamanho normal.
