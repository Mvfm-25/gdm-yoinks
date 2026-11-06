# Patch do Windows 7: análise do primeiro teste real

Análise do primeiro teste do `gdm-extractor-0.1.0-win7-setup.exe` numa máquina com Windows 7
(2026-11-06), feito por um amigo, e proposta de patch. As referências `§N` apontam para a
`ESPECIFICACAO.md`; "Instalador §N" aponta para a `Instalador-Implement.md`.

## 0. O que foi relatado

| Caso | Resultado |
|---|---|
| Link do X/Twitter | baixou normalmente |
| Link do YouTube (`https://youtu.be/9N7oSJiKwiQ?si=…`) | ficou cerca de **11 min** em `analisando o link…` sem terminar nem dar erro |
| Visual | nada da tela cheia nem das cores; o `›` do campo e o spinner aparecem como `▯` |

A captura mostra o atalho abrindo `cmd.exe` → `runtime\node.exe app\gdm-yoinks.mjs`, ou seja, o
console clássico (conhost) do Windows 7, com 80 colunas.

---

## 1. YouTube preso em "analisando o link…"

### 1.1. O que acontece nessa etapa

No modo linha, `main()` mostra o spinner e chama `analisa()`, que roda **uma única vez** o
yt-dlp:

```
yt-dlp -J --no-warnings --no-playlist --ffmpeg-location … --js-runtimes <runtime> -f … <url>
```

O `roda()` espera o processo terminar, **sem limite de tempo**, e o `-J` com `--no-warnings`
deixa o yt-dlp mudo até o fim. Qualquer demora vira um spinner girando para sempre, sem pista
do motivo. Isso explica por que o amigo ficou 11 min sem saber se o programa travou.

### 1.2. Por que só o YouTube

O X não precisa de runtime JavaScript. O YouTube precisa: desde o EJS (novembro de 2025) o
yt-dlp resolve os desafios JS do player com um runtime externo (Instalador §2.6). No
instalador win7, a escolha cai sempre no QuickJS:

| Runtime | Mínimo exigido pelo yt-dlp ([wiki EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS)) | Situação no Windows 7 |
|---|---|---|
| Deno | 2.3.0 | não roda no 7 |
| Node | **22.0.0** | o fork que usamos só vai até o **20** (`node.js-windows-7` tem `v14`…`v20`) |
| Bun | 1.2.11 (descontinuado) | não roda no 7 |
| QuickJS-NG | qualquer versão | é o que vai (`tools\qjs.exe`, 0.18.0) |

O `runtimeJs()` (`ferramentas.mjs`) pula o Node 20 de propósito e escolhe o `quickjs:…\qjs.exe`.
Então **o YouTube no win7 depende inteiramente do QuickJS**, que nunca foi exercitado num
Windows 7 de verdade: o teste da Instalador §14.5 foi feito num Windows 10 com
`/DTesteForaDoWin7`.

### 1.3. Hipóteses, da mais para a menos provável

| # | Hipótese | A favor | Contra / como descartar |
|---|---|---|---|
| H1 | **QuickJS lento demais** na máquina do amigo. Ele é um interpretador puro (sem JIT); o player do YouTube tem alguns MB de JS, e o yt-dlp pode resolver desafios de mais de um cliente (web, tv…) na mesma análise | a wiki fala em "vários minutos" para versões sem otimizações; uma CPU da época do Windows 7 multiplica isso | a 0.18.0 já tem as otimizações (≥ 0.12.0). Medir com o `-v` (seção 1.4) |
| H2 | **`qjs.exe` não sobe direito no Windows 7** (DLL do UCRT, API ausente) e fica preso numa caixa de erro do sistema, ou trava | o `confere-win7.mjs` é uma lista, não uma prova (ele mesmo avisa); nunca rodou num 7 real | rodar `tools\qjs.exe -e "print(1)"` direto no cmd |
| H3 | **Rede**: alguma requisição do YouTube (googlevideo, player) fica pendurada e o yt-dlp repete com o timeout padrão (20 s por tentativa, várias tentativas) | o X funcionou, mas usa outros domínios; IPv6 quebrado ou proxy do sistema afetam domínios diferentes de formas diferentes | testar com `-4` e ver no `-v` onde para |
| H4 | **O fork do yt-dlp** (`yt-dlp_win7.exe`, que voltou temporariamente para Python 3.14 por causa de um bug) tem algum problema com o EJS ou com o QuickJS | o README do fork cita o problema do Python | o `-v` mostra a versão do `yt-dlp-ejs` embutido e se o runtime foi aceito |

