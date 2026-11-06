# Build do instalador do gdm-extractor para Windows (Instalador-Implement.md, seção 6).
#
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1            # stage + setup.exe
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1 -SoStage   # só monta e confere o stage
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1 -Alvo win7 # instalador do Windows 7 (seção 11.2)
#
# 1. baixa Node, yt-dlp e ffmpeg (e, no win7, o QuickJS-NG) para installer\cache (uma vez) e confere o SHA-256;
# 2. monta installer\stage (ou stage-win7) no layout da instalação (bin, app, runtime, tools, licencas, arte);
# 3. confere os encoders do ffmpeg, os imports do Windows 7 (só no win7), roda os testes com o Node
#    embutido e o --diagnostico;
# 4. chama o ISCC, que gera installer\saida\gdm-extractor-<versão>[-win7]-setup.exe.
#
# No win7, o QuickJS-NG é compilado do código-fonte com o gcc do w64devkit (ligado ao msvcrt.dll,
# sem o UCRT e sem o mimalloc): o binário oficial não abre no Windows 7 (docs/Win7-Patch.md, 1.6).
# O gcc vem do PATH ou de -Gcc.
[CmdletBinding()]
param(
    [switch]$SoStage,
    [string]$Iscc,
    [string]$Gcc,
    [ValidateSet('win10', 'win7')]
    [string]$Alvo = 'win10'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # a barra do Invoke-WebRequest deixa o download muito lento no 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Instalador = $PSScriptRoot
$Raiz = Split-Path $Instalador -Parent
$Cache = Join-Path $Instalador 'cache'
$Win7 = $Alvo -eq 'win7'
$Sufixo = if ($Win7) { '-win7' } else { '' }
$Stage = Join-Path $Instalador "stage$Sufixo"
$Saida = Join-Path $Instalador 'saida'

function Etapa($texto) { Write-Host "`n== $texto" -ForegroundColor Green }
function Falha($texto) { Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }

$versoes = Get-Content (Join-Path $Instalador "versoes$Sufixo.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$pacote = Get-Content (Join-Path $Raiz 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Versao = $pacote.version

# ── 1. Downloads ──────────────────────────────────────────────────────────────
# $nome dá outro nome no cache quando dois arquivos têm o mesmo fim de URL (ex.: duas LICENSE).
function Baixa($url, $sha256, $nome) {
    if (-not $nome) { $nome = Split-Path $url -Leaf }
    $destino = Join-Path $Cache $nome
    if (-not (Test-Path $destino)) {
        Write-Host "baixando $nome"
        $temp = "$destino.parcial"
        Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing
        Move-Item $temp $destino -Force
    }
    $hash = (Get-FileHash $destino -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $sha256.ToLower()) {
        Falha "SHA-256 de $nome não confere.`n  esperado: $sha256`n  obtido:   $hash`nApague $destino se o download estiver corrompido, ou atualize o versoes.json."
    }
    Write-Host "ok  $nome"
    return $destino
}

# Extrai do zip as entradas cujo caminho termina em um dos sufixos (ex.: '/bin/ffmpeg.exe').
function ExtraiDoZip($zip, $destino, [string[]]$sufixos, [switch]$TodaPasta) {
    New-Item -ItemType Directory -Force $destino | Out-Null
    $arq = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        $achados = @{}
        foreach ($e in $arq.Entries) {
            if (-not $e.Name) { continue }
            foreach ($s in $sufixos) {
                $casa = if ($TodaPasta) { $e.FullName -like "*$s*" } else { $e.FullName.EndsWith($s) }
                if ($casa) {
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $destino $e.Name), $true)
                    $achados[$s] = $true
                }
            }
        }
        foreach ($s in $sufixos) { if (-not $achados[$s]) { Falha "$s não encontrado em $(Split-Path $zip -Leaf)" } }
    } finally { $arq.Dispose() }
}

