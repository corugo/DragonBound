var Types = require('../gametypes');
var Message = require('./message');

// ---------------------------------------------------------------------------
// Falas dos bots durante a partida.
//
// Cada situacao tem um banco de frases e uma chance de o bot falar. Os
// marcadores {alvo} e {autor} sao trocados pelo nome do jogador envolvido.
// Para acrescentar frases basta editar LINES; para calibrar quanto eles falam,
// CHANCE e os cooldowns.
// ---------------------------------------------------------------------------
var LINES = {
    // Inicio da partida.
    start: [
        'Boa sorte a todos! Vão precisar.',
        'Aquecendo os motores...',
        'Bora, que hoje eu tô inspirado!',
        'Que vença o melhor. No caso, eu.',
        'Alguém trouxe o mapa? Eu só trouxe munição.',
        'gl hf :)',
    ],
    // Disparou o SS.
    ss: [
        'Vou te pegar, seu desperdício de oxigênio -_-',
        'SS saindo do forno!',
        'Segura essa, {alvo}!',
        'Agora é sério.',
        'Isso aqui vai doer, {alvo}.',
        'Especial carregado. Adeus!',
    ],
    // Usou Dual.
    dual: [
        'Dose dupla pra você, {alvo}!',
        'Um só não basta.',
        'Dual na conta, {alvo}.',
        'Vem de dois em dois!',
        'Pra garantir...',
    ],
    // Teleportou para fugir com pouca vida.
    teleport: [
        'Fui! Tchau!',
        'Nem vem que eu já tô longe.',
        'Hora de uma retirada estratégica.',
        'Me acha agora!',
        'Teleporte ativado, até mais!',
    ],
    // Matou um inimigo.
    kill: [
        'Menos um! Tchau, {alvo}.',
        'Descansa em paz, {alvo}.',
        'Foi mal, {alvo}. Mentira, não foi.',
        'Mais um pro placar!',
        '{alvo}, nem viu de onde veio.',
        'Perfeito. Próximo!',
    ],
    // Matou alguém do próprio time.
    kill_ally: [
        'Opa... foi mal, {alvo}!',
        '{alvo}, isso não foi de propósito, juro.',
        'Fogo amigo não conta, né?',
        'Ops. Alguém viu isso?',
    ],
    // Morreu com o próprio tiro.
    suicide: [
        'Era pra ser em outro lugar...',
        'Calculei errado. Acontece.',
        'Nem pergunta.',
        'Ops. Me acertei.',
    ],
    // Morreu para um inimigo.
    death: [
        'Essa doeu...',
        'Volto já, {autor}!',
        'Tá bom, {autor}, essa foi sua.',
        'Vou lembrar disso, {autor}.',
        'Não acredito!',
        'Anotado, {autor}. Vingança em breve.',
    ],
    // Morreu para um aliado.
    death_by_ally: [
        '{autor}, sério mesmo?!',
        'Valeu pela ajuda, {autor}... só que não.',
        'Do meu próprio time?!',
        '{autor}, a gente é do mesmo time!',
    ],
    // Voltou no modo SCORE.
    revive: [
        'Voltei! Sentiram saudade?',
        'Não se livram de mim tão fácil.',
        'Round 2!',
        'De volta à ativa.',
        'Achou que tinha acabado?',
    ],
    // Passou a vez porque um espelho bloqueia todos os alvos.
    pass_mirror: [
        'Com esse espelho aí não dá...',
        'Nem vou gastar tiro nisso.',
        'Espelho? Passo.',
        'Esperto você, hein. Passo a vez.',
    ],
    // Passou a vez porque todo alvo tem um aliado em cima.
    pass_ally: [
        'Não vou acertar meu parceiro. Passo.',
        'Tá todo mundo grudado, assim não dá.',
        'Melhor esperar uma brecha.',
    ],
};

// Chance de falar em cada situacao. O inicio e' baixo porque dispara para todos
// os bots de uma vez; abates e fogo amigo sao os momentos mais "falaveis".
var CHANCE = {
    start: 0.35,
    ss: 0.8,
    dual: 0.5,
    teleport: 0.7,
    kill: 0.6,
    kill_ally: 0.9,
    suicide: 0.9,
    death: 0.4,
    death_by_ally: 0.7,
    revive: 0.5,
    pass_mirror: 0.6,
    pass_ally: 0.5,
};

