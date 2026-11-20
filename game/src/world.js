// The game's rules and state, with no drawing and no browser in it: the player on
// foot and in cars, traffic, pedestrians, police, the wanted level, combat, pickups,
// particles and the mission chain. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (sounds, announcements) without the
// world knowing about screens or sound. Nothing here allocates after createWorld.

import { BEACH, CAR, MONEY, PLAYER, POLICE_MAX, POLICE_RESPONSE, SPORTS_CAR, TRAFFIC_COUNT, PED_COUNT, WANTED, WORLD } from './config.js';
import { CITY, PLACES, collidesWithBuilding, isInWater, isOnRoad, nearestRoadPoint, randomRoadPoint, randomSidewalkPoint, resolveCircle } from './city.js';
import { STAGE_DELIVER, STAGE_ESCAPE, STAGE_FIGHT, STAGE_GOTO, STAGE_GRAB_CASH, STAGE_PICKUP, STAGE_STEAL_CAR, advanceStage, createMissionTracker, currentMission, currentStage } from './missions.js';
import { clamp, distance, lerp } from './random.js';

export const EVENT_SHOT = 1;
export const EVENT_CRASH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_CASH = 8;
export const EVENT_MISSION = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_CAR_STOLEN = 128;
export const EVENT_PUNCH = 256;
export const EVENT_EXPLOSION = 512;
export const EVENT_WANTED_UP = 1024;
export const EVENT_HIT = 2048;

export const CAR_MODELS = [
  { name: 'Vulture', length: 62, width: 30, color: '#c94f43' },
  { name: 'Panto', length: 54, width: 28, color: '#4f7ec9' },
  { name: 'Bison', length: 74, width: 34, color: '#8a8f96' },
  { name: 'Comet', length: 60, width: 30, color: '#e8b73c' },
  { name: 'Solano', length: 66, width: 31, color: '#5fae7a' },
  { name: 'Regina', length: 68, width: 32, color: '#c98ab0' },
];

const PED_SHIRTS = ['#e8e0c8', '#7fb8a4', '#c97b8a', '#8fa8c9', '#e8a04c', '#b98ac9', '#d9c27a', '#6d9c55'];
const TRAFFIC_COLORS = ['#c94f43', '#4f7ec9', '#8a8f96', '#e8b73c', '#5fae7a', '#c98ab0', '#e8e0c8', '#3d4149'];

function carRadius(car) {
  return car.length * 0.5;
}

