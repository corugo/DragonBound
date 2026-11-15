//Player fall and die
var Types = require("./gametypes");
var Logger = require("./lib/logger");
var Message = require("./lib/message");
var Shoot = require("./lib/shoot");
/*============[BUNGE]*============*/
/*============[BUNGE]*============*/

/*============[BUNGE]*============*/
var Box = require("./lib/box");
var Vector = require("./lib/vect");
const { json } = require("body-parser");
const { isArray } = require("underscore");
/*============[BUNGE]*============*/
require("setimmediate");

// World
// Niveis do Thor: mesma tabela do cliente (THOR_LEVEL). O thor.damage acumula
// durante a partida e define o nivel 1..6.
var BotChat = require("./lib/botChat");
const THOR_LEVEL = [0, 300, 900, 1800, 3200, 6000];

// Dano do raio invocado por MOBILE, por nivel do Thor (valores de referencia do
// jogo original). O raio do CLIMA Thor NAO usa isto - ele continua com
// thor.damage / 2.
//   s2: dano POR RAIO (a Aduka S2 solta 3) -> total ~160 no nivel 1 a ~330 no 6
//   ss: dano do raio unico do SS
// O nivel 1 do ss e' estimado: a referencia nao tinha um valor confiavel e um
// replay do jogo original mostrou 123 com o Thor em 123.
const RAY_DAMAGE_BY_THOR = {
  s2: [53, 62, 67, 84, 94, 110],
  ss: [120, 150, 165, 187, 205, 225],
};

// Interpola entre os niveis em vez de dar saltos: dentro de um mesmo nivel o
// dano cresce junto com o thor.damage (no jogo original dois SS de nivel 3
// deram 174 e 198, conforme o Thor carregava).
function rayDamageByThor(tabela, thorDamage) {
  const d = typeof thorDamage === "number" && thorDamage > 0 ? thorDamage : 0;
  let i = 0;
  while (i + 1 < THOR_LEVEL.length && d >= THOR_LEVEL[i + 1]) i++;
  const base = tabela[i];
  const prox = tabela[i + 1];
  if (prox === undefined) return base; // nivel 6: teto
  const ini = THOR_LEVEL[i];
  const fim = THOR_LEVEL[i + 1];
  const t = fim > ini ? (d - ini) / (fim - ini) : 0;
  return Math.round(base + (prox - base) * t);
}

