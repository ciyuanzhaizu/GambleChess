class Player {
  constructor(id, name, isHuman = false, betStyle = null, betFreq = null) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.gold = GAME_CONFIG.STARTING_GOLD;
    this.monsters = [];
    this.score = 0;
    this.totalSpent = 0;
    this.isEliminated = false;
    if (!isHuman) {
      this.betStyle = betStyle;
      this.betFreq = betFreq;
    }
    this.auctionBidCount = 0;
  }

  get monster() {
    return this.monsters.length > 0 ? this.monsters[0] : null;
  }
  set monster(v) {}

  addMonster(monster, count = 1) {
    for (let i = 0; i < count; i++) {
      this.monsters.push({ ...monster });
    }
  }

  addScore(points) {
    this.score += points;
  }

  spendGold(amount) {
    if (amount > this.gold) return false;
    this.gold -= amount;
    this.totalSpent += amount;
    return true;
  }

  getMonsterValue(monster) {
    const typeWeights = { melee: 1.0, ranged: 1.1, flying: 1.2 };
    return (monster.atk * 2 + monster.hp * 1 + monster.def * 1.5 + monster.speed * 2) * typeWeights[monster.type];
  }

  reset(totalSpentThisRound = false) {
    if (totalSpentThisRound) {
      this.totalSpent = 0;
    }
    this.isEliminated = false;
  }
}

class Game {
  constructor() {
    this.state = 'MENU';
    this.players = [];
    this.humanPlayer = null;
    this.currentRound = 0;
    this.auctionMonsters = [];
    this.auctionIndex = 0;
    this.auctionRevealed = 0;
    this.currentBids = {};
    this.tournamentBracket = [];
    this.currentBracketRound = 0;
    this.currentBracketPair = 0;
    this.battleResults = [];
    this.battles = [];
    this.bets = [];
    this.battleLog = [];
    this.onUpdate = null;
    this.resolvePromise = null;
    this._roundEndAction = null;

    this.auctionHighBidder = null;
    this.auctionHighBid = 0;
    this.auctionCountdownEnd = null;
    this._auctionEndTimer = null;
    this._aiCheckTimer = null;
    this._auctionRunning = false;
  }

  registerUpdate(callback) {
    this.onUpdate = callback;
  }

  update() {
    if (this.onUpdate) this.onUpdate(this);
  }

  startGame(playerName, aiCount) {
    this.players = [];
    this.humanPlayer = new Player('p0', playerName || '你', true);
    this.players.push(this.humanPlayer);

    const shuffledAi = AI_PLAYERS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(aiCount, AI_PLAYERS.length); i++) {
      const cfg = shuffledAi[i];
      this.players.push(new Player(`p${i + 1}`, cfg.name, false, cfg.betStyle, cfg.betFreq));
    }

