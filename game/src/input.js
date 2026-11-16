// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only. Beyond the starter's held keys and look, this reports press edges (for buy keys,
// grenades and semi-auto fire) and the right mouse button (for the sniper scope).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressedQueue = [];
  const clickQueue = [];
  const state = { keys, locked: false, firing: false, scoped: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) pressedQueue.push(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.scoped = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.firing = true;
      clickQueue.push(0);
    } else if (event.button === 2) {
      state.scoped = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    else if (event.button === 2) state.scoped = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.scoped = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Key codes pressed since the last call (edges, not held state).
    takePressed() {
      if (pressedQueue.length === 0) return pressedQueue;
      const out = pressedQueue.slice();
      pressedQueue.length = 0;
      return out;
    },
    // Left-click edges since the last call, for semi-auto weapons.
    takeClicks() {
      if (clickQueue.length === 0) return clickQueue;
      const out = clickQueue.slice();
      clickQueue.length = 0;
      return out;
    },
  };
}
