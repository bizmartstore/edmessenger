/** Gotchi Tower — shared floor Phaser scene with fantasy-academy polish. */
import * as Phaser from "phaser";
import { PALETTE, type Voxel } from "@/lib/edgotchi";
import { themeForFloor, type FloorTheme } from "@/lib/gotchi-tower";

export type FloorBootData = {
  floor: number;
  floorCount: number;
  voxels: Voxel[];
  playerName: string;
  peers?: Array<{ userId: string; name: string; x: number; y: number; voxels?: Voxel[] }>;
};

export type FloorInteractEvent =
  | { kind: "quiz_gate"; id: string }
  | { kind: "monster"; id: string; name: string }
  | { kind: "chest"; id: string }
  | { kind: "portal" }
  | { kind: "heal" }
  | { kind: "merchant" }
  | { kind: "challenge_peer"; userId: string; name: string };

const WORLD_W = 960;
const WORLD_H = 640;
const SPEED = 170;

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function bakeVoxelTexture(scene: Phaser.Scene, key: string, voxels: Voxel[], scale = 3) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cell = scale;
  for (const v of voxels) {
    g.fillStyle(hexToNum(PALETTE[v.c % PALETTE.length]), 1);
    g.fillRect(v.x * cell, v.y * cell, cell, cell);
  }
  g.generateTexture(key, 8 * cell, 10 * cell);
  g.destroy();
}

function bakeWorldTextures(scene: Phaser.Scene, theme: FloorTheme) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.clear();
  g.fillStyle(theme.accent, 1);
  g.fillRoundedRect(2, 8, 28, 36, 6);
  g.fillStyle(theme.glow, 0.85);
  g.fillCircle(16, 18, 8);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(13, 15, 3);
  g.generateTexture("gt-portal", 32, 48);

  g.clear();
  g.fillStyle(0x8b5a2b, 1);
  g.fillRoundedRect(4, 10, 28, 20, 4);
  g.fillStyle(theme.glow, 1);
  g.fillCircle(18, 18, 4);
  g.fillStyle(0xffd700, 1);
  g.fillRect(16, 6, 4, 6);
  g.generateTexture("gt-chest", 36, 32);

  g.clear();
  g.fillStyle(0x3a2a4a, 1);
  g.fillEllipse(20, 28, 32, 24);
  g.fillStyle(theme.accent, 1);
  g.fillCircle(20, 16, 12);
  g.fillStyle(0xff4466, 1);
  g.fillCircle(16, 14, 2);
  g.fillCircle(24, 14, 2);
  g.generateTexture("gt-monster", 40, 40);

  g.clear();
  g.fillStyle(0x2ecc71, 0.9);
  g.fillCircle(16, 16, 14);
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(12, 12, 4);
  g.fillStyle(0xffffff, 1);
  g.fillRect(14, 8, 4, 16);
  g.fillRect(8, 14, 16, 4);
  g.generateTexture("gt-heal", 32, 32);

  g.clear();
  g.fillStyle(0x5a3a1a, 1);
  g.fillRoundedRect(2, 8, 36, 28, 4);
  g.fillStyle(theme.glow, 1);
  g.fillCircle(20, 18, 6);
  g.generateTexture("gt-merchant", 40, 40);

  g.clear();
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(2, 2, 2);
  g.generateTexture("gt-spark", 6, 6);

  g.destroy();
}

