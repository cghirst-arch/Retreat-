import "./style.css";




/* =====================================================
   RETREAT! — FINAL STABILIZED CORE LOOP
===================================================== */

const app = document.getElementById("app")!;

app.innerHTML = `
<div id="wrap">
  <div id="leftPanel"></div>

  <div id="mapWrap">
    <div id="pauseOverlay" class="hidden"></div>
    <canvas id="tiles"></canvas>
    <pre id="map"></pre>
  </div>

  <div id="footer"></div>   <!-- ✅ NEW -->

  <div id="panel"></div>
</div>
`;



// Add this constant near your other element definitions
const pauseOverlay = document.getElementById("pauseOverlay")!;
const leftPanel = document.getElementById("leftPanel")!;
const mapEl = document.getElementById("map")!;
const panelEl = document.getElementById("panel")!;

/* ========= CONSTANTS ========= */
const MAP_W = 42, MAP_H = 36;
const MAX_DUR = 25;
const ENCOUNTER_CHANCE = 0.01;
const vendorFloors = [47, 37, 27, 17, 7];
const USED_WEAPON_PRICE = 80;
const USED_ARMOR_PRICE = 80;
const DIRS: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];

const weaponTiers = [
  { name: "Rusty", min: 1, max: 3, atkMin: 1, atkMax: 3 },
  { name: "Worn", min: 3, max: 6, atkMin: 3, atkMax: 6 },
  { name: "Iron", min: 6, max: 10, atkMin: 6, atkMax: 10 },
  { name: "Steel", min: 10, max: 15, atkMin: 9, atkMax: 14 }
];

const adjectives = [
  { name: "Cracked", mod: -0.2 },
  { name: "Balanced", mod: 0 },
  { name: "Fine", mod: 0.15 },
  { name: "Sharp", mod: 0.25 }
];

const MONOLOGUES: Record<number, string> = {
  50: "Why am I the one breathing?\nSir Kaelen was a wall of steel.\nI was just the one who carried the torches.",
  49: "I can still smell the ozone from Mara’s last spell.\nIt didn’t even slow the darkness down.",
  48: "My hands won’t stop shaking.\nI’m a coward holding a dead man’s sword.",
  47: "I found Kaelen’s broken shield.\nI left it in the dirt.",
  46: "Every shadow looks like the thing that tore them apart.",
  45: "\"You have a spark, Leo,\" Mara said.\nShe lied.",
  44: "If I died here, would anyone even know?",
  43: "The silence is heavier than stone.",
  42: "I ate the last of the meat.\nIt tasted like dust.",
  41: "I heard a voice call my name in the dark.\nI didn’t look back.",

  // we'll continue layering more later
};

/* ========= BASE STATS ========= */
let BASE_ATK = 6;
let BASE_DEF = 4;

/* ========= PLAYER ========= */
let player = {
  x: 2, y: 2,
  hp: 249,
  maxHP: 500,
  isDead: false,
  xp: 62000,
  gold: 50,
  inventory: [],
  poisoned: false,
  weapon: { bonus: 6, dur: MAX_DUR },
  armor: { bonus: 4, dur: MAX_DUR },
  strength: 18,
  defense: 16,
  hpFlash: null as "damage" | "heal" | null,
};

let floor = 50;

/* ========= STATE ========= */
let map: string[][] = [];
let seen: boolean[][] = [];
let visible: boolean[][] = [];
let deadEnds = new Set<string>();
let vendorAntidotes = 1;
type Fallen = { floor: number; x: number; y: number };
let fallen: Fallen[] = [];
let vendorRepairWeaponUsed = false;
let vendorRepairArmorUsed = false;
let vendorVisitedThisFloor = false;
let vendorPos: { x: number; y: number } | null = null;
let previousMode: typeof mode | null = null
let mapEnemies: {
  x: number;
  y: number;
  dir: [number, number];
  turn: number;
  aggro: boolean;
  moves: number;
}[] = [];
let awakeningTriggered = false;
let monologueText = "";
let monologueIndex = 0;
let monologueInterval: any = null;
let monologueDone = false;
let monologueResumeToExplore = false;
let mode: "title" | "intro" | "explore" | "combat" | "loot" | "stairs" | "chest" | "vendor" | "dead" | "pause" = "title";
let titleLoop: any = null;
let torchTime = 0
let enemy: any = null;
let fightUsedWeapon = false;
let fightHitArmor = false;
let combatText = "";
let lastLootText = "";
let stats = {
  enemiesKilled: 0,
  
 retreatAttempts: 0,
 retreatSuccesses: 0,

  floorsDescended: 0,
  goldCollected: 0,
};
let playerClass = "BARBARIAN"
let playerLevel = 14;
let xpToNextLevel = 102400;

let audioCtx: AudioContext | null = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
}


let townInterval: any = null;

