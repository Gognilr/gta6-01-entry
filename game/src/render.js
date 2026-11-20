// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player with a speed lookahead; the HUD (cash, health, wanted stars,
// minimap, objective) and the menus are drawn in screen space on top.

import { BEACH, CAR, PALETTE, PLAYER, ROADS, WORLD } from './config.js';
import { CITY, PLACES, isOnRoad } from './city.js';
import { currentMission, currentStage, missionObjectiveText } from './missions.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_STORY = 'story';

const MINIMAP = { width: 230, height: 166, margin: 16 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { width: 1280, height: 720, dpr: 1 };
  const fonts = new Map();

  function resize() {
    view.dpr = window.devicePixelRatio || 1;
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawGround(state) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mown stripes for a little texture.
    context.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD.height; y += 240) {
      context.fillRect(0, y, WORLD.width, 110);
    }
    // Beach and sea on the east edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(BEACH.sandStart, 0, WORLD.width - BEACH.sandStart, WORLD.height);
    const wave = Math.sin(state.elapsed * 1.2) * 6;
    context.fillStyle = PALETTE.water;
    context.fillRect(BEACH.waterStart + wave, 0, WORLD.width - BEACH.waterStart - wave, WORLD.height);
    context.fillStyle = PALETTE.waterDeep;
    for (let y = 60; y < WORLD.height; y += 260) {
      context.fillRect(BEACH.waterStart + 60 + wave, y, 190, 10);
    }
    // Parks and parking lots.
    for (const park of CITY.parks) {
      context.fillStyle = '#8fbf6e';
      context.fillRect(park.x, park.y, park.w, park.h);
      context.fillStyle = PALETTE.parkPath;
      context.fillRect(park.x + park.w / 2 - 8, park.y, 16, park.h);
      context.fillRect(park.x, park.y + park.h / 2 - 8, park.w, 16);
    }
    for (const lot of CITY.parkingLots) {
      context.fillStyle = '#4a4d55';
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
      context.strokeStyle = 'rgba(232, 217, 138, 0.7)';
      context.lineWidth = 2;
      for (let x = lot.x + 20; x < lot.x + lot.w - 20; x += 46) {
        context.beginPath();
        context.moveTo(x, lot.y + 10);
        context.lineTo(x, lot.y + 34);
        context.stroke();
      }
    }
  }

  function drawRoads() {
    // Sidewalks first, then asphalt, then lane dashes.
    context.fillStyle = PALETTE.sidewalk;
    for (const vx of ROADS.vertical) {
      context.fillRect(vx - ROADS.halfWidth - 16, 0, (ROADS.halfWidth + 16) * 2, WORLD.height);
    }
    for (const hy of ROADS.horizontal) {
      context.fillRect(0, hy - ROADS.halfWidth - 16, WORLD.width, (ROADS.halfWidth + 16) * 2);
    }
    context.fillStyle = PALETTE.asphalt;
    for (const vx of ROADS.vertical) {
      context.fillRect(vx - ROADS.halfWidth, 0, ROADS.halfWidth * 2, WORLD.height);
    }
    for (const hy of ROADS.horizontal) {
      context.fillRect(0, hy - ROADS.halfWidth, WORLD.width, ROADS.halfWidth * 2);
    }
    context.fillStyle = PALETTE.lane;
    for (const vx of ROADS.vertical) {
      for (let y = 20; y < WORLD.height; y += 64) {
        context.fillRect(vx - 2, y, 4, 32);
      }
    }
    for (const hy of ROADS.horizontal) {
      for (let x = 20; x < WORLD.width; x += 64) {
        context.fillRect(x, hy - 2, 32, 4);
      }
    }
    // Crosswalk stripes at every intersection.
    context.fillStyle = 'rgba(255, 246, 224, 0.55)';
    for (const vx of ROADS.vertical) {
      for (const hy of ROADS.horizontal) {
        for (let i = -2; i <= 2; i += 1) {
          context.fillRect(vx - 44 + i * 18, hy - ROADS.halfWidth - 8, 10, 16);
        }
      }
    }
  }

  function drawBuildings() {
    for (const b of CITY.buildings) {
      // Soft sun shadow to the south-east.
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      context.lineWidth = 3;
      context.strokeRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.28)';
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
      // Windows.
      context.fillStyle = 'rgba(20, 30, 40, 0.55)';
      for (let wx = 0; wx < b.windows; wx += 1) {
        for (let wy = 0; wy < b.floors; wy += 1) {
          context.fillRect(b.x + 14 + wx * ((b.w - 28) / Math.max(1, b.windows)), b.y + 30 + wy * 44, 16, 22);
        }
      }
      if (b.name) {
        text(b.name, b.x + b.w / 2, b.y + b.h / 2, 15, 'rgba(255, 246, 224, 0.95)', 'center', '700');
      }
    }
  }

  function drawTrees() {
    for (const tree of CITY.trees) {
      context.fillStyle = 'rgba(0, 0, 0, 0.15)';
      context.beginPath();
      context.ellipse(tree.x + 6, tree.y + 8, 12, 7, 0, 0, Math.PI * 2);
      context.fill();
      if (tree.palm) {
        context.strokeStyle = '#7a5a34';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(tree.x, tree.y + 6);
        context.lineTo(tree.x, tree.y - 8);
        context.stroke();
        context.fillStyle = '#3f8f4f';
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          context.beginPath();
          context.ellipse(tree.x + Math.cos(a) * 10, tree.y - 8 + Math.sin(a) * 8, 11, 5, a, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        context.fillStyle = '#4d8a44';
        context.beginPath();
        context.arc(tree.x, tree.y, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#6db35e';
        context.beginPath();
        context.arc(tree.x - 4, tree.y - 4, 8, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawSkidMarks(state) {
    context.strokeStyle = 'rgba(20, 20, 24, 0.35)';
    context.lineWidth = 5;
    for (const mark of state.skidMarks) {
      context.globalAlpha = clamp(mark.life / 4, 0, 0.6);
      context.beginPath();
      context.moveTo(mark.x1, mark.y1);
      context.lineTo(mark.x2, mark.y2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = car.model.length / 2;
    const halfW = car.model.width / 2;
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    roundRect(-halfL + 4, -halfW + 6, car.model.length, car.model.width, 8);
    context.fill();
    // Wheels.
    context.fillStyle = '#14161a';
    const wheelY = halfW - 3;
    context.fillRect(-halfL + 8, -wheelY - 4, 14, 7);
    context.fillRect(halfL - 22, -wheelY - 4, 14, 7);
    context.fillRect(-halfL + 8, wheelY - 3, 14, 7);
    context.fillRect(halfL - 22, wheelY - 3, 14, 7);
    // Body.
    context.fillStyle = car.kind === 'wreck' ? '#2b2b2e' : car.color;
    roundRect(-halfL, -halfW, car.model.length, car.model.width, 9);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = '#e8e0c8';
      context.fillRect(-halfL + 6, -halfW, car.model.length - 12, car.model.width);
      context.fillStyle = '#1f2a33';
      context.fillRect(-halfL + 6, -halfW, 14, car.model.width);
      // Flashing light bar.
      const flash = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      context.fillRect(-6, -halfW - 3, 6, 7);
      context.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      context.fillRect(2, -halfW - 3, 6, 7);
    }
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 40, 55, 0.85)';
    context.fillRect(halfL - 24, -halfW + 6, 12, car.model.width - 12);
    context.fillStyle = 'rgba(255, 255, 255, 0.18)';
    context.fillRect(-halfL + 12, -halfW + 5, car.model.length - 40, 8);
    // Headlights.
    if (car.kind !== 'wreck') {
      context.fillStyle = '#ffe9a8';
      context.fillRect(halfL - 3, -halfW + 4, 3, 6);
      context.fillRect(halfL - 3, halfW - 10, 3, 6);
    }
    // Damage smoke is drawn by the world as particles; a wreck gets a scorch mark.
    if (car.kind === 'wreck') {
      context.fillStyle = 'rgba(0, 0, 0, 0.4)';
      context.beginPath();
      context.arc(0, 0, halfL * 0.7, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Gold Comet GT gets a marker so the player can spot the prize.
    if (car.isComet && car.owner !== 'player') {
      const bob = Math.sin(time * 3) * 4;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(car.x, car.y - 52 + bob);
      context.lineTo(car.x - 9, car.y - 68 + bob);
      context.lineTo(car.x + 9, car.y - 68 + bob);
      context.closePath();
      context.fill();
      text('COMET GT', car.x, car.y - 74 + bob, 13, PALETTE.gold, 'center', '700');
    }
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.rotate(ped.angle + Math.PI / 2);
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.beginPath();
      context.ellipse(2, 3, 14, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(13, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(ped.walkCycle) * 2;
    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
    context.beginPath();
    context.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(ped.angle);
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(7, bob, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2b2e';
    context.beginPath();
    context.arc(9, bob - 1, 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawGuard(guard) {
    context.save();
    context.translate(guard.x, guard.y);
    context.rotate(guard.angle);
    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
    context.beginPath();
    context.ellipse(2, 3, 11, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#232a33';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(6, 0, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#c94f43';
    context.fillRect(8, -2, 16, 4);
    context.restore();
    // Health tick.
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(guard.x - 14, guard.y - 26, 28, 5);
    context.fillStyle = '#e5534b';
    context.fillRect(guard.x - 14, guard.y - 26, 28 * (guard.health / 60), 5);
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
    if (blink) return;
    context.save();
    context.translate(player.x, player.y);
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.beginPath();
    context.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(player.angle);
    const bob = player.moving ? Math.sin(player.walkCycle) * 2 : 0;
    // Mara Voss: coral jacket, dark jeans, always easy to spot.
    context.fillStyle = '#e07856';
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2b2e';
    context.fillRect(-4, -8, 8, 16);
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(8, bob, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3a2a1e';
    context.beginPath();
    context.arc(10, bob - 1, 4, 0, Math.PI * 2);
    context.fill();
    // Pistol in hand when there is ammo to spend.
    if (player.ammo > 0) {
      context.fillStyle = '#1c1e22';
      context.fillRect(10, -2, 12, 4);
    }
    context.restore();
    // Direction tick so the player reads where Mara faces.
    context.strokeStyle = 'rgba(255, 246, 224, 0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
    context.lineTo(player.x + Math.cos(player.angle) * 24, player.y + Math.sin(player.angle) * 24);
    context.stroke();
  }

  function drawBullets(state) {
    context.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255, 233, 168, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(pickup.bob * 3) * 3;
      context.save();
      context.translate(pickup.x, pickup.y + bob);
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.beginPath();
      context.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2);
      context.fill();
      if (pickup.kind === 'health') {
        context.fillStyle = '#e8e0c8';
        roundRect(-11, -11, 22, 22, 5);
        context.fill();
        context.fillStyle = '#2f9e4f';
        context.fillRect(-3, -8, 6, 16);
        context.fillRect(-8, -3, 16, 6);
      } else if (pickup.kind === 'cash') {
        context.fillStyle = '#2f9e4f';
        roundRect(-12, -8, 24, 16, 3);
        context.fill();
        context.fillStyle = '#f2c94c';
        context.beginPath();
        context.arc(0, 0, 5, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = '#e8e0c8';
        roundRect(-11, -11, 22, 22, 5);
        context.fill();
        context.fillStyle = '#c96a2e';
        context.fillRect(-7, -3, 14, 6);
        context.fillRect(3, -7, 5, 14);
      }
      context.restore();
    }
  }

  function drawMissionMarker(state) {
    const stage = currentStage(state.missions);
    if (!stage) return;
    const place = stage.place;
    const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 4);
    context.save();
    context.globalAlpha = 0.35 + pulse * 0.3;
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(place.x, place.y, 34 + pulse * 14, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.14 + pulse * 0.1;
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.arc(place.x, place.y, 34 + pulse * 14, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // A beam of light so the marker reads from far away.
    const beam = context.createLinearGradient(place.x, place.y - 260, place.x, place.y);
    beam.addColorStop(0, 'rgba(242, 201, 76, 0)');
    beam.addColorStop(1, 'rgba(242, 201, 76, 0.35)');
    context.fillStyle = beam;
    context.fillRect(place.x - 8, place.y - 260, 16, 260);
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(place.x, place.y - 46);
    context.lineTo(place.x - 10, place.y - 66);
    context.lineTo(place.x + 10, place.y - 66);
    context.closePath();
    context.fill();
    text(place.label, place.x, place.y - 76, 14, PALETTE.gold, 'center', '700');
  }

  function drawWorld(state) {
    drawGround(state);
    drawRoads();
    drawBuildings();
    drawTrees();
    drawSkidMarks(state);
    drawMissionMarker(state);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, state.elapsed);
    for (const ped of state.peds) drawPed(ped);
    for (const guard of state.guards) if (guard.alive) drawGuard(guard);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
  }

  function drawMinimap(state) {
    const x = view.width - MINIMAP.width - MINIMAP.margin;
    const y = MINIMAP.margin;
    const scaleX = MINIMAP.width / WORLD.width;
    const scaleY = MINIMAP.height / WORLD.height;
    context.save();
    context.fillStyle = PALETTE.hudPanel;
    roundRect(x - 6, y - 6, MINIMAP.width + 12, MINIMAP.height + 12, 10);
    context.fill();
    context.strokeStyle = PALETTE.hudBorder;
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    roundRect(x, y, MINIMAP.width, MINIMAP.height, 6);
    context.clip();
    context.fillStyle = '#5d8a4a';
    context.fillRect(x, y, MINIMAP.width, MINIMAP.height);
    context.fillStyle = '#2fa8b8';
    context.fillRect(x + BEACH.waterStart * scaleX, y, MINIMAP.width, MINIMAP.height);
    context.fillStyle = '#e8cf9a';
    context.fillRect(x + BEACH.sandStart * scaleX, y, (BEACH.waterStart - BEACH.sandStart) * scaleX, MINIMAP.height);
    context.fillStyle = '#3d4149';
    for (const vx of ROADS.vertical) {
      context.fillRect(x + (vx - ROADS.halfWidth) * scaleX, y, ROADS.halfWidth * 2 * scaleX, MINIMAP.height);
    }
    for (const hy of ROADS.horizontal) {
      context.fillRect(x, y + (hy - ROADS.halfWidth) * scaleY, MINIMAP.width, ROADS.halfWidth * 2 * scaleY);
    }
    context.fillStyle = 'rgba(255, 246, 224, 0.5)';
    for (const b of CITY.buildings) {
      context.fillRect(x + b.x * scaleX, y + b.y * scaleY, Math.max(2, b.w * scaleX), Math.max(2, b.h * scaleY));
    }
    const stage = currentStage(state.missions);
    if (stage) {
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(x + stage.place.x * scaleX, y + stage.place.y * scaleY, 4 + pulse, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = '#ff3b30';
        context.beginPath();
        context.arc(x + car.x * scaleX, y + car.y * scaleY, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    // The player: a white arrow that always reads.
    const player = state.player;
    context.save();
    context.translate(x + player.x * scaleX, y + player.y * scaleY);
    context.rotate(player.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    text('SOLARA BAY', x + MINIMAP.width / 2, y + MINIMAP.height + 22, 12, PALETTE.muted, 'center', '700');
  }

  function drawHud(state, extras) {
    const player = state.player;
    // Cash and health, top left.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(16, 16, 250, 84, 10);
    context.fill();
    context.strokeStyle = PALETTE.hudBorder;
    context.lineWidth = 1;
    context.stroke();
    text(`$${player.cash.toLocaleString('en-US')}`, 30, 48, 26, '#7be495', 'left', '800');
    text(`Ammo ${player.ammo}`, 196, 48, 15, PALETTE.text, 'left', '600');
    context.fillStyle = 'rgba(255, 255, 255, 0.15)';
    roundRect(30, 60, 200, 12, 6);
    context.fill();
    context.fillStyle = player.health > 30 ? '#7be495' : '#e5534b';
    roundRect(30, 60, 200 * clamp(player.health / PLAYER.health, 0, 1), 12, 6);
    context.fill();
    text('HEALTH', 30, 94, 11, PALETTE.muted, 'left', '700');
    if (player.inCar) {
      text(`CAR ${Math.max(0, Math.round(player.inCar.health))}%`, 150, 94, 11, PALETTE.muted, 'left', '700');
    }

    // Wanted stars, top centre.
    const wanted = player.wanted;
    const starW = 34;
    const totalW = 5 * starW;
    const sx = (view.width - totalW) / 2;
    context.fillStyle = PALETTE.hudPanel;
    roundRect(sx - 14, 16, totalW + 28, 46, 10);
    context.fill();
    context.strokeStyle = PALETTE.hudBorder;
    context.stroke();
    for (let i = 0; i < 5; i += 1) {
      drawStar(sx + 17 + i * starW, 39, 13, i < wanted ? '#f2c94c' : 'rgba(255, 246, 224, 0.22)');
    }
    if (wanted > 0) {
      const flash = Math.floor(state.elapsed * 2) % 2 === 0;
      text(flash ? 'WANTED' : '· WANTED ·', view.width / 2, 82, 13, '#ff6b5e', 'center', '800');
    }

    drawMinimap(state);

    // Objective card, bottom left.
    const mission = currentMission(state.missions);
    context.fillStyle = PALETTE.hudPanel;
    roundRect(16, view.height - 92, 470, 76, 10);
    context.fill();
    context.strokeStyle = PALETTE.hudBorder;
    context.stroke();
    context.fillStyle = PALETTE.gold;
    context.fillRect(16, view.height - 92, 5, 76);
    text(mission ? mission.title.toUpperCase() : 'FREE ROAM', 34, view.height - 62, 13, PALETTE.gold, 'left', '800');
    text(missionObjectiveText(state.missions), 34, view.height - 38, 15, PALETTE.text, 'left', '600');
    text(`${state.missions.completed}/3 missions done`, 34, view.height - 22, 11, PALETTE.muted, 'left');

    // Speedometer, bottom right, while driving.
    if (player.inCar) {
      const mph = Math.round(Math.abs(player.inCar.speed) * 0.16);
      text(`${mph}`, view.width - 40, view.height - 44, 44, PALETTE.text, 'right', '800');
      text('MPH', view.width - 40, view.height - 20, 13, PALETTE.muted, 'right', '700');
    }

    // Mission toast and story banner.
    if (state.missionToastTimer > 0 && state.missionToast) {
      const alpha = clamp(state.missionToastTimer, 0, 1);
      context.globalAlpha = alpha;
      context.fillStyle = PALETTE.hudPanel;
      const tw = 520;
      roundRect((view.width - tw) / 2, 110, tw, 44, 10);
      context.fill();
      context.strokeStyle = PALETTE.gold;
      context.stroke();
      text(state.missionToast, view.width / 2, 139, 18, PALETTE.gold, 'center', '700');
      context.globalAlpha = 1;
    }
    if (state.storyBanner) {
      context.fillStyle = 'rgba(242, 201, 76, 0.12)';
      context.fillRect(0, 160, view.width, 40);
      text(state.storyBanner, view.width / 2, 187, 20, PALETTE.gold, 'center', '800');
    }

    // Controls hint, bottom centre, fading after the first minute.
    if (state.elapsed < 45) {
      const hint = player.inCar
        ? 'W A S D drive · Space handbrake · E get out · M mute · P pause'
        : 'W A S D move · Shift run · E enter car · Click shoot · F punch · L save';
      text(hint, view.width / 2, view.height - 8, 13, 'rgba(255, 246, 224, 0.75)', 'center');
    }
    if (extras && extras.muted) {
      text('MUTED', view.width - 30, view.height - 20, 12, PALETTE.muted, 'right', '700');
    }
    // Crosshair at the mouse while on foot.
    if (!player.inCar && extras && extras.mouse) {
      const { x, y } = extras.mouse;
      context.strokeStyle = 'rgba(255, 246, 224, 0.9)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 10, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(x - 15, y);
      context.lineTo(x - 6, y);
      context.moveTo(x + 6, y);
      context.lineTo(x + 15, y);
      context.moveTo(x, y - 15);
      context.lineTo(x, y - 6);
      context.moveTo(x, y + 6);
      context.lineTo(x, y + 15);
      context.stroke();
    }
  }

  function drawStar(cx, cy, r, color) {
    context.fillStyle = color;
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (view.width - width) / 2;
    const y = (view.height - height) / 2;
    context.fillStyle = 'rgba(10, 16, 22, 0.88)';
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent || PALETTE.hudBorder;
    context.lineWidth = 2;
    context.stroke();
    text(title, view.width / 2, y + 72, 44, PALETTE.text, 'center', '800');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.width / 2, y + 118 + i * 32, 19, PALETTE.muted, 'center');
    }
    if (prompt) text(prompt, view.width / 2, y + height - 30, 19, PALETTE.gold, 'center', '700');
  }

  function drawTitle(state, extras) {
    // A scenic slice of the city behind the menu.
    const savedCamera = { ...state.camera };
    state.camera.x = PLACES.plaza.x;
    state.camera.y = PLACES.plaza.y;
    state.camera.zoom = 0.62;
    drawWorld(state);
    state.camera.x = savedCamera.x;
    state.camera.y = savedCamera.y;
    state.camera.zoom = savedCamera.zoom;
    context.fillStyle = 'rgba(10, 20, 26, 0.55)';
    context.fillRect(0, 0, view.width, view.height);
    const cx = view.width / 2;
    text('SOLARA BAY', cx, 168, 84, '#fff6e0', 'center', '900');
    text('An open-world crime game in the sun', cx, 206, 22, PALETTE.gold, 'center', '600');
    text('Mara Voss owes Delia Crane three jobs. The city is yours — take it.', cx, 246, 17, PALETTE.muted, 'center');
    const hasSave = extras && extras.hasSave;
    const lines = [
      hasSave ? 'ENTER — Continue your story' : 'ENTER — New game',
      'W A S D move · E steal a car · Click to shoot · F punch',
      hasSave ? 'N — New game instead' : 'L — Load a saved game · M — Mute',
    ];
    const y = 300;
    context.fillStyle = 'rgba(10, 16, 22, 0.8)';
    roundRect(cx - 330, y, 660, 150, 12);
    context.fill();
    context.strokeStyle = PALETTE.hudBorder;
    context.stroke();
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], cx, y + 48 + i * 40, 19, i === 0 ? PALETTE.gold : PALETTE.text, 'center', i === 0 ? '700' : '400');
    }
    text('H — How to play', cx, y + 196, 16, PALETTE.muted, 'center');
    text('Made with canvas and WebAudio. No network, no downloads — everything here is original.', cx, view.height - 24, 13, 'rgba(255, 246, 224, 0.55)', 'center');
  }

  function drawHowTo() {
    drawPanel('HOW TO PLAY', [
      'W A S D / arrows — move and drive. Shift — run. Space — handbrake.',
      'E — steal a car or get out. Click — shoot (aim with the mouse). F — punch.',
      'Steal cars, run missions for Delia Crane, and watch the wanted stars.',
      'Police chase harder as the stars rise. Lose them, or lose your cash.',
      'Gold markers are mission targets. Green crosses heal, cash bags pay.',
      'L — save your game. P or Esc — pause. M — mute.',
    ], 'Press H or Esc to go back', PALETTE.gold);
  }

  function drawPaused(state) {
    drawPanel('PAUSED', [
      `Cash $${state.player.cash.toLocaleString('en-US')} · Missions ${state.missions.completed}/3`,
      missionObjectiveText(state.missions),
      'L — save · H — how to play · M — mute',
    ], 'Press P or Esc to resume');
  }

  function drawBusted(state, wasted) {
    const title = wasted ? 'WASTED' : 'BUSTED';
    const lines = wasted
      ? ['Mara is down. The crew drags her to Solara General.', 'You lost 20% of your cash. The city keeps moving.']
      : ['The Solara PD finally caught up with Mara.', 'You lost 20% of your cash. The city keeps moving.'];
    drawPanel(title, lines, 'Press Enter to get back out there', '#e5534b');
  }

  function drawStory(state) {
    drawPanel('KING OF SOLARA BAY', [
      'Three jobs. Three paydays. Mara Voss is free —',
      'and Solara Bay is hers now.',
      `Final cash: $${state.player.cash.toLocaleString('en-US')}`,
    ], 'Press Enter to keep playing');
  }

  /** Paint one frame: the world through the camera, then the HUD or a screen panel. */
  function draw(state, screen, extras) {
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, view.width, view.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, extras);
      return;
    }
    const camera = state.camera;
    const shakeX = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
    const shakeY = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
    context.save();
    context.translate(view.width / 2, view.height / 2);
    context.scale(camera.zoom, camera.zoom);
    context.translate(-camera.x + shakeX, -camera.y + shakeY);
    drawWorld(state);
    context.restore();
    // Warm sun vignette.
    const vignette = context.createRadialGradient(
      view.width / 2, view.height / 2, Math.min(view.width, view.height) * 0.45,
      view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(255, 190, 90, 0)');
    vignette.addColorStop(1, 'rgba(120, 60, 10, 0.18)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, view.width, view.height);
    drawHud(state, extras);
    if (screen === SCREEN_PAUSED) drawPaused(state);
    else if (screen === SCREEN_HOWTO) drawHowTo();
    else if (screen === SCREEN_BUSTED) drawBusted(state, false);
    else if (screen === SCREEN_WASTED) drawBusted(state, true);
    else if (screen === SCREEN_STORY) drawStory(state);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
