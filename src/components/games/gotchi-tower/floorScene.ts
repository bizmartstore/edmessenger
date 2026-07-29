/** Gotchi Tower — detailed interior floor scene (unique look per theme). */
import * as Phaser from "phaser";
import { PALETTE, type Voxel } from "@/lib/edgotchi";
import { themeForFloor, type FloorTheme } from "@/lib/gotchi-tower";

export type FloorEnemySpawn = { id: string; name: string; isBoss: boolean };

export type FloorBootData = {
  floor: number;
  floorCount: number;
  voxels: Voxel[];
  playerName: string;
  enemies: FloorEnemySpawn[];
  defeatedEnemyIds: string[];
  portalUnlocked: boolean;
  peers?: Array<{ userId: string; name: string; x: number; y: number; voxels?: Voxel[] }>;
};

export type FloorInteractEvent =
  | { kind: "quiz_gate"; id: string }
  | { kind: "monster"; id: string; name: string; isBoss?: boolean }
  | { kind: "chest"; id: string }
  | { kind: "portal"; locked?: boolean }
  | { kind: "heal" }
  | { kind: "merchant" }
  | { kind: "challenge_peer"; userId: string; name: string };

const WORLD_W = 960;
const WORLD_H = 640;
const SPEED = 170;
const FLOOR_Y = WORLD_H - 148;

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

function bakeVoxelTexture(scene: Phaser.Scene, key: string, voxels: Voxel[], scale = 3) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cell = scale;
  // Soft shadow plate under Gotchi
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(4 * cell, 9.5 * cell, 7 * cell, 2 * cell);
  for (const v of voxels) {
    const col = hexToNum(PALETTE[v.c % PALETTE.length]);
    g.fillStyle(col, 1);
    g.fillRect(v.x * cell, v.y * cell, cell, cell);
    // highlight edge
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(v.x * cell, v.y * cell, cell, Math.max(1, cell * 0.25));
  }
  g.generateTexture(key, 8 * cell, 10 * cell);
  g.destroy();
}

