import test from "node:test";
import assert from "node:assert/strict";
import { HostRegistry, TomCatBridge, BridgeError } from "./tomcat-bridge.mjs";

test("registry registers, describes and dispatches adapters", async () => {
  const registry = new HostRegistry();
  const seen = [];
  registry.register("glfw", { send: (message) => { seen.push(message); return "ok"; } }, { version: 2, capabilities: ["input"] });
  assert.deepEqual(registry.describe(), [{ id: "glfw", version: 2, capabilities: ["input"] }]);
  assert.equal(await registry.send("glfw", { type: "ping" }), "ok");
  assert.equal(seen[0].type, "ping");
  assert.throws(() => registry.register("glfw", { send() {} }), (error) => error instanceof BridgeError && error.code === "DUPLICATE_HOST");
});

test("bridge forwards commands, receives wasm callback events and polls", async () => {
  const calls = [];
  const callbacks = [];
  const module = {
    addFunction(fn) { callbacks.push(fn); return 11; },
    removeFunction() {},
    UTF8ToString(pointer) { return pointer; },
    ccall(name, returnType, argTypes, args) {
      calls.push({ name, returnType, argTypes, args });
      if (name === "tc_web_poll_event") return '{"type":"polled"}';
      return 1;
    },
  };
  const bridge = new TomCatBridge({ logger: { debug() {}, warn() {} } }).attachWasm(module);
  const received = [];
  bridge.on("wasm", (event) => received.push(event));
  callbacks[0]('{"type":"wasm","payload":{"value":1}}');
  await bridge.dispatch("glfw", "setMode", { mode: "play" }).catch((error) => assert.equal(error.code, "UNKNOWN_HOST"));
  bridge.hosts.register("glfw", { send: () => "sent" });
  await bridge.dispatch("glfw", "setMode", { mode: "play" });
  assert.equal(calls.at(-1).name, "tc_web_dispatch");
  assert.equal(received[0].payload.value, 1);
  bridge.poll();
  assert.equal(calls.at(-1).name, "tc_web_poll_event");
});
