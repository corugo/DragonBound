# Comandos do DragonBound — Referência

> Permissões agora são **100% por rank** (não há mais comando preso a ID de usuário). A conta **corugo** é **rank 31 (máximo)**, então usa **todos** os comandos. Para dar poder total a outro: `/rank <ID> 31`.
> Comandos são digitados no **chat**, dentro do jogo. Onde aparece `<ID>` é o **ID da conta** do jogador (o seu é **1**).
> Para descobrir o ID de alguém: `/info <nome>` ou `/player <nome>`.

---

## 💰 Adicionar cash (a pergunta)

```
/cash <ID> <valor>
```
Exemplo — dar 500.000 de cash pra você mesmo (corugo é ID 1):
```
/cash 1 500000
```
- Funciona mesmo se o alvo estiver offline (grava direto no banco). Se estiver online, atualiza na hora.
- Alternativa (owner): `/recarga <ID> <valor>` — também adiciona cash (registra como recarga).

---

## 💰 Economia
| Comando | Sintaxe | O que faz |
|---|---|---|
| `/cash` | `/cash <ID> <valor>` | Adiciona cash |
| `/recarga` | `/recarga <ID> <valor>` | Adiciona cash (via "recarga") |
| `/gold` | `/gold <ID> <valor>` | Adiciona/ajusta ouro |
| `/gp` | `/gp <ID> <valor>` | Ajusta GP (pode descontar) |
| `/rank` | `/rank <ID> <nível>` | Muda o rank do jogador (é assim que se cria outro GM: rank 26/27/31) |
| `/gift` | `/gift <ID>` | Presenteia item/avatar |
| `/gift_team` | `/gift_team ...` | Presente em lote pra equipe |
| `/pin_code` | `/pin_code <dono> <valor>` | Gera código PIN de recarga |

## 🛡️ Moderação
| Comando | Sintaxe | O que faz |
|---|---|---|
| `/ban` | `/ban <ID> "motivo" "-e\|-d tempo"` | Bane (`-e` permanente, `-d` por dias) |
| `/desbanear` | `/desbanear <nome>` | Remove o ban |
| `/kickgm` | `/kickgm <nome>` | Tira o GM de alguém (zera rank/gm e reseta economia) |
| `/muted` | `/muted <ID> <minutos> "motivo"` | Silencia no chat |
| `/kick` | `/kick <nome>` | Expulsa da sala |
| `/kick_a` `/kick_b` `/kick_all` | — | Expulsa time A / time B / todos da sala |
| `/ban_ip` | `/ban_ip <IP>` | Bane um IP |
| `/botar` | `/botar <nome>` | Expulsa o jogador do servidor |

## 🎮 Salas / Partida
| Comando | Sintaxe | O que faz |
|---|---|---|
| `/start` | `/start` | Força o início da partida (owner) — inclusive times desiguais (1v0, 1v3) |
| `/end_game` | `/end_game` | Encerra a partida atual |
| `/on` `/on1`…`/on4` | — | Abre sala 0v0 / 1v1 … 4v4 |
| `/power` | `/power` | Ativa "power" na sala |
| `/room` | `/room <ID_sala>` | Vai para uma sala |
| `/room_title` | `/room_title <ID> "título"` | Muda o título da sala |
| `/map_room` | `/map_room <ID_mapa>` | Fixa o mapa (persistente; `-1` = aleatório). BOSS: mapas 1,6,8,9 |
| `/mobil` | `/mobil <ID_mobile>` | Define o mobile |
| `/master` | `/master <nome>` | Passa o domínio da sala |
| `/watch` `/allow_watch` `/allow_talk` | — | Modo espectador da sala |

## ℹ️ Informação / Comunicação
| Comando | Sintaxe | O que faz |
|---|---|---|
| `/info` `/info2` | `/info <nome>` | Dados do jogador (inclui ID) |
| `/player` | `/player <nome>` | ID do jogador |
| `/users_ip` | `/users_ip <IP>` | Contas por IP |
| `/aviso` | `/aviso <texto>` | Aviso global do GM |
| `/bcm` | `/bcm <texto>` | Broadcast |
| `/bot` | `/bot <texto>` | Mensagem como "bot"/sistema |
| `/ad` | `/ad <ID> "texto"` | Mensagem direcionada |
| `/server` | `/server` | Status dos servidores |
| `/help` `/?` `/ayuda` | — | Lista de comandos dentro do jogo |

## 🔧 Conta / Owner
| Comando | Sintaxe | O que faz |
|---|---|---|
| `/gm` | `/gm <nome>` | Marca o jogador como GM |
| `/country` | `/country <nome> <país>` | Muda o país exibido |
| `/password_cuenta` | `/password_cuenta <nome>` | Gerencia senha da conta |
| `/reset` | `/reset` | Reset (owner) |
| `/resetallthegame` | `/resetallthegame` | Reset geral (owner — cuidado) |
| `/event` | `/event ...` | Controla eventos |
| `/dado` `/dice` | — | Rola um dado |

---

### Dicas rápidas
- **Dar cash pra você:** `/cash 1 999999`
- **Criar outro GM:** `/rank <ID> 31` (ou 26/27 para GM menor)
- **Seu ID é 1.** O de outros: `/info <nome>`.
- Valores são números sem pontos/vírgulas (ex.: `500000`, não `500.000`).