function bakeWorldTextures(scene: Phaser.Scene, theme: FloorTheme, floor: number) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const stone = Phaser.Display.Color.IntegerToColor(theme.ground);
  const wallCol = Phaser.Display.Color.GetColor(
    Math.max(0, stone.red - 42),
    Math.max(0, stone.green - 40),
    Math.max(0, stone.blue - 36),
  );

  // Stone brick tile
  g.clear();
  g.fillStyle(wallCol, 1);
  g.fillRect(0, 0, 48, 32);
  g.lineStyle(1, 0x000000, 0.35);
  g.strokeRect(0, 0, 48, 32);
  g.lineStyle(1, theme.accent, 0.12);
  g.lineBetween(0, 16, 48, 16);
  g.lineBetween(24, 0, 24, 32);
  g.generateTexture("gt-brick", 48, 32);

  // Floor tile
  g.clear();
  g.fillStyle(theme.ground, 1);
  g.fillRect(0, 0, 64, 64);
  g.fillStyle(theme.accent, 0.08);
  g.fillRect(2, 2, 60, 60);
  g.lineStyle(1, 0x000000, 0.2);
  g.strokeRect(0, 0, 64, 64);
  g.fillStyle(theme.glow, 0.06);
  g.fillCircle(32, 32, 10);
  g.generateTexture("gt-tile", 64, 64);

  // Ascend portal (open)
  g.clear();
  g.fillStyle(0x1a1028, 0.9);
  g.fillRoundedRect(4, 4, 40, 56, 10);
  g.fillStyle(theme.accent, 1);
  g.fillRoundedRect(10, 10, 28, 44, 8);
  g.fillStyle(theme.glow, 0.85);
  g.fillCircle(24, 28, 12);
  g.fillStyle(0xffffff, 0.45);
  g.fillCircle(20, 24, 4);
  g.fillStyle(theme.glow, 0.5);
  g.fillTriangle(24, 8, 16, 20, 32, 20);
  g.generateTexture("gt-portal", 48, 64);

  // Locked portal
  g.clear();
  g.fillStyle(0x2a2030, 1);
  g.fillRoundedRect(4, 4, 40, 56, 10);
  g.fillStyle(0x5a4050, 1);
  g.fillRoundedRect(10, 10, 28, 44, 8);
  g.fillStyle(0x888888, 1);
  g.fillCircle(24, 30, 8);
  g.fillStyle(0xffcc66, 1);
  g.fillRect(22, 28, 4, 10);
  g.fillCircle(24, 28, 3);
  g.generateTexture("gt-portal-locked", 48, 64);

  // Chest
  g.clear();
  g.fillStyle(0x5a3a18, 1);
  g.fillRoundedRect(4, 14, 40, 26, 4);
  g.fillStyle(0x8b5a2b, 1);
  g.fillRoundedRect(4, 8, 40, 16, 4);
  g.fillStyle(theme.glow, 1);
  g.fillCircle(24, 22, 5);
  g.fillStyle(0xffd700, 1);
  g.fillRect(22, 4, 4, 8);
  g.fillStyle(0xffffff, 0.25);
  g.fillRect(8, 10, 32, 4);
  g.generateTexture("gt-chest", 48, 44);

  // Monster variants
  for (const variant of ["gt-monster", "gt-monster-boss"] as const) {
    const boss = variant === "gt-monster-boss";
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(24, 44, 36, 12);
    g.fillStyle(boss ? 0x4a1020 : 0x2a1848, 1);
    g.fillEllipse(24, 30, boss ? 40 : 32, boss ? 30 : 24);
    g.fillStyle(boss ? 0xff4466 : theme.accent, 1);
    g.fillCircle(24, 18, boss ? 16 : 12);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(18, 16, boss ? 4 : 3);
    g.fillCircle(30, 16, boss ? 4 : 3);
    g.fillStyle(0x111111, 1);
    g.fillCircle(18, 16, 1.5);
    g.fillCircle(30, 16, 1.5);
    g.fillStyle(boss ? 0xffaa00 : theme.glow, 0.9);
    g.fillTriangle(24, 4, 16, 14, 32, 14);
    if (boss) {
      g.fillStyle(0xff2244, 0.7);
      g.fillCircle(12, 28, 5);
      g.fillCircle(36, 28, 5);
    }
    g.generateTexture(variant, 48, 52);
  }

  // Heal shrine
  g.clear();
  g.fillStyle(0x1a4030, 1);
  g.fillRoundedRect(8, 28, 32, 16, 4);
  g.fillStyle(0x2ecc71, 0.95);
  g.fillCircle(24, 20, 16);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(18, 14, 5);
  g.fillStyle(0xffffff, 1);
  g.fillRect(21, 10, 6, 20);
  g.fillRect(14, 17, 20, 6);
  g.generateTexture("gt-heal", 48, 48);

  // Merchant alcove
  g.clear();
  g.fillStyle(0x3a2818, 1);
  g.fillRoundedRect(4, 12, 48, 36, 6);
  g.fillStyle(0x5a3a1a, 1);
  g.fillRoundedRect(8, 8, 40, 20, 4);
  g.fillStyle(theme.glow, 1);
  g.fillCircle(28, 22, 8);
  g.fillStyle(0xffe08a, 1);
  g.fillCircle(28, 22, 4);
  g.fillStyle(0xffffff, 0.3);
  g.fillRect(12, 14, 32, 4);
  g.generateTexture("gt-merchant", 56, 52);

  // Window glow
  g.clear();
  g.fillStyle(theme.glow, 0.55);
  g.fillRoundedRect(4, 4, 36, 52, 18);
  g.fillStyle(0xffffff, 0.2);
  g.fillRoundedRect(10, 10, 24, 24, 12);
  g.lineStyle(3, theme.accent, 0.8);
  g.strokeRoundedRect(4, 4, 36, 52, 18);
  g.lineBetween(22, 4, 22, 56);
  g.lineBetween(4, 30, 40, 30);
  g.generateTexture("gt-window", 44, 60);

  // Pillar
  g.clear();
  g.fillStyle(wallCol, 1);
  g.fillRect(10, 8, 20, 100);
  g.fillStyle(theme.accent, 0.25);
  g.fillRect(10, 8, 6, 100);
  g.fillStyle(Phaser.Display.Color.GetColor(
    Math.min(255, stone.red + 30),
    Math.min(255, stone.green + 20),
    Math.min(255, stone.blue + 10),
  ), 1);
  g.fillRoundedRect(4, 0, 32, 14, 4);
  g.fillRoundedRect(4, 100, 32, 14, 4);
  g.generateTexture("gt-pillar", 40, 114);

  // Torch
  g.clear();
  g.fillStyle(0x3a2a1a, 1);
  g.fillRect(10, 18, 6, 22);
  g.fillStyle(0xffaa33, 1);
  g.fillCircle(13, 12, 8);
  g.fillStyle(0xffee88, 0.9);
  g.fillCircle(13, 10, 4);
  g.generateTexture("gt-torch", 26, 42);

  // Stair wedge toward portal
  g.clear();
  g.fillStyle(theme.ground, 1);
  for (let i = 0; i < 5; i++) {
    g.fillRect(i * 14, 40 - i * 8, 70 - i * 8, 10);
    g.lineStyle(1, theme.accent, 0.2);
    g.strokeRect(i * 14, 40 - i * 8, 70 - i * 8, 10);
  }
  g.generateTexture("gt-stairs", 80, 56);

  // Floor number plaque
  g.clear();
  g.fillStyle(0x1a1420, 0.92);
  g.fillRoundedRect(0, 0, 120, 36, 8);
  g.lineStyle(2, theme.accent, 0.9);
  g.strokeRoundedRect(1, 1, 118, 34, 8);
  g.generateTexture("gt-plaque", 120, 36);

  // Spark
  g.clear();
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(3, 3, 3);
  g.generateTexture("gt-spark", 8, 8);

  // Banner hanging
  g.clear();
  g.fillStyle(theme.accent, 1);
  g.fillTriangle(20, 4, 4, 48, 36, 48);
  g.fillStyle(theme.glow, 0.5);
  g.fillTriangle(20, 12, 10, 42, 30, 42);
  g.fillStyle(0x2a2030, 1);
  g.fillRect(8, 0, 24, 6);
  g.generateTexture("gt-banner", 40, 52);

  void floor;
  g.destroy();
}