function playTownMusic() {
  ensureAudio();

  if (townInterval) return; // prevent stacking

  const chords = [
    [82.4, 110, 147],
    [73.4, 98, 131],
    [65.4, 87, 123],
    [73.4, 98, 147]
  ];

  let step = 0;

  townInterval = setInterval(() => {
    const now = audioCtx!.currentTime;
    const chord = chords[step % chords.length];

    chord.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();

      osc.type = "triangle";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.2 + 2.5);

      osc.connect(gain);
      gain.connect(audioCtx!.destination);

      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 2.5);
    });

    step++;
  }, 2500);
}

function stopTownMusic() {
  if (townInterval) {
    clearInterval(townInterval);
    townInterval = null;
  }
}
let exploreInterval: any = null;


function playExploreMusic() {
  ensureAudio();

  if (exploreInterval) return;

  const chords = [
    [65.4, 98.0, 130.8],
    [58.3, 87.3, 116.5],
    [51.9, 77.8, 103.8],
    [49.0, 73.4, 98.0]
  ];

  let step = 0;

  exploreInterval = setInterval(() => {
    const now = audioCtx!.currentTime;
    const chord = chords[step % chords.length];

    chord.forEach(freq => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 6);

      osc.connect(gain);
      gain.connect(audioCtx!.destination);

      osc.start(now);
      osc.stop(now + 6);
    });

    step++;
  }, 5000);
}


function stopExploreMusic() {
  if (exploreInterval) {
    clearInterval(exploreInterval);
    exploreInterval = null;
  }
}

function startMonologue(text: string) {
  mode = "monologue";
  monologueText = text;
  monologueIndex = 0;
  monologueDone = false;

  mapEl.innerHTML = "<pre></pre>";
  panelEl.innerHTML = "";

  stopExploreMusic();
  playTownMusic(); // eerie stillness vibe

  const pre = mapEl.querySelector("pre")!;

  monologueInterval = setInterval(() => {
    monologueIndex++;
    pre.textContent = monologueText.slice(0, monologueIndex);

    if (monologueIndex >= monologueText.length) {
      clearInterval(monologueInterval);
      monologueDone = true;

      pre.textContent += "\n\n[Press any key]";
    }
  }, 25); // typing speed (tune this)
}
``




/* ========= UTILS ========= */
const roll = (n: number) =>
  Array.from({ length: n }).reduce((h: number) => h + (Math.random() < 0.33 ? 1 : 0), 0);

  function atk() {
    if (!player.weapon) return BASE_ATK;
    // Use a fallback of 0 if weapon is null to prevent crashes
    return BASE_ATK + (player.weapon.bonus * (player.weapon.dur / MAX_DUR));
  }
  
  function def() {
    if (!player.armor) return BASE_DEF;
    return BASE_DEF + (player.armor.bonus * (player.armor.dur / MAX_DUR));
  }

 
function isNearVisible(tx: number, ty: number) {
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = tx + dx;
    const ny = ty + dy;

    if (visible[ny]?.[nx]) return true;
  }
  return false;
}


function getRetreatRate() {
  if (stats.retreatAttempts === 0) return 0;

  return Math.floor(
    (stats.retreatSuccesses / stats.retreatAttempts) * 100
  );
}

  
function triggerAwakening(): boolean {
  if (awakeningTriggered || floor !== 50) return false;

  awakeningTriggered = true;

  const text = MONOLOGUES[50];
  if (text) {
    monologueResumeToExplore = true; // ✅ mark resume path
    startMonologue(text);
    return true;
  }

  return false;
}

  
 

  




  

  
/* ========= MAP ========= */
function genFloor() {
  vendorVisitedThisFloor = false;
  map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill("█"));
  seen = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  visible = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  deadEnds.clear();

  const rooms: { x: number, y: number, w: number, h: number }[] = [];

  // Create 5-7 rooms
  for (let i = 0; i < 7; i++) {
    const w = Math.floor(Math.random() * 3) + 3;
    const h = Math.floor(Math.random() * 3) + 3;
    const x = Math.floor(Math.random() * (MAP_W - w - 2)) + 1;
    const y = Math.floor(Math.random() * (MAP_H - h - 2)) + 1;

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        map[ry][rx] = "·";
      }
    }
    rooms.push({ x, y, w, h });
  }

  // Connect rooms
  for (let i = 0; i < rooms.length - 1; i++) {
    let x1 = Math.floor(rooms[i].x + rooms[i].w / 2);
    let y1 = Math.floor(rooms[i].y + rooms[i].h / 2);
    let x2 = Math.floor(rooms[i + 1].x + rooms[i + 1].w / 2);
    let y2 = Math.floor(rooms[i + 1].y + rooms[i + 1].h / 2);

    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) map[y1][x] = "·";
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) map[y][x2] = "·";
  }

  // SAFETY: Ensure (2,2) is always walkable as a fallback
  map[2][2] = "·"; 

  function findValidTile() {
    for (let attempts = 0; attempts < 100; attempts++) {
      const tx = Math.floor(Math.random() * (MAP_W - 2)) + 1;
      const ty = Math.floor(Math.random() * (MAP_H - 2)) + 1;
      if (map[ty][tx] === "·") return { tx, ty };
    }
    return { tx: 2, ty: 2 }; // Emergency fallback
  }

  const start = findValidTile();
  player.x = start.tx;
  player.y = start.ty;

  if ([49, 47, 37, 27, 17, 7].includes(floor)) {
    const v = findValidTile();
    map[v.ty][v.tx] = "W";
  }

  const s = findValidTile();
  map[s.ty][s.tx] = floor > 1 ? "▲" : "⬆";

  
