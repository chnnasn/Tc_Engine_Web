/*
 * Small host-side project store used by Hub and Editor.
 *
 * The desktop editor owns the canonical project format.  In a browser we keep
 * the same concepts (projects, scenes, entities and assets) in localStorage so
 * the UI remains useful before a cloud API/IDBFS adapter is connected.  The
 * public methods are intentionally synchronous and serialisable; a future
 * adapter can replace this object without changing the pages.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "tomcat.platform.v1";
  const LEGACY_KEY = "tomcat.projects";

  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const isoNow = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const entity = (name, type, x, y, scale = 1, extra = {}) => ({
    id: uid("entity"), name, type, visible: true,
    transform: { x, y, rotation: 0, scale },
    components: type === "Camera" ? ["Transform", "Camera"] : ["Transform", "SpriteRenderer"],
    ...extra,
  });

  const scene = (name, entities) => ({ id: uid("scene"), name, modified: isoNow(), entities });

  const seed = [
    {
      id: "p1", name: "星际农场", template: "2D 空项目", description: "从一个可运行的 2D 场景开始。",
      color: "", status: "ready", created: isoNow(), updated: isoNow(), assets: [
        { id: "a1", name: "MainScene.tomcat", type: "场景", kind: "scene", size: 18_432, status: "已同步", path: "Scenes/MainScene.tomcat" },
        { id: "a2", name: "player.png", type: "纹理", kind: "texture", size: 72_104, status: "已同步", path: "Textures/player.png" },
        { id: "a3", name: "PlayerController.lua", type: "脚本", kind: "script", size: 4_812, status: "本地", path: "Scripts/PlayerController.lua" },
      ],
      scenes: [scene("MainScene", [
        entity("Main Camera", "Camera", 0, 0, 1),
        entity("Ground", "Sprite", 0, -2, 8, { components: ["Transform", "SpriteRenderer", "BoxCollider2D"] }),
        entity("Player", "Sprite", 0, 0, .5, { components: ["Transform", "SpriteRenderer", "Rigidbody2D", "BoxCollider2D"] }),
        entity("DirectionalLight", "Light", 0, 0, 1, { components: ["Transform", "Light"] }),
      ])],
      activity: [{ text: "创建了项目", time: "刚刚", icon: "＋" }],
    },
    {
      id: "p2", name: "霓虹街区", template: "平台跳跃", description: "平台、角色和碰撞器已经就位。",
      color: "green", status: "ready", created: isoNow(), updated: isoNow(), assets: [
        { id: "a4", name: "Level01.tomcat", type: "场景", kind: "scene", size: 27_011, status: "已同步", path: "Scenes/Level01.tomcat" },
        { id: "a5", name: "tileset.png", type: "纹理", kind: "texture", size: 235_412, status: "已同步", path: "Textures/tileset.png" },
        { id: "a6", name: "PlayerController.lua", type: "脚本", kind: "script", size: 7_201, status: "本地", path: "Scripts/PlayerController.lua" },
      ],
      scenes: [scene("Level01", [entity("Main Camera", "Camera", 0, 0), entity("Player", "Sprite", -1, 0, .65), entity("Platforms", "Sprite", 0, -2, 5)])],
      activity: [{ text: "导入了 3 个资源", time: "昨天", icon: "↥" }],
    },
    {
      id: "p3", name: "纸片人冒险", template: "俯视角冒险", description: "俯视角关卡原型。",
      color: "orange", status: "ready", created: isoNow(), updated: isoNow(), assets: [
        { id: "a7", name: "World.tomcat", type: "场景", kind: "scene", size: 31_552, status: "已同步", path: "Scenes/World.tomcat" },
        { id: "a8", name: "hero.png", type: "纹理", kind: "texture", size: 88_109, status: "已同步", path: "Textures/hero.png" },
      ],
      scenes: [scene("World", [entity("Main Camera", "Camera", 0, 0), entity("Hero", "Sprite", 0, 0, .75), entity("Point Light", "Light", 1, 1)])],
      activity: [{ text: "打开了场景 World", time: "3 天前", icon: "▣" }],
    },
  ];

  function asProject(input) {
    const p = { ...input };
    p.id = p.id || uid("project");
    p.name = String(p.name || "Untitled Project").trim() || "Untitled Project";
    p.template = p.template || "2D 空项目";
    p.description = p.description || "";
    p.color = p.color || "";
    p.status = p.status || "ready";
    p.created = p.created || isoNow();
    p.updated = p.updated || p.created;
    p.assets = Array.isArray(p.assets) ? p.assets.map((a) => ({
      id: a.id || uid("asset"), name: a.name || "Untitled", type: a.type || typeFor(a.name),
      kind: a.kind || kindFor(a.name), size: Number(a.size) || 0, status: a.status || "本地",
      path: a.path || `Assets/${a.name || "Untitled"}`,
    })) : [];
    p.scenes = Array.isArray(p.scenes) && p.scenes.length ? p.scenes.map((s) => ({
      id: s.id || uid("scene"), name: s.name || "MainScene", modified: s.modified || p.updated,
      entities: Array.isArray(s.entities) ? s.entities.map((e) => ({
        id: e.id || uid("entity"), name: e.name || "Entity", type: e.type || "Sprite", visible: e.visible !== false,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, ...(e.transform || {}) },
        components: Array.isArray(e.components) ? e.components : ["Transform"],
      })) : [],
    })) : [scene("MainScene", [entity("Main Camera", "Camera", 0, 0), entity("Player", "Sprite", 0, 0, .5)])];
    p.activity = Array.isArray(p.activity) ? p.activity : [];
    return p;
  }

  function typeFor(name) {
    const ext = String(name || "").toLowerCase().split(".").pop();
    if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "纹理";
    if (["lua", "js", "ts", "cpp", "h"].includes(ext)) return "脚本";
    if (["tomcat", "tcproj", "scene"].includes(ext)) return "场景";
    if (["wav", "mp3", "ogg"].includes(ext)) return "音频";
    return "文件";
  }

  function kindFor(name) {
    const t = typeFor(name);
    return t === "纹理" ? "texture" : t === "脚本" ? "script" : t === "场景" ? "scene" : t === "音频" ? "audio" : "file";
  }

  function read() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(current) && current.length) return current.map(asProject);
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (Array.isArray(legacy) && legacy.length) return legacy.map((p) => {
        const count = Number(p.assets) || 0;
        const assets = Array.isArray(p.assets) ? p.assets : Array.from({ length: count }, (_, index) => ({ name: `Asset_${index + 1}`, type: "文件", kind: "file", status: "本地" }));
        return asProject({ ...p, assets });
      });
    } catch (_) { /* reset malformed browser data below */ }
    return clone(seed).map(asProject);
  }

  let projects = read();
  const listeners = new Set();
  const notify = (type, payload) => {
    const event = { type, payload: payload || {}, time: isoNow() };
    listeners.forEach((fn) => fn(event));
    global.dispatchEvent?.(new CustomEvent("tomcat:platform", { detail: event }));
    return event;
  };
  const persist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    // Keep the old key readable by older builds and integrations.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(projects.map((p) => ({ ...p, assets: p.assets.length }))));
  };
  persist();

  const api = {
    uid, typeFor, kindFor,
    list() { return clone(projects); },
    get(idOrName) { return clone(projects.find((p) => p.id === idOrName || p.name === idOrName) || null); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    save() { persist(); notify("store.saved", {}); },
    create({ name, template, description = "" }) {
      const clean = String(name || "").trim();
      if (!clean) throw new Error("项目名称不能为空");
      if (projects.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new Error("项目名称已存在");
      const p = asProject({ id: uid("project"), name: clean, template, description, color: template === "平台跳跃" ? "green" : template === "俯视角冒险" ? "orange" : "", assets: [], scenes: [scene("MainScene", [entity("Main Camera", "Camera", 0, 0), entity("Player", "Sprite", 0, 0, .5)])], activity: [] });
      p.activity.unshift({ text: "创建了项目", time: "刚刚", icon: "＋" });
      projects.unshift(p); persist(); notify("project.created", { project: clone(p) }); return clone(p);
    },
    update(id, patch) {
      const index = projects.findIndex((p) => p.id === id); if (index < 0) return null;
      projects[index] = asProject({ ...projects[index], ...clone(patch), updated: isoNow() });
      persist(); notify("project.updated", { project: clone(projects[index]) }); return clone(projects[index]);
    },
    rename(id, name) {
      const clean = String(name || "").trim();
      if (!clean) throw new Error("项目名称不能为空");
      if (projects.some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) throw new Error("项目名称已存在");
      return this.update(id, { name: clean });
    },
    remove(id) {
      const p = projects.find((item) => item.id === id); if (!p) return false;
      projects = projects.filter((item) => item.id !== id); persist(); notify("project.deleted", { project: clone(p) }); return true;
    },
    duplicate(id) {
      const source = projects.find((item) => item.id === id); if (!source) return null;
      let name = `${source.name} 副本`; let n = 2;
      while (projects.some((p) => p.name === name)) name = `${source.name} 副本 ${n++}`;
      const copy = clone(source);
      copy.id = uid("project"); copy.name = name; copy.created = isoNow(); copy.updated = isoNow();
      copy.assets = copy.assets.map((asset) => ({ ...asset, id: uid("asset"), status: "本地" }));
      copy.scenes = copy.scenes.map((item) => ({ ...item, id: uid("scene"), entities: item.entities.map((e) => ({ ...e, id: uid("entity") })) }));
      copy.activity = [{ text: `复制自 ${source.name}`, time: "刚刚", icon: "⧉" }];
      projects.unshift(asProject(copy)); persist(); notify("project.created", { project: clone(copy) }); return clone(copy);
    },
    addAsset(id, file) {
      const p = projects.find((item) => item.id === id); if (!p) return null;
      const asset = { id: uid("asset"), name: file.name || "Untitled", type: file.typeLabel || typeFor(file.name), kind: file.kind || kindFor(file.name), size: Number(file.size) || 0, status: "本地", path: file.path || `Assets/${file.name || "Untitled"}` };
      p.assets.push(asset); p.updated = isoNow(); p.activity.unshift({ text: `导入了 ${asset.name}`, time: "刚刚", icon: "↥" }); p.activity = p.activity.slice(0, 12);
      persist(); notify("asset.imported", { project: clone(p), asset: clone(asset) }); return clone(asset);
    },
    removeAsset(projectId, assetId) {
      const p = projects.find((item) => item.id === projectId); if (!p) return false;
      const before = p.assets.length; p.assets = p.assets.filter((a) => a.id !== assetId); if (p.assets.length === before) return false;
      p.updated = isoNow(); persist(); notify("asset.deleted", { project: clone(p), assetId }); return true;
    },
    saveScene(projectId, sceneValue) {
      const p = projects.find((item) => item.id === projectId); if (!p) return null;
      const index = p.scenes.findIndex((s) => s.id === sceneValue.id); if (index < 0) p.scenes.push(clone(sceneValue)); else p.scenes[index] = clone(sceneValue);
      p.updated = isoNow(); p.activity.unshift({ text: `保存了场景 ${sceneValue.name}`, time: "刚刚", icon: "✓" }); p.activity = p.activity.slice(0, 12);
      persist(); notify("scene.saved", { project: clone(p), scene: clone(sceneValue) }); return clone(p);
    },
    createScene(projectId, name = "NewScene") {
      const p = projects.find((item) => item.id === projectId); if (!p) return null;
      let clean = String(name).trim() || "NewScene"; let n = 2; while (p.scenes.some((s) => s.name === clean)) clean = `${name}${n++}`;
      const s = scene(clean, [entity("Main Camera", "Camera", 0, 0)]); p.scenes.push(s); p.updated = isoNow(); persist(); notify("scene.created", { project: clone(p), scene: clone(s) }); return clone(s);
    },
  };

  global.TomCatStore = api;
})(window);
