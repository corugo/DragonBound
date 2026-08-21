var Types = require('./gametypes');
var Logger = require('./lib/logger');
var Message = require('./lib/message');
var Player = require('./player');
var Room = require('./room');

// Bot
module.exports = class Bot {
    constructor(player) {
        this.login_complete = false;
        this.player = player;
        this.user_id = null;
        this.last_message = 0;
        this.strik = 0;
        this.room_number = 0;
        this.is_muted = false;
        this.location_type = Types.LOCATION.CHANNEL;
        this.hasEnteredGame = false;
        this.room = null;
        this.gameserver = null;
        this.saludo = false;
        var self = this;
        this.timershot = null;

        this.objetivo = null;
        this.pfinal = null;
        this.base_ang = 60;
        this.ss_count = 0;
        this.has_teleported = false; // Agregar este flag
        //this.player.mobile = Types.MOBILE.BOOMER;
    }

    init() {
        this.objetivo = null;
        this.pfinal = null;
        this.base_ang = 60;
        this.ss_count = 0;
        this.saludo = false;
        this.is_alive = 1;
        //this.player.mobile = Types.MOBILE.BOOMER;
    }

    chat() {
        var self = this;
        if (this.saludo === false) {
            this.saludo = true;
        }
    }

    dead() {
        var self = this;
        self.player.is_alive = 0;
        self.room.game.checkDead();
    }

   turn() {
        var self = this;
        // Bot de debug: não atira, só passa a vez (após um pequeno atraso).
        if (self.passive) {
            setTimeout(function () {
                if (self.room && self.room.game) self.room.game.gamePass(self);
            }, 1500);
            return;
        }
        var time = 0;
        var type = 0;
        self.player.body = 0;
        self.player.look = 0;
        self.player.ang = 60;
        self.objetivo = null;

        var closestDistance = Infinity;
        var closestPlayer = null;

        // Mira o inimigo mais próximo do TIME OPOSTO (humano ou bot), não sempre o time A.
        self.room.forPlayers(function (account) {
            if (typeof account === 'undefined' || account === null) return;
            if (account.player.team === self.player.team) return;
            if (account.player.is_alive === 1) {
                var distance = Math.sqrt(
                    Math.pow(account.player.x - self.player.x, 2) +
                    Math.pow(account.player.y - self.player.y, 2)
                );
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPlayer = account;
                }
            }
        });

        self.objetivo = closestPlayer;
        if (self.room === null) {
            Logger.debug("room exist");
            return null;
        }

        if (self.room.game === null) {
            Logger.debug("game exist");
            return null;
        }


        var map = self.room.game.map;
        if (self.player.x > map.w || self.player.y > map.h) {
            self.player.is_alive = 0;
        }
        var yf = map.GetUnder(self.player.x, self.player.y);
        if (yf === 0)
            self.player.is_alive = 0;
        else
            self.player.y = yf;

        if (self.player.is_alive === 0) {
            Logger.debug("player is_alive");
            self.room.game.gamePass(self);
        } else {
            if (typeof (self.objetivo) != 'undefined' && self.objetivo !== null) {
                // Antes de mirar: reposiciona (sai de cima de outro / busca a rampa).
                self.repositionBeforeShot();
                self.player.body = self.room.game.map.GetAngle(self.player.x, self.player.y);
                var dist = Math.sqrt(Math.pow(self.objetivo.player.x - self.player.x, 2) + Math.pow(self.objetivo.player.y - self.player.y, 2));
                // Aduka atira de COSTAS: encara o lado oposto ao alvo (look invertido).
                var isAdukaLook = self.player.mobile === Types.MOBILE.ADUKA;
                if (self.player.x > self.objetivo.player.x) {
                    self.player.look = isAdukaLook ? 1 : 0;
                } else {
                    self.player.look = isAdukaLook ? 0 : 1;
                }
                var maxHp = 1000; 
                var healthPercentage = (self.player.hp / maxHp) * 100;
                
                if (healthPercentage <= 30 && !self.has_teleported && !(self.room && self.room.is_tele_disabled === 1)) {
                    self.has_teleported = true;
                    self.player.TELEPORT = 1;
                    if (typeof Types.ITEM_TELEPORT !== 'undefined') {
                        self.player.itemUsed = Types.ITEM_TELEPORT;
                    }
                    
                    if (self.gameserver.name !== "Holiday") {
                        self.gameserver.pushBroadcastChat(
                            self.room
                        );
                    }
                    var escapeDistance = 400; 
                    var escapeX, escapeY;
                    var escapeAngle;
                    if (self.player.x < self.objetivo.player.x) {
                        escapeX = self.player.x - escapeDistance;
                        escapeAngle = 135; 
                        self.player.look = 0;
                    } else {
                        escapeX = self.player.x + escapeDistance;
                        escapeAngle = 45;
                        self.player.look = 1;
                    }
                    if (escapeX < 50) escapeX = 50;
                    if (escapeX > map.w - 50) escapeX = map.w - 50;
                    escapeY = map.GetUnder(escapeX, 0);
                    if (escapeY === 0 || escapeY === undefined) {
                        escapeX = self.player.x < map.w / 2 ? map.w - 200 : 200;
                        escapeY = map.GetUnder(escapeX, 0);
                    }
                    var pfx = self.CalcularEscape(escapeX, escapeY, escapeAngle);
                    if (typeof (pfx.power) === 'undefined')
                        pfx.power = 400;
                        
                    if (self.room.game) {
                        var shoot_timer = setTimeout(function () {
                            if (self.room.game) {
                                self.room.game.gameShoot(
                                    self.player.x, 
                                    self.player.y, 
                                    self.player.body, 
                                    self.player.look, 
                                    escapeAngle, 
                                    pfx.power, 
                                    time, 
                                    0, 
                                    self
                                );
                            }
                            shoot_timer = null;
                        }, 4000);
                    }
                    return; 
                }
                
                var pfx = self.Calcular(dist);
                if (typeof (pfx.power) === 'undefined')
                    pfx.power = 400;
                    
                if (self.room.game) {
                    var shoot_timer = setTimeout(function () {
                        if (self.room.game) {
                            if (pfx.found) {
                                if (self.ss_count <= 0 && self.objetivo.player.hp < 600) {
                                    type = 2;
                                    self.ss_count = 5;
                                    if (self.gameserver.name !== "Holiday")
                                        self.gameserver.pushBroadcastChat(new Message.chatResponse(self, "Te matare maldito desperdicio de oxigeno -_-", Types.CHAT_TYPE.BOT), self.room);
                                } else {
                                    if (self.objetivo.player.hp < 800) {
                                        type = 1;
                                    } else {
                                        type = 0;
                                    }
                                }
                            }
                            // S1 desabilitado (ex.: Aduka): bot nunca usa T1 (type 0), sobe para T2 (type 1).
                            if (self.room && self.room.is_s1_disabled === 1 && type === 0) type = 1;
                            try {
                              self.room.game.gameShoot(self.player.x, self.player.y, self.player.body, self.player.look, self.player.ang, pfx.power, time, type, self);
                            } catch (ge) {
                            }
                            self.ss_count--;
                        }
                        shoot_timer = null;
                    }, 4000);
                }
            } else {
                if (self.room) {
                    if (self.room.game) {
                        if (self.objetivo === null) {
                            // Sin objetivo: verifica fin de juego y de todas formas pasa el turno (evita congelar).
                            self.room.game.checkDead();
                            self.room.game.gamePass(self);
                        } else {
                            self.room.game.gamePass(self);
                        }
                    }
                }
            }
        }
    }

    // ===== Movimentação da IA (andar antes de atirar) =====
    // Constantes ajustáveis:
    _walkConfig() {
        return {
            MOBILE_W: 36,        // largura do carrinho
            HALF_MOBILE: 18,     // meio carrinho
            SEPARATION: 54,      // distância mínima de separação entre unidades (3x meio carrinho)
            WALK_BUDGET: 170,    // quanto pode andar por rodada (px)
            MAP_MARGIN: 45,      // margem de borda no andar normal (não cair da ponta)
            RAMP_EDGE: 12,       // margem menor SÓ ao subir a rampa (chegar bem na quina)
            MAX_STEP: 22,        // degrau vertical máximo por px ao andar normal
            RAMP_CLIMB_STEP: 70, // degrau permitido ao SUBIR a rampa (bem íngreme, como o player sobe)
            FALL: 120,           // quanto pode DESCER por px (cair pra rampa seguinte / dip)
            RAMP_TRIGGER: 500   // distância da ponta em que o bot já começa a rumar pra rampa
        };
    }

    // Anda pelo terreno em direção a targetX, limitado por budget, respeitando
    // inclinação (para em parede/íngreme) e borda do mapa. Retorna px andados.
    walkTo(targetX, budget, maxStep, edgeMargin) {
        var self = this;
        if (!self.room || !self.room.game || !self.room.game.map) return 0;
        var cfg = self._walkConfig();
        var step = typeof maxStep === "number" ? maxStep : cfg.MAX_STEP;
        var margin = typeof edgeMargin === "number" ? edgeMargin : cfg.MAP_MARGIN;
        var map = self.room.game.map;
        var W = map.w;
        var dir = targetX > self.player.x ? 1 : -1;
        // Vira o carrinho para a DIREÇÃO do movimento enquanto anda (look=1 direita, 0 esquerda).
        self.player.look = dir > 0 ? 1 : 0;
        var moved = 0;
        var sinceUpdate = 0;
        while (moved < budget) {
            var nx = self.player.x + dir;
            if (nx < margin || nx > W - margin) break;                 // não sair pela borda
            // Janela assimétrica: subida limitada a `step` (parede bloqueia), mas descida
            // permitida bem mais (o carrinho cai/desce a rampa seguinte).
            var ny = map.GetUnder(nx, self.player.y - step, step + cfg.FALL);
            if (typeof ny === "undefined") break;                     // sem chão na janela
            if (self.player.y - ny > step) break;                     // SUBIDA íngreme = parede
            self.player.x = nx;
            self.player.y = ny;
            moved++;
            sinceUpdate++;
            if (sinceUpdate >= 6) {                                    // envia posição ao longo do caminho
                sinceUpdate = 0;
                self.broadcastMove();
            }
            if (Math.abs(self.player.x - targetX) <= 1) break;        // chegou
        }
        return moved;
    }

    broadcastMove() {
        var self = this;
        if (!self.room || !self.gameserver) return;
        self.player.game_position = self.player.position;
        self.player.move();
        self.gameserver.pushToRoom(self.room.id, new Message.gameUpdate(self), null);
    }

    repositionBeforeShot() {
        var self = this;
        if (!self.room || !self.room.game || !self.room.game.map) return;
        var cfg = self._walkConfig();
        var map = self.room.game.map;

        // 1) ANTI-SOBREPOSIÇÃO: se estiver colado em outra unidade viva, anda pra longe.
        var nearest = null, nd = Infinity;
        self.room.forPlayers(function (acc) {
            if (!acc || acc === self) return;
            if (!acc.player || acc.player.is_alive !== 1) return;
            if (acc.player.user_id === self.player.user_id) return;
            var dx = Math.abs(acc.player.x - self.player.x);
            if (dx < nd) { nd = dx; nearest = acc; }
        });
        if (nearest && nd < cfg.SEPARATION) {
            var away = self.player.x >= nearest.player.x ? 1 : -1;
            var targetX = nearest.player.x + away * (cfg.SEPARATION + 4);
            self.walkTo(targetX, cfg.WALK_BUDGET);
            self.broadcastMove();
            return; // prioriza separar; rampa fica pra próxima rodada
        }

        // 2) RAMPA DO META MINE (só Aduka, mapa 9): se perto da ponta, sobe na rampa.
        if (self.room.game_mode === Types.GAME_MODE.ADUKA && self.room.map === 9) {
            var W = map.w;
            var distLeft = self.player.x;
            var distRight = W - self.player.x;
            var edgeDir = distLeft <= distRight ? -1 : 1;
            var distEdge = Math.min(distLeft, distRight);
            var trig = distEdge > cfg.MAP_MARGIN + 5 && distEdge < cfg.RAMP_TRIGGER + cfg.MOBILE_W * 2;
            // Analisa as outras unidades em relação a ESTA rampa (o lado que ele busca):
            var onRampDist = cfg.RAMP_EDGE + cfg.MOBILE_W; // <= isso = já está NA rampa/quina
            var someoneOnRamp = false; // alguém já na rampa
            var someoneInPath = false; // alguém no trecho entre ele e a rampa (mais perto)
            self.room.forPlayers(function (acc) {
                if (!acc || acc === self || !acc.player || acc.player.is_alive !== 1) return;
                if (acc.player.user_id === self.player.user_id) return;
                var theirDist = edgeDir < 0 ? acc.player.x : (W - acc.player.x);
                if (theirDist <= onRampDist) someoneOnRamp = true;
                if (theirDist < distEdge - 1) someoneInPath = true;
            });
            var toRampDist = distEdge - cfg.RAMP_EDGE;             // ~distância até a rampa
            var reachableThisTurn = toRampDist <= cfg.WALK_BUDGET; // chega em 1 turno?
            // Vai se: ninguém na rampa E (chega já OU caminho livre).
            var go = !someoneOnRamp && (reachableThisTurn || !someoneInPath);
            if (trig && go) {
                var targetX = edgeDir < 0 ? cfg.RAMP_EDGE : W - cfg.RAMP_EDGE;
                // Sobe a rampa (degrau íngreme + margem de borda menor pra chegar na quina).
                var walked = self.walkTo(targetX, cfg.WALK_BUDGET, cfg.RAMP_CLIMB_STEP, cfg.RAMP_EDGE);
                // Só "volta pra ter ângulo" se estiver TOTALMENTE travado (não andou nada) —
                // aí a rampa é inalcançável mesmo. Se andou algo, segue progredindo nas próximas.
                if (walked === 0 && self.objetivo) {
                    var backDir = self.objetivo.player.x > self.player.x ? 1 : -1;
                    self.walkTo(self.player.x + backDir * cfg.MOBILE_W, Math.floor(cfg.WALK_BUDGET / 2), cfg.MAX_STEP);
                }
                self.broadcastMove();
            }
        }
    }

    CalcularEscape(targetX, targetY, ang) {
        var self = this;
        var mobile_data = Types.MOBILES[self.player.mobile];
        var b0 = Math.round(parseInt(Math.cos(self.room.game.wind_angle * Math.PI / 180) * self.room.game.wind_power * mobile_data.by)) / 100;
        var b1 = Math.round(parseInt(Math.sin(self.room.game.wind_angle * Math.PI / 180) * self.room.game.wind_power * mobile_data.by - mobile_data.bx)) / 100;
        this.ax = Math.round(0 - b0);
        this.ay = Math.round(mobile_data.by - b1);
        
        if (self.room.game.wind_power === 0) {
            this.ax = 0;
            this.ay = mobile_data.by;
        }
        
        var dis = 0;
        if (self.player.look === 0) {
            ang = 180 - ang;
            dis = -11;
        } else {
            dis = 11;
        }
        ang -= self.player.body;
        
        var point = {
            x: self.player.x + dis,
            y: self.player.y - 28
        };
        
        this.pfinal = self.rotatePoint(point, {
            x: self.player.x,
            y: self.player.y
        }, self.player.body);
        var found = false;
        var tmppower = 700; 
        
        for (var i = 500; i < 900; i += 10) {
            this.power = i;
            this.v = new Vector2(ang, this.power);
            
            for (var t = 0; t < 2000; t++) {
                var f = self.getPosAtTime(t);
                var cl = Math.sqrt(Math.pow(targetX - f.x, 2) + Math.pow(targetY - f.y, 2));
                
                if (cl < 100) {
                    tmppower = i;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        
        return {
            power: parseInt(tmppower / 234 * 100),
            found: found
        };
    }
    update() {
        if (this.room && this.room.game && this.room.game.map) {
            var map = this.room.game.map;
            var yf = map.GetUnder(this.player.x, this.player.y);
            if (yf === 0) {
                this.player.is_alive = 0;
            } else {
                this.player.y = yf;
            }
            this.player.move();
            return yf;
        }
        return null;
    }

    Calcular(xv) {
        var self = this;
        var mobile_data = Types.MOBILES[self.player.mobile];
        var b0 = Math.round(parseInt(Math.cos(self.room.game.wind_angle * Math.PI / 180) * self.room.game.wind_power * mobile_data.by)) / 100;
        var b1 = Math.round(parseInt(Math.sin(self.room.game.wind_angle * Math.PI / 180) * self.room.game.wind_power * mobile_data.by - mobile_data.bx)) / 100;
        this.ax = Math.round(0 - b0);
        this.ay = Math.round(mobile_data.by - b1);
        if (self.wind_power === 0) {
            this.ax = 0;
            this.ay = mobile_data.by;
        }
        // Aduka atira em arco alto/pra trás (faixa de ângulo ~110-170), e usa outro
        // offset de boca. Para ele, varremos vários ângulos-base; para os demais,
        // mantemos o base_ang único (comportamento original).
        var isAduka = self.player.mobile === Types.MOBILE.ADUKA;
        var dis = 0;
        if (self.player.look === 0) dis = isAduka ? 26 : -11;
        else dis = isAduka ? -26 : 11;
        var point = {
            x: self.player.x + dis,
            y: self.player.y - 28
        };
        this.pfinal = self.rotatePoint(point, {
            x: self.player.x,
            y: self.player.y
        }, self.player.body);

        var bases;
        if (isAduka) {
            // Só usa a faixa de mira VÁLIDA do mobile (minang..maxang), igual ao player.
            // (O terreno já entra via `- self.player.body`.)
            var lo = typeof mobile_data.minang === "number" ? mobile_data.minang : 110;
            var hi = typeof mobile_data.maxang === "number" ? mobile_data.maxang : 170;
            bases = [];
            for (var ab = lo; ab <= hi; ab += 2) bases.push(ab);
        } else {
            bases = [this.base_ang];
        }

        var found = false;
        var tmppower = 400;
        var chosenBase = this.base_ang;
        var bestCl = Infinity;
        var bestPower = 400;
        var bestBase = bases[0];
        for (var bi = 0; bi < bases.length && !found; bi++) {
            var base = bases[bi];
            var ang = base;
            if (self.player.look === 0) ang = 180 - ang;
            ang -= self.player.body;
            for (var i = 0; i < 900; i++) {
                this.power = i;
                this.v = new Vector2(ang, this.power);
                for (var t = 0; t < 2000; t++) {
                    var f = self.getPosAtTime(t);
                    var cl = Math.sqrt(Math.pow(self.objetivo.player.x - f.x, 2) + Math.pow(self.objetivo.player.y - f.y, 2));
                    if (cl < bestCl) {
                        bestCl = cl;
                        bestPower = i;
                        bestBase = base;
                    }
                    if (cl <= 15) {
                        found = true;
                        tmppower = i;
                        chosenBase = base;
                        break;
                    }
                }
                if (found) break;
            }
        }
        if (!found) {
            tmppower = bestPower;
            chosenBase = bestBase;
        }
        // Ângulo enviado ao gameShoot (ele reaplica o espelho por look).
        self.player.ang = chosenBase;
        if (isAduka) {
            this.base_ang = chosenBase;
        } else if (found === false) {
            if (this.base_ang <= 20) {
                this.base_ang += 10;
            } else if (this.base_ang >= 60) {
                this.base_ang -= 10;
            }
        }
        return {
            power: parseInt(tmppower / 234 * 100),
            found: found
        };
    }

    RadToAngle(a) {
        return 180 * a / Math.PI;
    }

    AngleToRad(p) {
        return p * Math.PI / 180;
    }

    getPosAtTime(a) {
        a /= 485;
        return {
            x: Math.ceil(this.pfinal.x + this.v.x * a + this.ax * a * a / 2),
            y: Math.ceil(this.pfinal.y + this.v.y * a + this.ay * a * a / 2)
        };
    }

    rotatePoint(point, center, angle) {
        var px = {};
        angle = (angle) * (Math.PI / 180); // Convert to radians
        px.x = Math.cos(angle) * (point.x - center.x) - Math.sin(angle) * (point.y - center.y) + center.x;
        px.y = Math.sin(angle) * (point.x - center.x) + Math.cos(angle) * (point.y - center.y) + center.y;
        px.x = Math.floor(px.x);
        px.y = Math.floor(px.y);
        return px;
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }


    saveWinDB() {

    }
};

function Vector2(a, b) {
    this.ang = a;
    this.size = b;
    this.x = Math.cos(a * Math.PI / 180) * b;
    this.y = -Math.sin(a * Math.PI / 180) * b;
}
