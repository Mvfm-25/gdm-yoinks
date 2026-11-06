; gdm-extractor: instalador para Windows 10+ e, com /DAlvo=win7, para o Windows 7 SP1
; (docs/Instalador-Implement.md, seções 3 a 5 e 11.2). Compilado pelo build.ps1, que monta o stage antes:
;   ISCC /DVersao=0.1.1 /DStage=<installer\stage> gdm-yoinks.iss
;   ISCC /DVersao=0.1.1 /DStage=<installer\stage-win7> /DAlvo=win7 gdm-yoinks.iss

#ifndef Versao
  #error Passe a versao: ISCC /DVersao=x.y.z (o build.ps1 faz isso)
#endif
#ifndef Alvo
  #define Alvo "win10"
#endif
#if Alvo == "win7"
  #define Win7
  #define Sufixo "-win7"
#elif Alvo == "win10"
  #define Sufixo ""
#else
  #error Alvo desconhecido: use /DAlvo=win10 ou /DAlvo=win7
#endif
#ifndef Stage
  #define Stage AddBackslash(SourcePath) + "stage" + Sufixo
#endif

[Setup]
; AppId fixo: um setup.exe mais novo instala por cima do anterior (seção 5).
AppId={{8F3C2A41-6D2B-4E57-9B1A-3C7E5D9F0A12}
AppName=gdm-extractor
AppVersion={#Versao}
AppVerName=gdm-extractor {#Versao}
AppPublisher=Mvfm-25
AppPublisherURL=https://github.com/Mvfm-25/gdm-yoinks
AppSupportURL=https://github.com/Mvfm-25/gdm-yoinks/issues
AppUpdatesURL=https://github.com/Mvfm-25/gdm-yoinks/releases
; Por usuário, sem admin: {autopf} vira %LOCALAPPDATA%\Programs. O diálogo deixa escolher "todos os usuários".
DefaultDirName={autopf}\gdm-yoinks
DefaultGroupName=gdm-extractor
DisableProgramGroupPage=yes
DisableDirPage=auto
UsePreviousAppDir=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#ifdef Win7
; Só o Windows 7 SP1: os forks embutidos são para ele, e do 8 em diante vale o instalador normal (seção 11.2).
MinVersion=6.1sp1
; /DTesteForaDoWin7 tira a trava, para testar a instalação num Windows 10+ (seção 14.5). Nunca publicar assim.
#ifndef TesteForaDoWin7
OnlyBelowVersion=6.2
#endif
#else
; Windows 10 1809: o Node 22 exige o 10, e o console antes do 1809 não aguenta a tela cheia (seção 9).
MinVersion=10.0.17763
#endif
ChangesEnvironment=yes
CloseApplications=yes
RestartApplications=no
LicenseFile={#Stage}\licencas\gdm-yoinks-LICENSE.txt
WizardStyle=modern dynamic
WizardImageFile={#Stage}\arte\assistente-100.bmp,{#Stage}\arte\assistente-200.bmp
WizardSmallImageFile={#Stage}\arte\assistente-p-100.bmp,{#Stage}\arte\assistente-p-200.bmp
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
OutputBaseFilename=gdm-extractor-{#Versao}{#Sufixo}-setup
UninstallDisplayName=gdm-extractor {#Versao}
UninstallDisplayIcon={app}\runtime\node.exe
VersionInfoVersion={#Versao}
VersionInfoDescription=Instalador do gdm-extractor

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
ptbr.FinishedLabel=O gdm-extractor foi instalado.%n%nAbra um terminal NOVO (os que já estavam abertos não veem o PATH novo) e digite: gdm-extractor
en.FinishedLabel=gdm-extractor has been installed.%n%nOpen a NEW terminal (terminals that were already open do not see the new PATH) and type: gdm-extractor
; Windows errado: aponta para o outro instalador (seção 11.3).
#ifdef Win7
ptbr.WindowsVersionNotSupported=Este é o instalador do gdm-extractor para o Windows 7 SP1.%n%nNo Windows 10 ou mais novo, use o gdm-extractor-{#Versao}-setup.exe: https://github.com/Mvfm-25/gdm-yoinks/releases
en.WindowsVersionNotSupported=This is the gdm-extractor installer for Windows 7 SP1.%n%nOn Windows 10 or newer, use gdm-extractor-{#Versao}-setup.exe: https://github.com/Mvfm-25/gdm-yoinks/releases
#else
ptbr.WindowsVersionNotSupported=O gdm-extractor precisa do Windows 10 (versão 1809) ou mais novo.%n%nNo Windows 7 SP1, use o gdm-extractor-{#Versao}-win7-setup.exe: https://github.com/Mvfm-25/gdm-yoinks/releases
en.WindowsVersionNotSupported=gdm-extractor requires Windows 10 (version 1809) or newer.%n%nOn Windows 7 SP1, use gdm-extractor-{#Versao}-win7-setup.exe: https://github.com/Mvfm-25/gdm-yoinks/releases
#endif

[CustomMessages]
ptbr.TipoCompleto=Completa (recomendada)
ptbr.TipoPersonalizado=Personalizada
ptbr.CompPrograma=gdm-extractor (programa e Node embutido)
ptbr.CompYtDlp=yt-dlp
ptbr.CompFfmpeg=ffmpeg e ffprobe (com SVT-AV1)
ptbr.TarefaPath=Colocar o comando gdm-extractor no PATH
ptbr.TarefaMenu=Criar atalho no Menu Iniciar
ptbr.TarefaDesktop=Criar atalho na área de trabalho
ptbr.TarefaAtualizar=Atualizar o yt-dlp agora (precisa de internet)
ptbr.Ferramentas=Ferramentas:
ptbr.Atalhos=Atalhos:
ptbr.SemFerramenta=Você desmarcou o %1, e ele não foi encontrado no PATH.%n%nO gdm-extractor não funciona sem ele. Continuar mesmo assim?
ptbr.SaidaTitulo=Configuração inicial
ptbr.SaidaSub=Onde salvar os arquivos?
ptbr.SaidaTexto=Os vídeos e GIFs extraídos vão para esta pasta. Dá para mudar depois com: gdm-extractor --configurar
ptbr.FormatoTitulo=Configuração inicial
ptbr.FormatoSub=Formato padrão
ptbr.FormatoTexto=O que fazer depois de colar um link:
ptbr.FormatoMenu=perguntar sempre (menu)
ptbr.FormatoWebm=WEBM · vp9 · tamanho mínimo
ptbr.FormatoAv1=WEBM · av1 · menor ainda, mais lento
ptbr.FormatoGif=GIF
ptbr.NpmLink=%n%nAtenção: já existe um gdm-extractor do npm link (%1). Os dois disputam o mesmo nome no PATH; para usar o instalado, rode: npm unlink -g gdm-extractor
ptbr.Configurando=Gravando a configuração...
ptbr.Atualizando=Atualizando o yt-dlp...
ptbr.Conferindo=Conferindo a instalação...
ptbr.AtualizarFalhou=A atualização do yt-dlp falhou (sem internet?). O yt-dlp embutido continua funcionando.
ptbr.Diagnostico=Diagnóstico (gdm-extractor --diagnostico):
ptbr.AbrirAgora=Abrir o gdm-extractor agora
ptbr.ApagarConfig=Apagar também a configuração em %1?%n%nOs arquivos baixados não são apagados.
ptbr.CompFfmpegWin7=ffmpeg e ffprobe (AV1 pelo libaom, sem SVT-AV1)
ptbr.SemUcrt=Falta o Universal C Runtime do Windows (atualização KB2999226), que o ffmpeg usa.%n%nInstale-o pelo Windows Update ou em https://support.microsoft.com/kb/2999226 e rode este instalador de novo.
en.TipoCompleto=Full (recommended)
en.TipoPersonalizado=Custom
en.CompPrograma=gdm-extractor (program and bundled Node)
en.CompYtDlp=yt-dlp
en.CompFfmpeg=ffmpeg and ffprobe (with SVT-AV1)
en.TarefaPath=Add the gdm-extractor command to PATH
en.TarefaMenu=Create a Start Menu shortcut
en.TarefaDesktop=Create a desktop shortcut
en.TarefaAtualizar=Update yt-dlp now (needs internet)
en.Ferramentas=Tools:
en.Atalhos=Shortcuts:
en.SemFerramenta=You unchecked %1, and it was not found in PATH.%n%ngdm-extractor does not work without it. Continue anyway?
en.SaidaTitulo=Initial setup
en.SaidaSub=Where should files be saved?
en.SaidaTexto=Extracted videos and GIFs go to this folder. You can change it later with: gdm-extractor --configurar
en.FormatoTitulo=Initial setup
en.FormatoSub=Default format
en.FormatoTexto=What to do after pasting a link:
en.FormatoMenu=always ask (menu)
en.FormatoWebm=WEBM · vp9 · smallest size
en.FormatoAv1=WEBM · av1 · even smaller, slower
en.FormatoGif=GIF
en.NpmLink=%n%nNote: there is already a gdm-extractor from npm link (%1). Both compete for the same name in PATH; to use the installed one, run: npm unlink -g gdm-extractor
en.Configurando=Saving the configuration...
en.Atualizando=Updating yt-dlp...
en.Conferindo=Checking the installation...
en.AtualizarFalhou=Updating yt-dlp failed (no internet?). The bundled yt-dlp still works.
en.Diagnostico=Diagnostics (gdm-extractor --diagnostico):
en.AbrirAgora=Open gdm-extractor now
en.ApagarConfig=Also delete the configuration in %1?%n%nDownloaded files are not deleted.
en.CompFfmpegWin7=ffmpeg and ffprobe (AV1 through libaom, no SVT-AV1)
en.SemUcrt=The Windows Universal C Runtime (update KB2999226), used by ffmpeg, is missing.%n%nInstall it through Windows Update or from https://support.microsoft.com/kb/2999226 and run this installer again.

[Types]
Name: "completa"; Description: "{cm:TipoCompleto}"
Name: "personalizada"; Description: "{cm:TipoPersonalizado}"; Flags: iscustom

[Components]
Name: "programa"; Description: "{cm:CompPrograma}"; Types: completa personalizada; Flags: fixed
Name: "ytdlp"; Description: "{cm:CompYtDlp}"; Types: completa
#ifdef Win7
Name: "ffmpeg"; Description: "{cm:CompFfmpegWin7}"; Types: completa
#else
Name: "ffmpeg"; Description: "{cm:CompFfmpeg}"; Types: completa
#endif

[Tasks]
Name: "path"; Description: "{cm:TarefaPath}"
#ifndef Win7
; No Windows 7 não há "atualizar o yt-dlp": o -U do fork pode trazer o yt-dlp.exe comum,
; que é só para o Windows 10+ (seção 11.2). Atualiza-se com um instalador win7 novo.
Name: "atualizarytdlp"; Description: "{cm:TarefaAtualizar}"; GroupDescription: "{cm:Ferramentas}"; Components: ytdlp
#endif
Name: "iniciar"; Description: "{cm:TarefaMenu}"; GroupDescription: "{cm:Atalhos}"
Name: "desktop"; Description: "{cm:TarefaDesktop}"; GroupDescription: "{cm:Atalhos}"; Flags: unchecked

[InstallDelete]
; Componente desmarcado numa atualização: tira o que a versão anterior pôs.
Type: files; Name: "{app}\tools\yt-dlp.exe"; Components: not ytdlp
Type: files; Name: "{app}\tools\yt-dlp.exe.old"
Type: files; Name: "{app}\tools\ff*.exe"; Components: not ffmpeg
Type: files; Name: "{app}\tools\*.dll"; Components: not ffmpeg
; As licenças mudam com o alvo (o win7 tem as do QuickJS-NG e do build do ffmpeg): sempre do zero.
Type: filesandordirs; Name: "{app}\licencas"
#ifdef Win7
; Vindo de um win10 (não deveria, mas o AppId é o mesmo): as DLLs do ffmpeg shared não servem aqui.
Type: files; Name: "{app}\tools\*.dll"
#else
; Vindo de um win7: o QuickJS só serve com o Node < 22.
Type: files; Name: "{app}\tools\qjs.exe"
#endif

[Files]
Source: "{#Stage}\bin\*"; DestDir: "{app}\bin"; Components: programa; Flags: ignoreversion
Source: "{#Stage}\app\*"; DestDir: "{app}\app"; Components: programa; Flags: ignoreversion
Source: "{#Stage}\runtime\*"; DestDir: "{app}\runtime"; Components: programa; Flags: ignoreversion
Source: "{#Stage}\licencas\*"; DestDir: "{app}\licencas"; Components: programa; Flags: ignoreversion
Source: "{#Stage}\tools\yt-dlp.exe"; DestDir: "{app}\tools"; Components: ytdlp; Flags: ignoreversion
#ifdef Win7
; O QuickJS-NG vai com o programa: é o runtime JS do YouTube mesmo com um yt-dlp do PATH (seção 2.6).
Source: "{#Stage}\tools\qjs.exe"; DestDir: "{app}\tools"; Components: programa; Flags: ignoreversion
#endif
Source: "{#Stage}\tools\*"; Excludes: "yt-dlp.exe,qjs.exe"; DestDir: "{app}\tools"; Components: ffmpeg; Flags: ignoreversion

[Icons]
; Abre no Windows Terminal (truecolor para a tela cheia); sem ele, no cmd (seção 4.4).
Name: "{autoprograms}\gdm-extractor"; Filename: "{code:Terminal}"; Parameters: "{code:ArgsTerminal}"; WorkingDir: "{%USERPROFILE}"; Tasks: iniciar
Name: "{autoprograms}\Desinstalar gdm-extractor"; Filename: "{uninstallexe}"; Tasks: iniciar
Name: "{autodesktop}\gdm-extractor"; Filename: "{code:Terminal}"; Parameters: "{code:ArgsTerminal}"; WorkingDir: "{%USERPROFILE}"; Tasks: desktop

[Run]
Filename: "{code:Terminal}"; Parameters: "{code:ArgsTerminal}"; WorkingDir: "{%USERPROFILE}"; Description: "{cm:AbrirAgora}"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
; O yt-dlp -U deixa o executável antigo como yt-dlp.exe.old.
Type: filesandordirs; Name: "{app}\tools"
Type: dirifempty; Name: "{app}"

[Code]
var
  PaginaSaida: TInputDirWizardPage;
  PaginaFormato: TInputOptionWizardPage;
  SaidaInicial, FormatoInicial, Diagnostico: String;
  ConfigExiste, AtualizacaoFalhou: Boolean;

const
  FORMATOS = 'menu,webm,av1,gif';

#ifdef Win7
{ O ffmpeg do gyan.dev importa o Universal C Runtime (api-ms-win-crt-*), que o Windows 7 só
  tem com a KB2999226. Sem ele, o ffmpeg nem abre. Confere o ucrtbase.dll e também uma das
  DLLs api-ms-win-crt-*, que é o que o ffmpeg importa de fato: só o ucrtbase.dll pode ter
  vindo de outro programa (docs/Win7-Patch.md, seção 1.6). O QuickJS do win7 é compilado
  pelo build.ps1 com o msvcrt e não precisa do UCRT. }
function InitializeSetup: Boolean;
begin
  Result := FileExists(ExpandConstant('{sys}\ucrtbase.dll'))
    and FileExists(ExpandConstant('{sys}\api-ms-win-crt-runtime-l1-1-0.dll'));
  if not Result then
    SuppressibleMsgBox(CustomMessage('SemUcrt'), mbCriticalError, MB_OK, IDOK);
end;
#endif

{ ── Utilidades ───────────────────────────────────────────────────────────── }

function PastaConfig: String;
begin
  Result := GetEnv('USERPROFILE') + '\.gdm-yoinks';
end;

function NodeEmbutido(const App: String): String;
begin
  Result := App + '\runtime\node.exe';
end;

function Programa(const App: String): String;
begin
  Result := '"' + App + '\app\gdm-yoinks.mjs"';
end;

{ Uma pasta como argumento: sem a \ final, que escaparia a aspa de fechamento. }
function ArgPasta(const Pasta: String): String;
var
  P: String;
begin
  P := RemoveBackslashUnlessRoot(Pasta);
  if (Length(P) > 0) and (P[Length(P)] = '\') then
    P := P + '.';
  Result := '"' + P + '"';
end;

function IndiceFormato(const F: String): Integer;
begin
  case F of
    'webm': Result := 1;
    'av1': Result := 2;
    'gif': Result := 3;
  else
    Result := 0;
  end;
end;

function FormatoDoIndice(I: Integer): String;
begin
  case I of
    1: Result := 'webm';
    2: Result := 'av1';
    3: Result := 'gif';
  else
    Result := 'menu';
  end;
end;

{ ── PATH (seção 3.2): HKCU\Environment, sem duplicar, sem trocar o tipo ──── }

function RaizEnv: Integer;
begin
  if IsAdminInstallMode then Result := HKEY_LOCAL_MACHINE else Result := HKEY_CURRENT_USER;
end;

function ChaveEnv: String;
begin
  if IsAdminInstallMode then
    Result := 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
  else
    Result := 'Environment';
end;

function NormalizaDir(const S: String): String;
begin
  Result := Lowercase(RemoveBackslashUnlessRoot(Trim(S)));
end;

{ O PATH sem as entradas iguais a Dir (sem diferenciar maiúsculas nem a \ final). }
function PathSem(const Path, Dir: String; var Achou: Boolean): String;
var
  Resto, Item: String;
  P: Integer;
begin
  Result := '';
  Achou := False;
  Resto := Path + ';';
  while Resto <> '' do
  begin
    P := Pos(';', Resto);
    Item := Copy(Resto, 1, P - 1);
    Delete(Resto, 1, P);
    if Item = '' then Continue;
    if NormalizaDir(Item) = NormalizaDir(Dir) then
      Achou := True
    else if Result = '' then
      Result := Item
    else
      Result := Result + ';' + Item;
  end;
end;

{ O Pascal do Inno não lê o tipo do valor. Para não trocar o tipo do PATH de
  ninguém: com %VARIAVEL% dentro (ou sem PATH ainda) grava REG_EXPAND_SZ; sem,
  continua REG_SZ, que é o que um PATH sem % costuma ser. }
procedure GravaPath(const Antes, Depois: String);
begin
  if (Antes = '') or (Pos('%', Antes) > 0) then
    RegWriteExpandStringValue(RaizEnv, ChaveEnv, 'Path', Depois)
  else
    RegWriteStringValue(RaizEnv, ChaveEnv, 'Path', Depois);
end;

procedure AdicionaAoPath(const Dir: String);
var
  Atual: String;
  Achou: Boolean;
begin
  if not RegQueryStringValue(RaizEnv, ChaveEnv, 'Path', Atual) then Atual := '';
  PathSem(Atual, Dir, Achou);
  if Achou then Exit;
  if (Atual <> '') and (Atual[Length(Atual)] <> ';') then Atual := Atual + ';';
  GravaPath(Atual, Atual + Dir);
end;

procedure RemoveDoPath(const Dir: String);
var
  Atual, Novo: String;
  Achou: Boolean;
begin
  if not RegQueryStringValue(RaizEnv, ChaveEnv, 'Path', Atual) then Exit;
  Novo := PathSem(Atual, Dir, Achou);
  if Achou then GravaPath(Atual, Novo);
end;

{ ── Atalhos: Windows Terminal ou cmd ─────────────────────────────────────── }

function CaminhoWt: String;
begin
  Result := ExpandConstant('{localappdata}\Microsoft\WindowsApps\wt.exe');
end;

function Terminal(Param: String): String;
begin
  if FileExists(CaminhoWt) then Result := CaminhoWt else Result := ExpandConstant('{cmd}');
end;

{ O node.exe direto, sem o .cmd: assim o Ctrl+C não cai na pergunta do cmd (seção 3.1). }
function ArgsTerminal(Param: String): String;
var
  App: String;
begin
  App := ExpandConstant('{app}');
  if FileExists(CaminhoWt) then
    Result := '--title gdm-extractor -d . "' + NodeEmbutido(App) + '" ' + Programa(App)
  else
    Result := '/k ""' + NodeEmbutido(App) + '" ' + Programa(App) + '"';
end;

{ ── Configuração inicial (seção 4.2) ──────────────────────────────────────── }

{ Numa atualização, lê a config pelo programa da instalação anterior (--configurar --mostra). }
procedure CarregaConfigAnterior;
var
  App, Linha: String;
  Saida: TExecOutput;
  Codigo, I: Integer;
begin
  App := WizardForm.PrevAppDir;
  if (App = '') or not FileExists(NodeEmbutido(App)) then Exit;
  if not ExecAndCaptureOutput(NodeEmbutido(App), Programa(App) + ' --configurar --mostra', '',
    SW_HIDE, ewWaitUntilTerminated, Codigo, Saida) or (Codigo <> 0) then Exit;
  for I := 0 to GetArrayLength(Saida.StdOut) - 1 do
  begin
    Linha := Saida.StdOut[I];
    if Pos('saida=', Linha) = 1 then SaidaInicial := Copy(Linha, 7, MaxInt);
    if Pos('formato=', Linha) = 1 then FormatoInicial := Copy(Linha, 9, MaxInt);
  end;
end;

procedure InitializeWizard;
var
  Npm, Texto: String;
begin
  SaidaInicial := GetEnv('USERPROFILE') + '\Downloads';
  FormatoInicial := 'menu';
  ConfigExiste := FileExists(PastaConfig + '\config.json');
  CarregaConfigAnterior;

  PaginaSaida := CreateInputDirPage(wpSelectTasks, CustomMessage('SaidaTitulo'), CustomMessage('SaidaSub'),
    CustomMessage('SaidaTexto'), False, '');
  PaginaSaida.Add('');
  PaginaSaida.Values[0] := SaidaInicial;

  Texto := CustomMessage('FormatoTexto');
  Npm := ExpandConstant('{userappdata}\npm\gdm-extractor.cmd');
  if FileExists(Npm) then Texto := Texto + FmtMessage(CustomMessage('NpmLink'), [Npm]);
  PaginaFormato := CreateInputOptionPage(PaginaSaida.ID, CustomMessage('FormatoTitulo'),
    CustomMessage('FormatoSub'), Texto, True, False);
  PaginaFormato.Add(CustomMessage('FormatoMenu'));
  PaginaFormato.Add(CustomMessage('FormatoWebm'));
  PaginaFormato.Add(CustomMessage('FormatoAv1'));
  PaginaFormato.Add(CustomMessage('FormatoGif'));
  PaginaFormato.SelectedValueIndex := IndiceFormato(FormatoInicial);
end;

{ Componente desmarcado sem a ferramenta no PATH: avisa (seção 4.1). }
function ConfereFerramenta(const Componente, Exe, Nome: String): Boolean;
begin
  Result := True;
  if WizardIsComponentSelected(Componente) then Exit;
  if FileSearch(Exe, GetEnv('PATH')) <> '' then Exit;
  Result := SuppressibleMsgBox(FmtMessage(CustomMessage('SemFerramenta'), [Nome]),
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectComponents then
    Result := ConfereFerramenta('ytdlp', 'yt-dlp.exe', 'yt-dlp')
      and ConfereFerramenta('ffmpeg', 'ffmpeg.exe', 'ffmpeg');
end;

{ Grava só o que mudou (ou tudo, se ainda não há config), pelo próprio programa (seção 2.4). }
procedure GravaConfig(const App: String);
var
  Args, Formato: String;
  Codigo: Integer;
begin
  Args := '';
  if not ConfigExiste or (CompareText(PaginaSaida.Values[0], SaidaInicial) <> 0) then
    Args := Args + ' -o ' + ArgPasta(PaginaSaida.Values[0]);
  Formato := FormatoDoIndice(PaginaFormato.SelectedValueIndex);
  if not ConfigExiste or (Formato <> FormatoInicial) then
    Args := Args + ' --formato ' + Formato;
  if Args <> '' then
    Exec(NodeEmbutido(App), Programa(App) + ' --configurar' + Args, '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  App: String;
  Codigo, I: Integer;
  Saida: TExecOutput;
begin
  if CurStep <> ssPostInstall then Exit;
  App := ExpandConstant('{app}');
  if WizardIsTaskSelected('path') then AdicionaAoPath(App + '\bin');

  WizardForm.StatusLabel.Caption := CustomMessage('Configurando');
  GravaConfig(App);

#ifndef Win7
  if WizardIsTaskSelected('atualizarytdlp') then
  begin
    WizardForm.StatusLabel.Caption := CustomMessage('Atualizando');
    AtualizacaoFalhou := not Exec(App + '\tools\yt-dlp.exe', '-U', '', SW_HIDE, ewWaitUntilTerminated, Codigo)
      or ((Codigo <> 0) and (Codigo <> 100));
  end;
#endif

  { Conferência no fim (seção 4.3), com o caminho completo: o PATH novo ainda não vale aqui. }
  WizardForm.StatusLabel.Caption := CustomMessage('Conferindo');
  Diagnostico := '';
  if ExecAndCaptureOutput(NodeEmbutido(App), Programa(App) + ' --diagnostico', '', SW_HIDE,
    ewWaitUntilTerminated, Codigo, Saida) then
  begin
    for I := 0 to GetArrayLength(Saida.StdOut) - 1 do
      Diagnostico := Diagnostico + Saida.StdOut[I] + #13#10;
    for I := 0 to GetArrayLength(Saida.StdErr) - 1 do
      Diagnostico := Diagnostico + Saida.StdErr[I] + #13#10;
  end
  else
    Diagnostico := SysErrorMessage(Codigo);
  if AtualizacaoFalhou then Diagnostico := CustomMessage('AtualizarFalhou') + #13#10#13#10 + Diagnostico;
end;

{ Página final: o resultado do --diagnostico numa caixa de texto selecionável. }
procedure CurPageChanged(CurPageID: Integer);
var
  Titulo: TNewStaticText;
  Caixa: TNewMemo;
  Topo: Integer;
begin
  if (CurPageID <> wpFinished) or (Diagnostico = '') then Exit;
  Topo := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(12);
  if WizardForm.RunList.Visible then
  begin
    WizardForm.RunList.Top := Topo;
    Topo := Topo + WizardForm.RunList.Height + ScaleY(8);
  end;

  Titulo := TNewStaticText.Create(WizardForm);
  Titulo.Parent := WizardForm.FinishedPage;
  Titulo.Left := WizardForm.FinishedLabel.Left;
  Titulo.Top := Topo;
  Titulo.Caption := CustomMessage('Diagnostico');

  Caixa := TNewMemo.Create(WizardForm);
  Caixa.Parent := WizardForm.FinishedPage;
  Caixa.Left := WizardForm.FinishedLabel.Left;
  Caixa.Top := Topo + Titulo.Height + ScaleY(4);
  Caixa.Width := WizardForm.FinishedPage.ClientWidth - Caixa.Left - ScaleX(8);
  Caixa.Height := WizardForm.FinishedPage.ClientHeight - Caixa.Top - ScaleY(8);
  Caixa.ReadOnly := True;
  Caixa.ScrollBars := ssBoth;
  Caixa.WordWrap := False;
  Caixa.Font.Name := 'Consolas';
  Caixa.Text := Diagnostico;
end;

{ ── Desinstalação (seção 5) ───────────────────────────────────────────────── }

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep <> usPostUninstall then Exit;
  RemoveDoPath(ExpandConstant('{app}\bin'));
  { A config fica por padrão: guarda também o contador do X2 e as estatísticas do X9. }
  if DirExists(PastaConfig) and (SuppressibleMsgBox(FmtMessage(CustomMessage('ApagarConfig'), [PastaConfig]),
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES) then
    DelTree(PastaConfig, True, True, True);
end;
