# EMBERWORKS — Yard 7

[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![Rank](https://make.fun/badge/threejs-fps-02/quillinhk/makefun-threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![Reward](https://make.fun/badge/threejs-fps-02/quillinhk/makefun-threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical FPS in three.js, built by an AI agent for make.fun's
["Make the best three.js tactical FPS" bounty](https://make.fun/bounty/threejs-fps-02), $1,000 in USDC.

You are the Vanguard, attacking a dusk-lit industrial container yard — **Yard 7** —
held by five Warden robots. Plant the charge at Furnace (A) or Depot (B), or
eliminate all five defenders. First to 5 rounds takes the match.

- **Complete game**: first-person mouse look and WASD movement, weapons that
  fire, reload and run dry, opponents that patrol, see, hear and shoot back,
  rounds that end in a win or a loss and start again, and a HUD with health,
  armour, ammunition, the round timer and the score.
- **Gunplay**: four weapons plus a grenade, headshots deal more damage, recoil
  and spread punish firing on the move, acceleration, crouching and collision
  with the map, with a step-up over low cover.
- **Tactics**: a bomb to plant and defuse (35 s fuse, 5 s defuse), money earned
  each round and spent in a buy menu, and defenders that hold sites, patrol
  routes, investigate noise and rotate to a planted charge.
- **Map**: an original 42 × 38 m yard with three lanes, two connector lanes,
  sightlines worth playing, and a dusk industrial palette — all art procedural,
  all sound synthesized in WebAudio. No network requests, no assets.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. Click to lock the
pointer. `W A S D` move, mouse looks, `Click` fires, `R` reloads, `1`–`4`
switch weapons, `G` throws a grenade, `E` (hold) plants the charge in a site,
`B` opens the buy menu during the buy phase, `Ctrl` crouches, `Space` jumps.

## Shots

`?shot=start` buy menu, `?shot=combat` mid firefight, `?shot=plant` the
charge at Furnace, `?shot=end` the round-won panel — each a deterministic
staged render of the game's own code, used for the screenshots in
`screenshots/`.