// Spawn visible map enemies

mapEnemies = [];
for (let i = 0; i < 6; i++) {
  const e = findValidTile();
  mapEnemies.push({
    x: e.tx,
    y: e.ty,
    dir: DIRS[Math.floor(Math.random() * DIRS.length)],
    turn: 0,
    aggro: false,
    moves: 0
  });
}


  reveal();
}


function reveal() {
  // reset visibility each move
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      visible[y][x] = false;
    }
  }

  
const baseRadius = 6;

function hasLineOfSight(x0: number, y0: number, x1: number, y1: number) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);

  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;

  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    
if (map[y]?.[x] === "█" && !(x === x1 && y === y1) && !(x === x0 && y === y0)) {
  return false;
}


    if (x === x1 && y === y1) break;

    const e2 = err * 2;

    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }

    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return true;
}


// smooth flicker using sin waves (feels organic)

const flicker =
  Math.sin(torchTime * 3) * 1.2 +
  Math.sin(torchTime * 7) * 0.6 +
  (Math.random() * 0.8 - 0.4);

const radius = Math.max(3, Math.floor(baseRadius + flicker));


  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const tx = player.x + x;
      const ty = player.y + y;

      if (!map[ty] || !map[ty][tx]) continue;

      const dist = Math.abs(x) + Math.abs(y);

      

      if (dist <= radius) {

        if (hasLineOfSight(player.x, player.y, tx, ty)) {
          visible[ty][tx] = true;
          seen[ty][tx] = true;
        }
      
        // 🌫 soft corner bleed (important line)
        else if (isNearVisible(tx, ty)) {
          seen[ty][tx] = true;
        }
      }
      

    }
  }
}



/* ========= POISON ========= */
function poisonTick() {
  if (!player.poisoned) return;

  if (player.maxHP > player.hp) player.maxHP--;
  else { player.hp--; player.maxHP--; }

  if (player.hp <= 0) die();
}

function dropLoot() {
  const isWeapon = Math.random() < 0.5;
  const levelBonus = Math.max(1, Math.floor(floor / 10));

  if (isWeapon) {
    player.weapon = {
      bonus: BASE_ATK + levelBonus,
      dur: MAX_DUR
    };
    panelEl.innerHTML = `<pre>You find a weapon dropped by the enemy.</pre>`;
  } else {
    player.armor = {
      bonus: BASE_DEF + levelBonus,
      dur: MAX_DUR
    };
    panelEl.innerHTML = `<pre>You find armor dropped by the enemy.</pre>`;
  }
}

function vendorNoGold() {
  panelEl.innerHTML = `<pre>
The vendor shakes their head.

Not enough gold.

[L] Leave
</pre>`;
}

function repairCost(currentDur: number) {
  const missing = MAX_DUR - currentDur;
  const severity = missing / MAX_DUR; // 0 → 1

  // Base cost scales with how wrecked the item is
  const baseCost = Math.floor(10 + severity * 40); // ~10 → ~50

  // Vendor gets worse the higher you are
  return Math.floor(baseCost * vendorPriceMultiplier());
}

function vendorPriceMultiplier() {
  // Floor 47 ≈ 2.0x, Floor 7 ≈ 1.0x
  return 1 + (floor / 50);
}

function xpPerKillForFloor(floor: number): number {
  if (floor >= 47) return 100;
  if (floor >= 45) return 95;
  if (floor >= 43) return 85;
  if (floor >= 41) return 75;
  if (floor >= 39) return 65;
  if (floor >= 37) return 55;
  if (floor >= 35) return 45;
  if (floor >= 33) return 38;
  if (floor >= 31) return 32;
  if (floor >= 29) return 26;
  if (floor >= 27) return 22;
  if (floor >= 25) return 18;
  if (floor >= 23) return 15;
  if (floor >= 21) return 13;
  if (floor >= 19) return 11;
  if (floor >= 17) return 10;
  if (floor >= 15) return 9;
  if (floor >= 13) return 8;
  if (floor >= 11) return 7;
  if (floor >= 9) return 6;
  if (floor >= 7) return 5;
  if (floor >= 5) return 4;
  if (floor >= 3) return 2;
  return 1;
}

