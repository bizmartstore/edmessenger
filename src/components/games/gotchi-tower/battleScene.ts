/** Gotchi Tower — quiz battle VFX scene. */
import * as Phaser from "phaser";
import { PALETTE, type Voxel } from "@/lib/edgotchi";

export type BattleBootData = {
  playerName: string;
  foeName: string;
  voxels: Voxel[];
  isBoss?: boolean;
  isPvp?: boolean;
};

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function bake(scene: Phaser.Scene, key: string, voxels: Voxel[]) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (const v of voxels) {
    g.fillStyle(hexToNum(PALETTE[v.c % PALETTE.length]), 1);
    g.fillRect(v.x * 4, v.y * 4, 4, 4);
  }
  g.generateTexture(key, 32, 40);
  g.destroy();
}

class BattleScene extends Phaser.Scene {
  private boot!: BattleBootData;
  private player!: Phaser.GameObjects.Image;
  private foe!: Phaser.GameObjects.Image;

  constructor() {
    super("BattleScene");
  }

  init(data: BattleBootData) {
    this.boot = data;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.graphics();
    const top = this.boot.isBoss ? 0x4a1020 : this.boot.isPvp ? 0x1a2040 : 0x1a3050;
    const bot = this.boot.isBoss ? 0x8a3048 : this.boot.isPvp ? 0x3a5080 : 0x3a70a0;
    bg.fillGradientStyle(top, top, bot, bot, 1);
    bg.fillRect(0, 0, w, h);

    // Arena platform
    const platform = this.add.graphics();
    platform.fillStyle(0x000000, 0.25);
    platform.fillEllipse(w * 0.5, h * 0.72, w * 0.7, 50);
    platform.fillStyle(0xffffff, 0.08);
    platform.fillEllipse(w * 0.5, h * 0.7, w * 0.55, 36);

    bake(this, "gt-b-player", this.boot.voxels?.length ? this.boot.voxels : [{ x: 3, y: 3, c: 1 }]);
    this.player = this.add.image(w * 0.28, h * 0.55, "gt-b-player").setScale(2.2);
    this.foe = this.add.image(w * 0.72, h * 0.5, "gt-b-player").setScale(this.boot.isBoss ? 3 : 2.2);
    this.foe.setTint(this.boot.isBoss ? 0xff6688 : this.boot.isPvp ? 0x88aaff : 0xffaa66);
    this.foe.setFlipX(true);

    this.add
      .text(w * 0.28, h * 0.55 + 50, this.boot.playerName, {
        fontSize: "12px",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.add
      .text(w * 0.72, h * 0.5 + 55, this.boot.foeName, {
        fontSize: "12px",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Floating sparkles
    for (let i = 0; i < 12; i++) {
      const s = this.add.circle(Math.random() * w, Math.random() * h, 2, 0xffe08a, 0.5);
      this.tweens.add({
        targets: s,
        y: s.y - 40,
        alpha: 0,
        duration: 2000 + Math.random() * 1500,
        repeat: -1,
        delay: i * 120,
      });
    }

    this.game.events.on("gt-battle-vfx", this.onVfx, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("gt-battle-vfx", this.onVfx, this);
    });
  }

  private onVfx = (evt: { type: string; target?: string; amount?: number }) => {
    if (evt.type === "hit") {
      const target = evt.target === "player" ? this.player : this.foe;
      this.tweens.add({
        targets: target,
        x: target.x + (evt.target === "player" ? -12 : 12),
        duration: 60,
        yoyo: true,
        repeat: 2,
      });
      const flash = this.add.circle(target.x, target.y, 30, 0xffffff, 0.5);
      this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 300, onComplete: () => flash.destroy() });
    }
    if (evt.type === "heal") {
      const ring = this.add.circle(this.player.x, this.player.y, 10, 0x44ff88, 0.6);
      this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    }
    if (evt.type === "win") {
      this.cameras.main.flash(400, 255, 220, 100);
    }
    if (evt.type === "lose") {
      this.cameras.main.shake(300, 0.01);
    }
  };
}

export function createGotchiTowerBattleGame(parent: HTMLElement, data: BattleBootData): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.min(parent.clientWidth || 640, 640),
    height: 280,
    backgroundColor: "#0b1220",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  game.scene.add("BattleScene", BattleScene, true, data);
  return game;
}