// O mesmo bot nao repete fala em sequencia, e a sala inteira respeita um
// intervalo minimo - com 8 bots, sem isto o chat vira um coro.
var BOT_COOLDOWN_MS = 8000;
var ROOM_COOLDOWN_MS = 2500;

function pick(bot, event) {
    var list = LINES[event];
    if (!list || !list.length) return null;
    bot._chatLast = bot._chatLast || {};
    var i = Math.floor(Math.random() * list.length);
    // Evita a mesma frase duas vezes seguidas para o mesmo bot.
    if (list.length > 1 && i === bot._chatLast[event]) i = (i + 1) % list.length;
    bot._chatLast[event] = i;
    return list[i];
}

function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, function (m, k) {
        return vars && vars[k] != null ? String(vars[k]) : '';
    });
}

// Envia a fala se os cooldowns permitirem. Devolve true quando falou.
function send(bot, text, room) {
    if (!bot || !bot.gameserver || !room) return false;
    if (bot.gameserver.name === 'Holiday') return false;
    var now = Date.now();
    if (bot._chatAt && now - bot._chatAt < BOT_COOLDOWN_MS) return false;
    if (room._botChatAt && now - room._botChatAt < ROOM_COOLDOWN_MS) return false;
    bot._chatAt = now;
    room._botChatAt = now;
    bot.gameserver.pushBroadcastChat(
        new Message.chatResponse(bot, text, Types.CHAT_TYPE.BOT),
        room
    );
    return true;
}

// Bot fala sobre um evento.
//   opts.force   ignora a chance (os cooldowns continuam valendo)
//   opts.delayMs fala depois de um tempo; os cooldowns sao checados na hora
function say(bot, event, vars, room, opts) {
    opts = opts || {};
    room = room || (bot && bot.room);
    if (!bot || !bot.player || !room) return false;
    if (!opts.force && Math.random() >= (CHANCE[event] != null ? CHANCE[event] : 0.5)) return false;
    var line = pick(bot, event);
    if (!line) return false;
    var text = fill(line, vars);
    if (opts.delayMs > 0) {
        setTimeout(function () {
            if (bot.room === room) send(bot, text, room);
        }, opts.delayMs);
        return true;
    }
    return send(bot, text, room);
}

// Um jogador morreu. Se quem atirou e' bot, ele comemora (ou pede desculpa);
// se nao falou e a vitima e' bot, a vitima reage.
function onKill(shooter, victim, room) {
    if (!shooter || !shooter.player || !victim || !room) return;
    var gs = room.gameserver;
    var shooterIsBot = shooter.player.is_bot === 1;
    var sameUser = shooter.player.user_id === victim.user_id;
    var sameTeam = shooter.player.team === victim.team;

    if (shooterIsBot) {
        if (sameUser) { say(shooter, 'suicide', {}, room); return; }
        var ev = sameTeam ? 'kill_ally' : 'kill';
        if (say(shooter, ev, { alvo: victim.game_id }, room)) return;
    }
    if (sameUser || victim.is_bot !== 1 || !gs || !gs.bots) return;
    var victimBot = gs.bots[victim.user_id];
    if (!victimBot) return;
    say(
        victimBot,
        sameTeam ? 'death_by_ally' : 'death',
        { autor: shooter.player.game_id },
        room
    );
}

// Inicio da partida: alguns bots cumprimentam, espalhados no tempo.
function onGameStart(room) {
    if (!room || typeof room.forBots !== 'function' || !room.gameserver) return;
    room.forBots(function (bot) {
        if (!bot || !bot.player) return;
        say(bot, 'start', {}, room, { delayMs: 1500 + Math.floor(Math.random() * 4000) });
    });
}

module.exports = {
    LINES: LINES,
    CHANCE: CHANCE,
    say: say,
    onKill: onKill,
    onGameStart: onGameStart,
};
