// ---------------------------------------------------------------------------
// Fisica do Boomer do GunBound ORIGINAL (cliente WC R_7, GunBound.gme).
// Porte do motor do simulador (gunbound-sim/original.js); enderecos e a origem
// de cada regra estao em gunbound-sim/estudo/engenharia-reversa.md.
//
// O jogo integra POR TICK, em inteiros, com posicao e velocidade em 1/256 px,
// seno e atan2 por tabela e divisoes truncando para zero (C):
//
//   forca  = barra * K / 8                  (barra 0..400, K = 35 no Boomer)
//   vel    = (trunc(cos(ang)*forca*512)/100, trunc(sen(ang)*forca*-512)/100)
//   acel   = ((trunc(cos(wA)*w)<<8)/100, ((G - trunc(sen(wA)*w))<<8)/100)
//   a cada tick:  [forca do bumerangue]  pos += vel  vel += acel  [quebra]
//
// O bumerangue (OBoomerBullet 0x4588e0 / OBoomerPSSBullet 0x459c10) so liga
// quando o tiro sai CONTRA o vento horizontal. Sem ele, o Boomer recebe uma
// sustentacao constante de 128 contra a gravidade de 250 (parabola "leve").
//
// Escala para o DragonBound: ancorada no Armor (weight 398 no servidor,
// G = 98 no original): 1 tick do original = sqrt(0,98/398) s = 24 ticks do
// servidor (o servidor usa 485 ticks/s nas posicoes e 2 ms de cliente/tick).
// O mapa e' o mesmo em pixels.
// ---------------------------------------------------------------------------
const SENO = require("./gunboundSeno");

const K = 35; // characterdata campo 25 (escala da barra)
const G = 98; // characterdata campo 40 (gravidade)
const P = 50; // campo 9 do bloco de tiro (S1, S2 e SS)
const BOCA = { A: 75, R: 38 }; // characterdata 36/37, 38/39, 42/43 (iguais)
const SRV_TICKS = 24; // ticks do servidor por tick do original
const TICKS_MAX = 4000;
const DOURADO_TICK = 36; // SS fica dourado no 36o tick de voo

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

// Boca do cano (0x443a80). body com o mesmo sinal do servidor (ang -= body).
function bocaDoCano(x, y, look, body) {
  const incl = -Math.round(body || 0);
  const b = look === 1 ? BOCA.A + incl : 180 - BOCA.A - incl;
  return {
    x: x + Math.trunc(cos(b) * BOCA.R),
    y: y - Math.trunc(sen(b) * BOCA.R),
  };
}

// Converte a forca do servidor (barra * 2,34) de volta para a barra 0..400.
const barraDaForca = (power) => Math.max(0, Math.round(power / 2.34));

class BoomerFlight {
  // x0,y0: boca (px) | ang: angulo de mundo (0 dir, 90 cima) | barra: 0..400
  // windAng/windPower: como o servidor do DragonBound guarda (o vento do
  // servidor empurra para windAng + 180, ver Shoot.setWindEfect).
  constructor({ x0, y0, ang, barra, windAng = 0, windPower = 0 }) {
    const angI = mod360(Math.round(ang));
    const forca = Math.trunc((barra * K) / 8);
    const s = (this.s = {
      vx: idiv(Math.trunc(cos(angI) * forca * 512), 100),
      vy: idiv(Math.trunc(sen(angI) * forca * -512), 100),
    });
    const wA = Math.round(windAng + 180);
    const wF = Math.round(windPower || 0);
    const wx = Math.trunc(cos(wA) * wF);
    const wy = Math.trunc(sen(wA) * wF);
    s.ax = idiv(wx * 256, 100);
    s.ay = idiv((G - wy) * 256, 100);
    this.vx0 = s.vx;

    // Fabrica 0x431433: o bumerangue liga apenas contra o vento.
    let liga = false;
    if (s.ax > 0) liga = s.vx <= 0;
    else if (s.ax < 0) liga = s.vx >= 0;
    if (s.vx === 0) liga = false;
    s.bumerangue = liga;
    s.iniciado = false;
    s.dir = 0;
    s.a = 0;
    s.quebra = null;

    this.cx = x0 * 256;
    this.cy = y0 * 256;
    // pts[i] = posicao (1/256 px) e velocidade no FIM do tick i
    this.pts = [{ x: this.cx, y: this.cy, vx: s.vx, vy: s.vy }];
  }

  step() {
    const s = this.s;
    // 1-2: forca do bumerangue / sustentacao, perpendicular ao angulo a e
    // sempre para cima (0x458a20-0x458b0d).
    if (!s.bumerangue) s.a = 0;
    else {
      if (!s.iniciado) {
        s.a = direcaoVel(s);
        s.iniciado = true;
        s.dir = s.a < 90 ? 1 : -1;
      }
      if (s.dir === 0) s.a = direcaoVel(s);
    }
    let kx = idiv(Math.trunc(cos(s.a + 90) * 256 * P), 100);
    let ky = -idiv(Math.trunc(sen(s.a + 90) * P * 256), 100);
    if (ky > 0) {
      kx = -kx;
      ky = -ky;
    }
    s.vx += kx;
    s.vy += ky;
    // 3-4: integra
    this.cx += s.vx;
    this.cy += s.vy;
    s.vx += s.ax;
    s.vy += s.ay;
    if (s.vy > 0) {
      if (s.dir !== 0 && !s.quebra) s.quebra = this.pts.length;
      s.dir = 0; // comecou a descer
    }
    // 5: gira 1 grau/tick ate a vertical; ali o jogo zera vel.y (a "quebra")
    if (s.bumerangue) {
      s.a += s.dir;
      if ((s.dir === 1 && s.a >= 90) || (s.dir === -1 && s.a <= 90)) {
        s.dir = 0;
        s.vy = 0;
        if (!s.quebra) s.quebra = this.pts.length;
      }
    }
    this.pts.push({ x: this.cx, y: this.cy, vx: s.vx, vy: s.vy });
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

  // Velocidade em unidades do servidor (px por 485 ticks), para tornado/espelho.
  velAt(t) {
    const p = this.ensure(Math.floor(Math.max(0, t) / SRV_TICKS) + 1);
    const k = 485 / SRV_TICKS / 256;
    return { x: Math.round(p.vx * k), y: Math.round(p.vy * k) };
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
      const ang = Math.round((Math.atan2(v.y, v.x) * 180) / Math.PI);
      out.push(p.x, p.y, ang);
    }
    return out;
  }
}

module.exports = {
  BoomerFlight,
  bocaDoCano,
  barraDaForca,
  SRV_TICKS,
  K,
  G,
  P,
  // tempo de cliente (ms) em que o SS fica dourado, relativo ao disparo
  DOURADO_MS: (DOURADO_TICK - 1) * SRV_TICKS * 2,
};