export function createWorld(random) {
  const player = {
    x: PLACES.safehouse.x, y: PLACES.safehouse.y, angle: -Math.PI / 2,
    health: PLAYER.health, cash: 0, ammo: PLAYER.startAmmo,
    inCar: null, punchCooldown: 0, shootCooldown: 0, invulnerable: 0,
    wanted: 0, wantedTimer: 0, crimeTimer: 0, bustedTimer: 0,
    walkCycle: 0, moving: false,
  };

  const cars = [];
  const peds = [];
  const bullets = [];
  const pickups = [];
  const particles = [];
  const skidMarks = [];
  const guards = [];
  const camera = { x: player.x, y: player.y, zoom: 1, shake: 0 };

  const missions = createMissionTracker();
  const state = {
    player, cars, peds, bullets, pickups, particles, skidMarks, guards, camera,
    missions, elapsed: 0, missionToast: null, missionToastTimer: 0,
    cometOwned: false, storyBanner: null, freeRoam: false,
    sirenHigh: false, sirenTimer: 0,
  };

  function makeCar(x, y, angle, model, kind) {
    return {
      x, y, angle, speed: 0, model, kind,
      health: CAR.health, driver: kind === 'traffic' ? 'traffic' : null,
      owner: null, wanted: false, smokeTimer: 0,
      waypoint: null, waitTimer: 0, sirenPhase: random() * Math.PI * 2,
    };
  }

  function spawnTrafficCar() {
    const point = randomRoadPoint(random);
    const model = CAR_MODELS[Math.floor(random() * CAR_MODELS.length)];
    const car = makeCar(point.x, point.y, random() * Math.PI * 2, model, 'traffic');
    car.speed = 200 + random() * 90;
    car.color = TRAFFIC_COLORS[Math.floor(random() * TRAFFIC_COLORS.length)];
    pickTrafficWaypoint(car);
    cars.push(car);
    return car;
  }

  function pickTrafficWaypoint(car) {
    // Next intersection along the road network, then a turn or straight on.
    const near = nearestRoadPoint(car.x, car.y);
    const onVertical = Math.abs(car.x - near.x) < Math.abs(car.y - near.y);
    const options = [];
    if (onVertical) {
      for (const hy of [360, 820, 1280, 1740, 2200]) {
        if (Math.abs(hy - car.y) > 120) options.push({ x: near.x, y: hy });
      }
    } else {
      for (const vx of [420, 920, 1420, 1920, 2420, 2920]) {
        if (Math.abs(vx - car.x) > 120) options.push({ x: vx, y: near.y });
      }
    }
    car.waypoint = options.length ? options[Math.floor(random() * options.length)] : { x: near.x, y: near.y };
  }

  function spawnParkedCar() {
    const point = randomSidewalkPoint(random);
    const model = CAR_MODELS[Math.floor(random() * CAR_MODELS.length)];
    const car = makeCar(point.x, point.y, (random() < 0.5 ? 0 : Math.PI / 2) + (random() < 0.5 ? 0 : Math.PI), model, 'parked');
    car.color = TRAFFIC_COLORS[Math.floor(random() * TRAFFIC_COLORS.length)];
    cars.push(car);
    return car;
  }

  function spawnPed() {
    const point = randomSidewalkPoint(random);
    peds.push({
      x: point.x, y: point.y, angle: random() * Math.PI * 2,
      speed: 40 + random() * 30, shirt: PED_SHIRTS[Math.floor(random() * PED_SHIRTS.length)],
      state: 'walk', target: point, waitTimer: 0, downTimer: 0, fleeX: 0, fleeY: 0, walkCycle: random() * 6,
    });
  }

  function spawnPickup(kind) {
    const point = randomSidewalkPoint(random);
    pickups.push({ x: point.x, y: point.y, kind, active: true, respawnTimer: 0, bob: random() * 6 });
  }

  function spawnParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const s = speed * (0.3 + random() * 0.7);
      particles.push({
        x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        life: life * (0.5 + random() * 0.5), maxLife: life, color, size: size * (0.6 + random() * 0.8),
      });
    }
  }

  function scarePeds(x, y, radius) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (distance(ped.x, ped.y, x, y) < radius) {
        ped.fleeTimer = 1.6;
        ped.fleeX = x;
        ped.fleeY = y;
      }
    }
  }

  function explodeCar(car) {
    spawnParticles(car.x, car.y, 42, '#ff9a3c', 320, 0.9, 7);
    spawnParticles(car.x, car.y, 26, '#3d4149', 160, 1.4, 9);
    spawnParticles(car.x, car.y, 18, '#f2c94c', 420, 0.5, 5);
    camera.shake = Math.max(camera.shake, 14);
    if (player.inCar === car) {
      player.health -= 40;
      player.inCar = null;
    }
    car.health = 0;
    car.driver = null;
    car.kind = 'wreck';
    scarePeds(car.x, car.y, 320);
  }

  function addWanted(amount) {
    if (amount <= 0) return false;
    const before = player.wanted;
    player.wanted = Math.min(WANTED.max, player.wanted + amount);
    player.wantedTimer = WANTED.decaySecondsPerStar;
    player.crimeTimer = 6;
    return player.wanted > before;
  }

  function damagePlayer(amount) {
    if (player.invulnerable > 0) return;
    player.health -= amount;
    player.invulnerable = 0.35;
  }

  function spawnPoliceCar() {
    // Cruisers arrive from a road point away from the player, never on top of them.
    for (let tries = 0; tries < 12; tries += 1) {
      const point = randomRoadPoint(random);
      if (distance(point.x, point.y, player.x, player.y) > 650) {
        const car = makeCar(point.x, point.y, 0, CAR_MODELS[0], 'police');
        car.model = { name: 'Cruiser', length: 64, width: 32, color: '#1f2a33' };
        car.color = '#e8e0c8';
        car.driver = 'police';
        car.speed = 300;
        cars.push(car);
        return car;
      }
    }
    return null;
  }

  function spawnGuards() {
    const bank = PLACES.bank;
    for (let i = 0; i < 4; i += 1) {
      guards.push({
        x: bank.x - 90 + i * 60, y: bank.y - 110 + (i % 2) * 220,
        angle: 0, health: 60, alive: true, shootCooldown: 1 + random(), speed: 90,
      });
    }
  }

  function ensureMissionSetup() {
    const stage = currentStage(missions);
    if (!stage) return;
    if (stage.type === STAGE_STEAL_CAR && !state.cometSpawned) {
      state.cometSpawned = true;
      const comet = makeCar(PLACES.hotel.x + 40, PLACES.hotel.y + 230, Math.PI / 2, { name: 'Comet GT', length: 60, width: 30, color: '#e8b73c' }, 'parked');
      comet.color = '#e8b73c';
      comet.isComet = true;
      cars.push(comet);
    }
    if (stage.type === STAGE_FIGHT && guards.length === 0) spawnGuards();
  }

  function completeStage(events) {
    const stage = currentStage(missions);
    if (!stage) return events;
    const result = advanceStage(missions);
    if (result.missionComplete) {
      player.cash += result.reward;
      state.missionToast = `${result.title} complete — $${result.reward}`;
      state.missionToastTimer = 4;
      events |= EVENT_MISSION | EVENT_CASH;
      if (result.storyComplete) {
        state.storyBanner = 'STORY COMPLETE — You are the King of Solara Bay';
        state.freeRoam = true;
      }
    }
    return events;
  }

  function checkMissionProgress(events) {
    const stage = currentStage(missions);
    if (!stage) return events;
    const px = player.x;
    const py = player.y;
    const d = distance(px, py, stage.place.x, stage.place.y);
    if (stage.type === STAGE_GOTO || stage.type === STAGE_DELIVER || stage.type === STAGE_ESCAPE) {
      if (d < stage.radius) return completeStage(events);
    } else if (stage.type === STAGE_PICKUP || stage.type === STAGE_GRAB_CASH) {
      if (!player.inCar && d < stage.radius) return completeStage(events);
    } else if (stage.type === STAGE_FIGHT) {
      const alive = guards.filter((g) => g.alive).length;
      if (alive === 0) return completeStage(events);
    }
    return events;
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    bullets.length = 0;
    pickups.length = 0;
    particles.length = 0;
    skidMarks.length = 0;
    guards.length = 0;
    player.x = PLACES.safehouse.x;
    player.y = PLACES.safehouse.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.cash = 0;
    player.ammo = PLAYER.startAmmo;
    player.inCar = null;
    player.wanted = 0;
    player.wantedTimer = 0;
    player.crimeTimer = 0;
    player.bustedTimer = 0;
    player.invulnerable = 0;
    state.elapsed = 0;
    state.missionToast = null;
    state.missionToastTimer = 0;
    state.cometOwned = false;
    state.cometSpawned = false;
    state.storyBanner = null;
    state.freeRoam = false;
    missions.missionIndex = 0;
    missions.stageIndex = 0;
    missions.stageState = {};
    missions.completed = 0;
    missions.storyDone = false;
    camera.x = player.x;
    camera.y = player.y;
    camera.shake = 0;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    for (let i = 0; i < 6; i += 1) spawnParkedCar();
    for (let i = 0; i < PED_COUNT; i += 1) spawnPed();
    spawnPickup('health');
    spawnPickup('health');
    spawnPickup('cash');
    spawnPickup('cash');
    spawnPickup('repair');
    spawnPickup('repair');
  }

  function applySave(data) {
    reset();
    if (!data) return;
    player.cash = data.cash || 0;
    player.health = data.health || PLAYER.health;
    player.ammo = data.ammo || PLAYER.startAmmo;
    player.x = data.x ?? PLACES.safehouse.x;
    player.y = data.y ?? PLACES.safehouse.y;
    missions.missionIndex = Math.min(data.missionIndex || 0, 3);
    missions.completed = data.completed || 0;
    missions.storyDone = !!data.storyDone;
    state.cometOwned = !!data.cometOwned;
    state.freeRoam = missions.storyDone;
    if (state.cometOwned) {
      const comet = makeCar(player.x + 60, player.y, 0, { name: 'Comet GT', length: 60, width: 30, color: '#e8b73c' }, 'parked');
      comet.color = '#e8b73c';
      comet.isComet = true;
      comet.owner = 'player';
      cars.push(comet);
    }
  }

  function makeSaveData() {
    return {
      cash: player.cash,
      health: Math.max(1, Math.round(player.health)),
      ammo: player.ammo,
      x: Math.round(player.x),
      y: Math.round(player.y),
      missionIndex: missions.missionIndex,
      completed: missions.completed,
      storyDone: missions.storyDone,
      cometOwned: state.cometOwned,
      savedAt: Date.now(),
    };
  }

  function nearestCarWithin(x, y, maxDistance) {
    let best = null;
    let bestD = maxDistance;
    for (const car of cars) {
      if (car.kind === 'wreck') continue;
      const d = distance(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function tryEnterCar() {
    if (player.inCar) {
      // Step out on the driver's side.
      const car = player.inCar;
      player.inCar = null;
      player.x = car.x - Math.sin(car.angle) * 30;
      player.y = car.y + Math.cos(car.angle) * 30;
      player.angle = car.angle;
      const fixed = resolveCircle(player.x, player.y, PLAYER.radius);
      player.x = fixed.x;
      player.y = fixed.y;
      return 0;
    }
    const car = nearestCarWithin(player.x, player.y, 70);
    if (!car) return 0;
    let events = 0;
    if (car.owner !== 'player' && car.driver !== 'player') {
      if (car.isComet) state.cometOwned = true;
      else if (car.kind === 'police') { /* stealing a cruiser is a crime too */ }
      car.owner = 'player';
      if (addWanted(WANTED.stealCar)) events |= EVENT_WANTED_UP;
      events |= EVENT_CAR_STOLEN;
    }
    car.driver = 'player';
    player.inCar = car;
    const stage = currentStage(missions);
    if (stage && stage.type === STAGE_STEAL_CAR && car.isComet) events = completeStage(events);
    return events;
  }

  function tryPunch() {
    if (player.inCar || player.punchCooldown > 0) return 0;
    player.punchCooldown = PLAYER.punchCooldown;
    let events = EVENT_PUNCH;
    const reach = PLAYER.punchRange + PLAYER.radius;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (distance(player.x, player.y, ped.x, ped.y) < reach) {
        ped.state = 'down';
        ped.downTimer = 6;
        spawnParticles(ped.x, ped.y, 8, '#e8e0c8', 120, 0.4, 4);
        if (addWanted(WANTED.hitPedestrian)) events |= EVENT_WANTED_UP;
        break;
      }
    }
    for (const guard of guards) {
      if (!guard.alive) continue;
      if (distance(player.x, player.y, guard.x, guard.y) < reach) {
        guard.health -= PLAYER.punchDamage * 2;
        if (guard.health <= 0) guard.alive = false;
        break;
      }
    }
    return events;
  }

  function shootAt(targetX, targetY) {
    if (player.inCar || player.shootCooldown > 0 || player.ammo <= 0) return 0;
    player.shootCooldown = PLAYER.shootCooldown;
    player.ammo -= 1;
    const angle = Math.atan2(targetY - player.y, targetX - player.x);
    player.angle = angle;
    bullets.push({
      x: player.x + Math.cos(angle) * 20, y: player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: 0.9, fromPlayer: true,
    });
    spawnParticles(player.x + Math.cos(angle) * 26, player.y + Math.sin(angle) * 26, 4, '#f2c94c', 200, 0.12, 3);
    scarePeds(player.x, player.y, 300);
    let events = EVENT_SHOT;
    player.crimeTimer = 6;
    player.wantedTimer = WANTED.decaySecondsPerStar;
    if (player.wanted === 0) {
      player.wanted = 1;
      events |= EVENT_WANTED_UP;
    }
    return events;
  }

  function updatePlayerOnFoot(dt, held) {
    const speed = held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = held.mx;
    let my = held.my;
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 0) { mx /= len; my /= len; }
    player.moving = len > 0;
    if (player.moving) {
      player.angle = Math.atan2(my, mx);
      player.walkCycle += dt * 10;
    }
    let nx = player.x + mx * speed * dt;
    let ny = player.y + my * speed * dt;
    if (isInWater(nx, ny)) { nx = player.x; ny = player.y; }
    const fixed = resolveCircle(nx, ny, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.shootCooldown > 0) player.shootCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (held.shoot && held.aim) {
      // Mouse aim: the caller passes world coordinates in held.aim.
      return shootAt(held.aim.x, held.aim.y);
    }
    return 0;
  }

  function driveCar(car, dt, accelInput, steerInput, handbrake) {
    const maxSpeed = car.isComet || car.kind === 'sports' ? SPORTS_CAR.maxSpeed : CAR.maxSpeed;
    const accel = car.isComet || car.kind === 'sports' ? SPORTS_CAR.accel : CAR.accel;
    const onRoad = isOnRoad(car.x, car.y);
    const grip = onRoad ? 1 : CAR.offRoadGrip;
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    if (accelInput > 0) car.speed += accel * grip * dt * accelInput;
    else if (accelInput < 0) {
      if (car.speed > 30) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * grip * dt;
    } else {
      car.speed -= car.speed * CAR.drag * dt;
    }
    if (handbrake) {
      car.speed -= car.speed * 2.4 * dt;
      if (Math.abs(car.speed) > 180 && random() < 0.5) {
        skidMarks.push({ x1: car.x, y1: car.y, x2: car.x - forwardX * 8, y2: car.y - forwardY * 8, life: 4 });
      }
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, maxSpeed * grip + (onRoad ? 0 : 0));
    const steerFactor = clamp(Math.abs(car.speed) / 220, 0, 1);
    const steerRate = car.isComet ? SPORTS_CAR.steerRate : CAR.steerRate;
    car.angle += steerInput * steerRate * steerFactor * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Collide at the nose and the tail so the car cannot clip through a wall.
    const nose = resolveCircle(nx + Math.cos(car.angle) * 26, ny + Math.sin(car.angle) * 26, 16);
    const tail = resolveCircle(nx - Math.cos(car.angle) * 26, ny - Math.sin(car.angle) * 26, 16);
    let crashed = false;
    if (nose.pushed || tail.pushed) {
      crashed = Math.abs(car.speed) > 200;
      car.speed *= 0.45;
      if (crashed) {
        spawnParticles(car.x, car.y, 10, '#e8e0c8', 160, 0.4, 4);
        car.health -= 6;
      }
    }
    if (isInWater(nx, ny)) {
      car.speed *= 0.4;
    } else {
      car.x = (nose.x + tail.x) / 2;
      car.y = (nose.y + tail.y) / 2;
    }
    if (car.health <= 0 && car.kind !== 'wreck') {
      explodeCar(car);
      return EVENT_EXPLOSION;
    }
    return crashed ? EVENT_CRASH : 0;
  }

  function updateTrafficCar(car, dt) {
    if (car.kind !== 'traffic') return 0;
    if (!car.waypoint || distance(car.x, car.y, car.waypoint.x, car.waypoint.y) < 60) {
      pickTrafficWaypoint(car);
    }
    const targetAngle = Math.atan2(car.waypoint.y - car.y, car.waypoint.x - car.x);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
    // Slow for the car ahead in the same lane.
    let blocked = false;
    for (const other of cars) {
      if (other === car || other.kind === 'wreck') continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 110 && side < 40) { blocked = true; break; }
    }
    const want = blocked ? 0 : 260;
    car.speed = lerp(car.speed, want, Math.min(1, dt * 1.5));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveCircle(car.x, car.y, 18);
    car.x = fixed.x;
    car.y = fixed.y;
    return 0;
  }

  function updatePoliceCar(car, dt) {
    const response = POLICE_RESPONSE[player.wanted] || POLICE_RESPONSE[0];
    const targetAngle = Math.atan2(player.y - car.y, player.x - car.x);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
    const want = response.speed;
    car.speed = lerp(car.speed, want, Math.min(1, dt * 1.2));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveCircle(car.x, car.y, 18);
    if (fixed.pushed) car.speed *= 0.6;
    car.x = fixed.x;
    car.y = fixed.y;
    let events = 0;
    // Shooting from the cruiser at higher wanted levels.
    if (response.shoot && distance(car.x, car.y, player.x, player.y) < 460) {
      car.shootCooldown = (car.shootCooldown || 0) - dt;
      if (car.shootCooldown <= 0) {
        car.shootCooldown = 0.9 + random() * 0.5;
        const aim = Math.atan2(player.y - car.y, player.x - car.x) + (random() - 0.5) * 0.35;
        bullets.push({
          x: car.x, y: car.y, vx: Math.cos(aim) * 700, vy: Math.sin(aim) * 700,
          life: 0.8, fromPlayer: false,
        });
        events |= EVENT_SHOT;
      }
    }
    return events;
  }

  function updatePed(ped, dt) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        const point = randomSidewalkPoint(random);
        ped.target = point;
      }
      return;
    }
    // Flee from gunfire, explosions and speeding cars.
    let threatX = 0;
    let threatY = 0;
    let fleeing = false;
    if (player.inCar && Math.abs(player.inCar.speed) > 200 && distance(ped.x, ped.y, player.x, player.y) < 130) {
      threatX = player.x; threatY = player.y; fleeing = true;
    }
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      fleeing = true;
      threatX = ped.fleeX; threatY = ped.fleeY;
    }
    if (fleeing) {
      ped.state = 'flee';
      const away = Math.atan2(ped.y - threatY, ped.x - threatX);
      ped.angle = away;
      const nx = ped.x + Math.cos(away) * 150 * dt;
      const ny = ped.y + Math.sin(away) * 150 * dt;
      const fixed = resolveCircle(nx, ny, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      ped.walkCycle += dt * 12;
      return;
    }
    ped.state = 'walk';
    if (!ped.target || distance(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
      ped.waitTimer -= dt;
      if (ped.waitTimer <= 0) {
        ped.target = randomSidewalkPoint(random);
        ped.waitTimer = 1 + random() * 3;
      }
      return;
    }
    const angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.angle = angle;
    ped.walkCycle += dt * 8;
    const nx = ped.x + Math.cos(angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(angle) * ped.speed * dt;
    const fixed = resolveCircle(nx, ny, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
  }

  function updateBullets(dt) {
    let events = 0;
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && collidesWithBuilding(b.x, b.y, 2)) {
        spawnParticles(b.x, b.y, 5, '#e8e0c8', 120, 0.3, 3);
        dead = true;
      }
      if (!dead && b.fromPlayer) {
        for (const car of cars) {
          if (car.kind === 'wreck' || car === player.inCar) continue;
          if (distance(b.x, b.y, car.x, car.y) < carRadius(car)) {
            car.health -= PLAYER.bulletDamage;
            spawnParticles(b.x, b.y, 8, '#f2c94c', 180, 0.3, 4);
            events |= EVENT_HIT;
            dead = true;
            if (car.health <= 0) {
              explodeCar(car);
              events |= EVENT_EXPLOSION;
            } else if (car.driver === 'traffic') {
              car.driver = null;
              car.kind = 'parked';
              car.speed = 0;
            }
            break;
          }
        }
      }
      if (!dead && b.fromPlayer) {
        for (const ped of peds) {
          if (ped.state === 'down') continue;
          if (distance(b.x, b.y, ped.x, ped.y) < 16) {
            ped.state = 'down';
            ped.downTimer = 8;
            spawnParticles(b.x, b.y, 8, '#c94f43', 140, 0.4, 4);
            if (addWanted(WANTED.hitPedestrian)) events |= EVENT_WANTED_UP;
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.fromPlayer) {
        for (const guard of guards) {
          if (!guard.alive) continue;
          if (distance(b.x, b.y, guard.x, guard.y) < 18) {
            guard.health -= PLAYER.bulletDamage;
            spawnParticles(b.x, b.y, 8, '#c94f43', 140, 0.3, 4);
            if (guard.health <= 0) {
              guard.alive = false;
              if (addWanted(WANTED.killCop)) events |= EVENT_WANTED_UP;
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead && !b.fromPlayer) {
        if (player.inCar) {
          if (distance(b.x, b.y, player.inCar.x, player.inCar.y) < carRadius(player.inCar)) {
            player.inCar.health -= 8;
            dead = true;
          }
        } else if (distance(b.x, b.y, player.x, player.y) < PLAYER.radius + 2) {
          damagePlayer(9);
          spawnParticles(b.x, b.y, 6, '#c94f43', 120, 0.3, 3);
          dead = true;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    return events;
  }

  function updateGuards(dt) {
    let events = 0;
    for (const guard of guards) {
      if (!guard.alive) continue;
      const d = distance(guard.x, guard.y, player.x, player.y);
      if (d < 420 && !player.inCar) {
        guard.angle = Math.atan2(player.y - guard.y, player.x - guard.x);
        guard.shootCooldown -= dt;
        if (guard.shootCooldown <= 0) {
          guard.shootCooldown = 1.1 + random() * 0.6;
          const aim = guard.angle + (random() - 0.5) * 0.3;
          bullets.push({
            x: guard.x, y: guard.y, vx: Math.cos(aim) * 650, vy: Math.sin(aim) * 650,
            life: 0.8, fromPlayer: false,
          });
          events |= EVENT_SHOT;
        }
      }
    }
    return events;
  }

  function collideCars(dt) {
    let events = 0;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.kind === 'wreck' || b.kind === 'wreck') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const min = 44;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 220) {
            a.health -= 4;
            b.health -= 4;
            spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#f2c94c', 160, 0.35, 4);
            if (a === player.inCar || b === player.inCar) {
              events |= EVENT_CRASH;
              camera.shake = Math.max(camera.shake, 6);
            }
            a.speed *= 0.6;
            b.speed *= 0.6;
          }
        }
      }
    }
    // Player's car hitting pedestrians.
    if (player.inCar && Math.abs(player.inCar.speed) > 160) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (distance(ped.x, ped.y, player.inCar.x, player.inCar.y) < 40) {
          ped.state = 'down';
          ped.downTimer = 8;
          spawnParticles(ped.x, ped.y, 10, '#c94f43', 160, 0.5, 4);
          player.inCar.speed *= 0.85;
          if (addWanted(WANTED.hitPedestrian)) events |= EVENT_WANTED_UP;
        }
      }
    }
    return events;
  }

  function updatePickups(dt) {
    let events = 0;
    for (const pickup of pickups) {
      pickup.bob += dt;
      if (!pickup.active) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) {
          pickup.active = true;
          const point = randomSidewalkPoint(random);
          pickup.x = point.x;
          pickup.y = point.y;
        }
        continue;
      }
      const reach = player.inCar ? 46 : 34;
      if (distance(player.x, player.y, pickup.x, pickup.y) < reach) {
        pickup.active = false;
        pickup.respawnTimer = 30;
        if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + 40);
          events |= EVENT_PICKUP;
        } else if (pickup.kind === 'cash') {
          player.cash += MONEY.pickupCash;
          events |= EVENT_CASH;
        } else if (pickup.kind === 'repair' && player.inCar) {
          player.inCar.health = Math.min(CAR.health, player.inCar.health + 50);
          events |= EVENT_PICKUP;
        } else if (pickup.kind === 'repair') {
          player.ammo += 24;
          events |= EVENT_PICKUP;
        }
      }
    }
    return events;
  }

  function updateWanted(dt) {
    if (player.crimeTimer > 0) player.crimeTimer -= dt;
    if (player.wanted > 0 && player.crimeTimer <= 0) {
      player.wantedTimer -= dt;
      if (player.wantedTimer <= 0) {
        player.wanted -= 1;
        player.wantedTimer = WANTED.decaySecondsPerStar;
      }
    }
    // Keep the cruiser count matched to the wanted level.
    const wanted = POLICE_RESPONSE[player.wanted] || POLICE_RESPONSE[0];
    const policeCars = cars.filter((c) => c.kind === 'police');
    if (policeCars.length < wanted.cars && policeCars.length < POLICE_MAX) {
      spawnPoliceCar();
    }
    if (player.wanted === 0) {
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        if (cars[i].kind === 'police' && distance(cars[i].x, cars[i].y, player.x, player.y) > 1200) {
          cars.splice(i, 1);
        }
      }
    }
    state.sirenTimer -= dt;
    if (state.sirenTimer <= 0) {
      state.sirenTimer = 0.55;
      state.sirenHigh = !state.sirenHigh;
    }
  }

  function updateCamera(dt) {
    const lookX = player.inCar ? Math.cos(player.inCar.angle) * 60 : 0;
    const lookY = player.inCar ? Math.sin(player.inCar.angle) * 60 : 0;
    const targetX = player.x + lookX;
    const targetY = player.y + lookY;
    camera.x = lerp(camera.x, targetX, Math.min(1, dt * 5));
    camera.y = lerp(camera.y, targetY, Math.min(1, dt * 5));
    camera.zoom = lerp(camera.zoom, player.inCar ? 0.82 : 1, Math.min(1, dt * 2));
    if (camera.shake > 0) camera.shake = Math.max(0, camera.shake - dt * 30);
  }

  /**
   * One fixed step. `held` carries the continuous controls: mx/my (-1..1), run,
   * handbrake, shoot, and aim (world coordinates for the mouse). One-shot actions
   * (enter car, punch) go through tryEnterCar/tryPunch so they fire exactly once.
   */
  function step(dt, held) {
    let events = 0;
    state.elapsed += dt;
    ensureMissionSetup();

    // A stage's opening heat arrives when the stage starts, not when it ends.
    const activeStage = currentStage(missions);
    if (activeStage && activeStage.wantedOnStart && !missions.stageState.wantedApplied) {
      missions.stageState.wantedApplied = true;
      if (addWanted(activeStage.wantedOnStart)) events |= EVENT_WANTED_UP;
    }

    if (player.inCar) {
      const car = player.inCar;
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      events |= driveCar(car, dt, held.my * -1, held.mx, held.handbrake);
      if (car.health <= 0 && car.kind === 'wreck') player.inCar = null;
      if (car.smokeTimer > 0) car.smokeTimer -= dt;
      else if (car.health < 40) {
        car.smokeTimer = 0.12;
        spawnParticles(car.x, car.y - 10, 2, '#3d4149', 40, 0.8, 6);
      }
    } else {
      events |= updatePlayerOnFoot(dt, held);
    }

    for (const car of cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, dt);
      else if (car.driver === 'police') events |= updatePoliceCar(car, dt);
      if (car.kind !== 'wreck' && car.health <= 0) {
        explodeCar(car);
        events |= EVENT_EXPLOSION;
      }
    }
    for (const ped of peds) updatePed(ped, dt);
    events |= updateBullets(dt);
    events |= updateGuards(dt);
    events |= collideCars(dt);
    events |= updatePickups(dt);
    events |= checkMissionProgress(events);
    updateWanted(dt);

    // Busted: a cruiser sitting on the player on foot for long enough.
    if (!player.inCar && player.wanted > 0) {
      let touching = false;
      for (const car of cars) {
        if (car.kind === 'police' && distance(car.x, car.y, player.x, player.y) < 46 && Math.abs(car.speed) < 90) {
          touching = true;
          break;
        }
      }
      if (touching) {
        player.bustedTimer += dt;
        if (player.bustedTimer > WANTED.bustedTouchSeconds) events |= EVENT_BUSTED;
      } else {
        player.bustedTimer = Math.max(0, player.bustedTimer - dt * 2);
      }
    }

    if (player.health <= 0) events |= EVENT_WASTED;

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = skidMarks.length - 1; i >= 0; i -= 1) {
      skidMarks[i].life -= dt;
      if (skidMarks[i].life <= 0) skidMarks.splice(i, 1);
    }
    if (state.missionToastTimer > 0) state.missionToastTimer -= dt;

    updateCamera(dt);
    return events;
  }

  function handleBustedOrWasted() {
    player.cash = Math.floor(player.cash * 0.8);
    player.health = PLAYER.health;
    player.ammo = Math.max(player.ammo, 24);
    player.wanted = 0;
    player.bustedTimer = 0;
    player.invulnerable = 2;
    if (player.inCar) {
      player.inCar.driver = null;
      player.inCar = null;
    }
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y;
    camera.x = player.x;
    camera.y = player.y;
  }

  // Staging helpers for the screenshot scenes: place the world exactly, so a
  // screenshot is the same frame every time it is taken.
  function placeCar(x, y, angle, model, kind, color) {
    const car = makeCar(x, y, angle, model, kind);
    car.color = color;
    cars.push(car);
    return car;
  }

  function placePed(x, y, angle) {
    const ped = {
      x, y, angle: angle ?? 0, speed: 50,
      shirt: PED_SHIRTS[Math.floor(random() * PED_SHIRTS.length)],
      state: 'walk', target: { x, y }, waitTimer: 0, downTimer: 0, fleeX: 0, fleeY: 0, walkCycle: 0,
    };
    peds.push(ped);
    return ped;
  }

  function putPlayerInCar(car, speed) {
    car.driver = 'player';
    car.owner = 'player';
    car.speed = speed || 0;
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    camera.x = car.x;
    camera.y = car.y;
    camera.zoom = 0.82;
  }

  function setPlayerOnFoot(x, y, angle) {
    if (player.inCar) {
      player.inCar.driver = null;
      player.inCar = null;
    }
    player.x = x;
    player.y = y;
    player.angle = angle;
    camera.x = x;
    camera.y = y;
    camera.zoom = 1;
  }

  function setWantedLevel(level) {
    player.wanted = level;
    player.wantedTimer = WANTED.decaySecondsPerStar;
    player.crimeTimer = 6;
  }

  function setMission(missionIndex, stageIndex) {
    missions.missionIndex = missionIndex;
    missions.stageIndex = stageIndex;
    missions.stageState = {};
    missions.completed = missionIndex;
    state.cometSpawned = false;
    guards.length = 0;
  }

  reset();
  return {
    state, reset, step, tryEnterCar, tryPunch, applySave, makeSaveData,
    handleBustedOrWasted, spawnPoliceCar, spawnTrafficCar, spawnPed,
    addWanted, explodeCar, placeCar, placePed, putPlayerInCar, setPlayerOnFoot,
    setWantedLevel, setMission,
  };
}
