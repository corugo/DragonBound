var Types = require("./gametypes");
var Logger = require("./lib/logger");
var Message = require("./lib/message");
var World = require("./world");
var Shoot = require("./lib/shoot");
var events = require("events");
var thorControl = require("./lib/thorControl");
var BotChat = require("./lib/botChat");
var weatherControl = require("./lib/weatherControl");
const { forEach } = require("underscore");

// Game
module.exports = class Game {
  constructor(id, room, gameserver) {
    var self = this;
    this.id = id;
    this.room = room;
    this.gameserver = gameserver;
    this.wind_power = 0; //Reloj de viento
    this.wind_angle = 90;

    this.turns_change_wind_angle = 2; // turnos para cambiar angulo
    this.turns_change_wind_power = 3; // turnos para cambiar fuerza
    this.turns_wind_angle_mod = [0, 0, 0]; // modificadores de los turnos segun el viento maximo
    this.turns_wind_power_mod = [0, 0, 0]; // modificadores de los turnos segun el viento maximo
    this.turns_change_wind_angle_temp = 0; // no editar
    this.turns_change_wind_power_temp = 0; // no editar
    this.turns_change_wind_angle_mod = 0; // no editar
    this.turns_change_wind_power_mod = 0; // no editar
    this.change_wind_angle_turn_count = 0; // no editar
    this.change_wind_power_turn_count = 0; // no editar

    this.frist_turn = 0;
    this.time_played = 0;
    this.turn_player = 0;
    this.turns_pass = 0;
    this.turns_pass_sudden = 0;
    this.sudden = 40;
    // Modo SCORE: cada time tem um saldo de pontos; cada morte consome 1 e o
    // jogador revive. Zera o saldo = derrota. Definido no start(), quando ja se
    // sabe quantos jogadores cada time tem.
    this.score_points = { 0: 0, 1: 0 };
    // 4 pontos por time (nao escala com o numero de jogadores).
    this.SCORE_TEAM_POINTS = 4;
    // Turnos entre MARCAR o ponto e voltar. No GunBound original a contagem
    // comeca no clique, nao na morte - por isso vale esperar o momento certo.
    this.SCORE_REVIVE_TURNS = 4;
    // Prazo maximo sem clicar: evita que alguem que fechou a aba trave a
    // partida (quem aguarda revive conta como vivo).
    this.SCORE_REVIVE_DEADLINE = 12;
    this.suddenShoot = false;
    this.lastturn = 0;
    this.game_endx = false;
    this.gameEnd_callback = null;
    this.eventEmitter = new events.EventEmitter();
    this.queue = [];
    this.historical = [];
    this.Lightning = {};
    this.turnTime;
    this.turnPassClock;
    this.roomClock;

    this.map = self.gameserver.mapControl.getMap(room.map);
    this.weather = new weatherControl(this.map);
    this.thorControl = new thorControl(self);
    this.thor = this.thorControl.data;
    this.baseDelay = [50, 120, 200];
    this.mobileDelay = 0;
    //	this.turnList

    this.ion = {
      x: 0,
      y0: -200,
      y1: -600,
      angle: 90,
      time: 0,
    };
    if (this.weather.current.id == 0) this.thor.active = true;
    else this.thor.active = false;
    this.gamePrixEnd_callback = null;
    this.world = new World(self, self.gameserver);
    this.setWindVars(this.room.max_wind);
    this.world.onShootComplete(function (acc, shoot, chat) {
      try {
        self.thorControl.onShootComplete(shoot);
        self.weather.update();
        if (self.weather.current.id == 0) self.thor.active = true;
        else self.thor.active = false;
        self.updateWind();

        var actual_turn = self.getActualTurn();
        let shootTime = self.sumShootTime(shoot);
        acc.player.lastturn = actual_turn;
        self.UpdateUserLastTurn(acc.user_id, actual_turn);
        //	console.log({is:"final Shoot data",acc:acc,shoot:shoot,shootTime:shootTime});
        self.getNextTurn(actual_turn, function (player) {
          if (typeof player != "undefined") {
            if (self.turn_player == player.position) self.sumDelay = true;
            else self.sumDelay = false;
            self.turn_player = player.position;
            var shoot_message = new Message.gamePlay(
              acc,
              shoot,
              player,
              self.lastturn,
              chat
            );
            self.gameserver.pushToRoom(self.room.id, shoot_message);
            self.historical.push(shoot_message);
            if (shoot[0].tele.length > 0) {
              //console.log(acc.player.user_id);
              acc.player.x = shoot[0].tele[1];
              acc.player.y = shoot[0].tele[2];
              acc.player.move();
            }
            if (Types.BOT_MODES.includes(self.room.game_mode)) {
              self.room.forBots(function (bot) {
                if (bot.player.user_id === player.user_id) {
                  bot.turn();
                }
              });
            }
            self.setPassTimeOut(player.user_id, shootTime);
            setTimeout(() => {
              self.checkDead();
            }, shootTime);
          } else {
            self.getNextTurn(actual_turn, function (player2) {
              self.turn_player = player2.position;
              if (typeof player2.position !== "undefined") {
                var shoot_message = new Message.gamePlay(
                  acc,
                  shoot,
                  player2,
                  self.lastturn,
                  chat
                );
                self.gameserver.pushToRoom(self.room.id, shoot_message);
                self.historical.push(shoot_message);
                if (Types.BOT_MODES.includes(self.room.game_mode)) {
                  self.room.forBots(function (bot) {
                    if (bot.player.user_id === player2.user_id) {
                      bot.turn();
                    }
                  });
                }
                self.setPassTimeOut(player2.user_id, shootTime);
                setTimeout(() => {
                  self.checkDead();
                }, shootTime);
              }
            });
          }
        });
      } catch (e) {
        /*self.getNextTurn(actual_turn,function (player) {
					self.turn_player = player.position;
					self.gameserver.pushToRoom(self.room.id, new Message.gamePlay(acc, shoot, player, chat));
					if (Types.BOT_MODES.includes(self.room.game_mode)) {
						self.room.forBots(function (bot) {
							if (bot.player.position === self.turn_player) {
								self.gameEnd_callback;
							}
						});
					}*/
        self.checkDead();
        /*});*/
      }
    });
  }

  start(callback) {
    var self = this;
    self.room.status = Types.ROOM_STATUS.PLAYING;
    // Marco zero do replay. Fica no room (e nao no game) porque o gameOver e
    // serializado quando o game ja pode ter sido anulado.
    self.room.replay_start_at = Date.now();
    if (Types.SCORE_MODES.includes(self.room.game_mode)) {
      self.score_points[0] = self.SCORE_TEAM_POINTS;
      self.score_points[1] = self.SCORE_TEAM_POINTS;
    }
    // Nos modos com bots (ex.: Aduka 4v4), spawns aleatórios pelo mapa todo, porém
    // DISTINTOS (sem sobrepor jogadores) e sem separar por time.
    var useDistinctSpawn = Types.BOT_MODES.includes(self.room.game_mode);
    var spawnPool = [];
    var si = 0;
    if (useDistinctSpawn) {
      spawnPool = (self.map.points || []).filter(function (p) {
        return p && typeof p.x !== "undefined";
      });
      spawnPool = spawnPool.slice(2); // pula os 2 primeiros (bordas), igual ao GetPoint
      for (var i = spawnPool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = spawnPool[i];
        spawnPool[i] = spawnPool[j];
        spawnPool[j] = t;
      }
    }
    self.room.forPlayers(function (account) {
      if (account !== null) {
        let player = account.player;
        var point;
        if (useDistinctSpawn) {
          point = spawnPool[si++];
          if (!point || typeof point.x === "undefined") point = self.map.GetPoint();
        } else {
          point = self.map.GetPoint();
        }
        if (typeof point !== "undefined" && typeof point.x !== "undefined") {
          player.x = point.x;
          player.y = point.y;
        }
        player.reloadHp();
        // O buffer de replay so era inicializado no construtor do Player: sem
        // zerar aqui, cada replay saia com TODAS as partidas anteriores da
        // sessao do jogador concatenadas.
        player.view_replay = [];
        player.awaiting_revive = false;
        player.pending_death = false;
        player.revive_x = null;
        player.revive_y = null;
        player.revive_turn = null;
        player.revive_deadline = null;
        if (player.is_bot === 1) {
          account.init();
        }
      }
    });
    BotChat.onGameStart(self.room);
    self.checkRoom();
    callback();
  }

  setPassTimeOut(PlayerID, shootTime = 0) {
    //	console.log({is:"set pass time out",turnTime:this.turnTime,shootTime:shootTime,playerID:PlayerID});
    // getAccountById so encontra jogadores HUMANOS; os bots ficam em
    // gameserver.bots. Sem esta busca extra o timeout do turno de um bot
    // chamava gamePass(undefined) e estourava ao montar a mensagem de pass -
    // a partida travava sem ninguem conseguir jogar.
    let player = this.room.gameserver.getAccountById(PlayerID);
    if (!player && this.room.gameserver.bots) {
      player = this.room.gameserver.bots[PlayerID];
    }
    this.turnPassClock = setTimeout(() => {
      //	console.log({is:"Pass Time Out",TimeOutAt:this.turnTime, player:player,PlayerID:PlayerID,turn:turn});
      if (player) this.gamePass(player);
    }, this.turnTime + shootTime);
  }
  checkRoom() {
    var self = this;
    var team_a_alive = 0;
    var team_b_alive = 0;
    self.room.forPlayers(function (account) {
      let player = account.player;
      //Logger.info("Player: "+player.game_id+" - Team: "+player.team+" - Is_alive: "+player.is_alive);
      if (player.is_alive === 1) {
        if (player.team == 1) {
          team_a_alive++;
        } else {
          team_b_alive++;
        }
      }
    });
    if (team_a_alive === 0 || team_b_alive === 0) self.checkDead();
    else
      this.roomClock = setTimeout(() => {
        //	console.log({is:"Pass Time Out",TimeOutAt:this.turnTime, player:player,PlayerID:PlayerID,turn:turn});
        self.checkRoom();
      }, 100);
  }

  sumShootTime(shoot) {
    let time = 0;
    for (const bulet of shoot) {
      time += bulet.time;
    }
    return time;
  }
  setWindVars() {
    var self = this;
    self.turns_change_wind_angle_mod = self.turns_wind_angle_mod[0];
    self.turns_change_wind_power_mod = self.turns_wind_power_mod[0];
    switch (self.room.max_wind) {
      case 50:
        self.turns_change_wind_angle_mod = self.turns_wind_angle_mod[2];
        self.turns_change_wind_power_mod = self.turns_wind_power_mod[2];
        self.wind_power = self.getRandomInt(26, self.room.max_wind);
        break;
      case 26:
        self.turns_change_wind_angle_mod = self.turns_wind_angle_mod[1];
        self.turns_change_wind_power_mod = self.turns_wind_power_mod[1];
        self.wind_power = self.getRandomInt(12, self.room.max_wind);
        break;
      case 12:
        self.wind_power = self.getRandomInt(0, self.room.max_wind);
        break;
    }
  }

  // Ninguem em campo e alguem aguardando revive = travamento: lastturn so
  // avanca quando alguem joga, entao o prazo dos 4 turnos (e o proprio limite
  // de seguranca) nunca venceria. Traz de volta quem esta esperando.
  scoreForceRevives() {
    var self = this;
    if (self.game_endx) return;
    if (!Types.SCORE_MODES.includes(self.room.game_mode)) return;
    self.room.forPlayers(function (account) {
      if (!account || !account.player) return;
      var p = account.player;
      if (!p.awaiting_revive) return;
      if (typeof p.revive_x !== "number") {
        var pt = self.map && self.map.GetPoint ? self.map.GetPoint() : null;
        if (pt && typeof pt.x !== "undefined") {
          p.revive_x = pt.x;
          p.revive_y = pt.y;
        } else {
          p.revive_x = p.x;
          p.revive_y = p.y;
        }
      }
      self.scoreDoRevive(account);
    });
  }

  // Quem esta morto ou aguardando revive nao entra na fila de turnos.
  scoreIsPlayable(account) {
    if (!account || !account.player) return false;
    if (account.player.awaiting_revive) return false;
    return account.player.is_alive === 1;
  }

  // Modo SCORE: consome 1 ponto do time do morto e abre o painel de revive.
  // Devolve true se a partida deve continuar (ainda ha pontos e ainda ha alguem
  // vivo no time); false deixa o checkDead seguir para o fim de jogo normal.
  // Modo SCORE: coloca o jogador de volta em campo na posicao escolhida. O
  // cliente ja filtra o clique (pixel vazio com chao embaixo), mas revalidamos
  // aqui - a mensagem vem do cliente e nao pode ser tratada como confiavel.
  scoreRevive(account, x, y) {
    var self = this;
    if (self.game_endx) return false;
    if (!Types.SCORE_MODES.includes(self.room.game_mode)) return false;
    if (!account || !account.player || !account.player.awaiting_revive) return false;
    var map = self.map;
    var px = Math.round(Number(x));
    var py = Math.round(Number(y));
    if (!isFinite(px) || !isFinite(py)) return false;
    var left = map.field_left != null ? map.field_left : 0;
    var right = map.field_right != null ? map.field_right : map.w;
    if (px < left || px > right || py < 0 || py > map.h) return false;
    if (map.IsPixel(px, py)) return false; // dentro do terreno
    var chao = map.GetUnder(px, py);
    if (typeof chao === "undefined" || chao === 0) return false; // sem chao abaixo
    var p = account.player;
    // MARCA o ponto - nao volta ao jogo agora. O retorno acontece depois de
    // SCORE_REVIVE_TURNS turnos, em scoreTickRevives(). Antes disto o jogador
    // renascia no mesmo instante do clique.
    p.revive_x = px;
    p.revive_y = chao;
    if (typeof p.revive_turn !== "number") {
      p.revive_turn = self.lastturn + self.SCORE_REVIVE_TURNS;
    }
    p.x = px;
    p.y = chao;
    // Ghost: fecha o painel de revive no cliente e desenha o fantasma no ponto
    // marcado com o contador "(Return in N Turns)".
    self.gameserver.pushToRoom(
      self.room.id,
      new Message.Ghost(account, p.revive_turn, self.room)
    );
    return true;
  }

  // Executa os revives cujo prazo venceu. Chamado a cada troca de turno.
  scoreTickRevives() {
    var self = this;
    if (self.game_endx) return;
    if (!Types.SCORE_MODES.includes(self.room.game_mode)) return;
    self.room.forPlayers(function (account) {
      if (!account || !account.player) return;
      var p = account.player;
      if (!p.awaiting_revive) return;
      var marcou = typeof p.revive_turn === "number";
      var estourou =
        typeof p.revive_deadline === "number" &&
        self.lastturn >= p.revive_deadline;
      if (!marcou && !estourou) return; // ainda escolhendo onde voltar
      if (marcou && self.lastturn < p.revive_turn && !estourou) return;
      // Prazo vencido sem ponto marcado (o jogador nao clicou, ou fechou a aba):
      // volta num ponto de spawn do mapa. Sem isto ele ficaria fora da fila de
      // turnos para sempre - e como quem aguarda revive conta como vivo, a
      // partida travava com a fila vazia e ninguem para jogar.
      if (typeof p.revive_x !== "number") {
        var pt = self.map && self.map.GetPoint ? self.map.GetPoint() : null;
        if (pt && typeof pt.x !== "undefined") {
          p.revive_x = pt.x;
          p.revive_y = pt.y;
        } else {
          p.revive_x = p.x;
          p.revive_y = p.y;
        }
      }
      self.scoreDoRevive(account);
    });
  }

  // Coloca de volta em campo, no ponto que ja tinha sido marcado.
  scoreDoRevive(account) {
    var self = this;
    var p = account.player;
    p.x = p.revive_x;
    p.y = p.revive_y;
    p.reloadHp();
    p.is_alive = 1;
    p.setAlive(1);
    p.awaiting_revive = false;
    p.pending_death = false;
    p.falling = false;
    p.revive_x = null;
    p.revive_y = null;
    p.revive_turn = null;
    p.revive_deadline = null;
    p.lastturn = self.getActualTurn();
    if (p.is_bot === 1) BotChat.say(account, "revive", {}, self.room, { delayMs: 800 });
    // DELAY AO VOLTAR. No GunBound a posicao do jogador na fila ao renascer e'
    // dada pelo Delay dele (StrategyWiki, GunBound Classic/Game Modes). Enquanto
    // esteve morto ele nao acumulou delay nenhum, entao voltaria com o valor
    // antigo - menor que o de todo mundo - e jogaria de imediato, transformando
    // a morte em vantagem. Alinhamos ao MAIOR delay entre os vivos: ele reentra
    // no fim da fila atual, sem ganhar nem perder turno por ter morrido.
    var maiorDelay = p.delay;
    self.room.forPlayers(function (acc) {
      if (!acc || !acc.player) return;
      if (acc.player.user_id === p.user_id) return;
      if (acc.player.is_alive !== 1) return;
      if (acc.player.delay > maiorDelay) maiorDelay = acc.player.delay;
    });
    p.delay = maiorDelay;
    // Volta para a fila de turnos com o delay atual (o cliente recebe o mesmo
    // valor na mensagem e reordena a lista sozinho).
    var jaNaLista = false;
    for (var i in self.room.turn_list) {
      if (self.room.turn_list[i].user_id == account.user_id) {
        jaNaLista = true;
        self.room.turn_list[i].delay = p.delay;
      }
    }
    if (!jaNaLista) {
      self.room.turn_list.push({
        user_id: account.user_id,
        team: p.team,
        position: p.position,
        delay: p.delay,
        lastturn: p.lastturn,
      });
    }
    p.move();
    self.gameserver.pushToRoom(self.room.id, new Message.revived(account, self.room));
    return true;
  }

  scoreHandleDeath() {
    var self = this;
    if (!Types.SCORE_MODES.includes(self.room.game_mode)) return false;
    var seguiu = false;
    self.room.forPlayers(function (account) {
      if (!account || !account.player) return;
      var p = account.player;
      if (p.is_alive === 1 || p.awaiting_revive) return; // vivo ou ja no painel
      var team = p.team == 1 ? 1 : 0;
      if (self.score_points[team] <= 0) return; // sem saldo: nao revive mais
      self.score_points[team]--;
      p.awaiting_revive = true;
      // A contagem dos 4 turnos so comeca quando o jogador MARCA o ponto.
      p.revive_turn = null;
      p.revive_deadline = self.lastturn + self.SCORE_REVIVE_DEADLINE;
      p.revive_x = null;
      p.revive_y = null;
      seguiu = true;
      // Bot nao tem painel para clicar: ele mesmo escolhe onde voltar. Sem isto
      // ficava eternamente em awaiting_revive - e como quem aguarda revive conta
      // como vivo, a partida nunca terminava.
      // Bot nao tem painel: marca o ponto na hora. O retorno em si continua
      // respeitando os mesmos SCORE_REVIVE_TURNS turnos de espera.
      if (typeof account.reviveNow === "function") {
        setTimeout(function () {
          if (!self.game_endx && account.reviveNow) account.reviveNow();
        }, 300);
      } else if (account.send) {
        account.send(new Message.showRevive().serialize());
      }
    });
    return seguiu;
  }

  checkDead() {
    var self = this;
    if (self.game_endx) return null;
    // No SCORE a morte nao encerra a partida enquanto o time tiver pontos: ela
    // debita 1 ponto e abre o revive. O fim so vem quando o saldo zera ou quando
    // um time inteiro esta fora (contagem de vivos abaixo, que ja considera quem
    // esta aguardando revive como NAO vivo).
    self.scoreHandleDeath();
    var team_a_alive = 0;
    var team_b_alive = 0;
    var end = false;
    self.room.forPlayers(function (account) {
      let player = account.player;
      //Logger.info("Player: "+player.game_id+" - Team: "+player.team+" - Is_alive: "+player.is_alive);
      // No SCORE, quem esta no painel de revive ainda conta como vivo - o time so
      // cai quando ninguem tem como voltar. Se TODOS morrerem de uma vez e ninguem
      // ficar em campo nem aguardando revive, a contagem zera e o adversario vence.
      var contaVivo =
        player.is_alive === 1 ||
        (Types.SCORE_MODES.includes(self.room.game_mode) && player.awaiting_revive);
      if (contaVivo) {
        if (player.team == 1) {
          team_a_alive++;
        } else {
          team_b_alive++;
        }
      }
    });
    var win_gp = this.room.team;
    if (team_a_alive === 0) {
      //enviar win team a
      if (self.room.event_game_room === 1) {
        self.room.forPlayerB(function (account) {
          if (self.room.free_kill) self.room.win_team_gp = 0;
          account.player.addWinGoldWinGp(0, self.room.win_team_gp);
          account.player.addWinGoldWinGp(0, self.room.win_team_gpb);
          /* ================================================= */
          var increase = 1;
          self.room.forPlayerA(function (account_win) {
            if (typeof account_win !== "undefined") {
              if (
                typeof account_win.player.no_win_bonus_players[
                  parseInt(account.player.user_id)
                ] !== "undefined"
              ) {
                if (
                  account_win.player.no_win_bonus_players[
                    parseInt(account.player.user_id)
                  ].loss >= 1
                ) {
                  increase = parseInt(
                    account_win.player.no_win_bonus_players[
                      parseInt(account.player.user_id)
                    ].loss + 1
                  );
                }
              }
            }
          });
          self.room.no_win_bonus_players_room[account.player.user_id] = {
            user_id: account.player.user_id,
            loss: increase,
            expiry: 0,
          };
          /* ================================================= */
        });
        self.room.forPlayerA(function (account) {
          account.player.addWinGoldWinGp(0, self.world.gp_lose);
        });
      } else {
        self.room.forPlayerA(function (account) {
          if (self.room.free_kill) self.room.win_team_gp = 0;
          account.player.addWinGoldWinGp(0, self.room.win_team_gp);
          account.player.addWinGoldWinGp(0, self.room.win_team_gpb);
        });
        self.room.forPlayerB(function (account) {
          account.player.addWinGoldWinGp(0, self.world.gp_lose);
          var increase = 1;
          self.room.forPlayerA(function (account_win) {
            if (typeof account_win !== "undefined") {
              if (
                typeof account_win.player.no_win_bonus_players[
                  parseInt(account.player.user_id)
                ] !== "undefined"
              ) {
                if (
                  account_win.player.no_win_bonus_players[
                    parseInt(account.player.user_id)
                  ].loss >= 1
                ) {
                  increase = parseInt(
                    account_win.player.no_win_bonus_players[
                      parseInt(account.player.user_id)
                    ].loss + 1
                  );
                }
              }
            }
          });
          self.room.no_win_bonus_players_room[account.player.user_id] = {
            user_id: account.player.user_id,
            loss: increase,
            expiry: 0,
          };
        });
      }
      // Fecha o painel de revive de quem ficou esperando (modo SCORE).
      if (Types.SCORE_MODES.includes(self.room.game_mode)) {
        self.room.forPlayers(function (acc) {
          if (acc && acc.player && acc.player.awaiting_revive) {
            acc.player.awaiting_revive = false;
            if (acc.send) acc.send(new Message.stopRevive().serialize());
          }
        });
      }
      self.gameserver.pushToRoom(
        self.room.id,
        new Message.gameOver(self.room, 0, self.room.player_left_room)
      );
      //Logger.log("win: team a");
      end = true;
      self.gameEnd_callback(0);
      self.game_endx = true;
    } else if (team_b_alive === 0) {
      //enviar win team b
      if (self.room.event_game_room === 1) {
        self.room.forPlayerA(function (account) {
          if (self.room.free_kill) self.room.win_team_gp = 0;
          account.player.addWinGoldWinGp(0, self.room.win_team_gp);
          account.player.addWinGoldWinGp(0, self.room.win_team_gpb);
          /* ================================================= */
          var increase = 1;
          self.room.forPlayerB(function (account_win) {
            if (typeof account_win !== "undefined") {
              if (
                typeof account_win.player.no_win_bonus_players[
                  parseInt(account.player.user_id)
                ] !== "undefined"
              ) {
                if (
                  account_win.player.no_win_bonus_players[
                    parseInt(account.player.user_id)
                  ].loss >= 1
                ) {
                  increase = parseInt(
                    account_win.player.no_win_bonus_players[
                      parseInt(account.player.user_id)
                    ].loss + 1
                  );
                }
              }
            }
          });
          self.room.no_win_bonus_players_room[account.player.user_id] = {
            user_id: account.player.user_id,
            loss: increase,
            expiry: 0,
          };
          /* ================================================= */
        });
        self.room.forPlayerB(function (account) {
          account.player.addWinGoldWinGp(0, self.world.gp_lose);
        });
      } else {
        self.room.forPlayerB(function (account) {
          if (self.room.free_kill) self.room.win_team_gp = 0;
          account.player.addWinGoldWinGp(0, self.room.win_team_gp);
          account.player.addWinGoldWinGp(0, self.room.win_team_gpb);
        });
        self.room.forPlayerA(function (account) {
          account.player.addWinGoldWinGp(0, self.world.gp_lose);
          var increase = 1;
          self.room.forPlayerB(function (account_win) {
            if (typeof account_win !== "undefined") {
              if (
                typeof account_win.player.no_win_bonus_players[
                  parseInt(account.player.user_id)
                ] !== "undefined"
              ) {
                if (
                  account_win.player.no_win_bonus_players[
                    parseInt(account.player.user_id)
                  ].loss >= 1
                ) {
                  increase = parseInt(
                    account_win.player.no_win_bonus_players[
                      parseInt(account.player.user_id)
                    ].loss + 1
                  );
                }
              }
            }
          });
          self.room.no_win_bonus_players_room[account.player.user_id] = {
            user_id: account.player.user_id,
            loss: increase,
            expiry: 0,
          };
        });
      }
      // Fecha o painel de revive de quem ficou esperando (modo SCORE).
      if (Types.SCORE_MODES.includes(self.room.game_mode)) {
        self.room.forPlayers(function (acc) {
          if (acc && acc.player && acc.player.awaiting_revive) {
            acc.player.awaiting_revive = false;
            if (acc.send) acc.send(new Message.stopRevive().serialize());
          }
        });
      }
      self.gameserver.pushToRoom(
        self.room.id,
        new Message.gameOver(self.room, 1, self.room.player_left_room)
      );
      //Logger.log("win: team b");
      end = true;
      self.gameEnd_callback(1);
      self.game_endx = true;
    }
    if (end) {
      clearTimeout(self.turnPassClock);
      self.world = null;
      self.map = null;
    }
  }

  gameShoot(x, y, body, look, ang, power, time, type, account) {
    let self = this;
    let mobile_data;
    clearTimeout(self.turnPassClock);
    power = parseInt((power * 234) / 100);
    if (account.player.mobile == Types.MOBILE.RANDOMIZER) {
      mobile_data =
        Types.MOBILES[
          Types.RANDOMIZER[this.getRandomInt(0, Types.RANDOMIZER.length)]
        ];
    } else {
      mobile_data = Types.MOBILES[account.player.mobile];
    }
    let dis = 0;
    if (look === 0) {
      ang = 180 - ang;
      if (
        account.player.mobile == Types.MOBILE.ADUKA ||
        account.player.mobile == Types.MOBILE.NAK
      ) {
        dis = 26;
      } else {
        dis = -11;
      }
    } else {
      if (
        account.player.mobile == Types.MOBILE.ADUKA ||
        account.player.mobile == Types.MOBILE.NAK
      ) {
        dis = -26;
      } else {
        dis = 11;
      }
    }
    ang -= body;
    let point = {
      x: x + dis,
      y:
        account.player.mobile == Types.MOBILE.ADUKA ||
        account.player.mobile == Types.MOBILE.NAK
          ? y - 31
          : y - 28,
    };
    let pfinal = self.rotatePoint(
      point,
      {
        x: x,
        y: y,
      },
      body
    );

    let calc_thor_angle = Math.round(
      (Math.atan2(this.thor.y - pfinal.y, this.thor.x - pfinal.x) * 180) /
        Math.PI
    );
    if (calc_thor_angle < 0) calc_thor_angle = 360 - calc_thor_angle;
    this.thor.angle = Math.round(calc_thor_angle);

    if (account.player.DUAL == 1 && type === 2) {
      account.player.DUAL = 0;
    }

    // world.shoots so era inicializado no construtor do World: zerar apenas o
    // contador deixava os projeteis dos turnos anteriores vivos no objeto.
    // Efeitos: shoot() criava um slot por chave acumulada (dezenas de slots
    // vazios no replay) e qualquer projetil que tivesse ficado preso continuava
    // sendo simulado nos turnos seguintes - foi assim que um tiro velho,
    // ja com a velocidade degradada, reapareceu quicando no tornado deste turno.
    this.world.shoots = {};
    this.world.shoots_count = 0;
    this.mobileDelay = mobile_data.delay + time * 10;
    if (account.player.TELEPORT == 1) {
      this.thor.active = false;
      let data = {
        x0: pfinal.x,
        y0: pfinal.y,
        ang: ang,
        power: power,
        pala_bunge: [null, null],
        weight: 398,
        friccion: 0,
        damage: null,
        type: type,
        wind_ang: self.wind_angle,
        wind_power: self.wind_power,
        stime: 0,
        account: account,
        shootId: 0,
        bonos: false,
      };
      self.setTurnDelay({ delay: 0 }, account);
      self.world.shoots[self.world.shoots_count] = new Shoot(data);
      this.world.shoots_count = 1;
    } else if (this.suddenShoot || (account.player.DUAL === 1 && type !== 2)) {
      this.setShoots(pfinal, mobile_data, 0, ang, power, 0, type, account);
      this.setShoots(pfinal, mobile_data, 1, ang, power, 1000, type, account);
    } else if (account.player.DUAL_PLUS === 1 && type !== 2) {
      this.setShoots(pfinal, mobile_data, 0, ang, power, 0, type, account);
      this.setShoots(
        pfinal,
        mobile_data,
        1,
        ang,
        power,
        1000,
        type == 1 ? 0 : 1,
        account
      );
    } else {
      this.setShoots(pfinal, mobile_data, 0, ang, power, 0, type, account);
    }
    this.world.shoot(account.player.TELEPORT == 1 ? true : false); // temporal modificar quitar el nohole de lugar

    this.world.run();
    this.nohole = !1;
    account.player.DUAL = 0;
    account.player.DUAL_PLUS = 0;
  }

  setShoots(pfinal, mobile_data, shootCount, ang, power, stime, type, account) {
    let self = this;
    let shootId = 0;
    const shootData = mobile_data.shoots[type];

    if (shootCount == 0) self.setTurnDelay(shootData[0], account);
    shootData.forEach((shootConfig) => {
      let data = {
        x0: pfinal.x,
        y0: pfinal.y,
        ang: ang,
        power: power,
        type: type,
        wind_ang: self.wind_angle,
        wind_power: self.wind_power,
        stime: shootConfig.addtime + stime,
        account: account,
        shootId: shootId,
      };
      data = { ...data, ...shootConfig };
      if (Array.isArray(data.addOrbit) && Array.isArray(data.addOrbit[1])) {
        data.orbit = [
          data.addOrbit[0],
          data.addOrbit[1][ang > 90 && ang < 270 ? 0 : 1],
          data.addOrbit[2],
          data.addOrbit[3],
        ];
      }
      self.world.shoots[self.world.shoots_count] = new Shoot(data);
      self.world.shoots_count++;
      shootId++;
    });
  }

  setTurnDelay(shoot, account) {
    let avaDelayOne =
      account.player.check_my_ava && !isNaN(account.player.avaDelayOne)
        ? account.player.avaDelayOne
        : 0;
    let avaDelayTwo =
      account.player.itemUsed[0] == 0
        ? 0
        : account.player.check_my_ava && !isNaN(account.player.avaDelayTwo)
        ? account.player.avaDelayTwo
        : 0;
    let correcionOne = Types.ITEM.NONE[1];
    let delay = Math.round(
      shoot.delay +
        this.mobileDelay -
        avaDelayOne * correcionOne +
        (account.player.itemUsed[0] - avaDelayTwo * account.player.itemUsed[1])
    );
    account.player.addDelay(delay);
    account.player.itemUsed = Types.ITEM.NONE;
    /*	
		console.log({
			is			: "add delay",
			shootDelay	: shoot.delay,
			mobileDelay	: this.mobileDelay,
			itemUsed	: account.player.itemUsed,
			part1		: shoot.delay + this.mobileDelay,
			avaDelayOne	: avaDelayOne,
			finalADO	: avaDelayOne * correcionOne,
			avaDelayTwo	: avaDelayTwo,
			finalADT	: avaDelayTwo * account.player.itemUsed[1],
			usuarioID	: account.player.user_id,
			delayA		: (shoot.delay + this.mobileDelay - avaDelayOne * correcionOne),
			delayB		: (account.player.itemUsed[0] - avaDelayTwo * account.player.itemUsed[1]),
			delayadded	: delay,
			totaldelay	: account.player.delay
		});*/
  }

  getActualTurn() {
    return this.lastturn++;
  }

  getNextTurn(actual_turn, callback) {
    // A cada troca de turno, quem ja cumpriu o prazo volta ao jogo.
    this.scoreTickRevives();
    var self = this;
    if (self.game_endx) return null;
    var xf = 0;
    if (!self.room.turn_list.length > 0) {
      self.room.forPlayers(function (account) {
        if (typeof account !== "undefined") {
          self.room.turn_list.push({
            user_id: account.player.user_id,
            team: account.player.team,
            delay: account.player.delay,
            lastturn: account.player.lastturn,
            position: account.player.position,
          });
          account.player.game_position = account.player.position;
        }
      });
      self.room.turn_list.sort(function (a, b) {
        return a.position - b.position;
      });
    }
    this.room.forPlayers(function (account) {
      if (typeof account !== "undefined") {
        var player = account.player;
        //console.log({id:player.user_id,alive:player.is_alive});
        if (account !== null && player.is_alive === 1) {
          for (var i in self.room.turn_list) {
            var turn_data = self.room.turn_list[i];
            if (turn_data.user_id == account.user_id)
              self.room.turn_list[i].delay = player.delay;
          }
          xf++;
        } else {
          //console.log("eliminando del array");
          for (var i in self.room.turn_list) {
            var turn_data = self.room.turn_list[i];
            if (turn_data.user_id == account.user_id)
              self.room.turn_list.splice(i, 1);
          }
        }
      }
    });

    if (xf <= 0) self.checkDead();
    //console.log(this.room.turn_list);
    this.room.turn_list.sort(function (a, b) {
      //         return a.delay == b.delay ? a.lastturn == b.lastturn ? a.position-b.position : a.lastturn - b.lastturn : a.delay - b.delay;
      return a.delay == b.delay ? a.lastturn - b.lastturn : a.delay - b.delay;
    });
    self.turns_pass++;
    self.turns_pass_sudden++;
    let players = [];
    if (self.turns_pass_sudden == self.sudden - 1) {
      self.gameserver.pushBroadcastChat(
        new Message.chatResponse(self, "Dual ativado", Types.CHAT_TYPE.SYSTEM),
        self
      );
      this.room.forPlayers(function (account) {
        if (typeof account !== "undefined") {
          var player = account.player;
          player.DUAL = 1;
        }
      });
    } else if (self.turns_pass_sudden > self.sudden - 1) {
      // Morte subita nao aplica mais dano por rodada; apenas libera o tiro
      // de sudden death. O cliente tambem teve o ReduceHPby removido.
      self.suddenShoot = true;
    }
    //	console.log({is: "sudden",suddenAtTurn: self.sudden,turnCount: self.turns_pass_sudden,players: players});
    //console.log({is:"game turn list",data:self.room.turn_list});
    // Fila vazia com gente aguardando revive: destrava trazendo todos de volta.
    if (!this.room.turn_list.length) {
      this.scoreForceRevives();
    }
    callback(
      this.room.turn_list[0] !== null
        ? this.room.turn_list[0]
        : this.room.turn_list[1]
    );
  }

  UpdateUserLastTurn(user_id, lastturn) {
    for (var i in this.room.turn_list) {
      var turn_data = this.room.turn_list[i];
      if (turn_data.user_id == user_id)
        this.room.turn_list[i].lastturn = lastturn;
    }
  }

  updateWind() {
    let self = this;
    if (this.weather.current.id == 1) {
      self.turns_change_wind_angle_temp = self.room.RandomInt(
        self.turns_change_wind_angle - self.turns_change_wind_angle_mod,
        self.turns_change_wind_angle
      );
      self.change_wind_angle_turn_count = 0;
      self.wind_angle = self.getRandomInt(0, 360);
    } else if (
      self.change_wind_power_turn_count > self.turns_change_wind_power_temp
    ) {
      self.turns_change_wind_power_temp = self.room.RandomInt(
        self.turns_change_wind_power - self.turns_change_wind_power_mod,
        self.turns_change_wind_power
      );
      self.change_wind_power_turn_count = 0;
      if (self.room.max_wind > 0) {
        self.wind_power = self.getRandomInt(0, self.room.max_wind);
      }
    } else self.change_wind_angle_turn_count++;
    self.change_wind_power_turn_count++;
  }

  gamePass(account) {
    let self = this;
    let actual_turn = self.getActualTurn();
    self.weather.update();
    if (self.weather.current.id == 0) self.thor.active = true;
    else self.thor.active = false;
    clearTimeout(self.turnPassClock);
    if (typeof account !== "undefined") {
      if (account.player !== null) {
        account.player.addDelay(self.mobileDelay);
        account.player.lastturn = actual_turn;
        self.UpdateUserLastTurn(account.user_id, actual_turn);
      }
      self.turns_pass++;
    }
    self.getNextTurn(actual_turn, function (player) {
      if (typeof player !== "undefined") {
        self.turn_player = player.position;
        self.turns_pass++;
        if (Types.BOT_MODES.includes(self.room.game_mode)) {
          self.room.forBots(function (bot) {
            if (bot.player.user_id === player.user_id) {
              bot.turn();
            }
          });
        }
        // Sem account nao ha de quem passar a vez - montar a mensagem aqui
        // estourava e deixava a partida travada.
        if (typeof account === "undefined" || !account || !account.player)
          return;
        var pass_message = new Message.gamePass(
          self.lastturn,
          account,
          player,
          self.room
        );
        self.gameserver.pushToRoom(self.room.id, pass_message);
        self.historical.push(pass_message);
        self.turns_pass++;
        self.setPassTimeOut(player.user_id);
      } else {
      }
    });
  }

  onGameEnd(callback) {
    this.gameEnd_callback = callback;
  }

  getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  RadToAngle(a) {
    return (180 * a) / Math.PI;
  }

  AngleToRad(p) {
    return (p * Math.PI) / 180;
  }

  vector(a, b) {
    var data = {};
    data.x = Math.cos(this.RadToAngle(a)) * b;
    data.y = -Math.sin(this.RadToAngle(a)) * b;
    return data;
  }

  rotatePoint(point, center, angle) {
    var px = {};
    angle = angle * (Math.PI / 180); // Convert to radians
    px.x =
      Math.cos(angle) * (point.x - center.x) -
      Math.sin(angle) * (point.y - center.y) +
      center.x;
    px.y =
      Math.sin(angle) * (point.x - center.x) +
      Math.cos(angle) * (point.y - center.y) +
      center.y;
    px.x = Math.floor(px.x);
    px.y = Math.floor(px.y);
    return px;
  }

  GetNextWeatherPos() {
    var self = this;
    return self.weather.client.next;
  }
};
