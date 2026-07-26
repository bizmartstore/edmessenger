/**
 * SSR/Worker stub for Phaser. Real Phaser is browser/canvas-only and must not
 * ship inside the Cloudflare Worker bundle.
 */
const noop = () => undefined;

class StubScene {
  constructor(_key?: string) {}
}

class StubGame {
  scene = { add: noop };
  events = { on: noop, off: noop, emit: noop };
  destroy = noop;
}

const Phaser = {
  AUTO: 0,
  Game: StubGame,
  Scene: StubScene,
  Scale: { FIT: 0, CENTER_BOTH: 0 },
  Scenes: { Events: { SHUTDOWN: "shutdown" } },
  Math: {
    Between: () => 0,
    FloatBetween: () => 0,
    Clamp: (v: number) => v,
    Distance: { Between: () => 0 },
  },
  Display: {
    Color: {
      HexStringToColor: () => ({ color: 0 }),
      IntegerToColor: () => ({ red: 0, green: 0, blue: 0, r: 0, g: 0, b: 0 }),
      GetColor: () => 0,
      Interpolate: { ColorWithColor: () => ({ r: 0, g: 0, b: 0 }) },
    },
  },
  Input: { Keyboard: { KeyCodes: {} } },
  Physics: { Arcade: {} },
};

export default Phaser;
export const AUTO = 0;
export const Game = StubGame;
export const Scene = StubScene;
export const Scale = Phaser.Scale;
export const Scenes = Phaser.Scenes;
export const Math = Phaser.Math;
export const Display = Phaser.Display;
export const Input = Phaser.Input;
export const Physics = Phaser.Physics;
