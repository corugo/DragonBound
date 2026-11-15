// ---------------------------------------------------------------------------
// Fisica de tiro do GunBound ORIGINAL (cliente WC R_7, GunBound.gme), para
// todos os mobiles que existem no original. Porte do motor do simulador
// (gunbound-sim/original.js); enderecos e a origem de cada regra estao em
// gunbound-sim/estudo/engenharia-reversa.md.
//
// O jogo integra POR TICK, em inteiros, com posicao e velocidade em 1/256 px,
// seno e atan2 por tabela e divisoes truncando para zero (C):
//
//   forca  = barra * K / 8 + dF              (barra 0..400; K por mobile)
//   vel    = (trunc(cos(ang)*forca*512)/100, trunc(sen(ang)*forca*-512)/100)
//   acel   = ((trunc(cos(wA)*w)<<8)/100, ((G - trunc(sen(wA)*w))<<8)/100)
//   a cada tick:  pos += vel;  vel += acel
//
// Quatro classes fogem disso em voo:
//   OBoomerBullet  (Boomer)    bumerangue contra o vento / sustentacao a favor
//   ORollingBullet (Trico S2)  orbita de raio 2->30 px em volta do centro
//   OWaterBullet   (Turtle S2) onda perpendicular ao voo
//   ORayonLaser    (Raon S1)   oscilacao de 13 px perpendicular ao voo
// Nas tres ultimas a posicao que COLIDE e' centro + deslocamento.
//
// Escala para o DragonBound: ancorada no Armor (weight 398 no servidor,
// G = 98 no original): 1 tick do original = 24 ticks do servidor (o servidor
// usa 485 ticks/s nas posicoes e 2 ms de cliente por tick). Mapa em pixels
// iguais. O vento do servidor empurra para wind_angle + 180.
// ---------------------------------------------------------------------------
const DADOS = require("./gunboundDados");
const SENO = DADOS.seno;
const MOBILES = DADOS.mobiles;

const SRV_TICKS = 24; // ticks do servidor por tick do original
const SRV_POR_SEG = 485; // ticks do servidor por "segundo" da formula fechada
const TICKS_MAX = 4000;
const DOURADO_TICK = 36; // SS do Boomer fica dourado no 36o tick de voo

const idiv = (a, b) => Math.trunc(a / b);
const mod360 = (g) => ((g % 360) + 360) % 360;
const sen = (g) => SENO[mod360(g)];
const cos = (g) => SENO[mod360(g + 90)];

// 0x52b7c0: atan2 por tabela 257x257 (0 = direita, 90 = cima, y de tela).
function atanTab(x, y) {
  while (x < -127 || x > 128 || y < -127 || y > 128) {
    x = idiv(x, 2);
    y = idiv(y, 2);
  }
  // Excecoes da tabela do binario (diagonais e eixos negativos)
  if (x < 0 && y === x) return 134;
  if (x < 0 && y === 0) return 179;
  if (x === 0 && y < 0) return 89;
  if (x > 0 && y === -x) return 44;
  if (x === 0 && y === 0) return 0;
  return mod360(Math.floor((Math.atan2(-y, x) * 180) / Math.PI));
}
// 0x45e370: direcao da velocidade, arredondada a multiplo de 3 graus.
const direcaoVel = (s) =>
  idiv(atanTab(idiv(s.vx, 100), idiv(s.vy, 100)) + 1, 3) * 3;

// Mobile do original pelo nome do DragonBound (Fox, Barney e Electrico nao
// existem no original e ficam com a fisica antiga).
const mobileOriginal = (nome) => (nome && MOBILES[nome]) || null;

// Boca do cano (0x443a80). body com o mesmo sinal do servidor (ang -= body).
function bocaDoCano(nome, tipo, x, y, look, body) {
  const mb = MOBILES[nome];
  const [A, R] = mb.boca[tipo] || mb.boca[0];
  const incl = -Math.round(body || 0);
  const b = look === 1 ? A + incl : 180 - A - incl;
  return { x: x + Math.trunc(cos(b) * R), y: y - Math.trunc(sen(b) * R) };
}

// Converte a forca do servidor (barra * 2,34) de volta para a barra 0..400.
const barraDaForca = (power) => Math.max(0, Math.round(power / 2.34));

// Composicao do tiro no original para o projetil `idx` de um tiro com `qtd`
// projeteis no DragonBound. Vale quando as contagens batem, ou quando o
// original tem um projetil so (Armor S2: o DragonBound faz o impacto duplo do
// ODoubleBullet com 2 projeteis identicos). Senao, o projetil voa como OBullet
// comum e mantem os desvios do DragonBound.
function projetilOriginal(nome, tipo, idx, qtd) {
  const lista = MOBILES[nome].tiros[tipo] || [];
  if (lista.length === qtd && lista[idx]) return { ...lista[idx], casou: true };
  if (lista.length === 1) return { ...lista[0], casou: true };
  return { dA: 0, dE: 0, dF: 0, mov: "base", casou: false };
}