module.exports = class World {
  constructor(game, gameserver) {
    var self = this;
    let my_gold = 0;
    gameserver.forEachAccount(function (account) {
      if (account !== null) {
        if (account.player.check_my_ava === 1) my_gold = account.player.avaGold;
      }
    });
    this.game = game;
    this.gameserver = gameserver;

    this.work = false;
    this.shoots = {};
    this.shoots_count = 0;
    this.shoots_complete = 0;
    this.shoots_data = [];
    this.map = game.map;
    this.chat = [];
    this.shoot_complete = null;

    this.chat_complete = false;

    this.gp_kill = 2;
    this.gold_kill = 2300;

    this.gpDoubleKill = 5;
    this.goldDoubleKill = 500;

    this.gpTripleKill = 7;
    this.goldTripleKill = 999;

    this.gpTeamKill = -4;
    this.goldTeamKill = -2000;

    this.gold_good = 50;
    this.gold_excellent = 100;

    this.gp_lose = 3;
    this.gold_lose = 250;

    this.gold_penalty = -250;
    this.gp_penalty = -1;

    this.gp_bunge_bonus = 2;
    this.gold_bunge_bonus = 2300;

    this.gp_bunge_penalty = -2;
    this.gold_bunge_penalty = -250;

    this.gpHighAngle = 0;
    this.goldHighAngle = 50;

    this.gpUltraHighAngle = 0;
    this.goldUltraHighAngle = 100;

    this.gpDamage1000 = 1;
    this.goldDamage1000 = 1000;

    this.gpDamage2000 = 2;
    this.goldDamage2000 = 2000;

    this.gpDamage3000 = 4;
    this.goldDamage3000 = 3000;

    this.gp;
    this.gold;

    this.recetBonos();

    /*this.team_a_gp = 10;
        this.team_a_count = 1000;
        this.team_b_gp = 12;
        this.team_b_count = 1200;
        this.team_bots_count = 13;*/

    if (gameserver.evento200 === true) {
      this.gp_kill = 74;
      this.gold_kill = 4600;

      this.gold_good = 100;
      this.gold_excellent = 200;

      this.gp_lose = -6;
      this.gold_lose = 500;

      this.gold_penalty = -500;
      this.gp_penalty = -2;

      this.gp_bunge_bonus = 4;
      this.gold_bunge_bonus = 4600;

      this.gp_bunge_penalty = -103;
      this.gold_bunge_penalty = -500;
      //============[BUNGE]============*/
    }

    if (
      this.game.room.game_mode === Types.GAME_MODE.BOSS &&
      gameserver.evento200 === false
    ) {
      this.gp_kill = 28;
      this.gold_kill = 2300;

      this.gold_good = 50;
      this.gold_excellent = 100;

      this.gp_lose = -3;
      this.gold_lose = 250;

      this.gold_penalty = -250;
      this.gp_penalty = -3;

      this.gp_bunge_bonus = 3;
      this.gold_bunge_bonus = 2300;

      this.gp_bunge_penalty = -90;
      this.gold_bunge_penalty = -220;
      //============[BUNGE]============*/
    }

    if (
      this.game.room.game_mode === Types.GAME_MODE.BOSS &&
      gameserver.evento200 === true
    ) {
      this.gp_kill = 64;
      this.gold_kill = 4600;

      this.gold_good = 100;
      this.gold_excellent = 200;

      this.gp_lose = -6;
      this.gold_lose = 500;

      this.gold_penalty = -500;
      this.gp_penalty = -6;

      this.gp_bunge_bonus = 6;
      this.gold_bunge_bonus = 4600;

      this.gp_bunge_penalty = -105;
      this.gold_bunge_penalty = -440;
      //============[BUNGE]============*/
    }
    //===========================================/
    if (gameserver.evento500 === true) {
      this.gp_kill = 25;
      this.gold_kill = 12500;

      this.gold_good = 250;
      this.gold_excellent = 500;

      this.gp_lose = 25;
      this.gold_lose = 100;

      this.gold_penalty = -250;
      this.gp_penalty = -5;

      this.gp_bunge_bonus = 25;
      this.gold_bunge_bonus = 5000;

      this.gp_bunge_penalty = -75;
      this.gold_bunge_penalty = -25000;
      //============[BUNGE]============*/
    }

    if (
      this.game.room.game_mode === Types.GAME_MODE.BOSS &&
      gameserver.evento500 === true
    ) {
      this.gp_kill = 15;
      this.gold_kill = 11500;

      this.gold_good = 250;
      this.gold_excellent = 500;

      this.gp_lose = 15;
      this.gold_lose = 50;

      this.gold_penalty = -250;
      this.gp_penalty = -5;

      this.gp_bunge_bonus = 75;
      this.gold_bunge_bonus = 4000;

      this.gp_bunge_penalty = -75;
      this.gold_bunge_penalty = -25000;
      //============[BUNGE]============*/
    }

    if (
      this.game.room.game_mode === Types.GAME_MODE.BOSS &&
      gameserver.roomGPS === true
    ) {
      if (game.room.id < 5) {
        this.gp_kill = 82;
        this.gold_excellent = 4800;

        this.gold_good = 100;
        this.gold_excellent = 200;

        this.gp_lose = -8;
        this.gold_lose = 500;

        this.gold_penalty = -500;
        this.gp_penalty = -6;

        this.gp_bunge_bonus = 25;
        this.gold_bunge_bonus = 4700;

        this.gp_bunge_penalty = -105;
        this.gold_bunge_penalty = -440;
      }
    }
  }

  start() {
    this.work = true;
    this.run();
  }
  /*
    shoot(noholea = false) {
        this.chat_complete = false;
        this.nohole = noholea;
        for (var id in this.shoots) {
            this.shoots_data.push({
                s: [],
                tele: [],
                exp: null,
                thor: null,
                img: null,
                time: null,
                /*tr: null,
                change: null,
                hole: [],
                damages: [],
                wave: [],
                orbit:[],
jumps:[],
                is_lightning: [],
                no_rotate: null,
                camera: null,
                /*start : {
                    t: [30],
                    ang: [302],
                    x: [30],
                    y: [30]
                },
                ss: null
            });
        }
    }
*/
  shoot(noholea = false) {
    this.chat_complete = false;
    this.nohole = noholea;
    this.shootTicks = 0;
    for (var id in this.shoots) {
      this.shootPushData();
    }
  }

  run() {
    var self = this;
    setImmediate(function () {
      self.update();
    });
  }

  update() {
    var self = this;
    if (this.shoots_count > 0) {
      // Rede de segurança: se o loop da física rodar demais (projétil que nunca
      // completa), força o fim do disparo para não travar o turno.
      this.updateTicks = (this.updateTicks || 0) + 1;
      if (this.updateTicks > 20000) {
        this.updateTicks = 0;
        var _acc0 = this.shoots[0] ? this.shoots[0].account : null;
        var _sd = this.shoots_data.slice(0);
        var _ch = this.chat;
        this.applyPendingDeaths();
        // Descarta tambem os projeteis: sem isto os que causaram o estouro
        // continuavam vivos e voltavam a ser simulados no turno seguinte.
        this.shoots = {};
        this.shootTicks = 0;
        this.shoots_count = 0;
        this.shoots_complete = 0;
        this.chat = [];
        this.shoots_data = [];
        this.recetBonos();
        if (this.shoot_complete && _acc0) this.shoot_complete(_acc0, _sd, _ch);
        return;
      }
      var good_shot_message = false;
      // Relogio do disparo atual (1 tick por update).
      this.shootTicks = (this.shootTicks || 0) + 1;
      for (var id in this.shoots) {
        var shoot = this.shoots[id];
        if (shoot && !shoot.isComplete) {
          // Respeita o atraso de lancamento. Ate aqui TODOS os projeteis eram
          // simulados em paralelo desde o tick 0 e o stime so escalonava a
          // ANIMACAO no cliente. Por isso os 3 tiros da Aduka colidiam no mesmo
          // tick e no mesmo ponto: nenhum enxergava a cratera aberta pelo
          // anterior. Agora cada projetil so comeca a voar quando o relogio do
          // disparo alcanca o seu stime (stime esta na escala shoot.time * 2).
          if (this.shootTicks * 2 < shoot.stime) continue;
          // Raio do Thor: o cliente ja o desenha como instantaneo (o servidor
          // reporta time = 0 para isthor). No servidor, porem, ele viajava como
          // projetil comum: ~216 ticks do canhao ate o solo, contra apenas 100
          // ticks de intervalo entre os tiros da Aduka. A cratera so abria depois
          // que os carriers seguintes ja tinham caido, e os 3 acabavam no mesmo
          // ponto. Adiantamos o raio ate a beira do impacto; o passo final fica
          // para o fluxo normal abaixo, que cuida da cratera e do dano.
          if (shoot.isthor && !shoot._ff) {
            shoot._ff = true;
            var _left =
              self.map.field_left != null ? self.map.field_left : 0;
            var _right =
              self.map.field_right != null ? self.map.field_right : self.map.w;
            var _g = 0;
            while (_g++ < 20000) {
              var _n = shoot.getPosAtTime(shoot.time + 1);
              if (
                self.map.IsPixel(_n.x, _n.y) ||
                _n.y > self.map.h ||
                _n.x < _left ||
                _n.x > _right
              )
                break;
              // Para tambem ao chegar perto de um jogador, para nao pular a
              // colisao com quem estiver no caminho do feixe.
              var _near = false;
              self.game.room.forPlayers(function (acc) {
                if (_near || !acc || !acc.player || acc.player.is_alive !== 1)
                  return;
                if (
                  Math.abs(acc.player.x - _n.x) < 45 &&
                  Math.abs(acc.player.y - _n.y) < 45
                )
                  _near = true;
              });
              if (_near) break;
              shoot.time++;
              shoot.a = _n;
            }
          }
          //console.log("Shoot not complete\n");
          shoot.update();
          // ForceController.cast(shoot, self.game.weather.client.active);
          ////console.log(self.shoots[id]);
          //var ang = shoot.GetAngleAtTime();

          /* |<-========================= [Stats Avatars] ===========================->| */
          var scratch_my_ava = shoot.account.player.avaScratch;
          if (shoot.account.player.check_my_ava === 0) scratch_my_ava = 0;
          //Logger.log('Scratch: ' + scratch_my_ava);
          /* |<-========================= [Stats Avatars] ===========================->| */
          shoot.move(shoot.a.x, shoot.a.y, 0);
          shoot.bunge_jc = [
            parseInt(
              Math.round(parseInt(scratch_my_ava / 5) + shoot.pala_bunge[0])
            ),
            parseInt(
              Math.round(parseInt(scratch_my_ava / 5) + shoot.pala_bunge[1])
            ),
          ];
          this.checkCollision(shoot);
          this.checkWeatersCast(shoot);

          if (!shoot.damageComplete) {
            self.game.room.forPlayers(function (account) {
              let player = account.player;
              // //console.log({id:player.user_id,position:player.position,alive:player.is_alive});
              account.update();
              // console.log(self.game.weather.client.active);
              if (player.is_alive === 1) {
                if (!shoot.canCollide) {
                  /** @WTF is this */
                  var p2 = 20 * 20;
                  var xxdx = shoot.x0 - shoot.a.x;
                  var xxdy = shoot.y0 - shoot.a.y;
                  var p3 = xxdx * xxdx + xxdy * xxdy;
                  if (p2 < p3) {
                    shoot.canCollide = true;
                    //Logger.log('canCollide ' + shoot.canCollide);
                  }
                  /** @end WTF do this */
                } else if (shoot.isComplete) {
                  shoot.canCollide = true;
                }
                var penalty = false;

                let timxx = shoot.time * 2;
                let fullcollide = false;
                let areacollide = false;
                let x11 = player.box.isColliding(shoot.box);
                let distf = {
                  x: Math.sqrt(Math.pow(player.x - shoot.a.x, 2) + 0),
                  y: Math.sqrt(0 + Math.pow(player.y - shoot.a.y, 2)),
                  t: Math.sqrt(
                    Math.pow(player.x - shoot.a.x, 2) +
                      Math.pow(player.y - shoot.a.y, 2)
                  ),
                };
                let dm = shoot.damage;
                let heal = shoot.heal;
                let shdm = 0;

                if (shoot.canCollide && x11 === 0) fullcollide = true;

                if (shoot.groundCollide || fullcollide || shoot.isComplete) {
                  if (
                    shoot.account.player.TELEPORT == 1 &&
                    (self.map.w < shoot.a.x ||
                      self.map.h < shoot.a.y ||
                      self.map.GetUnder(player.x, player.y, 0) === 0)
                  ) {
                    shoot.cancelTele = true;
                  }
                  /*
									console.log({
										is:"teleport",
										tamañoMapa		: {
											h:self.map.h,
											w:self.map.w,
										},
										pocicionDisparo	: shoot.a,
										condicionA		: self.map.w < shoot.a.x,
										condicionB		: self.map.h < shoot.a.y
									});*/
                  if (
                    shoot.bonos &&
                    shoot.account.player.team === player.team &&
                    self.game.room.event_game_room === 0
                  ) {
                    penalty = true;
                  }

                  if (self.game.room.no_bonus_user) self.gp_kill = 0;
                  if (distf.t <= 60 && shoot.heal) {
                    //distancia
                    heal -= distf.t / 2;
                    areacollide = true;
                  } else if (shoot.damage == null && shoot.canPlayerCollide) {
                    shoot.isComplete = true;
                    shoot.damageComplete = true;
                  } else if (
                    distf.x <= shoot.bunge_jc[0] &&
                    distf.y <= shoot.bunge_jc[1]
                  ) {
                    dm -= distf.t / 2;
                    areacollide = true;
                  }
                  if (fullcollide || areacollide) {
                    /** @Begin add Shoots */
                    if (!shoot.canPlayerCollide) {
                      // UM raio por alvo. O guard antigo (_wait > 50) era um
                      // contador global do tiro, incrementado uma vez POR JOGADOR
                      // a cada tick: com o projetil passando devagar sobre alguem
                      // (perto do apice) o contador estourava os 50 ainda dentro
                      // da area e o SS da Aduka soltava 2 lasers no mesmo alvo.
                      // Registrando quem ja foi atingido, cada jogador leva
                      // exatamente um raio - e o SS segue varrendo os demais.
                      if (!shoot._hitPlayers) shoot._hitPlayers = {};
                      if (!shoot._hitPlayers[player.user_id]) {
                        shoot._hitPlayers[player.user_id] = true;
                        self.addAtCollide(shoot);
                      }
                    }
                    if (areacollide && shoot.area) {
                      shoot.a = {
                        x: player.x,
                        y: player.y,
                      };
                      self.addShootQueue(shoot);
                    }
                    if (
                      !self.map.IsPixel(shoot.a.x, shoot.a.y) &&
                      shoot.is == "digger"
                    )
                      shoot.canPlayerCollide = true;
                    /** @End add Shoots */
                    if (shoot.canPlayerCollide) {
                      if (player.shield > 0 && !shoot.heal) {
                        //Logger.cyan("#1 Shield: "+player.shield+" - DameShot: "+dm+" - User: "+player.game_id);
                        shdm = player.shield - dm;
                        if (shdm === 0) {
                          player.setShield(0);
                          if (shoot.image === Types.BULLETS.JD2) {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                movex: shoot.a.x,
                                hp: player.hp,
                                damage: 0,
                                shield: player.shield,
                              }
                            );
                          } else {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                hp: player.hp,
                                damage: 0,
                                shield: player.shield,
                              }
                            );
                          }
                        } else if (shdm < 0) {
                          player.setShield(0);
                          player.disHpShield(Math.floor(Math.abs(shdm)), 0);
                          if (shoot.image === Types.BULLETS.JD2) {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                movex: shoot.a.x,
                                hp: player.hp,
                                damage: 0,
                                shield: player.shield,
                              }
                            );
                          } else {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                hp: player.hp,
                                damage: 0,
                                shield: player.shield,
                              }
                            );
                          }
                        } else {
                          player.setShield(Math.floor(Math.abs(shdm)));
                          if (shoot.image === Types.BULLETS.JD2) {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                movex: shoot.a.x,
                                hp: player.hp,
                                damage: +shdm,
                                shield: player.shield,
                              }
                            );
                          } else {
                            self.shoots_data[self.shoots_complete].damages.push(
                              {
                                n: player.game_position,
                                hp: player.hp,
                                damage: +shdm,
                                shield: player.shield,
                              }
                            );
                          }
                        }
                      } else {
                        if (shoot.heal > 0)
                          player.disHpShield(Math.floor(-Math.abs(heal)), 0);
                        else player.disHpShield(Math.floor(Math.abs(dm)), 0);
                        if (shoot.teleport && shoot.type == 1) {
                          player.x = shoot.a.x;
                          self.shoots_data[self.shoots_complete].damages.push({
                            n: player.game_position,
                            movex: shoot.a.x,
                            hp: player.hp,
                            damage: dm,
                            shield: player.shield,
                          });
                        } else if (shoot.teleport && shoot.type == 2) {
                          if (player.x > shoot.a.x) player.x = shoot.a.x + 100;
                          else player.x = shoot.a.x - 100;
                          self.shoots_data[self.shoots_complete].damages.push({
                            n: player.game_position,
                            movex: player.x,
                            hp: player.hp,
                            damage: dm,
                            shield: player.shield,
                          });
                        } else if (heal > 0) {
                          self.shoots_data[self.shoots_complete].damages.push({
                            n: player.game_position,
                            heal: heal,
                            hp: player.hp,
                          });
                        } else {
                          self.shoots_data[self.shoots_complete].damages.push({
                            n: player.game_position,
                            damage: dm,
                            hp: player.hp,
                          });
                        }
                      }

                      if (penalty) {
                        self.bonos.teamDamage = [
                          Types.GAMEMSG.team_damage_penalty,
                          self.gold_penalty,
                          self.gp_penalty,
                        ];
                      } else {
                        self.bonos.damage = [
                          Types.GAMEMSG.good_shot,
                          self.gold_good,
                          0,
                        ];
                      }

                      // Nao mata na hora: o personagem fica em campo ate o ULTIMO
                      // tiro da rodada terminar, para tomar (e acumular) os demais
                      // hits. Sem isto a Aduka matando no 1o dos 6 raios do dual
                      // fazia o alvo sumir e os outros 5 passavam direto.
                      // O kill entra no placar so uma vez, aqui.
                      if (player.hp <= 0 && !player.pending_death) {
                        player.pending_death = true;
                        BotChat.onKill(shoot.account, player, self.game && self.game.room);
                        self.bonos.kills.push([
                          player.game_position,
                          true,
                          penalty,
                        ]);
                      }
                      if (heal > 0)
                        self.bonos.totaldamage += shdm > 0 ? shdm : dm;

                      shoot.isComplete = true;
                      shoot.damageComplete = true;
                      if (!shoot.groundCollide) {
                        self.addGroundHole(shoot);
                        account.update();
                      }
                    }
                  }

                  /*============[BUNGE]*============*/
                  if (player.is_alive) {
                    player.falling = false;
                    if (typeof player.y === "undefined" || player.y === 2000) {
                      Logger.info("BUNGE CODE #1");
                      //Logger.info("Player ["+player.game_id+"] fall and die");
                      player.falling = true;
                      shoot.chat_complete = true;
                      player.is_alive = 0;
                      player.setAlive(0);
                      player.cause_by = shoot.account.player.game_id;
                      BotChat.onKill(shoot.account, player, self.game && self.game.room);
                      self.chat.push(Types.GAMEMSG.bunge_bonus);
                      self.chat.push(Types.GAMEMSG.x_bunge_y);
                      self.chat.push(player.game_position);
                      self.bonos.kills.push([
                        player.game_position,
                        false,
                        penalty,
                      ]);
                      shoot.account.player.addWinGoldWinGp(
                        self.gold_bunge_bonus,
                        self.gp_bunge_bonus
                      );
                      self.chat.push(Types.GAMEMSG.bbp_fantastic_shot);
                      if (penalty && !self.bonos.suicideBunge) {
                        //Logger.data("BUNGE CODE #1.1");
                        self.bonos.suicideBunge = true;
                        self.chat.push(Types.GAMEMSG.suicide_penalty_bunge);
                        shoot.account.player.addWinGoldWinGp(
                          self.gold_bunge_penalty,
                          self.gp_bunge_penalty
                        );
                      }
                      //Logger.log("Status: "+player.is_alive+" -  Player: "+player.game_id);
                      account.update();
                    } else {
                      //Logger.info("BUNGE CODE #2");
                      //Logger.debug("Player ["+player.game_id+"] fall and not die");
                      var yf = self.map.GetUnder(player.x, player.y, 0);
                      if (yf === 0 && player.is_alive) {
                        //Logger.data("BUNGE CODE #2.1");
                        var tmp_y = 0;
                        var tmp_c = 1;
                        var tmp_under = 0;
                        do {
                          //Logger.data("BUNGE CODE #2.2");
                          tmp_y = self.map.GetUnder(player.x, player.y + tmp_c);
                          if (player.y + tmp_c > self.map.h) {
                            //Logger.data("BUNGE CODE #2.3");
                            player.falling = true;
                            player.y = self.map.h;
                            tmp_y = -1;
                            self.chat.push(Types.GAMEMSG.bbp_fantastic_shot);
                            //Logger.debug("World player falling 1");
                            self.chat.push(Types.GAMEMSG.x_bunge_y);
                            self.chat.push(shoot.account.player.game_position);
                            self.bonos.kills.push([
                              player.game_position,
                              false,
                              penalty,
                            ]);
                            //Logger.data("BUNGE CODE #2.4");
                          }
                          tmp_c++;
                        } while (tmp_y == 0);
                        if (tmp_y !== 0) {
                          //Logger.data("BUNGE CODE #2.5");
                          player.y = tmp_y;
                          if (player.box === null) {
                            //Logger.data("BUNGE CODE #2.6");
                            player.box = new Box(
                              new Vector(player.x, player.y),
                              36,
                              40,
                              0
                            );
                          } else {
                            //Logger.data("BUNGE CODE #2.7");
                            player.box.setp(new Vector(player.x, player.y));
                          }
                          //Logger.data("BUNGE CODE #2.8");
                        }
                        //Logger.data("BUNGE CODE #2.9");
                      } else {
                        //Logger.data("BUNGE CODE #2.10");
                        player.y = yf;
                        if (player.box === null) {
                          //Logger.data("BUNGE CODE #2.11");
                          player.box = new Box(
                            new Vector(player.x, player.y),
                            36,
                            40,
                            0
                          ); //36, 40
                        } else {
                          //Logger.data("BUNGE CODE #2.12");
                          player.box.setp(new Vector(player.x, player.y));
                          //Logger.cyan("Mis Datos ["+player.game_id+"] de posicion: x: "+player.x+" - y: "+player.y);
                        }
                        //Logger.data("BUNGE CODE #2.13");
                      }
                      //Logger.data("BUNGE CODE #2.14");
                    }
                  }
                  /*============[BUNGE]*============*/
                }
              }
            });
          }
          if (shoot.isComplete) {
            this.shoots_data[this.shoots_complete].s.push(shoot.x0);
            this.shoots_data[this.shoots_complete].s.push(shoot.y0);
            this.shoots_data[this.shoots_complete].s.push(shoot.ang);
            this.shoots_data[this.shoots_complete].s.push(shoot.power);
            this.shoots_data[this.shoots_complete].s.push(
              shoot.ax ? shoot.ax : shoot.friccion
            );
            this.shoots_data[this.shoots_complete].s.push(
              shoot.ay ? shoot.ay : shoot.weight
            );
            this.shoots_data[this.shoots_complete].s.push(shoot.stime);
            // Tiro que saiu da tela nao explode. O cliente chama CreateExplode
            // (que toca AudioPlay do som de impacto) sempre que um tiro completa;
            // sem zerar o exp aqui, a bala perdida na parede da sala fazia o som
            // de impacto - mesma raiz do raio da Aduka disparando fora da tela.
            this.shoots_data[this.shoots_complete].exp = shoot._outOfBounds
              ? null
              : shoot.account.player.TELEPORT == 1
              ? 7
              : shoot.explode; //EXPLODE
            this.shoots_data[this.shoots_complete].thor = shoot.isthor;
            this.shoots_data[this.shoots_complete].img =
              shoot.account.player.TELEPORT == 1 ? 10 : shoot.image; //BULLETS
            if (shoot.account.player.TELEPORT == 1) {
              if (!shoot.cancelTele) {
                this.shoots_data[this.shoots_complete].tele.push(
                  shoot.account.player.game_position
                );
                this.shoots_data[this.shoots_complete].tele.push(shoot.a.x);
                this.shoots_data[this.shoots_complete].tele.push(shoot.a.y);
                this.shoots_data[this.shoots_complete].tele.push(shoot.a.x);
                this.shoots_data[this.shoots_complete].tele.push(shoot.a.y);
              }
              shoot.account.player.TELEPORT = 0;
            }
            this.shoots_data[this.shoots_complete].orbit = shoot.orbit;
            this.shoots_data[this.shoots_complete].wave = shoot.wave;
            /*this.shoots_data[ this.shoots_complete ].change.at = shoot.at;
						this.shoots_data[ this.shoots_complete ].change.exp = shoot.explodeC;
						this.shoots_data[ this.shoots_complete ].change.img = shoot.imageC;*/
            this.shoots_data[this.shoots_complete].is_lightning =
              shoot.isLightning;
            this.shoots_data[this.shoots_complete].no_rotate = shoot.no_rotate;
            this.shoots_data[this.shoots_complete].camera = shoot.camera;
            this.shoots_data[this.shoots_complete].behind = shoot.behind;
            this.shoots_data[this.shoots_complete].no_sound = shoot.no_sound;
            // Efeitos visuais de clima (Force/Lightning/Black) sao detectados
            // durante o voo, mas o slot correto so e conhecido AGORA. Antes eram
            // gravados em shoots_data[shoots_complete], que aponta para o proximo
            // projetil a terminar: com mobiles multi-projetil (Aduka S2 = 3,
            // Bigfoot/Dragon SS = 8, Boomer S2 = 4, e Dual dobrando tudo) o efeito
            // caia no slot errado e era sobrescrito pelos projeteis seguintes.
            if (shoot._weatherTr)
              this.shoots_data[this.shoots_complete].tr = shoot._weatherTr;
            if (shoot._weatherBlackAt != null)
              this.shoots_data[this.shoots_complete].black_at =
                shoot._weatherBlackAt;
            this.shoots_data[this.shoots_complete].s.push(shoot.image);
            this.shoots_data[this.shoots_complete].time = shoot.isthor
              ? 0
              : shoot.time * 2;
            this.shoots_data[this.shoots_complete].ss = shoot.ss;

            // Segmento apenas refletido (tornado/espelho) nao dispara os efeitos
            // de fim: eles migraram para o proximo segmento em _carryEndEffects.
            // Tiro que saiu da tela tambem nao dispara: ele se perdeu, nao acertou.
            if (!shoot._continues && !shoot._outOfBounds) {
              self.addAtMaxT(shoot);
              self.addAtEnd(shoot);
              self.addAtTime(shoot);
            }
            self.addWeatherDamage(shoot);

            //	console.log("====================== Final Shoot ============================")
            //	console.log(`Shoot`, this.shoots_data[this.shoots_complete])
            //	console.log("===============================================================")
            this.shoots_complete++;
          }
        }
      }
      if (this.shoots_count <= this.shoots_complete) {
        // Todos os tiros terminaram: agora quem ficou sem vida sai de campo.
        this.applyPendingDeaths();
        this.shoots_count = 0;
        this.shoots_complete = 0;
        this.updateTicks = 0;
        this.procesBonos({
          account: self.shoots[0].account,
          shoots_data: self.shoots_data.slice(0),
          chat: this.chat,
          bonos: this.bonos,
        }).then((data) => {
          //	console.log({is:"world shoot compleate", data:data});
          this.shoot_complete(data.account, data.shoots_data, data.chat);
          this.chat = [];
          this.shoots_data = [];
          this.recetBonos();
        });
        //.catch((error)=>console.log({is:"world shoot compleate",error:error}))
      }
      setImmediate(function () {
        self.update();
      });
    }
  }

  onShootComplete(callback) {
    this.shoot_complete = callback;
  }
  procesBonos(data) {
    //	console.log({is:"proces bonos in ",data:data});
    return this.addKillsBonus(data)
      .then((data) => {
        //console.log({is:"add kills bonus", data:data});
        return this.addMultiKillBonus(data);
      })
      .then((data) => {
        return this.addAngleBonus(data);
      })
      .then((data) => {
        //console.log({is:"set dead bonus",data:data});
        return this.addGeneralBonus(data);
      }) /*
		.then((data)=>{
			//console.log({is:"add general bonus", data:data});
			return data
		})*/
      .catch((error) => {
        //console.log({is:"world shoot Error",error:error})
        return false;
      });
  }
  addKillsBonus(data) {
    let self = this;
    let kills = data.bonos.kills;
    return new Promise((resolve) => {
      data.bonos.ValidKills = 0;
      for (let i = 0; i < kills.length; i++) {
        //	console.log({is:"kill bonus",data: kills[i]});
        if (kills[i][1]) {
          data.chat.push(
            Types.GAMEMSG.bbp_great_shot,
            Types.GAMEMSG.x_killed_y,
            kills[i][0]
          );
          data.account.player.addWinGoldWinGp(self.gold_kill, self.gp_kill);
        }
        if (!kills[i][2]) data.bonos.ValidKills += 1;
      }
      resolve(data);
    });
  }
  addMultiKillBonus(data) {
    if (data.bonos.ValidKills > 1) {
      let bono;
      if (data.bonos.ValidKills == 2)
        bono = [
          Types.GAMEMSG.double_kill,
          this.goldDoubleKill,
          this.gpDoubleKill,
        ];
      else
        bono = [
          Types.GAMEMSG.triple_kill,
          this.goldTripleKill,
          this.gpTripleKill,
        ];
      data.chat.push(bono[0]);
      data.account.player.addWinGoldWinGp(bono[1], bono[2]);
    }
    return data;
  }
  addAngleBonus(data) {
    if (data.bonos.damage && !data.bonos.teamDamage) {
      if (
        (Math.abs(data.shoots_data[0].s[2]) >= 70 &&
          Math.abs(data.shoots_data[0].s[2]) < 80) ||
        (Math.abs(data.shoots_data[0].s[2]) <= 110 &&
          Math.abs(data.shoots_data[0].s[2]) > 100)
      ) {
        data.chat.push(Types.GAMEMSG.high_ang);
        data.account.player.addWinGoldWinGp(
          this.goldHighAngle,
          this.gpHighAngle
        );
      } else if (
        Math.abs(data.shoots_data[0].s[2]) >= 80 &&
        Math.abs(data.shoots_data[0].s[2]) <= 100
      ) {
        data.chat.push(Types.GAMEMSG.ultra_high_ang);
        data.account.player.addWinGoldWinGp(
          this.goldUltraHighAngle,
          this.gpUltraHighAngle
        );
      }
    }
    return data;
  }
  addGeneralBonus(data) {
    return new Promise((resolve) => {
      Object.keys(data.bonos).forEach((value, index, array) => {
        if (data.bonos[value].length == 3) {
          data.chat.push(data.bonos[value][0]);
          data.account.player.addWinGoldWinGp(
            data.bonos[value][1],
            data.bonos[value][2]
          );
        }
        if (index === array.length - 1) {
          //console.log({is:"return",data:data});
          resolve(data);
        }
      });
    });
  }
  // Efetiva as mortes que ficaram pendentes durante a rodada.
  applyPendingDeaths() {
    var self = this;
    if (!self.game || !self.game.room) return;
    self.game.room.forPlayers(function (account) {
      if (!account || !account.player) return;
      if (account.player.pending_death) {
        account.player.pending_death = false;
        account.player.setAlive(0);
      }
    });
  }

  checkCollision(shoot) {
    let self = this;
    //	console.log({isCollider:self.map.IsPixel(shoot.a.x, shoot.a.y)})
    if (
      (self.map.IsPixel(shoot.a.x, shoot.a.y) &&
        !shoot.groundCollide &&
        shoot.canMapCollide &&
        shoot.is != "digger") ||
      (!self.map.IsPixel(shoot.a.x, shoot.a.y) && shoot.is == "digger")
    ) {
      /*	console.log({
				is:"check collision",
				condicionA	: (self.map.IsPixel(shoot.a.x, shoot.a.y) && !shoot.groundCollide && shoot.canMapCollide && shoot.is != "digger"),
				condicionB	: (!self.map.IsPixel(shoot.a.x, shoot.a.y ) && shoot.is == "digger" ) ,
				condicionC	: (self.map.w < shoot.a.x || self.map.h < shoot.a.y),
				condicionD	: (shoot.time>shoot.killAt),
			})*/
      shoot.isComplete = true;
      self.addGroundHole(shoot);
      shoot.groundCollide = true;
    } else if (
      (self.map.field_right != null ? self.map.field_right : self.map.w) <
        shoot.a.x ||
      self.map.h < shoot.a.y ||
      shoot.a.x <
        (self.map.field_left != null ? self.map.field_left : 0) ||
      shoot.time > shoot.killAt * 2 ||
      shoot.time > 12000
    ) {
      // Destrói ao atingir o LIMITE DA TELA (campo visível): direita
      // (field_right = ground_size - offset_x), esquerda (field_left = -offset_x)
      // ou fundo (a.y > h). O terreno de colisão é menor e fica centralizado no
      // campo, por isso o projétil viaja pela margem até a borda da tela.
      // Mantido um teto de tempo (dobrado) como salvaguarda contra loop.
      shoot.isComplete = true;
      // Sair da tela NAO e' acertar: o tiro se perde. Sem esta marca os efeitos
      // de fim disparavam mesmo assim - o raio da Aduka caia como se ela tivesse
      // atingido alguma coisa.
      shoot._outOfBounds = true;
      /*	console.log({
				is:"check collision",
				condicionA	: (self.map.IsPixel(shoot.a.x, shoot.a.y) && !shoot.groundCollide && shoot.canMapCollide && shoot.is != "digger"),
				condicionB	: (!self.map.IsPixel(shoot.a.x, shoot.a.y ) && shoot.is == "digger" ) ,
				condicionC	: (self.map.w < shoot.a.x || self.map.h < shoot.a.y),
				condicionD	: (shoot.time>shoot.killAt),
			})*/
    }
  }

  //Aqui empieza las balas de weathers

  checkWeatersCast(shoot) {
    // O raio do Thor nao sofre clima nenhum: nem desvio (tornado/espelho) nem
    // dano (Force/Black). Isso vale tanto para o raio do clima Thor quanto para
    // o invocado por mobiles - e o motivo de a Aduka S2 ser imune a Force/Black:
    // seus 3 projeteis tem damage null (nao ferem) e todo o dano vem do raio.
    if (shoot.isthor) return;
    this.game.weather.active.forEach((force) => {
      if (force.isCollide(shoot.a.x)) {
        for (const cast in force.cast) {
          const isArr = Array.isArray(force.cast[cast]);
          const castName = isArr ? force.cast[cast][0] : force.cast[cast];
          if (isArr)
            this["_castWeather" + castName](shoot, force, force.cast[cast][1]);
          else this["_castWeather" + castName](shoot, force);
        }
      }
    });
  }
  _castWeatherTornado(shoot, force, config) {
    const v = shoot.getVelocityAtTime(shoot.time);
    // 1º contato com ESTE tornado (entrando de fora OU lançado de dentro):
    // captura a velocidade de entrada e já gera uma bala RETA (sem gravidade,
    // mesma direção, sem flip) — o zigzag fica reto desde a entrada.
    if (shoot.lastTornado !== force.px) {
      shoot.lastTornado = force.px;
      shoot.countTornado = 2; // voltas neste tornado
      shoot.tornadoVx = Math.abs(v.x);
      shoot.tornadoVy = v.y;
      shoot.tornadoWeight = shoot.weight;
      shoot.tornadoFriccion = shoot.friccion;
      shoot.countMirror = 0;
      shoot.lastMirror = null;
      const entryVx = v.x >= 0 ? shoot.tornadoVx : -shoot.tornadoVx; // mantém a direção
      const entryConfig = {
        ...config,
        countTornado: shoot.countTornado, // NÃO decrementa (não é quicada, é a entrada)
        lastTornado: shoot.lastTornado,
        tornadoVx: shoot.tornadoVx,
        tornadoVy: shoot.tornadoVy,
        tornadoWeight: shoot.tornadoWeight,
        tornadoFriccion: shoot.tornadoFriccion,
        _nextVx: entryVx,
      };
      this._castWeatherMirrorTornado(shoot, force, entryConfig);
      return;
    }
    if (shoot.countTornado < 0) return; // já saiu

    const movingRight = v.x >= 0;
    const nearEdge = !force.isCollide(shoot.a.x, -6);
    // Toca a borda movendo-se PRA FORA (captura inclusive tiros lançados de dentro):
    const atRightEdge = movingRight && nearEdge && shoot.a.x >= force.px;
    const atLeftEdge = !movingRight && nearEdge && shoot.a.x <= force.px;

    if (atRightEdge || atLeftEdge) {
      shoot.countMirror = 0;
      shoot.lastMirror = null;
      const baseCfg = {
        ...config,
        lastTornado: shoot.lastTornado,
        tornadoVx: shoot.tornadoVx,
        tornadoVy: shoot.tornadoVy,
        tornadoWeight: shoot.tornadoWeight,
        tornadoFriccion: shoot.tornadoFriccion,
      };
      if (shoot.countTornado > 0) {
        // QUICADA: flip horizontal, reta (sem gravidade). O vertical vem da ENTRADA.
        shoot.countTornado--;
        const nextVx = atRightEdge ? -shoot.tornadoVx : shoot.tornadoVx;
        this._castWeatherMirrorTornado(shoot, force, {
          ...baseCfg, countTornado: shoot.countTornado, _exit: false, _nextVx: nextVx,
          // Segmento entre a 1ª e a 2ª reflexão: renderiza ATRÁS do tornado.
          behind: shoot.countTornado === 1,
        });
      } else {
        // SAÍDA (count 0): mantém a direção (pra fora), restaura gravidade e encerra.
        shoot.countTornado = -1;
        const exitVx = atRightEdge ? shoot.tornadoVx : -shoot.tornadoVx;
        this._castWeatherMirrorTornado(shoot, force, {
          ...baseCfg, countTornado: -1, _exit: true, _nextVx: exitVx,
        });
      }
    }
  }
  // Um tiro refletido (tornado/espelho) NAO acabou: ele segue no proximo
  // segmento. Os efeitos de fim (addAtEnd - ex.: o raio invocado por cada
  // projetil da Aduka) precisam viajar junto, senao disparam no ponto de
  // ENTRADA do tornado e o dano cai longe de onde a bala terminou na tela.
  _carryEndEffects(shoot) {
    // Migra os 3 hooks de fim e o que cada um referencia:
    //   addAtEnd  -> thor (Aduka), lightning (Lightning/Electrico),
    //                ion (Asate/Knight/Dragon2), digger (Nak), walk (Raon/Frog)
    //   addAtMaxT -> change/bulets (Armor/Turtle/Boomer SS, Kalsiddon)
    for (const hook of ["addAtEnd", "addAtMaxT", "addAtTime"]) {
      const list = shoot[hook];
      if (Array.isArray(list) && list.length) {
        shoot.config[hook] = list;
        for (const k of list) shoot.config[k] = shoot[k];
      }
    }
    shoot._continues = true;
  }
  _castWeatherMirrorTornado(shoot, force, config) {
    shoot.lastMirror = shoot.lastMirror ? shoot.lastMirror : null;
    shoot.countMirror = shoot.countMirror ? shoot.countMirror : 0;
    if (shoot.lastMirror !== force.px) {
        shoot.isComplete = true;

        // Velocidade da quicada = momentum/ângulo de ENTRADA (constante), não o atual.
        const cur = shoot.getVelocityAtTime(shoot.time);
        const nvx = typeof config._nextVx === "number" ? config._nextVx : -cur.x;
        const nvy = typeof config.tornadoVy === "number" ? config.tornadoVy : cur.y;
        const reflectedAngle = (180 * Math.atan2(-nvy, nvx)) / Math.PI;
        const speed = Math.sqrt(nvx * nvx + nvy * nvy);
        // Entrada e quicadas internas: SEM gravidade (segmentos retos).
        // Só a SAÍDA (_exit) restaura gravidade/vento para retomar o arco lá fora.
        const isExit = config._exit === true;
        const w = typeof config.tornadoWeight === "number" ? config.tornadoWeight : shoot.weight;
        const fr = typeof config.tornadoFriccion === "number" ? config.tornadoFriccion : shoot.friccion;

        shoot.config = {
            ...config,
            ...{
                ang: reflectedAngle,
                power: speed,
                damage: shoot.damage,
                pala_bunge: shoot.pala_bunge,
                image: shoot.image,
                explode: shoot.explode,
                weight: isExit ? w : 0,
                friccion: isExit ? fr : 0,
                // Foco de camera: o cliente segue apenas o PRIMEIRO tiro do turno
                // (slot 0 de shoots_data). Só a cadeia de segmentos dessa bala
                // herda o foco - se todo segmento forçasse camera, com mobiles
                // multi-projetil (Aduka = 3) a camera ficaria pulando entre elas.
                camera: shoot.camera === true || this.shoots_complete === 0,
                // Cada segmento e um Shot novo no cliente e o construtor chama
                // PlaySound() - sem isto o tiro parece ser disparado de novo a
                // cada quicada dentro do tornado.
                no_sound: true,
                lastMirror: force.px,
                countMirror: shoot.countMirror + 1,
                stime: shoot.stime + shoot.time * 2,
            },
        };
        shoot.damage = null;
        shoot.explode = null;
        if (shoot.config.countMirror < 10) {
            this._carryEndEffects(shoot);
            this.addbulets(shoot);
        }
        else {
            this.addGroundHole(shoot);
            shoot.groundCollide = true;
        }
    }
  }
  _castWeatherMirror(shoot, force, config) {
    shoot.lastMirror = shoot.lastMirror ? shoot.lastMirror : null;
    shoot.countMirror = shoot.countMirror ? shoot.countMirror : 0;
    if (shoot.lastMirror !== force.px) {
      shoot.isComplete = true;

      const v = shoot.getVelocityAtTime(shoot.time);
      const reflectedAngle = (180 * Math.atan2(-v.y, -v.x)) / Math.PI;
      const reflectedPower = Math.sqrt(v.x * v.x + v.y * v.y);

      shoot.config = {
        ...config,
        ...{
          ang: reflectedAngle,
          power: reflectedPower,
          damage: shoot.damage,
          pala_bunge: shoot.pala_bunge,
          image: shoot.image,
          explode: shoot.explode,
          weight: shoot.weight,
          friccion: shoot.friccion,
          // Cada reflexao vira um Shot novo no cliente, cujo construtor chama
          // PlaySound(). Sem isto o tiro parece ser disparado de novo a cada
          // quicada no espelho (mesmo caso do tornado).
          no_sound: true,
          // O segmento refletido e um Shot NOVO: sem herdar o foco, a camera
          // largava a bala ao bater no espelho. Só a cadeia da bala que o
          // cliente ja seguia (slot 0) propaga o foco.
          camera: shoot.camera === true || this.shoots_complete === 0,
          lastMirror: force.px,
          countMirror: shoot.countMirror + 1,
          stime: shoot.stime + shoot.time * 2,
        },
      };
      shoot.damage = null;
      shoot.explode = null;
      //	console.log("is mirror",{shoot:shoot})
      if (shoot.config.countMirror < 10) {
        this._carryEndEffects(shoot);
        this.addbulets(shoot);
      }
      else {
        this.addGroundHole(shoot);
        shoot.groundCollide = true;
      }
    }
  }
  _castWeatherLightning(shoot, force, config) {
    // Um raio NAO pode invocar outro raio. O raio nasce em x = ponto de impacto
    // e cai vertical sobre ele - ou seja, dentro da propria faixa do clima. Sem
    // este guard ele ganharia "lightning" no addAtEnd, geraria outro raio, e
    // assim indefinidamente (o guard shoot.is nao pega, pois cada raio e um
    // Shoot novo com is indefinido).
    if (shoot.isLightning) return;
    if (shoot.is !== "weatherLightning") {
      //	console.log({shoot:shoot,include:shoot.addAtEnd.includes("lightning")})
      shoot.is = "weatherLightning";
      shoot.addAtEnd = shoot.addAtEnd.includes("lightning")
        ? shoot.addAtEnd
        : shoot.addAtEnd.concat(["lightning"]);
      shoot.lightning = [config];
      shoot._weatherTr = [50, 0, shoot.time * 2, 200];
    }
  }
  _castWeatherSun(shoot, force, config) {
    if (shoot.is !== "weatherSun") {
      const { time } = shoot;
      shoot.is = "weatherSun";
      // shoot.addAtEnd	= shoot.addAtEnd.includes("sun")?shoot.addAtEnd:shoot.addAtEnd.concat(["sun"])
      let shot_step = [];
      const max_step = 10;
      let pointer_step = 0;
      for (pointer_step; pointer_step < max_step; pointer_step++) {
        const time_lapse = time * 2;
        const sum_step = pointer_step === 0 ? 0 : pointer_step === 1 ? 40 : 50;
        shot_step.push(time_lapse + sum_step);
      }
      shoot._weatherTr = [
        51,
        3,
        time * 2,
        50,
        shot_step,
      ];

      // Force (+50%). So multiplica dano NUMERICO: damage null identifica o
      // projetil que nao causa dano direto (ex.: os 3 da Aduka S2, que so
      // invocam raios). Como 0 == null e falso, vira-lo 0 quebraria a checagem
      // de checkCollision e o projetil passaria a aplicar dano espurio.
      if (typeof shoot.damage === "number") shoot.damage = shoot.damage * 1.5;
    }
  }
  _castWeatherBlack(shoot, force, config) {
    if (shoot.is !== "weatherBlack") {
      const { time } = shoot;
      shoot.is = "weatherBlack";
      // shoot.addAtEnd	= shoot.addAtEnd.includes("black")?shoot.addAtEnd:shoot.addAtEnd.concat(["black"])
      shoot._weatherBlackAt = time * 2;

      // Black (-50%), mesmo cuidado com damage null do Force acima.
      if (typeof shoot.damage === "number") shoot.damage = shoot.damage * 0.5;
    }
  }

  addGroundHole(shoot) {
    let self = this;
    self.shoots_data[self.shoots_complete].hole.push(shoot.a.x);
    self.shoots_data[self.shoots_complete].hole.push(shoot.a.y);
    self.shoots_data[self.shoots_complete].hole.push(
      self.nohole ? 0 : shoot.bunge_jc[0]
    );
    self.shoots_data[self.shoots_complete].hole.push(
      self.nohole ? 0 : shoot.bunge_jc[1]
    );
    self.map.AddGroundHole(
      shoot.a.x,
      shoot.a.y,
      shoot.bunge_jc[0],
      shoot.bunge_jc[1]
    );
  }
  addAtMaxT(data) {
    let self = this;
    if (data.addAtMaxT)
      for (const add of data.addAtMaxT) {
        for (let i = 0; i < data[add].length; i++) {
          //		console.log(`add ${add} id: ${i} at MaxT`)
          data.config = data[add][i];
          data.config.stime = data.stime * 2 + data.getMaxT();
          data.config.iD = i;
          self["add" + add](data);
        }
      }
  }

  addAtTime(data) {
    let self = this;
    if (data.addAtTime)
      for (const add of data.addAtTime) {
        for (let i = 0; i < data[add[0]].length; i++) {
          //		console.log(`add ${add[0]} id: ${i} at time ${add[1]}`)
          data.config = data[add[0]][i];
          data.config.stime = add[1];
          data.config.iD = i;
          self["add" + add[0]](data);
        }
      }
  }

  addAtEnd(data) {
    let self = this;
    if (data.addAtEnd)
      for (const add of data.addAtEnd) {
        for (let i = 0; i < data[add].length; i++) {
          //		console.log(`add ${add} id: ${i} at End`)
          data.config = data[add][i];
          data.config.stime =
            data.config.addtime == "maxt"
              ? data.stime + data.getMaxT()
              : (data.config.addtime ? (i + 1) * data.config.addtime : 0) +
                data.stime +
                data.time * 2;
          data.config.iD = i;
          self["add" + add](data);
        }
      }
  }

  addAtCollide(data) {
    let self = this;
    if (data.addAtCollide) {
      for (const add of data.addAtCollide) {
        for (let i = 0; i < data[add].length; i++) {
          //		console.log(`add ${add} id: ${i} at collide`)
          data.config = data[add][i];
          data.config.stime =
            (data.config.addtime ? (i + 1) * data.config.addtime : 0) +
            data.stime +
            data.time * 2;
          data.config.iD = i;
          self["add" + add](data);
        }
      }
    }
  }
  addWeatherDamage(data) {
    let self = this;
    if (
      !self.shoots_data[self.shoots_complete].isStage &&
      self.game.thor.active &&
      !data.isthor
    ) {
      data.config = {
        pala_bunge: [25, 25],
        explode: Types.EXPLODE.ADUKA1_THOR,
      };
      data.config.stime = 200 + data.stime + data.time * 2;
      data.config.iD = 0;
      self["addthor"](data);
    }
    if (self.game.weather.current == 4) self._addWeatherLightning(data);
    //console.log("[add Weather]",{current:self.game.weather.current});
  }
  addthor(data) {
    var self = this;
    // O raio de MOBILE escala com o nivel do Thor, como no jogo original, mas
    // numa escala MUITO menor que a do raio do clima. Antes o S2 fixava 80
    // (damage na config, sem progressao) e o SS usava modifiers, que SOMAM ao
    // thor.damage/2: com o Thor em 2917 isso virou 1658 num unico golpe.
    // Agora ambos vem de RAY_DAMAGE_BY_THOR, interpolado pelo nivel.
    var cfg = data.config || {};
    var isSS = !!(cfg.modifiers && cfg.modifiers.damage != null);
    var isMobileRay = cfg.damage != null || isSS;
    var mobileRayDamage = isMobileRay
      ? rayDamageByThor(
          isSS ? RAY_DAMAGE_BY_THOR.ss : RAY_DAMAGE_BY_THOR.s2,
          self.game.thor.damage
        )
      : null;
    self.game.thor.angle =
      (-Math.atan2(data.a.y - self.game.thor.y, data.a.x - self.game.thor.x) *
        180) /
      Math.PI;
    if (self.game.thor.angle < 0) self.game.thor.angle += 360;
    let shootConfig = {
      x0: self.game.thor.x,
      y0: self.game.thor.y,
      ang: self.game.thor.angle,
      power: 999,
      type: data.type,
      stime: data.config.stime,
      account: data.account,
      shootId: data.shootId,
      thorId: data.config.iD,
      isthor: true,
      damage: isMobileRay ? mobileRayDamage : self.game.thor.damage / 2,
    };
    // Sem isto o merge devolveria o damage fixo (S2) ou somaria o modifier (SS)
    // por cima do valor que acabamos de calcular. Copia rasa: data.config e' o
    // objeto compartilhado do gametypes e nao pode ser mutado.
    var mergedCfg = data.config;
    if (isMobileRay) {
      mergedCfg = { ...data.config };
      delete mergedCfg.damage;
      if (mergedCfg.modifiers) {
        mergedCfg.modifiers = { ...mergedCfg.modifiers };
        delete mergedCfg.modifiers.damage;
      }
    }
    self.shoots[self.shoots_count] = new Shoot({
      ...shootConfig,
      ...mergedCfg,
    });
    self.shoots_data[self.shoots_complete].isStage = true;
    self.shoots_count++;
    self.shootPushData();
  }

  addion(data) {
    let self = this;
    let x = self.game.ion.x + data.account.player.x;
    let y = self.game.ion.y0 + data.account.player.y;
    let a = { x: data.a.x, y: data.a.y };
    switch (data.type) {
      case 1:
        y = self.game.ion.y1 + data.account.player.y;
        a.x += data.config.addToObX
          ? data.config.addToObX[data.ang > 90 && data.ang < 270 ? 0 : 1]
          : 0;
        break;
      case 2:
        x = data.config.addToX ? data.a.x + data.config.addToX : data.a.x;
        y = data.config.addToY
          ? self.game.ion.y1 + data.account.player.y + data.config.addToY
          : self.game.ion.y1 + data.account.player.y;
        break;
    }
    self.game.ion.angle = (-Math.atan2(a.y - y, a.x - x) * 180) / Math.PI;
    //console.log({is:"addIon",origin:{x:x,y:y},objetive:{x:a.x,y:a.y}});
    if (self.game.ion.angle < 0) self.game.ion.angle += 360;
    let shootConfig = {
      x0: x,
      y0: y,
      ang: self.game.ion.angle,
      power: 999,
      type: data.type,
      stime: data.config.stime,
      account: data.account,
      shootId: data.shootId,
      ionId: data.config.iD,
    };
    self.shoots[self.shoots_count] = new Shoot({
      ...shootConfig,
      ...data.config,
    });
    //	console.log({soy:"addBulet",data:{...shootConfig,...data.config}});
    self.shoots_data[self.shoots_complete].isStage = true;
    self.shoots_count++;
    self.shootPushData();
  }

  addlightning(data) {
    var self = this;
    var x = data.config.addx0 ? data.a.x + data.config.addx0 : data.a.x;
    var y = -1000;
    self.game.Lightning.angle =
      (-Math.atan2(data.a.y - y, data.a.x - x) * 180) / Math.PI;
    if (self.game.Lightning.angle < 0) self.game.Lightning.angle += 360;
    let shootConfig = {
      x0: x,
      y0: y,
      ang: self.game.Lightning.angle,
      power: 9999,
      type: data.type,
      stime: data.config.stime,
      account: data.account,
      shootId: data.shootId,
      lightningId: data.config.iD,
      isLightning: 1,
    };
    self.shoots[self.shoots_count] = new Shoot({
      ...shootConfig,
      ...data.config,
    });
    //	console.log({soy:"ligt",data:{...shootConfig,...data.config}});
    self.shoots_data[self.shoots_complete].isStage = true;
    self.shoots_count++;
    self.shootPushData();
  }

  adddigger(data) {
    let self = this;
    data.a = data.getPosAtTime(data.time + 5);
    let shootConfig = {
      x0: data.a.x,
      y0: data.a.y,
      ang: -data.GetAngleAtTime(data.time),
      type: data.type,
      stime: data.config.stime,
      account: data.account,
      shootId: data.shootId,
      is: "digger",
    };
    shootConfig = { ...shootConfig, ...data.config };
    if ((shootConfig.power = "parent")) shootConfig.power = data.power;
    self.shoots[self.shoots_count] = new Shoot(shootConfig);
    self.shoots_count++;
    self.shootPushData();
    shootConfig.account = "";

    self.shoots_data[self.shoots_complete].isStage = true;
    //		console.log({soy:" digger",data:{...shootConfig,...data.config}});
  }

  addbulets(data) {
    let self = this;
    let pos;
    switch (data.config.position) {
      case "parent":
        pos = data.a;
        break;
      case "time":
        pos = data.getPosAtTime(data.config.stime / 2);
        break;
      default:
        pos = data.config.position;
        break;
    }
    //	const ftime = (data.time+data.stime)-data.config.stime> 200?(data.time+data.stime)-data.config.stime:200;
    const fang = data.GetAngleAtTime(data.config.stime / 2);
    const power = data.power;
    data.config.objetive = data.objetive ? data.objetive : data.a;
    //	console.log({ftime:ftime,fang:fang,power:power});
    //	data.config.finalTime = data.config.stime? data.config.stime : ((data.config.id+1)*data.config.time*100) + data.stime + data.time*2;
    //	let shootConfig = {x0:pos.x, y0:pos.y, ang:fang, power:power, type:data.type, account:data.account, shootId:data.shootId,isUnderGround:true,is:"addBulet"};
    let shootConfig = {
      x0: pos.x,
      y0: pos.y,
      x1: data.config.objetive.x,
      y1: data.config.objetive.y,
      power: power,
      ang: fang,
      stime: data.config.stime,
      type: data.type,
      account: data.account,
      shootId: data.shootId,
      is: "addBulet",
    };

    shootConfig = { ...shootConfig, ...data.config };
    if (Array.isArray(shootConfig.ang)) {
      shootConfig.ang =
        shootConfig.ang[data.ang > 90 && data.ang < 270 ? 0 : 1];
    }
    if (
      Array.isArray(shootConfig.orbit) &&
      Array.isArray(shootConfig.orbit[1])
    ) {
      shootConfig.orbit = [
        shootConfig.addOrbit[0],
        shootConfig.addOrbit[1][data.ang > 90 && data.ang < 270 ? 0 : 1],
        shootConfig.addOrbit[2],
        shootConfig.addOrbit[3],
      ];
    }
    if (data.config.power == "parent") {
      //	shootConfig.v = {x:data.v.x,y:0};
      shootConfig.ang -=
        shootConfig.addAng[data.ang > 90 && data.ang < 270 ? 0 : 1];
      shootConfig.power =
        data.v.x / Math.cos((shootConfig.ang * Math.PI) / 180);
      //	console.log({is:"shoot",ang:shootConfig.ang});
      //	shootConfig.power = Math.sqrt((data.v.x*data.v.x + 0),2)
    }

    self.shoots[self.shoots_count] = new Shoot(shootConfig);
    /*	console.log("===============================================================================");
		console.log({is:"addbulets",data:shootConfig})
		console.log("===============================================================================");*/

    self.shoots_data[self.shoots_complete].isStage = true;
    self.shoots_count++;
    self.shootPushData();
  }

  addchange(shoot) {
    let self = this;
    if (shoot.config) {
      self.shoots_data[self.shoots_complete].change = {
        at: shoot.config.stime || null,
        exp: shoot.config.explode || null,
        img: shoot.config.image || null,
      };
      //		console.log({is:"change",time:shoot.time,print:self.shoots_data[self.shoots_complete].change,data:shoot.config});
    }
  }

  addset(shoot) {
    let self = this;
    if (shoot.time > shoot.config.stime) {
      for (let key in shoot.config) {
        self.shoots_data[self.shoots_complete][key] = shoot.config[key];
      }
    }
  }

  addwalker() {
    let self = this;
    //	self.shoots_data[self.shoots_complete].walker = 1;
    self.shoots_data[self.shoots_complete].path = [600, 800, 0, 1000, -1000, 0];
  }

  addmine() {
    let self = this;
    let shootConfig = {
      x0: data.a.x,
      y0: data.a.y,
      x1: data.a.x,
      y1: data.a.y,
      ang: 180,
      type: data.type,
      account: data.account,
      shootId: data.shootId,
      isUnderGround: true,
      is: "addmine",
    };

    self.shoots[self.shoots_count] = new Shoot({
      ...shootConfig,
      ...data.config,
    });
    self.shoots_count++;
    self.shootPushData();
    //	console.log({soy:"addBulet",data:{...shootConfig,...data.config}});
  }

  shootPushData() {
    this.shoots_data.push({
      s: [],
      tele: [],
      exp: null,
      thor: null,
      img: null,
      time: null,
      change: null,
      hole: [],
      damages: [],
      wave: [],
      orbit: [],
      jumps: [],
      is_lightning: [],
      no_rotate: null,
      camera: null,
      show: null,
      ss: null,
    });
  }

  recetBonos() {
    this.bonos = {
      kills: [],
      totaldamage: 0,
    };
  }
};