Nenhuma delas dá para confirmar daqui: **o primeiro passo do patch é pedir um log ao amigo**.

> **Atualização:** o primeiro retorno confirmou a **H2**. O `qjs.exe` não abre no Windows 7 do
> amigo. Detalhes, o que isso indica e a correção estão na seção 1.6.

### 1.4. Roteiro de diagnóstico (para mandar ao amigo)

No cmd, na pasta da instalação (`D:\MinhasCoisas\gdm-yoinks` no caso dele):

```bat
cd /d D:\MinhasCoisas\gdm-yoinks
runtime\node.exe app\gdm-yoinks.mjs --diagnostico > diag.txt 2>&1
tools\qjs.exe -e "print(1)"
tools\yt-dlp.exe -v -J --no-playlist --js-runtimes "quickjs:%CD%\tools\qjs.exe" "https://youtu.be/9N7oSJiKwiQ" > nul 2> log-yt.txt
```

O que cada um responde:

- **`qjs.exe -e "print(1)"`**: se não imprimir `1` na hora, é a H2.
- **`log-yt.txt`** (pedir para esperar até terminar ou até 15 min e mandar mesmo assim): o
  `-v` mostra a versão do yt-dlp e do `yt-dlp-ejs`, o runtime escolhido e cada requisição. Se a
  última linha for de `[jsc:quickjs]`/desafio JS, é a H1; se for um `Downloading …` parado, é a
  H3.
- Se demorar, repetir com `-4` no lugar do `-v` sozinho (`-v -4`) para testar a H3, e uma vez
  **sem** o `--js-runtimes`: se aí terminar rápido (com menos formatos ou com aviso de desafio
  não resolvido), o gargalo é o runtime.

Para facilitar, isso pode virar uma opção do próprio programa (seção 1.5, item 4).

### 1.5. O que entra no patch

Independente da causa, estes itens valem e não dependem do log:

1. **Tempo visível no spinner.** `analisando o link… 0:42`. Depois de ~20 s no YouTube com
   QuickJS, uma segunda linha: `resolvendo o desafio do YouTube com o QuickJS (no Windows 7
   pode levar alguns minutos)`. Só isso já transforma "travou?" em "está trabalhando".
2. **Etapas do yt-dlp no lugar do silêncio.** Trocar o `--no-warnings` da análise por leitura
   do stderr linha a linha (o `roda()` já aceita `aoLer`) e mostrar a etapa atual no spinner
   (`baixando a página`, `baixando o player`, `resolvendo o desafio JS`). A saída JSON continua
   no stdout. Conferir se o `-J` silencia o stderr; se sim, acrescentar `--no-quiet` (a
   conferir na versão do fork).
3. **Limite de tempo na análise.** Um `timeout` opcional no `roda()` (mata o processo e o
   `filhos` já cuida do resto). Padrão sugerido: **5 min** no win7, 2 min no resto; configurável
   (`--tempo-limite`, chave `tempoLimite` na config). Ao estourar, a mensagem diz o que fazer:
   `o YouTube não respondeu em 5 min. Rode gdm-extractor --log <url> e mande o arquivo gerado.`
4. **`--log`.** Repete a análise com `-v` e grava o stderr em
   `%TEMP%\gdm-extractor-<data>.log`, imprimindo o caminho no fim. É o roteiro da seção 1.4
   sem precisar ensinar ninguém a usar o cmd.
5. **QuickJS no `--diagnostico` e no fim da instalação.** Hoje a linha `js` só mostra o
   caminho. Passa a rodar `qjs.exe -e "print(1)"` com tempo medido: falha → `✖` com o motivo;
   lento (> 2 s só para subir) → aviso. Pega a H2 antes de o usuário colar um link.