function enemyStatScale(floor: number): number {
  // Slower, capped scaling
  return Math.max(1, Math.min(8, Math.floor((floor - 1) / 8)));
}

function xpNeededForNextLevel(level: number): number {
  return Math.floor(25 * Math.pow(2, level - 2));
}

function checkLevelUp() {
  let needed = xpNeededForNextLevel(playerLevel);

  while (player.xp >= needed) {
    player.xp -= needed;
    playerLevel++;

    // === LEVEL-UP STAT GAINS ===
    const hpGain = 35;

    player.maxHP += hpGain;
    player.hp += hpGain;

    BASE_ATK += 1;
    BASE_DEF += 1;

    panelEl.innerHTML = `<pre>
LEVEL UP!

You are now level ${playerLevel}.

+${hpGain} HP
+1 Strength
+1 Defense
</pre>`;

    needed = xpNeededForNextLevel(playerLevel);
  }
}

function vendorGear(isWeapon: boolean) {
  const levelPenalty = Math.max(1, Math.floor(floor / 15));
  const wear = Math.floor(MAX_DUR * 0.5);

  if (isWeapon) {
    return {
      bonus: Math.max(1, BASE_ATK + levelPenalty - 1),
      dur: wear
    };
  } else {
    return {
      bonus: Math.max(1, BASE_DEF + levelPenalty - 1),
      dur: wear
    };
  }
}

function enemyGlyph() {
  return "<span class='enemy'>■</span>";
}

/* ========= ENEMIES ========= */
function spawnEnemy() {
  const scale = enemyStatScale(floor);

  if (Math.random() < 0.5) {
    // Goblin: glass cannon
    return {
      name: "goblin",
      hp: 30 + scale * 6,
      atk: 6 + scale,
      def: 3 + Math.floor(scale / 2)
    };
  } else {
    // Skeleton: tankier, poison threat
    return {
      name: "skeleton",
      hp: 45 + scale * 8,
      atk: 7 + scale,
      def: 4 + scale
    };
  }
}

/* ========= COMBAT ========= */
function startCombat(e: any) {
  enemy = e;
  fightUsedWeapon = false;
  fightHitArmor = false;
  combatText = `A ${enemy.name} confronts you.`;
  mode = "combat";
  renderCombat();
}

function die() {
  if (player.isDead) return; // 🔒 latch

  player.hp = 0; // Ensure HP shows 0
  player.isDead = true;
  mode = "dead";

  mapEl.innerHTML = `<pre>


    ██████   █████  ███    ███ ███████ 
   ██       ██   ██ ████  ████ ██      
   ██   ███ ███████ ██ ████ ██ █████   
   ██    ██ ██   ██ ██  ██  ██ ██      
    ██████  ██   ██ ██      ██ ███████ 

    ██████  ██    ██ ███████ ██████  
   ██    ██ ██    ██ ██      ██   ██ 
   ██    ██ ██    ██ █████   ██████  
   ██    ██  ██  ██  ██      ██   ██ 
    ██████    ████   ███████ ██   ██ 


   You have fallen on floor ${floor}.
   
   Final level: ${playerLevel}
   
   [R] Restart
   [N] New Game

</pre>`;

  panelEl.innerHTML = `<pre>
Your journey ends here...

The dungeon claims another soul.

YOU DIED.

[R] Restart
</pre>`;
}

function combatTurn(action: "attack" | "retreat") {
  player.hpFlash = null;
  combatText = "";

  if (action === "attack") {
    fightUsedWeapon = true;

    const attack = roll(atk()) * 4; // amplify variance

    const mitigated = Math.floor(
      attack * (1 - enemy.def / (enemy.def + 35))
    );

    const dmg = Math.max(1, mitigated);

    enemy.hp -= dmg;
    combatText += `You deal ${dmg} damage.\n`;

    

if (enemy.hp <= 0) {
  combatText += `The ${enemy.name} falls.\n`;

  const loot = generateLoot(enemy.level || 1);

  combatText += `You gain ${loot.gold} gold and ${loot.exp} EXP.\n`;

  player.gold += loot.gold || 0;
  player.exp += loot.exp;

  console.log("Inventory:", player.inventory);

  if (loot.drop) {
    player.inventory.push(loot.drop);
    lastLootText = `Found: ${loot.drop.name} (ATK ${loot.drop.attack})`;
  } else {
    lastLootText = "Nothing dropped.";
  }

  
mode = "loot";
renderMap();
return;

  return;
}


  }

  

  if (action === "retreat") {

    stats.retreatAttempts++;   // ✅ track attempt
  
    combatText = "RETREAT!\n";
  
    if (Math.ceil(Math.random() * 6) >= 5) {
  
      stats.retreatSuccesses++;   // ✅ track success
  
      combatText += "You escape successfully.";
  
      if (triggerAwakening()) return;
  
      resolveEncounter(false);
      return;
    }
  }
  

  fightHitArmor = true;

  const attack = roll(enemy.atk) * 2;

  const damage = Math.floor(
    attack * (1 - def() / (def() + 20))
  );

  const edmg = Math.max(1, damage);

  player.hp -= edmg;
  player.hpFlash = "damage";

  combatText += `\n${enemy.name} deals ${edmg} damage.`;

  if (
    enemy.name === "skeleton" &&
    !player.poisoned &&
    edmg > 0 &&
    Math.random() < 0.3
  ) {
    player.poisoned = true;
    combatText += `\nYou are poisoned!`;
  }

  if (player.hp <= 0) {
    die();
    return;
  }

  renderCombat();
  renderMap();
}

