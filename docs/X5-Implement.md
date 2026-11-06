# X5 — O logo nasce da vida: implementação

Implementação da ideia **X5** do `IDEIAS.md` (2026-11-05). As referências `§N` apontam para a
`ESPECIFICACAO.md`; o comportamento final está no §6.3.

> **Implementada em 2026-11-05.** Testada num terminal simulado (pty 120×36): a animação, o
> pular com tecla e a saída com Esc (código 0). Falta ver num Windows Terminal de verdade.

## 1. Ideia

Na abertura da tela cheia, as letras do logo começam como células soltas e convergem para o
desenho do `logo.md` em ~1 s. Para o logo "nascer da vida" de fato, as células soltas são
**células vivas da própria vida**: cada pixel do logo tira uma célula viva sorteada do tabuleiro
(ela morre ali, sem rastro) e voa dela até o seu lugar.

## 2. Peças no código (`gdm-yoinks.mjs`)

| Peça | O que faz |
|---|---|
| `VidaBinaria.colhe(n)` | sorteia até `n` células vivas, mata cada uma (sem `·` de rastro) e devolve `[x, y, bit]` |
| `AberturaDoLogo` | guarda uma partícula por pixel do logo (origem, alvo, cor, bit, atraso) e a desenha no `Quadro` a cada quadro |
| `TelaCheia.posicaoLogo()` | canto do logo, separado do `compoe()` para a abertura saber os alvos |
| `TelaCheia.comecaAbertura()` / `fimDaAbertura()` | criam e encerram a abertura e o seu intervalo de 30 ms |
| `TelaCheia.cabeAgora()` | a janela comporta a interface? (a mesma conta que o `desenha()` já fazia) |

Constantes: `ABERTURA_MS` (1000), `ABERTURA_ATRASO_MS` (300), `ABERTURA_VIRA_PIXEL` (0.4) e
`ABERTURA_QUADRO_MS` (30).

## 3. Animação

- **Coordenadas:** os alvos estão em pixels do logo, com `y` em meias linhas (cada linha do
  terminal mostra duas linhas do desenho, §6.3). A origem de cada partícula é a célula colhida,
  com a meia linha de cima ou de baixo sorteada.
- **Tempo:** cada partícula parte num instante sorteado entre 0 e 300 ms e voa por 700 ms, com
  `1 − (1 − k)³` (sai rápido e pousa devagar). Todas chegam até 1 s.
- **Aparência:** nos primeiros 40% do voo a partícula é o bit da célula (`0`/`1`), na cor da
  vida clareando para a do logo. Depois vira meio bloco e termina exatamente na cor do
  `corPixelLogo`, então a troca para o logo normal no fim não "pula".
- **Meios blocos na mesma célula:** juntados como no `celulaLogo` (`█`, `▀` com fundo de
  outra cor, `▀` ou `▄`). Um bit não é desenhado onde já há meio bloco.
- **Interface:** durante a abertura, o `compoe()` só desenha a abertura; letreiro, frase, palco
  e atalhos aparecem no fim. A fase da URL (ou a análise, com a URL como argumento) já está
  rodando por trás.

## 4. Pular e casos de borda

- **Qualquer tecla** encerra a abertura e é descartada (não vai para o campo de URL). Ctrl+C
  continua saindo como antes.
- **Redimensionar** durante a abertura a encerra (a vida recomeça e os alvos mudariam).
- **Janela pequena demais** (`aumente a janela…`): a abertura não começa, ou é encerrada.
- **Poucas células vivas:** os pixels que sobram partem de pontos sorteados da tela.
- A abertura acontece só uma vez por execução; voltar ao campo de URL depois de uma extração
  não a repete.

## 5. Não feito

- Uma opção para desligar a abertura (`--sem-abertura` ou na config do F13). Como dura 1 s e
  qualquer tecla pula, ficou de fora.