6. **Cache do yt-dlp.** O yt-dlp guarda em cache o resultado dos desafios por versão do player.
   Conferir no `-v` se ele está gravando (pasta `%LOCALAPPDATA%\yt-dlp` ou `~\.cache`); se
   estiver, só a primeira análise de cada player seria lenta, e vale dizer isso na mensagem do
   item 1.

Dependendo do log:

| Se for | Correção |
|---|---|
| H1 (QuickJS lento) | itens 1–3 já resolvem a experiência. Para acelerar: testar se um único cliente do player reduz o trabalho (`--extractor-args "youtube:player_client=…"`, a validar no fork) e documentar no README que o YouTube no win7 é lento |
| H2 (`qjs.exe` não roda) | trocar o binário: um build do QuickJS-NG com MSVC/mingw que mire o 7, ou compilar o nosso no build (`build.ps1 -Alvo win7`) e passá-lo pelo `confere-win7.mjs` |
| H3 (rede) | passar `--socket-timeout 15` e, se o `-4` resolver, `-4` no alvo win7 (ou opção na config) |
| H4 (fork) | fixar outra versão do `yt-dlp_win7.exe` em `versoes-win7.json` |

**Sem saída boa no Windows 7:** não existe Node ≥ 22, Deno ou Bun para o 7 hoje. Se o QuickJS
não servir, o YouTube no win7 vira "não suportado" de forma explícita: o programa recusa o link
na hora com uma mensagem clara, em vez de girar por minutos. O X continua funcionando.

### 1.6. Primeiro retorno do amigo: o `qjs.exe` não abre (H2 confirmada)

**O que aconteceu.** Ele rodou o roteiro da seção 1.4 e parou no segundo comando:

```
D:\MinhasCoisas\gdm-yoinks>runtime\node.exe app\gdm-yoinks.mjs --diagnostico > diag.txt 2>&1
D:\MinhasCoisas\gdm-yoinks>tools\qjs.exe -3 "print(1)"
_                                   ← cursor piscando, sem saída e sem voltar ao prompt
```

- O `--diagnostico` terminou (o prompt voltou). O Node do fork funciona no 7. O `diag.txt`
  ainda não chegou.
- Ele digitou **`-3` em vez de `-e`**. Isso não invalida o teste, e até o deixa mais forte: no
  Windows 10 o mesmo binário (0.18.0) responde ao comando errado **na hora**, com
  `qjs: unknown option '-3'` + a ajuda, e sai com código 1. A leitura dos argumentos é a
  primeira coisa que o `qjs` faz. No 7 não saiu nem a mensagem de erro, então **o processo
  trava antes de chegar ao `main()`**, ainda na carga do executável.
- O terceiro comando (`yt-dlp -v`) não chegou a rodar.

**O que isso indica.**

1. **A H2 explica o sintoma inteiro.** O yt-dlp chama o `qjs.exe` para resolver o desafio do
   YouTube (e, conforme a versão, para conferir a versão do runtime). O `qjs` nunca responde, o
   yt-dlp espera sem limite e o `roda()` também. Daí os 11 min em `analisando o link…`. A H1
   (lentidão) fica praticamente descartada: o QuickJS nem chegou a interpretar nada. H3 e H4
   não são necessárias para explicar o que aconteceu, embora ainda possam existir por trás.