function drawTowerInterior(scene: Phaser.Scene, theme: FloorTheme, floor: number) {
  // Sky / void beyond windows
  const bg = scene.add.graphics();
  bg.fillGradientStyle(theme.skyTop, theme.skyTop, theme.skyBottom, theme.skyBottom, 1);
  bg.fillRect(0, 0, WORLD_W, WORLD_H);

  // Distant tower silhouettes through "windows"
  for (let i = 0; i < theme.parallax.length; i++) {
    const layer = scene.add.graphics().setScrollFactor(0.12 + i * 0.1);
    layer.fillStyle(theme.parallax[i], 0.4 - i * 0.08);
    for (let x = 40; x < WORLD_W - 40; x += 100) {
      const h = 50 + ((i * 41 + x + floor * 13) % 100);
      layer.fillRoundedRect(x, WORLD_H - 200 - h - i * 20, 55, h + 30, 6);
    }
  }

  // Left & right stone walls
  for (let y = 0; y < FLOOR_Y; y += 32) {
    for (let row = 0; row < 3; row++) {
      scene.add.image(24 + row * 40, y + 16, "gt-brick").setAlpha(0.95 - row * 0.08).setDepth(1);
      scene.add
        .image(WORLD_W - 24 - row * 40, y + 16, "gt-brick")
        .setFlipX(true)
        .setAlpha(0.95 - row * 0.08)
        .setDepth(1);
    }
  }

  // Arched windows with glow
  const windowXs = [160, 320, 480, 640, 800];
  for (const x of windowXs) {
    const win = scene.add.image(x, 110, "gt-window").setDepth(2).setAlpha(0.95);
    scene.tweens.add({
      targets: win,
      alpha: { from: 0.75, to: 1 },
      duration: 1600 + (x % 7) * 100,
      yoyo: true,
      repeat: -1,
    });
    const glow = scene.add.circle(x, 110, 28, theme.glow, 0.12).setDepth(1);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.08, to: 0.22 },
      scale: { from: 1, to: 1.15 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
    });
  }

  // Pillars
  for (const x of [120, 280, 520, 720, 860]) {
    scene.add.image(x, FLOOR_Y - 70, "gt-pillar").setDepth(3).setAlpha(0.92);
  }

  // Torches
  for (const x of [90, 250, 470, 690, 880]) {
    const torch = scene.add.image(x, FLOOR_Y - 110, "gt-torch").setDepth(4);
    scene.tweens.add({
      targets: torch,
      scaleX: { from: 1, to: 1.08 },
      scaleY: { from: 1, to: 1.12 },
      alpha: { from: 0.85, to: 1 },
      duration: 400 + (x % 5) * 40,
      yoyo: true,
      repeat: -1,
    });
    scene.add.circle(x, FLOOR_Y - 122, 16, 0xffaa44, 0.12).setDepth(3);
  }

  // Hanging banners with floor motif
  for (const x of [200, 400, 600, 780]) {
    scene.add.image(x, 48, "gt-banner").setDepth(4).setScale(0.9 + (x % 3) * 0.05);
  }

  // Floor tiles
  for (let x = 100; x < WORLD_W - 100; x += 64) {
    for (let y = FLOOR_Y - 20; y < WORLD_H; y += 64) {
      scene.add.image(x + ((y / 64) % 2) * 16, y, "gt-tile").setDepth(2).setAlpha(0.9);
    }
  }

  // Center carpet / rune path toward stairs
  const path = scene.add.graphics().setDepth(3);
  path.fillStyle(theme.accent, 0.18);
  path.fillRoundedRect(WORLD_W * 0.35, FLOOR_Y - 30, WORLD_W * 0.5, 50, 12);
  path.fillStyle(theme.glow, 0.1);
  for (let i = 0; i < 6; i++) {
    path.fillCircle(WORLD_W * 0.42 + i * 70, FLOOR_Y - 5, 8);
  }

  // Stairs near portal
  scene.add.image(WORLD_W - 120, FLOOR_Y - 20, "gt-stairs").setDepth(4);

  // Ceiling beams
  const beams = scene.add.graphics().setDepth(5);
  beams.fillStyle(0x1a1210, 0.55);
  for (let x = 80; x < WORLD_W; x += 90) {
    beams.fillRect(x, 0, 14, 36);
  }
  beams.fillRect(0, 0, WORLD_W, 18);

  // Ambient dust
  scene.add.particles(0, 0, "gt-spark", {
    lifespan: 2800,
    speed: { min: 2, max: 14 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.55, end: 0 },
    tint: theme.glow,
    frequency: 70,
    blendMode: "ADD",
    x: { min: 80, max: WORLD_W - 80 },
    y: { min: 60, max: FLOOR_Y - 40 },
  });
}