class GBFlight {
  // nome: mobile do original | tipo: 0..2 | pj: {dA,dE,dF,mov,fase}
  // x0,y0: boca (px) | ang: angulo de mundo (0 dir, 90 cima) | barra: 0..400
  // windAng/windPower: como o servidor guarda (empurra para windAng + 180).
  constructor({ nome, tipo, pj, x0, y0, ang, barra, windAng = 0, windPower = 0 }) {
    const mb = MOBILES[nome];
    pj = pj || { dA: 0, dE: 0, dF: 0, mov: "base" };
    this.mov = pj.mov === "kalsiddon" ? "base" : pj.mov; // divisao fica no DB
    const P = mb.P[tipo] != null ? mb.P[tipo] : 100;
    // Grub: o leque soma na elevacao, espelhado pelo lado.
    const dElev = mod360(ang) <= 90 ? pj.dE || 0 : -(pj.dE || 0);
    const angI = mod360(Math.round(ang + (pj.dA || 0) + dElev));
    const forca = Math.max(0, Math.trunc((barra * mb.K) / 8) + (pj.dF || 0));
    const s = (this.s = {
      vx: idiv(Math.trunc(cos(angI) * forca * 512), 100),
      vy: idiv(Math.trunc(sen(angI) * forca * -512), 100),
    });
    const wA = Math.round(windAng + 180);
    const wF = Math.round(windPower || 0);
    s.ax = idiv(Math.trunc(cos(wA) * wF) * 256, 100);
    s.ay = idiv((mb.G - Math.trunc(sen(wA) * wF)) * 256, 100);
    this.angI = angI;
    this.vel0 = { x: s.vx, y: s.vy };

    if (this.mov === "boomer") {
      // Fabrica 0x431433: o bumerangue liga apenas contra o vento.
      let liga = false;
      if (s.ax > 0) liga = s.vx <= 0;
      else if (s.ax < 0) liga = s.vx >= 0;
      if (s.vx === 0) liga = false;
      Object.assign(s, { P, bumerangue: liga, iniciado: false, dir: 0, a: 0 });
    } else if (this.mov === "orbita") {
      // ORollingBullet: phi0 = fase + angulo; passo -8 se angulo <= 90
      Object.assign(s, { raio: 2, fase: mod360((pj.fase || 0) + angI), passo: angI <= 90 ? -8 : 8 });
    } else if (this.mov === "onda") {
      Object.assign(s, { fase: pj.fase || 0, amp: 1000, passo: 5, cont: 0 });
    } else if (this.mov === "laser") {
      s.fase = pj.fase || 0;
    }

    this.cx = x0 * 256;
    this.cy = y0 * 256;
    // pts[i]: posicao que colide (1/256 px) e velocidade no fim do tick i
    this.pts = [{ x: this.cx, y: this.cy, vx: s.vx, vy: s.vy }];
    this.apice = null;
  }

  // --- movimentos proprios -------------------------------------------------
  boomerAntes() {
    const s = this.s;
    if (!s.bumerangue) s.a = 0;
    else {
      if (!s.iniciado) {
        s.a = direcaoVel(s);
        s.iniciado = true;
        s.dir = s.a < 90 ? 1 : -1;
      }
      if (s.dir === 0) s.a = direcaoVel(s);
    }
    // forca perpendicular ao angulo a, sempre para cima (0x458a20-0x458b0d)
    let kx = idiv(Math.trunc(cos(s.a + 90) * 256 * s.P), 100);
    let ky = -idiv(Math.trunc(sen(s.a + 90) * s.P * 256), 100);
    if (ky > 0) {
      kx = -kx;
      ky = -ky;
    }
    s.vx += kx;
    s.vy += ky;
  }
  boomerDepois() {
    const s = this.s;
    if (s.vy > 0) s.dir = 0; // comecou a descer
    if (s.bumerangue) {
      s.a += s.dir; // gira 1 grau/tick ate a vertical...
      if ((s.dir === 1 && s.a >= 90) || (s.dir === -1 && s.a <= 90)) {
        s.dir = 0;
        s.vy = 0; // ...e ali o jogo zera vel.y (a "quebra")
      }
    }
  }
  // Deslocamento (1/256 px) em volta do centro, por tick.
  desvio() {
    const s = this.s;
    if (this.mov === "orbita") {
      // ORollingBullet 0x49b760: R*(sen+cos, cos-sen), R 2->30 (+2/tick)
      const r = s.raio * 256;
      const dx = Math.trunc((sen(s.fase) + cos(s.fase)) * r);
      const dy = Math.trunc((cos(s.fase) - sen(s.fase)) * r);
      s.raio = Math.min(s.raio + 2, 30);
      s.fase = mod360(s.fase + s.passo);
      return [dx, dy];
    }
    if (this.mov === "onda") {
      // OWaterBullet 0x4a3d30
      const a = mod360(direcaoVel(s) + 90);
      const dx = idiv(Math.trunc(cos(a) * sen(s.fase) * s.amp) * 256, 100);
      const dy = idiv(Math.trunc(-(sen(a) * sen(s.fase) * s.amp)) * 256, 100);
      s.fase = (s.passo + s.fase) % 360;
      if (s.cont < 10) {
        s.amp += 200;
        s.passo += 4;
      } else {
        s.amp = Math.max(s.amp - 20, 0);
        s.passo = Math.max(s.passo - 1, 0);
      }
      s.cont++;
      return [dx, dy];
    }
    if (this.mov === "laser") {
      // ORayonLaser 0x4938c0: 13 px, fase +40/tick
      const a = mod360(direcaoVel(s) + 90);
      const dx = Math.trunc(cos(a) * sen(s.fase) * 13);
      const dy = Math.trunc(sen(a) * sen(s.fase) * -13);
      s.fase = mod360(s.fase + 40);
      return [dx * 256, dy * 256];
    }
    return null;
  }