2. **Não é falta de função no Windows 7, pelo menos não de forma estática.** Conferido aqui
   com `objdump -p`: o `qjs.exe` 0.18.0 importa só `KERNEL32`, `ADVAPI32` e o UCRT
   (`api-ms-win-crt-*-l1-1-0`). Todas as funções do `KERNEL32` existem no 7, as do UCRT
   existem desde a primeira versão da KB2999226, e o `confere-win7.mjs` dá `ok`. O instalador
   win7 também já para se faltar o `{sys}\ucrtbase.dll` (ele roda em modo 64 bits, então
   `{sys}` é o System32 de verdade). Sobram três suspeitos, todos na carga do processo:

   | # | Suspeito | Por quê | Como distinguir |
   |---|---|---|---|
   | H2a | **Caixa de erro do Windows escondida** ("DLL não encontrada", "ponto de entrada não encontrado"). O console fica esperando até alguém fechar a caixa | é o comportamento clássico do carregador no 7, e a caixa costuma abrir atrás da janela do cmd | olhar a barra de tarefas/Alt+Tab com o comando travado; o Windows registra essas caixas no log do sistema (evento 26, "Application Popup") |
   | H2b | **UCRT presente, mas incompleto ou quebrado**: `ucrtbase.dll` existe (e passa no teste do instalador), mas faltam os `api-ms-win-crt-*.dll` ou eles são de outra versão | o teste do instalador olha **um** arquivo só | versão do `ucrtbase.dll`, presença do `api-ms-win-crt-runtime-l1-1-0.dll` e o `ffmpeg.exe`, que usa o mesmo UCRT: se ele também travar, o problema é o UCRT, não o QuickJS |
   | H2c | **Travamento na inicialização do binário**: o build oficial embute o **mimalloc** (as strings `mimalloc:`, `VirtualAlloc2`, `SeLockMemoryPrivilege` estão no `.exe`), que inicializa antes do `main()` e procura APIs do Windows 10 em tempo de execução. Antivírus antigo segurando o `.exe` novo cai no mesmo sintoma | explicaria por que o `confere-win7` não pegou: nada disso aparece na tabela de imports | se o `ffmpeg` abrir e não houver caixa de erro nem evento 26, sobra a H2c |

   Não dá para separar H2a/H2b/H2c só com a captura, mas **a correção do patch é a mesma para
   as três** (abaixo). O próximo roteiro serve para não trocar um binário quebrado por outro
   quebrado.

3. **O `confere-win7.mjs` passou e mesmo assim o binário não roda.** Era o risco que o próprio
   script anunciava: ele é uma lista estática de imports e não executa nada. Daqui em diante,
   todo binário do alvo win7 só entra com teste de execução num 7 de verdade (VM).

**Segundo roteiro para o amigo.** Com o `qjs` travado, a janela não volta. Fechar com
**Ctrl+C** (ou fechar a janela) e abrir um cmd novo:

```bat
cd /d D:\MinhasCoisas\gdm-yoinks
rem 1. Antes de qualquer coisa: com o qjs travado, apareceu alguma janela de erro na barra de tarefas?
tools\qjs.exe -v
echo saiu com %ERRORLEVEL%
tools\ffmpeg.exe -version
echo saiu com %ERRORLEVEL%
dir C:\Windows\System32\ucrtbase.dll C:\Windows\System32\api-ms-win-crt-runtime-l1-1-0.dll
wmic qfe get HotFixID | find "2999226"
wevtutil qe System /q:"*[System[(EventID=26)]]" /c:5 /rd:true /f:text > popups.txt
```

E mandar o `diag.txt` e o `popups.txt`. Leitura:

| Resultado | Indica |
|---|---|
| Tinha caixa de erro / o `popups.txt` tem um evento com `qjs.exe` | H2a; a mensagem diz qual DLL ou função falta |
| O `ffmpeg -version` também trava, ou falta o `api-ms-win-crt-runtime…` / a KB2999226 | H2b (UCRT); afeta o ffmpeg também, ou seja, o mesclar e o converter quebram mesmo no X |
| O `ffmpeg` abre, não há caixa nem evento e o `qjs -v` trava | H2c (o binário do QuickJS em si) |
| O `qjs -v` imprime a versão | o travamento foi intermitente (antivírus?); repetir o `-e "print(1)"` com calma, digitando `-e` |

**Como consertar no próximo patch.**

