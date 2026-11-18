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

// Espelho (clima 7): reflete na horizontal quem cruza a faixa px +-10 abaixo
// do topo do desenho (o cliente desenha o espelho de y = -600 ate o chao; por
// cima dele o tiro passa direto). Feito dentro da fisica, no tick em que cruza:
// o tiro continua o mesmo (path, divisao do Kalsiddon, efeitos de fim).
const ESPELHO_FAIXA = 10;
const ESPELHO_TOPO = -600;
function espelhoCruzado(espelhos, px, py, ultimo) {
  if (!espelhos || !espelhos.length || py < ESPELHO_TOPO) return null;
  for (const e of espelhos)
    if (e.px !== ultimo && Math.abs(px - e.px) <= ESPELHO_FAIXA) return e.px;
  return null;
}

// Tornado (clima 8), como no .gme (OBullet [6] 0x45d5d0, varredura 0x458540):
// entra quem cruza |x - centro| < largura/4 (metade da largura desenhada).
// Dentro: sem gravidade nem vento, |vx| minimo de 200 (1/256 px/tick) e, ao
// passar de uma parede (centro +- largura/4), inverte vx ate 2 vezes; na 3a
// parede sai do tornado sem inverter e volta a fisica normal.
function tornadoEm(tornados, px) {
  if (!tornados) return null;
  for (const t of tornados) {
    const q = Math.trunc(t.size / 4);
    if (t.px - q < px && px < t.px + q) return t;
  }
  return null;
}
// Um tick dentro do tornado: devolve false quando o projetil sai dele.
function tornadoPasso(s, t, px) {
  if (Math.abs(s.vx) < 200) s.vx = s.vx < 0 ? -200 : 200;
  const q = Math.trunc(t.size / 4);
  if (px < t.px - q || px > t.px + q) {
    s.tornCont = (s.tornCont || 0) + 1;
    if (s.tornCont > 2) return false;
    s.vx = -s.vx;
  }
  return true;
}

// Desenho no tornado (0x45e410): dentro dele e indo para a esquerda (vx < 0)
// o projetil e' desenhado ATRAS do tornado. Intervalos [inicioMs, fimMs] (tick
// do original = 48 ms) a partir das marcas "atras" de cada ponto do voo.
function intervalosAtras(pts, ticks) {
  const out = [];
  let ini = null;
  const n = Math.min(pts.length - 1, Math.ceil(ticks));
  for (let k = 0; k <= n; k++) {
    const a = !!(pts[k] && pts[k].atras);
    if (a && ini === null) ini = k;
    if (!a && ini !== null) { out.push([ini * 48, k * 48]); ini = null; }
  }
  if (ini !== null) out.push([ini * 48, (n + 1) * 48]);
  return out.length ? out : null;
}

// Dano do original: campo 0 do bloco do tiro no characterdata (44 + 13*t).
// null quando o mobile nao e' do original ou o campo e' 0.
function danoOriginal(nome, tipo) {
  const m = nome && MOBILES[nome];
  const v = m && m.dano && m.dano[tipo];
  return v > 0 ? v : null;
}
// Nome do mobile do original de quem disparou (gb do disparo ou mobile atual).
function nomeOriginalDe(data, Types) {
  let nome = data && data.gb && data.gb.nome;
  if (!nome && data && data.account && data.account.player) {
    const mb = Types.MOBILES[data.account.player.mobile];
    nome = mb && mb.name;
  }
  return nome && MOBILES[nome] ? nome : null;
}

