export interface EmscriptenModule {
  ccall?: (name: string, returnType: string | null, argTypes: string[], args: unknown[]) => unknown;
  addFunction?: (fn: (pointer: number) => void, signature: string) => number;
  removeFunction?: (pointer: number) => void;
  UTF8ToString?: (pointer: number) => string;
}

export interface BridgeEvent { type: string; payload?: Record<string, unknown>; time?: number; [key: string]: unknown }
export interface HostAdapter { connect?: () => void | Promise<void>; disconnect?: () => void | Promise<void>; dispose?: () => void; send: (message: BridgeEvent) => unknown | Promise<unknown>; onEvent?: (event: BridgeEvent) => void }
export interface HostDescription { id: string; version: number; capabilities: string[] }
export declare class BridgeError extends Error { code: string }
export declare class HostRegistry {
  register(id: string, adapter: HostAdapter, options?: { replace?: boolean; version?: number; capabilities?: string[] }): () => boolean;
  unregister(id: string): boolean;
  get(id: string): HostAdapter | undefined;
  describe(): HostDescription[];
  connectAll(onEvent: (event: BridgeEvent) => void): Promise<void>;
  disconnectAll(): Promise<void>;
  send(id: string, message: BridgeEvent): Promise<unknown>;
}
export declare class TomCatBridge {
  constructor(options?: { logger?: Console; clock?: () => number });
  hosts: HostRegistry;
  attachWasm(module: EmscriptenModule): this;
  start(): Promise<this>;
  stop(): Promise<void>;
  tick(deltaSeconds: number): void;
  dispatch(hostId: string, type: string, payload?: Record<string, unknown>): Promise<unknown>;
  sendEvent(event: BridgeEvent | string): boolean;
  receive(event: BridgeEvent | string): boolean;
  on(type: string, listener: (event: BridgeEvent) => void): () => boolean;
  bindInput(target: EventTarget, options?: { preventDefault?: boolean }): () => void;
  poll(): string | undefined;
}
export declare function createTomCatBridge(module: EmscriptenModule, options?: ConstructorParameters<typeof TomCatBridge>[0]): TomCatBridge;
export declare function createDomHost(target: EventTarget): HostAdapter;
export declare function createGlfwHost(transport: HostAdapter): HostAdapter;
