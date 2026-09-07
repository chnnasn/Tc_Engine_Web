// @ts-nocheck
/*
 * Browser build of the TomCat project storage adapter.
 *
 * Include this after shared/bridge.js.  The module-aware implementation lives
 * in bridge/tomcat-storage.mjs; this UMD-shaped copy keeps the static Hub and
 * Editor pages dependency-free while exposing the same command names.
 */
(function (global) {
  "use strict";

  class StorageError extends Error {
    constructor(message, code) { super(message); this.name = "StorageError"; this.code = code || "STORAGE_ERROR"; }
  }

  function segment(value, label) {
    var result = String(value == null ? "" : value);
    if (!result || result === "." || result === ".." || !/^[A-Za-z0-9_.-]+$/.test(result)) {
      throw new StorageError("Invalid " + (label || "path") + ": " + result, "INVALID_SEGMENT");
    }
    return result;
  }

  function fileSegment(value, label) {
    var result = String(value == null ? "" : value);
    if (!result || result === "." || result === ".." || /[\\/\u0000-\u001f]/.test(result)) {
      throw new StorageError("Invalid " + (label || "file name") + ": " + result, "INVALID_SEGMENT");
    }
    return result;
  }

  function mountName(value) {
    var result = String(value || "/tomcat").replace(/\\/g, "/");
    if (result.charAt(0) !== "/" || result.indexOf("/../") >= 0 || /\/\.\.$/.test(result)) {
      throw new StorageError("mountPath must be absolute", "INVALID_MOUNT");
    }
    result = "/" + result.split("/").filter(Boolean).join("/");
    return result === "/" ? "/tomcat" : result;
  }

  function quote(value) {
    return '"' + String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function yamlFor(project) {
    project = project || {};
    return [
      "Project:",
      "  Name: " + quote(project.name),
      "  Version: \"1.0.0\"",
      "  Description: " + quote(project.description || ""),
      "  EditorVersion: " + quote(project.editorVersion || "web"),
      "  Template: " + quote(project.template || "2D"),
      "  AssetDirectory: \"Assets\"",
      "  TwoColumnCurrentFolder: \"\"",
      "  ExpandedNodes: []",
      "  LastOperationTime: \"\"",
      "",
    ].join("\n");
  }

  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new TextEncoder().encode(String(value == null ? "" : value));
  }

  class TomCatStorage {
    constructor(options) {
      options = options || {};
      this.module = options.module || null;
      this.mountPath = mountName(options.mountPath || "/tomcat");
      // IDBFS keys its database by mount point; dbName namespaces only the
      // localStorage fallback used before a WASM module is attached.
      this.dbName = String(options.dbName || "tomcat-engine");
      this.timeoutMs = Math.max(250, Number(options.timeoutMs) || 10000);
      this.localStorage = options.localStorage === undefined ? (function () { try { return global.localStorage || null; } catch (_) { return null; } }()) : options.localStorage;
      this.files = new Map();
      this.mounted = false;
      this.bridge = null;
    }
    attachModule(module) { this.module = module || null; return this; }
    attachBridge(bridge) { this.bridge = bridge || null; return this; }
    call(name, returnType, argTypes, args) {
      if (!this.module || typeof this.module.ccall !== "function") return undefined;
      try { return this.module.ccall(name, returnType, argTypes || [], args || []); }
      catch (error) { throw new StorageError(error.message || ("WASM call failed: " + name), "WASM_CALL"); }
    }
    moduleError(message) {
      var detail = message;
      try { detail = this.call("tc_web_storage_last_error", "string", [], []) || detail; } catch (_) {}
      return new StorageError(detail, "WASM_STORAGE");
    }
    path(path) {
      var result = String(path == null ? "" : path).replace(/\\/g, "/");
      // Check traversal components before collapsing separators; otherwise
      // `/tomcat/../../outside` would pass a simple mount-prefix check.
      if (result.split("/").some(function (part) { return part === ".."; })) throw new StorageError("Path escapes storage mount", "PATH_ESCAPE");
      if (result.charAt(0) !== "/") result = this.mountPath + "/" + result;
      result = "/" + result.split("/").filter(Boolean).join("/");
      if (result !== this.mountPath && result.indexOf(this.mountPath + "/") !== 0) throw new StorageError("Path escapes storage mount", "PATH_ESCAPE");
      return result;
    }
    projectId(id) { return segment(id, "project id"); }
    sceneId(id) { var value = String(id == null ? "" : id); if (value.slice(-7) === ".tomcat") value = value.slice(0, -7); return fileSegment(value, "scene id"); }
    projectPath(id) { return this.mountPath + "/projects/" + this.projectId(id) + "/Project.tcproj"; }
    scenePath(project, scene) { return this.mountPath + "/projects/" + this.projectId(project) + "/Assets/" + this.sceneId(scene) + ".tomcat"; }
    key(path) { return this.dbName + ":file:" + path; }
    restore() {
      if (!this.localStorage) return;
      var prefix = this.dbName + ":file:";
      for (var i = 0; i < this.localStorage.length; i += 1) {
        var key = this.localStorage.key(i);
        if (!key || key.indexOf(prefix) !== 0) continue;
        var raw = this.localStorage.getItem(key) || "";
        var binary = atob(raw);
        this.files.set(key.slice(prefix.length), Uint8Array.from(binary, function (ch) { return ch.charCodeAt(0); }));
      }
    }
    persist() {
      if (!this.localStorage) return;
      var prefix = this.dbName + ":file:";
      var stale = [];
      for (var index = 0; index < this.localStorage.length; index += 1) {
        var oldKey = this.localStorage.key(index);
        if (oldKey && oldKey.indexOf(prefix) === 0 && !this.files.has(oldKey.slice(prefix.length))) stale.push(oldKey);
      }
      stale.forEach(function (oldKey) { this.localStorage.removeItem(oldKey); }, this);
      this.files.forEach(function (value, path) {
        var binary = "";
        value.forEach(function (byte) { binary += String.fromCharCode(byte); });
        this.localStorage.setItem(this.key(path), btoa(binary));
      }, this);
    }
    async mount(options) {
      options = options || {};
      if (this.mounted) return this;
      if (this.module) {
        if (this.call("tc_web_storage_mount", "number", ["string"], [this.mountPath]) !== 0) throw this.moduleError("Unable to mount IDBFS storage");
        this.mounted = true;
        if (options.populate !== false) await this.sync(true);
      } else { this.restore(); this.mounted = true; }
      return this;
    }
    ensure() { if (!this.mounted) throw new StorageError("Storage is not mounted", "NOT_MOUNTED"); }
    async sync(populate) {
      this.ensure();
      populate = !!populate;
      if (!this.module) { if (populate) this.restore(); else this.persist(); return { populate: populate, ok: true }; }
      if (this.call("tc_web_storage_sync", "number", ["number"], [populate ? 1 : 0]) !== 0) throw this.moduleError("Unable to start IDBFS synchronization");
      var started = Date.now();
      while (this.call("tc_web_storage_sync_pending", "number", [], []) === 1) {
        if (Date.now() - started > this.timeoutMs) throw new StorageError("Timed out waiting for IDBFS synchronization", "SYNC_TIMEOUT");
        await new Promise(function (resolve) { setTimeout(resolve, 10); });
      }
      if (this.call("tc_web_storage_sync_last_ok", "number", [], []) !== 1) throw this.moduleError("IDBFS synchronization failed");
      return { populate: populate, ok: true };
    }
    exists(path) {
      this.ensure(); path = this.path(path);
      if (this.module) return this.call("tc_web_storage_exists", "number", ["string"], [path]) === 1;
      if (path === this.mountPath || this.files.has(path)) return true;
      var prefix = path + "/";
      for (var key of this.files.keys()) if (key.indexOf(prefix) === 0) return true;
      return false;
    }
    mkdir(path) {
      this.ensure(); path = this.path(path);
      if (this.module) {
        if (this.call("tc_web_storage_mkdir", "number", ["string"], [path]) !== 0) throw this.moduleError("Unable to create storage directory");
        return;
      }
      this.files.set(path + "/.directory", new Uint8Array());
    }
    remove(path) {
      this.ensure(); path = this.path(path);
      if (path === this.mountPath) throw new StorageError("Cannot remove storage mount", "INVALID_PATH");
      if (this.module) {
        var result = this.call("tc_web_storage_remove", "number", ["string"], [path]);
        if (result < 0) throw this.moduleError("Unable to remove storage path");
        return result;
      }
      var removed = 0, prefix = path + "/";
      Array.from(this.files.keys()).forEach(function (key) {
        if (key === path || key.indexOf(prefix) === 0) { this.files.delete(key); removed += 1; }
      }, this);
      return removed;
    }
    list(path) {
      this.ensure(); path = this.path(path || this.mountPath);
      if (this.module) {
        var json = this.call("tc_web_storage_list", "string", ["string"], [path]);
        if (json == null) throw this.moduleError("Unable to enumerate storage directory");
        try { return JSON.parse(json); } catch (_) { throw new StorageError("Storage directory response is malformed", "INVALID_RESPONSE"); }
      }
      var prefix = path.slice(-1) === "/" ? path : path + "/", entries = new Map();
      this.files.forEach(function (value, key) {
        if (key.indexOf(prefix) !== 0) return;
        var rest = key.slice(prefix.length); if (!rest) return;
        var slash = rest.indexOf("/"), name = slash < 0 ? rest : rest.slice(0, slash);
        if (name === ".directory") return;
        var directory = slash >= 0;
        entries.set(name, directory ? { name: name, directory: true } : { name: name, directory: false, size: value.byteLength });
      });
      return Array.from(entries.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    async read(path) {
      this.ensure(); path = this.path(path);
      if (this.module) {
        var size = this.call("tc_web_storage_size", "number", ["string"], [path]);
        if (!Number.isInteger(size) || size < 0) throw this.moduleError("Unable to stat storage file");
        var pointer = size > 0 && typeof this.module._malloc === "function" ? this.module._malloc(size) : 0;
        try {
          var result = this.call("tc_web_storage_read", "number", ["string", "number", "number"], [path, pointer, size]);
          if (!Number.isInteger(result) || result < 0) throw this.moduleError("Unable to read storage file");
          if (result === 0) return new Uint8Array();
          var heap = null;
          if (typeof this.module.readArrayFromMemory === "function") return Uint8Array.from(this.module.readArrayFromMemory(result, pointer));
          try { heap = this.module.HEAPU8; } catch (_) { heap = null; }
          if (!heap) throw new StorageError("WASM memory helpers unavailable", "INVALID_MODULE");
          return heap.slice(pointer, pointer + result);
        } finally { if (pointer && typeof this.module._free === "function") this.module._free(pointer); }
      }
      var file = this.files.get(path);
      if (!file) throw new StorageError("File does not exist: " + path, "NOT_FOUND");
      return file.slice();
    }
    async readText(path) {
      this.ensure(); path = this.path(path);
      if (this.module) {
        var value = this.call("tc_web_storage_read_text", "string", ["string"], [path]);
        if (value == null) throw this.moduleError("Unable to read storage text");
        return value;
      }
      var file = this.files.get(path);
      if (!file) throw new StorageError("File does not exist: " + path, "NOT_FOUND");
      return new TextDecoder().decode(file);
    }
    async write(path, value) {
      this.ensure(); path = this.path(path); var data = bytes(value);
      if (this.module) {
        if (!data.byteLength) {
          if (this.call("tc_web_storage_write", "number", ["string", "number", "number"], [path, 0, 0]) !== 0) throw this.moduleError("Unable to write storage file");
          return;
        }
        if (typeof this.module._malloc !== "function") throw new StorageError("WASM memory helpers unavailable", "INVALID_MODULE");
        var pointer = this.module._malloc(data.byteLength);
        try {
          if (typeof this.module.writeArrayToMemory === "function") this.module.writeArrayToMemory(data, pointer);
          else {
            var heap = null;
            try { heap = this.module.HEAPU8; } catch (_) { heap = null; }
            if (!heap) throw new StorageError("WASM memory helpers unavailable", "INVALID_MODULE");
            heap.set(data, pointer);
          }
          if (this.call("tc_web_storage_write", "number", ["string", "number", "number"], [path, pointer, data.byteLength]) !== 0) throw this.moduleError("Unable to write storage file");
        }
        finally { this.module._free && this.module._free(pointer); }
      } else this.files.set(path, data.slice());
    }
    async writeText(path, value) {
      this.ensure(); path = this.path(path); value = String(value == null ? "" : value);
      if (this.module) {
        if (this.call("tc_web_storage_write_text", "number", ["string", "string"], [path, value]) !== 0) throw this.moduleError("Unable to write storage text");
        return;
      }
      return this.write(path, value);
    }
    async createProject(project) {
      project = project || {}; var id = this.projectId(project.id), name = String(project.name || id); this.ensure();
      if (this.module) { if (this.call("tc_web_project_create", "number", ["string", "string", "string"], [id, name, String(project.template || "2D")]) !== 0) throw this.moduleError("Unable to create project"); }
      else { if (this.exists(this.projectPath(id))) throw new StorageError("Project already exists", "ALREADY_EXISTS"); await this.writeText(this.projectPath(id), yamlFor({ name: name, template: project.template, description: project.description, editorVersion: project.editorVersion })); this.files.set(this.path(this.mountPath + "/projects/" + id + "/Assets/.directory"), new Uint8Array()); }
      return { id: id, name: name, template: String(project.template || "2D") };
    }
    async saveProject(id, yaml) {
      id = this.projectId(id); this.ensure(); yaml = String(yaml == null ? "" : yaml);
      if (this.module) {
        if (this.call("tc_web_project_save", "number", ["string", "string"], [id, yaml]) !== 0) throw this.moduleError("Unable to save project");
      } else await this.writeText(this.projectPath(id), yaml);
      return { id: id };
    }
    async loadProject(id) { id = this.projectId(id); this.ensure(); if (this.module) { var yaml = this.call("tc_web_project_load", "string", ["string"], [id]); if (yaml == null) throw this.moduleError("Unable to load project"); return yaml; } return this.readText(this.projectPath(id)); }
    async removeProject(id) { id = this.projectId(id); this.ensure(); if (this.module) { var result = this.call("tc_web_project_remove", "number", ["string"], [id]); if (result < 0) throw this.moduleError("Unable to remove project"); return result; } return this.remove(this.mountPath + "/projects/" + id); }
    async saveScene(project, scene, yaml) {
      project = this.projectId(project); scene = this.sceneId(scene); this.ensure(); yaml = String(yaml == null ? "" : yaml);
      if (this.module) {
        if (this.call("tc_web_scene_save", "number", ["string", "string", "string"], [project, scene, yaml]) !== 0) throw this.moduleError("Unable to save scene");
      } else await this.writeText(this.scenePath(project, scene), yaml);
      return { project: project, scene: scene };
    }
    async loadScene(project, scene) { project = this.projectId(project); scene = this.sceneId(scene); this.ensure(); if (this.module) { var yaml = this.call("tc_web_scene_load", "string", ["string", "string"], [project, scene]); if (yaml == null) throw this.moduleError("Unable to load scene"); return yaml; } return this.readText(this.scenePath(project, scene)); }
    async removeScene(project, scene) { project = this.projectId(project); scene = this.sceneId(scene); this.ensure(); if (this.module) { var result = this.call("tc_web_scene_remove", "number", ["string", "string"], [project, scene]); if (result < 0) throw this.moduleError("Unable to remove scene"); return result; } return this.remove(this.scenePath(project, scene)); }
    installBridge(bridge) {
      bridge = bridge || this.bridge || global.TomCatBridge; if (!bridge || typeof bridge.register !== "function") return function () {};
      var self = this, handlers = {
        "storage.mount": function (p) { return self.mount(p).then(function () { return { ok: true, path: self.mountPath }; }); },
        "storage.sync": function (p) { return self.sync(p && p.populate).then(function (r) { return Object.assign({ ok: true }, r); }); },
        "storage.list": function (p) { return { ok: true, entries: self.list(p && p.path || "") }; },
        "project.create": function (p) { return self.createProject(p).then(function (r) { return { ok: true, project: r }; }); },
        "project.save": function (p) { return self.saveProject(p.id || p.projectId, p.yaml || p.data || "").then(function (r) { return { ok: true, project: r }; }); },
        "project.open": function (p) { return self.loadProject(p.id || p.projectId).then(function (yaml) { return { ok: true, id: p.id || p.projectId, yaml: yaml }; }); },
        "project.remove": function (p) { return self.removeProject(p.id || p.projectId).then(function (r) { return { ok: true, removed: r }; }); },
        "scene.save": function (p) { var project = p.project || p.projectId, scene = p.scene || p.sceneId; return self.saveScene(project, scene, p.yaml || p.data || "").then(function (r) { return { ok: true, scene: r }; }); },
        "scene.open": function (p) { var project = p.project || p.projectId, scene = p.scene || p.sceneId; return self.loadScene(project, scene).then(function (yaml) { return { ok: true, project: project, scene: scene, yaml: yaml }; }); },
        "scene.remove": function (p) { var project = p.project || p.projectId, scene = p.scene || p.sceneId; return self.removeScene(project, scene).then(function (r) { return { ok: true, removed: r }; }); },
      };
      var unregister = Object.keys(handlers).map(function (name) { return bridge.register(name, handlers[name]); });
      return function () { unregister.forEach(function (dispose) { if (typeof dispose === "function") dispose(); }); };
    }
  }

  global.TomCatStorage = TomCatStorage;
  global.TomCatStorageError = StorageError;
}(typeof window !== "undefined" ? window : self));