// --- Corpo e dano do original --------------------------------------------
// Corpo: retangulo W x H acima dos pes (c2 acima do chao), com o centro
// deslocado de lado pela inclinacao (0x465ee0, tabela 0x5cfa28).
const CORPO_PADRAO = { W: 28, H: 24, c2: 0, defesa: 100 };
const corpoDe = (nome) => (nome && MOBILES[nome] && MOBILES[nome].corpo) || CORPO_PADRAO;
const DESVIO_INCL = [0, 2, 4, 6, 9, 12, 13];
function desvioInclinacao(body) {
  const b = Math.round(body || 0);
  let i = b > 0 ? Math.trunc((b + 4) / 10) : Math.trunc((-4 - b) / 10);
  if (i > 5) i = 6;
  const v = DESVIO_INCL[Math.max(0, i) % 7];
  return b > 0 ? v : -v;
}
// 0x4647a0: o projetil (um ponto) acerta o mobile se cair no retangulo.
function acertaCorpo(px, py, pl, corpo) {
  const off = desvioInclinacao(pl.body);
  const meia = corpo.W >> 1;
  return (
    pl.x + off - meia <= px && px <= pl.x + off + meia &&
    pl.y - corpo.H - corpo.c2 <= py && py <= pl.y - corpo.c2
  );
}
// 0x464ab0: dano de uma explosao em (ix, iy) com cratera [rx, ry] no mobile.
// A = 2*ry e B = rx*100/ry (a mesma elipse da cratera); raio r = A/2 + 10;
// distancia d ate o centro do corpo com o x escalado por 100/B; queda linear
// (r - d)/r em milesimos; bonus de ate 20% se |dx| < W/2; defesa do alvo (%).
//
// ATENCAO - partes do 0x464ab0 que NAO estao portadas:
//  - Ataque: o .gme multiplica o dano por (tiro+0xd0)/100 e por
//    (100 + (tiro+0xc8)/2 + (tiro+0xc0))/100. Nao identifiquei a origem desses
//    campos (provavelmente ataque do avatar/itens). Aqui continua o bonus do
//    DragonBound: Shoot soma avaAttack/2 (max 50) ao dano base.
//  - Guarda: o .gme nao tem o desconto fixo de avaGuard/2 (max 50); ele vem
//    do DragonBound (Player.disHpShield) e continua valendo.
//  - Defesa -20% quando o alvo tem a flag +0x4ac: ligada pelo tratador de
//    pacotes 0x4d84d0 (provavelmente um item); origem nao identificada.
//  - Vulnerabilidades acumuladas do alvo (+0x444..+0x45c, ate 50%): somadas a
//    partir de um vetor que so alguns tiros passam ao 0x464ab0; nao portado.
// Portado: ajuste de +-4 pontos na defesa pelo tipo do mobile atingido
// (campo 35, bits 8/4/2) contra o tipo do tiro (campo 10 do bloco, bits 4/2/1).
function danoExplosao(base, ix, iy, cratera, pl, corpo, tiroBits) {
  if (!(base > 0) || !cratera || !(cratera[1] > 0)) return 0;
  const ry = cratera[1], rx = cratera[0] > 0 ? cratera[0] : ry;
  const A = 2 * ry, B = Math.max(1, Math.trunc((rx * 100) / ry));
  const r = (A >> 1) + 10;
  const off = desvioInclinacao(pl.body);
  const dxBruto = Math.abs(pl.x - ix + 2 * off);
  const dx = Math.trunc((dxBruto * 100) / B);
  const dy = pl.y - ((corpo.H - corpo.c2) >> 1) - iy - corpo.c2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return 0;
  const meia = corpo.W >> 1;
  const bonus = Math.max(0, Math.trunc(((meia - dxBruto) * 20) / meia));
  const queda = Math.trunc(((r - Math.sqrt(d2)) * 1000) / r);
  let dm = Math.trunc((base * (queda + Math.trunc((bonus * queda) / 100))) / 1000);
  let def = corpo.defesa;
  const vt = corpo.tipo || 0, tb = tiroBits || 0;
  if (vt & 8) { if (tb & 2) def -= 4; if (tb & 1) def += 4; }
  if (vt & 4) { if (tb & 4) def -= 4; if (tb & 2) def += 4; }
  if (vt & 2) { if (tb & 4) def += 4; if (tb & 1) def -= 4; }
  dm = Math.trunc((dm * def) / 100);
  return dm > 0 ? dm : 0;
}
// Thor do original: nivel pelos limiares 0x5cf1fc (0x4a1530: nivel N quando
// o XP passa de 0/300/900/1800/3200/6000) e dano do raio por nivel (tabela
// 0x5cf22c, lida por 0x4a15e0). Cratera A=46/B=150 em todos os niveis; tipo
// Laser (0x436180 liga a flag +0x144 da explosao).
const THOR_LIMIAR = [0, 300, 900, 1800, 3200, 6000];
const THOR_DANO = [100, 120, 140, 160, 180, 200];
function thorNivel(xp) {
  let n = 1;
  for (let i = 0; i < THOR_LIMIAR.length; i++) if (THOR_LIMIAR[i] < (xp || 0)) n = i + 1;
  return n;
}
const thorDano = (xp) => THOR_DANO[thorNivel(xp) - 1];

// Tipo (bits) do tiro do mobile do original.
const tipoTiroDe = (nome, tipo) =>
  (nome && MOBILES[nome] && MOBILES[nome].tipoTiro && MOBILES[nome].tipoTiro[tipo]) || 0;

// Mobile do original pelo nome do DragonBound (Fox, Barney e Electrico nao
// existem no original e ficam com a fisica antiga).
const mobileOriginal = (nome) => (nome && MOBILES[nome]) || null;

