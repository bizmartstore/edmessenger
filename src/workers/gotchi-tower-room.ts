/**
 * Gotchi Tower Durable Object — authoritative multiplayer room.
 * Handles presence, movement sync, chat, and quiz-driven PvP battles.
 */

export type EnvWithTower = {
  GOTCHI_TOWER?: DurableObjectNamespace;
};

type Peer = {
  id: string;
  userId: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  voxels: unknown[];
  ws: WebSocket;
};

type BattlePlayer = {
  userId: string;
  name: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attrs: {
    knowledge: number;
    resolve: number;
    agility: number;
    insight: number;
    spirit: number;
    harmony: number;
  };
  cooldowns: Record<string, number>;
};

type Battle = {
  id: string;
  a: BattlePlayer;
  b: BattlePlayer;
  wager: number;
  turn: string;
  phase: "question" | "resolve" | "ended";
  question?: {
    id: string;
    question: string;
    options: string[];
    correct_index: number;
  };
  answers: Record<string, number | null>;
  winner?: string;
  deadline: number;
};

function json(data: unknown): string {
  return JSON.stringify(data);
}

function critRoll(insight: number): boolean {
  const chance = Math.min(0.45, 0.05 + insight * 0.008);
  return Math.random() < chance;
}

function damageFor(knowledge: number, insight: number, correct: boolean): number {
  if (!correct) return Math.floor(4 + Math.random() * 4);
  const base = 14 + knowledge * 1.4;
  const crit = critRoll(insight) ? 1.6 : 1;
  return Math.floor(base * crit);
}

export class GotchiTowerRoom {
  private state: DurableObjectState;
  private peers = new Map<string, Peer>();
  private battles = new Map<string, Battle>();

