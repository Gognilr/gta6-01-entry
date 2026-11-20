// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between screens: title, play, paused, how to play, busted,
// wasted and the story-complete screen.
//
// ?seed=N fixes the random traffic. ?shot=chase|street|drive|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady (and the page title) for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CAR_STOLEN, EVENT_CRASH, EVENT_EXPLOSION, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_WANTED_UP, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_HOWTO, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { mouse: null, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'SHOT_READY';
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let savedGame = readSave();
  let accumulator = 0;
  let last = performance.now();
  let storyShown = false;

  // A read-only handle for playtesting and debugging in the browser console.
  window.__solara = {
    state: world.state,
    get screen() { return screen; },
    get savedGame() { return savedGame; },
  };

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    storyShown = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Mission 1: The Pickup. Drive to Solara Marina.');
  }

  function continueGame() {
    world.reset();
    world.applySave(savedGame);
    storyShown = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Continuing your story.');
  }

  function saveGame() {
    const ok = writeSave(world.makeSaveData());
    announce(ok ? 'Game saved.' : 'Could not save in this browser.');
    return ok;
  }

  function endRun(wasted) {
    world.handleBustedOrWasted();
    savedGame = readSave();
    screen = wasted ? SCREEN_WASTED : SCREEN_BUSTED;
    audio.busted();
    announce(wasted ? 'Wasted. You lost 20% of your cash.' : 'Busted. You lost 20% of your cash.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) {
      saveGame();
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (savedGame) continueGame();
        else startNewGame();
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_STORY) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back out there.');
      }
      return;
    }
    if (screen === SCREEN_HOWTO) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PAUSED;
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // SCREEN_PLAY.
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_ENTER_CAR) {
      const events = world.tryEnterCar();
      if (events & EVENT_CAR_STOLEN) audio.crash(0.2);
    } else if (actions & ACTION_PUNCH) {
      const events = world.tryPunch();
      if (events & EVENT_PUNCH) audio.punch();
    }
  }

  function handleKeyShortcuts(event) {
    // Title-screen shortcuts that are not one-shot actions: H for how-to, N for new game.
    if (event.code === 'KeyH' && (screen === SCREEN_TITLE || screen === SCREEN_PAUSED)) {
      screen = SCREEN_HOWTO;
    } else if (event.code === 'KeyN' && screen === SCREEN_TITLE) {
      startNewGame();
    }
  }
  window.addEventListener('keydown', handleKeyShortcuts);

  function reactToEvents(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_CRASH) audio.crash(0.4);
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_MISSION) {
      audio.mission();
      if (world.state.storyBanner && !storyShown) {
        storyShown = true;
        screen = SCREEN_STORY;
        announce('Story complete. You are the King of Solara Bay.');
      }
    }
    if (events & EVENT_WANTED_UP) {
      announce(`Wanted level ${world.state.player.wanted}. The Solara PD is coming.`);
    }
    if (events & EVENT_BUSTED) endRun(false);
    else if (events & EVENT_WASTED) endRun(true);
  }

  function step() {
    const mouse = input.mouse();
    const camera = world.state.camera;
    const aim = {
      x: camera.x + (mouse.x - renderer.view.width / 2) / camera.zoom,
      y: camera.y + (mouse.y - renderer.view.height / 2) / camera.zoom,
    };
    const held = {
      mx: input.moveX(),
      my: input.moveY(),
      run: input.isRunning(),
      handbrake: input.isHandbrake(),
      shoot: input.isShooting(),
      aim,
    };
    const events = world.step(STEP, held);
    reactToEvents(events);
    const player = world.state.player;
    audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / 700 : 0, !!player.inCar);
    audio.setSiren(player.wanted > 0, world.state.sirenHigh);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      mouse: screen === SCREEN_PLAY ? input.mouse() : null,
      muted: audio.isMuted(),
      hasSave: !!savedGame,
    });
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
