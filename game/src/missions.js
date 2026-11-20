// The story: Mara Voss, a getaway driver trying to buy her way out of Solara Bay,
// takes jobs from fixer Delia Crane. Three missions, each a chain of stages; a stage
// is a place to reach, a thing to grab, a car to steal, or a fight to win. The world
// asks this module what the current objective is and what completing a stage pays.

import { MONEY } from './config.js';
import { PLACES } from './city.js';

export const STAGE_GOTO = 'goto';
export const STAGE_PICKUP = 'pickup';
export const STAGE_DELIVER = 'deliver';
export const STAGE_STEAL_CAR = 'steal-car';
export const STAGE_ESCAPE = 'escape';
export const STAGE_FIGHT = 'fight';
export const STAGE_GRAB_CASH = 'grab-cash';

export const MISSIONS = [
  {
    id: 1,
    title: 'The Pickup',
    brief: 'Delia Crane needs a package lifted from the marina and run to The Palms. Keep it quiet — or at least keep it fast.',
    reward: MONEY.mission1,
    stages: [
      { type: STAGE_GOTO, place: PLACES.marina, text: 'Drive to Solara Marina', radius: 130 },
      { type: STAGE_PICKUP, place: PLACES.marina, text: 'Pick up the package', radius: 130 },
      { type: STAGE_DELIVER, place: PLACES.motel, text: 'Deliver the package to The Palms Motel', radius: 140, wantedOnStart: 1 },
    ],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    brief: 'A gold Comet GT is parked outside the Grand Solara Hotel. Delia has a buyer. Take it — and lose whoever follows.',
    reward: MONEY.mission2,
    stages: [
      { type: STAGE_GOTO, place: PLACES.hotel, text: 'Find the Comet GT at the Grand Solara Hotel', radius: 140 },
      { type: STAGE_STEAL_CAR, place: PLACES.hotel, text: 'Steal the Comet GT', radius: 80, wantedOnStart: 2 },
      { type: STAGE_ESCAPE, place: PLACES.safehouse, text: 'Lose the cops and bring the Comet to the garage', radius: 140 },
    ],
  },
  {
    id: 3,
    title: 'The Vault Job',
    brief: 'Solara Trust Bank. Four guards, one vault bag, and the whole Solara PD. This is the one that buys your freedom.',
    reward: MONEY.mission3,
    stages: [
      { type: STAGE_GOTO, place: PLACES.bank, text: 'Reach Solara Trust Bank', radius: 140 },
      { type: STAGE_FIGHT, place: PLACES.bank, text: 'Take out the bank guards (4)', radius: 200, guards: 4 },
      { type: STAGE_GRAB_CASH, place: PLACES.bank, text: 'Grab the vault bag', radius: 130, wantedOnStart: 3 },
      { type: STAGE_ESCAPE, place: PLACES.safehouse, text: 'Escape to the garage with the bag', radius: 140 },
    ],
  },
];

export const STORY_COMPLETE_TITLE = 'King of Solara Bay';

/** A fresh mission tracker: which mission, which stage, and per-stage scratch state. */
export function createMissionTracker() {
  return { missionIndex: 0, stageIndex: 0, stageState: {}, completed: 0, storyDone: false };
}

export function currentMission(tracker) {
  if (tracker.missionIndex >= MISSIONS.length) return null;
  return MISSIONS[tracker.missionIndex];
}

export function currentStage(tracker) {
  const mission = currentMission(tracker);
  if (!mission) return null;
  return mission.stages[tracker.stageIndex];
}

export function advanceStage(tracker) {
  const mission = currentMission(tracker);
  if (!mission) return { missionComplete: false, storyComplete: false };
  tracker.stageIndex += 1;
  tracker.stageState = {};
  if (tracker.stageIndex < mission.stages.length) return { missionComplete: false, storyComplete: false };
  tracker.completed += 1;
  tracker.missionIndex += 1;
  tracker.stageIndex = 0;
  const storyComplete = tracker.missionIndex >= MISSIONS.length;
  if (storyComplete) tracker.storyDone = true;
  return { missionComplete: true, storyComplete, reward: mission.reward, title: mission.title };
}

export function missionObjectiveText(tracker) {
  const mission = currentMission(tracker);
  if (!mission) return 'Free roam — Solara Bay is yours. Earn cash, dodge the law.';
  const stage = mission.stages[tracker.stageIndex];
  return stage.text;
}
