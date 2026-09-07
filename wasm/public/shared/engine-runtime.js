/*
 * Browser host for the real TomCat_Engine WebAssembly module.
 *
 * The editor and Hub keep a small JSON view of a project for fast DOM
 * rendering.  The native EditorLayer still owns the authoritative scene
 * format, so this adapter materialises that view as the upstream
 * Project.tcproj/.tomcat files in IDBFS before booting C++.
 */
(function (global) {
  "use strict";

  const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const yamlQuote = (value) => JSON.stringify(String(value == null ? "" : value));
  const vec2 = (x, y) => `[${finite(x)}, ${finite(y)}]`;
  const vec3 = (x, y, z) => `[${finite(x)}, ${finite(y)}, ${finite(z)}]`;
  const vec4 = (x, y, z, w) => `[${finite(x)}, ${finite(y)}, ${finite(z)}, ${finite(w, 1)}]`;

  // UUID is a uint64_t in the upstream serializer.  Stable IDs let a scene
  // round-trip between the DOM store and the C++ editor without changing
  // entity identity every time the page is opened.
  function uuidFor(value, index) {
    const text = `${String(value || "entity")}:${index || 0}`;
    if (typeof BigInt === "function") {
      let hash = 1469598103934665603n;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= BigInt(text.charCodeAt(i));
        hash = BigInt.asUintN(64, hash * 1099511628211n);
      }
      return (hash === 0n ? 1n : hash).toString();
    }
    // Old browsers without BigInt still get a valid non-zero 53-bit UUID.
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return String((hash >>> 0) || 1);
  }

  function componentSet(entity) {
    const values = new Set(Array.isArray(entity?.components) ? entity.components : []);
    const type = String(entity?.type || "").toLowerCase();
    if (type === "camera") values.add("Camera");
    if (type === "sprite") values.add("SpriteRenderer");
    if (values.size === 0 && type !== "light") values.add("Transform");
    return values;
  }

  function sceneYaml(scene) {
    const source = scene || { name: "MainScene", entities: [] };
    const entities = Array.isArray(source.entities) ? source.entities : [];
    const lines = [`Scene: ${yamlQuote(source.name || "MainScene")}`];
    // yaml-cpp accepts both a block sequence and an inline empty sequence;
    // use the latter for an empty scene so the generated file is valid even
    // before the first entity is created.
    if (!entities.length) return `${lines[0]}\nEntities: []\n`;
    lines.push("Entities:");
    entities.forEach((entity, index) => {
      const transform = entity.transform || {};
      const rotation = finite(transform.rotation) * Math.PI / 180;
      const scale = finite(transform.scale, 1);
      const components = componentSet(entity);
      lines.push(`  - Entity: ${uuidFor(entity.id || entity.name, index)}`);
      lines.push("    Tag:");
      lines.push(`      Tag: ${yamlQuote(entity.name || "Entity")}`);
      lines.push("    Transform:");
      lines.push(`      Translation: ${vec3(transform.x, transform.y, 0)}`);
      lines.push(`      Rotation: ${vec3(0, 0, rotation)}`);
      lines.push(`      Scale: ${vec3(scale, scale, scale)}`);

      if (components.has("Camera")) {
        lines.push("    Camera:");
        lines.push("      Camera:");
        lines.push("        ProjectionType: 1");
        lines.push("        PerspectiveFOV: 0.785398");
        lines.push("        PerspectiveNear: 0.01");
        lines.push("        PerspectiveFar: 1000");
        lines.push("        OrthographicSize: 10");
        lines.push("        OrthographicNear: -1");
        lines.push("        OrthographicFar: 1");
        lines.push(`      Primary: ${entity.primary === false ? "false" : "true"}`);
        lines.push("      FixedAspectRatio: false");
        lines.push("      BackgroundColor: [0.53, 0.81, 0.92, 1]");
      }

      if (components.has("SpriteRenderer")) {
        const color = entity.color || entity.spriteColor || {};
        lines.push("    SpriteRenderer:");
        lines.push(`      Color: ${vec4(color.r, color.g, color.b, color.a)}`);
      }

      if (components.has("Rigidbody2D")) {
        const body = String(entity.bodyType || "Static");
        lines.push("    Rigidbody2D:");
        lines.push(`      BodyType: ${["Static", "Dynamic", "Kinematic"].includes(body) ? body : "Static"}`);
        lines.push(`      FixedRotation: ${entity.fixedRotation ? "true" : "false"}`);
      }

      if (components.has("BoxCollider2D")) {
        const collider = entity.collider || {};
        lines.push("    BoxCollider2D:");
        lines.push(`      Offset: ${vec2(collider.offsetX, collider.offsetY)}`);
        lines.push(`      Size: ${vec2(collider.width, collider.height)}`);
        lines.push(`      Density: ${finite(collider.density, 1)}`);
        lines.push(`      Friction: ${finite(collider.friction, 0.5)}`);
        lines.push(`      Restitution: ${finite(collider.restitution)}`);
        lines.push(`      RestitutionThreshold: ${finite(collider.restitutionThreshold, 0.5)}`);
      }
    });
    return `${lines.join("\n")}\n`;
  }

  function projectYaml(project) {
    const source = project || {};
    return [
      "Project:",
      `  Name: ${yamlQuote(source.name || "Untitled Project")}`,
      "  Version: \"1.0.0\"",
      `  Description: ${yamlQuote(source.description || "")}`,
      "  EditorVersion: \"web\"",
      `  Template: ${yamlQuote(source.template || "2D")}`,
      "  AssetDirectory: \"Assets\"",
      "  TwoColumnCurrentFolder: \"\"",
      "  ExpandedNodes: []",
      `  LastOperationTime: ${yamlQuote(new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""))}`,
      "",
    ].join("\n");
  }

  function call(module, name, returnType, argTypes = [], args = []) {
    if (!module || typeof module.ccall !== "function") return undefined;
    return module.ccall(name, returnType, argTypes, args);
  }

  async function materializeProject(storage, project, { overwrite = false } = {}) {
    if (!storage || !project) return null;
    await storage.mount({ populate: true });
    const id = storage.projectId(project.id);
    const projectPath = storage.projectPath(id);
    if (overwrite || !storage.exists(projectPath)) await storage.writeText(projectPath, projectYaml(project));

    const scenes = Array.isArray(project.scenes) && project.scenes.length
      ? project.scenes
      : [{ id: "MainScene", name: "MainScene", entities: [] }];
    const sceneFiles = [];
    const sceneNames = new Set();
    for (const scene of scenes) {
      // Upstream names scene files by scene name (MainScene.tomcat) inside the
      // project Assets folder.  The store scene id is only an identity key, so
      // it must not leak into the file system layout the editor shows.
      const sceneId = storage.sceneId(scene.name || scene.id || "MainScene");
      const path = storage.scenePath(id, sceneId);
      if (overwrite || !storage.exists(path)) await storage.writeText(path, sceneYaml(scene));
      sceneNames.add(`${sceneId}.tomcat`);
      sceneFiles.push({ scene, id: sceneId, path });
    }
    // Older builds wrote scene files named after random store ids.  Remove
    // stale scene files that no longer belong to a store scene so the editor's
    // Content Browser does not show duplicates; project data itself always
    // lives in the store, so no editor scene is orphaned by this cleanup.
    const mount = storage.mountPath || "/tomcat";
    const entries = await storage.list(`${mount}/projects/${id}/Assets`);
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const name = String(entry.name || "");
        if (name.endsWith(".tomcat") && !sceneNames.has(name) && !name.startsWith(".")) {
          try { await storage.remove(`${mount}/projects/${id}/Assets/${name}`); } catch (_) { /* best effort */ }
        }
      }
    }
    await storage.sync(false);
    return { id, projectPath, scenes: sceneFiles };
  }

  function requestedProject() {
    const params = new URLSearchParams(global.location?.search || "");
    const id = params.get("project") || global.localStorage?.getItem("tomcat.lastProjectId");
    const store = global.TomCatStore;
    return store && (store.get(id) || store.list()[0]);
  }

  function requestedScene(project) {
    const params = new URLSearchParams(global.location?.search || "");
    const id = params.get("scene");
    return (project?.scenes || []).find((scene) => scene.id === id || scene.name === id) || project?.scenes?.[0];
  }

  class EngineRuntime {
    constructor({ canvas, factory = global.TomCatWebModule, project = requestedProject(), scene = null } = {}) {
      this.canvas = canvas;
      this.factory = factory;
      this.project = project;
      this.scene = scene || requestedScene(project);
      this.module = null;
      this.storage = null;
      this.files = null;
      this.running = false;
      this.lastFrame = 0;
      this.frameHandle = 0;
      this.ready = this.start();
    }

    async start() {
      if (typeof this.factory !== "function") throw new Error("TomCatWebModule factory is unavailable");
      this.module = await this.factory({
        canvas: this.canvas,
        locateFile: (name) => `./${name}`,
        print: (value) => this.emit("log", String(value)),
        printErr: (value) => this.emit("error", String(value)),
      });
      global.Module = this.module;
      if (global.TomCatBridge?.bindEmscripten) global.TomCatBridge.bindEmscripten(this.module);
      this.storage = new global.TomCatStorage({ module: this.module });
      this.storage.attachBridge(global.TomCatBridge);
      if (global.TomCatBridge && this.storage.installBridge) this.storage.installBridge(global.TomCatBridge);
      this.files = await materializeProject(this.storage, this.project);

      this.resize();
      if (this.files) call(this.module, "tc_web_runtime_set_project_path", null, ["string"], [this.files.projectPath]);
      const width = this.canvas?.width || 1280;
      const height = this.canvas?.height || 720;
      const result = call(this.module, "tc_web_runtime_boot", "number", ["number", "number"], [width, height]);
      if (result !== 0) throw new Error(`tc_web_runtime_boot failed (${result})`);
      this.running = true;
      if (this.files?.scenes?.[0]) {
        const selected = this.files.scenes.find((item) => item.scene.id === this.scene?.id || item.scene.name === this.scene?.name) || this.files.scenes[0];
        this.scene = selected.scene;
        call(this.module, "tc_web_editor_open_scene", "number", ["string"], [selected.path]);
      }
      this.emit("ready", { project: this.project, scene: this.scene, files: this.files });
      this.lastFrame = performance.now();
      this.frameHandle = requestAnimationFrame((now) => this.frame(now));
      this.bindHostEvents();
      return this;
    }

    emit(type, payload) {
      global.dispatchEvent?.(new CustomEvent(`tomcat:engine:${type}`, { detail: payload }));
    }

    frame(now) {
      if (!this.running) return;
      const seconds = Math.min(Math.max((now - this.lastFrame) / 1000, 0), 0.1);
      this.lastFrame = now;
      call(this.module, "tc_web_runtime_frame", null, ["number"], [seconds]);
      // Events emitted by C++ remain available even when addFunction is not
      // enabled by a particular Emscripten build.
      const event = call(this.module, "tc_web_poll_event", "string", [], []);
      if (event && global.TomCatBridge?.dispatch) {
        try { global.TomCatBridge.dispatch(JSON.parse(event)); } catch (_) { /* optional event */ }
      }
      this.frameHandle = requestAnimationFrame((next) => this.frame(next));
    }

    resize() {
      if (!this.canvas) return;
      const width = Math.max(1, Math.floor(this.canvas.clientWidth || global.innerWidth || 1280));
      const height = Math.max(1, Math.floor(this.canvas.clientHeight || global.innerHeight || 720));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      call(this.module, "tc_web_platform_resize", null, ["number", "number"], [width, height]);
      call(this.module, "tc_web_platform_set_size", null, ["number", "number"], [width, height]);
    }

    bindHostEvents() {
      this._resizeHandler = () => this.resize();
      global.addEventListener("resize", this._resizeHandler);
      this._dialogHandler = (event) => {
        const detail = event.detail || {};
        if (detail.command === "file.save") {
          const target = this.files?.scenes?.[0]?.path || this.files?.projectPath || "/tomcat/Project.tcproj";
          call(this.module, "tc_web_runtime_set_file_dialog_result", null, ["string"], [target]);
          return;
        }
        this.emit("file-dialog", detail);
      };
      global.addEventListener("tomcat:file-dialog", this._dialogHandler);
    }

    command(name, args = []) { return call(this.module, name, "number", args.map(() => "string"), args); }
    newScene() { return call(this.module, "tc_web_editor_new_scene", "number", [], []); }
    play() { return call(this.module, "tc_web_editor_play", null, [], []); }
    stop() { return call(this.module, "tc_web_editor_stop", null, [], []); }
    shutdown() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.frameHandle);
      if (this._resizeHandler) global.removeEventListener("resize", this._resizeHandler);
      if (this._dialogHandler) global.removeEventListener("tomcat:file-dialog", this._dialogHandler);
      call(this.module, "tc_web_runtime_shutdown", null, [], []);
    }
  }

  global.TomCatEngineHost = { EngineRuntime, materializeProject, sceneYaml, projectYaml };
})(window);