// Boca do cano (0x443a80). body com o mesmo sinal do servidor (ang -= body).
function bocaDoCano(nome, tipo, x, y, look, body) {
  const mb = MOBILES[nome];
  const [A, R] = mb.boca[tipo] || mb.boca[0];
  // A inclinacao do .gme (+0x1bc) e' relativa ao lado para onde o mobile olha
  // (bico para cima positivo); o body do DragonBound e' a inclinacao do
  // terreno no mundo (angulo de mundo = mira - body, para os dois lados).
  // Entao incl = -body olhando para a direita e +body olhando para a esquerda:
  // a boca gira junto com o mobile nos dois lados.
  const r = Math.round(body || 0);
  const incl = look === 1 ? -r : r;
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
  constructor({ nome, tipo, pj, x0, y0, ang, barra, windAng = 0, windPower = 0, espelhos = null, tornados = null }) {
    const mb = MOBILES[nome];
    this.espelhos = espelhos;
    this.tornados = tornados && tornados.length ? tornados : null;
    this.torn = null;
    this.ultimoEspelho = null;
    pj = pj || { dA: 0, dE: 0, dF: 0, mov: "base" };
    // Kalsiddon: voa como OBullet; a divisao em teleguiados no apice e' feita
    // pelo world (Homing abaixo), que precisa do pai vivo para perseguir.
    this.kals = pj.mov === "kalsiddon" ? pj.div : null;
    this.mov = pj.mov === "kalsiddon" ? "base" : pj.mov;
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
    if (this.tornados) {
      const pcx = Math.floor(this.cx / 256);
      if (!this.torn) {
        this.torn = tornadoEm(this.tornados, pcx);
        if (this.torn) s.tornCont = 0;
      }
      if (this.torn && !tornadoPasso(s, this.torn, pcx)) this.torn = null;
    }
    if (!this.torn) {
      s.vx += s.ax;
      s.vy += s.ay;
    }
    if (this.mov === "boomer") this.boomerDepois();
    if (this.apice === null && s.vy > 0) this.apice = this.pts.length;
    const x = this.cx + (d ? d[0] : 0), y = this.cy + (d ? d[1] : 0);
    const e = espelhoCruzado(this.espelhos, Math.floor(x / 256), Math.floor(y / 256), this.ultimoEspelho);
    if (e !== null) { s.vx = -s.vx; this.ultimoEspelho = e; }
    this.pts.push({ x, y, vx: s.vx, vy: s.vy, atras: !!this.torn && s.vx < 0 });
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

// --- Kalsiddon: teleguiados -------------------------------------------------
// OHommingBullet (0x475220, [2] 0x476240) e OHommingCarriorBullet (0x477040,
// [2] 0x478150). Sem gravidade nem vento. O alvo e' o projetil PAI (que grava
// a propria posicao a cada tick); o filho o persegue com curva limitada.
// Porte do teleguiado() do gunbound-sim/original.js.
class Homing {
  // x, y em 1/256 px; ang em graus de mundo; vel/curva do original
  constructor({ x, y, ang, vel, curva, carregador, espelhos = null, tornados = null }) {
    this.carregador = !!carregador;
    this.espelhos = espelhos;
    this.tornados = tornados && tornados.length ? tornados : null;
    this.torn = null;
    this.ultimoEspelho = null;
    this.s = {
      x, y, h: ang * 20, vel, curva, acel: -128, dcurva: -2, cont: 0, ticks: 0, travado: false,
      vx: idiv(Math.trunc(cos(ang) * vel) * 512, 100),
      vy: -idiv(Math.trunc(sen(ang) * vel) * 512, 100),
    };
    this.pts = [{ x, y }];
    this.afastou = false;
  }
  // um tick do original; alvo = {x, y, caiu} em px: a posicao que o pai gravou
  // em 0x870368 neste tick. caiu = flag da entrada (=1 so depois que o pai bate
  // no terreno, 0x45e9a5/0x4770c9). Enquanto o pai voa o filho persegue sem
  // prazo; o cont (limite de 41 ticks de curva) e a trava so andam depois que
  // ele caiu (0x476240 e 0x4755ac).
  step(alvo) {
    const s = this.s;
    const antes = this.pts[this.pts.length - 1];
    // 0x475220: o teleguiado so segue voando enquanto cont < 41 (ticks desde
    // que o pai caiu) ou se ja travou no ponto de impacto; senao vai direto
    // para o impacto e explode onde esta (no tornado inclusive). Sem isto o
    // filho que saia do tornado sem travar seguia reto e lento para sempre.
    if (!this.carregador && s.cont >= 41 && !s.travado) {
      this.pts.push({ x: s.x, y: s.y, atras: false });
      return true;
    }
    s.x += s.vx;
    s.y += s.vy;
    const px = Math.floor(s.x / 256), py = Math.floor(s.y / 256);
    const esp = espelhoCruzado(this.espelhos, px, py, this.ultimoEspelho);
    if (esp !== null) { s.vx = -s.vx; s.h = 3600 - s.h; this.ultimoEspelho = esp; }
    // Tornado (0x475220): dentro dele o teleguiado nao faz curva, so quica.
    if (this.tornados) {
      if (!this.torn) {
        this.torn = tornadoEm(this.tornados, px);
        if (this.torn) s.tornCont = 0;
      }
      if (this.torn && !tornadoPasso(s, this.torn, px)) this.torn = null;
    }
    if (!this.torn && (this.carregador || s.cont < 41 || s.travado)) {
      const dv = atanTab(idiv(s.vx, 100), idiv(s.vy, 100));
      const dt = atanTab(alvo.x - px, alvo.y - py);
      const dif = Math.abs(dv - dt);
      if (alvo.caiu && !s.travado && dif * 20 < s.curva) { s.travado = true; s.dcurva = -15; }
      let giro = Math.min(dif * 20, s.curva);
      if ((alvo.x - px) * s.vy - (alvo.y - py) * s.vx >= 0) giro = -giro;
      s.h += giro;
      if (s.vel > 0) {
        s.vx = idiv(Math.trunc(cos(idiv(s.h, 20)) * s.vel) * 256, 50);
        s.vy = idiv(Math.trunc(sen(idiv(s.h, 20)) * s.vel) * 256, 50);
      }
    }
    if (s.acel < 0) s.vel -= idiv(s.vel, this.carregador ? 6 : 7);
    else s.vel += s.acel;
    s.curva = Math.max(0, Math.min(200, s.curva + s.dcurva));
    if (s.acel < 0 && s.vel < 128) { s.acel = 55; s.dcurva = 10; }
    if (alvo.caiu) s.cont++;
    s.ticks++;
    this.pts.push({ x: s.x, y: s.y, atras: !!this.torn && s.vx < 0 });
    // No .gme (0x475220) o teleguiado nao "encontra" o pai: so termina ao
    // bater no terreno, num jogador ou sair do mapa. Depois que o pai cai ele
    // trava no ponto de impacto e e' la que bate.
    return false;
  }
  // rumo atual em graus de mundo (para dividir o carregador)
  rumo() { return idiv(this.s.h, 20); }
}

// True/False angle: o characterdata traz, por tiro, a faixa de mira toda e a
// faixa "true" (campos 3-6 / 9-12 / 15-18). Fora da true o tiro sai com dano
// reduzido; o percentual nao foi achado no .gme, 20% vem dos guias da epoca.
const FALSE_ANGLE_DAMAGE = 0.8;
const anguloFalso = (nome, tipo, ang) => {
  const m = mobileOriginal(nome);
  const f = m && m.miraTrue && m.miraTrue[tipo];
  return !!f && (ang < f[0] || ang > f[1]);
};

// Parametros da divisao do Kalsiddon por tiro (gunboundDados).
const kalsDivisao = (tipo) => MOBILES.Kalsiddon.tiros[tipo][0].div;

// Divisor do raio do Thor por projetil (campo +0x328 do projetil, gravado
// pelas fabricas 0x42f2e0 [S1/S2, parametro 14] e 0x431870 [SS, parametro 13]
// a partir das funcoes de disparo de cada mobile). 0x436180 aplica no dano do
// raio gerado por aquele projetil: 0 => x2, senao / divisor. Em geral e' a
// quantidade de projeteis do tiro, para o raio do clima nao multiplicar o dano.
// [S1, S2, SS] por mobile do original.
const THOR_DIV = {
  Armor: [1, 2, 1], Mage: [1, 2, 1], Nak: [1, 1, 1], Trico: [1, 3, 1],
  Bigfoot: [4, 6, 8], Boomer: [1, 4, 1], "Raon Launcher": [3, 2, 1],
  Lightning: [1, 1, 1], "J.D": [1, 1, 1], "A.Sate": [1, 1, 1], Ice: [1, 1, 1],
  Turtle: [1, 2, 1], Grub: [1, 4, 1], Dragon: [1, 4, 1], Knight: [1, 1, 1],
  Aduka: [1, 1, 0], Kalsiddon: [1, 1, 1], Frog: [1, 2, 1],
};
const thorDivDe = (nome, tipo) => {
  const t = nome && THOR_DIV[nome];
  return t && t[tipo] != null ? t[tipo] : 1;
};
// Dano do raio ja com o divisor do projetil que o gerou.
const thorDanoRaio = (xp, div) => {
  const d = thorDano(xp);
  return div === 0 ? d * 2 : Math.trunc(d / (div > 0 ? div : 1));
};

module.exports = {
  thorNivel,
  thorDano,
  thorDivDe,
  thorDanoRaio,
  tipoTiroDe,
  corpoDe,
  desvioInclinacao,
  acertaCorpo,
  danoExplosao,
  danoOriginal,
  nomeOriginalDe,
  intervalosAtras,
  FALSE_ANGLE_DAMAGE,
  anguloFalso,
  Homing,
  kalsDivisao,
  atanTab,
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
