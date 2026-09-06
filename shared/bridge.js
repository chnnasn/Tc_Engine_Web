/*
 * Browser side compatibility bridge.
 *
 * The C++ engine stays unchanged: an Emscripten build can call the same
 * registered commands through Module.TomCatWebBridge, while the editor uses
 * postMessage when it is embedded in a host page. Commands are deliberately
 * small JSON messages so new C++ features only need one adapter registration.
 */
(function (global) {
  const listeners = new Map();
  const bridge = {
    version: "0.1",
    register(name, handler) { listeners.set(name, handler); return () => listeners.delete(name); },
    unregister(name) { listeners.delete(name); },
    dispatch(message) {
      if (!message || !message.command) return Promise.resolve({ ok: false, error: "Missing command" });
      const fn = listeners.get(message.command);
      if (!fn) return Promise.resolve({ ok: false, error: `Unknown command: ${message.command}` });
      try { return Promise.resolve(fn(message.payload, message)); }
      catch (error) { return Promise.resolve({ ok: false, error: error.message }); }
    },
    send(command, payload) {
      const message = { source: "tomcat-web", command, payload: payload || {}, id: crypto.randomUUID?.() || String(Date.now()) };
      if (global.parent && global.parent !== global) global.parent.postMessage(message, "*");
      global.dispatchEvent(new CustomEvent("tomcat:command", { detail: message }));
      return bridge.dispatch(message);
    },
    bindEmscripten(Module) {
      if (!Module) return;
      Module.TomCatWebBridge = {
        dispatch: (json) => bridge.dispatch(JSON.parse(json || "{}")),
        version: bridge.version
      };
    }
  };
  global.addEventListener("message", (event) => {
    if (event.data?.source !== "tomcat-engine") return;
    bridge.dispatch(event.data).then((result) => {
      if (event.source?.postMessage) event.source.postMessage({ source: "tomcat-web", replyTo: event.data.id, result }, "*");
    });
  });
  global.TomCatBridge = bridge;
})(window);