  constructor(state: DurableObjectState, _env: EnvWithTower) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const userId = url.searchParams.get("userId") || crypto.randomUUID();
      const name = url.searchParams.get("name") || "Scholar";
      this.state.acceptWebSocket(server);
      const peerId = crypto.randomUUID();
      const peer: Peer = {
        id: peerId,
        userId,
        name,
        floor: 1,
        x: 400,
        y: 300,
        voxels: [],
        ws: server,
      };
      this.peers.set(peerId, peer);
      (server as WebSocket & { peerId?: string }).peerId = peerId;
      this.broadcastPresence();
      server.send(
        json({
          type: "welcome",
          peerId,
          userId,
          players: this.presenceList(),
        }),
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/health")) {
      return new Response(json({ ok: true, peers: this.peers.size, battles: this.battles.size }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Gotchi Tower room", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const peerId = (ws as WebSocket & { peerId?: string }).peerId;
    if (!peerId) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(json({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const type = String(msg.type ?? "");

    if (type === "hello") {
      peer.name = String(msg.name ?? peer.name);
      peer.floor = Number(msg.floor ?? 1);
      peer.x = Number(msg.x ?? 400);
      peer.y = Number(msg.y ?? 300);
      peer.voxels = Array.isArray(msg.voxels) ? msg.voxels : [];
      this.broadcastPresence();
      return;
    }

    if (type === "move") {
      peer.x = Number(msg.x ?? peer.x);
      peer.y = Number(msg.y ?? peer.y);
      peer.floor = Number(msg.floor ?? peer.floor);
      this.broadcast(
        {
          type: "move",
          userId: peer.userId,
          x: peer.x,
          y: peer.y,
          floor: peer.floor,
        },
        peerId,
      );
      return;
    }

    if (type === "chat") {
      const text = String(msg.text ?? "").slice(0, 200).trim();
      if (!text) return;
      this.broadcast({
        type: "chat",
        userId: peer.userId,
        name: peer.name,
        text,
      });
      return;
    }

    if (type === "challenge") {
      const to = String(msg.to ?? "");
      const wager = Math.max(0, Math.min(500, Number(msg.wager ?? 0)));
      this.broadcast({
        type: "challenge",
        from: peer.userId,
        to,
        wager,
      });
      return;
    }

    if (type === "challenge_response") {
      const from = String(msg.from ?? "");
      const accept = Boolean(msg.accept);
      const wager = Math.max(0, Number(msg.wager ?? 0));
      if (!accept) {
        this.broadcast({
          type: "challenge_response",
          from: peer.userId,
          to: from,
          accept: false,
          wager,
        });
        return;
      }
      const challenger = [...this.peers.values()].find((p) => p.userId === from);
      if (!challenger) return;
      const battle = this.startBattle(challenger, peer, wager, msg.question as Battle["question"]);
      this.broadcast({ type: "battle_state", battle: this.publicBattle(battle) });
      return;
    }

    if (type === "battle_action") {
      const battleId = String(msg.battleId ?? "");
      const battle = this.battles.get(battleId);
      if (!battle || battle.phase === "ended") return;
      if (battle.a.userId !== peer.userId && battle.b.userId !== peer.userId) return;

      const action = String(msg.action ?? "attack");
      const answerIndex = msg.answerIndex == null ? null : Number(msg.answerIndex);
      battle.answers[peer.userId] = answerIndex;

      const bothAnswered =
        battle.answers[battle.a.userId] != null && battle.answers[battle.b.userId] != null;

      if (bothAnswered || Date.now() > battle.deadline) {
        this.resolveBattleTurn(battle, action);
      } else {
        this.broadcast({ type: "battle_state", battle: this.publicBattle(battle) });
      }
      return;
    }

    if (type === "floor_advance") {
      peer.floor = Number(msg.floor ?? peer.floor + 1);
      this.broadcastPresence();
      this.broadcast({
        type: "floor_event",
        event: "player_advanced",
        payload: { userId: peer.userId, floor: peer.floor, name: peer.name },
      });
    }
  }

  async webSocketClose(ws: WebSocket) {
    const peerId = (ws as WebSocket & { peerId?: string }).peerId;
    if (peerId) {
      this.peers.delete(peerId);
      this.broadcastPresence();
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private startBattle(
    a: Peer,
    b: Peer,
    wager: number,
    question?: Battle["question"],
  ): Battle {
    const make = (p: Peer): BattlePlayer => ({
      userId: p.userId,
      name: p.name,
      hp: 100,
      maxHp: 100,
      energy: 50,
      maxEnergy: 50,
      attrs: {
        knowledge: 10,
        resolve: 10,
        agility: 10,
        insight: 10,
        spirit: 10,
        harmony: 10,
      },
      cooldowns: {},
    });
    const battle: Battle = {
      id: crypto.randomUUID(),
      a: make(a),
      b: make(b),
      wager,
      turn: a.userId,
      phase: "question",
      question,
      answers: { [a.userId]: null, [b.userId]: null },
      deadline: Date.now() + 25000,
    };
    this.battles.set(battle.id, battle);
    return battle;
  }

  private resolveBattleTurn(battle: Battle, preferredAction: string) {
    const q = battle.question;
    const correctIdx = q?.correct_index ?? 0;

    for (const side of [battle.a, battle.b] as const) {
      const ans = battle.answers[side.userId];
      const correct = ans != null && ans === correctIdx;
      const foe = side.userId === battle.a.userId ? battle.b : battle.a;
      const action = preferredAction || "attack";

      if (action === "heal" && correct) {
        const heal = Math.floor(8 + side.attrs.harmony * 1.2);
        side.hp = Math.min(side.maxHp, side.hp + heal);
        side.energy = Math.max(0, side.energy - 8);
      } else if (action === "defend") {
        const block = correct ? 12 : 4;
        foe.hp = Math.max(0, foe.hp - Math.max(0, damageFor(side.attrs.knowledge, side.attrs.insight, correct) - block));
      } else {
        const dmg = damageFor(side.attrs.knowledge, side.attrs.insight, correct);
        const defense = foe.attrs.resolve * 0.5;
        foe.hp = Math.max(0, foe.hp - Math.max(1, Math.floor(dmg - defense * 0.3)));
        if (!correct) {
          // Missed quiz — foe retaliates lightly
          side.hp = Math.max(0, side.hp - 6);
        }
      }
    }

    battle.answers = { [battle.a.userId]: null, [battle.b.userId]: null };
    battle.deadline = Date.now() + 25000;

    if (battle.a.hp <= 0 || battle.b.hp <= 0) {
      battle.phase = "ended";
      battle.winner =
        battle.a.hp <= 0 && battle.b.hp <= 0
          ? undefined
          : battle.a.hp > 0
            ? battle.a.userId
            : battle.b.userId;
    } else {
      battle.phase = "question";
      battle.turn = battle.turn === battle.a.userId ? battle.b.userId : battle.a.userId;
    }

    this.broadcast({ type: "battle_state", battle: this.publicBattle(battle) });
    if (battle.phase === "ended") {
      this.battles.delete(battle.id);
    }
  }

  private publicBattle(battle: Battle) {
    return {
      id: battle.id,
      wager: battle.wager,
      turn: battle.turn,
      phase: battle.phase,
      deadline: battle.deadline,
      winner: battle.winner,
      question: battle.question
        ? {
            id: battle.question.id,
            question: battle.question.question,
            options: battle.question.options,
          }
        : null,
      a: {
        userId: battle.a.userId,
        name: battle.a.name,
        hp: battle.a.hp,
        maxHp: battle.a.maxHp,
        energy: battle.a.energy,
        maxEnergy: battle.a.maxEnergy,
      },
      b: {
        userId: battle.b.userId,
        name: battle.b.name,
        hp: battle.b.hp,
        maxHp: battle.b.maxHp,
        energy: battle.b.energy,
        maxEnergy: battle.b.maxEnergy,
      },
      answered: {
        [battle.a.userId]: battle.answers[battle.a.userId] != null,
        [battle.b.userId]: battle.answers[battle.b.userId] != null,
      },
    };
  }

  private presenceList() {
    return [...this.peers.values()].map((p) => ({
      userId: p.userId,
      name: p.name,
      floor: p.floor,
      x: p.x,
      y: p.y,
      voxels: p.voxels,
    }));
  }

  private broadcastPresence() {
    this.broadcast({ type: "presence", players: this.presenceList() });
  }

  private broadcast(data: unknown, exceptPeerId?: string) {
    const payload = json(data);
    for (const [id, peer] of this.peers) {
      if (exceptPeerId && id === exceptPeerId) continue;
      try {
        peer.ws.send(payload);
      } catch {
        this.peers.delete(id);
      }
    }
  }
}
