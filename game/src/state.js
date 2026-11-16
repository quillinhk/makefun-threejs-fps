// The one place state lives. Every module reads or writes this object; nothing keeps a
// second copy of the round, the money or the bomb. main.js owns the transitions; the rest
// only read.
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const ROUND_TIME = 100;
export const BUY_TIME = 12;
export const BOMB_TIME = 35;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;

export function createState() {
  return {
    phase: PHASE.MENU,
    round: 1,
    wins: 0, // Vanguard (player) rounds
    losses: 0, // Warden (bot) rounds
    money: 800,
    kills: 0,
    timer: BUY_TIME,
    bombPlanted: false,
    bombSite: null,
    bombTimer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    roundWinner: null,
    roundReason: '',
    lastReward: 0,
    elapsed: 0,
    started: false,
  };
}