class FloorScene extends Phaser.Scene {
  private boot!: FloorBootData;
  private theme!: FloorTheme;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private interactables: Phaser.Physics.Arcade.StaticGroup | null = null;
  private peerSprites = new Map<string, Phaser.GameObjects.Container>();
  private prompt?: Phaser.GameObjects.Text;
  private nearTarget: FloorInteractEvent | null = null;
  private particles?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super("FloorScene");
  }

  init(data: FloorBootData) {
    this.boot = data;
    this.theme = themeForFloor(data.floor);
  }

  create() {
    const theme = this.theme;
    bakeWorldTextures(this, theme);
    bakeVoxelTexture(this, "gt-player", this.boot.voxels?.length ? this.boot.voxels : [{ x: 3, y: 2, c: 0 }, { x: 4, y: 2, c: 1 }, { x: 3, y: 3, c: 6 }, { x: 4, y: 3, c: 6 }, { x: 3, y: 4, c: 2 }, { x: 4, y: 4, c: 2 }]);

    // Parallax sky layers
    const bg = this.add.graphics();
    bg.fillGradientStyle(theme.skyTop, theme.skyTop, theme.skyBottom, theme.skyBottom, 1);
    bg.fillRect(0, 0, WORLD_W, WORLD_H);

    for (let i = 0; i < theme.parallax.length; i++) {
      const layer = this.add.graphics();
      layer.fillStyle(theme.parallax[i], 0.35 - i * 0.05);
      for (let x = 0; x < WORLD_W; x += 80) {
        const h = 40 + ((i * 37 + x) % 90);
        layer.fillRoundedRect(x + i * 12, WORLD_H - 120 - h - i * 30, 70, h + 40, 12);
      }
      layer.setScrollFactor(0.15 + i * 0.12);
    }

    // Ground plane
    const ground = this.add.graphics();
    ground.fillStyle(theme.ground, 1);
    ground.fillRect(0, WORLD_H - 160, WORLD_W, 160);
    ground.fillStyle(theme.accent, 0.15);
    for (let x = 0; x < WORLD_W; x += 48) {
      ground.fillCircle(x + 20, WORLD_H - 80, 10 + (x % 20));
    }

    // Soft ambient light vignette feel via top glow orbs
    for (let i = 0; i < 6; i++) {
      const orb = this.add.circle(
        80 + i * 150,
        60 + (i % 2) * 40,
        18,
        theme.glow,
        0.12,
      );
      this.tweens.add({
        targets: orb,
        alpha: { from: 0.08, to: 0.22 },
        y: orb.y - 8,
        duration: 1800 + i * 200,
        yoyo: true,
        repeat: -1,
      });
    }

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H - 120, "gt-player");
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(1.15);

    const nameTag = this.add
      .text(this.player.x, this.player.y - 36, this.boot.playerName, {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "11px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.player.setData("nameTag", nameTag);

    this.interactables = this.physics.add.staticGroup();
    this.spawnInteractables();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.05);

    this.particles = this.add.particles(0, 0, "gt-spark", {
      lifespan: 2200,
      speed: { min: 4, max: 18 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: theme.glow,
      frequency: 80,
      blendMode: "ADD",
      x: { min: 0, max: WORLD_W },
      y: { min: 40, max: WORLD_H - 120 },
    });

    this.prompt = this.add
      .text(0, 0, "", {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "13px",
        color: "#fff8e7",
        backgroundColor: "#1a1030cc",
        padding: { x: 10, y: 6 },
      })
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.input.keyboard?.on("keydown-E", () => {
      if (this.nearTarget) {
        this.game.events.emit("gt-interact", this.nearTarget);
      }
    });
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (this.nearTarget) {
        this.game.events.emit("gt-interact", this.nearTarget);
      }
    });

    // Mobile virtual stick tap zones — emit interact on tap near player
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.nearTarget) return;
      const dx = p.worldX - this.player.x;
      const dy = p.worldY - this.player.y;
      if (dx * dx + dy * dy < 55 * 55) {
        this.game.events.emit("gt-interact", this.nearTarget);
      }
    });

    // HUD floor banner
    const banner = this.add
      .text(12, 12, `Floor ${this.boot.floor} · ${theme.name}`, {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(40);

    this.tweens.add({
      targets: banner,
      alpha: { from: 0, to: 1 },
      y: { from: 0, to: 12 },
      duration: 500,
    });

    for (const peer of this.boot.peers ?? []) {
      this.upsertPeer(peer);
    }

    this.game.events.on("gt-peers", this.onPeers, this);
    this.game.events.on("gt-peer-move", this.onPeerMove, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("gt-peers", this.onPeers, this);
      this.game.events.off("gt-peer-move", this.onPeerMove, this);
    });
  }

  private spawnInteractables() {
    const theme = this.theme;
    const isBoss = this.boot.floor % 10 === 0;

    const portal = this.interactables!.create(WORLD_W - 80, WORLD_H - 140, "gt-portal") as Phaser.Physics.Arcade.Sprite;
    portal.setData("evt", { kind: "portal" } satisfies FloorInteractEvent);
    this.tweens.add({
      targets: portal,
      scale: { from: 1, to: 1.12 },
      alpha: { from: 0.85, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    const gate = this.interactables!.create(220, WORLD_H - 150, "gt-portal") as Phaser.Physics.Arcade.Sprite;
    gate.setTint(theme.accent);
    gate.setData("evt", { kind: "quiz_gate", id: `gate-${this.boot.floor}` } satisfies FloorInteractEvent);

    const chest = this.interactables!.create(420, WORLD_H - 130, "gt-chest") as Phaser.Physics.Arcade.Sprite;
    chest.setData("evt", { kind: "chest", id: `chest-${this.boot.floor}` } satisfies FloorInteractEvent);
    this.tweens.add({ targets: chest, y: chest.y - 4, duration: 700, yoyo: true, repeat: -1 });

    const heal = this.interactables!.create(560, WORLD_H - 135, "gt-heal") as Phaser.Physics.Arcade.Sprite;
    heal.setData("evt", { kind: "heal" } satisfies FloorInteractEvent);

    const merchant = this.interactables!.create(700, WORLD_H - 135, "gt-merchant") as Phaser.Physics.Arcade.Sprite;
    merchant.setData("evt", { kind: "merchant" } satisfies FloorInteractEvent);

    const monsterName = isBoss ? `Guardian of Floor ${this.boot.floor}` : `Wardling ${this.boot.floor}`;
    const monster = this.interactables!.create(320, WORLD_H - 200, "gt-monster") as Phaser.Physics.Arcade.Sprite;
    monster.setScale(isBoss ? 1.6 : 1.1);
    if (isBoss) monster.setTint(0xff6688);
    monster.setData("evt", {
      kind: "monster",
      id: `mob-${this.boot.floor}`,
      name: monsterName,
    } satisfies FloorInteractEvent);
    this.tweens.add({
      targets: monster,
      x: monster.x + (isBoss ? 40 : 60),
      duration: isBoss ? 2200 : 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private onPeers = (
    peers: Array<{ userId: string; name: string; x: number; y: number; voxels?: Voxel[] }>,
  ) => {
    const seen = new Set<string>();
    for (const p of peers) {
      seen.add(p.userId);
      this.upsertPeer(p);
    }
    for (const [id, sprite] of this.peerSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.peerSprites.delete(id);
      }
    }
  };

  private onPeerMove = (msg: { userId: string; x: number; y: number }) => {
    const c = this.peerSprites.get(msg.userId);
    if (!c) return;
    this.tweens.add({ targets: c, x: msg.x, y: msg.y, duration: 120 });
  };

  private upsertPeer(p: { userId: string; name: string; x: number; y: number; voxels?: Voxel[] }) {
    let c = this.peerSprites.get(p.userId);
    if (!c) {
      const key = `gt-peer-${p.userId}`;
      bakeVoxelTexture(this, key, p.voxels?.length ? p.voxels : [{ x: 3, y: 3, c: 3 }, { x: 4, y: 3, c: 4 }]);
      const spr = this.add.image(0, 0, key).setScale(1);
      const label = this.add
        .text(0, -28, p.name, {
          fontSize: "10px",
          color: "#e0f2fe",
          stroke: "#000",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      c = this.add.container(p.x, p.y, [spr, label]).setDepth(9);
      c.setSize(40, 40);
      c.setInteractive(new Phaser.Geom.Rectangle(-20, -20, 40, 40), Phaser.Geom.Rectangle.Contains);
      c.on("pointerdown", () => {
        this.game.events.emit("gt-interact", {
          kind: "challenge_peer",
          userId: p.userId,
          name: p.name,
        } satisfies FloorInteractEvent);
      });
      this.peerSprites.set(p.userId, c);
    } else {
      c.setPosition(p.x, p.y);
    }
  }

  update() {
    if (!this.player?.body) return;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

    // Pointer drag move for mobile
    if (this.input.activePointer.isDown) {
      const dx = this.input.activePointer.worldX - this.player.x;
      const dy = this.input.activePointer.worldY - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 18) {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);

    const tag = this.player.getData("nameTag") as Phaser.GameObjects.Text | undefined;
    tag?.setPosition(this.player.x, this.player.y - 36);

    this.game.events.emit("gt-player-move", {
      x: this.player.x,
      y: this.player.y,
      floor: this.boot.floor,
    });

    // Proximity prompts
    this.nearTarget = null;
    let best = 9999;
    this.interactables?.getChildren().forEach((obj) => {
      const spr = obj as Phaser.Physics.Arcade.Sprite;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, spr.x, spr.y);
      if (d < 52 && d < best) {
        best = d;
        this.nearTarget = spr.getData("evt") as FloorInteractEvent;
      }
    });
    for (const [userId, c] of this.peerSprites) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
      if (d < 48 && d < best) {
        best = d;
        this.nearTarget = {
          kind: "challenge_peer",
          userId,
          name: (c.list[1] as Phaser.GameObjects.Text)?.text || "Peer",
        };
      }
    }

    if (this.prompt) {
      if (this.nearTarget) {
        const labels: Record<string, string> = {
          quiz_gate: "Press E — Quiz Gate",
          monster: "Press E — Battle",
          chest: "Press E — Treasure",
          portal: "Press E — Ascend",
          heal: "Press E — Restoratory",
          merchant: "Press E — Merchant",
          challenge_peer: "Press E — Challenge PvP",
        };
        this.prompt.setText(labels[this.nearTarget.kind] || "Press E");
        this.prompt.setPosition(16, this.scale.height - 48);
        this.prompt.setVisible(true);
      } else {
        this.prompt.setVisible(false);
      }
    }
  }
}

export function createGotchiTowerFloorGame(
  parent: HTMLElement,
  data: FloorBootData,
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.min(parent.clientWidth || 960, 960),
    height: Math.min(parent.clientHeight || 520, 560),
    backgroundColor: "#0b1220",
    physics: { default: "arcade", arcade: { debug: false } },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
  });
  game.scene.add("FloorScene", FloorScene, true, data);
  return game;
}
