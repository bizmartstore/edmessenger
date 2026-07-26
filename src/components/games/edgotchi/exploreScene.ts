// Phaser ESM named imports only — keeps Nitro/SSR from pulling canvas code.
import * as Phaser from "phaser";
import {
  PALETTE,
  getMap,
  mulberry32,
  spawnWildGotchi,
  type MapTheme,
  type Voxel,
  type WildGotchi,
} from "@/lib/edgotchi";

export type ExploreBootData = {
  mapId: string;
  voxels: Voxel[];
  playerName: string;
  playerLevel: number;
  /** Wild ids already defeated this session (skip respawn). */
  defeatedIds?: string[];
};

export type ExploreEncounterEvent = {
  wild: WildGotchi;
};

type WildSprite = Phaser.GameObjects.Image & {
  wildData: WildGotchi;
};

const VOXEL_W = 8;
const VOXEL_H = 10;
const PLAYER_SPEED = 160;
const ENCOUNTER_DIST = 42;

function hexToNum(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/** All art is drawn with Graphics → textures. Zero image/AI quota. */
function bakeTextures(scene: Phaser.Scene, map: MapTheme) {
  const g = scene.add.graphics();
  g.setVisible(false);

  // Grass tuft
  g.clear();
  g.fillStyle(map.accent, 1);
  g.fillTriangle(8, 16, 4, 4, 10, 14);
  g.fillTriangle(8, 16, 8, 2, 12, 14);
  g.fillTriangle(8, 16, 12, 5, 14, 14);
  g.generateTexture("eg-grass", 16, 18);

  // Tree
  g.clear();
  g.fillStyle(map.treeColor, 1);
  g.fillRect(10, 22, 8, 14);
  g.fillStyle(map.leafColor, 1);
  g.fillCircle(14, 16, 14);
  g.fillCircle(6, 18, 10);
  g.fillCircle(22, 18, 10);
  g.fillStyle(0xffffff, 0.12);
  g.fillCircle(10, 12, 5);
  g.generateTexture("eg-tree", 28, 40);

  // Rock
  g.clear();
  g.fillStyle(0x6a6a6a, 1);
  g.fillEllipse(12, 10, 22, 14);
  g.fillStyle(0x8a8a8a, 1);
  g.fillEllipse(10, 8, 10, 6);
  g.generateTexture("eg-rock", 24, 16);

  // Flower
  g.clear();
  g.fillStyle(0x3a8a40, 1);
  g.fillRect(7, 8, 2, 8);
  g.fillStyle(0xff6688, 1);
  g.fillCircle(8, 6, 4);
  g.fillStyle(0xffe566, 1);
  g.fillCircle(8, 6, 1.5);
  g.generateTexture("eg-flower", 16, 16);

  // Cloud
  g.clear();
  g.fillStyle(0xffffff, 0.85);
  g.fillEllipse(28, 16, 40, 18);
  g.fillEllipse(14, 14, 22, 14);
  g.fillEllipse(42, 14, 24, 16);
  g.generateTexture("eg-cloud", 56, 28);

  // Bird (2 frames)
  for (let f = 0; f < 2; f++) {
    g.clear();
    g.fillStyle(0x222222, 1);
    g.fillEllipse(10, 8, 10, 6);
    g.fillStyle(0x333333, 1);
    if (f === 0) {
      g.fillTriangle(4, 8, -2, 2, 8, 6);
      g.fillTriangle(16, 8, 22, 2, 12, 6);
    } else {
      g.fillTriangle(4, 8, -2, 14, 8, 10);
      g.fillTriangle(16, 8, 22, 14, 12, 10);
    }
    g.generateTexture(`eg-bird-${f}`, 24, 16);
  }

  // Bat (2 frames)
  for (let f = 0; f < 2; f++) {
    g.clear();
    g.fillStyle(0x2a1a3a, 1);
    g.fillEllipse(12, 10, 8, 6);
    g.fillStyle(0x4a2a5a, 1);
    if (f === 0) {
      g.fillTriangle(8, 10, -4, 2, 10, 8);
      g.fillTriangle(16, 10, 28, 2, 14, 8);
    } else {
      g.fillTriangle(8, 10, -2, 16, 10, 12);
      g.fillTriangle(16, 10, 26, 16, 14, 12);
    }
    g.fillStyle(0xff4466, 1);
    g.fillCircle(10, 9, 1);
    g.fillCircle(14, 9, 1);
    g.generateTexture(`eg-bat-${f}`, 28, 18);
  }

  // Bush
  g.clear();
  g.fillStyle(map.leafColor, 1);
  g.fillEllipse(14, 12, 26, 18);
  g.fillStyle(0xffffff, 0.1);
  g.fillEllipse(10, 8, 8, 5);
  g.generateTexture("eg-bush", 28, 20);

  g.destroy();
}

const WILD_TEX_VARIANTS = 32;

function bakeWildTextures(scene: Phaser.Scene, mapId: string, playerLevel: number) {
  const g = scene.add.graphics();
  g.setVisible(false);
  const cell = 3;
  for (let i = 0; i < WILD_TEX_VARIANTS; i++) {
    const wild = spawnWildGotchi(mapId, i, playerLevel);
    g.clear();
    const ox = 2;
    const oy = 2;
    for (const v of wild.voxels) {
      g.fillStyle(hexToNum(PALETTE[v.c] ?? "#888888"), 1);
      g.fillRect(ox + v.x * cell, oy + v.y * cell, cell - 0.5, cell - 0.5);
    }
    g.generateTexture(`eg-wild-${i}`, VOXEL_W * cell + 4, VOXEL_H * cell + 4);
  }
  g.destroy();
}

export class EdgotchiExploreScene extends Phaser.Scene {
  private map!: MapTheme;
  private boot!: ExploreBootData;
  private player!: Phaser.Physics.Arcade.Image;
  private playerVisual!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  } | null;
  private wilds: WildSprite[] = [];
  private sky!: Phaser.GameObjects.Rectangle;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private sunMoon!: Phaser.GameObjects.Arc;
  private clouds: Phaser.GameObjects.Image[] = [];
  private birds: Phaser.GameObjects.Image[] = [];
  private bats: Phaser.GameObjects.Image[] = [];
  private dayPhase = 0.35;
  private encounterLock = false;
  private pointerTarget: { x: number; y: number } | null = null;
  private hintText!: Phaser.GameObjects.Text;
  private timeLabel!: Phaser.GameObjects.Text;
  private defeated = new Set<string>();

  constructor() {
    super("EdgotchiExplore");
  }

  init(data: ExploreBootData) {
    this.boot = data;
    this.map = getMap(data.mapId);
    this.defeated = new Set(data.defeatedIds ?? []);
    this.encounterLock = false;
    this.dayPhase = 0.35;
  }

  create() {
    const map = this.map;
    bakeTextures(this, map);

    this.physics.world.setBounds(0, 0, map.worldW, map.worldH);
    this.cameras.main.setBounds(0, 0, map.worldW, map.worldH);
    this.cameras.main.setBackgroundColor(map.skyDay);

    this.sky = this.add.rectangle(map.worldW / 2, map.worldH / 2, map.worldW, map.worldH, map.skyDay).setDepth(-20);
    this.drawTerrain();
    this.spawnDecor();
    this.spawnAtmosphere();
    this.spawnWilds();
    this.spawnPlayer();

    this.nightOverlay = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width + 4, this.scale.height + 4, 0x020818, 0)
      .setDepth(50)
      .setScrollFactor(0);

    this.sunMoon = this.add.circle(200, 120, 22, 0xffe566).setDepth(-10).setScrollFactor(0.15);

    this.cursors = null;
    this.wasd = null;
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as NonNullable<typeof this.wasd>;
    }

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y > this.scale.height - 8) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.pointerTarget = { x: wp.x, y: wp.y };
    });

    this.hintText = this.add
      .text(8, 8, "WASD / arrows / tap to move · walk into a Gotchi to battle", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.timeLabel = this.add
      .text(this.scale.width - 8, 8, "Day", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#ffe566",
        backgroundColor: "#00000088",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.game.events.on("edgotchi-explore-resume", this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("edgotchi-explore-resume", this.onResume, this);
    });
  }

  private onResume = (payload: { defeatedId?: string }) => {
    this.encounterLock = false;
    if (payload?.defeatedId) {
      this.defeated.add(payload.defeatedId);
      const idx = this.wilds.findIndex((w) => w.wildData.id === payload.defeatedId);
      if (idx >= 0) {
        this.wilds[idx].destroy();
        this.wilds.splice(idx, 1);
      }
    }
  };

  private drawTerrain() {
    const map = this.map;
    const g = this.add.graphics().setDepth(-15);
    const tile = 64;
    const rnd = mulberry32(map.id.length * 424242);

    for (let y = 0; y < map.worldH; y += tile) {
      for (let x = 0; x < map.worldW; x += tile) {
        const shade = rnd() > 0.5 ? map.groundA : map.groundB;
        g.fillStyle(shade, 1);
        g.fillRect(x, y, tile + 1, tile + 1);
      }
    }

    // Winding paths
    g.fillStyle(map.path, 1);
    for (let i = 0; i < 5; i++) {
      let px = 200 + rnd() * (map.worldW - 400);
      let py = 200 + rnd() * (map.worldH - 400);
      for (let s = 0; s < 40; s++) {
        g.fillCircle(px, py, 28 + rnd() * 18);
        px += (rnd() - 0.5) * 90;
        py += (rnd() - 0.5) * 90;
        px = Phaser.Math.Clamp(px, 80, map.worldW - 80);
        py = Phaser.Math.Clamp(py, 80, map.worldH - 80);
      }
    }

    // Map-specific ponds / plazas
    if (map.id === "campus" || map.id === "lab") {
      g.fillStyle(0x2a6aaa, 0.85);
      g.fillEllipse(map.worldW * 0.7, map.worldH * 0.35, 180, 110);
      g.fillStyle(0xffffff, 0.15);
      g.fillEllipse(map.worldW * 0.68, map.worldH * 0.33, 60, 30);
    }
    if (map.id === "library") {
      g.fillStyle(0x1a1028, 0.5);
      for (let i = 0; i < 12; i++) {
        g.fillRect(120 + i * 260, 160, 40, map.worldH - 320);
      }
    }
    if (map.id === "arena") {
      g.lineStyle(10, 0xd0a060, 0.9);
      g.strokeEllipse(map.worldW / 2, map.worldH / 2, 520, 360);
      g.fillStyle(0xa07040, 0.35);
      g.fillEllipse(map.worldW / 2, map.worldH / 2, 480, 320);
    }
  }

  private spawnDecor() {
    const map = this.map;
    const rnd = mulberry32(map.worldW + map.treeCount);

    for (let i = 0; i < map.grassCount; i++) {
      const x = 40 + rnd() * (map.worldW - 80);
      const y = 40 + rnd() * (map.worldH - 80);
      const s = this.add.image(x, y, "eg-grass").setDepth(y).setScale(0.7 + rnd() * 0.6);
      if (i % 3 === 0) {
        this.tweens.add({
          targets: s,
          angle: { from: -6, to: 6 },
          duration: 900 + rnd() * 800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          delay: rnd() * 600,
        });
      }
    }

    for (let i = 0; i < map.treeCount; i++) {
      const x = 60 + rnd() * (map.worldW - 120);
      const y = 60 + rnd() * (map.worldH - 120);
      const tree = this.add.image(x, y, "eg-tree").setDepth(y).setScale(0.9 + rnd() * 0.7);
      if (i % 2 === 0) {
        this.tweens.add({
          targets: tree,
          scaleX: tree.scaleX * 1.03,
          duration: 1800 + rnd() * 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    for (let i = 0; i < 35; i++) {
      const x = 40 + rnd() * (map.worldW - 80);
      const y = 40 + rnd() * (map.worldH - 80);
      this.add.image(x, y, rnd() > 0.5 ? "eg-rock" : "eg-bush").setDepth(y).setScale(0.8 + rnd() * 0.5);
    }

    for (let i = 0; i < 40; i++) {
      const x = 40 + rnd() * (map.worldW - 80);
      const y = 40 + rnd() * (map.worldH - 80);
      const fl = this.add.image(x, y, "eg-flower").setDepth(y).setScale(0.7 + rnd() * 0.5);
      this.tweens.add({
        targets: fl,
        y: y - 2,
        duration: 700 + rnd() * 500,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private spawnAtmosphere() {
    const map = this.map;
    const rnd = mulberry32(777 + map.wildCount);

    for (let i = 0; i < 10; i++) {
      const c = this.add
        .image(rnd() * map.worldW, 80 + rnd() * 220, "eg-cloud")
        .setDepth(-8)
        .setScrollFactor(0.2)
        .setAlpha(0.75)
        .setScale(0.8 + rnd() * 1.2);
      this.clouds.push(c);
      this.tweens.add({
        targets: c,
        x: c.x + map.worldW * 0.4,
        duration: 40000 + rnd() * 30000,
        repeat: -1,
        onRepeat: () => {
          c.x = -80;
          c.y = 60 + Math.random() * 240;
        },
      });
    }

    for (let i = 0; i < 8; i++) {
      const b = this.add
        .image(rnd() * map.worldW, 100 + rnd() * 300, "eg-bird-0")
        .setDepth(5)
        .setScrollFactor(0.45)
        .setScale(0.9);
      this.birds.push(b);
      this.tweens.add({
        targets: b,
        x: b.x + 600 + rnd() * 800,
        y: b.y + (rnd() - 0.5) * 80,
        duration: 8000 + rnd() * 6000,
        repeat: -1,
        onRepeat: () => {
          b.x = this.cameras.main.scrollX - 40;
          b.y = 80 + Math.random() * 280;
        },
      });
    }

    for (let i = 0; i < 6; i++) {
      const bat = this.add
        .image(rnd() * map.worldW, 80 + rnd() * 200, "eg-bat-0")
        .setDepth(6)
        .setScrollFactor(0.5)
        .setAlpha(0)
        .setScale(1);
      this.bats.push(bat);
      this.tweens.add({
        targets: bat,
        x: bat.x - 500 - rnd() * 400,
        y: bat.y + (rnd() - 0.5) * 60,
        duration: 7000 + rnd() * 5000,
        repeat: -1,
        onRepeat: () => {
          bat.x = this.cameras.main.scrollX + this.scale.width + 40;
          bat.y = 60 + Math.random() * 220;
        },
      });
    }
  }

  private spawnWilds() {
    const map = this.map;
    bakeWildTextures(this, map.id, this.boot.playerLevel);
    const rnd = mulberry32(map.id.charCodeAt(0) * 99991);
    const margin = 120;
    for (let i = 0; i < map.wildCount; i++) {
      const wild = spawnWildGotchi(map.id, i, this.boot.playerLevel);
      if (this.defeated.has(wild.id)) continue;
      const x = margin + rnd() * (map.worldW - margin * 2);
      const y = margin + rnd() * (map.worldH - margin * 2);
      if (Phaser.Math.Distance.Between(x, y, map.worldW * 0.5, map.worldH * 0.5) < 140) continue;

      const spr = this.add.image(x, y, `eg-wild-${i % WILD_TEX_VARIANTS}`) as WildSprite;
      spr.setDepth(y);
      spr.setScale(1.05 + (i % 5) * 0.05);
      spr.wildData = wild;

      this.tweens.add({
        targets: spr,
        y: y - 4,
        duration: 700 + rnd() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: rnd() * 500,
      });

      this.wilds.push(spr);
    }
  }

  private spawnPlayer() {
    const map = this.map;
    const cx = map.worldW * 0.5;
    const cy = map.worldH * 0.5;

    this.player = this.physics.add.image(cx, cy, "eg-rock");
    this.player.setVisible(false);
    this.player.setCollideWorldBounds(true);
    this.player.setCircle(10);
    this.player.setDrag(800);

    // Bake player once as a small texture for a single sprite
    const g = this.add.graphics().setVisible(false);
    const cell = 4;
    for (const v of this.boot.voxels) {
      g.fillStyle(hexToNum(PALETTE[v.c] ?? "#888888"), 1);
      g.fillRect(2 + v.x * cell, 2 + v.y * cell, cell - 0.5, cell - 0.5);
    }
    g.generateTexture("eg-player", VOXEL_W * cell + 4, VOXEL_H * cell + 4);
    g.destroy();

    this.playerVisual = this.add.container(cx, cy);
    const body = this.add.image(0, 0, "eg-player");
    const label = this.add
      .text(0, 22, this.boot.playerName, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.playerVisual.add([body, label]);
    this.playerVisual.setDepth(cy);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);
  }

  update(_t: number, dt: number) {
    this.updateDayNight(dt);
    this.animateCritters();
    this.movePlayer();
    this.checkEncounters();
  }

  private updateDayNight(dt: number) {
    // Full cycle ~90s — local only, no server clock / AI quota
    this.dayPhase = (this.dayPhase + dt / 90000) % 1;
    const phase = this.dayPhase;
    // cos=1 noon, cos=-1 midnight → night amount 0..1
    const sun = Math.cos(phase * Math.PI * 2);
    const nightAmt = Phaser.Math.Clamp((-sun + 0.25) / 1.25, 0, 1);

    const sky = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(this.map.skyDay),
      Phaser.Display.Color.IntegerToColor(this.map.skyNight),
      100,
      Math.floor(nightAmt * 100),
    );
    const skyColor = Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b);
    this.sky.setFillStyle(skyColor);
    this.cameras.main.setBackgroundColor(skyColor);
    this.nightOverlay.setAlpha(nightAmt * 0.55);

    const isNight = nightAmt > 0.55;
    this.sunMoon.setFillStyle(isNight ? 0xddeeff : 0xffe566);
    this.sunMoon.setPosition(
      this.scale.width * (0.2 + ((phase + 0.25) % 1) * 0.6),
      36 + (1 - Math.abs(sun)) * 70,
    );
    this.sunMoon.setScrollFactor(0);

    for (const b of this.birds) b.setAlpha(isNight ? 0 : 0.9);
    for (const bat of this.bats) bat.setAlpha(isNight ? 0.95 : 0);
    for (const c of this.clouds) c.setAlpha(isNight ? 0.25 : 0.75);

    this.timeLabel.setText(isNight ? "Night" : nightAmt > 0.3 ? "Dusk" : "Day");
    this.timeLabel.setColor(isNight ? "#c8b0ff" : "#ffe566");
  }

  private animateCritters() {
    const frame = Math.floor(this.time.now / 180) % 2;
    for (const b of this.birds) {
      if (b.alpha > 0.1) b.setTexture(`eg-bird-${frame}`);
    }
    for (const bat of this.bats) {
      if (bat.alpha > 0.1) bat.setTexture(`eg-bat-${frame}`);
    }
  }

  private movePlayer() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;

    if (this.cursors?.left.isDown || this.wasd?.A.isDown) vx -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) vx += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) vy -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      this.pointerTarget = null;
      const len = Math.hypot(vx, vy) || 1;
      body.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    } else if (this.pointerTarget) {
      const dx = this.pointerTarget.x - this.player.x;
      const dy = this.pointerTarget.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) {
        this.pointerTarget = null;
        body.setVelocity(0, 0);
      } else {
        body.setVelocity((dx / dist) * PLAYER_SPEED, (dy / dist) * PLAYER_SPEED);
      }
    } else {
      body.setVelocity(0, 0);
    }

    this.playerVisual.setPosition(this.player.x, this.player.y);
    this.playerVisual.setDepth(this.player.y);
  }

  private checkEncounters() {
    if (this.encounterLock) return;
    const px = this.player.x;
    const py = this.player.y;
    for (const w of this.wilds) {
      if (Phaser.Math.Distance.Between(px, py, w.x, w.y) <= ENCOUNTER_DIST) {
        this.encounterLock = true;
        this.player.setVelocity(0, 0);
        this.pointerTarget = null;
        this.game.events.emit("edgotchi-encounter", { wild: w.wildData } satisfies ExploreEncounterEvent);
        break;
      }
    }
  }
}

export function createEdgotchiExploreGame(parent: HTMLElement, data: ExploreBootData): Phaser.Game {
  const width = Math.max(300, parent.clientWidth || 360);
  const height = Math.min(420, Math.floor(width * 1.05));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#0b1220",
    scene: [],
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    audio: { noAudio: true },
  });
  game.scene.add("EdgotchiExplore", EdgotchiExploreScene, true, data);
  return game;
}
