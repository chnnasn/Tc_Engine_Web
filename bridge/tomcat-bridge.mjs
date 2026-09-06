/**
 * Host-neutral bridge for the TomCat runtime.
 *
 * The native C++ engine remains the source of truth.  A host adapter only
 * translates transport details (DOM, GLFW, a worker, etc.) into the small
 * event/command protocol below.  New engine features can therefore be
 * exposed by registering one adapter instead of changing the editor core.
 */

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export class BridgeError extends Error {
  constructor(message, code = "BRIDGE_ERROR") {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

/**
 * Registry of independently versioned host adapters.
 * An adapter must implement `send(message)` and may implement `connect`,
 * `disconnect`, and `dispose`. `onEvent` is installed by the registry.
 */
export class HostRegistry {
  #entries = new Map();

  register(id, adapter, { replace = false, version = 1, capabilities = [] } = {}) {
    if (!id || typeof id !== "string") throw new BridgeError("Host id must be a non-empty string", "INVALID_HOST_ID");
    if (!adapter || typeof adapter.send !== "function") {
      throw new BridgeError(`Host '${id}' must implement send(message)`, "INVALID_HOST");
    }
    if (this.#entries.has(id) && !replace) throw new BridgeError(`Host '${id}' is already registered`, "DUPLICATE_HOST");
    const entry = { id, adapter, version, capabilities: [...capabilities] };
    this.#entries.set(id, entry);
    return () => this.unregister(id);
  }

  unregister(id) {
    const entry = this.#entries.get(id);
    if (!entry) return false;
    entry.adapter.disconnect?.();
    entry.adapter.dispose?.();
    return this.#entries.delete(id);
  }

  get(id) { return this.#entries.get(id)?.adapter; }
  describe() {
    return [...this.#entries.values()].map(({ id, version, capabilities }) => ({ id, version, capabilities: [...capabilities] }));
  }
  async connectAll(onEvent) {
    for (const { adapter } of this.#entries.values()) {
      adapter.onEvent = onEvent;
      await adapter.connect?.();
    }
  }
  async disconnectAll() {
    for (const { adapter } of this.#entries.values()) await adapter.disconnect?.();
  }
  async send(id, message) {
    const adapter = this.get(id);
    if (!adapter) throw new BridgeError(`Unknown host '${id}'`, "UNKNOWN_HOST");
    return adapter.send(message);
  }
}

export class TomCatBridge {
  constructor({ logger = console, clock = () => Date.now() } = {}) {
    this.logger = logger;
    this.clock = clock;
    this.hosts = new HostRegistry();
    this.listeners = new Map();
    this.module = null;
    this._wasmCallback = null;
  }

  /** Attach an Emscripten Module. All functions are optional for compatibility. */
  attachWasm(module) {
    if (!module) throw new BridgeError("An Emscripten Module is required", "INVALID_MODULE");
    this.module = module;
    const bridge = this;
    if (typeof module.ccall === "function" && typeof module.addFunction === "function") {
      try {
        this._wasmCallback = module.addFunction((pointer) => {
          const json = bridge.#readCString(pointer);
          if (json) bridge.receive(json);
        }, "vi");
        module.ccall("tc_web_set_event_callback", null, ["number"], [this._wasmCallback]);
      } catch (error) {
        // Older builds can omit callback support; polling/Module events still work.
        this.logger?.debug?.("TomCat event callback unavailable", error);
      }
    }
    return this;
  }

  async start() {
    await this.hosts.connectAll((event) => this.sendEvent(event));
    this.#call("tc_web_boot", null, [], []);
    return this;
  }

  async stop() {
    await this.hosts.disconnectAll();
    this.#call("tc_web_shutdown", null, [], []);
    if (this.module?.removeFunction && this._wasmCallback != null) this.module.removeFunction(this._wasmCallback);
    this._wasmCallback = null;
  }

  /** Send one frame/timestep to the C++ compatibility layer. */
  tick(deltaSeconds) {
    this.#call("tc_web_frame", null, ["number"], [Number(deltaSeconds) || 0]);
  }

  /** Send a JSON command to a registered host and optionally to the WASM layer. */
  async dispatch(hostId, type, payload = {}) {
    const message = { protocol: "tomcat.bridge.v1", type, payload, time: this.clock() };
    const hostResult = await this.hosts.send(hostId, message);
    this.#call("tc_web_dispatch", "number", ["string", "string"], [hostId, JSON.stringify(message)]);
    return hostResult;
  }

  sendEvent(event) {
    const normalized = typeof event === "string" ? this.#parse(event) : event;
    if (!normalized || typeof normalized.type !== "string") return false;
    const listeners = this.listeners.get(normalized.type) ?? [];
    for (const listener of listeners) listener(normalized);
    const wildcard = this.listeners.get("*") ?? [];
    for (const listener of wildcard) listener(normalized);
    return true;
  }

  receive(event) { return this.sendEvent(event); }

  on(type, listener) {
    if (typeof listener !== "function") throw new BridgeError("Listener must be a function", "INVALID_LISTENER");
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }

  bindInput(target, { preventDefault = false } = {}) {
    if (!target?.addEventListener) throw new BridgeError("Input target must support addEventListener", "INVALID_TARGET");
    const eventNames = ["keydown", "keyup", "pointerdown", "pointerup", "pointermove", "wheel", "resize"];
    const handlers = eventNames.map((name) => {
      const handler = (event) => {
        if (preventDefault && event.cancelable) event.preventDefault();
        const payload = { type: event.type, key: event.key, code: event.code, buttons: event.buttons,
          clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY,
          width: event.target?.innerWidth ?? event.target?.clientWidth, height: event.target?.innerHeight ?? event.target?.clientHeight };
        this.#call("tc_web_push_event", "number", ["string"], [JSON.stringify(payload)]);
        this.sendEvent({ type: `input:${event.type}`, payload });
      };
      target.addEventListener(name, handler, { passive: !preventDefault });
      return [name, handler];
    });
    return () => handlers.forEach(([name, handler]) => target.removeEventListener(name, handler));
  }

  poll() {
    const json = this.#call("tc_web_poll_event", "string", [], []);
    if (json) this.receive(json);
    return json;
  }

  #parse(value) {
    try { return typeof value === "string" ? JSON.parse(value) : value; }
    catch (error) { this.logger?.warn?.("Ignoring malformed TomCat event", error); return null; }
  }
  #readCString(pointer) {
    if (!this.module || pointer == null) return "";
    if (typeof this.module.UTF8ToString === "function") return this.module.UTF8ToString(pointer);
    return "";
  }
  #call(name, returnType, argTypes, args) {
    if (!this.module?.ccall) return undefined;
    try { return this.module.ccall(name, returnType, argTypes, args); }
    catch (error) { this.logger?.debug?.(`Optional WASM export '${name}' unavailable`, error); return undefined; }
  }
}

export function createTomCatBridge(module, options) {
  return new TomCatBridge(options).attachWasm(module);
}

/** A host adapter for a browser canvas/DOM target. */
export function createDomHost(target) {
  return {
    async connect() { this._unbind = target ? undefined : undefined; },
    send(message) { target?.dispatchEvent?.(new CustomEvent("tomcat:command", { detail: message })); return message; },
    disconnect() { this._unbind?.(); },
  };
}

/** A transport adapter for a GLFW/websocket shim. The shim owns GLFW details. */
export function createGlfwHost(transport) {
  if (!transport || typeof transport.send !== "function") throw new BridgeError("GLFW transport must implement send", "INVALID_GLFW_TRANSPORT");
  const adapter = {
    onEvent: null,
    connect() {
      // A websocket/GLFW shim can expose incoming messages through onEvent.
      if ("onEvent" in transport) transport.onEvent = (event) => adapter.onEvent?.(event);
      return transport.connect?.();
    },
    disconnect() { return transport.disconnect?.(); },
    send(message) { return transport.send(message); },
  };
  return adapter;
}
