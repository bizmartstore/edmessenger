/** Gotchi Tower — richer quiz battle arena VFX. */
import * as Phaser from "phaser";
import { PALETTE, type Voxel } from "@/lib/edgotchi";
import { themeForFloor } from "@/lib/gotchi-tower";

export type BattleBootData = {
  playerName: string;
  foeName: string;
  voxels: Voxel[];
  floor?: number;
  isBoss?: boolean;
  isPvp?: boolean;
};

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function bake(scene: Phaser.Scene, key: string, voxels: Voxel[], scale = 4) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(4 * scale, 9.2 * scale, 6.5 * scale, 1.8 * scale);
  for (const v of voxels) {
    g.fillStyle(hexToNum(PALETTE[v.c % PALETTE.length]), 1);
    g.fillRect(v.x * scale, v.y * scale, scale, scale);
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(v.x * scale, v.y * scale, scale, Math.max(1, scale * 0.28));
  }
  g.generateTexture(key, 8 * scale, 10 * scale);
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
    const theme = themeForFloor(this.boot.floor ?? 1);
    const top = this.boot.isBoss ? 0x4a1020 : this.boot.isPvp ? 0x1a2040 : theme.skyTop;
    const bot = this.boot.isBoss ? 0x8a3048 : this.boot.isPvp ? 0x3a5080 : theme.skyBottom;

    const bg = this.add.graphics();
    bg.fillGradientStyle(top, top, bot, bot, 1);
    bg.fillRect(0, 0, w, h);

    // Arena walls
    const walls = this.add.graphics();
    walls.fillStyle(theme.ground, 0.55);
    walls.fillRect(0, 0, 36, h);
    walls.fillRect(w - 36, 0, 36, h);
    walls.fillStyle(theme.accent, 0.15);
    for (let y = 20; y < h; y += 40) {
      walls.fillRect(6, y, 24, 18);
      walls.fillRect(w - 30, y, 24, 18);
    }

    // Pillars
    walls.fillStyle(0x000000, 0.25);
    walls.fillRect(50, 20, 18, h - 60);
    walls.fillRect(w - 68, 20, 18, h - 60);

    // Platform
    const platform = this.add.graphics();
    platform.fillStyle(0x000000, 0.35);
    platform.fillEllipse(w * 0.5, h * 0.78, w * 0.78, 56);
    platform.fillStyle(theme.ground, 0.85);
    platform.fillEllipse(w * 0.5, h * 0.74, w * 0.62, 40);
    platform.fillStyle(theme.accent, 0.2);
    platform.fillEllipse(w * 0.5, h * 0.74, w * 0.4, 22);
    platform.lineStyle(2, theme.glow, 0.45);
    platform.strokeEllipse(w * 0.5, h * 0.74, w * 0.4, 22);

    // Torch glows
    for (const x of [70, w - 70]) {
      const flame = this.add.circle(x, 48, 10, 0xffaa44, 0.7);
      this.tweens.add({
        targets: flame,
        alpha: { from: 0.4, to: 0.9 },
        scale: { from: 0.9, to: 1.2 },
        duration: 380,
        yoyo: true,
        repeat: -1,
      });
    }

    bake(
      this,
      "gt-b-player",
      this.boot.voxels?.length ? this.boot.voxels : [{ x: 3, y: 3, c: 1 }],
      4,
    );
    // Simple foe silhouette texture
    if (!this.textures.exists("gt-b-foe")) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a1848, 1);
      g.fillEllipse(20, 28, 32, 24);
      g.fillStyle(this.boot.isBoss ? 0xff4466 : theme.accent, 1);
      g.fillCircle(20, 14, 12);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 12, 2);
      g.fillCircle(24, 12, 2);
      g.generateTexture("gt-b-foe", 40, 40);
      g.destroy();
    }

    this.player = this.add.image(w * 0.28, h * 0.52, "gt-b-player").setScale(2.35);
    this.foe = this.add
      .image(w * 0.72, h * 0.48, "gt-b-foe")
      .setScale(this.boot.isBoss ? 3.2 : 2.4);
    this.foe.setTint(this.boot.isBoss ? 0xff6688 : this.boot.isPvp ? 0x88aaff : 0xffaa66);
    this.foe.setFlipX(true);

    this.tweens.add({
      targets: this.player,
      y: this.player.y - 4,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: this.foe,
      y: this.foe.y - 6,
      duration: 850,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(w * 0.28, h * 0.52 + 52, this.boot.playerName, {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.add
      .text(w * 0.72, h * 0.48 + 58, this.boot.foeName, {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, 14, this.boot.isBoss ? "GUARDIAN BATTLE" : "FLOOR COMBAT", {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#ffe8c8",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    for (let i = 0; i < 14; i++) {
      const s = this.add.circle(Math.random() * w, Math.random() * h, 2, theme.glow, 0.45);
      this.tweens.add({
        targets: s,
        y: s.y - 50,
        alpha: 0,
        duration: 2000 + Math.random() * 1500,
        repeat: -1,
        delay: i * 100,
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
        x: target.x + (evt.target === "player" ? -14 : 14),
        duration: 55,
        yoyo: true,
        repeat: 2,
      });
      const flash = this.add.circle(target.x, target.y, 28, 0xffffff, 0.55);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 2.2,
        duration: 280,
        onComplete: () => flash.destroy(),
      });
    }
    if (evt.type === "heal") {
      const ring = this.add.circle(this.player.x, this.player.y, 10, 0x44ff88, 0.65);
      this.tweens.add({
        targets: ring,
        scale: 3.2,
        alpha: 0,
        duration: 420,
        onComplete: () => ring.destroy(),
      });
    }
    if (evt.type === "win") {
      this.cameras.main.flash(420, 255, 220, 120);
    }
    if (evt.type === "lose") {
      this.cameras.main.shake(360, 0.014);
      this.cameras.main.flash(200, 180, 40, 40);
    }
  };
}

export function createGotchiTowerBattleGame(parent: HTMLElement, data: BattleBootData): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.min(parent.clientWidth || 640, 640),
    height: 300,
    backgroundColor: "#0b1220",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  game.scene.add("BattleScene", BattleScene, true, data);
  return game;
}
