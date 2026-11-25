# ANIME STRIKERS — Regras de negócio

Valores em **milhões de Strikers Coins (M)**, sempre inteiros. Este documento descreve o que o código faz hoje.
Onde cada regra vive: `packages/shared/src` (OVR, sinergia, escalação) e `apps/server/src` (`game-engine`, `bots`, `services`) para leilão, partida e campeonato.

## 1. Leilão

| Regra | Valor |
|---|---|
| Orçamento inicial | 100 M por treinador (humano ou bot) |
| Valor inicial do leilão | preço base do personagem (1 a 11 M, por raridade e OVR) |
| Incremento mínimo | 1 M (lance ≥ lance atual + 1; sem lances: ≥ valor inicial) |
| Cronômetro | 15 s |
| Anti-*sniping* | lance válido com ≤ 3 s restantes → fim += 5 s |
| Intervalo entre leilões | 3 s (1 s quando ninguém levou) |
| Tamanho da fila | participantes × 7 personagens, limitado ao catálogo (56) |
| Elenco máximo | 7 personagens (5 titulares + 2 reservas) |

**Validação de lance (servidor, nesta ordem):** treinador está na sala → fase é leilão e o `auctionId` é o atual → leilão `ACTIVE` e `agora < endsAt` (`AUCTION_CLOSED`) → não é o líder atual (`ALREADY_LEADING`) → personagem sem dono (`ALREADY_OWNED`) → elenco < 7 (`ROSTER_FULL`) → `amount ≥ mínimo` (`BID_TOO_LOW`) → `amount ≤ orçamento − reserva` (`INSUFFICIENT_BUDGET`).

**Reserva de orçamento:** depois de contratar, o treinador ainda precisa completar 5 titulares com, no mínimo, 1 M por vaga. Reserva = `max(0, 5 − (elenco + 1)) × 1 M`. Impede ficar sem condição de montar o time.

**Simultaneidade e desempate:** o servidor processa **um lance por vez**, na ordem de chegada (o loop de eventos do Node serializa o handler, que é síncrono). O primeiro válido vence; um segundo lance de mesmo valor é recusado como `BID_TOO_LOW`. Todos veem o mesmo resultado.

**Relógio:** o servidor guarda `endsAt` (ms) e envia `serverNow` em todo evento. O cliente calcula `offset = serverNow − Date.now()` e exibe `endsAt − (Date.now() + offset)`; o contador do navegador é só visual. Um timer por leilão no servidor encerra no instante certo e é reagendado a cada extensão.

**Encerramento:** o maior lance vence; o valor é debitado, o personagem entra no elenco (e a escalação automática é recalculada). Sem lances, o personagem fica sem dono e **não volta à fila**. Se ninguém consegue sequer cobrir o valor inicial, o leilão é encerrado na hora.

**Fim do leilão:** quem terminou com menos de 5 personagens recebe **agentes livres** do que sobrou, pelo preço base (até 3 M cada, respeitando o orçamento), escolhidos pelo maior ganho de força do time. O treinador é avisado.

## 2. Atributos e OVR

Escala 1–100. Atributos: velocidade, finalização, passe, drible, defesa, físico, controle, visão, reflexos, posicionamento.

- **ATA** = 0,30·finalização + 0,25·velocidade + 0,25·drible + 0,20·controle
- **MEI** = 0,30·passe + 0,25·controle + 0,25·drible + 0,20·visão
- **ZAG** = 0,45·defesa + 0,35·físico + 0,20·velocidade
- **GOL** = 0,45·reflexos + 0,35·posicionamento + 0,20·defesa

**Fora de posição** (posição que o personagem não lista como principal nem secundária): OVR efetivo × 0,85. Em posição secundária vale a fórmula normal da posição.

**Atributos são fixos.** São gerados por uma função determinística do `id` do personagem (hash FNV-1a + `mulberry32`): atributos-chave da posição ficam em torno do OVR-alvo ±3; os demais ficam ~24 pontos abaixo; secundárias recebem atributos-chave a ~6 pontos do alvo. Nada é sorteado a cada carregamento. O OVR final pode diferir do alvo em ±1.

**Raridade** (Comum, Raro, Épico, Lendário, Mítico) define identidade visual e preço base; **não** define o OVR.

## 3. Escalação e força do time

Slots: `GOL`, `ZAG`, `MEI`, `LIVRE` (meio **ou** ataque), `ATA`. Formações: **Equilibrada 1-1-2-1** (1,00/1,00/1,00), **Defensiva 1-2-1-1** (ataque ×0,97, defesa ×1,04), **Ofensiva 1-1-1-2** (ataque ×1,04, defesa ×0,97).

