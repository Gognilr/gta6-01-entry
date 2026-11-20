// Keyboard and mouse input. Held keys give movement and driving; one-shot presses
// (start, pause, enter car, punch, save) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.
// Mouse position is reported in canvas pixels for aiming.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SAVE = 16;
export const ACTION_MUTE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SAVE = new Set(['KeyL']);
const MUTE = new Set(['KeyM']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function codeAction(code) {
    if (CONFIRM.has(code)) return ACTION_CONFIRM;
    if (PAUSE.has(code)) return ACTION_PAUSE;
    if (ENTER_CAR.has(code)) return ACTION_ENTER_CAR;
    if (PUNCH.has(code)) return ACTION_PUNCH;
    if (SAVE.has(code)) return ACTION_SAVE;
    if (MUTE.has(code)) return ACTION_MUTE;
    return 0;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const action = codeAction(event.code);
    if (action) actions |= action;
    held.add(event.code);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || CONFIRM.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    mouseClicked = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function hasAny(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** -1/0/1 for each axis, from the held movement keys. */
    moveX() {
      return (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
    },
    moveY() {
      return (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
    },
    isRunning() {
      return hasAny(RUN);
    },
    isHandbrake() {
      return hasAny(HANDBRAKE);
    },
    isShooting() {
      return mouseDown;
    },
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** True once when the mouse was clicked since the last call. */
    takeMouseClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
