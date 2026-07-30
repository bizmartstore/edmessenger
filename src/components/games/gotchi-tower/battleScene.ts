/** Gotchi Tower — battle arena with skill / damage VFX. */
import * as Phaser from "phaser";
import { PALETTE, generateWildVoxels, type Voxel } from "@/lib/edgotchi";
import { themeForFloor } from "@/lib/gotchi-tower";

export type BattleBootData = {
  playerName: string;
  foeName: string;
  voxels: Voxel[];
  foeVoxels?: Voxel[];
  foeSeed?: number;
  floor?: number;
  isBoss?: boolean;
  isPvp?: boolean;
};

export type BattleVfxEvent = {
  type: string;
  target?: string;
  amount?: number;
  crit?: boolean;
  skill?: string;
  vfx?: string;
};

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function bake(scene: Phaser.Scene, key: string, voxels: Voxel[], scale = 4) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.4);
  g.fillRect(3 * scale, 9 * scale, 5 * scale, scale);
  for (const v of voxels) {
    g.fillStyle(hexToNum(PALETTE[v.c % PALETTE.length]), 1);
    g.fillRect(v.x * scale, v.y * scale, scale, scale);
  }
  g.generateTexture(key, 8 * scale, 10 * scale);
  g.destroy();
  if (scene.textures.exists(key)) {
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

class BattleScene extends Phaser.Scene {
  private boot!: BattleBootData;
  private player!: Phaser.GameObjects.Image;
  private foe!: Phaser.GameObjects.Image;
  private floatLayer!: Phaser.GameObjects.Container;

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

    const walls = this.add.graphics();
    walls.fillStyle(theme.ground, 0.55);
    walls.fillRect(0, 0, 36, h);
    walls.fillRect(w - 36, 0, 36, h);
    walls.fillStyle(theme.accent, 0.15);
    for (let y = 20; y < h; y += 40) {
      walls.fillRect(6, y, 24, 18);
      walls.fillRect(w - 30, y, 24, 18);
    }
    walls.fillStyle(0x000000, 0.25);
    walls.fillRect(50, 20, 18, h - 60);
    walls.fillRect(w - 68, 20, 18, h - 60);

    const platform = this.add.graphics();
    platform.fillStyle(0x000000, 0.35);
    platform.fillEllipse(w * 0.5, h * 0.78, w * 0.78, 56);
    platform.fillStyle(theme.ground, 0.85);
    platform.fillEllipse(w * 0.5, h * 0.74, w * 0.62, 40);
    platform.fillStyle(theme.accent, 0.2);
    platform.fillEllipse(w * 0.5, h * 0.74, w * 0.4, 22);
    platform.lineStyle(2, theme.glow, 0.45);
    platform.strokeEllipse(w * 0.5, h * 0.74, w * 0.4, 22);

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
    const foeVox =
      this.boot.foeVoxels?.length
        ? this.boot.foeVoxels
        : generateWildVoxels(this.boot.foeSeed ?? ((this.boot.floor ?? 1) * 9973) >>> 0);
    bake(this, "gt-b-foe", foeVox, this.boot.isBoss ? 5 : 4);

    this.player = this.add.image(w * 0.28, h * 0.52, "gt-b-player").setScale(2.35);
    this.foe = this.add
      .image(w * 0.72, h * 0.48, "gt-b-foe")
      .setScale(this.boot.isBoss ? 2.6 : 2.35);
    if (this.boot.isBoss) this.foe.setTint(0xff6688);
    else if (this.boot.isPvp) this.foe.setTint(0x88aaff);
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

    this.floatLayer = this.add.container(0, 0).setDepth(50);

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

  private actor(target?: string) {
    return target === "player" ? this.player : this.foe;
  }

  private floatDamage(x: number, y: number, amount: number, crit?: boolean, heal?: boolean) {
    const color = heal ? "#6dff9a" : crit ? "#ffef8a" : "#ff6b6b";
    const t = this.add
      .text(x, y - 20, `${heal ? "+" : "-"}${amount}${crit ? "!" : ""}`, {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: crit ? "22px" : "18px",
        fontStyle: "bold",
        color,
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.floatLayer.add(t);
    this.tweens.add({
      targets: t,
      y: y - 70,
      alpha: 0,
      scale: crit ? 1.35 : 1.1,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  private playSkillVfx(vfx: string | undefined, from: Phaser.GameObjects.Image, to: Phaser.GameObjects.Image) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 10;
    const g = this.add.graphics().setDepth(40);

    const flash = (color: number, x: number, y: number, r: number) => {
      const c = this.add.circle(x, y, r, color, 0.75).setDepth(41);
      this.tweens.add({
        targets: c,
        alpha: 0,
        scale: 2.4,
        duration: 380,
        onComplete: () => c.destroy(),
      });
    };

    switch (vfx) {
      case "bolt":
      case "lance":
      case "spark": {
        const color = vfx === "lance" ? 0xa78bfa : vfx === "spark" ? 0xfde047 : 0x60a5fa;
        g.lineStyle(3, color, 1);
        g.lineBetween(from.x, from.y - 10, to.x, to.y);
        flash(color, to.x, to.y, 16);
        this.tweens.add({
          targets: g,
          alpha: 0,
          duration: 280,
          onComplete: () => g.destroy(),
        });
        // projectile orb
        const orb = this.add.circle(from.x, from.y - 10, 6, color, 1).setDepth(42);
        this.tweens.add({
          targets: orb,
          x: to.x,
          y: to.y,
          duration: 220,
          onComplete: () => orb.destroy(),
        });
        break;
      }
      case "slash": {
        g.lineStyle(5, 0xffe08a, 1);
        g.beginPath();
        g.arc(to.x, to.y, 34, -0.8, 0.9, false);
        g.strokePath();
        flash(0xfff0c0, to.x, to.y, 20);
        this.tweens.add({
          targets: from,
          x: from.x + (to.x > from.x ? 28 : -28),
          duration: 80,
          yoyo: true,
        });
        this.tweens.add({
          targets: g,
          alpha: 0,
          duration: 320,
          onComplete: () => g.destroy(),
        });
        break;
      }
      case "burst":
      case "nova": {
        const color = vfx === "nova" ? 0xc084fc : 0xfb7185;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const p = this.add.circle(midX, midY, 5, color, 0.9).setDepth(42);
          this.tweens.add({
            targets: p,
            x: midX + Math.cos(ang) * 55,
            y: midY + Math.sin(ang) * 55,
            alpha: 0,
            duration: 420,
            onComplete: () => p.destroy(),
          });
        }
        flash(color, midX, midY, 28);
        g.destroy();
        break;
      }
      case "shield": {
        const ring = this.add.circle(from.x, from.y, 18, 0x38bdf8, 0.55).setDepth(41);
        this.tweens.add({
          targets: ring,
          scale: 2.2,
          alpha: 0,
          duration: 500,
          onComplete: () => ring.destroy(),
        });
        g.destroy();
        break;
      }
      case "heal":
      case "bless": {
        for (let i = 0; i < 6; i++) {
          const p = this.add
            .circle(from.x + (Math.random() - 0.5) * 30, from.y + 10, 3, 0x4ade80, 0.9)
            .setDepth(42);
          this.tweens.add({
            targets: p,
            y: from.y - 50,
            alpha: 0,
            duration: 600 + i * 40,
            onComplete: () => p.destroy(),
          });
        }
        flash(0x4ade80, from.x, from.y, 22);
        g.destroy();
        break;
      }
      default:
        g.destroy();
        flash(0xffffff, to.x, to.y, 14);
    }
  }

  private onVfx = (evt: BattleVfxEvent) => {
    if (evt.type === "skill" || evt.type === "hit") {
      const target = this.actor(evt.target);
      const source = evt.target === "player" ? this.foe : this.player;
      if (evt.vfx || evt.skill) {
        this.playSkillVfx(evt.vfx || "slash", source, target);
      }
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
      if (typeof evt.amount === "number" && evt.amount > 0) {
        this.floatDamage(target.x, target.y, evt.amount, evt.crit, false);
      }
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
      this.playSkillVfx(evt.vfx || "heal", this.player, this.player);
      if (typeof evt.amount === "number") {
        this.floatDamage(this.player.x, this.player.y, evt.amount, false, true);
      }
    }
    if (evt.type === "damage_number" && typeof evt.amount === "number") {
      const target = this.actor(evt.target);
      this.floatDamage(target.x, target.y, evt.amount, evt.crit, false);
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
    height: 220,
    backgroundColor: "#0b1220",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  parent.querySelector("canvas")?.style.setProperty("image-rendering", "pixelated");
  game.scene.add("BattleScene", BattleScene, true, data);
  return game;
}