Linhas: goleiro = OVR no GOL; defesa = OVR no ZAG × formação; meio = média (MEI [+ LIVRE se atuar de meia]) × formação; ataque = média (ATA [+ LIVRE se atuar de atacante]) × formação. Slot vazio conta 30.

`base = 0,30·ataque + 0,30·meio + 0,25·defesa + 0,15·goleiro` e `força = base × (1 + sinergia%)`.

**Avisos:** posição vazia, jogador fora de posição (−15%), goleiro na linha, jogador de linha no gol. Cada aviso tira 2 pontos de sinergia (até −4).

**Sinergia** (+8% no máximo, −4% no mínimo): maior grupo do mesmo universo (2 → +1, 3 → +3, 4 → +5, 5 → +7) + pares com a mesma tag canônica (+1 por par, máx. +3) − avisos.

## 4. Habilidades

Cada personagem tem uma. Todas afetam a simulação; teto de +25% por efeito; efeitos de criação (visão, drible, contra-ataque) **não acumulam** (vale o maior).

| Habilidade | Gatilho | Efeito | Chance | Usos/partida |
|---|---|---|---|---|
| Finalização de Precisão | ao finalizar | +15% na qualidade do chute | 60% | 3 |
| Velocidade Explosiva | contra-ataque | +20% na força da criação | 70% | 2 |
| Visão de Jogo | criar a jogada | +15% na criação | 60% | 3 |
| Drible Imprevisível | criar a jogada | +20% na criação | 55% | 2 |
| Defesa Absoluta | ser atacado | −20% no ataque rival | 50% | 2 |
| Reflexo Extraordinário | chute no gol (goleiro) | +20% no poder do goleiro | 60% | 2 |
| Chute de Longa Distância | meio/livre | finaliza sem passar pela defesa, −10% de qualidade | 35% | 2 |

## 5. Simulação de partida (`game-engine/match.ts`)

20 lances. Em cada um: o time atacante é sorteado com viés pela linha de meio (`meio_A / (meio_A + meio_B)`); 22% são contra-ataques. Passos:

1. **Criação:** `poder_ataque = 0,5·ataque + 0,5·meio` (com habilidades) contra `poder_defesa = 0,6·defesa + 0,4·meio`; `P(chance) = 0,15 + 0,55·sigmoide((ataque − defesa)/10)`.
2. **Finalizador** sorteado por papel e finalização; o criador vira o **assistente** (se for outro).
3. **Qualidade** = 0,6·finalização + 0,4·OVR no slot (com habilidade). `P(no alvo) = clamp(0,55 + 0,004·(q − 70), 0,40, 0,75)`.
4. **Goleiro:** `P(gol) = 0,12 + 0,6·sigmoide((q − goleiro)/10)`; goleiro = 0,5·linha + 0,5·reflexos.

Resultado: placar, gols com autor e assistência, MVP (gol +3, assistência +2, defesa +1,2, habilidade +0,3, bônus ao vencedor), estatísticas (posse, finalizações, no alvo, defesas) e eventos narrados em português. **Determinística por seed**: mesma seed e mesmos times = mesma partida. Testado: com força muito maior, o time vence mais de 60% de 500 simulações, e o azarão ainda vence às vezes.

## 6. Campeonato

Pontos corridos, turno único (algoritmo do círculo; número ímpar = uma folga por rodada). Vitória 3, empate 1, derrota 0. Desempate: pontos → vitórias → saldo → gols feitos → confronto direto (mini-tabela entre os empatados) → ordem de entrada na sala. O anfitrião simula uma rodada por vez ou todas; todos recebem o mesmo resultado.

## 7. Bots (`bots/bot-brain.ts`)

Veem **só** informação pública (personagem em leilão, lance atual, o próprio orçamento e elenco) e passam pela mesma validação do servidor.

`valor = (4 + (OVR − 55) × 0,9) × necessidade × fator_do_nível × (1 ± ruído)`, limitado a `orçamento × fração` e à reserva.

- **Necessidade** (0,4 a 1,4): posição que falta vale mais; posição já bem coberta vale menos.
- **Fração gasta por personagem:** `min(0,7, 1/vagas_restantes + 0,1)` (30% com 5 vagas), 95% na última vaga: evita gastar tudo no início.
- **Nível:** Fácil (×0,7, ruído ±25%, reage em 2–5 s), Normal (×0,9, ±12%, 1–3 s), Difícil (×1,05, ±5%, 0,5–2 s, às vezes salta +1).
- **Desistem** quando o próximo lance mínimo passa do teto.
