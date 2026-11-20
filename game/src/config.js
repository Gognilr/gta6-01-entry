// Every tuning number and colour in one place. Solara Bay is a fixed-size open world
// (3600 x 2600 world units); the renderer scales the camera to the window, so no rule
// below depends on the screen size.

export const STEP = 1 / 60;
export const WORLD = { width: 3600, height: 2600 };

/** Road centrelines. Roads are 110 units wide; the beach runs along the east edge. */
export const ROADS = {
  vertical: [420, 920, 1420, 1920, 2420, 2920],
  horizontal: [360, 820, 1280, 1740, 2200],
  halfWidth: 55,
  laneOffset: 26,
};

export const BEACH = { sandStart: 3250, waterStart: 3440 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 250,
  runSpeed: 380,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  bulletSpeed: 900,
  bulletDamage: 34,
  startAmmo: 60,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 560,
  brake: 900,
  reverseAccel: 320,
  maxSpeed: 640,
  maxReverse: 240,
  steerRate: 2.9,
  drag: 0.55,
  offRoadGrip: 0.45,
  health: 100,
  stealTime: 0.9,
};

export const SPORTS_CAR = { maxSpeed: 820, accel: 760, steerRate: 3.2 };

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const POLICE_MAX = 6;

export const WANTED = {
  max: 5,
  decaySecondsPerStar: 22,
  stealCar: 1,
  hitPedestrian: 1,
  shoot: 1,
  killCop: 1,
  bustedTouchSeconds: 1.6,
};

/** Police response by wanted level: how many cruisers hunt, how fast, whether they shoot. */
export const POLICE_RESPONSE = [
  { cars: 0, speed: 0, shoot: false },
  { cars: 1, speed: 560, shoot: false },
  { cars: 2, speed: 620, shoot: false },
  { cars: 3, speed: 680, shoot: true },
  { cars: 4, speed: 730, shoot: true },
  { cars: 6, speed: 780, shoot: true },
];

export const MONEY = {
  mission1: 800,
  mission2: 1200,
  mission3: 2500,
  pickupCash: 50,
};

export const SAVE_KEY = 'solara-bay.save.v1';

export const PALETTE = {
  backdrop: '#0e2a33',
  grass: '#7fae62',
  grassDark: '#6d9c55',
  sand: '#e8cf9a',
  water: '#2fa8b8',
  waterDeep: '#1d7f96',
  sidewalk: '#c9b98d',
  asphalt: '#3d4149',
  asphaltDark: '#34383f',
  lane: '#e8d98a',
  curb: '#a89a72',
  buildingRoof: ['#e07856', '#e8a04c', '#7fb8a4', '#d9c27a', '#c97b8a', '#8fa8c9', '#b98ac9', '#e8e0c8'],
  buildingWall: '#5c5348',
  parkPath: '#d8c49a',
  text: '#fff6e0',
  muted: '#c8bfa5',
  gold: '#f2c94c',
  danger: '#e5534b',
  police: '#2f6fb8',
  hudPanel: 'rgba(12, 20, 26, 0.72)',
  hudBorder: 'rgba(255, 246, 224, 0.25)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Fixed city seed: the same city every visit, so the map is learnable. */
export const CITY_SEED = 20261121;