1. **Trocar o `qjs.exe` do alvo win7 por um compilado por nós.** O QuickJS-NG é C puro e
   compila com o w64devkit que já está na máquina de build (`C:\minGW-w64\w64devkit`). Esse
   toolchain liga no `msvcrt.dll`, que existe em qualquer Windows 7, e não no UCRT. Compilar
   **sem o mimalloc** (o build oficial o liga por padrão; conferir a opção do CMake na tag
   v0.18.0). Isso elimina H2b e H2c de uma vez, e a H2a junto se a DLL que falta for do UCRT.
   - Em `versoes-win7.json`, o `quickjs` passa a apontar para o **código-fonte** da tag (url +
     sha256 do `.tar.gz`), e o `build.ps1 -Alvo win7` compila. O alvo win10/Linux continua com
     o binário oficial.
   - Conferir com `objdump -p` que o resultado não importa `api-ms-win-crt-*`, e passar pelo
     `confere-win7.mjs`.
   - Se a compilação própria der trabalho demais, a alternativa é um release mais antigo do
     QuickJS-NG anterior ao mimalloc, desde que a versão seja aceita pelo yt-dlp-ejs. Isso
     precisa ser conferido no `-v` do yt-dlp.
2. **Nunca mais esperar um runtime JS sem limite.** O `runtimeJs()` passa a **provar** o
   runtime antes de entregá-lo ao yt-dlp: roda `qjs.exe -e "print(1)"` com **5 s** de limite
   (com o `timeout` do `roda()` da seção 1.5, item 3) e guarda o resultado na sessão. Se falhar
   ou estourar, devolve `null` com o motivo, e o YouTube cai no caso "não suportado" (seção 1.5)
   **na hora**, com a mensagem `o QuickJS não abriu neste Windows (<motivo>); links do YouTube
   não funcionam. Rode gdm-extractor --diagnostico e mande o resultado.` O X segue funcionando.
   É o que transforma um travamento de 11 min numa mensagem em 5 s, mesmo que o binário novo
   também falhe em alguma máquina.
3. **A mesma prova no `--diagnostico` e no fim do instalador** (seção 1.5, item 5, que sobe de
   "melhoria" para obrigatório): `js  ✖ quickjs: não respondeu em 5 s`. Vale também para o
   `ffmpeg -version`, que depende do mesmo UCRT e nunca foi exercitado no 7 (o vídeo do X
   provavelmente não precisou mesclar nada).
4. **Conferência do UCRT mais rigorosa no instalador win7.** Além do `ucrtbase.dll`, exigir o
   `{sys}\api-ms-win-crt-runtime-l1-1-0.dll`. Com o item 1, só o ffmpeg depende disso.
5. **Teste de execução no 7 para todo binário do alvo win7.** A VM da seção 3 roda
   `qjs -e "print(1)"`, `ffmpeg -version`, `yt-dlp --version` e `node --version`, cada um com
   limite de tempo. Isso entra no checklist do `build.ps1 -Alvo win7`, ao lado do
   `confere-win7.mjs`, que sozinho já se mostrou insuficiente.

### 1.7. Segundo retorno e o `qjs.exe` compilado

**Segundo retorno.** Com o comando corrigido (`tools\qjs.exe -e "print(1)"`), o resultado foi o
mesmo: nada impresso e o prompt não volta. O erro de digitação da primeira vez não mudava nada.

**O UCRT dele funciona (H2b praticamente descartada).** O `--diagnostico` da primeira rodada
**terminou**. No 0.1.0 ele roda `ffmpeg -version`, `ffprobe -version` e `ffmpeg -encoders` sem
limite de tempo, e o ffmpeg do win7 (gyan.dev) importa o mesmo UCRT (`api-ms-win-crt-*`) que o
`qjs.exe` oficial. Se o UCRT estivesse quebrado, o `--diagnostico` teria travado igual. Sobram
H2a (caixa de erro escondida, específica do `qjs.exe`) e H2c (a inicialização do binário
oficial, com o mimalloc). O segundo roteiro da seção 1.6 ainda separa as duas, mas a correção
não depende disso.

**O `qjs.exe` compilado (2026-11-06).** Feito com o w64devkit (gcc 15.2.0), a partir da tag
v0.18.0 (`quickjs-ng-v0.18.0.tar.gz`, sha256 `28bcd89a…f1dd`). São os arquivos e as definições
do alvo `qjs_exe` do `CMakeLists.txt`, sem `QJS_USE_MIMALLOC` (no código-fonte, o mimalloc já
vem desligado; o release oficial é que o liga):