class FloorScene extends Phaser.Scene {
  private boot!: FloorBootData;
  private theme!: FloorTheme;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private interactables: Phaser.Physics.Arcade.StaticGroup | null = null;
  private peerSprites = new Map<string, Phaser.GameObjects.Container>();
  private prompt?: Phaser.GameObjects.Text;
  private nearTarget: FloorInteractEvent | null = null;
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super("FloorScene");
  }

  init(data: FloorBootData) {
    this.boot = data;
    this.theme = themeForFloor(data.floor);
  }

  create() {
    const theme = this.theme;
    bakeWorldTextures(this, theme, this.boot.floor);
    bakeVoxelTexture(
      this,
      "gt-player",
      this.boot.voxels?.length
        ? this.boot.voxels
        : [
            { x: 3, y: 2, c: 0 },
            { x: 4, y: 2, c: 1 },
            { x: 3, y: 3, c: 6 },
            { x: 4, y: 3, c: 6 },
            { x: 3, y: 4, c: 2 },
            { x: 4, y: 4, c: 2 },
          ],
      3,
    );

    drawTowerInterior(this, theme, this.boot.floor);

    this.physics.world.setBounds(70, 40, WORLD_W - 140, WORLD_H - 60);
    this.player = this.physics.add.sprite(WORLD_W / 2, FLOOR_Y - 10, "gt-player");
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(12);
    this.player.setScale(1.25);

    const nameTag = this.add
      .text(this.player.x, this.player.y - 40, this.boot.playerName, {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "12px",
        color: "#fff8e7",
        stroke: "#1a1020",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(13);
    this.player.setData("nameTag", nameTag);

    // Soft bob idle
    this.tweens.add({
      targets: this.player,
      scaleY: { from: 1.25, to: 1.3 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.interactables = this.physics.add.staticGroup();
    this.spawnInteractables();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.08);

    this.prompt = this.add
      .text(0, 0, "", {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "13px",
        color: "#fff8e7",
        backgroundColor: "#140c20ee",
        padding: { x: 12, y: 7 },
      })
      .setDepth(40)
      .setScrollFactor(0)
      .setVisible(false);

    const remaining =
      this.boot.enemies.filter((e) => !this.boot.defeatedEnemyIds.includes(e.id)).length;
    this.add.image(16, 16, "gt-plaque").setOrigin(0, 0).setScrollFactor(0).setDepth(39);
    this.add
      .text(76, 24, `Fl. ${this.boot.floor} · ${theme.name}`, {
        fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fff8e7",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(40);

    this.statusText = this.add
      .text(
        12,
        56,
        this.boot.portalUnlocked
          ? "Floor cleared — ascend the portal"
          : `Wardens left: ${remaining} · defeat all to ascend`,
        {
          fontFamily: "Trebuchet MS, Segoe UI, sans-serif",
          fontSize: "11px",
          color: this.boot.portalUnlocked ? "#9ef0c2" : "#ffd0a8",
          stroke: "#000",
          strokeThickness: 3,
        },
      )
      .setScrollFactor(0)
      .setDepth(40);

    this.input.keyboard?.on("keydown-E", () => {
      if (this.nearTarget) this.game.events.emit("gt-interact", this.nearTarget);
    });
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (this.nearTarget) this.game.events.emit("gt-interact", this.nearTarget);
    });

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.nearTarget) return;
      const dx = p.worldX - this.player.x;
      const dy = p.worldY - this.player.y;
      if (dx * dx + dy * dy < 60 * 60) {
        this.game.events.emit("gt-interact", this.nearTarget);
      }
    });

    for (const peer of this.boot.peers ?? []) this.upsertPeer(peer);

    this.game.events.on("gt-peers", this.onPeers, this);
    this.game.events.on("gt-peer-move", this.onPeerMove, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("gt-peers", this.onPeers, this);
      this.game.events.off("gt-peer-move", this.onPeerMove, this);
    });
  }

  private spawnInteractables() {
    const theme = this.theme;
    const unlocked = this.boot.portalUnlocked;

    const portal = this.interactables!.create(
      WORLD_W - 90,
      FLOOR_Y - 30,
      unlocked ? "gt-portal" : "gt-portal-locked",
    ) as Phaser.Physics.Arcade.Sprite;
    portal.setData("evt", { kind: "portal", locked: !unlocked } satisfies FloorInteractEvent);
    portal.setDepth(8);
    if (unlocked) {
      this.tweens.add({
        targets: portal,
        scale: { from: 1, to: 1.12 },
        alpha: { from: 0.9, to: 1 },
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    } else {
      portal.setAlpha(0.75);
    }

    const chest = this.interactables!.create(400, FLOOR_Y - 8, "gt-chest") as Phaser.Physics.Arcade.Sprite;
    chest.setData("evt", { kind: "chest", id: `chest-${this.boot.floor}` } satisfies FloorInteractEvent);
    chest.setDepth(8);
    this.tweens.add({ targets: chest, y: chest.y - 5, duration: 750, yoyo: true, repeat: -1 });

    const heal = this.interactables!.create(540, FLOOR_Y - 10, "gt-heal") as Phaser.Physics.Arcade.Sprite;
    heal.setData("evt", { kind: "heal" } satisfies FloorInteractEvent);
    heal.setDepth(8);

    const merchant = this.interactables!.create(680, FLOOR_Y - 10, "gt-merchant") as Phaser.Physics.Arcade.Sprite;
    merchant.setData("evt", { kind: "merchant" } satisfies FloorInteractEvent);
    merchant.setDepth(8);

    // Optional side quiz shrine (bonus, does not ascend)
    const shrine = this.interactables!.create(200, FLOOR_Y - 18, "gt-portal") as Phaser.Physics.Arcade.Sprite;
    shrine.setTint(theme.accent);
    shrine.setScale(0.75);
    shrine.setAlpha(0.85);
    shrine.setData("evt", {
      kind: "quiz_gate",
      id: `shrine-${this.boot.floor}`,
    } satisfies FloorInteractEvent);
    shrine.setDepth(8);

    const alive = this.boot.enemies.filter((e) => !this.boot.defeatedEnemyIds.includes(e.id));
    alive.forEach((enemy, i) => {
      const x = 260 + i * 110;
      const y = FLOOR_Y - 40 - (enemy.isBoss ? 10 : 0);
      const spr = this.interactables!.create(
        x,
        y,
        enemy.isBoss ? "gt-monster-boss" : "gt-monster",
      ) as Phaser.Physics.Arcade.Sprite;
      spr.setScale(enemy.isBoss ? 1.45 : 1.1);
      spr.setDepth(9);
      spr.setData("evt", {
        kind: "monster",
        id: enemy.id,
        name: enemy.name,
        isBoss: enemy.isBoss,
      } satisfies FloorInteractEvent);
      const label = this.add
        .text(x, y - 36, enemy.name, {
          fontSize: "10px",
          color: enemy.isBoss ? "#ffb0c0" : "#e8d0ff",
          stroke: "#000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(10);
      spr.setData("label", label);
      this.tweens.add({
        targets: [spr, label],
        x: x + (enemy.isBoss ? 36 : 50),
        duration: enemy.isBoss ? 2400 : 1700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
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

  private upsertPeer(p: {
    userId: string;
    name: string;
    x: number;
    y: number;
    voxels?: Voxel[];
  }) {
    let c = this.peerSprites.get(p.userId);
    if (!c) {
      const key = `gt-peer-${p.userId}`;
      bakeVoxelTexture(
        this,
        key,
        p.voxels?.length ? p.voxels : [{ x: 3, y: 3, c: 3 }, { x: 4, y: 3, c: 4 }],
      );
      const spr = this.add.image(0, 0, key).setScale(1.05);
      const label = this.add
        .text(0, -30, p.name, {
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
    tag?.setPosition(this.player.x, this.player.y - 40);

    this.game.events.emit("gt-player-move", {
      x: this.player.x,
      y: this.player.y,
      floor: this.boot.floor,
    });

    this.nearTarget = null;
    let best = 9999;
    this.interactables?.getChildren().forEach((obj) => {
      const spr = obj as Phaser.Physics.Arcade.Sprite;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, spr.x, spr.y);
      if (d < 56 && d < best) {
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
          quiz_gate: "Press E — Knowledge Shrine (+GCoins)",
          monster: "Press E — Battle warden",
          chest: "Press E — Treasure chest",
          portal: this.boot.portalUnlocked
            ? "Press E — Ascend to next floor"
            : "Portal sealed — defeat all wardens",
          heal: "Press E — Restoratory",
          merchant: "Press E — Remodel Gotchi (GCoins)",
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
