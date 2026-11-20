// The screenshot scenes behind ?shot=chase|street|drive|mission. Each one resets the
// world to a fixed seed, clears the traffic and pedestrians, and places the player,
// the cars and the police exactly where the frame needs them — so the frame is what
// a real game looks like, and the same seed always gives the same frame.

import { CAR_MODELS } from './world.js';
import { PLACES } from './city.js';

const COMET = { name: 'Comet GT', length: 60, width: 30, color: '#e8b73c' };
const CRUISER = { name: 'Cruiser', length: 64, width: 32, color: '#1f2a33' };

function clearCrowd(world) {
  world.state.cars.length = 0;
  world.state.peds.length = 0;
  world.state.bullets.length = 0;
  world.state.guards.length = 0;
}

function addTrafficRow(world, roadX, ys, speeds) {
  ys.forEach((y, i) => {
    const model = CAR_MODELS[(i * 2 + 1) % CAR_MODELS.length];
    const car = world.placeCar(roadX + (i % 2 === 0 ? -26 : 26), y, i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2, model, 'traffic', model.color);
    car.speed = speeds[i % speeds.length];
    car.waypoint = { x: roadX, y: y + (i % 2 === 0 ? 600 : -600) };
  });
}

function addPeds(world, points) {
  points.forEach(([x, y], i) => world.placePed(x, y, (i * 1.3) % (Math.PI * 2)));
}

function addPoliceBehind(world, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const car = world.placeCar(x + (i % 2 === 0 ? -26 : 26), y - 190 - i * 110, Math.PI / 2, CRUISER, 'police', '#e8e0c8');
    car.driver = 'police';
    car.speed = 560 + i * 40;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Every scene shows the HUD with its minimap and a live mission objective.
 */
export function stageShot(name, world) {
  world.reset();
  clearCrowd(world);
  const state = world.state;

  if (name === 'street') {
    // On foot in the plaza district: pedestrians, traffic, a parked car to steal.
    world.setMission(0, 0);
    world.setPlayerOnFoot(PLACES.plaza.x - 60, PLACES.plaza.y + 40, -Math.PI / 2);
    addTrafficRow(world, 1920, [1280, 1500, 1740], [240, 260, 230]);
    addPeds(world, [
      [PLACES.plaza.x - 120, PLACES.plaza.y - 40],
      [PLACES.plaza.x - 40, PLACES.plaza.y + 90],
      [PLACES.plaza.x + 60, PLACES.plaza.y - 80],
      [PLACES.plaza.x + 140, PLACES.plaza.y + 30],
      [PLACES.plaza.x - 160, PLACES.plaza.y + 140],
      [PLACES.plaza.x + 20, PLACES.plaza.y + 170],
    ]);
    world.placeCar(PLACES.plaza.x + 220, PLACES.plaza.y + 60, Math.PI / 2, CAR_MODELS[4], 'parked', CAR_MODELS[4].color);
    world.placeCar(PLACES.plaza.x - 260, PLACES.plaza.y - 120, 0, CAR_MODELS[1], 'parked', CAR_MODELS[1].color);
    return { screen: 'play' };
  }

  if (name === 'drive') {
    // Driving the Comet GT down the beach avenue at speed, traffic ahead.
    world.setMission(1, 0);
    const car = world.placeCar(2920, 1500, Math.PI / 2, COMET, 'parked', '#e8b73c');
    world.putPlayerInCar(car, 520);
    addTrafficRow(world, 2920, [1750, 1950, 2150], [260, 240, 280]);
    addTrafficRow(world, 2420, [1600, 1900], [250, 270]);
    addPeds(world, [[3330, 1400], [3330, 1700], [3300, 2050]]);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission 3 in progress: the bank job, guards up, wanted level 3, cruisers closing.
    // Mara stands just south of the bank so all four guards are in frame.
    world.setMission(2, 1);
    world.setPlayerOnFoot(PLACES.bank.x, PLACES.bank.y + 140, -Math.PI / 2);
    world.state.player.ammo = 48;
    // Guards posted around the bank, clear of the building itself.
    const bank = PLACES.bank;
    const guardSpots = [
      [bank.x - 170, bank.y - 170], [bank.x + 170, bank.y - 170],
      [bank.x - 170, bank.y + 170], [bank.x + 170, bank.y + 170],
    ];
    guardSpots.forEach(([x, y]) => {
      world.state.guards.push({ x, y, angle: Math.PI / 2, health: 60, alive: true, shootCooldown: 1, speed: 90 });
    });
    world.setWantedLevel(3);
    addPoliceBehind(world, 1420, bank.y + 480, 2);
    addTrafficRow(world, 1420, [bank.y - 420, bank.y + 620], [250, 260]);
    addPeds(world, [[bank.x - 200, bank.y + 200], [bank.x + 220, bank.y - 160]]);
    return { screen: 'play' };
  }

  // 'chase' (and the default): a three-star police chase down the middle avenue,
  // the mission objective and the minimap all on the HUD at once.
  world.setMission(0, 2);
  const car = world.placeCar(1920, 1150, Math.PI / 2, COMET, 'parked', '#e8b73c');
  world.putPlayerInCar(car, 600);
  world.setWantedLevel(3);
  addPoliceBehind(world, 1920, 1150, 3);
  addTrafficRow(world, 1920, [1420, 1620], [260, 240]);
  addTrafficRow(world, 1420, [1000, 1300], [250, 270]);
  addPeds(world, [[1850, 900], [1990, 1380], [1830, 1560]]);
  state.player.cash = 2450;
  return { screen: 'play' };
}