Etapa "versão $Versao · alvo $Alvo · downloads"
New-Item -ItemType Directory -Force $Cache | Out-Null
$zipNode = Baixa $versoes.node.url $versoes.node.sha256
$ytdlp = Baixa $versoes.ytdlp.url $versoes.ytdlp.sha256
$licYtdlp = Baixa $versoes.ytdlp.licenca.url $versoes.ytdlp.licenca.sha256 $versoes.ytdlp.licenca.arquivo
$zipFfmpeg = Baixa $versoes.ffmpeg.url $versoes.ffmpeg.sha256
# Compila o qjs.exe a partir do código-fonte (docs/Win7-Patch.md, seção 1.6). Os arquivos e as
# definições são os do alvo qjs_exe do CMakeLists.txt do QuickJS-NG, sem QJS_USE_MIMALLOC. O -static
# embute a libgcc e a winpthreads: sobram só KERNEL32 e msvcrt, que existem em qualquer Windows 7.
$FlagsQjs = @('-O2', '-std=gnu11', '-funsigned-char', '-w', '-DQUICKJS_NG_BUILD', '-D_GNU_SOURCE',
    '-DWIN32_LEAN_AND_MEAN', '-D_WIN32_WINNT=0x0601')
function CompilaQjs($tgz, $versao) {
    $destino = Join-Path $Cache "qjs-$versao-win7.exe"
    if (Test-Path $destino) { Write-Host "ok  $(Split-Path $destino -Leaf) (já compilado)"; return $destino }
    if (-not $Gcc) { $Gcc = (Get-Command gcc -ErrorAction SilentlyContinue).Source }
    if (-not $Gcc) { Falha 'gcc não encontrado. Instale o w64devkit (https://github.com/skeeto/w64devkit) e ponha a pasta bin no PATH, ou passe -Gcc.' }
    $fontes = Join-Path $Cache "quickjs-$versao-fonte"
    if (Test-Path $fontes) { Remove-Item $fontes -Recurse -Force }
    New-Item -ItemType Directory -Force $fontes | Out-Null
    # O tar do Windows (bsdtar); o do w64devkit, se vier antes no PATH, não entende C:\.
    & "$env:SystemRoot\System32\tar.exe" -xzf $tgz -C $fontes --strip-components 1
    if ($LASTEXITCODE -ne 0) { Falha "não deu para extrair $(Split-Path $tgz -Leaf)" }
    Write-Host "compilando o qjs.exe com $Gcc (leva ~30 s)"
    Push-Location $fontes
    try {
        & $Gcc @FlagsQjs -o $destino qjs.c gen/repl.c gen/standalone.c quickjs.c libregexp.c libunicode.c `
            dtoa.c quickjs-libc.c -static -static-libgcc '-Wl,--stack,8388608' -lm
        if ($LASTEXITCODE -ne 0) { Falha 'a compilação do qjs.exe falhou' }
    } finally { Pop-Location }
    # Conferência que faltou no 0.1.0: o binário não pode depender do UCRT.
    $objdump = Join-Path (Split-Path $Gcc -Parent) 'objdump.exe'
    $dlls = (& $objdump -p $destino | Select-String 'DLL Name:\s*(\S+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }) -join ', '
    if ($dlls -match 'api-ms-win-crt|ucrtbase') {
        Remove-Item $destino
        Falha "o qjs.exe compilado depende do UCRT ($dlls); use um gcc ligado ao msvcrt, como o do w64devkit"
    }
    Write-Host "ok  qjs-$versao-win7.exe ($dlls)"
    return $destino
}

# Runtime JS do yt-dlp quando o Node embutido é menor que o 22 (seções 2.6 e 11.2).
if ($versoes.quickjs) {
    if ($versoes.quickjs.compilar) {
        $c = $versoes.quickjs.compilar
        $qjs = CompilaQjs (Baixa $c.url $c.sha256 $c.arquivo) $versoes.quickjs.versao
    } else {
        $qjs = Baixa $versoes.quickjs.url $versoes.quickjs.sha256
    }
    $licQjs = Baixa $versoes.quickjs.licenca.url $versoes.quickjs.licenca.sha256 $versoes.quickjs.licenca.arquivo
}

# ── 2. Stage ──────────────────────────────────────────────────────────────────
Etapa 'montando o stage'
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
$pastas = 'bin', 'app', 'runtime', 'tools', 'licencas', 'arte'
foreach ($p in $pastas) { New-Item -ItemType Directory -Force (Join-Path $Stage $p) | Out-Null }

Copy-Item (Join-Path $Instalador 'gdm-extractor.cmd') (Join-Path $Stage 'bin')
foreach ($f in $pacote.files + 'package.json') { Copy-Item (Join-Path $Raiz $f) (Join-Path $Stage 'app') }

$pastaNode = "node-v$($versoes.node.versao)-win-x64"
ExtraiDoZip $zipNode (Join-Path $Stage 'runtime') @("$pastaNode/node.exe")
ExtraiDoZip $zipNode (Join-Path $Stage 'licencas') @("$pastaNode/LICENSE")
Rename-Item (Join-Path $Stage 'licencas\LICENSE') 'node-LICENSE.txt'

Copy-Item $ytdlp (Join-Path $Stage 'tools\yt-dlp.exe')
Copy-Item $licYtdlp (Join-Path $Stage 'licencas\yt-dlp-LICENSE.txt')

if ($qjs) {
    Copy-Item $qjs (Join-Path $Stage 'tools\qjs.exe')
    Copy-Item $licQjs (Join-Path $Stage 'licencas\quickjs-ng-LICENSE.txt')
}

# Win10 (BtbN, shared): ffmpeg.exe e ffprobe.exe usam as mesmas DLLs, que ficam ao lado deles em tools\.
# Win7 (gyan.dev essentials, estático): só os dois .exe, sem DLLs.
ExtraiDoZip $zipFfmpeg (Join-Path $Stage 'tools') @('/bin/ffmpeg.exe', '/bin/ffprobe.exe')
ExtraiDoZip $zipFfmpeg (Join-Path $Stage 'tools') @('/bin/') -TodaPasta
Remove-Item (Join-Path $Stage 'tools\ffplay.exe') -ErrorAction SilentlyContinue
ExtraiDoZip $zipFfmpeg (Join-Path $Stage 'licencas') @($versoes.ffmpeg.licencaNoZip)
Rename-Item (Join-Path $Stage "licencas\$(Split-Path $versoes.ffmpeg.licencaNoZip -Leaf)") 'ffmpeg-LICENSE.txt'
if ($Win7) {
    # O README.txt do gyan.dev traz a configuração do build (bibliotecas e versões), útil para a GPL.
    ExtraiDoZip $zipFfmpeg (Join-Path $Stage 'licencas') @('/README.txt')
    Rename-Item (Join-Path $Stage 'licencas\README.txt') 'ffmpeg-BUILD.txt'
}

Copy-Item (Join-Path $Raiz 'LICENSE') (Join-Path $Stage 'licencas\gdm-yoinks-LICENSE.txt')
$projetoNode = if ($versoes.node.projeto) { "`n  build: $($versoes.node.projeto)" } else { '' }
$projetoYtdlp = if ($versoes.ytdlp.projeto) { "`n  build: $($versoes.ytdlp.projeto)" } else { '' }
$projetoQjs = if ($versoes.quickjs.compilar) {
    "`n  build: $($versoes.quickjs.projeto)`n  flags: $($FlagsQjs -join ' ') -static -static-libgcc"
} else { '' }
$blocoQjs = if ($versoes.quickjs) { @"

QuickJS-NG $($versoes.quickjs.versao) (MIT; runtime JS do yt-dlp para o YouTube)
  $($versoes.quickjs.fonte)$projetoQjs
"@ } else { '' }
$fontes = @"
Código-fonte dos programas distribuídos com o gdm-extractor $Versao ($Alvo)
====================================================================

gdm-extractor (GPL-3.0-or-later)
  https://github.com/Mvfm-25/gdm-yoinks/tree/v$Versao

Node.js $($versoes.node.versao) (MIT e as licenças em node-LICENSE.txt)
  $($versoes.node.fonte)$projetoNode

yt-dlp $($versoes.ytdlp.versao) (Unlicense)
  $($versoes.ytdlp.fonte)$projetoYtdlp
$blocoQjs
FFmpeg $($versoes.ffmpeg.versao) (GPL; build $($versoes.ffmpeg.autor))
  código do FFmpeg:       $($versoes.ffmpeg.fonte)
  scripts e dependências: $($versoes.ffmpeg.scripts)
  binários usados:        $($versoes.ffmpeg.url)
"@
Set-Content -Path (Join-Path $Stage 'licencas\FONTES.txt') -Value $fontes -Encoding UTF8

& node (Join-Path $Instalador 'arte\gera-arte.mjs') (Join-Path $Stage 'arte')
if ($LASTEXITCODE -ne 0) { Falha 'gera-arte.mjs falhou' }

# ── 3. Conferências ───────────────────────────────────────────────────────────
Etapa 'conferindo os encoders do ffmpeg'
$encoders = & (Join-Path $Stage 'tools\ffmpeg.exe') -hide_banner -encoders 2>$null | Out-String
$faltam = @($versoes.encoders | Where-Object { $encoders -notmatch "(?m)^\s*\S+\s+$([regex]::Escape($_))\s" })
if ($faltam.Count) { Falha "o ffmpeg do build não tem: $($faltam -join ', ')" }
Write-Host "ok  $($versoes.encoders -join ', ')"

if ($Win7) {
    # Funções e DLLs do Windows 8+ nos imports fazem o Windows 7 recusar o programa ao abrir.
    Etapa 'conferindo os imports do Windows 7'
    & node (Join-Path $Instalador 'confere-win7.mjs') (Join-Path $Stage 'runtime') (Join-Path $Stage 'tools')
    if ($LASTEXITCODE -ne 0) { Falha 'há binários que importam funções que o Windows 7 não tem' }
}

$node = Join-Path $Stage 'runtime\node.exe'
Etapa 'testes com o Node embutido'
Push-Location $Raiz
try { & $node --test; if ($LASTEXITCODE -ne 0) { Falha 'os testes falharam' } } finally { Pop-Location }

Etapa 'diagnóstico do stage'
# Sem PATH do sistema: as três ferramentas precisam vir da pasta tools.
$pathAntigo = $env:PATH
$env:PATH = "$env:SystemRoot\System32"
try {
    $diag = & $node (Join-Path $Stage 'app\gdm-yoinks.mjs') --diagnostico | Out-String
    $codigo = $LASTEXITCODE
} finally { $env:PATH = $pathAntigo }
Write-Host $diag
if ($codigo -ne 0) { Falha "--diagnostico saiu com $codigo" }
foreach ($f in 'yt-dlp', 'ffmpeg', 'ffprobe') {
    if ($diag -notmatch "(?m)^$f\s.*\(embutida\)") { Falha "$f não veio da pasta tools" }
}
# Node < 22: o runtime JS do YouTube tem que ser o QuickJS-NG da pasta tools (seção 11.2).
if ($qjs -and $diag -notmatch '(?m)^js\s+quickjs:.*\\tools\\qjs\.exe') { Falha 'o runtime JS não é o qjs.exe embutido' }

if ($SoStage) { Etapa "stage pronto em $Stage"; exit 0 }

# ── 4. Inno Setup ─────────────────────────────────────────────────────────────
Etapa 'compilando o instalador'
if (-not $Iscc) {
    $Iscc = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Iscc) { Falha 'ISCC.exe não encontrado. Instale o Inno Setup 6 (winget install JRSoftware.InnoSetup) ou passe -Iscc.' }
& $Iscc "/DVersao=$Versao" "/DStage=$Stage" "/DAlvo=$Alvo" "/O$Saida" (Join-Path $Instalador 'gdm-yoinks.iss')
if ($LASTEXITCODE -ne 0) { Falha 'o ISCC falhou' }
$setup = Join-Path $Saida "gdm-extractor-$Versao$Sufixo-setup.exe"
Etapa ("pronto: $setup ({0:N1} MB)" -f ((Get-Item $setup).Length / 1MB))
