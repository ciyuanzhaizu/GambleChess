const MONSTER_CONFIG = [
  { id: 'swordsman', name: '剑士', icon: '⚔️', atk: 30, hp: 130, def: 12, speed: 4, type: 'melee', desc: '攻守兼备的近战单位', spawnMin: 5, spawnMax: 10 },
  { id: 'berserker', name: '狂战士', icon: '🪓', atk: 38, hp: 110, def: 8, speed: 5, type: 'melee', desc: '高攻低防的狂战士', spawnMin: 3, spawnMax: 5 },
  { id: 'samurai', name: '武士', icon: '🗡️', atk: 32, hp: 125, def: 10, speed: 5, type: 'melee', desc: '精准而优雅的剑客', spawnMin: 1, spawnMax: 3 },
  { id: 'golem', name: '石魔像', icon: '🛡️', atk: 25, hp: 160, def: 20, speed: 3, type: 'melee', desc: '坚不可摧的防御者', spawnMin: 1, spawnMax: 1 },
  { id: 'archer', name: '弓箭手', icon: '🏹', atk: 28, hp: 100, def: 8, speed: 6, type: 'ranged', desc: '远程精准打击', spawnMin: 5, spawnMax: 10 },
  { id: 'mage', name: '法师', icon: '🔮', atk: 36, hp: 85, def: 6, speed: 5, type: 'ranged', desc: '强大的魔法输出', spawnMin: 2, spawnMax: 4 },
  { id: 'hunter', name: '猎人', icon: '🎯', atk: 30, hp: 95, def: 7, speed: 7, type: 'ranged', desc: '老练的追踪者', spawnMin: 2, spawnMax: 4 },
  { id: 'sniper', name: '狙击手', icon: '🔫', atk: 34, hp: 88, def: 5, speed: 6, type: 'ranged', desc: '致命的长距离打击', spawnMin: 1, spawnMax: 1 },
  { id: 'dragon', name: '火龙', icon: '🐉', atk: 35, hp: 100, def: 14, speed: 3, type: 'flying', desc: '翱翔天际的霸主', spawnMin: 1, spawnMax: 2 },
  { id: 'phoenix', name: '凤凰', icon: '🔥', atk: 30, hp: 95, def: 16, speed: 4, type: 'flying', desc: '浴火重生的神鸟', spawnMin: 1, spawnMax: 1 },
  { id: 'griffon', name: '狮鹫', icon: '🦅', atk: 32, hp: 90, def: 13, speed: 5, type: 'flying', desc: '天空的猛禽', spawnMin: 1, spawnMax: 3 },
  { id: 'harpy', name: '鹰身女妖', icon: '🦇', atk: 28, hp: 85, def: 15, speed: 6, type: 'flying', desc: '敏捷的空战专家', spawnMin: 1, spawnMax: 3 },
  { id: 'paladin', name: '圣骑士', icon: '⛨', atk: 27, hp: 140, def: 18, speed: 4, type: 'melee', desc: '光明庇佑的骑士', spawnMin: 1, spawnMax: 2 },
  { id: 'warlock', name: '术士', icon: '👿', atk: 33, hp: 90, def: 9, speed: 5, type: 'ranged', desc: '暗影力量的操控者', spawnMin: 1, spawnMax: 2 }
];

const AI_NAMES = ['暗影刺客', '火焰法师', '冰霜战士', '雷霆射手', '风暴骑士', '月光猎人', '星辰术士'];

const GAME_CONFIG = {
  DEFAULT_AI_COUNT: 7,
  MAX_AI_COUNT: 7,
  MIN_AI_COUNT: 3,
  AUCTION_MONSTER_COUNT: 8,
  AUCTION_DISPLAY_COUNT: 4,
  AUCTION_COUNTDOWN: 5000,
  STARTING_GOLD: 1200,
  ADD_GOLD: 800,
  POINTS_PER_WIN: 100,
  WINNER_SCORE: 1200,
  BET_MULTIPLIER: 5,
  BET_COST: 25,
  ROUND_DELAY: 1200,
  BATTLE_ROUND_DELAY: 800,
  BATTLE_PRE_DELAY: 5000,
  BATTLE_END_DELAY: 5000,
  BASE_ATTACK_DELAY: 1400,
  AI_MAX_BID_CYCLES: 6
};

const AI_BET_STYLES = ['conservative', 'aggressive', 'breakthrough'];
const AI_BET_FREQS = ['defensive', 'offensive', 'bargain'];

const TYPE_LABELS = {
  melee: '近战',
  ranged: '远程',
  flying: '空中'
};
