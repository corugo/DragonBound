//Player fall and die
var Types = require("./gametypes");
var GBPhysics = require("./lib/gbPhysics");
// Raio de detonacao da mina do Raon: campo 9 do bloco do S2 no
// characterdata (8 px), lido pela ORayonMine [2] 0x495850. Na pratica so
// detona quem passa por cima. Os 90 px do cliente (RAON_MINE_WALK_DIST) sao so
// a distancia em que ela "acorda" na animacao.
const MINE_RADIUS = 8;
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
    // Minas do Raon S2 (ORayonMine): ficam no mapa entre os turnos.
    this.mines = [];
    this.mineSeq = 0;
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
    // turno atual, para o choque do relampago pegar cada jogador 1x por turno
    this.turnoChoque = (this.turnoChoque || 0) + 1;
    for (var id in this.shoots) {
      this.shootPushData();
    }
    // Quem andou para perto de uma mina durante o turno a detona agora.
    this.checkMines(0);
  }

  // ORayonMine [2] 0x495850: a cada tick a mina mede a distancia ate cada
  // jogador vivo; dentro do raio de ativacao chama [8] 0x494d70 ("rayon
  // bombing"), que explode NO LUGAR com o Draw Impact do tiro. Fora isso ela
  // dorme. Aqui a checagem roda quando a mina nasce, no inicio de cada tiro e
  // depois que os tiros terminam (jogadores empurrados/caidos).
  checkMines(stime) {
    const self = this;
    let explodiu = 0;
    for (const mine of self.mines) {
      if (mine.done) continue;
      let perto = !!mine.triggered; // atropelada durante uma caminhada
      self.game.room.forPlayers(function (acc) {
        const p = acc && acc.player;
        if (perto || !p || p.is_alive !== 1) return;
        const dx = p.x - mine.x, dy = p.y - mine.y;
        if (dx * dx + dy * dy <= MINE_RADIUS * MINE_RADIUS) perto = true;
      });
      if (perto) {
        self.explodeMine(mine, stime);
        explodiu++;
      }
    }
    if (explodiu) self.mines = self.mines.filter((m) => !m.done);
    return explodiu;
  }

  // --- Kalsiddon (OCarriorBullet / OBigFoot2PSSBullet) ----------------------
  // Se o tiro saiu para cima (vel.y < 1), no apice (vel.y > 0) ele se divide:
  // S1 2 teleguiados a +-60, S2 4 a +-40/+-80, SS 4 carregadores a +-30/+-90.
  // Depois disso o pai segue voando, mas ao colidir some sem explodir.
  kalsDivide(shoot) {
    const gf = shoot.gbFlight;
    if (shoot.kalsFeito) return;
    if (gf.vel0.y >= 1) { shoot.kalsFeito = true; return; } // saiu para baixo: tiro comum
    const tickApice = gf.apiceMs() / 48; // ticks do original
    if (tickApice <= 0) return;
    if (shoot.time < tickApice * 24) return;
    shoot.kalsFeito = true;
    const p = gf.ensure(tickApice);
    const d = GBPhysics.atanTab(Math.trunc(p.vx / 100), Math.trunc(p.vy / 100));
    const div = gf.kals;
    const mob = GBPhysics.MOBILES.Kalsiddon;
    const cratera = (mob.cratera || [])[shoot.type] || [35, 35];
    const IMG = Types.BULLETS;
    const filhos = [];
    if (div.ss) {
      for (const a of [30, -30, 90, -90])
        // carregador: antes de separar (tick 30) explode ao bater, como um tiro
        // comum (0x4770d0 so some sem explodir com +0x344 = 1)
        filhos.push({ ang: d + a, vel: 1536, curva: 80, carregador: true, image: IMG.KALSIDDONSS_MED, damage: GBPhysics.danoOriginal("Kalsiddon", 2) || 110 });
    } else {
      const img = shoot.type === 1 ? IMG.KALSIDDON2_TINY : IMG.KALSIDDON1_TINY;
      const dano = GBPhysics.danoOriginal("Kalsiddon", shoot.type) || (shoot.type === 1 ? 110 : 120);
      for (let i = 1; i <= div.pares; i++)
        for (const sg of [1, -1])
          filhos.push({ ang: d + sg * div.abertura * i, vel: div.vel, curva: div.curva, image: img, damage: dano });
    }
    // 0x4365e0: divisor do raio do filho = divisor do pai x numero de filhos
    for (const f of filhos) f.n = filhos.length;
    for (const f of filhos)
      this.kalsFilho(shoot, { x: p.x, y: p.y }, f, cratera, shoot.stime + tickApice * 24 * 2, tickApice * 24);
    // o pai continua so como alvo: nao fere, nao cava, nao explode
    shoot.damage = null;
    shoot.pala_bunge = [0, 0];
    shoot.explode = null;
    shoot.canPlayerCollide = false;
    shoot.kalsSome = true;
  }
  // offset: tempo do pai (ticks do servidor) em que o filho nasce; o alvo do
  // tick t do filho e' a posicao do pai em offset + t*24 (rastro do pai).
  kalsFilho(pai, pos, f, cratera, stime, offset) {
    const self = this;
    const sh = new Shoot({
      x0: Math.floor(pos.x / 256),
      y0: Math.floor(pos.y / 256),
      ang: 0,
      power: 0,
      type: pai.type,
      stime: stime,
      account: pai.account,
      shootId: pai.shootId,
      is: "homing",
      homing: { x: pos.x, y: pos.y, ang: f.ang, vel: f.vel, curva: f.curva, carregador: !!f.carregador },
      damage: f.damage,
      pala_bunge: [cratera[0], cratera[1]],
      image: f.image,
      explode: Types.EXPLODE.KALSIDDON,
      canPlayerCollide: true,
      no_sound: true,
      cratera: cratera,
      espelhos: pai.espelhos || null,
      tornados: pai.tornados || null,
    });
    // Divisor do raio do Thor (+0x328) herdado: pai x filhos (0x4365e0).
    const _divPai =
      pai.thorDiv != null
        ? pai.thorDiv
        : GBPhysics.thorDivDe("Kalsiddon", pai.type === 0 ? 0 : pai.type === 2 ? 2 : 1);
    sh.thorDiv = _divPai * (f.n || 1);
    sh.homingParent = pai;
    sh.homingOffset = offset || 0;
    sh.homingCarrier = !!f.carregador;
    self.shoots[self.shoots_count] = sh;
    self.shoots_count++;
    self.shootPushData();
  }
  // Teleguiado por tick: o carregador do SS solta 1 par de netos a +-30 do
  // proprio rumo no tick 30 (0x478150) e continua so como alvo; quem alcanca o
  // pai "morre" ali (explode, ou some se for carregador).
  kalsHoming(shoot) {
    if (shoot.isComplete) return;
    const hf = shoot.homingFlight;
    if (shoot.homingCarrier && !shoot.kalsNetos && hf.s.ticks >= 30) {
      shoot.kalsNetos = true;
      // 0x478150: ao separar, o carregador marca +0x344 = 1 e vira um guia
      // (como o principal depois da divisao, mas rosa: estado "open" do
      // kalsiddonSSb). Segue como alvo dos netos e, ao bater, some sem explodir.
      shoot.kalsGuiaEm = 30 * 24;
      shoot.damage = null;
      shoot.pala_bunge = [0, 0];
      shoot.explode = null;
      shoot.canPlayerCollide = false;
      const p = hf.pts[30] || hf.pts[hf.pts.length - 1];
      const r = hf.rumo();
      for (const a of [30, -30])
        this.kalsFilho(
          shoot,
          { x: p.x, y: p.y },
          { n: 2, ang: r + a, vel: 1536, curva: 80, image: Types.BULLETS.KALSIDDONSS_TINY, damage: GBPhysics.danoOriginal("Kalsiddon", 2) || 110 },
          shoot.cratera || [35, 35],
          shoot.stime + 30 * 24 * 2,
          30 * 24
        );
    }
    if (shoot.homingEnd && shoot.time >= (hf.pts.length - 1) * 24) {
      shoot.isComplete = true;
      if (shoot.homingCarrier || shoot.homingEnd === "tempo") shoot._outOfBounds = true;
      else {
        this.addGroundHole(shoot);
        shoot.groundCollide = true;
      }
    }
  }

  // Caminhada de um jogador (game_move): marca as minas que ficaram no trecho
  // percorrido. Elas detonam no proximo tiro (checkMines).
  trackMove(x0, y0, x1, y1) {
    for (const mine of this.mines) {
      if (mine.done || mine.triggered) continue;
      const lo = Math.min(x0, x1) - MINE_RADIUS, hi = Math.max(x0, x1) + MINE_RADIUS;
      if (mine.x >= lo && mine.x <= hi && Math.abs(mine.y - y1) <= 25) mine.triggered = true;
    }
  }

  // A explosao e' um andador de 0 px: nasce no lugar da mina e explode no
  // primeiro tick, reaproveitando cratera, dano e o path para o cliente.
  explodeMine(mine, stime) {
    const self = this;
    mine.done = true;
    const shootConfig = {
      x0: mine.x,
      y0: mine.y,
      ang: 0,
      power: 0,
      type: mine.type,
      stime: stime || 0,
      account: mine.account,
      shootId: 0,
      is: "mine",
      walk: true,
      map: self.map,
      dir: "RIGHT",
      walk_max: 0,
      damage: mine.damage,
      pala_bunge: mine.pala_bunge,
      image: mine.image,
      explode: mine.explode,
      no_sound: true,
      mineId: mine.id,
    };
    self.shoots[self.shoots_count] = new Shoot(shootConfig);
    self.shoots[self.shoots_count].falseAngle = false;
    self.shoots_count++;
    self.shootPushData();
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
          if (shoot.isthor && !shoot._ff && !shoot.thorAt) {
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
          // Raio do Thor do original: explode no ponto do impacto, na hora.
          if (shoot.thorAt) {
            if (!shoot._thorAplicado) {
              shoot._thorAplicado = true;
              shoot.a = { x: shoot.thorAt.x, y: shoot.thorAt.y };
              shoot.forceHit = true;
            }
            shoot.time++;
          } else shoot.update();
          // ForceController.cast(shoot, self.game.weather.client.active);
          ////console.log(self.shoots[id]);
          //var ang = shoot.GetAngleAtTime();

          /* |<-========================= [Stats Avatars] ===========================->| */
          var scratch_my_ava = shoot.account.player.avaScratch;
          if (shoot.account.player.check_my_ava === 0) scratch_my_ava = 0;
          //Logger.log('Scratch: ' + scratch_my_ava);
          /* |<-========================= [Stats Avatars] ===========================->| */
          shoot.move(shoot.a.x, shoot.a.y, 0);
          // Projetil sem cratera (pala_bunge 0/ausente: Frog, Raon S2/SS, que
          // so cavam quando o andador explode) nao ganha o bonus de "scratch"
          // do avatar: antes abria um buraquinho de 4 px ao tocar o mapa.
          const _pb = shoot.pala_bunge || [];
          const _cava = _pb[0] > 0 && _pb[1] > 0;
          shoot.bunge_jc = _cava
            ? [
                parseInt(Math.round(parseInt(scratch_my_ava / 5) + _pb[0])),
                parseInt(Math.round(parseInt(scratch_my_ava / 5) + _pb[1])),
              ]
            : [0, 0];
          if (shoot.walking) this.checkWalker(shoot);
          if (shoot.gbFlight && shoot.gbFlight.kals) this.kalsDivide(shoot);
          if (shoot.homingFlight) this.kalsHoming(shoot);
          this.checkCollision(shoot);
          this.checkWeatersCast(shoot);

          if (!shoot.damageComplete) {
            self.game.room.forPlayers(function (account) {
              let player = account.player;
              // //console.log({id:player.user_id,position:player.position,alive:player.is_alive});
              account.update();
              // console.log(self.game.weather.client.active);
              // Como no .gme, quem zera o HP no meio do turno continua tomando
              // os acertos (0x464ab0 so ignora a flag +0x4d8, que o cliente liga
              // apenas na queda para fora do mapa; a morte por HP vem depois do
              // turno). O HP segue negativo aqui e o cliente mostra o dano de
              // cada acerto pela diferenca do HP real (Player2.ChangeHPShield).
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
                // Corpo do original (0x4647a0): retangulo W x H acima dos pes,
                // deslocado pela inclinacao; o projetil e' um ponto.
                const _mobAlvo = Types.MOBILES[player.mobile];
                const corpo = GBPhysics.corpoDe(_mobAlvo && _mobAlvo.name);
                let x11 = GBPhysics.acertaCorpo(shoot.a.x, shoot.a.y, player, corpo) ? 0 : 1;
                let distf = {
                  x: Math.sqrt(Math.pow(player.x - shoot.a.x, 2) + 0),
                  y: Math.sqrt(0 + Math.pow(player.y - shoot.a.y, 2)),
                  t: Math.sqrt(
                    Math.pow(player.x - shoot.a.x, 2) +
                      Math.pow(player.y - shoot.a.y, 2)
                  ),
                };
                let dm = shoot.damage;
                // False angle do atirador: dano base reduzido (a mina do Raon
                // explode em outro turno e marca falseAngle = false).
                const anguloFalso =
                  shoot.falseAngle !== undefined
                    ? shoot.falseAngle
                    : !!(shoot.account && shoot.account.player && shoot.account.player._falseAngle);
                if (anguloFalso && typeof dm === "number") dm *= GBPhysics.FALSE_ANGLE_DAMAGE;
                let heal = shoot.heal;
                let shdm = 0;

                if (shoot.canCollide && x11 === 0) fullcollide = true;

                // Varredura do SS da Aduka (OAdukaPSSBullet, 0x4515e0): a cada
                // tick o projetil testa os 8 jogadores com 0x42a780 - distancia
                // de (x, y - 10) do jogador ao projetil < A / div, com A = 160 e
                // div = 4 nos 10 primeiros ticks do original (40 px), 3 depois
                // (~53 px). So inimigo vivo; um raio por passagem: a marca do
                // jogador (0x57c) so e' limpa quando ele sai do raio, e o raio
                // cai NO jogador, nao no projetil.
                const _varre = shoot.addAtCollide && !shoot.canPlayerCollide && !shoot.isthor;
                if (_varre) {
                  const _raio = shoot.time < 10 * 24 ? 160 / 4 : 160 / 3;
                  const _dentro =
                    Math.hypot(player.x - shoot.a.x, player.y - 10 - shoot.a.y) < _raio;
                  if (!shoot._hitPlayers) shoot._hitPlayers = {};
                  if (!_dentro) shoot._hitPlayers[player.user_id] = false;
                  else if (
                    !shoot._hitPlayers[player.user_id] &&
                    player.team !== shoot.account.player.team
                  ) {
                    shoot._hitPlayers[player.user_id] = true;
                    self.addAtCollide(Object.assign(Object.create(Object.getPrototypeOf(shoot)), shoot, { a: { x: player.x, y: player.y }, thorDiv: 0 }));
                  }
                }

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
                  } else if (typeof dm === "number") {
                    // Dano do original (0x464ab0): elipse da cratera + 10 px,
                    // queda linear ate o centro do corpo, bonus de ate 20% no
                    // meio do corpo e defesa do mobile atingido. Vale tambem
                    // para o acerto direto (a explosao e' no ponto do acerto).
                    // ATENCAO: o bonus de ataque (Shoot: +avaAttack/2) e a
                    // guarda (Player.disHpShield: -avaGuard/2) sao do
                    // DragonBound; os multiplicadores de ataque do .gme
                    // (tiro+0xd0, +0xc0, +0xc8) nao foram identificados.
                    // Detalhes em GBPhysics.danoExplosao.
                    const _cr =
                      shoot.bunge_jc && shoot.bunge_jc[1] > 0 ? shoot.bunge_jc : [10, 10];
                    const _tb =
                      shoot.tiroBits != null
                        ? shoot.tiroBits
                        : GBPhysics.tipoTiroDe(GBPhysics.nomeOriginalDe(shoot, Types), shoot.type);
                    const _v = GBPhysics.danoExplosao(dm, shoot.a.x, shoot.a.y, _cr, player, corpo, _tb);
                    if (_v > 0) {
                      dm = _v;
                      areacollide = true;
                    } else if (fullcollide) dm = 0;
                  }
                  if (fullcollide || areacollide) {
                    /** @Begin add Shoots */
                    if (!shoot.canPlayerCollide && !_varre) {
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
                const td = this.teleDestino(shoot);
                // [jogador, chegada x, y, final x, y]: o cliente poe o mobile na
                // chegada e anda/cai ate o final; o servidor fica com o final.
                this.shoots_data[this.shoots_complete].tele.push(
                  shoot.account.player.game_position,
                  td.x, td.y, td.x, td.yFim
                );
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
            // Fisica do GunBound original: o cliente so sabe desenhar parabola
            // (x0,y0,ang,power,ax,ay). Manda a trajetoria pronta, que ele le via
            // CShot.GetPosAtPath; orbita e onda do DragonBound ficam de fora
            // (o desvio do original ja esta no path, e e' ele que colide).
            if (shoot.mineId) {
              // a mina sai do mapa no cliente quando explode
              (this.shoots_data[this.shoots_complete].mines_remove =
                this.shoots_data[this.shoots_complete].mines_remove || []).push(shoot.mineId);
            }
            if (shoot.walking && shoot.walkPath) {
              const wp = shoot.walkPath.slice();
              wp.push(shoot.a.x, shoot.a.y, shoot.walkCode());
              this.shoots_data[this.shoots_complete].path = wp;
            } else if (shoot.homingFlight) {
              this.shoots_data[this.shoots_complete].path = shoot.homingPath(shoot.time);
              this.shoots_data[this.shoots_complete].behind_at =
                GBPhysics.intervalosAtras(shoot.homingFlight.pts, shoot.time / 24);
              if (shoot.kalsGuiaEm)
                this.shoots_data[this.shoots_complete].change = {
                  at: shoot.kalsGuiaEm * 2,
                  img: Types.BULLETS.KALSIDDONSS_MED_OPEN,
                  exp: null,
                };
              this.shoots_data[this.shoots_complete].no_camera = true;
            } else if (shoot.gbFlight) {
              this.shoots_data[this.shoots_complete].path =
                shoot.gbFlight.clientPath(shoot.time);
              this.shoots_data[this.shoots_complete].behind_at =
                GBPhysics.intervalosAtras(shoot.gbFlight.pts, shoot.time / 24);
              this.shoots_data[this.shoots_complete].orbit = undefined;
              this.shoots_data[this.shoots_complete].wave = undefined;
              // Projeteis que oscilam em volta do voo (laser do Raon, orbita do
              // Trico, onda da Turtle) nao levam a camera: ela tremia seguindo
              // a oscilacao. O cliente pula estes ao escolher quem seguir.
              if (["laser", "orbita", "onda"].includes(shoot.gbFlight.mov))
                this.shoots_data[this.shoots_complete].no_camera = true;
            }

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
      // Antes de fechar o turno: alguem foi parar perto de uma mina?
      if (
        this.shoots_count <= this.shoots_complete &&
        this.mines.length &&
        this.checkMines(this.shootTicks * 2)
      ) {
        setImmediate(function () {
          self.update();
        });
        return;
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
      (shoot.forceHit && !shoot.groundCollide) ||
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
    // Fisica do original e teleguiados tratam o tornado dentro da trajetoria.
    if (shoot.gbFlight || shoot.homingFlight) return;
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
    // Fisica do original e teleguiados refletem dentro da propria trajetoria.
    if (shoot.gbFlight || shoot.homingFlight) return;
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

  // Chegada do teleporte (.gme 0x47b390): procura o primeiro pixel de terreno
  // na coluna do impacto a partir de 15 px acima dele (0x4479d0; 0x5cf170 =
  // 15). Se for o proprio ponto do impacto (ha 15 px livres em cima), o mobile
  // chega ali, em pe. Senao (bateu de lado numa parede, no teto ou entrou num
  // vao apertado) ele volta 1 px no x, para o lado de onde o tiro veio, e
  // entra em "drop": cai dali ate o chao.
  teleDestino(shoot) {
    const m = this.map;
    const x = Math.round(shoot.a.x), y = Math.round(shoot.a.y);
    let yt = Math.max(0, y - 15);
    while (yt < m.h && !m.IsPixel(x, yt)) yt++;
    if (yt === y) return { x, y, yFim: y };
    const ant = shoot.getPosAtTime(Math.max(0, shoot.time - 24));
    const dir = shoot.a.x > ant.x ? 1 : shoot.a.x < ant.x ? -1 : 0;
    const x2 = x - dir;
    let yFim = y;
    while (yFim < m.h && !m.IsPixel(x2, yFim)) yFim++;
    return { x: x2, y, yFim };
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
    // Guarda os pixels que esta cratera apagou: o raio do Thor gerado por este
    // projetil e' tracado no terreno de antes dela (ver addthor).
    self.map._logCava = [];
    self.map.AddGroundHole(
      shoot.a.x,
      shoot.a.y,
      shoot.bunge_jc[0],
      shoot.bunge_jc[1]
    );
    shoot._cavou = (shoot._cavou || []).concat(self.map._logCava);
    self.map._logCava = null;
  }
  // Roda fn com os pixels de `cavou` ([indice, alfa antigo]...) restaurados e
  // apaga de novo em seguida.
  comTerrenoAntes(cavou, fn) {
    const d = this.map.data;
    if (!cavou || !cavou.length) return fn();
    for (let i = 0; i < cavou.length; i += 2) d[cavou[i]] = cavou[i + 1];
    try {
      return fn();
    } finally {
      for (let i = 0; i < cavou.length; i += 2) d[cavou[i]] = 0;
    }
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
      // no .gme o raio sai no mesmo tick do impacto (0x441600 e' chamado
      // pela colisao do proprio projetil), sem os 200 ms de antes
      data.config.stime = data.stime + data.time * 2;
      data.config.iD = 0;
      self["addthor"](data);
    }
    if (self.game.weather.current == 4) self._addWeatherLightning(data);
    //console.log("[add Weather]",{current:self.game.weather.current});
  }
  // Traçado do raio do Thor (.gme 0x448780, chamado por 0x441600 com passo 2,
  // terreno e jogadores ligados): parte da posicao do Thor, anda de 2 em 2 px
  // pelo eixo maior da reta ate o alvo e SEGUE alem dele; para no primeiro
  // pixel de terreno ou corpo de jogador (0x458380 = retangulo do corpo).
  // Fora do mapa (x < 0, x > largura, y < -500, y > altura) => null.
  tracaRaioThor(alvoX, alvoY) {
    const self = this;
    const x0 = Math.round(self.game.thor.x), y0 = Math.round(self.game.thor.y);
    const dx = Math.round(alvoX) - x0, dy = Math.round(alvoY) - y0;
    const passos = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
    const corpos = [];
    self.game.room.forPlayers(function (account) {
      const p = account.player;
      if (!p || p.is_alive !== 1) return;
      const mob = Types.MOBILES[p.mobile];
      corpos.push([p, GBPhysics.corpoDe(mob && mob.name)]);
    });
    const W = self.map.w, H = self.map.h;
    for (let k = 2; ; k += 2) {
      const x = Math.trunc(x0 + (dx * k) / passos), y = Math.trunc(y0 + (dy * k) / passos);
      if (x < 0 || x > W || y < -500 || y > H) return null;
      if (y >= 0 && self.map.IsPixel(x, y)) return { x, y };
      for (const [p, c] of corpos) if (GBPhysics.acertaCorpo(x, y, p, c)) return { x, y };
    }
  }

  addthor(data) {
    var self = this;
    // O raio de MOBILE escala com o nivel do Thor, como no jogo original, mas
    // numa escala MUITO menor que a do raio do clima. Antes o S2 fixava 80
    // (damage na config, sem progressao) e o SS usava modifiers, que SOMAM ao
    // thor.damage/2: com o Thor em 2917 isso virou 1658 num unico golpe.
    // Agora ambos vem de RAY_DAMAGE_BY_THOR, interpolado pelo nivel.
    // Dano do .gme: todo raio (clima, Aduka S2/SS) tira o valor do nivel do
    // Thor (100/120/140/160/180/200), com o nivel pelos limiares do original.
    // 0x436180: o dano passa pelo divisor do projetil que gerou o raio (campo
    // +0x328): 0 => x2, senao / divisor (GBPhysics.thorDivDe).
    var _div =
      data.thorDiv != null
        ? data.thorDiv
        : GBPhysics.thorDivDe(
            GBPhysics.nomeOriginalDe(data, Types),
            data.type === 0 ? 0 : data.type === 2 ? 2 : 1
          );
    var rayDamage = GBPhysics.thorDanoRaio(self.game.thor.damage, _div);
    // 0x441600 traca o raio NA HORA do impacto, antes de a explosao do proprio
    // projetil cavar (as explosoes so cavam no update delas). Aqui a cratera do
    // projetil ja foi aberta, entao o tracado desfaz temporariamente os pixels
    // que ela apagou (data._cavou, gravado em addGroundHole).
    var acerto = self.comTerrenoAntes(data._cavou, function () {
      return self.tracaRaioThor(data.a.x, data.a.y);
    });
    // Reta saiu do mapa sem tocar em nada: o original nao cria a explosao.
    if (!acerto) return;
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
      damage: rayDamage,
    };
    // Sem isto o merge devolveria o damage fixo (S2) ou somaria o modifier (SS)
    // por cima do valor que acabamos de calcular. Copia rasa: data.config e' o
    // objeto compartilhado do gametypes e nao pode ser mutado.
    var mergedCfg = { ...data.config };
    delete mergedCfg.damage;
    if (mergedCfg.modifiers) {
      mergedCfg.modifiers = { ...mergedCfg.modifiers };
      delete mergedCfg.modifiers.damage;
    }
    self.shoots[self.shoots_count] = new Shoot({
      ...shootConfig,
      ...mergedCfg,
      // No original (0x441600) o raio do Thor cria o objeto de explosao
      // (0x436180 -> classe 0x57623c, cujo [2] chama o Draw Impact) com
      // A = 46 em todos os niveis do Thor (tabela 0x5cf25c) e B = 150:
      // elipse de raio y 23 e raio x 23*150/100 = 34.
      pala_bunge: [34, 23],
    });
    // 0x441600: a explosao do raio e' criada na hora (sem voo do raio), do
    // tipo Laser, no primeiro obstaculo da reta Thor -> alvo (0x448780).
    self.shoots[self.shoots_count].thorAt = acerto;
    self.shoots[self.shoots_count].tiroBits = 4;
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

  // Choque do relampago do clima (.gme 0x442a10 + ProcessLightningShock
  // 0x443320). Na colisao do projetil numa coluna do clima, quem estiver a
  // menos de 25 px do topo do terreno naquele x leva o choque; ele passa em
  // cadeia para quem estiver a menos de 25 px de um chocado. Cada um toma
  // 20 / divisor do projetil (+0x328) + 20 (0x5cf178 = 20) uma vez por turno,
  // contado como dano no placar.
  choqueRelampago(data) {
    const self = this;
    const x = Math.round(data.a.x);
    let yc = 0;
    while (yc < self.map.h && !self.map.IsPixel(x, yc)) yc++;
    const div =
      data.thorDiv != null
        ? data.thorDiv
        : GBPhysics.thorDivDe(
            GBPhysics.nomeOriginalDe(data, Types),
            data.type === 0 ? 0 : data.type === 2 ? 2 : 1
          );
    const dano = Math.trunc(20 / (div > 0 ? div : 1)) + 20;
    const vivos = [];
    self.game.room.forPlayers(function (account) {
      const p = account.player;
      if (p && p.is_alive === 1) vivos.push(p);
    });
    const R2 = 25 * 25;
    const chocados = [];
    const marca = (p) => {
      if (p._choque === self.turnoChoque) return;
      p._choque = self.turnoChoque;
      chocados.push(p);
    };
    for (const p of vivos)
      if ((p.x - x) * (p.x - x) + (p.y - yc) * (p.y - yc) < R2) marca(p);
    for (let i = 0; i < chocados.length; i++)
      for (const p of vivos) {
        const c = chocados[i];
        if ((p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) < R2) marca(p);
      }
    const sd = self.shoots_data[self.shoots_complete];
    for (const p of chocados) {
      p.disHpShield(dano, 0);
      if (sd) sd.damages.push({ n: p.game_position, damage: dano, hp: p.hp, shield: p.shield });
      if (p.hp <= 0 && !p.pending_death && self.bonos) {
        p.pending_death = true;
        self.bonos.kills.push([p.game_position, true, false]);
      }
    }
  }

  addlightning(data) {
    var self = this;
    if (data.is === "weatherLightning") self.choqueRelampago(data);
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
      // No original o relampago (0x484fb0 -> 0x435da0) cria o mesmo objeto
      // de explosao com os dados do bloco SS do Lightning no characterdata
      // (A = 40, B = 143): elipse de raio y 20 e raio x 20*143/100 = 28.
      // O relampago do CLIMA e' o mesmo objeto com escala 1/2 (0x45d5d0 e
      // 0x484fb0 chamam 0x435da0(.., 2) quando o impacto cai numa coluna do
      // clima, objetos 0x1f6 testados em 0x458680): raio 14 x 10.
      pala_bunge: data.is === "weatherLightning" ? [14, 10] : [28, 20],
      // Dano do relampago no original: bloco SS do Lightning (0x435da0 usa
      // sempre ele); o do clima e' a metade (escala 2).
      ...(data.is === "weatherLightning"
        ? {}
        : GBPhysics.nomeOriginalDe(data, Types) === "Lightning"
        ? { damage: GBPhysics.danoOriginal("Lightning", 2) }
        : {}),
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
    // Broca do Nak S2: o dano do tiro no original fica com ela.
    {
      const nome = GBPhysics.nomeOriginalDe(data, Types);
      const v = nome && GBPhysics.danoOriginal(nome, data.type);
      if (v && typeof shootConfig.damage === "number") shootConfig.damage = v;
    }
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

  // Andadores (addAtEnd "walk"): Raon S2 (mina), Raon SS (robo) e Frog. Nascem
  // no ponto de impacto, assentados no chao, e andam ate encostar num inimigo,
  // completar walk_max px ou travar; ai explodem como um tiro que bateu no chao.
  addwalk(data) {
    // Cratera do andador: a do tiro no original (o andador e' a continuacao do
    // projetil), senao a da config do DragonBound.
    // Dano do andador: o do tiro no original (o andador e' quem fere).
    function danoAndador(d, c) {
      const nome = GBPhysics.nomeOriginalDe(d, Types);
      const v = nome && GBPhysics.danoOriginal(nome, d.type);
      return v || (c.damage != null ? c.damage : d.damage);
    }
    function craterAndador(d, c) {
      const GB = require("./lib/gbPhysics");
      // Segmentos refletidos (tornado/espelho) nao carregam o gb: cai no
      // mobile de quem atirou.
      let nome = d.gb && d.gb.nome;
      if (!nome && d.account && d.account.player) {
        const mb = Types.MOBILES[d.account.player.mobile];
        nome = mb && mb.name;
      }
      const cr = nome && GB.MOBILES[nome] && (GB.MOBILES[nome].cratera || [])[d.type];
      if (cr && cr[0] > 0 && cr[1] > 0) return [cr[0], cr[1]];
      return c.pala_bunge && c.pala_bunge.length === 2 && c.pala_bunge[0] > 0 ? c.pala_bunge : [38, 38];
    }
    const self = this;
    const cfg = data.config || {};
    const me = data.account.player;
    let x = Math.round(data.a.x), y = Math.round(data.a.y);
    // assenta no chao: sobe ate sair do terreno, depois desce ate encostar
    let g = 0;
    while (self.map.IsPixel(x, y) && g++ < 60) y--;
    g = 0;
    while (!self.map.IsPixel(x, y + 1) && y < self.map.h && g++ < 400) y++;
    let dir;
    if (cfg.dir === 1) dir = "RIGHT";
    else if (cfg.dir === -1) dir = "LEFT";
    else {
      // "auto" (ou sem direcao): vai para o inimigo vivo mais perto
      let best = null;
      self.game.room.forPlayers(function (acc) {
        const p = acc && acc.player;
        if (!p || p.is_alive !== 1 || p.team === me.team) return;
        const d = Math.abs(p.x - x);
        if (!best || d < best.d) best = { d: d, x: p.x };
      });
      dir = best ? (best.x < x ? "LEFT" : "RIGHT") : data.ang > 90 && data.ang < 270 ? "LEFT" : "RIGHT";
    }
    const EXPLODE_PADRAO = { 62: Types.EXPLODE.RAONSS, 63: Types.EXPLODE.RAON2, 65: 31, 67: 43 };
    // Mina do Raon S2 (`is_alive`): nao anda; dorme onde caiu ate alguem
    // chegar perto (ver checkMines).
    if (cfg.is_alive) {
      const mine = {
        id: ++self.mineSeq,
        x: x,
        y: y,
        dir: dir,
        type: data.type,
        account: data.account,
        damage: danoAndador(data, cfg),
        pala_bunge: craterAndador(data, cfg),
        image: cfg.image,
        explode: cfg.explode != null ? cfg.explode : EXPLODE_PADRAO[cfg.image] != null ? EXPLODE_PADRAO[cfg.image] : Types.EXPLODE.RAON2,
      };
      self.mines.push(mine);
      const slot = self.shoots_data[self.shoots_complete];
      (slot.mines_add = slot.mines_add || []).push([mine.id, x, y, dir === "LEFT" ? 0 : 1]);
      return;
    }
    const shootConfig = {
      x0: x,
      y0: y,
      ang: 0,
      power: 0,
      type: data.type,
      stime: cfg.stime,
      account: data.account,
      shootId: data.shootId,
      is: "walker",
      walk: true,
      map: self.map,
      dir: dir,
      walk_max: cfg.walk_max || 150,
      damage: danoAndador(data, cfg),
      pala_bunge: craterAndador(data, cfg),
      image: cfg.image,
      explode: cfg.explode != null ? cfg.explode : EXPLODE_PADRAO[cfg.image] != null ? EXPLODE_PADRAO[cfg.image] : Types.EXPLODE.RAON2,
      no_sound: true,
      // Frog (sprites 65 e 67): o sapo rola grudado no terreno. T1 sempre
      // anti-horario, T2 sempre horario, SS para a frente de quem atirou.
      rolar: cfg.image === 65 || cfg.image === 67,
      crawl:
        cfg.image === 65 || cfg.image === 67
          ? data.type === 0
            ? "ccw"
            : data.type === 1
            ? "cw"
            : data.ang > 90 && data.ang < 270
            ? "ccw"
            : "cw"
          : undefined,
    };
    self.shoots[self.shoots_count] = new Shoot(shootConfig);
    self.shoots_count++;
    self.shootPushData();
    self.shoots_data[self.shoots_complete].isStage = true;
  }

  // Fim do andador: caiu do mapa (some), travou, andou o maximo ou encostou
  // num inimigo (explode no lugar).
  checkWalker(shoot) {
    const self = this;
    if (shoot.isComplete) return;
    if (shoot.walkEnd === "fall") {
      shoot.isComplete = true;
      shoot._outOfBounds = true;
      return;
    }
    // Frog (OAmoeba [2] 0x453a80): nao explode ao encostar. Com alguem a
    // 24 px ela so desacelera; explode quando acaba o tempo (30 ticks).
    if (shoot.crawl) {
      let perto = false;
      self.game.room.forPlayers(function (acc) {
        const p = acc && acc.player;
        if (perto || !p || p.is_alive !== 1) return;
        const dx = p.x - shoot.a.x, dy = p.y - shoot.a.y;
        if (dx * dx + dy * dy <= 24 * 24) perto = true;
      });
      shoot.nearPlayer = perto;
      if (shoot.walkEnd === "tempo") {
        shoot.isComplete = true;
        self.addGroundHole(shoot);
        shoot.groundCollide = true;
      }
      return;
    }
    let explode = shoot.walkEnd === "stuck" || shoot.walk_dist >= shoot.walk_max;
    if (!explode) {
      const me = shoot.account.player;
      self.game.room.forPlayers(function (acc) {
        const p = acc && acc.player;
        if (explode || !p || p.is_alive !== 1 || p.team === me.team) return;
        if (Math.abs(p.x - shoot.a.x) <= 14 && Math.abs(p.y - shoot.a.y) <= 30) explode = true;
      });
    }
    if (explode) {
      shoot.isComplete = true;
      self.addGroundHole(shoot);
      shoot.groundCollide = true;
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
