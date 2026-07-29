/** Ambient Cloudflare Worker types used by Gotchi Tower Durable Objects. */
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
}

interface DurableObjectStub {
  fetch(request: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectState {
  id: DurableObjectId;
  storage: unknown;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
