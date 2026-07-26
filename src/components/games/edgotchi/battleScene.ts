// Phaser's ESM build only has named exports (no default) — required for Nitro/Rolldown.
import * as Phaser from "phaser";
import type { SkillId, Voxel } from "@/lib/edgotchi";
import { PALETTE, SKILLS } from "@/lib/edgotchi";

export type BattleVfxEvent =
  | { type: "skill"; skill: SkillId; from: "player" | "enemy" }
  | { type: "hit"; target: "player" | "enemy"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "shield" }
  | { type: "win" }
  | { type: "lose" };

export type BattleBootData = {
  voxels: Voxel[];
  mapTint: number;
  playerName: string;
  enemyName: string;
};

const VOXEL_W = 8;
const VOXEL_H = 10;

function defaultEnemyVoxels(): Voxel[] {
  const cells: Voxel[] = [];
  const body = [
    [3, 3],
    [4, 3],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [2, 5],
    [3, 5],
    [4, 5],
    [5, 5],
    [3, 6],
    [4, 6],
    [2, 7],
    [5, 7],
  ];
  for (const [x, y] of body) cells.push({ x, y, c: 4 });
  cells.push({ x: 3, y: 4, c: 6 }, { x: 4, y: 4, c: 6 });
  return cells;
}

export class EdgotchiBattleScene extends Phaser.Scene {
  private mapTint = 0x1e3a5f;
  private voxels: Voxel[] = [];
  private playerName = "Edgotchi";
  private enemyName = "Foe";
  private playerSprite!: Phaser.GameObjects.Container;
  private enemySprite!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;

  constructor() {
    super("EdgotchiBattle");
  }

  init(data: BattleBootData) {
    this.voxels = data?.voxels ?? [];
    this.mapTint = data?.mapTint ?? 0x1e3a5f;
    this.playerName = data?.playerName ?? "Edgotchi";
    this.enemyName = data?.enemyName ?? "Foe";
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, this.mapTint);
    this.add.ellipse(w / 2, h * 0.72, w * 0.9, 48, 0x000000, 0.25);

