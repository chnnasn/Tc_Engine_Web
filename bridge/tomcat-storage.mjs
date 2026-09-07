/*
 * Project/asset persistence adapter for the TomCat Web bridge.
 *
 * The preferred backend is the C++ ABI backed by Emscripten IDBFS.  A small
 * in-memory/localStorage fallback keeps the Hub and Editor usable before the
 * WASM module has finished loading and makes the protocol straightforward to
 * test in Node.  Both backends expose the same project/scene operations.
 */

export class StorageError extends Error {
  constructor(message, code = "STORAGE_ERROR") {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

const DEFAULT_MOUNT = "/tomcat";
const DEFAULT_DB = "tomcat-engine";

function safeSegment(value, label) {
  const segment = String(value ?? "");
  if (!segment || segment === "." || segment === ".." || !/^[A-Za-z0-9_.-]+$/.test(segment)) {
    throw new StorageError(`Invalid ${label || "path"}: ${segment}`, "INVALID_SEGMENT");
  }
  return segment;
}

// Scene filenames are user-facing and the upstream editor permits spaces,
// Unicode, and punctuation in a scene name.  Keep the value to one virtual
// filesystem component while allowing those names; project IDs remain strict
// slugs so they are stable across Hub URLs.
function safeFileSegment(value, label) {
  const segment = String(value ?? "");
  if (!segment || segment === "." || segment === ".." || /[\\/\u0000-\u001f]/u.test(segment)) {
    throw new StorageError(`Invalid ${label || "file name"}: ${segment}`, "INVALID_SEGMENT");
  }
  return segment;
}

function normalizeMount(value) {
  let mount = String(value || DEFAULT_MOUNT).replaceAll("\\", "/");
  if (!mount.startsWith("/") || mount.includes("/../") || mount.endsWith("/..")) {
    throw new StorageError("mountPath must be an absolute path without '..'", "INVALID_MOUNT");
  }
  mount = `/${mount.split("/").filter(Boolean).join("/")}`;
  return mount === "/" ? "/tomcat" : mount;
}

function quoteYaml(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function projectYaml({ name, template = "2D", description = "", editorVersion = "web" }) {
  return [
    "Project:",
    `  Name: ${quoteYaml(name)}`,
    "  Version: \"1.0.0\"",
    `  Description: ${quoteYaml(description)}`,
    `  EditorVersion: ${quoteYaml(editorVersion)}`,
    `  Template: ${quoteYaml(template)}`,
    "  AssetDirectory: \"Assets\"",
    "  TwoColumnCurrentFolder: \"\"",
    "  ExpandedNodes: []",
    "  LastOperationTime: \"\"",
    "",
  ].join("\n");
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new StorageError("File data must be a string, Uint8Array, or ArrayBuffer", "INVALID_DATA");
}

function asText(bytes) {
  return new TextDecoder().decode(bytes);
}

function fallbackStorage(options) {
  if (options.localStorage !== undefined) return options.localStorage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * Shared storage adapter used by Hub, Editor, and the C++ runtime.
 */
export class TomCatStorage {
  constructor({
    module = null,
    mountPath = DEFAULT_MOUNT,
    dbName = DEFAULT_DB,
    localStorage = undefined,
    timeoutMs = 10000,
    logger = console,
  } = {}) {
    this.module = module;
    this.mountPath = normalizeMount(mountPath);
    // IDBFS derives its IndexedDB database from the mount point.  `dbName`
    // namespaces the localStorage fallback and intentionally does not try to
    // rewrite Emscripten's internal IDBFS naming.
    this.dbName = String(dbName || DEFAULT_DB);
    this.timeoutMs = Math.max(250, Number(timeoutMs) || 10000);
    this.logger = logger;
    this.localStorage = fallbackStorage({ localStorage });
    this.files = new Map();
    this.mounted = false;
    this.bridge = null;
  }

  attachModule(module) {
    this.module = module || null;
    return this;
  }

  attachBridge(bridge) {
    this.bridge = bridge || null;
    return this;
  }

  _call(name, returnType, argTypes = [], args = []) {
    if (!this.module || typeof this.module.ccall !== "function") return undefined;
    try {
      return this.module.ccall(name, returnType, argTypes, args);
    } catch (error) {
      throw new StorageError(error?.message || `WASM call failed: ${name}`, "WASM_CALL");
    }
  }

  _errorFromModule(fallback = "WASM storage operation failed") {
    let message = fallback;
    try {
      const value = this._call("tc_web_storage_last_error", "string", [], []);
      if (value) message = value;
    } catch { /* preserve the useful fallback */ }
    return new StorageError(message, "WASM_STORAGE");
  }

  _path(path) {
    let value = String(path ?? "").replaceAll("\\", "/");
    // Reject traversal components before normalizing separators.  Lexically
    // retaining `..` would otherwise still appear to be under the mount
    // prefix (for example `/tomcat/../../outside`).
    if (value.split("/").some((part) => part === "..")) {
      throw new StorageError(`Path escapes storage mount: ${path}`, "PATH_ESCAPE");
    }
    if (!value.startsWith("/")) value = `${this.mountPath}/${value}`;
    value = `/${value.split("/").filter(Boolean).join("/")}`;
    if (value !== this.mountPath && !value.startsWith(`${this.mountPath}/`)) {
      throw new StorageError(`Path escapes storage mount: ${path}`, "PATH_ESCAPE");
    }
    return value;
  }

  /** Resolve a relative or absolute virtual path under the configured mount. */
  path(value) { return this._path(value); }

  _projectId(id) { return safeSegment(id, "project id"); }
  _sceneId(id) {
    let scene = String(id ?? "");
    if (scene.endsWith(".tomcat")) scene = scene.slice(0, -7);
    return safeFileSegment(scene, "scene id");
  }

  projectPath(id) {
    return `${this.mountPath}/projects/${this._projectId(id)}/Project.tcproj`;
  }

  scenePath(projectId, sceneId) {
    return `${this.mountPath}/projects/${this._projectId(projectId)}/Assets/${this._sceneId(sceneId)}.tomcat`;
  }

  _fallbackKey(path) { return `${this.dbName}:file:${path}`; }

  _fallbackPersist() {
    if (!this.localStorage) return;
    // Remove entries deleted since the previous flush.  Without this cleanup
    // a project removed from the in-memory map would reappear on the next
    // browser load because localStorage retained its old blob.
    const prefix = `${this.dbName}:file:`;
    const stale = [];
    for (let index = 0; index < this.localStorage.length; index += 1) {
      const key = this.localStorage.key(index);
      if (key?.startsWith(prefix) && !this.files.has(key.slice(prefix.length))) stale.push(key);
    }
    stale.forEach((key) => this.localStorage.removeItem(key));
    for (const [path, bytes] of this.files) {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = typeof btoa === "function"
        ? btoa(binary)
        : Buffer.from(binary, "binary").toString("base64");
      this.localStorage.setItem(this._fallbackKey(path), encoded);
    }
  }

  _fallbackRestore() {
    if (!this.localStorage) return;
    const prefix = `${this.dbName}:file:`;
    for (let index = 0; index < this.localStorage.length; index += 1) {
      const key = this.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const encoded = this.localStorage.getItem(key) || "";
      const binary = typeof atob === "function"
        ? atob(encoded)
        : Buffer.from(encoded, "base64").toString("binary");
      this.files.set(key.slice(prefix.length), Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    }
  }

  async mount({ populate = true } = {}) {
    if (this.mounted) return this;
    if (this.module) {
      const result = this._call("tc_web_storage_mount", "number", ["string"], [this.mountPath]);
      if (result !== 0) throw this._errorFromModule("Unable to mount IDBFS storage");
      this.mounted = true;
      if (populate) await this.sync(true);
    } else {
      this._fallbackRestore();
      this.mounted = true;
    }
    return this;
  }

  _ensureMounted() {
    if (!this.mounted) throw new StorageError("Storage is not mounted", "NOT_MOUNTED");
  }

  async sync(populate = false) {
    this._ensureMounted();
    if (!this.module) {
      if (populate) this._fallbackRestore();
      else this._fallbackPersist();
      return { populate: Boolean(populate), ok: true };
    }
    const result = this._call("tc_web_storage_sync", "number", ["number"], [populate ? 1 : 0]);
    if (result !== 0) throw this._errorFromModule("Unable to start IDBFS synchronization");
    const started = Date.now();
    while (this._call("tc_web_storage_sync_pending", "number", [], []) === 1) {
      if (Date.now() - started > this.timeoutMs) {
        throw new StorageError("Timed out waiting for IDBFS synchronization", "SYNC_TIMEOUT");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const ok = this._call("tc_web_storage_sync_last_ok", "number", [], []) === 1;
    if (!ok) throw this._errorFromModule("IDBFS synchronization failed");
    return { populate: Boolean(populate), ok: true };
  }

  exists(path) {
    this._ensureMounted();
    const normalized = this._path(path);
    if (this.module) return this._call("tc_web_storage_exists", "number", ["string"], [normalized]) === 1;
    // The fallback stores directory markers, but callers should observe the
    // same semantics as std::filesystem::exists (a directory exists when it
    // has a marker or any descendant file).
    if (normalized === this.mountPath || this.files.has(normalized)) return true;
    const prefix = `${normalized}/`;
    return [...this.files.keys()].some((key) => key.startsWith(prefix));
  }

  mkdir(path) {
    this._ensureMounted();
    const normalized = this._path(path);
    if (this.module) {
      const result = this._call("tc_web_storage_mkdir", "number", ["string"], [normalized]);
      if (result !== 0) throw this._errorFromModule("Unable to create storage directory");
      return;
    }
    // Directory entries are implicit in the fallback map.
    this.files.set(`${normalized}/.directory`, new Uint8Array());
  }

  remove(path) {
    this._ensureMounted();
    const normalized = this._path(path);
    if (normalized === this.mountPath) throw new StorageError("Cannot remove storage mount", "INVALID_PATH");
    if (this.module) {
      const result = this._call("tc_web_storage_remove", "number", ["string"], [normalized]);
      if (result < 0) throw this._errorFromModule("Unable to remove storage path");
      return result;
    }
    let removed = 0;
    for (const key of this.files.keys()) {
      if (key === normalized || key.startsWith(`${normalized}/`)) {
        this.files.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  list(path = "") {
    this._ensureMounted();
    const normalized = this._path(path || this.mountPath);
    if (this.module) {
      const json = this._call("tc_web_storage_list", "string", ["string"], [normalized]);
      if (json == null) throw this._errorFromModule("Unable to enumerate storage directory");
      try { return JSON.parse(json); }
      catch { throw new StorageError("Storage directory response is malformed", "INVALID_RESPONSE"); }
    }
    const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
    const entries = new Map();
    for (const [key, bytes] of this.files) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      const name = slash < 0 ? rest : rest.slice(0, slash);
      if (name === ".directory") continue;
      const directory = slash >= 0;
      entries.set(name, { name, directory, ...(directory ? {} : { size: bytes.byteLength }) });
    }
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(path) {
    this._ensureMounted();
    const normalized = this._path(path);
    if (this.module) {
      const size = this._call("tc_web_storage_size", "number", ["string"], [normalized]);
      if (size < 0) throw this._errorFromModule("Unable to stat storage file");
      const pointer = size > 0 && typeof this.module._malloc === "function" ? this.module._malloc(size) : 0;
      try {
        const result = this._call("tc_web_storage_read", "number", ["string", "number", "number"], [normalized, pointer, size]);
        if (result < 0) throw this._errorFromModule("Unable to read storage file");
        if (result === 0) return new Uint8Array();
        let heap = null;
        try { heap = this.module.HEAPU8; } catch (_) { heap = null; }
        if (!heap) throw new StorageError("WASM module does not expose HEAPU8", "INVALID_MODULE");
        return heap.slice(pointer, pointer + result);
      } finally {
        if (pointer && typeof this.module._free === "function") this.module._free(pointer);
      }
    }
    const bytes = this.files.get(normalized);
    if (!bytes) throw new StorageError(`File does not exist: ${normalized}`, "NOT_FOUND");
    return bytes.slice();
  }

  async readText(path) {
    this._ensureMounted();
    const normalized = this._path(path);
    if (this.module) {
      const text = this._call("tc_web_storage_read_text", "string", ["string"], [normalized]);
      if (text == null) throw this._errorFromModule("Unable to read storage text");
      return text;
    }
    return asText(await this.read(normalized));
  }

  async write(path, data) {
    this._ensureMounted();
    const normalized = this._path(path);
    const bytes = asBytes(data);
    if (this.module) {
      if (bytes.byteLength === 0) {
        const result = this._call("tc_web_storage_write", "number", ["string", "number", "number"], [normalized, 0, 0]);
        if (result !== 0) throw this._errorFromModule("Unable to write storage file");
        return;
      }
      if (typeof this.module._malloc !== "function") {
        throw new StorageError("WASM module does not expose memory helpers", "INVALID_MODULE");
      }
      const pointer = this.module._malloc(bytes.byteLength);
      try {
        if (typeof this.module.writeArrayToMemory === "function") this.module.writeArrayToMemory(bytes, pointer);
        else {
          let heap = null;
          try { heap = this.module.HEAPU8; } catch (_) { heap = null; }
          if (!heap) throw new StorageError("WASM module does not expose memory helpers", "INVALID_MODULE");
          heap.set(bytes, pointer);
        }
        const result = this._call("tc_web_storage_write", "number", ["string", "number", "number"], [normalized, pointer, bytes.byteLength]);
        if (result !== 0) throw this._errorFromModule("Unable to write storage file");
      } finally {
        this.module._free?.(pointer);
      }
      return;
    }
    this.files.set(normalized, bytes.slice());
  }

  async writeText(path, text) {
    this._ensureMounted();
    const normalized = this._path(path);
    text = String(text ?? "");
    if (this.module) {
      const result = this._call("tc_web_storage_write_text", "number", ["string", "string"], [normalized, text]);
      if (result !== 0) throw this._errorFromModule("Unable to write storage text");
      return;
    }
    return this.write(normalized, text);
  }

  async createProject({ id, name, template = "2D", description = "", editorVersion = "web" } = {}) {
    const projectId = this._projectId(id);
    const projectName = String(name || projectId);
    this._ensureMounted();
    if (this.module) {
      const result = this._call("tc_web_project_create", "number", ["string", "string", "string"], [projectId, projectName, String(template || "2D")]);
      if (result !== 0) throw this._errorFromModule("Unable to create project");
    } else {
      if (this.exists(this.projectPath(projectId))) throw new StorageError("Project already exists", "ALREADY_EXISTS");
      await this.writeText(this.projectPath(projectId), projectYaml({ name: projectName, template, description, editorVersion }));
      this.mkdir(`${this.mountPath}/projects/${projectId}/Assets`);
    }
    return { id: projectId, name: projectName, template: String(template || "2D") };
  }

  async saveProject(id, yaml) {
    const projectId = this._projectId(id);
    this._ensureMounted();
    if (this.module) {
      const result = this._call("tc_web_project_save", "number", ["string", "string"], [projectId, String(yaml ?? "")]);
      if (result !== 0) throw this._errorFromModule("Unable to save project");
    } else await this.writeText(this.projectPath(projectId), yaml);
    return { id: projectId };
  }

  async loadProject(id) {
    const projectId = this._projectId(id);
    this._ensureMounted();
    if (this.module) {
      const yaml = this._call("tc_web_project_load", "string", ["string"], [projectId]);
      if (yaml == null) throw this._errorFromModule("Unable to load project");
      return yaml;
    }
    return this.readText(this.projectPath(projectId));
  }

  async removeProject(id) {
    const projectId = this._projectId(id);
    this._ensureMounted();
    if (this.module) {
      const result = this._call("tc_web_project_remove", "number", ["string"], [projectId]);
      if (result < 0) throw this._errorFromModule("Unable to remove project");
      return result;
    }
    return this.remove(`${this.mountPath}/projects/${projectId}`);
  }

  async saveScene(projectId, sceneId, yaml) {
    const project = this._projectId(projectId);
    const scene = this._sceneId(sceneId);
    this._ensureMounted();
    if (this.module) {
      const result = this._call("tc_web_scene_save", "number", ["string", "string", "string"], [project, scene, String(yaml ?? "")]);
      if (result !== 0) throw this._errorFromModule("Unable to save scene");
    } else await this.writeText(this.scenePath(project, scene), yaml);
    return { project, scene };
  }

  async loadScene(projectId, sceneId) {
    const project = this._projectId(projectId);
    const scene = this._sceneId(sceneId);
    this._ensureMounted();
    if (this.module) {
      const yaml = this._call("tc_web_scene_load", "string", ["string", "string"], [project, scene]);
      if (yaml == null) throw this._errorFromModule("Unable to load scene");
      return yaml;
    }
    return this.readText(this.scenePath(project, scene));
  }

  async removeScene(projectId, sceneId) {
    const project = this._projectId(projectId);
    const scene = this._sceneId(sceneId);
    this._ensureMounted();
    if (this.module) {
      const result = this._call("tc_web_scene_remove", "number", ["string", "string"], [project, scene]);
      if (result < 0) throw this._errorFromModule("Unable to remove scene");
      return result;
    }
    return this.remove(this.scenePath(project, scene));
  }

  /** Register project/scene/storage commands on the legacy browser bridge. */
  installBridge(bridge = this.bridge || globalThis.TomCatBridge) {
    if (!bridge || typeof bridge.register !== "function") return () => {};
    const handlers = {
      "storage.mount": (payload = {}) => this.mount(payload).then(() => ({ ok: true, path: this.mountPath })),
      "storage.sync": (payload = {}) => this.sync(Boolean(payload.populate)).then((result) => ({ ok: true, ...result })),
      "storage.list": (payload = {}) => ({ ok: true, entries: this.list(payload.path || "") }),
      "project.create": (payload = {}) => this.createProject(payload).then((project) => ({ ok: true, project })),
      "project.save": (payload = {}) => this.saveProject(payload.id ?? payload.projectId, payload.yaml ?? payload.data ?? "").then((project) => ({ ok: true, project })),
      "project.open": (payload = {}) => this.loadProject(payload.id ?? payload.projectId).then((yaml) => ({ ok: true, id: payload.id ?? payload.projectId, yaml })),
      "project.remove": (payload = {}) => this.removeProject(payload.id ?? payload.projectId).then((removed) => ({ ok: true, removed })),
      // Accept both the concise bridge vocabulary (project/scene) and the
      // explicit IDs emitted by the Editor page (projectId/sceneId).
      "scene.save": (payload = {}) => this.saveScene(payload.project ?? payload.projectId, payload.scene ?? payload.sceneId, payload.yaml ?? payload.data ?? "").then((scene) => ({ ok: true, scene })),
      "scene.open": (payload = {}) => this.loadScene(payload.project ?? payload.projectId, payload.scene ?? payload.sceneId).then((yaml) => ({ ok: true, project: payload.project ?? payload.projectId, scene: payload.scene ?? payload.sceneId, yaml })),
      "scene.remove": (payload = {}) => this.removeScene(payload.project ?? payload.projectId, payload.scene ?? payload.sceneId).then((removed) => ({ ok: true, removed })),
    };
    const unregister = Object.entries(handlers).map(([name, handler]) => bridge.register(name, handler));
    return () => unregister.forEach((dispose) => typeof dispose === "function" && dispose());
  }
}
