// Solara Bay, the city itself: a fixed seeded layout of roads, blocks, buildings,
// parks, the beach and the named places the story uses. Everything is data — no
// drawing here — so the world, the renderer and the minimap all read the same city.

import { BEACH, CITY_SEED, PALETTE, ROADS, WORLD } from './config.js';
import { createRandom, pick, range } from './random.js';

/** Named places the story and the missions point at. */
export const PLACES = {
  safehouse: { x: 300, y: 2060, label: "Mara's Garage" },
  hospital: { x: 800, y: 1420, label: 'Solara General' },
  marina: { x: 3080, y: 2060, label: 'Solara Marina' },
  hotel: { x: 2170, y: 1510, label: 'Grand Solara Hotel' },
  bank: { x: 1560, y: 960, label: 'Solara Trust Bank' },
  motel: { x: 3060, y: 1600, label: 'The Palms Motel' },
  garage: { x: 800, y: 500, label: 'Ace Auto' },
  tower: { x: 2170, y: 500, label: 'Crane Tower' },
  boardwalk: { x: 3330, y: 1280, label: 'The Boardwalk' },
  port: { x: 180, y: 1000, label: 'Port Solara' },
  plaza: { x: 1670, y: 1510, label: 'Solara Plaza' },
};

function buildCity() {
  const random = createRandom(CITY_SEED);
  const buildings = [];
  const trees = [];
  const parks = [];
  const parkingLots = [];

  function addBuilding(x, y, w, h, name) {
    buildings.push({
      x, y, w, h,
      color: pick(random, PALETTE.buildingRoof),
      name: name ?? null,
      windows: Math.max(2, Math.floor(w / 46)),
      floors: Math.max(1, Math.floor(h / 52)),
    });
  }

  // Landmark buildings first, so generated blocks never cover them.
  addBuilding(2080, 1420, 180, 180, PLACES.hotel.label);
  addBuilding(1480, 880, 160, 160, PLACES.bank.label);
  addBuilding(2080, 420, 180, 160, PLACES.tower.label);
  addBuilding(720, 420, 160, 120, PLACES.garage.label);
  addBuilding(240, 1980, 140, 130, PLACES.safehouse.label);
  addBuilding(720, 1340, 160, 120, PLACES.hospital.label);
  addBuilding(2980, 1520, 150, 130, PLACES.motel.label);
  addBuilding(2980, 1980, 170, 140, PLACES.marina.label);
  // Port containers: a row of low solid blocks on the west edge.
  for (let i = 0; i < 5; i += 1) {
    addBuilding(90, 820 + i * 110, 130, 80, i === 0 ? PLACES.port.label : null);
  }

  function overlapsLandmark(x, y, w, h) {
    for (const b of buildings) {
      if (x < b.x + b.w + 30 && x + w + 30 > b.x && y < b.y + b.h + 30 && y + h + 30 > b.y) return true;
    }
    return false;
  }

  // Fill every block between the roads with buildings, a park, or a parking lot.
  const xs = [0, ...ROADS.vertical, WORLD.width];
  const ys = [0, ...ROADS.horizontal, WORLD.height];
  for (let ci = 0; ci < xs.length - 1; ci += 1) {
    for (let ri = 0; ri < ys.length - 1; ri += 1) {
      const x0 = xs[ci] + (ci === 0 ? 20 : ROADS.halfWidth + 14);
      const x1 = xs[ci + 1] - (ci === xs.length - 2 ? 20 : ROADS.halfWidth + 14);
      const y0 = ys[ri] + (ri === 0 ? 20 : ROADS.halfWidth + 14);
      const y1 = ys[ri + 1] - (ri === ys.length - 2 ? 20 : ROADS.halfWidth + 14);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 90 || bh < 90 || x0 > BEACH.sandStart) continue;
      const roll = random();
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: bw, h: bh });
        const count = Math.floor((bw * bh) / 9000);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), palm: random() < 0.6 });
        }
        continue;
      }
      if (roll < 0.26) {
        parkingLots.push({ x: x0, y: y0, w: bw, h: bh });
        continue;
      }
      const cols = bw > 300 ? 2 : 1;
      const rows = bh > 280 ? 2 : 1;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const bx = x0 + (c * bw) / cols + 8;
          const by = y0 + (r * bh) / rows + 8;
          const bw2 = bw / cols - 24;
          const bh2 = bh / rows - 24;
          if (bw2 < 60 || bh2 < 60) continue;
          if (overlapsLandmark(bx, by, bw2, bh2)) continue;
          addBuilding(bx, by, bw2, bh2);
        }
      }
    }
  }

  // Palm-lined boulevard down the middle avenue and along the beach.
  for (let y = 120; y < WORLD.height - 100; y += 170) {
    trees.push({ x: 1920 - 78, y, palm: true });
    trees.push({ x: 1920 + 78, y: y + 80, palm: true });
  }
  for (let y = 200; y < WORLD.height - 100; y += 190) {
    trees.push({ x: 3300, y, palm: true });
  }

  return { buildings, trees, parks, parkingLots };
}

export const CITY = buildCity();

export function isInWater(x, y) {
  return x > BEACH.waterStart;
}

export function isOnRoad(x, y) {
  for (const vx of ROADS.vertical) {
    if (Math.abs(x - vx) <= ROADS.halfWidth) return true;
  }
  for (const hy of ROADS.horizontal) {
    if (Math.abs(y - hy) <= ROADS.halfWidth) return true;
  }
  return false;
}

/** The road centreline nearest a point, for spawning and for traffic turns. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const vx of ROADS.vertical) {
    const d = Math.abs(x - vx);
    if (d < bestD) { bestD = d; best = { x: vx, y }; }
  }
  for (const hy of ROADS.horizontal) {
    const d = Math.abs(y - hy);
    if (d < bestD) { bestD = d; best = { x, y: hy }; }
  }
  return best;
}

export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return { x: pick(random, ROADS.vertical), y: range(random, 80, WORLD.height - 80) };
  }
  return { x: range(random, 80, BEACH.sandStart - 80), y: pick(random, ROADS.horizontal) };
}

/** A point just off a road, where pedestrians walk. */
export function randomSidewalkPoint(random) {
  const p = randomRoadPoint(random);
  const vertical = ROADS.vertical.includes(p.x);
  if (vertical) p.x += (random() < 0.5 ? -1 : 1) * (ROADS.halfWidth + 16);
  else p.y += (random() < 0.5 ? -1 : 1) * (ROADS.halfWidth + 16);
  return p;
}

function circleHitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

export function collidesWithBuilding(x, y, radius) {
  for (const b of CITY.buildings) {
    if (circleHitsRect(x, y, radius, b)) return b;
  }
  return null;
}

/**
 * Push a circle out of every building and out of the water, one pass at a time.
 * Returns true when anything pushed, so a car knows it hit something.
 */
export function resolveCircle(x, y, radius) {
  let pushed = false;
  for (const b of CITY.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - cx;
    let dy = y - cy;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < radius) {
      pushed = true;
      if (d < 0.001) { dx = 0; dy = -1; d = 1; }
      const push = radius - d;
      x += (dx / d) * push;
      y += (dy / d) * push;
    }
  }
  if (x > BEACH.waterStart - radius) {
    x = BEACH.waterStart - radius;
    pushed = true;
  }
  if (x < radius) { x = radius; pushed = true; }
  if (y < radius) { y = radius; pushed = true; }
  if (x > WORLD.width - radius) { x = WORLD.width - radius; pushed = true; }
  if (y > WORLD.height - radius) { y = WORLD.height - radius; pushed = true; }
  return { x, y, pushed };
}