```sh
gcc -O2 -std=gnu11 -funsigned-char -w -DQUICKJS_NG_BUILD -D_GNU_SOURCE -DWIN32_LEAN_AND_MEAN \
    -D_WIN32_WINNT=0x0601 -o qjs.exe qjs.c gen/repl.c gen/standalone.c quickjs.c libregexp.c \
    libunicode.c dtoa.c quickjs-libc.c -static -static-libgcc -Wl,--stack,8388608 -lm
```

| | Oficial (0.1.0) | Compilado (0.1.1) |
|---|---|---|
| Imports | `KERNEL32`, `ADVAPI32`, 12 × `api-ms-win-crt-*` | só `KERNEL32` e `msvcrt` |
| mimalloc | sim | não |
| `confere-win7.mjs` | ok (e mesmo assim travou no 7) | ok |
| Tamanho | 1,8 MB | 1,5 MB |
| `-e "print(1)"` (Windows 10) | `1` | `1`, em 18 ms |
| yt-dlp do fork + YouTube (Windows 10) | — | aceito como `quickjs-ng-0.18.0`; desafio JS resolvido, análise em 7 s |

O `build.ps1 -Alvo win7` agora faz essa compilação sozinho (`CompilaQjs`) e para se o resultado
importar algo do UCRT. Falta a prova que importa: **rodar no Windows 7 do amigo**.

**O que mais entrou no 0.1.1** (todos os itens da seção 3):

| Mudança | Onde | Testado (Windows 10) |
|---|---|---|
| `roda()` com `limiteMs`; ao estourar, `taskkill /T` derruba o yt-dlp, o Python dele e o runtime JS | `gdm-yoinks.mjs` | sem processos sobrando depois do limite |
| Prova do runtime JS (`comandoProvaJs`, 5 s) antes de entregá-lo ao yt-dlp; falhou → YouTube recusado na hora, X segue | `ferramentas.mjs`, `gdm-yoinks.mjs` | com um `qjs.exe` falso que dorme para sempre: mensagem em 5,8 s (antes: 11 min sem fim) |
| `--diagnostico` com a prova (`js … ✓ 18 ms` / `✗ não respondeu em 5 s`), versões com limite de 15 s, falta vira código 1 | `gdm-yoinks.mjs` | o build win7 roda e exige o `✓` |
| Análise com `-v`: etapas no spinner (`baixando a página`, `baixando o player`, `resolvendo o desafio JS`…), cronômetro a partir de 2 s, aviso depois de 20 s de desafio no QuickJS | `etapaDoYtDlp`, `spinner`, `acompanhaAnalise` | simulação do 7 (abaixo) |
| `--tempo-limite` (padrão 5 min no 7, 2 min nos outros; chave `tempoLimite` na config) | `gdm-yoinks.mjs`, `config.mjs` | `--tempo-limite 2` encerra em 2,9 s |
| `--log`: stderr do yt-dlp em `%TEMP%\gdm-extractor-<data>.log`, linha a linha, com runtime e comando no cabeçalho | `abreLog` | arquivo gerado, também no caso de estouro |
| Instalador win7 exige também o `api-ms-win-crt-runtime-l1-1-0.dll` | `gdm-yoinks.iss` | compila (ISCC) |
| 16 cores (`nivelDeCor`, `ansi16`), glifos ASCII (`glifosAscii`, `paraAscii` em toda a saída), logo compacto de 73 colunas no `logo.md`, logo em `#` no modo ASCII | `ferramentas.mjs`, `gdm-yoinks.mjs`, `logo.md` | simulação do 7 (abaixo) |

A simulação do 7 roda o programa com um preload que troca o `os.release()` por `6.1.7601` e
finge um terminal de 80 colunas. A saída de um download do YouTube só teve códigos de 16 cores
e, fora do ASCII, só `· á í ×`. Isso confere as **sequências** que o programa manda, não como o
conhost do 7 as mostra: a emulação do libuv e a fonte só se conferem no 7 de verdade.

**Próximo passo:** mandar ao amigo o `gdm-extractor-0.1.1-win7-setup.exe` e pedir:

```bat
cd /d D:\MinhasCoisas\gdm-yoinks
tools\qjs.exe -e "print(1)"
runtime\node.exe app\gdm-yoinks.mjs --diagnostico
runtime\node.exe app\gdm-yoinks.mjs --log https://youtu.be/9N7oSJiKwiQ
```

| Resultado | Indica |
|---|---|
| `qjs` imprime `1`, `js … ✓` e o YouTube baixa | resolvido |
| `qjs` imprime `1`, mas o YouTube estoura os 5 min | H1 (lentidão de verdade); o log mostra em que etapa |
| `qjs` ainda trava | não era o mimalloc nem o UCRT; o programa já recusa o YouTube em 5 s; seguir o segundo roteiro da seção 1.6 (evento 26) |

---

## 2. Visual: por que não apareceu e o que fazer

### 2.1. O PowerShell não é a causa

O programa inteiro é Node; o PowerShell só é usado para **ler a área de transferência**
(`leAreaDeTransferencia()`, com o fallback `Windows.Forms` para o PowerShell 2.0 do 7). Ele não
desenha nada. O que aconteceu tem três causas, todas no próprio programa:

1. **A tela cheia e as cores são desligadas de propósito.** `terminalLimitado()`
   (`ferramentas.mjs`) devolve `true` para qualquer Windows antes do 10 1809, e o programa cai
   no modo linha **sem cor** (Instalador §9). A decisão foi tomada porque o conhost do 7 não
   entende sequências VT (truecolor `38;2`, tela alternativa `?1049h`, `?2026h`).
2. **O logo não coube.** O desenho do `logo.md` tem 82 colunas e o cmd do 7 abre com 80; o
   `cabecalho()` cai para o selo simples. Por isso a captura só mostra `gdm-extractor` e o
   letreiro em binário.
3. **Glifos que a fonte do console não tem.** A fonte padrão do conhost do 7 (Lucida Console /
   raster) não tem o `›` (U+203A) nem o braille do spinner (`⠋⠙⠹…`), que viram `▯`. O mesmo
   aconteceria com `✔ ✖ ━ ★ ↵ ⇧ ╭ ╰ ┣ ┫` assim que aparecessem (tamanho final, barra de
   progresso, menu). O `·` e o `…` aparecem porque estão na página de código.

### 2.2. O que dá para recuperar

O Node no Windows não manda as sequências cruas ao console: o libuv **emula** uma parte delas
quando o console não suporta VT. Isso inclui as 16 cores básicas (`30–37`, `90–97`, `40–47`),
negrito, mover o cursor, apagar linha (`2K`) e mostrar/esconder o cursor. É por isso que o
`\r\x1b[2K` do spinner já funciona no 7 sem aparecer lixo na tela. Fica de fora: truecolor,
tela alternativa e sincronização (`?2026h`).

Proposta, em ordem de custo:

| Passo | O quê | Custo |
|---|---|---|
| A | **Glifos ASCII no Windows < 10.** Um conjunto alternativo escolhido no início: spinner `| / - \`, `›`→`>`, `✔`→`ok`, `✖`→`x`, `━`→`=`/`-`, `★`→`*`, `↑↓`→`setas`, cantos `╭╰`→`+`. Um objeto `G` (glifos) no lugar dos literais espalhados | baixo |
| B | **Paleta de 16 cores.** Em vez de `semCor` tudo-ou-nada, três níveis: `truecolor`, `16` e `nenhuma`. No nível 16, `cor()` mapeia cada cor da paleta Fósforo para a ANSI mais próxima (`acento`/`p4` → verde claro `92`, `perigo` → vermelho `91`, `fraco`/`borda` → cinza `90`, `texto` → branco `37`). O `NO_COLOR` continua desligando tudo | baixo |
| C | **Logo que cabe em 80 colunas.** Cortar o desenho para ≤ 76 colunas, ou uma versão menor no `logo.md` usada quando a principal não cabe | baixo |
| D | **Tela cheia "pobre" no 7.** Sem tela alternativa: limpar a tela (`2J`) ao abrir e ao sair, redesenhar linha a linha com 16 cores e glifos ASCII, sem o `?2026h`. Precisa testar o redesenho com a emulação do libuv, que é mais lenta | médio/alto; deixar para depois |
| E | **Janela maior no atalho.** No alvo win7, o atalho pode abrir com `cmd /c "mode con cols=100 lines=32 && node …"` para o logo caber. Tamanho de fonte e fonte do console não dá para escolher pelo atalho de forma confiável | baixo, mas mexe no `.iss` |

O `chcp 65001` **não** resolve: a fonte continua sem os glifos, e o UTF-8 no conhost do 7 tem
bugs conhecidos de leitura de teclado.

Recomendação: **A + B + C** no patch. Juntas elas deixam o modo linha do 7 com cara de
gdm-extractor (verde Fósforo, sem `▯`) sem mexer na tela cheia. D só se o 7 tiver uso que
justifique.

### 2.3. Onde mexer

- `ferramentas.mjs`: `terminalLimitado()` vira `nivelDeCor()` (`"truecolor" | "16" |
  "nenhuma"`) e uma função `glifosAscii()` (Windows < 10, `TERM=linux`). As duas puras, com
  testes em `tests/ferramentas.test.mjs`.
- `gdm-yoinks.mjs`: `cor()`/`fundo()` olham o nível; `QUADROS` e os literais de glifo passam
  pelo objeto `G`. A tela cheia continua exigindo truecolor.
- `logo.md`: segunda versão do desenho, ou o desenho atual cortado.

---

## 3. Plano do patch (0.1.1)

| Ordem | Item | Seção | Situação |
|---|---|---|---|
| 1 | Pedir o diagnóstico ao amigo | 1.4, 1.6, 1.7 | feito duas vezes: **H2**, o `qjs.exe` oficial não abre; o UCRT dele funciona |
| 2 | `qjs.exe` do win7 compilado por nós (w64devkit, `msvcrt`, sem mimalloc) | 1.6 (1), 1.7 | feito; falta rodar no 7 |
| 3 | Prova do runtime JS com limite de 5 s antes de usar; falhou → YouTube "não suportado" na hora | 1.6 (2) | feito |
| 4 | Tempo e etapa no spinner da análise | 1.5 (1, 2) | feito |
| 5 | Limite de tempo configurável na análise, com mensagem útil | 1.5 (3) | feito |
| 6 | `--log` | 1.5 (4) | feito |
| 7 | Prova do QuickJS **e do ffmpeg** no `--diagnostico` e no fim do instalador; conferência do UCRT mais rigorosa | 1.5 (5), 1.6 (3, 4) | feito (o fim do instalador já mostra o `--diagnostico`) |
| 8 | Glifos ASCII, 16 cores e logo de 80 colunas | 2.2 (A, B, C) | feito; conferido só por simulação |
| 9 | README: YouTube no win7 pode ser lento ou não suportado; o visual é reduzido | — | feito |

Diferenças em relação ao plano da seção 2.2: o `✔` virou `+` (e não `ok`), para não mudar a
largura das linhas; os glifos não passam por um objeto `G`, mas por um filtro (`paraAscii`) em
toda a escrita no stdout/stderr, que pega também os literais que ninguém lembraria de trocar; o
spinner, a barra (`#`/`-`) e o logo (`#`) têm versões próprias, porque precisam de mais que uma
troca de caractere. O letreiro fica parado fora do truecolor, porque anima salvando e
restaurando o cursor (`ESC 7`/`ESC 8`), e não há garantia de que a emulação do 7 entenda isso.

Os itens 3 a 8 melhoram também o Windows 10 e o Linux (o tempo-limite e o `--log` valem para
qualquer sistema), então não são código só para o 7.

**Teste antes de publicar:** uma VM com Windows 7 SP1 + KB2999226, com o instalador win7
**sem** o `/DTesteForaDoWin7`, rodando: um link do X, um do YouTube curto, um do YouTube longo e
o `--diagnostico`, além da prova de execução de cada binário (seção 1.6, item 5). É o teste que a Instalador §11.2 já pedia e que ainda não foi feito; o
relato do amigo mostra que o teste no Windows 10 não substitui ele.