    for (let i = 0; i < 18; i++) {
      const s = this.add.circle(
        Phaser.Math.Between(8, w - 8),
        Phaser.Math.Between(8, Math.floor(h * 0.45)),
        Phaser.Math.Between(1, 2),
        0xffffff,
        Phaser.Math.FloatBetween(0.15, 0.45),
      );
      this.tweens.add({
        targets: s,
        alpha: { from: 0.15, to: 0.7 },
        duration: Phaser.Math.Between(900, 1800),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 800),
      });
    }

    this.playerSprite = this.buildVoxelPet(this.voxels, false);
    this.playerSprite.setPosition(w * 0.28, h * 0.55);
    this.playerSprite.setScale(1.15);

    this.enemySprite = this.buildVoxelPet(this.voxels.length ? this.voxels : defaultEnemyVoxels(), true);
    this.enemySprite.setPosition(w * 0.72, h * 0.48);
    this.enemySprite.setScale(1.05);

    this.add
      .text(w * 0.28, h * 0.72, this.playerName, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add
      .text(w * 0.72, h * 0.68, this.enemyName, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#ffd0d8",
      })
      .setOrigin(0.5);

    this.fxLayer = this.add.container(0, 0).setDepth(20);

    this.tweens.add({
      targets: this.playerSprite,
      y: this.playerSprite.y - 6,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.enemySprite,
      y: this.enemySprite.y - 5,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 200,
    });

    this.game.events.on("edgotchi-vfx", this.onVfx, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("edgotchi-vfx", this.onVfx, this);
    });
  }

  private buildVoxelPet(voxels: Voxel[], foeTint: boolean) {
    const container = this.add.container(0, 0);
    const cell = 10;
    const ox = (-VOXEL_W * cell) / 2;
    const oy = (-VOXEL_H * cell) / 2;
    const list = voxels.length ? voxels : defaultEnemyVoxels();
    for (const v of list) {
      let color = Phaser.Display.Color.HexStringToColor(PALETTE[v.c] ?? "#888888").color;
      if (foeTint) {
        const c = Phaser.Display.Color.IntegerToColor(color);
        color = Phaser.Display.Color.GetColor(
          Math.min(255, Math.floor(c.red * 0.7 + 80)),
          Math.floor(c.green * 0.45),
          Math.min(255, Math.floor(c.blue * 0.55 + 40)),
        );
      }
      const rect = this.add.rectangle(
        ox + v.x * cell + cell / 2,
        oy + v.y * cell + cell / 2,
        cell - 1,
        cell - 1,
        color,
      );
      rect.setStrokeStyle(1, 0x000000, 0.15);
      container.add(rect);
    }
    return container;
  }

  private onVfx = (evt: BattleVfxEvent) => {
    if (evt.type === "skill") this.playSkill(evt.skill, evt.from);
    if (evt.type === "hit") this.playHit(evt.target, evt.amount);
    if (evt.type === "heal") this.playHeal(evt.amount);
    if (evt.type === "shield") this.playShield();
    if (evt.type === "win") this.flashBanner("VICTORY!", "#ffe566");
    if (evt.type === "lose") this.flashBanner("DEFEAT…", "#ff6688");
  };

  private playSkill(skill: SkillId, from: "player" | "enemy") {
    const def = SKILLS[skill];
    const start = from === "player" ? this.playerSprite : this.enemySprite;
    const end = from === "player" ? this.enemySprite : this.playerSprite;
    const color = def.color;

    const ring = this.add.circle(start.x, start.y, 8, color, 0.35);
    this.fxLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });

    if (skill === "heal") {
      this.playHeal(Math.abs(def.power));
      return;
    }
    if (skill === "shield") {
      this.playShield();
      return;
    }

    for (let i = 0; i < 5; i++) {
      const orb = this.add.circle(start.x, start.y, 5 + (i % 2), color, 0.85);
      this.fxLayer.add(orb);
      this.tweens.add({
        targets: orb,
        x: end.x + Phaser.Math.Between(-12, 12),
        y: end.y + Phaser.Math.Between(-12, 12),
        scale: 0.2,
        duration: 380 + i * 40,
        ease: "Cubic.easeIn",
        onComplete: () => {
          orb.destroy();
          if (i === 4) this.burst(end.x, end.y, color);
        },
      });
    }

    if (skill === "nova") {
      const nova = this.add.circle(start.x, start.y, 10, 0xffffff, 0.5);
      this.fxLayer.add(nova);
      this.tweens.add({
        targets: nova,
        scale: 8,
        alpha: 0,
        duration: 700,
        onComplete: () => nova.destroy(),
      });
    }
  }

  private burst(x: number, y: number, color: number) {
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(x, y, 3, color, 0.9);
      this.fxLayer.add(p);
      const ang = (Math.PI * 2 * i) / 10;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * 36,
        y: y + Math.sin(ang) * 36,
        alpha: 0,
        duration: 420,
        onComplete: () => p.destroy(),
      });
    }
  }

  private playHit(target: "player" | "enemy", amount: number) {
    const spr = target === "player" ? this.playerSprite : this.enemySprite;
    this.tweens.add({
      targets: spr,
      x: spr.x + (target === "player" ? -10 : 10),
      duration: 70,
      yoyo: true,
      repeat: 2,
    });
    const label = this.add
      .text(spr.x, spr.y - 40, `-${amount}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#ff6b6b",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.fxLayer.add(label);
    this.tweens.add({
      targets: label,
      y: label.y - 28,
      alpha: 0,
      duration: 700,
      onComplete: () => label.destroy(),
    });
    this.burst(spr.x, spr.y, 0xff5555);
  }

  private playHeal(amount: number) {
    const spr = this.playerSprite;
    for (let i = 0; i < 8; i++) {
      const p = this.add.circle(spr.x + Phaser.Math.Between(-20, 20), spr.y + 20, 3, 0x44ff88, 0.9);
      this.fxLayer.add(p);
      this.tweens.add({
        targets: p,
        y: spr.y - 40,
        alpha: 0,
        duration: 600 + i * 40,
        onComplete: () => p.destroy(),
      });
    }
    const label = this.add
      .text(spr.x, spr.y - 36, `+${amount}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#44ff88",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.fxLayer.add(label);
    this.tweens.add({
      targets: label,
      y: label.y - 24,
      alpha: 0,
      duration: 700,
      onComplete: () => label.destroy(),
    });
  }

  private playShield() {
    const spr = this.playerSprite;
    const shield = this.add.circle(spr.x, spr.y, 28, 0x44aaff, 0.25).setStrokeStyle(2, 0x88ccff, 0.9);
    this.fxLayer.add(shield);
    this.tweens.add({
      targets: shield,
      scale: 1.4,
      alpha: 0,
      duration: 900,
      onComplete: () => shield.destroy(),
    });
  }

  private flashBanner(text: string, color: string) {
    const w = this.scale.width;
    const h = this.scale.height;
    const banner = this.add
      .text(w / 2, h * 0.35, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.6);
    this.fxLayer.add(banner);
    this.tweens.add({
      targets: banner,
      alpha: 1,
      scale: 1.05,
      duration: 450,
      ease: "Back.easeOut",
    });
  }
}

export function createEdgotchiBattleGame(parent: HTMLElement, data: BattleBootData): Phaser.Game {
  const width = Math.max(280, parent.clientWidth || 360);
  const height = Math.min(280, Math.floor(width * 0.72));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#0b1220",
    scene: [],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    audio: { noAudio: true },
  });
  game.scene.add("EdgotchiBattle", EdgotchiBattleScene, true, data);
  return game;
}

export function emitBattleVfx(game: Phaser.Game | null, evt: BattleVfxEvent) {
  game?.events.emit("edgotchi-vfx", evt);
}
