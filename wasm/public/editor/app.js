(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const store = window.TomCatStore;
  const engineStorage = window.TomCatStorage ? new window.TomCatStorage({ module: window.Module || null }) : null;
  window.TomCatPlatformStorage = engineStorage;
  const params = new URLSearchParams(location.search);
  const requested = params.get("project") || localStorage.getItem("tomcat.lastProjectId") || localStorage.getItem("tomcat.lastProject");
  let project = store.get(requested) || store.list()[0];
  if (!project) project = store.create({ name: "Untitled Project", template: "2D 空项目" });
  localStorage.setItem("tomcat.lastProjectId", project.id); localStorage.setItem("tomcat.lastProject", project.name);

  const state = { sceneId: params.get("scene") || project.scenes[0]?.id, selectedId: null, viewport: "scene", tool: "select", runtime: "edit", paused: false, grid: true, dirty: false, frame: 0, runtimeEntities: null };
  let sceneModalMode = "create";
  let pendingSceneDelete = null;
  engineStorage?.mount().catch(() => {});
  let currentScene = project.scenes.find((s) => s.id === state.sceneId) || project.scenes[0]; state.sceneId = currentScene.id;
  const glyph = { Camera: "⌾", Sprite: "◇", Light: "☼", Empty: "○" };
  const iconFor = (asset) => ({ scene: "▣", texture: "▧", script: "▤", audio: "♫", file: "□" }[asset.kind] || "□");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function toast(message, error = false) {
    const item = document.createElement("div"); item.className = `toast ${error ? "error" : ""}`; item.innerHTML = `<span>${error ? "!" : "✓"}</span><span>${escapeHtml(message)}</span><button class="toast-close">×</button>`;
    $(".toast-close", item).onclick = () => item.remove(); $("#toastStack").appendChild(item); window.setTimeout(() => item.remove(), 3500);
  }
  function markDirty() { state.dirty = true; const node = $("#saveIndicator"); node.textContent = "● 有未保存修改"; node.classList.remove("ready"); }
  function markSaved(text = "● 已保存") { state.dirty = false; const node = $("#saveIndicator"); node.textContent = text; node.classList.add("ready"); }
  function activeEntities() { return state.runtime === "play" && state.runtimeEntities ? state.runtimeEntities : currentScene.entities; }
  function selectedEntity() { return activeEntities().find((entity) => entity.id === state.selectedId) || null; }

  function renderSceneSelect() {
    $("#sceneSelect").innerHTML = project.scenes.map((scene) => `<option value="${escapeHtml(scene.id)}">${escapeHtml(scene.name)}</option>`).join(""); $("#sceneSelect").value = currentScene.id; $("#sceneName").textContent = currentScene.name;
  }
  function renderTree() {
    const entities = currentScene.entities;
    $("#sceneTree").innerHTML = `<button class="scene-tree-row ${state.selectedId ? "" : "selected"}" data-tree-root="true"><span class="tree-chevron">▾</span><span class="entity-glyph">▣</span><span class="entity-name">${escapeHtml(currentScene.name)}</span></button><div class="scene-tree-child">${entities.length ? entities.map((entity) => `<div class="scene-tree-row-wrap"><button class="scene-tree-row ${entity.id === state.selectedId ? "selected" : ""}" data-tree-select="${escapeHtml(entity.id)}"><span class="tree-chevron">·</span><span class="entity-glyph">${glyph[entity.type] || "○"}</span><span class="entity-name">${escapeHtml(entity.name)}</span><span class="visibility" data-visibility="${escapeHtml(entity.id)}">${entity.visible ? "◉" : "⊘"}</span></button></div>`).join("") : `<div class="empty small">场景中暂无实体</div>`}</div>`;
  }
  function renderWorld() {
    const world = $("#sceneWorld"); world.innerHTML = `<span class="world-header" id="worldHeader">${escapeHtml(currentScene.name)} · ${state.runtime === "play" ? "PLAY MODE" : "EDIT MODE"}</span>`;
    const entities = activeEntities();
    entities.forEach((entity) => {
      const transform = entity.transform || {}; const x = Math.max(5, Math.min(95, 50 + Number(transform.x || 0) * 4)); const y = Math.max(8, Math.min(92, 52 - Number(transform.y || 0) * 6));
      const node = document.createElement("button"); node.className = `world-entity ${String(entity.type || "").toLowerCase()} ${entity.id === state.selectedId ? "selected" : ""}`; node.dataset.worldSelect = entity.id; node.style.left = `${x}%`; node.style.top = `${y}%`; node.style.display = entity.visible === false ? "none" : "block"; node.innerHTML = `<span>${escapeHtml(entity.name)}</span>`; world.appendChild(node);
    });
    const selected = selectedEntity(); const gizmo = $("#gizmoCross"); gizmo.hidden = !selected || state.viewport !== "scene" || state.tool === "select";
    if (selected) { const t = selected.transform || {}; gizmo.style.left = `${Math.max(5, Math.min(95, 50 + Number(t.x || 0) * 4))}%`; gizmo.style.top = `${Math.max(8, Math.min(92, 52 - Number(t.y || 0) * 6))}%`; }
    $("#viewportGrid").classList.toggle("game-mode", state.viewport === "game"); $("#viewportGrid").style.backgroundImage = state.grid && state.viewport === "scene" ? "linear-gradient(#172846 1px,transparent 1px),linear-gradient(90deg,#172846 1px,transparent 1px)" : "none";
    $("#worldHeader").textContent = `${currentScene.name} · ${state.runtime === "play" ? "PLAY MODE" : "EDIT MODE"}`;
    $("#viewportMode").textContent = state.viewport === "scene" ? "编辑器相机 · 正交" : state.runtime === "play" ? "运行时相机 · WebGL2" : "游戏视图 · 等待运行";
    $("#viewportHud").textContent = state.viewport === "scene" ? "WASD 移动相机 · 滚轮缩放" : state.runtime === "play" ? `FRAME ${state.frame} · ${state.paused ? "PAUSED" : "RUNNING"}` : "点击运行开始预览";
    $("#runtimeOverlay").hidden = !(state.viewport === "game" && state.runtime !== "play"); $("#runtimeOverlayTitle").textContent = state.runtime === "edit" ? "运行预览" : "已暂停"; $("#runtimeOverlayText").textContent = state.runtime === "edit" ? "点击顶部“运行”启动 WebAssembly 场景" : "点击暂停按钮继续运行";
  }

  function renderInspector() {
    const entity = selectedEntity();
    if (!entity) { $("#inspector").innerHTML = `<div class="inspector-empty">从层级面板选择一个实体<br>查看和编辑组件属性</div>`; return; }
    const t = entity.transform || (entity.transform = { x: 0, y: 0, rotation: 0, scale: 1 });
    const disabled = state.runtime === "play" ? "disabled" : "";
    $("#inspector").innerHTML = `<section class="inspector-section"><h3>Entity</h3><label class="property"><span>Name</span><input ${disabled} data-prop="name" value="${escapeHtml(entity.name)}"></label><label class="property"><span>Type</span><select ${disabled} data-prop="type"><option ${entity.type === "Sprite" ? "selected" : ""}>Sprite</option><option ${entity.type === "Camera" ? "selected" : ""}>Camera</option><option ${entity.type === "Light" ? "selected" : ""}>Light</option><option ${entity.type === "Empty" ? "selected" : ""}>Empty</option></select></label><label class="property"><span>Visible</span><input ${disabled} type="checkbox" data-prop="visible" ${entity.visible !== false ? "checked" : ""}></label></section><section class="inspector-section"><div class="component-title"><b>Transform</b><button ${disabled} data-reset-transform>Reset</button></div><label class="property"><span>Position X</span><input ${disabled} type="number" step="0.1" data-transform="x" value="${Number(t.x || 0)}"></label><label class="property"><span>Position Y</span><input ${disabled} type="number" step="0.1" data-transform="y" value="${Number(t.y || 0)}"></label><label class="property"><span>Rotation</span><input ${disabled} type="number" step="1" data-transform="rotation" value="${Number(t.rotation || 0)}"></label><label class="property"><span>Scale</span><input ${disabled} type="number" min="0.01" step="0.05" data-transform="scale" value="${Number(t.scale || 1)}"></label></section><section class="inspector-section"><div class="component-title"><b>Components</b><button ${disabled} data-add-component>＋</button></div>${(entity.components || ["Transform"]).map((component) => `<div class="muted" style="font-size:11px;padding:4px 0">▾ ${escapeHtml(component)}</div>`).join("")}</section><section class="inspector-section" style="display:flex;gap:7px"><button ${disabled} data-duplicate-entity style="flex:1">复制</button><button ${disabled} class="danger-button" data-delete-entity style="flex:1">删除</button></section>`;
  }
  function renderAssets() {
    const query = $("#assetSearch").value.trim().toLocaleLowerCase(); const assets = project.assets.filter((asset) => `${asset.name} ${asset.type}`.toLocaleLowerCase().includes(query));
    $("#assetCountLabel").textContent = `${project.assets.length} 个资源`; $("#contentGrid").innerHTML = `${assets.map((asset) => `<button class="content-item" data-asset-id="${escapeHtml(asset.id)}" title="${escapeHtml(asset.path || asset.name)}"><span class="file-icon ${escapeHtml(asset.kind)}">${iconFor(asset)}</span><small>${escapeHtml(asset.name)}</small><span class="muted" style="font-size:9px;margin-top:4px">${escapeHtml(asset.type)}</span></button>`).join("")}<button class="content-item import" id="inlineImport"><span class="file-icon">＋</span><small>导入资源</small></button>`;
  }
  function renderAll() { renderSceneSelect(); renderTree(); renderWorld(); renderInspector(); renderAssets(); $("#projectName").textContent = project.name; }

  function saveScene() {
    if (state.runtime === "play") stopRuntime();
    project = store.get(project.id) || project; const saved = store.saveScene(project.id, { ...currentScene, modified: new Date().toISOString() }); project = saved || store.get(project.id) || project; currentScene = project.scenes.find((s) => s.id === state.sceneId) || currentScene; renderAll(); markSaved("● 已保存"); toast(`场景 ${currentScene.name} 已保存`);
    try { TomCatBridge.send("scene.save", { projectId: project.id, sceneId: currentScene.id }); } catch (_) { /* optional bridge */ }
  }
  function selectEntity(id) { state.selectedId = id; renderTree(); renderWorld(); renderInspector(); }
  function addEntity(name, type) { const entity = { id: store.uid("entity"), name: name || "Entity", type: type || "Empty", visible: true, transform: { x: 0, y: 0, rotation: 0, scale: 1 }, components: type === "Camera" ? ["Transform", "Camera"] : type === "Sprite" ? ["Transform", "SpriteRenderer"] : ["Transform"] }; currentScene.entities.push(entity); state.selectedId = entity.id; markDirty(); renderTree(); renderWorld(); renderInspector(); toast(`已添加实体：${entity.name}`); try { TomCatBridge.send("scene.entity.create", { projectId: project.id, sceneId: currentScene.id, entity }); } catch (_) {} }
  function deleteSelected() { const entity = selectedEntity(); if (!entity || state.runtime === "play") return; currentScene.entities = currentScene.entities.filter((item) => item.id !== entity.id); state.selectedId = null; markDirty(); renderTree(); renderWorld(); renderInspector(); toast(`已删除实体：${entity.name}`); }
  function duplicateSelected() { const entity = selectedEntity(); if (!entity || state.runtime === "play") return; const copy = JSON.parse(JSON.stringify(entity)); copy.id = store.uid("entity"); copy.name = `${entity.name} Copy`; copy.transform.x = Number(copy.transform.x || 0) + 0.5; currentScene.entities.push(copy); state.selectedId = copy.id; markDirty(); renderTree(); renderWorld(); renderInspector(); }
  function stopRuntime(notify = true) { state.runtime = "edit"; state.paused = false; state.runtimeEntities = null; state.frame = 0; $("#run").textContent = "▶ 运行"; state.viewport = "scene"; $$('[data-viewport]').forEach((b) => b.classList.toggle("active", b.dataset.viewport === "scene")); renderWorld(); if (notify) { try { TomCatBridge.send("runtime.stop", { projectId: project.id, sceneId: currentScene.id }); } catch (_) {} } }
  function playRuntime() { if (state.dirty) saveScene(); state.runtimeEntities = JSON.parse(JSON.stringify(currentScene.entities)); state.runtime = "play"; state.paused = false; state.frame = 0; state.viewport = "game"; $("#run").textContent = "■ 停止"; $$('[data-viewport]').forEach((b) => b.classList.toggle("active", b.dataset.viewport === "game")); renderWorld(); toast("运行时已启动"); try { TomCatBridge.send("runtime.play", { projectId: project.id, sceneId: currentScene.id }); } catch (_) {} }
  function togglePause() { if (state.runtime !== "play") return playRuntime(); state.paused = !state.paused; renderWorld(); toast(state.paused ? "运行时已暂停" : "运行时继续"); try { TomCatBridge.send(state.paused ? "runtime.pause" : "runtime.resume", { projectId: project.id }); } catch (_) {} }
  function stepRuntime() { if (state.runtime !== "play") playRuntime(); state.paused = true; state.frame += 1; renderWorld(); toast(`已前进到第 ${state.frame} 帧`); try { TomCatBridge.send("runtime.step", { frame: state.frame }); } catch (_) {} }

  // Hierarchy and inspector events.
  $("#sceneTree").onclick = (event) => { const visibility = event.target.closest?.("[data-visibility]"); if (visibility) { const entity = currentScene.entities.find((item) => item.id === visibility.dataset.visibility); if (entity) { entity.visible = entity.visible === false; markDirty(); renderTree(); renderWorld(); } return; } const row = event.target.closest?.("[data-tree-select]"); if (row) selectEntity(row.dataset.treeSelect); else if (event.target.closest?.("[data-tree-root]")) { state.selectedId = null; renderTree(); renderWorld(); renderInspector(); } };
  $("#sceneWorld").onclick = (event) => { const node = event.target.closest?.("[data-world-select]"); if (node) selectEntity(node.dataset.worldSelect); };
  $("#inspector").addEventListener("input", (event) => { const entity = selectedEntity(); if (!entity) return; const target = event.target; if (target.dataset.transform) entity.transform[target.dataset.transform] = Number(target.value) || 0; else if (target.dataset.prop === "name") entity.name = target.value || "Entity"; markDirty(); renderWorld(); renderTree(); try { TomCatBridge.send("scene.entity.update", { projectId: project.id, sceneId: currentScene.id, entity }); } catch (_) {} });
  $("#inspector").addEventListener("change", (event) => { const entity = selectedEntity(); if (!entity) return; const target = event.target; if (target.dataset.prop === "visible") entity.visible = target.checked; if (target.dataset.prop === "type") entity.type = target.value; markDirty(); renderTree(); renderWorld(); renderInspector(); });
  $("#inspector").onclick = (event) => { const entity = selectedEntity(); if (!entity) return; if (event.target.closest("[data-delete-entity]")) deleteSelected(); if (event.target.closest("[data-duplicate-entity]")) duplicateSelected(); if (event.target.closest("[data-reset-transform]")) { entity.transform = { x: 0, y: 0, rotation: 0, scale: 1 }; markDirty(); renderInspector(); renderWorld(); } if (event.target.closest("[data-add-component]")) { entity.components = [...new Set([...(entity.components || []), "Script"])] ; markDirty(); renderInspector(); toast("已添加 Script 组件"); } };

  // Toolbar, scenes and content browser.
  $$('[data-tool]').forEach((button) => button.onclick = () => { state.tool = button.dataset.tool; $$('[data-tool]').forEach((b) => b.classList.toggle("active", b === button)); $("#gizmoCross").hidden = state.tool === "select" || !selectedEntity(); });
  $$('[data-viewport]').forEach((button) => button.onclick = () => { state.viewport = button.dataset.viewport; $$('[data-viewport]').forEach((b) => b.classList.toggle("active", b === button)); renderWorld(); });
  $("#toggleGrid").onclick = () => { state.grid = !state.grid; $("#toggleGrid").classList.toggle("active", state.grid); renderWorld(); };
  $("#frameSelected").onclick = () => { if (selectedEntity()) { toast(`已聚焦：${selectedEntity().name}`); renderWorld(); } };
  $("#save").onclick = saveScene; $("#run").onclick = () => state.runtime === "play" ? stopRuntime() : playRuntime(); $("#pause").onclick = togglePause; $("#step").onclick = stepRuntime;
  $("#openRuntime").onclick = () => { const popup = window.open("about:blank", "_blank"); const canonical = new URL("../runtime/index.html", location.href); const sourceRuntime = new URL("../wasm/public/runtime/index.html", location.href); const finish = (target) => { target.search = `?project=${encodeURIComponent(project.id)}&scene=${encodeURIComponent(currentScene.id)}`; if (popup && !popup.closed) { try { popup.opener = null; } catch (_) {} popup.location.href = target.toString(); } else location.href = target.toString(); }; fetch(canonical.toString(), { cache: "no-store" }).then((response) => finish(response.ok ? canonical : sourceRuntime)).catch(() => finish(sourceRuntime)); };
  $("#sceneSelect").onchange = (event) => { if (state.dirty) saveScene(); currentScene = project.scenes.find((s) => s.id === event.target.value) || currentScene; state.sceneId = currentScene.id; state.selectedId = null; renderAll(); };
  $("#addEntity").onclick = () => { $("#entityModal").classList.add("open"); $("#entityModal").setAttribute("aria-hidden", "false"); $("#entityModal input").value = ""; $("#entityModal input").focus(); };
  $("#entityModal").querySelector("form").onsubmit = (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); addEntity(form.get("name"), form.get("type")); $("#entityModal").classList.remove("open"); $("#entityModal").setAttribute("aria-hidden", "true"); };
  $$('[data-close-entity]').forEach((button) => button.onclick = () => { $("#entityModal").classList.remove("open"); $("#entityModal").setAttribute("aria-hidden", "true"); });
  function openSceneModal(mode = "create") { sceneModalMode = mode; $("#sceneDialogEyebrow").textContent = mode === "create" ? "Scene" : "Scene settings"; $("#sceneDialogTitle").textContent = mode === "create" ? "新建场景" : "重命名场景"; $("#sceneDialogSubmit").textContent = mode === "create" ? "创建场景" : "保存名称"; $("#sceneModal input").value = mode === "create" ? "" : currentScene.name; $("#sceneModal").classList.add("open"); $("#sceneModal").setAttribute("aria-hidden", "false"); $("#sceneModal input").focus(); }
  function closeSceneModal() { $("#sceneModal").classList.remove("open"); $("#sceneModal").setAttribute("aria-hidden", "true"); }
  $("#newScene").onclick = () => openSceneModal("create"); $("#renameScene").onclick = () => openSceneModal("rename");
  $("#sceneModal").querySelector("form").onsubmit = (event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") || "").trim(); if (!name) return; if (sceneModalMode === "create") { const created = store.createScene(project.id, name); project = store.get(project.id) || project; currentScene = project.scenes.find((s) => s.id === created.id) || currentScene; state.sceneId = currentScene.id; state.selectedId = null; markDirty(); toast(`已创建场景：${currentScene.name}`); } else { if (project.scenes.some((s) => s.id !== currentScene.id && s.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return toast("场景名称已存在", true); currentScene.name = name; currentScene.modified = new Date().toISOString(); markDirty(); toast(`已重命名场景：${name}`); } closeSceneModal(); renderAll(); };
  $$('[data-close-scene]').forEach((button) => button.onclick = closeSceneModal);
  $("#deleteScene").onclick = () => { if (project.scenes.length <= 1) return toast("项目至少需要保留一个场景", true); pendingSceneDelete = currentScene.id; $("#sceneDeleteTitle").textContent = `删除“${currentScene.name}”？`; $("#sceneDeleteMessage").textContent = "场景中的实体和未保存修改会被移除。"; $("#sceneDeleteModal").classList.add("open"); $("#sceneDeleteModal").setAttribute("aria-hidden", "false"); };
  function closeSceneDelete() { pendingSceneDelete = null; $("#sceneDeleteModal").classList.remove("open"); $("#sceneDeleteModal").setAttribute("aria-hidden", "true"); }
  $$('[data-close-scene-delete]').forEach((button) => button.onclick = closeSceneDelete);
  $("#confirmSceneDelete").onclick = () => { if (!pendingSceneDelete) return; const next = project.scenes.filter((s) => s.id !== pendingSceneDelete); project = store.update(project.id, { scenes: next }) || project; currentScene = project.scenes[0]; state.sceneId = currentScene.id; state.selectedId = null; markSaved(); closeSceneDelete(); renderAll(); toast("场景已删除"); };
  $$('[data-close-scene]').forEach((button) => button.onclick = () => { $("#sceneModal").classList.remove("open"); $("#sceneModal").setAttribute("aria-hidden", "true"); });
  function triggerImport() { $("#assetPicker").click(); }
  $("#importAsset").onclick = triggerImport;
  $("#assetPicker").onchange = (event) => { [...event.target.files].forEach((file) => store.addAsset(project.id, { name: file.name, size: file.size, typeLabel: store.typeFor(file.name), kind: store.kindFor(file.name), path: `Assets/${file.name}` })); project = store.get(project.id) || project; renderAssets(); toast(`已导入 ${event.target.files.length} 个资源`); event.target.value = ""; try { TomCatBridge.send("asset.import", { projectId: project.id }); } catch (_) {} };
  $("#contentGrid").addEventListener("click", (event) => { if (event.target.closest?.("#inlineImport")) triggerImport(); });
  $("#contentGrid").addEventListener("dblclick", (event) => { const item = event.target.closest?.("[data-asset-id]"); if (!item) return; const asset = project.assets.find((a) => a.id === item.dataset.assetId); if (!asset) return; const scene = project.scenes.find((s) => asset.name.toLocaleLowerCase().includes(s.name.toLocaleLowerCase())); if (scene) { currentScene = scene; state.sceneId = scene.id; state.selectedId = null; renderAll(); toast(`已打开场景：${scene.name}`); } });
  $("#assetSearch").oninput = renderAssets;
  $$('[data-editor-menu]').forEach((button) => button.onclick = () => { const action = button.dataset.editorMenu; if (action === "file") saveScene(); else if (action === "edit") toast("编辑菜单：复制、删除和组件操作可在 Inspector 中使用"); else if (action === "view") toast("视图菜单：Scene / Game 标签可切换预览"); else toast("TomCat Engine Web · 与上游编辑器保持同一场景协议"); });
  document.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveScene(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); $("#newScene").click(); } if (event.key === "F6") { event.preventDefault(); $("#run").click(); } if (event.key === "Escape") { $("[aria-hidden=false]")?.classList.remove("open"); } if (["q", "w", "e", "r"].includes(event.key.toLowerCase()) && !event.target.matches("input,textarea,select")) { const key = event.key.toLowerCase(); const map = { q: "select", w: "translate", e: "rotate", r: "scale" }; $(`[data-tool=${map[key]}]`)?.click(); } });

  // Native/C++ adapters can send the same protocol messages into this page.
  window.addEventListener("message", (event) => { if (event.data?.source !== "tomcat-engine") return; const type = event.data.type || event.data.command; if (type === "scene.changed") { markSaved("● 引擎已同步"); } if (type === "runtime.paused") { state.paused = true; renderWorld(); } });
  TomCatBridge.register("scene.save", () => { if (state.dirty) saveScene(); else markSaved(); return { ok: true, projectId: project.id, sceneId: currentScene.id }; });
  TomCatBridge.register("scene.open", (payload) => { const scene = project.scenes.find((s) => s.id === payload?.sceneId || s.name === payload?.scene); if (!scene) return { ok: false, error: "Scene not found" }; currentScene = scene; state.sceneId = scene.id; state.selectedId = null; renderAll(); return { ok: true, sceneId: scene.id }; });
  TomCatBridge.register("project.open", (payload) => { const next = store.get(payload?.id || payload?.name); if (!next) return { ok: false, error: "Project not found" }; project = next; currentScene = project.scenes[0]; state.sceneId = currentScene.id; state.selectedId = null; renderAll(); return { ok: true, projectId: project.id }; });
  TomCatBridge.register("project.save", () => { saveScene(); return { ok: true, projectId: project.id }; });
  TomCatBridge.register("asset.import", (payload) => { const files = Array.isArray(payload?.files) ? payload.files : []; files.forEach((file) => store.addAsset(project.id, file)); project = store.get(project.id) || project; renderAssets(); return { ok: true, count: files.length }; });
  TomCatBridge.register("runtime.play", () => { if (state.runtime !== "play") playRuntime(); return { ok: true }; });
  TomCatBridge.register("runtime.pause", () => { state.paused = true; renderWorld(); return { ok: true }; });
  TomCatBridge.register("runtime.resume", () => { state.paused = false; renderWorld(); return { ok: true }; });
  TomCatBridge.register("runtime.stop", () => { stopRuntime(false); return { ok: true }; });
  TomCatBridge.register("runtime.step", () => { state.frame += 1; state.paused = true; renderWorld(); return { ok: true, frame: state.frame }; });
  window.addEventListener("tomcat:platform", (event) => { if (event.detail?.type === "asset.imported" && event.detail.payload?.project?.id === project.id) { project = store.get(project.id) || project; renderAssets(); } });

  renderAll();
})();
