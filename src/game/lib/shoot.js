var _ = require("underscore");
var cls = require("./class");
var Types = require("../gametypes");
var Logger = require("./logger");
var Message = require("./message");
var Map = require("./map");
var Box = require("./box");
var Vector = require("./vect");
var GBPhysics = require("./gbPhysics");

// Shoot
module.exports = class Shoot {
  constructor(data) {
    let self = this;
    const def = {
      is: null, //	c
      x0: 0, //	c
      y0: 0, //	c
      x1: 0, //	c
      y1: 0, //	c
      ang: 0, //	c
      power: 0, //	c
      type: 0, //	c
      friccion: 0, //	c
      ay: 0, //	c
      wind_ang: 0, //	c
      wind_power: 0, //	c
      stime: 0, //	c
      account: null, //	c
      modififiers: [], //	c
      addAtEnd: [], //	c
      addAtMaxT: [], //	c
      addOnCollider: [], //	c
      image: 0, //	c
      explode: 0, //	c
      damage: null, //	c
      heal: null, //	c
      pala_bunge: 0, //	c
      gravity: 0,
      weight: 0,
      friccion: 0,
      addThor: 0, //	d
      isthor: false, //	c
      thorDamage: 0, //	c
      thorClima: false, //	c
      thorId: 0, //	c
      addIon: 0, //	d
      isIon: false, //	d
      ionId: 0, //	d
      ionData: null, //	d
      addLightning: 0, //	d
      //		isLightning		: null,		//	d
      lightningId: 0, //	d
      bulets: [], //	d
      isDigger: false, //	d
      shooId: 0, //	c
      IsComplete: false, //	c
      chat_complete: false, //	c
      canCollide: false, //	c
      damageComplete: false, //	c
      groundCollide: false, //	c
      canMapCollide: true, //
      canPlayerCollide: true, //
      wait: 0,
      invertG: false, //	c
      dir: "RIGHT", //
      map: null, //
      walk: false,
      bonos: true,
      walk_max: 0,
      walk_dist: 0,
      killAt: 4000,
      ss: false, //	c,
      force: {
        lightning: false,
        sun: false,
        black: false,
      },
    };
    let con = data;
    data = Object.assign(def, data);
    for (const param in data) {
      self[param] = data[param];
    }
    self.current_angle = self.ang;
    // `walk` tem dois papeis no gametypes: `walk: true` marca um projetil que
    // ANDA pelo chao; um objeto/lista e' a config dos andadores que o tiro cria
    // ao cair (addAtEnd "walk": Raon S2/SS e Frog). Antes a config fazia o
    // proprio projetil tentar andar no 1o tick (map nulo) e o turno travava.
    if (this.walk === true) {
      this.walking = true;
      this.walk = [];
    } else {
      this.walking = false;
      if (this.walk && !Array.isArray(this.walk)) this.walk = [this.walk];
    }
    con.account = "";
    //console.log(con);
    if (this.ang == "auto") this.autoAngle();

    for (let key in this.modifiers) {
      self[key] = self[key]
        ? (self[key] += this.modifiers[key])
        : this.modifiers[key];
    }
    this.mobile = this.account.player.mobile;

    if (Array.isArray(this.friccion)) {
      this.friccion = this.friccion[this.ang > 90 && this.ang < 270 ? 0 : 1];
    }
    //if(Array.isArray(this.orbit[1])&&this.ang > 90 && this.ang < 270) this.orbit[1] =

    this.time = 0;
    if (!this.v) this.v = new Vector2(this.ang, this.power);

    // Mobiles do GunBound original: trajetoria integrada por tick com a fisica
    // do cliente original (lib/gbPhysics.js). So para os projeteis criados pelo
    // disparo (game.setShoots marca gb); filhos (ion, thor, raios, digger,
    // walk, divisoes) seguem com a fisica do DragonBound.
    if (this.gb && typeof this.power === "number") {
      const gb = this.gb;
      const pj = GBPhysics.projetilOriginal(gb.nome, this.type, gb.idx, gb.qtd);
      // Com a composicao do original, os desvios sao os dele (dA/dE/dF) e os
      // modifiers do DragonBound sao desfeitos; sem ela, ficam os modifiers.
      if (pj.casou && this.modifiers) {
        if (this.modifiers.x0) this.x0 -= this.modifiers.x0;
        if (this.modifiers.y0) this.y0 -= this.modifiers.y0;
      }
      const base = pj.casou ? con : this;
      this.gbFlight = new GBPhysics.GBFlight({
        nome: gb.nome,
        tipo: this.type,
        pj: pj,
        x0: this.x0,
        y0: this.y0,
        ang: base.ang,
        barra: GBPhysics.barraDaForca(base.power),
        windAng: this.wind_ang,
        windPower: this.wind_power,
        espelhos: this.espelhos || null,
        tornados: this.tornados || null,
      });
      // Formula fechada equivalente: e' o que os efeitos sem path desenham e o
      // que os projeteis filhos herdam (power "parent", tornado, espelho).
      const eq = this.gbFlight.equivalente();
      this.ang = this.gbFlight.angI;
      this.power = eq.power;
      this.friccion = eq.friccion;
      this.weight = eq.weight;
      this.v = new Vector2(this.ang, this.power);
      this.boomerSS = pj.mov === "boomer" && this.type === 2;
      // Kalsiddon: a divisao em teleguiados e' do world; os filhos antigos do
      // DragonBound (addAtMaxT "bulets") saem.
      if (this.gbFlight.kals && Array.isArray(this.addAtMaxT))
        this.addAtMaxT = this.addAtMaxT.filter((k) => k !== "bulets");
      // No .gme o principal do Kalsiddon (OCarriorBullet) so some sem explodir
      // DEPOIS de dividir; se bater antes, explode e cava como um tiro comum.
      if (this.gbFlight.kals && this.damage == null) {
        const cr = (GBPhysics.MOBILES.Kalsiddon.cratera || [])[this.type] || [39, 32];
        this.damage = this.type === 0 ? 120 : 110;
        this.pala_bunge = [cr[0], cr[1]];
        this.explode = Types.EXPLODE.KALSIDDON;
      }
      // Dano do original por projetil. Quem causa o dano por outro objeto
      // (andadores do Raon/Frog, relampagos do Lightning) nao fere direto.
      const dn = GBPhysics.danoOriginal(gb.nome, this.type);
      const fim = Array.isArray(this.addAtEnd) ? this.addAtEnd : [];
      if (fim.includes("walk") || fim.includes("lightning")) this.damage = null;
      else if (dn && (this.gbFlight.kals || typeof this.damage === "number")) this.damage = dn;
      // Cratera do original (characterdata, "Hard Impact" 0x447ae0): elipse de
      // raio y = A/2 e raio x = (A/2)*B/100. So onde o DragonBound ja cava com o
      // proprio projetil; nos demais o buraco vem de um efeito filho.
      const cratera = (GBPhysics.MOBILES[gb.nome].cratera || [])[this.type];
      if (
        cratera && cratera[0] > 0 && cratera[1] > 0 &&
        Array.isArray(this.pala_bunge) && this.pala_bunge[0] > 0 && this.pala_bunge[1] > 0
      ) {
        this.pala_bunge = [cratera[0], cratera[1]];
      }
      // O cliente desenha pelo path; orbita/onda do DragonBound desligadas.
      this.orbit = undefined;
      this.addOrbit = undefined;
    }

    this.show = true;
    this.thorTime = 0;

    if (this.killAt == "maxt") {
      this.killAt = Math.abs(this.stime * 2 - this.getMaxT() - 200);
      console.log({ is: "killAt", killAt: this.killAt });
    }
    // Teleguiado do Kalsiddon (filho, neto ou carregador do SS)
    if (this.homing) {
      this.homingFlight = new GBPhysics.Homing({ ...this.homing, espelhos: this.espelhos || null, tornados: this.tornados || null });
      this.v = new Vector2(0, 0);
      this.friccion = 0;
      this.weight = 0;
    }
    if (this.wind_power != 0 && !this.gbFlight && !this.homingFlight) this.setWindEfect();
    if (this.power == "auto") this.positionToForce({ x: this.x1, y: this.y1 });

    this.box = new Box(new Vector(this.x0, this.y0), 8, 10, 0);
    this.explodebox = new Box(new Vector(this.x0, this.y0), 6, 8, 0);

    if (this.invertG) {
      [this.friccion, this.weight] = [this.weight, this.friccion];
    }

    if (this.damage !== null) {
      let attack_my_ava = this.account.player.avaAttack;
      if (this.account.player.check_my_ava === 0) attack_my_ava = 0;
      let total_attack = parseInt(Math.round(parseInt(attack_my_ava / 2)));
      if (total_attack > 50) {
        total_attack = 50;
      }
      this.damage += total_attack;
    }
    /*
		console.log("====================== SET SHOOT ==========================");
		console.log({
			"x0"		: this.x0,
			"y0"		: this.y0,
			"vx"		: this.v.x,
			vy			: this.v.y,
			"ang"		: this.ang,
			"power"		: this.power,
			"type"		: this.type,
			"ax"		: this.friccion,
			"ay"		: this.weight,
			"wind_ang"	: this.wind_ang,
			"wind_power": this.wind_power,
			"stime"		: this.stime,
			"isIon"		: this.isIon,
			exp			: this.explode,
			img			: this.image,
			ionId		: this.ionId,
			damage		: this.damage,
			heal		: this.heal,
			orbit		: this.orbit
		});
		console.log("==========================================================");
		*/
  }

  move(x, y) {
    if (this.box === null) this.box = new Box(new Vector(x, y), 30, 25, 0);
    this.box.setp(new Vector(x, y));
  }

  setExplodebox(x, y) {
    if (this.explodebox === null)
      this.explodebox = new Box(new Vector(x, y), 40, 40, 0);
    this.explodebox.setp(new Vector(x, y));
  }

  update() {
    this.time++;
    if (this.walking) this.updateWalking();
    else this.a = this.getPosAtTime();
  }

  // Andador: 1 px a cada WALK_TICKS ticks do servidor (2 ms de cliente por
  // tick -> 50 px/s, o mesmo passo de um jogador). Grava o trajeto para o
  // cliente a cada 20 ms: [x, y, direcao] (0 = esquerda, 1 = direita).
  updateWalking() {
    const WALK_TICKS = 10;
    if (!this.a) {
      this.a = { x: this.x0, y: this.y0 };
      this.walkPath = [];
    }
    if (this.crawl) return this.updateCrawling();
    if (this.time % WALK_TICKS === 0 && !this.walkEnd) {
      const p = this.crawl ? this.GetPosForCrawling() : this.GetPosForWalking();
      if (p.fall_and_die) this.walkEnd = "fall";
      else if (p.stuck) this.walkEnd = "stuck";
      else {
        this.a = { x: p.x, y: p.y };
        this.walk_dist++;
      }
    }
    if (this.time % 10 === 0) this.walkPath.push(this.a.x, this.a.y, this.walkCode());
  }

  // Ritmo do OAmoeba [2] 0x453a80, por tick do original (24 do servidor):
  // anda 5 px (2 px com alguem a 24 px), gira 20 graus e explode aos 30
  // ticks. Parada contra uma parede ela fica no lugar ate o tempo acabar.
  updateCrawling() {
    const TICK = 24;
    this.crawlAcc = (this.crawlAcc || 0) + (this.nearPlayer ? 2 : 5) / TICK;
    while (this.crawlAcc >= 1 && !this.walkEnd) {
      this.crawlAcc -= 1;
      const p = this.GetPosForCrawling();
      if (p.fall_and_die) this.walkEnd = "fall";
      else if (!p.stuck) {
        this.a = { x: p.x, y: p.y };
        this.walk_dist++;
      }
    }
    this.crawlRot = (this.crawlRot || 0) + ((this.crawl === "cw" ? 1 : -1) * 20) / TICK;
    if (!this.walkEnd && this.time >= 30 * TICK) this.walkEnd = "tempo";
    if (this.time % 10 === 0) this.walkPath.push(this.a.x, this.a.y, this.walkCode());
  }

  // Frog: rola grudado no terreno (chao, parede e teto) com a regra da mao
  // na parede. Anti-horario ("ccw") = parede a esquerda do movimento: anda
  // para a esquerda no chao e para a direita no teto; horario ("cw") e' o
  // espelho. Sem nada encostado (no ar), cai 1 px por passo.
  GetPosForCrawling() {
    const m = this.map;
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // dir, baixo, esq, cima (horario na tela)
    const solido = (x, y) => x >= 0 && x < m.w && y >= 0 && y < m.h && m.IsPixel(x, y);
    const livre = (x, y) => x >= 0 && x < m.w && y < m.h && !solido(x, y);
    const x = this.a.x, y = this.a.y;
    if (this.crawlDir === undefined) this.crawlDir = this.crawl === "ccw" ? 2 : 0;
    let encostado = false;
    for (let dx = -1; dx <= 1 && !encostado; dx++)
      for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && solido(x + dx, y + dy)) { encostado = true; break; }
    if (!encostado) {
      if (y + 1 >= m.h) return { x: x, y: m.h + 100, fall_and_die: !0 };
      return { x: x, y: y + 1 };
    }
    const vira = this.crawl === "ccw" ? -1 : 1; // primeiro tenta virar para o lado da parede
    for (const k of [vira, 0, -vira, 2]) {
      const nd = (this.crawlDir + k + 4) % 4;
      const nx = x + D[nd][0], ny = y + D[nd][1];
      // a borda do mapa encerra o caminho (explode ali)
      if (nx < 0 || nx >= m.w) return { x: x, y: y, stuck: !0 };
      if (livre(nx, ny)) {
        this.crawlDir = nd;
        if (nx < 0 || nx >= m.w) return { x: x, y: y, stuck: !0 };
        return { x: nx, y: ny };
      }
    }
    return { x: x, y: y, stuck: !0 };
  }

  // Terceiro valor do path do andador. Sprites marcados como andador no
  // cliente (robo/mina do Raon) leem a direcao (0 esq, 1 dir); os do Frog
  // rolam: o valor e' o angulo do sprite, girando com a distancia andada.
  walkCode() {
    const lado = this.dir === "LEFT" ? -1 : 1;
    if (this.rolar) {
      // horario = angulo crescendo na tela (rotacao positiva do sprite)
      if (this.crawl) return Math.round(this.crawlRot || 0) % 360;
      return Math.round(lado * this.walk_dist * 4) % 360;
    }
    return lado < 0 ? 0 : 1;
  }

  // Teleguiado: integra tick a tick perseguindo a posicao ATUAL do pai.
  // Alvo do tick k do filho: o pai no MESMO tick (o .gme grava a posicao do
  // pai por tick em 0x870368 e o filho persegue essa entrada); depois que o pai
  // bate, o ponto de impacto. null = o pai ainda nao chegou nesse tempo.
  homingAlvo(k) {
    const p = this.homingParent;
    if (!p) return { x: Math.floor(this.homingFlight.s.x / 256), y: Math.floor(this.homingFlight.s.y / 256), caiu: true };
    const t = (this.homingOffset || 0) + k * 24;
    // Pai ja bateu (principal ou carregador do SS): o alvo fica parado no
    // ponto de impacto, que e' o que o pai deixou gravado em 0x870368.
    if (p.isComplete && t >= p.time) return { x: p.a.x, y: p.a.y, caiu: true };
    if (!p.isComplete && t > p.time + 24) return null;
    const q = p.homingFlight ? p.homingPos(t) : p.getPosAtTime(t);
    return { x: q.x, y: q.y, caiu: false };
  }
  homingAvanca(tick) {
    const hf = this.homingFlight;
    while (hf.pts.length - 1 < tick && !this.homingEnd) {
      const alvo = this.homingAlvo(hf.pts.length);
      if (!alvo) break;
      if (hf.step(alvo)) this.homingEnd = "encontro";
      else if (hf.pts.length > 600) this.homingEnd = "tempo";
    }
  }
  homingPos(t) {
    const hf = this.homingFlight;
    const f = Math.max(0, t) / 24;
    const i = Math.floor(f);
    this.homingAvanca(i + 1);
    const a = hf.pts[Math.min(i, hf.pts.length - 1)];
    const b = hf.pts[Math.min(i + 1, hf.pts.length - 1)];
    const u = f - i;
    return { x: Math.floor((a.x + (b.x - a.x) * u) / 256), y: Math.floor((a.y + (b.y - a.y) * u) / 256) };
  }
  homingPath(durationTicks) {
    const out = [];
    const n = Math.ceil(durationTicks / 10) + 1;
    let prev = this.homingPos(0);
    for (let k = 0; k <= n; k++) {
      const p = this.homingPos(k * 10);
      const ang = Math.round((Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI);
      out.push(p.x, p.y, ang);
      prev = p;
    }
    return out;
  }

  getPosAtTime(time = null) {
    if (this.homingFlight) return this.homingPos(time ? time : this.time);
    if (this.gbFlight)
      return this.gbFlight.posAt(time ? time : this.time);
    let a = (time ? time : this.time) / 485;
    return {
      x: Math.ceil(this.x0 + this.v.x * a + (this.friccion * a * a) / 2),
      y: Math.ceil(this.y0 + this.v.y * a + (this.weight * a * a) / 2),
    };
  }

  getVelocityAtTime(time = null) {
    if (this.homingFlight) {
      const t = time ? time : this.time;
      const a = this.homingPos(t), b = this.homingPos(t + 24);
      return { x: Math.round(((b.x - a.x) * 485) / 24), y: Math.round(((b.y - a.y) * 485) / 24) };
    }
    if (this.gbFlight)
      return this.gbFlight.velAt(time ? time : this.time);
    let a = (time ? time : this.time) / 485;
    return {
      x: Math.ceil(this.v.x + this.friccion * a),
      y: Math.ceil(this.v.y + this.weight * a),
    };
  }

  getAngleAtTimeV2(time) {
    const v = this.getVelocityAtTime(time);
    const ang = RadToAngle(Math.atan2(-v.y, v.x));
    return ang;
  }

  GetPosForWalking() {
    //   a, b, c
    if (!this.a) this.a = { x: this.x0, y: this.y0 };

    let c;
    let pop = this.dir == "LEFT" ? this.a.x - 1 : this.a.x + 1;
    if (0 > pop || pop >= this.map.w)
      return {
        x: this.a.x,
        y: this.a.y,
        stuck: !0,
      };
    if (this.map.IsPixel(pop, this.a.y)) {
      for (c = this.a.y; c > this.a.y - 10; c--)
        if (!this.map.IsPixel(pop, c))
          return {
            x: pop,
            y: c,
          };
      return {
        x: this.a.x,
        y: this.a.y,
        stuck: !0,
      };
    }
    for (c = this.a.y + 1; c < this.map.h; c++)
      if (this.map.IsPixel(pop, c))
        return {
          x: pop,
          y: c - 1,
        };
    return {
      x: pop,
      y: this.map.h + 100,
      fall_and_die: !0,
    };
  }

  GetAngleAtTime(time) {
    const delta = 5;
    var b = this.getPosAtTime(time - delta);
    var a = this.getPosAtTime(time + delta);
    return Math.abs(RadToAngle(Math.atan2(a.y - b.y, a.x - b.x)));
  }
  positionToForce(
    final,
    inicial = this.y0,
    tiempo = this.time,
    weight = this.weight,
    ang = this.ang
  ) {
    /*
		tiempo = tiempo / 485;
		let x 	= ( final.x - inicial.x ) / tiempo;
		let y 	= ( (2 * final.y ) - (2 * inicial.y) - (this.weight * tiempo * tiempo)) / 2 * tiempo;
		let power	= Math.sqrt(x*x+y*y);*/

    let V0Y = Math.round(
      (final - inicial - tiempo * tiempo * weight) /
        (tiempo * Math.sin(ang * Math.PI * 180))
    );
    let power = Math.round(V0Y / Math.sin(ang * Math.PI * 180));
    //	console.log({is:"pocition to force",in:{Xf:final,Xi:inicial,tiempo:tiempo,peso:weight},out:{power:power,V0y:V0Y}});
    this.power = Math.abs(power);
  }
  getMaxT() {
    if (this.gbFlight) {
      // SS do Boomer fica dourado no 36o tick de voo (OBoomerPSSBullet 0x459c10)
      if (this.boomerSS) return GBPhysics.DOURADO_MS;
      return this.gbFlight.apiceMs();
    }
    return Math.ceil(-this.v.y / this.weight) * 488;
  }
  setWindEfect() {
    let b0 =
      Math.round(
        parseInt(
          Math.cos((this.wind_ang * Math.PI) / 180) *
            this.wind_power *
            this.weight
        )
      ) / 100;
    let b1 =
      Math.round(
        parseInt(
          Math.sin((this.wind_ang * Math.PI) / -180) *
            this.wind_power *
            this.weight -
            this.friccion
        )
      ) / 100;
    this.friccion = Math.round(this.friccion - b0);
    this.weight = Math.round(this.weight - b1);
    //		console.log({in:{wind_ang:this.wind_ang,wind_power:this.wind_power,weight:this.weight,friccion:this.friccion},out:{b0:b0,b1:b1,fri:this.friccion,wei:this.weight}});
  }
  autoPower() {
    let self = this;
    let ang = this.ang;

    this.power = parseInt((100 * 234) / 100);
    let found = false;
    let power = 400;
    for (var i = 0; i < 900; i++) {
      power = i;
      this.v = new Vector2(ang, power);
      for (var t = 0; t < 2000; t++) {
        var f = self.getPosAtTime(t);
        var cl = Math.sqrt(
          Math.pow(this.x1 - f.x, 2) + Math.pow(this.y1 - f.y, 2)
        );
        if (cl < (60 && this.cl)) {
          this.power = parseInt((i * 234) / 100);
          this.cl = cl;
          if (cl <= 15) {
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    return found;
    /*
        if (found === false) {
            if (this.ang <= 20) {
                this.ang += 10;
            } else if (this.ang >= 60) {
                this.ang -= 10;
            }
		}*/
  }
  autoAngle() {
    this.ang =
      (-Math.atan2(this.y1 - this.y0, this.x1 - this.x0) * 180) / Math.PI;
    if (this.ang < 0) this.ang += 360;
  }
  autoAngle2() {
    let self = this;
    let power = this.power;

    let found = false;
    let ang = 0;
    if (this.x0 < this.x1)
      for (var i = 91; i < 270; i++) {
        this.ang = i;
        this.v = new Vector2(ang, power);
        for (var t = 0; t < 2000; t++) {
          var f = self.getPosAtTime(t);
          var cl = Math.sqrt(
            Math.pow(this.x1 - f.x, 2) + Math.pow(this.y1 - f.y, 2)
          );
          if (cl < (60 && this.cl)) {
            this.cl = cl;
            if (cl <= 15) {
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    else
      for (var i = 270; i < 451; i++) {
        this.ang = i;
        this.v = new Vector2(ang, power);
        for (var t = 0; t < 2000; t++) {
          var f = self.getPosAtTime(t);
          var cl = Math.sqrt(
            Math.pow(this.x1 - f.x, 2) + Math.pow(this.y1 - f.y, 2)
          );
          if (cl < (60 && this.cl)) {
            this.cl = cl;
            if (cl <= 15) {
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    return found;
  }
};

function Vector2(a, b) {
  this.ang = a;
  this.size = b;
  this.x = Math.cos((a * Math.PI) / 180) * b;
  this.y = -Math.sin((a * Math.PI) / 180) * b;
}

function RadToAngle(a) {
  return (180 * a) / Math.PI;
}

function AngleToRad(a) {
  return (a * Math.PI) / 180;
}
