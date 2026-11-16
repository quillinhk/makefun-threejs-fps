// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, kill feed, bomb
// status and every overlay panel. It never touches the simulation; main.js pushes numbers in
// and reads the play and buy callbacks out. Every setter skips the DOM write when the value
// did not change, so the HUD costs nothing on a quiet frame.
import { buyCatalogue } from './economy.js';

const COPY = {
  start: {
    title: 'EMBERWORKS',
    copy: 'Yard 7, dusk. You are the Vanguard attacker: plant the charge at Furnace (A) or Depot (B), or eliminate all five Wardens. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERWORKS',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const extra = document.getElementById('overlay-extra');
  const play = document.getElementById('play');
  const buyGrid = document.getElementById('buy-grid');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const scope = document.getElementById('scope');
  const damage = document.getElementById('damage');
  const timerEl = document.getElementById('timer');
  const scoreEl = document.getElementById('score');
  const aliveEl = document.getElementById('alive');
  const bombEl = document.getElementById('bomb-status');
  const killfeedEl = document.getElementById('killfeed');
  const hintEl = document.getElementById('hint');
  const plantBar = document.getElementById('plant-bar');
  const plantFill = document.getElementById('plant-fill');
  const plantLabel = document.getElementById('plant-label');
  const healthNum = document.getElementById('health-num');
  const healthBar = document.getElementById('health-bar');
  const armorEl = document.getElementById('armor');
  const moneyEl = document.getElementById('money');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const grenadeCount = document.getElementById('grenade-count');
  const ammo = document.getElementById('ammo');

  let hitTimer = 0;
  let damageTimer = 0;
  let last = {};
  let buyHandler = null;
  let lastBuyMoney = -1;
  let lastBuyOwned = '';

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function renderBuy(money, owned) {
    const key = `${money}|${owned.join(',')}`;
    if (key === lastBuyOwned && money === lastBuyMoney) return;
    lastBuyMoney = money;
    lastBuyOwned = key;
    buyGrid.innerHTML = '';
    for (const item of buyCatalogue()) {
      const isOwned = owned.includes(item.id);
      const afford = money >= item.price;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.disabled = !afford && !isOwned && item.id !== 'grenade';
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">${isOwned ? 'OWNED' : '$' + item.price}</span>`;
      button.addEventListener('click', () => {
        if (buyHandler) buyHandler(item.id);
      });
      buyGrid.appendChild(button);
    }
  }

  return {
    setHealth(health, armor) {
      if (last.health === health && last.armor === armor) return;
      last.health = health;
      last.armor = armor;
      healthNum.textContent = String(health);
      healthBar.style.width = `${health}%`;
      healthBar.classList.toggle('low', health <= 30);
      armorEl.textContent = armor > 0 ? `ARMOR ${armor}` : '';
    },
    setAmmo(mag, reserve, name, grenades) {
      if (last.mag === mag && last.reserve === reserve && last.weapon === name && last.grenades === grenades) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weapon = name;
      last.grenades = grenades;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      grenadeCount.textContent = grenades > 0 ? `◈ ${grenades} HE` : '';
      ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      if (last.money === money) return;
      last.money = money;
      moneyEl.textContent = `$${money}`;
    },
    setTimer(seconds, label) {
      const text = `${label} ${formatTime(seconds)}`;
      if (last.timer === text) return;
      last.timer = text;
      timerEl.textContent = text;
    },
    setScore(wins, losses, round) {
      const text = `VANGUARD ${wins} — ${losses} WARDENS · ROUND ${round}/9`;
      if (last.score === text) return;
      last.score = text;
      scoreEl.textContent = text;
    },
    setAlive(playerAlive, botsAlive) {
      const text = `${playerAlive ? '●' : '○'} ${'●'.repeat(botsAlive)}${'○'.repeat(5 - botsAlive)}`;
      if (last.alive === text) return;
      last.alive = text;
      aliveEl.textContent = text;
      aliveEl.title = `You ${playerAlive ? 'alive' : 'down'} · ${botsAlive} Wardens alive`;
    },
    setBombStatus(text, urgent) {
      if (last.bomb === text) return;
      last.bomb = text;
      bombEl.textContent = text;
      bombEl.classList.toggle('urgent', !!urgent);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setScoped(scoped) {
      scope.hidden = !scoped;
      crosshair.style.visibility = scoped ? 'hidden' : 'visible';
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damage.classList.remove('on'), 220);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `${killer} ${headshot ? '◎' : '×'} ${victim}`;
      killfeedEl.prepend(line);
      while (killfeedEl.children.length > 5) killfeedEl.removeChild(killfeedEl.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    hint(text) {
      if (last.hint === text) return;
      last.hint = text;
      hintEl.textContent = text ?? '';
      hintEl.hidden = !text;
    },
    showPlant(label, progress) {
      plantBar.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'buy') {
        title.textContent = `BUY — ROUND ${data.round}`;
        copy.textContent = `You have $${data.money}. The round starts in ${Math.ceil(data.timer)} s — press B or click Done to close.`;
        extra.innerHTML = '';
        play.textContent = 'Done — back to the yard';
        renderBuy(data.money, data.owned);
        buyGrid.hidden = false;
      } else if (mode === 'round') {
        title.textContent = data.won ? 'ROUND WON' : 'ROUND LOST';
        copy.textContent = `${data.reason} — ${data.won ? '+' : ''}$${data.reward}. Vanguard ${data.wins} — ${data.losses} Wardens.`;
        extra.innerHTML = '';
        play.textContent = data.matchOver ? 'See the result' : 'Next round';
        buyGrid.hidden = true;
      } else if (mode === 'match') {
        title.textContent = data.won ? 'MATCH WON' : 'MATCH LOST';
        copy.textContent = `Final score: Vanguard ${data.wins} — ${data.losses} Wardens. ${data.kills} eliminations.`;
        extra.innerHTML = '';
        play.textContent = 'Play again';
        buyGrid.hidden = true;
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
        extra.innerHTML = '';
        play.textContent = text.action;
        buyGrid.hidden = true;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    refreshBuy(money, owned) {
      renderBuy(money, owned);
    },
  };
}
