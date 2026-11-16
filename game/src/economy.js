// The economy: what things cost and what a round pays. Money is the player's only persistent
// resource between rounds; the buy menu reads this catalogue and nothing else.
import { WEAPON_DEFS, GRENADE_DEF, VEST_DEF } from './weapons.js';

export const REWARDS = {
  kill: 300,
  plant: 300,
  roundWin: 3250,
  roundLoss: 1900,
};

export function buyCatalogue() {
  const items = WEAPON_DEFS.map((def, index) => ({
    key: String(index + 1),
    id: def.id,
    name: def.name,
    price: def.price,
    detail: `${def.damage} dmg · ${def.mag} round mag`,
  }));
  items.push({
    key: '5',
    id: GRENADE_DEF.id,
    name: GRENADE_DEF.name,
    price: GRENADE_DEF.price,
    detail: 'Throw with G · blast radius 6.5 m',
  });
  items.push({
    key: '6',
    id: VEST_DEF.id,
    name: VEST_DEF.name,
    price: VEST_DEF.price,
    detail: 'Soaks half of incoming damage',
  });
  return items;
}