  step() {
    const s = this.s;
    if (this.mov === "boomer") this.boomerAntes();
    this.cx += s.vx;
    this.cy += s.vy;
    const d = this.desvio();
    s.vx += s.ax;
    s.vy += s.ay;
    if (this.mov === "boomer") this.boomerDepois();
    if (this.apice === null && s.vy > 0) this.apice = this.pts.length;
    this.pts.push({
      x: this.cx + (d ? d[0] : 0),
      y: this.cy + (d ? d[1] : 0),
      vx: s.vx,
      vy: s.vy,
    });
  }

  ensure(i) {
    while (this.pts.length <= i && this.pts.length <= TICKS_MAX) this.step();
    return this.pts[Math.min(i, this.pts.length - 1)];
  }

  // Posicao em px no tempo do SERVIDOR (shoot.time), interpolada entre ticks.
  posAt(t) {
    const f = Math.max(0, t) / SRV_TICKS;
    const i = Math.floor(f);
    const a = this.ensure(i);
    const b = this.ensure(i + 1);
    const u = f - i;
    return {
      x: Math.floor((a.x + (b.x - a.x) * u) / 256),
      y: Math.floor((a.y + (b.y - a.y) * u) / 256),
    };
  }

  // Velocidade do centro em unidades do servidor (px por 485 ticks).
  velAt(t) {
    const p = this.ensure(Math.floor(Math.max(0, t) / SRV_TICKS) + 1);
    const k = SRV_POR_SEG / SRV_TICKS / 256;
    return { x: Math.round(p.vx * k), y: Math.round(p.vy * k) };
  }

  // Parametros equivalentes da formula fechada do DragonBound (o que o cliente
  // usa para efeitos que nao leem o path, e o que os projeteis filhos herdam).
  equivalente() {
    const kv = SRV_POR_SEG / SRV_TICKS / 256; // 1/256 px por tick -> px/s
    const ka = kv * (SRV_POR_SEG / SRV_TICKS); // 1/256 px por tick^2 -> px/s^2
    const vx = this.vel0.x * kv, vy = this.vel0.y * kv;
    return {
      power: Math.sqrt(vx * vx + vy * vy),
      friccion: Math.round(this.s.ax * ka),
      weight: Math.round(this.s.ay * ka),
    };
  }

  // Tempo de cliente (ms) do apice, para os efeitos addAtMaxT.
  apiceMs() {
    for (let i = 1; this.apice === null && i <= 1200; i++) this.ensure(i);
    return (this.apice === null ? 0 : this.apice) * SRV_TICKS * 2;
  }

  // Trajetoria para o cliente (CShot.GetPosAtPath): [x, y, ang] a cada 20 ms
  // de cliente = 10 ticks do servidor, ate durationTicks.
  clientPath(durationTicks) {
    const out = [];
    const n = Math.ceil(durationTicks / 10) + 1;
    for (let k = 0; k <= n; k++) {
      const t = k * 10;
      const p = this.posAt(t);
      const v = this.velAt(t);
      out.push(p.x, p.y, Math.round((Math.atan2(v.y, v.x) * 180) / Math.PI));
    }
    return out;
  }
}

module.exports = {
  GBFlight,
  MOBILES,
  mobileOriginal,
  bocaDoCano,
  barraDaForca,
  projetilOriginal,
  SRV_TICKS,
  // tempo de cliente (ms) em que o SS do Boomer fica dourado
  DOURADO_MS: (DOURADO_TICK - 1) * SRV_TICKS * 2,
};