    this.currentRound = 0;
    this.startAuctionRound();
  }

  startAuctionRound() {
    this.currentRound++;
    this.state = 'AUCTION';

    this.players.forEach(p => {
      p.reset(true);
      if (this.currentRound === 1) {
        p.gold = GAME_CONFIG.STARTING_GOLD;
      } else {
        p.gold += GAME_CONFIG.ADD_GOLD;
      }
    });

    this.auctionMonsters = this.buildAuctionGroups();
    this.auctionIndex = 0;
    this.auctionRevealed = GAME_CONFIG.AUCTION_DISPLAY_COUNT;
    this.currentBids = {};
    this.bets = [];
    this._roundEndAction = null;

    this.update();
    setTimeout(() => this.runAuction(), 400);
  }

  buildAuctionGroups() {
    const groups = [];
    const available = [...MONSTER_CONFIG];
    const used = [];
    for (let i = 0; i < GAME_CONFIG.AUCTION_MONSTER_COUNT; i++) {
      const m = available[Math.floor(Math.random() * available.length)];
      const min = m.spawnMin == null ? 1 : m.spawnMin;
      const max = m.spawnMax == null ? 1 : m.spawnMax;
      const count = min + Math.floor(Math.random() * (max - min + 1));
      groups.push({ monster: { ...m }, count });
      used.push(m);
    }
    return groups;
  }

  getVisibleMonsters() {
    const revealed = Math.min(this.auctionRevealed, this.auctionMonsters.length);
    return this.auctionMonsters.slice(0, revealed).map((g, i) => ({
      monster: g.monster,
      count: g.count,
      revealed: true,
      auctioned: i < this.auctionIndex
    }));
  }

  getCurrentAuctionMonster() {
    if (this.auctionIndex >= this.auctionMonsters.length) return null;
    return this.auctionMonsters[this.auctionIndex];
  }

  getAuctionCountdown() {
    if (!this.auctionCountdownEnd) return 0;
    return Math.max(0, Math.ceil((this.auctionCountdownEnd - Date.now()) / 1000));
  }

  getAuctionCountdownMs() {
    if (!this.auctionCountdownEnd) return 0;
    return Math.max(0, this.auctionCountdownEnd - Date.now());
  }

  async runAuction() {
    if (this.state !== 'AUCTION') return;
    const group = this.getCurrentAuctionMonster();
    if (!group) {
      this.transitionToBattle();
      return;
    }

    const monster = group.monster;
    this._auctionRunning = true;
    this.auctionHighBidder = null;
    this.auctionHighBid = 0;
    this.auctionCountdownEnd = null;
    this._aiBidCycleCount = 0;

    const minBid = Math.floor(this.monsterMinValue(monster) * group.count);
    this.currentBids = {};
    this.auctionBidHistory = [];
    this.players.forEach(p => { p.auctionBidCount = 0; });

    this.update();
    await this.delay(600);

    const initiator = this.pickAuctionInitiator(group, minBid);
    if (initiator) {
      this.auctionHighBidder = initiator.id;
      this.auctionHighBid = initiator.bid;
      this.currentBids[initiator.id] = initiator.bid;
      this.auctionBidHistory.push({ playerId: initiator.id, bid: initiator.bid });
    }

    this.startCountdown();
    await this.waitForCountdown();

    this._auctionRunning = false;
    this.finalizeAuction();
  }

  pickAuctionInitiator(group, minBid) {
    const monster = group.monster;
    const candidates = this.players.filter(p => p.gold >= minBid);
    if (candidates.length === 0) return null;

    const nonHuman = candidates.filter(p => !p.isHuman);
    if (nonHuman.length > 0) {
      const breakthrough = nonHuman.filter(p => p.betStyle === 'breakthrough');
      const pool = breakthrough.length > 0 ? breakthrough : nonHuman;
      const ai = pool[Math.floor(Math.random() * pool.length)];
      const bid = Math.min(minBid + Math.floor(Math.random() * monster.atk * 3), ai.gold);
      ai.auctionBidCount = (ai.auctionBidCount || 0) + 1;
      return { id: ai.id, bid: Math.max(minBid, bid) };
    }

    const bid = Math.min(minBid, this.humanPlayer.gold);
    return { id: this.humanPlayer.id, bid: Math.max(minBid, bid) };
  }

  monsterMinValue(monster) {
    return Math.floor((monster.atk + monster.hp * 0.5 + monster.def + monster.speed * 1.5) * 1.5);
  }

  startCountdown() {
    this._clearCountdownTimers();
    this.auctionCountdownEnd = Date.now() + GAME_CONFIG.AUCTION_COUNTDOWN;
    this._scheduleCountdownEnd();
    this._scheduleAiBidCheck();
    this.update();
  }

  _clearCountdownTimers() {
    if (this._auctionEndTimer) { clearTimeout(this._auctionEndTimer); this._auctionEndTimer = null; }
    if (this._aiCheckTimer) { clearTimeout(this._aiCheckTimer); this._aiCheckTimer = null; }
  }

  _scheduleCountdownEnd() {
    const remaining = this.getAuctionCountdownMs();
    this._auctionEndTimer = setTimeout(() => {
      this._clearCountdownTimers();
      this.auctionCountdownEnd = 0;
      if (this.resolvePromise) {
        const r = this.resolvePromise;
        this.resolvePromise = null;
        r();
      }
    }, remaining);
  }

  _scheduleAiBidCheck() {
    const remaining = this.getAuctionCountdownMs();
    if (remaining <= 600) return;
    const checkDelay = Math.floor(remaining * 0.55);
    this._aiCheckTimer = setTimeout(() => {
      this._processAiBids();
    }, checkDelay);
  }

  _processAiBids() {
    if (this.state !== 'AUCTION' || !this._auctionRunning) return;
    const group = this.getCurrentAuctionMonster();
    if (!group) return;

    this._aiBidCycleCount = (this._aiBidCycleCount || 0) + 1;
    if (this._aiBidCycleCount > GAME_CONFIG.AI_MAX_BID_CYCLES) {
      this._aiCheckTimer = null;
      this.update();
      return;
    }

    let bestBid = this.auctionHighBid;
    let bestBidder = null;

    for (const player of this.players) {
      if (player.isHuman) continue;
      if (player.id === this.auctionHighBidder) continue;
      if (player.gold <= this.auctionHighBid + 1) continue;
      if (!this._aiCanBid(player)) continue;

      const bid = this.aiComputeBid(player, group);
      if (bid > bestBid && bid <= player.gold) {
        bestBid = bid;
        bestBidder = player;
      }
    }

    if (bestBidder) {
      bestBidder.auctionBidCount = (bestBidder.auctionBidCount || 0) + 1;
      this.auctionHighBidder = bestBidder.id;
      this.auctionHighBid = bestBid;
      this.currentBids[bestBidder.id] = bestBid;
      this.auctionBidHistory.push({ playerId: bestBidder.id, bid: bestBid });
      this.startCountdown();
    } else {
      this._aiCheckTimer = null;
      this.update();
    }
  }

  _aiCanBid(player) {
    if (player.betFreq === 'defensive' && (player.auctionBidCount || 0) >= 3) return false;
    if (player.betFreq === 'bargain' && (this.auctionBidHistory?.length || 0) < 5) return false;
    if (player.betStyle === 'breakthrough') {
      if (this.auctionHighBid > 0 && this.auctionHighBidder !== player.id) return false;
    }
    return true;
  }

  aiComputeBid(player, group) {
    const monster = group.monster;
    const value = player.getMonsterValue(monster) * group.count;
    const budget = player.gold;
    const minBid = Math.floor(value * 2.2);

    if (player.betStyle === 'conservative') {
      const bid = this.auctionHighBid + 50;
      if (bid > budget) return 0;
      return Math.max(minBid, bid);
    }

    if (player.betStyle === 'aggressive') {
      return Math.max(minBid, Math.min(budget, budget - 3));
    }

    const needMonster = !player.monsters || player.monsters.length === 0;
    let maxBid;
    if (needMonster) {
      maxBid = Math.floor(budget * 0.55 + value * 1.3);
    } else {
      maxBid = Math.floor(budget * 0.25 + value * 0.9);
    }
    return Math.max(minBid, Math.min(maxBid, budget - 3));
  }

  processHumanBid(amount) {
    if (this.state !== 'AUCTION' || !this._auctionRunning) return false;
    if (amount <= this.auctionHighBid) return false;
    if (amount > this.humanPlayer.gold) return false;

    this.auctionHighBidder = this.humanPlayer.id;
    this.auctionHighBid = amount;
    this.currentBids[this.humanPlayer.id] = amount;
    this.auctionBidHistory.push({ playerId: this.humanPlayer.id, bid: amount });
    this.startCountdown();
    return true;
  }

  waitForCountdown() {
    return new Promise(resolve => {
      this.resolvePromise = resolve;
    });
  }

  humanBid(amount) {
    amount = Math.max(0, Math.min(amount, this.humanPlayer.gold));
    if (amount <= 0) return;
    this.processHumanBid(amount);
  }

  finalizeAuction() {
    const winnerId = this.auctionHighBidder;
    const winningBid = this.auctionHighBid;
    const group = this.getCurrentAuctionMonster();

    if (winnerId && winningBid > 0 && group) {
      const winner = this.players.find(p => p.id === winnerId);
      if (winner) {
        const actualBid = Math.min(winningBid, winner.gold);
        winner.spendGold(actualBid);
        winner.addMonster(group.monster, group.count);
        this.auctionBidResult = { winner: winnerId, amount: actualBid, monster: group.monster, count: group.count };
      }
    }

    this._clearCountdownTimers();
    this.auctionHighBidder = null;
    this.auctionHighBid = 0;
    this.auctionCountdownEnd = null;
    this.currentBids = {};
    this._auctionRunning = false;

    this.update();
    setTimeout(() => this.advanceAuction(), GAME_CONFIG.ROUND_DELAY);
  }

  advanceAuction() {
    this.auctionBidResult = null;
    this.auctionIndex++;

    if (this.auctionIndex + GAME_CONFIG.AUCTION_DISPLAY_COUNT < this.auctionMonsters.length) {
      this.auctionRevealed++;
    }

    if (this.auctionIndex < this.auctionMonsters.length) {
      this.update();
      setTimeout(() => this.runAuction(), GAME_CONFIG.ROUND_DELAY / 2);
    } else {
      this.update();
      setTimeout(() => this.transitionToBattle(), GAME_CONFIG.ROUND_DELAY);
    }
  }

  transitionToBattle() {
    this.state = 'BATTLE_SETUP';
    this.battleLog = [];
    this.bets = [];
    this.battleResults = [];
    this.createTournamentBracket();
    this.update();

    setTimeout(() => {
      this.state = 'BATTLE';
      this.currentBracketRound = 0;
      this.currentBracketPair = 0;
      this.update();
      this.runBattleRound();
    }, GAME_CONFIG.ROUND_DELAY);
  }

  createTournamentBracket() {
    const playersWithMonsters = this.players.filter(p => p.monsters && p.monsters.length > 0 && !p.isEliminated);

    if (playersWithMonsters.length < 2) {
      if (playersWithMonsters.length === 1) {
        playersWithMonsters[0].addScore(GAME_CONFIG.POINTS_PER_WIN);
        this.battleResults.push({ winner: playersWithMonsters[0].id, loser: null, isBye: true, round: 'final' });
      }
      this.battleLog = [];
      this.state = 'ROUND_END';
      this.tournamentBracket = [];
      this.update();
      return;
    }

    const shuffled = playersWithMonsters.sort(() => Math.random() - 0.5);
    let pairs = [];
    let byePlayer = null;

    if (shuffled.length % 2 !== 0) {
      const sortedBySpent = [...shuffled].sort((a, b) => b.totalSpent - a.totalSpent);
      byePlayer = sortedBySpent[0];
    }

    const activePlayers = byePlayer
      ? shuffled.filter(p => p.id !== byePlayer.id)
      : shuffled;

    for (let i = 0; i < activePlayers.length; i += 2) {
      if (i + 1 < activePlayers.length) {
        pairs.push([activePlayers[i], activePlayers[i + 1]]);
      }
    }

    this.tournamentBracket = [{ pairs, byePlayer }];
    this.battles = pairs.map(([p1, p2]) => ({
      id: `battle_${p1.id}_${p2.id}`,
      player1: p1,
      player2: p2,
      round: 0,
      log: [],
      resolved: false,
      winner: null,
      team1HPs: p1.monsters.map(m => m.hp),
      team2HPs: p2.monsters.map(m => m.hp),
      t1ActiveIdx: 0,
      t2ActiveIdx: 0,
      attackingSide: 0,
      animationTrigger: 0,
      rounds: []
    }));
  }

  async runBattleRound() {
    this.battleLog = [];
    this.currentBracketPair = 0;

    if (this.state !== 'BATTLE') return;

    this.aiPlaceBets();

    const currentBracket = this.tournamentBracket[this.currentBracketRound];
    if (!currentBracket) {
      this.endBattlePhase();
      return;
    }

    if (currentBracket.byePlayer) {
      const bye = currentBracket.byePlayer;
      this.battleResults.push({ winner: bye.id, loser: null, isBye: true, round: this.currentBracketRound });
      this.battleLog.push(`${bye.name}(${bye.monsters[0].icon}) 本轮竞拍花费最高，直接进入下一轮！`);
    }

    const winners = [];
    if (currentBracket.byePlayer) {
      winners.push(currentBracket.byePlayer);
    }

    for (const battle of this.battles) {
      this.currentBracketPair = this.battles.indexOf(battle) + 1;
      this.currentBattle = battle;
      this.battleLog = [];
      battle.team1HPs = battle.player1.monsters.map(m => m.hp);
      battle.team2HPs = battle.player2.monsters.map(m => m.hp);
      battle.t1ActiveIdx = 0;
      battle.t2ActiveIdx = 0;
      battle.attackingSide = 0;
      battle.animationTrigger = 0;
      this.update();
      await this.delay(GAME_CONFIG.BATTLE_PRE_DELAY);

      const result = this.simulateBattleTicks(battle.player1, battle.player2);
      battle.rounds = result.rounds;
      battle.team1FinalHPs = result.team1 ? result.team1.map(m => Math.max(0, m.hp)) : [];
      battle.log = result.log;

      await this.animateBattle(battle, result);

      battle.resolved = true;
      battle.winner = result.winner.id;
      this.battleLog = result.log;

      const winnerPlayer = result.winner;
      winnerPlayer.addScore(GAME_CONFIG.POINTS_PER_WIN);

      this.battleResults.push({
        winner: winnerPlayer.id,
        loser: result.loser.id,
        round: this.currentBracketRound
      });

      this.resolveBets(battle);
      winners.push(winnerPlayer);
      this.update();
      await this.delay(GAME_CONFIG.BATTLE_END_DELAY);
    }

    if (winners.length === 1) {
      const champion = winners[0];
      champion.addScore(GAME_CONFIG.POINTS_PER_WIN);
      this.battleResults.push({
        winner: champion.id,
        loser: null,
        isFinal: true,
        round: 'final'
      });

      this.battleLog = [`🏆 ${champion.name}(${champion.monsters[0].icon}) 获得最终胜利！获得100积分！`];
      this.state = 'ROUND_END';
      this.update();

      const nextAction = champion.score >= GAME_CONFIG.WINNER_SCORE
        ? () => this.endGame(champion)
        : () => this.startAuctionRound();
      this._roundEndAction = nextAction;
      setTimeout(() => {
        if (this._roundEndAction) {
          this._roundEndAction();
          this._roundEndAction = null;
        }
      }, GAME_CONFIG.ROUND_DELAY * 2);
      return;
    }

    this.currentBracketRound++;
    const nextPairs = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        nextPairs.push([winners[i], winners[i + 1]]);
      }
    }

    let nextBye = null;
    if (winners.length % 2 !== 0) {
      const sortedBySpent = [...winners].sort((a, b) => b.totalSpent - a.totalSpent);
      nextBye = sortedBySpent[0];
    }

    const nextActivePlayers = nextBye
      ? winners.filter(p => p.id !== nextBye.id)
      : winners;

    const nextBattles = [];
    const newPairs = [];
    for (let i = 0; i < nextActivePlayers.length; i += 2) {
      if (i + 1 < nextActivePlayers.length) {
        const pair = [nextActivePlayers[i], nextActivePlayers[i + 1]];
        newPairs.push(pair);
        nextBattles.push({
          id: `battle_r${this.currentBracketRound}_${i}`,
          player1: nextActivePlayers[i],
          player2: nextActivePlayers[i + 1],
          round: this.currentBracketRound,
          log: [],
          resolved: false,
          winner: null,
          team1HPs: nextActivePlayers[i].monsters.map(m => m.hp),
          team2HPs: nextActivePlayers[i + 1].monsters.map(m => m.hp),
          t1ActiveIdx: 0,
          t2ActiveIdx: 0,
          attackingSide: 0,
          animationTrigger: 0,
          rounds: []
        });
      }
    }

    this.tournamentBracket.push({ pairs: newPairs, byePlayer: nextBye });
    this.battles = nextBattles;
    this.battleLog = [`第 ${this.currentBracketRound + 1} 轮战斗准备...`];
    this.update();
    await this.delay(GAME_CONFIG.ROUND_DELAY);
    this.runBattleRound();
  }

  simulateBattleTicks(player1, player2) {
    const COLS = GAME_CONFIG.BATTLE_COLS;
    const ROWS = GAME_CONFIG.BATTLE_ROWS;
    const log = [];
    const units = [];

    const addTeam = (monsters, playerId, startCol, maxCol) => {
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        const col = startCol + Math.floor(i / ROWS);
        if (col > maxCol) break;
        units.push({
          id: `${playerId}_${i}`,
          playerId,
          monster: m,
          col: Math.min(col, maxCol),
          row: i % ROWS,
          hp: m.hp, maxHp: m.hp,
          cooldown: 0,
          alive: true
        });
      }
    };
    addTeam(player1.monsters, player1.id, 0, 2);
    addTeam(player2.monsters, player2.id, COLS - 3, COLS - 1);

    log.push(`⚔️ ${player1.name} VS ${player2.name}`);
    log.push('');

    const ticks = [];
    const alive = (pid) => units.filter(u => u.playerId === pid && u.alive);

    ticks.push({
      unitHPs: units.map(u => u.hp), unitCols: units.map(u => u.col),
      unitRows: units.map(u => u.row), unitAlive: units.map(u => u.alive), events: []
    });

    let tick = 0;
    while (tick < 1200 && alive(player1.id).length > 0 && alive(player2.id).length > 0) {
      tick++;
      const events = [];

      for (const u of units) {
        if (!u.alive) continue;
        u.cooldown = Math.max(0, u.cooldown - 1);
        const enemies = u.playerId === player1.id ? alive(player2.id) : alive(player1.id);
        if (enemies.length === 0) break;

        let target = null, bestDist = Infinity;
        for (const e of enemies) {
          const d = Math.abs(u.col - e.col) + Math.abs(u.row - e.row);
          if (d < bestDist || (d === bestDist && e.hp < bestDist)) { bestDist = d; target = e; }
        }
        if (!target) continue;

        const range = u.monster.range || 1;
        if (bestDist > range && u.cooldown <= 0) {
          let moved = false;
          const dc = Math.sign(target.col - u.col);
          const dr = Math.sign(target.row - u.row);
          if (dc !== 0) {
            const nc = u.col + dc;
            if (!units.some(ou => ou !== u && ou.alive && ou.col === nc && ou.row === u.row)) { u.col = nc; moved = true; }
          }
          if (!moved && dr !== 0) {
            const nr = u.row + dr;
            if (!units.some(ou => ou !== u && ou.alive && ou.col === u.col && ou.row === nr)) { u.row = nr; moved = true; }
          }
          if (moved) events.push({ type: 'move', unitId: u.id });
        } else if (bestDist <= range && u.cooldown <= 0) {
          const dmg = this.calcDamage(u.monster, target.monster);
          target.hp -= dmg;
          u.cooldown = Math.ceil(100 / u.monster.speed);
          events.push({
            type: u.monster.type === 'ranged' ? 'ranged' : 'melee',
            attackerId: u.id, targetId: target.id, damage: dmg
          });
          if (dmg === 0) {
            log.push(`[T${tick}] ${u.monster.name} 无法攻击 ${target.monster.name}(空中单位)`);
          } else {
            log.push(`[T${tick}] ${u.monster.name} → ${target.monster.name} -${dmg} (HP:${Math.max(0,target.hp)})`);
          }
          if (target.hp <= 0) {
            target.alive = false;
            events.push({ type: 'death', unitId: target.id });
            log.push(`💀 ${target.monster.name} 倒下！`);
          }
        }
      }

      ticks.push({
        unitHPs: units.map(u => u.hp), unitCols: units.map(u => u.col),
        unitRows: units.map(u => u.row), unitAlive: units.map(u => u.alive), events
      });

      if (events.length === 0) tick++; // force advance on stall
    }

    log.push('');
    let winner, loser;
    if (alive(player1.id).length > 0 && alive(player2.id).length === 0) { winner = player1; loser = player2; }
    else if (alive(player2.id).length > 0 && alive(player1.id).length === 0) { winner = player2; loser = player1; }
    else { winner = player1; loser = player2; }
    log.push(`🏆 ${winner.name} 获胜！`);

    return { winner, loser, log, units, ticks };
  }

  async animateBattle(battle, result) {
    this.battleLog = [];
    battle.tickResult = result;
    battle.animTick = 0;
    battle._lastAnimTime = null;
    battle.animPlaying = true;
    this.update();
    await new Promise(resolve => { battle._onAnimEnd = resolve; });
    battle.tickResult = null;
    battle.animPlaying = false;
    this.battleLog = result.log;
    this.update();
  }
  calcDamage(attacker, defender) {
    if (attacker.type === 'melee' && defender.type === 'flying') {
      return 0;
    }
    const rawDmg = attacker.atk - defender.def;
    return Math.max(1, rawDmg);
  }

  placeBet(bettorId, battleId, chosenPlayerId) {
    const amount = GAME_CONFIG.BET_COST;
    const bettor = this.players.find(p => p.id === bettorId);
    if (!bettor || bettor.gold < amount) return false;

    const battle = this.battles.find(b => b.id === battleId);
    if (!battle || battle.resolved) return false;

    if (battle.player1.id === bettorId || battle.player2.id === bettorId) return false;

    const alreadyBet = this.bets.some(b => b.bettorId === bettorId && b.battleId === battleId);
    if (alreadyBet) return false;

    bettor.spendGold(amount);
    this.bets.push({
      bettorId,
      battleId,
      chosenPlayerId,
      amount
    });

    this.update();
    return true;
  }

  resolveBets(battle) {
    const battleBets = this.bets.filter(b => b.battleId === battle.id);
    for (const bet of battleBets) {
      const bettor = this.players.find(p => p.id === bet.bettorId);
      if (!bettor) continue;

      if (bet.chosenPlayerId === battle.winner) {
        const reward = bet.amount * GAME_CONFIG.BET_MULTIPLIER;
        bettor.gold += reward;
        this.battleLog.push(`💰 ${bettor.name} 下注获胜！获得 ${reward} 金币！`);
      } else {
        this.battleLog.push(`💸 ${bettor.name} 下注失败，损失 ${bet.amount} 金币。`);
      }
    }
    this.bets = this.bets.filter(b => b.battleId !== battle.id);
  }

  endBattlePhase() {
    this.state = 'ROUND_END';
    this.battleLog = ['所有战斗已结束。'];
    this.update();
    setTimeout(() => this.startAuctionRound(), GAME_CONFIG.ROUND_DELAY * 2);
  }

  endGame(winner) {
    this.state = 'GAME_OVER';
    this.battleLog = [
      `🏆🏆🏆 ${winner.name} 以 ${winner.score} 积分获得最终胜利！🏆🏆🏆`,
      '游戏结束，感谢参与！'
    ];
    this.update();
  }

  restartGame() {
    this.state = 'MENU';
    this.players = [];
    this.humanPlayer = null;
    this.currentRound = 0;
    this.auctionMonsters = [];
    this.auctionIndex = 0;
    this.battleLog = [];
    this.bets = [];
    this._clearCountdownTimers();
    this._auctionRunning = false;
    this.update();
  }

  aiPlaceBets() {
    for (const battle of this.battles) {
      if (battle.resolved) continue;

      const aiBettors = this.players.filter(p =>
        !p.isHuman && p.gold >= GAME_CONFIG.BET_COST &&
        p.id !== battle.player1.id && p.id !== battle.player2.id
      );

      for (const bettor of aiBettors) {
        if (Math.random() > 0.4) continue;

        const m1Score = this.teamBattleScore(battle.player1, battle.player2);
        const m2Score = this.teamBattleScore(battle.player2, battle.player1);
        const chosenId = m1Score >= m2Score ? battle.player1.id : battle.player2.id;

        this.placeBet(bettor.id, battle.id, chosenId);
      }
    }
  }

  teamBattleScore(player, opponent) {
    if (!player.monsters || player.monsters.length === 0) return 0;
    const oppMonster = opponent.monsters && opponent.monsters.length > 0 ? opponent.monsters[0] : null;
    if (!oppMonster) return 0;
    return player.monsters.reduce((sum, m) => sum + this.monsterBattleScore(m, oppMonster), 0);
  }

  monsterBattleScore(monster, opponent) {
    let score = monster.atk * 2 + monster.hp + monster.def + monster.speed * 1.5;
    if (monster.type === 'flying' && opponent.type === 'melee') score *= 1.5;
    if (monster.type === 'melee' && opponent.type === 'flying') score *= 0.3;
    return score;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