function generateLoot(level: number) {
  return {
    gold: Math.floor(Math.random() * 10 + level * 2),
    exp: Math.floor(Math.random() * 8 + level),
    drop: rollDrop(level)
  };
}



function rollDrop(level: number) {
  const roll = Math.random();

  if (roll < 0.5) return null;        // 50% nothing
  if (roll < 0.75) return createWeapon(level);  // 25% weapon

  return createWeapon(level); // temp (we’ll swap for armor later)
}


function getTier(level: number, tiers: any[]) {
  return tiers.find(t => level >= t.min && level < t.max);
}

function rollStat(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getAdjective() {
  return adjectives[Math.floor(Math.random() * adjectives.length)];
}

function createWeapon(level: number) {
  const tier = getTier(level, weaponTiers) || weaponTiers[0];
  const adj = getAdjective();

  const baseAtk = rollStat(tier.atkMin, tier.atkMax);

  return {
    type: "weapon",
    name: `${adj.name} ${tier.name} Sword`,
    attack: Math.round(baseAtk * (1 + adj.mod))
  };
}

function resolveEncounter(killed: boolean) {
  if (fightUsedWeapon && player.weapon) {
    player.weapon.dur--;
    if (player.weapon.dur <= 0) player.weapon = null; // Break it
  }
  if (fightHitArmor && player.armor) {
    player.armor.dur--;
    if (player.armor.dur <= 0) player.armor = null; // Break it
  }

  if (player.weapon?.dur === 0) player.weapon = null;
  if (player.armor?.dur === 0) player.armor = null;

  

  
if (killed) {

  stats.enemiesKilled++;   // ✅ ADD IT HERE (top of block)

  if (triggerAwakening()) return;

  const xpGain = xpPerKillForFloor(floor);

    player.xp += xpGain;

    checkLevelUp();

    if (Math.random() < 0.5)
      player.gold += 10 + Math.floor(Math.random() * 20);

    console.log(
      "XP gained:", xpGain,
      "Total XP:", player.xp,
      "Floor:", floor
    );

    if (Math.random() < 0.5)
      player.gold += 10 + Math.floor(Math.random() * 20);
  }

  enemy = null;
  mode = "explore";
  renderMap();
}

function renderPause() {
  const xpToNext = xpNeededForNextLevel(playerLevel);

  pauseOverlay.innerHTML = `
    

 
<div class="pause-title title">
<span class="title-letter">R</span>
<span class="title-letter">E</span>
<span class="title-letter">T</span>
<span class="title-letter">R</span>
<span class="title-letter">E</span>
<span class="title-letter">A</span>
<span class="title-letter">T</span>
<span class="title-letter">!</span>
</div>



<div class="pause-box">

      <div style="text-align:center; color: #ff0000; font-size: 1.5rem; margin-bottom: 20px;">
        PAUSED
      </div>
      <pre style="color: #fff; line-height: 1.5;">
[ ${playerClass} ]
Level: ${playerLevel}
HP:    ${player.hp} / ${player.maxHP}
XP:    ${player.xp} / ${xpToNext}
Gold:  ${player.gold}

[ COMBAT ]
STR:   ${player.strength}
DEF:   ${player.defense}

[ ENCOUNTERS ]
Killed:    ${stats.enemiesKilled}
Retreats:  ${stats.retreatSuccesses} / ${stats.retreatAttempts}
Success:   ${getRetreatRate()}%

[ EQUIPMENT ]
Weapon: ${player.weapon ? `${player.weapon.dur}/${MAX_DUR} Dur` : "NONE"}
Armor:  ${player.armor ? `${player.armor.dur}/${MAX_DUR} Dur` : "NONE"}
      </pre>
      <div style="margin-top: 20px; text-align: center; color: #666;">
        [P] RESUME | [N] NEW GAME
      </div>
    </div>
  `;
}


function renderLeftPanel() {
  leftPanel.innerHTML = `<pre>
BARBARIAN — Lvl ${playerLevel}

HP   ${player.hp} / ${player.maxHP}
XP   ${player.xp}

STR  ${player.strength}
DEF  ${player.defense}

GOLD ${player.gold}

WEAPON DUR ${player.weapon?.dur ?? 0}
ARMOR  DUR ${player.armor?.dur ?? 0}
</pre>`;
}


function renderFooter() {
  const footer = document.getElementById("footer")!;
  footer.innerHTML = `[P] Pause   [N] New Game`;
}


function renderTitle() {
  
  playTownMusic();

  document.body.classList.add("title-screen");

  if (titleLoop) clearInterval(titleLoop);

  mapEl.innerHTML = `<pre>

 
  <span class="title"><span class="spin-in spin-0">R</span><span class="spin-in spin-1">E</span><span class="spin-in spin-2">T</span><span class="spin-in spin-3">R</span><span class="spin-in spin-4">E</span><span class="spin-in spin-5">A</span><span class="spin-in spin-6">T</span><span class="spin-in spin-7">!</span></span>



[N] New Game


Controls:
Arrow keys – Move
[Space]     – Attack
[R]         – Retreat!


</pre>`;

  panelEl.innerHTML = "";

  titleLoop = setInterval(() => {
    if (mode === "title") renderTitle();
  }, 15000);
}


/* ========= RENDER ========= */
function renderCombat() {
  renderLeftPanel();
  panelEl.innerHTML = `
<img src="./assets/portraits/${enemy.name}.png" />
<pre>
${enemy.name.toUpperCase()} (HP ${enemy.hp})

${combatText}

[SPACE] Attack
[R] Retreat
</pre>
`;
}

function renderMap() {
  torchTime += 0.08; // speed of flicker (tune this)
  
const torchFlicker =
0.9 +
Math.sin(torchTime * 5) * 0.08 +
Math.sin(torchTime * 11) * 0.05 +
(Math.random() * 0.05);

  if (mode === "pause") return;
  if (mode === "explore") poisonTick();
  renderLeftPanel();
  renderFooter();
  let out = [];
  for (let y = 0; y < MAP_H; y++) {
    let r = "";
    for (let x = 0; x < MAP_W; x++) {
      const isFallen = fallen.some(f => f.floor === floor && f.x === x && f.y === y);
      

      const isEnemy = mapEnemies.find(e => e.x === x && e.y === y);
      const isCone = mapEnemies.some(e => {
        const cx = e.x + e.dir[0];
        const cy = e.y + e.dir[1];
        return cx === x && cy === y;
      });
      

      

      
let ch = " ";

if (x === player.x && y === player.y) {
  const glow =
    0.75 +
    Math.sin(torchTime * 6) * 0.15 +
    Math.random() * 0.1;

  ch = `<span style="opacity:${glow}">@</span>`;
}
else if (isEnemy && visible[y][x]) {
  ch = "<span class='enemy'>■</span>";
}
else if (isFallen) {
  ch = "X";
}
else if (!seen[y][x]) {
  ch = " ";
}
else if (visible[y][x]) {
  const dx = Math.abs(player.x - x);
  const dy = Math.abs(player.y - y);
  const dist = dx + dy;

  const baseRadius = 6;
  
const baseFade = Math.max(0.05, 1 - dist / baseRadius);
const fade = baseFade * torchFlicker;


  ch = `<span style="opacity:${fade}">${map[y][x]}</span>`;
}
else if (seen[y][x] && isNearVisible(x, y)) {
  
const bleed = 0.06 + (Math.sin(torchTime * 7 + x + y) * 0.02);

ch = `<span style="opacity:${bleed}">${map[y][x]}</span>`;

}
else {
  ch = `<span style="opacity:0.05">${map[y][x]}</span>`;
}

      


      
      
      

      
      

      
      r += ch;
      
      

    }
    out.push(r);
  }
  
  const xpToNext = xpNeededForNextLevel(playerLevel);

  console.log("MAP RENDER MODE:", mapEl.innerHTML === mapEl.textContent ? "TEXT" : "HTML");
  

  

  

const trimmed = out.filter(row => row.trim() !== "");

mapEl.innerHTML =
  `Floor ${floor}\n\n` +
  trimmed.join("\n");






  

 
if (mode === "explore") {
  if (lastLootText) {
    panelEl.innerHTML = `<pre>${lastLootText}</pre>`;
    lastLootText = "";
  } else {
    panelEl.innerHTML = "";
  }
}

}

/* ========= INPUT ========= */
window.addEventListener("keydown", e => {
  


  

 
if (audioCtx && audioCtx.state === "suspended") {
  audioCtx.resume();
}

if (e.key.toLowerCase() === "p") {
  e.preventDefault();

  
if (mode === "pause") {
  mode = previousMode ?? "explore";

  stopTownMusic();

  if (mode === "explore") {
    playExploreMusic();
  }

  pauseOverlay.classList.remove("active");

if (mode === "loot") {

  const item = player.inventory[player.inventory.length - 1];

  if (e.key.toLowerCase() === "e" && item) {
    // Equip weapon
    player.weapon = {
      bonus: item.attack,
      dur: MAX_DUR
    };

    lastLootText = `Equipped: ${item.name}`;

    mode = "explore";
    renderMap();
    return;
  }

  if (e.key.toLowerCase() === "g" && item) {
    // Convert to gold
    const value = Math.floor(item.attack * 5);
    player.gold += value;

    lastLootText = `Converted for ${value} gold`;

    mode = "explore";
    renderMap();
    return;
  }

  return;
}

  if (mode === "combat") renderCombat();
  else renderMap();

  previousMode = null;
}

  
else if (mode === "explore" || mode === "combat") {
  previousMode = mode;
  mode = "pause";

  stopExploreMusic();
  playTownMusic();

  pauseOverlay.classList.add("active");
  renderPause();
}

  

  return;
}

  
  

  

if (mode === "monologue") {
  // Skip typing
  if (!monologueDone) {
    clearInterval(monologueInterval);
    const pre = mapEl.querySelector("pre")!;
    pre.textContent = monologueText + "\n\n[Press any key]";
    monologueDone = true;
    return;
  }

  stopTownMusic();
  playExploreMusic();

  mode = "explore";

  if (monologueResumeToExplore) {
    monologueResumeToExplore = false;
    renderMap(); // ✅ resume SAME floor
  } else {
    genFloor();  // ✅ normal between-floor transition
    renderMap();
  }

  return;
}



if (mode === "intro") {
  stopTownMusic();

  genFloor();
  playExploreMusic();

  mode = "explore";
  panelEl.innerHTML = "";
  renderMap();
  return;
}


  

  if (mode !== "explore" && mode !== "combat" && mode !== "vendor" && mode !== "stairs" && mode !== "dead" && mode !== "title" && mode !== "intro") {
    mode = "explore";
  }
  
  console.log("KEY:", e.key, "CODE:", e.code, "MODE:", mode);
 

 

 

  if (e.key.toLowerCase() === "p") {
    e.preventDefault();
  
    
    return;
  }
  


  if (mode === "stairs") {
    e.preventDefault();
    e.stopImmediatePropagation();

    
if (e.code === "KeyY") {
  floor--;

  const text = MONOLOGUES[floor];
  if (text) {
    startMonologue(text);
    return; // IMPORTANT: pause here
  }

  mode = "explore";
  genFloor();
  renderMap();
}


    if (e.code === "KeyN") {
      mode = "explore";
      renderMap();
    }

    return;
  }

  if (mode === "title") {
    if (e.key.toLowerCase() === "n") {
      document.body.classList.remove("title-screen");
      mode = "intro";
  
      mapEl.innerHTML = `<pre class="heartbeat">
  You wake up on cold stone.
  
  Still breathing.
  Barely.
  
  Something is wrong.
  But not wrong enough to stop moving.
  
  [ PRESS ANY KEY TO BEGIN ]
  </pre>`;
  
      panelEl.innerHTML = "";
    }
    return;
  }



  if (mode === "dead") {
    if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "n") {
      location.reload();
    }
    return;
  }

  // === NEW GAME (RELOAD) ===
  if (e.key.toLowerCase() === "n") {
    location.reload();
  }

  // ----- VENDOR INPUT -----
  if (mode === "vendor") {
    // Repair weapon (once)
    if (e.key === "1" && player.weapon && !vendorRepairWeaponUsed) {
      const cost = repairCost(player.weapon.dur);
      if (player.gold >= cost) {
        player.gold -= cost;
        player.weapon.dur = MAX_DUR;
        vendorRepairWeaponUsed = true;
        mode = "explore";
        renderMap();
      } else {
        vendorNoGold();
      }
      return;
    }

    // Repair armor (once)
    if (e.key === "2" && player.armor && !vendorRepairArmorUsed) {
      const cost = repairCost(player.armor.dur);
      if (player.gold >= cost) {
        player.gold -= cost;
        player.armor.dur = MAX_DUR;
        vendorRepairArmorUsed = true;
        mode = "explore";
        renderMap();
      } else {
        vendorNoGold();
      }
      return;
    }

    // Buy antidote (option 5)
    if (e.key === "5") {
      if (vendorAntidotes > 0 && player.gold >= 20) {
        vendorAntidotes--;
        player.gold -= 20;
        player.poisoned = false;
        mode = "explore";
        renderMap();
      } else { vendorNoGold(); }
      return;
    }

    // Buy used weapon
    if (e.key === "3") {
      if (player.gold >= USED_WEAPON_PRICE) {
        player.gold -= USED_WEAPON_PRICE;
        player.weapon = vendorGear(true);
        mode = "explore";
        renderMap();
      } else { vendorNoGold(); }
      return;
    }

    // Buy used armor
    if (e.key === "4") {
      if (player.gold >= USED_ARMOR_PRICE) {
        player.gold -= USED_ARMOR_PRICE;
        player.armor = vendorGear(false);
        mode = "explore";
        renderMap();
      } else { vendorNoGold(); }
      return;
    }

    // Leave vendor
    if (e.key.toLowerCase() === "l") {
      mode = "explore";
      renderMap();
      return;
    }

    return;
  }


 
  

  

 

  if (mode === "combat") {
    if (e.key === " ") {
      combatTurn("attack");
      return;
    }
    if (e.key.toLowerCase() === "r") {
      combatTurn("retreat");
      return;
    }
    return;
  }
  


  let dx = 0, dy = 0;
  if (e.key === "ArrowUp") dy = -1;
  if (e.key === "ArrowDown") dy = 1;
  if (e.key === "ArrowLeft") dx = -1;
  if (e.key === "ArrowRight") dx = 1;
  if (!dx && !dy) return;

  const nx = player.x + dx, ny = player.y + dy;
  if (map[ny]?.[nx] === "█") return;

  player.x = nx;
  player.y = ny;
  console.log("MODE AFTER MOVE:", mode);
  reveal();

// FORCE combat if enemy touches player
for (let i = 0; i < mapEnemies.length; i++) {
  const e = mapEnemies[i];

  if (e.x === player.x && e.y === player.y) {
    mapEnemies.splice(i, 1);

    startCombat({
      name: "goblin",
      hp: 30,
      atk: 6,
      def: 3
    });
    return;
  }
}

// FORCE combat if adjacent after movement
for (let i = 0; i < mapEnemies.length; i++) {
  const e = mapEnemies[i];

  const dx = Math.abs(e.x - player.x);
  const dy = Math.abs(e.y - player.y);

  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    mapEnemies.splice(i, 1);

    startCombat({
      name: "goblin",
      hp: 30,
      atk: 6,
      def: 3
    });
    return;
  }
}

  
// enemy update disabled


// Adjacent enemy detection



for (const e of mapEnemies) {
  if (!e.dir) e.dir = DIRS[0];
  if (!e.turn) e.turn = 0;
  if (e.aggro === undefined) e.aggro = false;
  if (!e.moves) e.moves = 0;

  e.turn++;

  if (e.turn >= 3 && !e.aggro) {
    e.dir = DIRS[Math.floor(Math.random() * DIRS.length)];
    e.turn = 0;
  }

  const coneX = e.x + (e.dir?.[0] ?? 0);
  const coneY = e.y + (e.dir?.[1] ?? 0);

  if (
    map[coneY] &&
    map[coneY][coneX] &&
    map[coneY][coneX] !== "█"
  ) {
    const dist =
      Math.abs(player.x - coneX) + Math.abs(player.y - coneY);

    if (!e.aggro && dist <= 3) {
      e.aggro = true;
      e.moves = 3;
    }
  }

  if (e.aggro && e.moves > 0) {
    const nx = e.x + Math.sign(player.x - e.x);
    const ny = e.y + Math.sign(player.y - e.y);

    if (
      map[ny] &&
      map[ny][nx] &&
      map[ny][nx] !== "█" &&
      !(nx === player.x && ny === player.y)
    ) {
      e.x = nx;
      e.y = ny;
    }

    e.moves--;

    if (e.moves <= 0) e.aggro = false;
  }
}





// Reset vendor trigger when leaving the tile
if (map[player.y][player.x] !== "W") {
  vendorVisitedThisFloor = false;
}

  const tile = map[player.y][player.x];

  if (tile === "W" && !vendorVisitedThisFloor) {
    vendorVisitedThisFloor = true;

    vendorRepairWeaponUsed = false;
    vendorRepairArmorUsed = false;
    vendorAntidotes = 2;

    mode = "vendor";
    panelEl.innerHTML = `<pre>
A figure waits in the shadows.

${(!vendorRepairWeaponUsed && player.weapon)
        ? `[1] Repair weapon (${repairCost(player.weapon.dur)}g)\n`
        : ""}

${(!vendorRepairArmorUsed && player.armor)
        ? `[2] Repair armor  (${repairCost(player.armor.dur)}g)\n`
        : ""}

[3] Buy used weapon (worn, overpriced)
[4] Buy used armor  (worn, overpriced)
[5] Buy antidote (${vendorAntidotes} left)
[L] Leave
</pre>`;
    return;
  }

  const fallenHere = fallen.find(
    f => f.floor === floor && f.x === player.x && f.y === player.y
  );

  if (fallenHere) {
    panelEl.innerHTML = `<pre>
My friend...

You didn't make it.
</pre>`;
  }





  if (tile === "▲") {
    mode = "stairs";
    panelEl.innerHTML = `<pre>
  Ascend to the next floor?
  
  [Y] Yes
  [N] No
  </pre>`;
    return;
  }

  if (tile === "⬆") {
    panelEl.innerHTML = `<pre>You escape.</pre>`;
    return;
  }


  if (Math.random() < ENCOUNTER_CHANCE) {
    startCombat(spawnEnemy());
    return;
  }
  if (mode === "combat") return;  

  renderMap();
});

/* ========= START ========= */
renderTitle();
