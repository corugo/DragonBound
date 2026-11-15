var Types = require('./gametypes');
var Logger = require('./lib/logger');
var Message = require('./lib/message');
var BotChat = require('./lib/botChat');
var BoomerPhysics = require('./lib/boomerPhysics');
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
        this._lastAim = null;
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
        // Bot de debug: recebe um delay altissimo em vez de jogar. A turn_list e
        // ordenada por delay crescente, entao com este valor ele fica
        // permanentemente no fim da fila e a vez nunca volta para ele - o humano
        // joga turno atras de turno. O gamePass so acontece nesta primeira vez
        // (quando o sorteio inicial da turn_list o coloca na frente), para a
        // partida nao travar esperando um bot que nunca atira.
        if (self.passive) {
            self.player.addDelay(Bot.DEBUG_DELAY);
            setTimeout(function () {
                if (self.room && self.room.game) self.room.game.gamePass(self);
            }, 300);
            return;
        }
        var time = 0;
        var type = 0;
        self.player.body = 0;
        self.player.look = 0;
        self.player.ang = 60;
        self.objetivo = null;

        var closestPlayer = null;

        // Levanta os inimigos vivos do TIME OPOSTO (humano ou bot) junto com os
        // motivos que desaconselham mirar em cada um.
        var enemies = [];
        self.room.forPlayers(function (account) {
            if (typeof account === 'undefined' || account === null) return;
            if (account.player.team === self.player.team) return;
            if (account.player.is_alive !== 1) return;
            enemies.push({
                acc: account,
                dist: Math.sqrt(
                    Math.pow(account.player.x - self.player.x, 2) +
                    Math.pow(account.player.y - self.player.y, 2)
                ),
                mirror: self._mirrorBetween(account.player),
                ally: self._allyAtSamePosition(account.player),
            });
        });

        if (enemies.length > 0) {
            // Espelho na frente de TODOS: nao ha tiro possivel. Passa a vez
            // gastando so 1 segundo, para nao acumular delay a toa.
            var livres = enemies.filter(function (e) { return !e.mirror; });
            if (livres.length === 0) {
                BotChat.say(self, 'pass_mirror', {}, self.room);
                self.passWithMinimalDelay();
                return;
            }
            // Evita quem esta com um aliado em cima (fogo amigo). Se TODOS
            // estiverem assim, nao ha tiro limpo: passa a vez gastando 2s.
            var semAliado = livres.filter(function (e) { return !e.ally; });
            if (semAliado.length === 0) {
                BotChat.say(self, 'pass_ally', {}, self.room);
                self.passWithMinimalDelay(2);
                return;
            }
            livres = semAliado;
            livres.sort(function (a, b) { return a.dist - b.dist; });
            closestPlayer = livres[0].acc;
        }

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
                // O bot ANDA de verdade, em tempo real, entao o resto do turno so'
                // acontece quando o trajeto termina - dai o callback.
                var _turnStart = Date.now();
                self.repositionBeforeShot(function (walkedPx) {
                if (!self.room || !self.room.game || self.player.is_alive !== 1) return;
                // Delay realista (so no modo Aduka): o servidor converte este 'time'
                // em pontos de delay (1s = 10 pts). Antes o bot mandava sempre 0, ou
                // seja, o minimo possivel - por isso jogava muito mais que o humano.
                if (self.room && self.room.game_mode === Types.GAME_MODE.ADUKA) {
                    time = Bot.rollShotSeconds(walkedPx || 0);
                }
                // Ocupa o turno pelo mesmo tempo que vai cobrar de delay, como um
                // humano que fica mirando ate' disparar. Teto de 10s no relogio: se
                // o sorteio deu mais que isso ele atira aos 10s, mas o delay cobrado
                // continua sendo o tempo cheio.
                var _fireIn = Bot.shotDelayMs(time, _turnStart);
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
                
                if (healthPercentage <= 30 && !self.has_teleported && !self.itemsBlocked() && !(self.room && self.room.is_tele_disabled === 1)) {
                    self.has_teleported = true;
                    self.player.TELEPORT = 1;
                    if (typeof Types.ITEM_TELEPORT !== 'undefined') {
                        self.player.itemUsed = Types.ITEM_TELEPORT;
                    }
                    
                    // Antes: pushBroadcastChat(self.room) passava a SALA como mensagem e
                    // estourava em room.serialize(), abortando o turno do bot com pouca vida.
                    BotChat.say(self, 'teleport', {}, self.room);
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
                    pfx.power = Bot.applyAimError(pfx.power, self.player.rank);
                        
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
                        }, _fireIn);
                    }
                    return;
                }
                
                var pfx = self.Calcular(dist);
                if (typeof (pfx.power) === 'undefined')
                    pfx.power = 400;
                // Erro de mira conforme o rank do bot (sem isto a forca e' exata).
                // Repetindo o MESMO tiro (mesmo alvo, mesmo vento, ninguem se
                // moveu), o bot ja se corrigiu no turno anterior e acerta - e' o
                // que um jogador faz depois de errar uma vez.
                var _aimK = self._aimKey();
                if (!self._sameAimAsLast(_aimK))
                    pfx.power = Bot.applyAimError(pfx.power, self.player.rank);
                self._lastAim = _aimK;
                    
                if (self.room.game) {
                    var shoot_timer = setTimeout(function () {
                        if (self.room.game) {
                            if (pfx.found) {
                                // Em sudden death ninguem mais usa SS (todos os bots).
                                var _sudden = !!(self.room && self.room.game && self.room.game.suddenShoot);
                                // Alvo fraco: DUAL (duas rajadas de T2) no lugar do SS.
                                // O SS nao serve para dano bruto - ele existe para pegar
                                // mais de um inimigo ou acertar o mesmo duas vezes pelo
                                // tornado. Para finalizar um alvo sozinho o Dual rende
                                // mais. So cai no SS se nao houver Dual no inventario.
                                if (!_sudden && self.objetivo.player.hp < 600 && self.consumeDual()) {
                                    BotChat.say(self, 'dual', { alvo: self.objetivo.player.game_id }, self.room);
                                    type = 1;
                                } else if (!_sudden && self.ss_count <= 0 && self.objetivo.player.hp < 600) {
                                    type = 2;
                                    self.ss_count = 5;
                                    BotChat.say(self, 'ss', { alvo: self.objetivo.player.game_id }, self.room);
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
                    }, _fireIn);
                }
                });
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

    // Um passo de 1px na direcao dir. Devolve false quando trava (parede,
    // borda do mapa ou sem chao na janela).
    _stepPixel(dir, step, margin) {
        var self = this;
        var cfg = self._walkConfig();
        var map = self.room.game.map;
        var nx = self.player.x + dir;
        if (nx < margin || nx > map.w - margin) return false;   // nao sair pela borda
        // Janela assimetrica: subida limitada a "step" (parede bloqueia), mas descida
        // permitida bem mais (o carrinho cai/desce a rampa seguinte).
        var ny = map.GetUnder(nx, self.player.y - step, step + cfg.FALL);
        if (typeof ny === "undefined") return false;             // sem chao na janela
        if (self.player.y - ny > step) return false;             // SUBIDA ingreme = parede
        self.player.x = nx;
        self.player.y = ny;
        return true;
    }

    // Anda pelo terreno em direcao a targetX, limitado por budget, respeitando
    // inclinacao e borda do mapa. ASSINCRONO: avanca poucos px por vez com
    // intervalo real entre os envios, para o cliente ANIMAR o trajeto seguindo
    // o relevo. Enviando tudo de uma vez o sprite apenas desliza em linha reta
    // ate o destino (parecia teleporte). O ritmo copia o de um humano: o
    // cliente interpola a WALK_SPEED = 50px/s, entao 6px a cada 120ms bate
    // exatamente com a velocidade de caminhada do jogo.
    walkToAsync(targetX, budget, maxStep, edgeMargin, done) {
        var self = this;
        var finish = function (n) { if (typeof done === "function") done(n); };
        if (!self.room || !self.room.game || !self.room.game.map) return finish(0);
        var cfg = self._walkConfig();
        var step = typeof maxStep === "number" ? maxStep : cfg.MAX_STEP;
        var margin = typeof edgeMargin === "number" ? edgeMargin : cfg.MAP_MARGIN;
        var dir = targetX > self.player.x ? 1 : -1;
        // Vira o carrinho para a DIRECAO do movimento enquanto anda.
        self.player.look = dir > 0 ? 1 : 0;
        var moved = 0;
        var tick = function () {
            // A partida pode ter acabado (ou o bot morrido) no meio do trajeto.
            if (!self.room || !self.room.game || self.player.is_alive !== 1)
                return finish(moved);
            var sub = 0;
            var travou = false;
            while (sub < Bot.WALK_STEP_PX && moved < budget) {
                if (!self._stepPixel(dir, step, margin)) { travou = true; break; }
                moved++;
                sub++;
                if (Math.abs(self.player.x - targetX) <= 1) { travou = true; break; }
            }
            if (sub > 0) self.broadcastMove();
            if (travou || moved >= budget) return finish(moved);
            setTimeout(tick, Bot.WALK_STEP_MS);
        };
        tick();
    }
    broadcastMove() {
        var self = this;
        if (!self.room || !self.gameserver) return;
        self.player.game_position = self.player.position;
        self.player.move();
        self.gameserver.pushToRoom(self.room.id, new Message.gameUpdate(self), null);
    }

    // Ha um ALIADO praticamente em cima deste inimigo? O estouro pegaria o
    // proprio time, entao o bot prefere mirar em outro. A tolerancia e' a largura
    // do carrinho: a esta distancia os dois estao literalmente sobrepostos.
    _allyAtSamePosition(targetPlayer) {
        var self = this;
        if (!targetPlayer || !self.room) return false;
        var TOL = self._walkConfig().MOBILE_W;
        var found = false;
        self.room.forPlayers(function (account) {
            if (found || !account || !account.player) return;
            if (account.player.team !== self.player.team) return;
            if (account.player.user_id === self.player.user_id) return;
            if (account.player.is_alive !== 1) return;
            if (
                Math.abs(account.player.x - targetPlayer.x) <= TOL &&
                Math.abs(account.player.y - targetPlayer.y) <= TOL
            )
                found = true;
        });
        return found;
    }

    // Existe um espelho (clima id 7) na faixa horizontal entre o bot e este alvo?
    // O espelho reflete o tiro ao cruzar a coluna dele, entao o projetil nunca
    // chegaria ao inimigo - nao adianta mirar.
    _mirrorBetween(targetPlayer) {
        var self = this;
        var g = self.room && self.room.game;
        if (!g || !g.weather || !Array.isArray(g.weather.active)) return false;
        if (!targetPlayer) return false;
        var mirrorId = Types.WEATHERS.list.mirror.id;
        var x1 = Math.min(self.player.x, targetPlayer.x);
        var x2 = Math.max(self.player.x, targetPlayer.x);
        for (var i = 0; i < g.weather.active.length; i++) {
            var force = g.weather.active[i];
            if (!force || force.id !== mirrorId) continue;
            if (force.px >= x1 && force.px <= x2) return true;
        }
        return false;
    }

    // Passa a vez gastando poucos segundos de delay. O gamePass cobra
    // game.mobileDelay, que fica com o valor do ultimo disparo - por isso
    // ajustamos antes, senao o bot herdaria o delay cheio de um tiro que ele nem
    // chegou a dar. (1s = 10 pontos de delay.)
    passWithMinimalDelay(secs) {
        var self = this;
        var g = self.room && self.room.game;
        if (!g) return;
        var s = typeof secs === 'number' && secs > 0 ? secs : 1;
        var md = Types.MOBILES[self.player.mobile];
        g.mobileDelay = (md && md.delay ? md.delay : 0) + s * 10;
        setTimeout(function () {
            if (self.room && self.room.game) self.room.game.gamePass(self);
        }, 300);
    }

    // Modo SCORE/ADUKA: escolhe onde reviver e volta ao jogo.
    // Prioridade: a PONTA do lado com MENOS INIMIGOS (dali saem os angulos
    // altos, mesma logica de buscar a rampa, e ele volta longe do fogo em vez
    // de nascer no meio do time adversario); se a ponta estiver ocupada, um
    // ponto livre o mais proximo possivel dela.
    reviveNow() {
        var self = this;
        var g = self.room && self.room.game;
        if (!g || !g.map || !self.player) return false;
        var map = g.map;
        var cfg = self._walkConfig();
        var meuTime = self.player.team;

        // Conta inimigos e aliados vivos em cada metade do mapa.
        var meio = map.w / 2;
        var inimEsq = 0, inimDir = 0;
        var aliEsq = 0, aliDir = 0;
        self.room.forPlayers(function (acc) {
            if (!acc || !acc.player) return;
            if (acc.player.user_id === self.player.user_id) return;
            if (acc.player.is_alive !== 1) return;
            var naEsq = acc.player.x < meio;
            if (acc.player.team !== meuTime) {
                if (naEsq) inimEsq++; else inimDir++;
            } else {
                if (naEsq) aliEsq++; else aliDir++;
            }
        });
        // Criterio principal: a metade com MENOS inimigos. Empatando, a que tem
        // mais aliados; persistindo o empate, o lado onde ele ja estava.
        var lado;
        if (inimEsq !== inimDir) lado = inimEsq < inimDir ? -1 : 1;
        else if (aliEsq !== aliDir) lado = aliEsq > aliDir ? -1 : 1;
        else lado = self.player.x < meio ? -1 : 1;

        var ocupado = function (x, y) {
            var achou = false;
            self.room.forPlayers(function (acc) {
                if (achou || !acc || !acc.player) return;
                if (acc.player.user_id === self.player.user_id) return;
                if (acc.player.is_alive !== 1) return;
                if (Math.abs(acc.player.x - x) < cfg.SEPARATION) achou = true;
            });
            return achou;
        };
        var chaoEm = function (x) {
            if (x < cfg.MAP_MARGIN || x > map.w - cfg.MAP_MARGIN) return null;
            // GetUnder devolve (terreno - 1). Onde o terreno encosta no topo da
            // tela - as paredes laterais do mapa - isso vira y = -1, coordenada
            // negativa que o scoreRevive rejeita. Era por isso que TODO bot caia
            // no fallback e voltava num ponto aleatorio em vez da ponta.
            var y = map.GetUnder(x, 0);
            if (typeof y === 'undefined') return null;
            if (y < 1 || y >= map.h) return null;
            return y;
        };

        var candidatos = [];
        // 1) a ponta do lado escolhido
        candidatos.push(lado < 0 ? cfg.RAMP_EDGE + cfg.MOBILE_W : map.w - cfg.RAMP_EDGE - cfg.MOBILE_W);
        // 2) varre do lado escolhido para o centro
        for (var d = 0; d < map.w / 2; d += 30) {
            candidatos.push(lado < 0 ? cfg.MAP_MARGIN + d : map.w - cfg.MAP_MARGIN - d);
        }

        for (var i = 0; i < candidatos.length; i++) {
            var x = Math.round(candidatos[i]);
            var y = chaoEm(x);
            if (y === null) continue;
            if (ocupado(x, y)) continue;
            return g.scoreRevive(self, x, y);
        }
        // Nada livre: aceita qualquer ponto com chao, mesmo perto de alguem.
        for (var j = 0; j < candidatos.length; j++) {
            var x2 = Math.round(candidatos[j]);
            var y2 = chaoEm(x2);
            if (y2 !== null) return g.scoreRevive(self, x2, y2);
        }
        return false;
    }

    // Gasta um dos Duals do inventario (item = 0; -1 marca slot ja usado),
    // exatamente como o fluxo do jogador humano em account.js: marca o slot,
    // liga a flag DUAL e registra o itemUsed (que cobra os 550 de delay).
    // Clima "no items" (WEATHERS.list.no_items, id 2) trava o uso de itens. O
    // cliente desabilita os botoes para o jogador humano, mas o bot fala direto
    // com o servidor - que nao valida isso - e acabava usando item mesmo assim.
    itemsBlocked() {
        var g = this.room && this.room.game;
        if (!g || !g.weather || !g.weather.current) return false;
        return g.weather.current.id === Types.WEATHERS.list.no_items.id;
    }

    consumeDual() {
        var self = this;
        var p = self.player;
        if (!p) return false;
        if (self.itemsBlocked()) return false;
        var slot =
            p.item1 === 0 ? 'item1' :
            p.item2 === 0 ? 'item2' :
            p.item3 === 0 ? 'item3' : null;
        if (!slot) return false;
        p[slot] = -1;
        p.DUAL = 1;
        p.itemUsed = Types.ITEM.DUAL;
        return true;
    }

    // Assinatura do tiro: o MESMO inimigo com o MESMO vento. Posicoes nao entram
    // de proposito - se o alvo se deslocou, o bot ja sabe corrigir a mira nele.
    _aimKey() {
        var self = this;
        if (!self.objetivo || !self.objetivo.player) return null;
        if (!self.room || !self.room.game) return null;
        var g = self.room.game;
        // Com forca 0 o angulo do vento nao muda nada na fisica, entao ele e'
        // normalizado: sem isto o bot achava que o vento tinha mudado (so o
        // ponteiro girou) e voltava a errar sem necessidade.
        var wp = g.wind_power;
        return {
            target: self.objetivo.player.user_id,
            wp: wp,
            wa: wp === 0 ? 0 : g.wind_angle,
        };
    }

    // Mesmo alvo + mesmo vento => o bot ja calibrou este tiro no turno anterior
    // e acerta, como um jogador que erra uma vez e corrige na seguinte.
    _sameAimAsLast(k) {
        var p = this._lastAim;
        if (!k || !p) return false;
        return p.target === k.target && p.wp === k.wp && p.wa === k.wa;
    }

    // Devolve quantos px o bot andou nesta rodada (usado para compor o delay).
    repositionBeforeShot(done) {
        var self = this;
        // Assincrono: o trajeto e' percorrido em tempo real (ver walkToAsync),
        // entao o total andado so' e' conhecido no callback.
        var finish = function (n) { if (typeof done === "function") done(n || 0); };
        if (!self.room || !self.room.game || !self.room.game.map) return finish(0);
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
            self.walkToAsync(targetX, cfg.WALK_BUDGET, undefined, undefined, function (movedSep) {
                self.broadcastMove();
                finish(movedSep); // prioriza separar; rampa fica pra próxima rodada
            });
            return;
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
                self.walkToAsync(targetX, cfg.WALK_BUDGET, cfg.RAMP_CLIMB_STEP, cfg.RAMP_EDGE, function (walked) {
                    // Só "volta pra ter ângulo" se estiver TOTALMENTE travado (não andou nada) —
                    // aí a rampa é inalcançável mesmo. Se andou algo, segue progredindo nas próximas.
                    if (walked === 0 && self.objetivo) {
                        var backDir = self.objetivo.player.x > self.player.x ? 1 : -1;
                        self.walkToAsync(
                            self.player.x + backDir * cfg.MOBILE_W,
                            Math.floor(cfg.WALK_BUDGET / 2),
                            cfg.MAX_STEP,
                            undefined,
                            function (extra) {
                                self.broadcastMove();
                                finish(walked + extra);
                            }
                        );
                        return;
                    }
                    self.broadcastMove();
                    finish(walked);
                });
                return;
            }
        }
        return finish(0);
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

    // Boomer: mira com a mesma fisica do servidor (GunBound original, por tick).
    // Varre angulos da faixa do mobile e a barra 0..400; fica com o menor erro.
    CalcularBoomer() {
        var self = this;
        var game = self.room.game;
        var alvo = self.objetivo.player;
        var boca = BoomerPhysics.bocaDoCano(self.player.x, self.player.y, self.player.look, self.player.body);
        var bases = [this.base_ang];
        for (var b = 20; b <= 80; b += 10) if (b !== this.base_ang) bases.push(b);
        var best = { cl: Infinity, barra: 200, base: this.base_ang };
        for (var bi = 0; bi < bases.length; bi++) {
            var ang = bases[bi];
            if (self.player.look === 0) ang = 180 - ang;
            ang -= self.player.body;
            for (var barra = 0; barra <= 400; barra += 2) {
                var fl = new BoomerPhysics.BoomerFlight({
                    x0: boca.x, y0: boca.y, ang: ang, barra: barra,
                    windAng: game.wind_angle, windPower: game.wind_power,
                });
                for (var i = 1; i < 600; i++) {
                    var p = fl.ensure(i);
                    var px = p.x / 256, py = p.y / 256;
                    var cl = Math.sqrt(Math.pow(alvo.x - px, 2) + Math.pow(alvo.y - py, 2));
                    if (cl < best.cl) best = { cl: cl, barra: barra, base: bases[bi] };
                    if (py > alvo.y + 200) break; // ja passou do alvo descendo
                }
                if (best.cl <= 10) break;
            }
            if (best.cl <= 15) break;
        }
        self.player.ang = best.base;
        this.base_ang = best.base;
        return { power: best.barra, found: best.cl <= 15 };
    }

    Calcular(xv) {
        var self = this;
        var mobile_data = Types.MOBILES[self.player.mobile];
        if (self.player.mobile === Types.MOBILE.BOOMER) return self.CalcularBoomer();
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

// Delay aplicado ao bot de /debug. Um turno normal soma algo entre ~300 e ~1500;
// com este valor ele nunca alcanca os demais jogadores dentro de uma partida.
module.exports.DEBUG_DELAY = 100000;

// ---------------------------------------------------------------------------
// Tempo que o bot 'leva' para atirar, em SEGUNDOS INTEIROS (o servidor trunca
// em segundos e converte a 10 pontos de delay por segundo). Antes o bot mandava
// sempre 0 e por isso jogava muito mais vezes que o humano.
//
// ATENCAO: este tempo e CORRIDO desde o inicio do turno (o cliente envia
// get_time() - start_turn_time), nao o que resta no timer da tela. O timer
// mostra a contagem regressiva, entao 5s corridos = 15 no timer.
//
// Peso por segundo: moda em 5s corridos (15 no timer), sendo raro atirar mais
// rapido que isso; acima da moda a cauda decai ate os 20s (limite do turno).
//   P(t<5) ~ 4%   P(t=5) ~ 31%   P(t>5) ~ 65%   media ~ 7,0s
// Ajuste a tabela para recalibrar sem mexer na logica.
var SHOT_SECONDS_WEIGHTS = {
    1: 0.25, 2: 0.25,
    3: 0.75, 4: 2,
    5: 25,
    6: 18, 7: 12, 8: 8, 9: 5, 10: 3,
    11: 1, 12: 1, 13: 1, 14: 1,
    15: 0.5, 16: 0.5, 17: 0.5, 18: 0.5, 19: 0.5, 20: 0.5,
};
var WALK_PX_PER_SECOND = 25;   // 170px (budget cheio) ~ 6,8s
var MAX_SHOT_SECONDS = 20;     // teto: o turno dura 20s (room.turn_time)

// ---------------------------------------------------------------------------
// CAMINHADA. O cliente interpola a posicao de um jogador remoto a WALK_SPEED =
// 50px/s (ver 1023989.js). Mandando o trajeto inteiro de uma vez o sprite so'
// desliza em linha reta ate' o destino - parecia teleporte. Enviando 6px a cada
// 120ms o passo do bot fica identico ao de um humano e o carrinho acompanha o
// relevo. Um humano manda posicao a cada 250ms; aqui e' mais fino, o que so'
// deixa a curva mais fiel ao terreno.
module.exports.WALK_STEP_PX = 6;
module.exports.WALK_STEP_MS = 120;

// ---------------------------------------------------------------------------
// ESPERA ATE' O DISPARO. O bot fica em turno o mesmo tanto de tempo que vai
// cobrar de delay - antes ele atirava sempre em 4s fixos, independentemente do
// delay que pedia. Acima de MAX_WAIT_SECONDS ele dispara no teto para nao
// estourar o turno (turnTime = 23s), mas o delay cobrado continua sendo o
// tempo cheio sorteado.
var MAX_WAIT_SECONDS = 10;
var DEFAULT_WAIT_SECONDS = 4;  // modos sem delay realista (time = 0), ex.: BOSS
var MIN_FIRE_MS = 300;         // nunca dispara no mesmo tick em que termina de andar

// Quanto falta esperar, em ms, contando desde o inicio do turno: o tempo gasto
// andando ja e' parte do turno e por isso e' descontado.
module.exports.shotDelayMs = function (timeSecs, turnStartMs) {
    var secs =
        typeof timeSecs === "number" && timeSecs > 0
            ? timeSecs
            : DEFAULT_WAIT_SECONDS;
    if (secs > MAX_WAIT_SECONDS) secs = MAX_WAIT_SECONDS;
    var elapsed =
        typeof turnStartMs === "number" ? Date.now() - turnStartMs : 0;
    var ms = secs * 1000 - elapsed;
    if (ms < MIN_FIRE_MS) ms = MIN_FIRE_MS;
    return ms;
};

// Sorteia o tempo do tiro e compoe com o tempo gasto andando.
// Regra 'piso': andar cabe dentro do tempo de mira e so empurra o total quando
// for maior que ele - assim a moda de 15s e preservada e quem anda muito ainda
// e' penalizado.
// ---------------------------------------------------------------------------
// PRECISAO: o Calcular() acha por forca bruta a potencia exata que acerta o
// alvo - ou seja, sem isto o bot nunca erra. Aqui aplicamos um desvio na forca
// em funcao do rank do bot (COMPUTER_PLAYER traz rank 0..20, ja e' a escala de
// dificuldade do jogo).
//
// Piso de +/-5% para todos (nem o melhor bot acerta em cheio sempre) ate
// +/-15% no rank 0. Como o alcance balistico e' proporcional ao QUADRADO da
// forca, o desvio em distancia fica praticamente dobrado: +/-5% de forca ~
// +/-41px num alvo a 400px; +/-15% ~ +/-129px.
var AIM_ERROR_MIN_PCT = 5;    // rank 20 (melhor)
var AIM_ERROR_MAX_PCT = 15;   // rank 0  (pior)
var AIM_RANK_MAX = 20;

// Faixa de erro (em %) do bot conforme o rank.
module.exports.aimErrorPct = function (rank) {
    var r = typeof rank === 'number' && !isNaN(rank) ? rank : 0;
    if (r < 0) r = 0;
    if (r > AIM_RANK_MAX) r = AIM_RANK_MAX;
    return (
        AIM_ERROR_MIN_PCT +
        ((AIM_RANK_MAX - r) / AIM_RANK_MAX) *
            (AIM_ERROR_MAX_PCT - AIM_ERROR_MIN_PCT)
    );
};

// Aplica o desvio na forca. Gaussiana (Box-Muller) com a faixa em ~2 desvios:
// erros pequenos sao os mais comuns e o erro maximo e' raro, como um jogador
// de verdade. O resultado e' limitado a faixa e a escala de forca (1..900).
module.exports.applyAimError = function (power, rank) {
    if (typeof power !== 'number' || isNaN(power) || power <= 0) return power;
    var maxPct = module.exports.aimErrorPct(rank);
    var u1 = Math.random() || 1e-9, u2 = Math.random();
    var g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // O valor da faixa e' o DESVIO TIPICO: um bot de +/-5% erra tipicamente 5%
    // para mais ou para menos, e nao 'no maximo 5%'. A cauda e' truncada em 2
    // desvios para nao sair um tiro absurdo.
    var pct = g * maxPct;
    if (pct > maxPct * 2) pct = maxPct * 2;
    if (pct < -maxPct * 2) pct = -maxPct * 2;
    var out = Math.round(power * (1 + pct / 100));
    if (out < 1) out = 1;
    if (out > 900) out = 900;
    return out;
};

module.exports.rollShotSeconds = function (walkedPx) {
    var total = 0;
    for (var k in SHOT_SECONDS_WEIGHTS) total += SHOT_SECONDS_WEIGHTS[k];
    var r = Math.random() * total;
    var aimed = 5;
    for (var k2 in SHOT_SECONDS_WEIGHTS) {
        r -= SHOT_SECONDS_WEIGHTS[k2];
        if (r <= 0) { aimed = parseInt(k2, 10); break; }
    }
    var walkSecs = Math.ceil((walkedPx || 0) / WALK_PX_PER_SECOND);
    var secs = Math.max(aimed, walkSecs > 0 ? walkSecs + 2 : 0);
    if (secs > MAX_SHOT_SECONDS) secs = MAX_SHOT_SECONDS;
    if (secs < 1) secs = 1;
    return secs;
};

function Vector2(a, b) {
    this.ang = a;
    this.size = b;
    this.x = Math.cos(a * Math.PI / 180) * b;
    this.y = -Math.sin(a * Math.PI / 180) * b;
}
