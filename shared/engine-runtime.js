/*
 * Browser hosts for the real TomCat_Engine WebAssembly module.
 *
 * The same module contains the upstream TomCat Hub (Builder/Manager) and the
 * upstream editor.  Both operate on one virtual project tree under
 * /tomcat/Projects/<project-name>/Project.tcproj, which is exactly how the
 * desktop TomCatHub organises projects.  The browser store is a lightweight
 * registry used to seed that tree and to remember projects across sessions.
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
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return String((hash >>> 0) || 1);
  }

  // A project folder mirrors the desktop Hub layout: the folder is named
  // after the project and contains Project.tcproj plus an Assets tree.
  function safeFolder(value) {
    const result = String(value == null ? "" : value).trim();
    if (!result || result === "." || result === ".." || /[\\/\u0000-\u001f]/.test(result)) {
      throw new Error(`Invalid project folder name: ${result || "(empty)"}`);
    }
    return result;
  }

  function entity(name, type, x, y, scale = 1, extra = {}) {
    return {
      id: `${type || "entity"}-${name}`, name, type, visible: true,
      transform: { x, y, rotation: 0, scale },
      components: type === "Camera" ? ["Transform", "Camera"] : ["Transform", "SpriteRenderer"],
      ...extra,
    };
  }

  // Fallback scene used only when a newly created project does not contain a
  // scene file yet.  It mirrors the platform's own "2D 空项目" starting point.
  function defaultScene() {
    return {
      id: "MainScene", name: "MainScene", entities: [
        entity("Main Camera", "Camera", 0, 0, 1),
        entity("Ground", "Sprite", 0, -2, 8, { components: ["Transform", "SpriteRenderer", "BoxCollider2D"] }),
        entity("Player", "Sprite", 0, 0, .5, { components: ["Transform", "SpriteRenderer", "Rigidbody2D", "BoxCollider2D"] }),
        entity("DirectionalLight", "Light", 0, 0, 1, { components: ["Transform", "Light"] }),
      ],
    };
  }

  function componentSet(entityValue) {
    const values = new Set(Array.isArray(entityValue?.components) ? entityValue.components : []);
    const type = String(entityValue?.type || "").toLowerCase();
    if (type === "camera") values.add("Camera");
    if (type === "sprite") values.add("SpriteRenderer");
    if (values.size === 0 && type !== "light") values.add("Transform");
    return values;
  }

  function sceneYaml(scene) {
    const source = scene || { name: "MainScene", entities: [] };
    const entities = Array.isArray(source.entities) ? source.entities : [];
    const lines = [`Scene: ${yamlQuote(source.name || "MainScene")}`];
    if (!entities.length) return `${lines[0]}\nEntities: []\n`;
    lines.push("Entities:");
    entities.forEach((entityValue, index) => {
      const transform = entityValue.transform || {};
      const rotation = finite(transform.rotation) * Math.PI / 180;
      const scale = finite(transform.scale, 1);
      const components = componentSet(entityValue);
      lines.push(`  - Entity: ${uuidFor(entityValue.id || entityValue.name, index)}`);
      lines.push("    Tag:");
      lines.push(`      Tag: ${yamlQuote(entityValue.name || "Entity")}`);
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
        lines.push(`      Primary: ${entityValue.primary === false ? "false" : "true"}`);
        lines.push("      FixedAspectRatio: false");
        lines.push("      BackgroundColor: [0.53, 0.81, 0.92, 1]");
      }

      if (components.has("SpriteRenderer")) {
        const color = entityValue.color || entityValue.spriteColor || {};
        lines.push("    SpriteRenderer:");
        lines.push(`      Color: ${vec4(color.r, color.g, color.b, color.a)}`);
      }

      if (components.has("Rigidbody2D")) {
        const body = String(entityValue.bodyType || "Static");
        lines.push("    Rigidbody2D:");
        lines.push(`      BodyType: ${["Static", "Dynamic", "Kinematic"].includes(body) ? body : "Static"}`);
        lines.push(`      FixedRotation: ${entityValue.fixedRotation ? "true" : "false"}`);
      }

      if (components.has("BoxCollider2D")) {
        const collider = entityValue.collider || {};
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
      "  EditorVersion: \"1.0.0\"",
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

  function projectRootPath(storage, name) {
    return `${storage.mountPath || "/tomcat"}/Projects/${safeFolder(name)}`;
  }

  function listSceneFiles(storage, root) {
    const entries = storage.list(`${root}/Assets`);
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry) => !entry.directory && String(entry.name).endsWith(".tomcat"))
      .map((entry) => String(entry.name))
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Make one project visible to the native Hub/editor on the virtual
   * filesystem.  Existing files are the source of truth (they were written by
   * the real C++ ProjectManager/SceneSerializer); the store JSON is only used
   * to seed a project that has never been materialised.
   */
  async function materializeProject(storage, project, { overwrite = false } = {}) {
    if (!storage || !project) return null;
    await storage.mount({ populate: true });
    const name = safeFolder(project.name || "Untitled Project");
    const root = projectRootPath(storage, name);
    const projectPath = `${root}/Project.tcproj`;
    const assets = `${root}/Assets`;
    const hasProject = storage.exists(projectPath);

    if (!hasProject || overwrite) {
      if (!storage.exists(root)) storage.mkdir(root);
      if (!storage.exists(assets)) storage.mkdir(assets);
      await storage.writeText(projectPath, projectYaml(project));
      const scenes = Array.isArray(project.scenes) && project.scenes.length
        ? project.scenes
        : [defaultScene()];
      const names = new Set();
      for (const scene of scenes) {
        const sceneId = storage.sceneId(scene.name || scene.id || "MainScene");
        const path = `${assets}/${sceneId}.tomcat`;
        if (!storage.exists(path)) await storage.writeText(path, sceneYaml(scene));
        names.add(`${sceneId}.tomcat`);
      }
      const entries = await storage.list(assets);
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const entryName = String(entry.name || "");
          if (entryName.endsWith(".tomcat") && !names.has(entryName) && !entryName.startsWith(".")) {
            try { await storage.remove(`${assets}/${entryName}`); } catch (_) { /* best effort */ }
          }
        }
      }
      await storage.sync(false);
    }

    const sceneFiles = [];
    const existing = hasProject && !overwrite ? listSceneFiles(storage, root) : [];
    if (existing.length) {
      for (const file of existing) {
        const sceneId = file.slice(0, -".tomcat".length);
        sceneFiles.push({ scene: { id: sceneId, name: sceneId }, id: sceneId, path: `${assets}/${file}` });
      }
    } else {
      const sceneNames = Array.isArray(project.scenes) && project.scenes.length
        ? project.scenes
        : [defaultScene()];
      for (const scene of sceneNames) {
        const sceneId = storage.sceneId(scene.name || scene.id || "MainScene");
        const path = `${assets}/${sceneId}.tomcat`;
        if (!storage.exists(path)) await storage.writeText(path, sceneYaml(scene));
        sceneFiles.push({ scene, id: sceneId, path });
      }
      await storage.sync(false);
    }
    await storage.sync(false);
    return { id: name, name, projectPath, scenes: sceneFiles };
  }

  function readProjectMeta(text) {
    const meta = { name: "", template: "2D", description: "", editorVersion: "1.0.0" };
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
      const match = /^  ([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      const raw = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (key === "Name") meta.name = raw;
      else if (key === "Template") meta.template = raw;
      else if (key === "Description") meta.description = raw;
      else if (key === "EditorVersion") meta.editorVersion = raw;
    }
    return meta;
  }

  function requestedProject() {
    const params = new URLSearchParams(global.location?.search || "");
    const id = params.get("project") || global.localStorage?.getItem("tomcat.lastProjectId");
    const store = global.TomCatStore;
    const found = store && (store.get(id) || store.list().find((p) => p.name === id));
    return found || (id ? { id, name: id } : (store?.list()[0] || { id: "MainScene", name: "MainScene" }));
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
          const target = this.files?.scenes?.[0]?.path || `${this.files?.projectPath || "/tomcat"}.tomcat`;
          call(this.module, "tc_web_runtime_set_file_dialog_result", null, ["string"], [target]);
          return;
        }
        this.emit("file-dialog", detail);
      };
      global.addEventListener("tomcat:file-dialog", this._dialogHandler);
    }

    shutdown() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.frameHandle);
      if (this._resizeHandler) global.removeEventListener("resize", this._resizeHandler);
      if (this._dialogHandler) global.removeEventListener("tomcat:file-dialog", this._dialogHandler);
      call(this.module, "tc_web_runtime_shutdown", null, [], []);
    }
  }

  class HubRuntime {
    constructor({ canvas, factory = global.TomCatWebModule, store = global.TomCatStore, modulePath = "../runtime/" } = {}) {
      this.canvas = canvas;
      this.factory = factory;
      this.store = store;
      this.modulePath = modulePath;
      this.module = null;
      this.storage = null;
      this.running = false;
      this.lastFrame = 0;
      this.frameHandle = 0;
      this.reconcileEvery = 90;
      this.frameCount = 0;
      this.ready = this.start();
    }

    emit(type, payload) {
      global.dispatchEvent?.(new CustomEvent(`tomcat:engine:${type}`, { detail: payload }));
    }

    async start() {
      if (typeof this.factory !== "function") throw new Error("TomCatWebModule factory is unavailable");
      this.module = await this.factory({
        canvas: this.canvas,
        locateFile: (name) => `${this.modulePath}${name}`,
        print: (value) => this.emit("log", String(value)),
        printErr: (value) => this.emit("error", String(value)),
      });
      global.Module = this.module;
      if (global.TomCatBridge?.bindEmscripten) global.TomCatBridge.bindEmscripten(this.module);
      this.storage = new global.TomCatStorage({ module: this.module });
      this.storage.attachBridge(global.TomCatBridge);
      if (global.TomCatBridge && this.storage.installBridge) this.storage.installBridge(global.TomCatBridge);

      await this.seed();
      this.linkPackages();
      this.resize();
      call(this.module, "tc_web_hub_boot", null, ["number", "number"], [this.canvas?.width || 1280, this.canvas?.height || 720]);
      this.running = true;
      this.emit("ready", {});
      this.lastFrame = performance.now();
      this.frameHandle = requestAnimationFrame((now) => this.frame(now));
      this.bindHostEvents();
      return this;
    }

    // The Hub runs with /tomcat as its working directory (desktop layout:
    // Projects/ and Editors/ next to the settings file), while the engine's
    // preloaded Packages tree lives at the filesystem root.  Link the two so
    // the upstream relative font/shader paths keep working unchanged.
    linkPackages() {
      const FS = this.module?.FS;
      if (!FS?.symlink || !FS?.analyzePath) return;
      try {
        const target = "/tomcat/Packages";
        if (FS.analyzePath(target).exists) return;
        FS.symlink("/Packages", target);
        return;
      } catch (_) {
        // IDBFS does not persist symlinks; fall back to copying the small
        // preloaded package tree into the mounted working directory.
      }
      this.copyPackages();
    }

    copyPackages() {
      const FS = this.module?.FS;
      if (!FS?.readFile || !FS?.writeFile || !FS?.mkdir || !FS?.analyzePath) return;
      const copy = (sourceDir, targetDir) => {
        let entries = [];
        try { entries = FS.readdir(sourceDir); } catch (_) { return; }
        for (const name of entries) {
          if (name === "." || name === "..") continue;
          const source = `${sourceDir}/${name}`;
          const target = `${targetDir}/${name}`;
          const node = FS.analyzePath(source).object;
          if (!node) continue;
          if (FS.isDir(node.mode)) {
            if (!FS.analyzePath(target).exists) FS.mkdir(target);
            copy(source, target);
          } else if (!FS.analyzePath(target).exists) {
            FS.writeFile(target, FS.readFile(source));
          }
        }
      };
      try {
        if (!FS.analyzePath("/tomcat/Packages").exists) FS.mkdir("/tomcat/Packages");
        copy("/Packages", "/tomcat/Packages");
      } catch (_) { /* best effort: fonts are the only hard requirement */ }
    }

    async seed() {
      await this.storage.mount({ populate: true });
      const editors = `${this.storage.mountPath}/Editors`;
      if (!this.storage.exists(editors)) this.storage.mkdir(editors);
      const version = `${editors}/1.0.0`;
      if (!this.storage.exists(version)) {
        this.storage.mkdir(version);
        await this.storage.writeText(`${version}/.tcengine`, "web-build");
      }
      const projects = (this.store && Array.isArray(this.store.list()) ? this.store.list() : [])
        .filter((project) => project && project.name);
      for (const project of projects) {
        await materializeProject(this.storage, project, { overwrite: false });
      }
      await this.storage.sync(false);
    }

    frame(now) {
      if (!this.running) return;
      const seconds = Math.min(Math.max((now - this.lastFrame) / 1000, 0), 0.1);
      this.lastFrame = now;
      call(this.module, "tc_web_hub_frame", null, ["number"], [seconds]);
      const pending = call(this.module, "tc_web_hub_poll_open_project", "number", [], []);
      if (pending && this.module?.UTF8ToString) {
        const path = this.module.UTF8ToString(pending);
        this.handleOpenProject(path);
        return;
      }
      this.frameCount += 1;
      if (this.frameCount % this.reconcileEvery === 0) this.reconcile();
      this.frameHandle = requestAnimationFrame((next) => this.frame(next));
    }

    handleOpenProject(path) {
      if (!path) return;
      const segments = String(path).split("/").filter(Boolean);
      const folder = segments.length >= 2 ? segments[segments.length - 2] : "";
      if (!folder) return;
      if (this.store && !this.store.get(folder)) {
        try {
          const meta = this.readProjectFolderMeta(folder);
          this.store.create({ name: folder, template: meta.template || "2D", description: meta.description || "" });
        } catch (_) { /* store entry already exists or name reserved */ }
      }
      const target = `../runtime/?project=${encodeURIComponent(folder)}`;
      global.location.assign(target);
    }

    readProjectFolderMeta(folder) {
      const path = `${this.storage.mountPath}/Projects/${folder}/Project.tcproj`;
      if (!this.storage.exists(path)) return {};
      try {
        return readProjectMeta(this.storage.readText(path));
      } catch (_) {
        return {};
      }
    }

    reconcile() {
      if (!this.store || !this.storage) return;
      const root = `${this.storage.mountPath}/Projects`;
      if (!this.storage.exists(root)) return;
      let entries = [];
      try { entries = this.storage.list(root) || []; } catch (_) { return; }
      const folders = entries.filter((entry) => entry.directory).map((entry) => String(entry.name));
      let changed = false;
      for (const folder of folders) {
        const path = `${root}/${folder}/Project.tcproj`;
        if (!this.storage.exists(path)) continue;
        if (this.store.get(folder)) continue;
        const meta = this.readProjectFolderMeta(folder);
        try {
          this.store.create({ name: folder, template: meta.template || "2D", description: meta.description || "" });
          changed = true;
        } catch (_) { /* duplicate or invalid name */ }
      }
      if (changed) call(this.module, "tc_web_hub_rescan", null, [], []);
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
        this.emit("file-dialog", detail);
        if (detail.command === "file.open") {
          this.pickProjectFile();
        }
      };
      global.addEventListener("tomcat:file-dialog", this._dialogHandler);
    }

    pickProjectFile() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".tcproj";
      input.style.display = "none";
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const meta = readProjectMeta(text);
          const name = meta.name || file.name.replace(/\.tcproj$/i, "") || "Imported Project";
          const folder = safeFolder(name);
          const root = `${this.storage.mountPath}/Projects/${folder}`;
          if (!this.storage.exists(root)) this.storage.mkdir(root);
          const assets = `${root}/Assets`;
          if (!this.storage.exists(assets)) this.storage.mkdir(assets);
          await this.storage.writeText(`${root}/Project.tcproj`, text);
          await this.storage.sync(false);
          if (this.store && !this.store.get(folder)) {
            this.store.create({ name: folder, template: meta.template || "2D", description: meta.description || "" });
          }
          call(this.module, "tc_web_hub_rescan", null, [], []);
          this.emit("log", `已导入项目：${folder}`);
        } catch (error) {
          this.emit("error", String(error && error.message ? error.message : error));
        }
      });
      input.click();
    }

    shutdown() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.frameHandle);
      if (this._resizeHandler) global.removeEventListener("resize", this._resizeHandler);
      if (this._dialogHandler) global.removeEventListener("tomcat:file-dialog", this._dialogHandler);
      call(this.module, "tc_web_hub_shutdown", null, [], []);
    }
  }

  global.TomCatEngineHost = {
    EngineRuntime,
    HubRuntime,
    materializeProject,
    projectRootPath,
    sceneYaml,
    projectYaml,
    readProjectMeta,
    safeFolder,
  };
})(window);
