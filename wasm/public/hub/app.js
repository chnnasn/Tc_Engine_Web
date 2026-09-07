(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const store = window.TomCatStore;
  // The metadata store keeps the Hub useful immediately.  When the WASM
  // adapter is present, mount its IDBFS-backed project volume in parallel so
  // the same commands can be routed to the engine by a host shell.
  const engineStorage = window.TomCatStorage ? new window.TomCatStorage({ module: window.Module || null }) : null;
  window.TomCatPlatformStorage = engineStorage;
  let projectView = "grid";
  let assetFilter = "all";
  let modalMode = "create";
  let modalProjectId = null;
  let pendingConfirm = null;

  engineStorage?.mount().then(() => setSyncStatus("● 存储已连接", true)).catch(() => setSyncStatus("● 本地模式", true));

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const iconFor = (asset) => ({ scene: "▣", texture: "▧", script: "▤", audio: "♫", file: "□" }[asset.kind] || "□");
  const formatSize = (size) => {
    const value = Number(size) || 0;
    if (!value) return "—";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };
  const relativeTime = (date) => {
    const ms = Date.now() - new Date(date || Date.now()).getTime();
    if (!Number.isFinite(ms) || ms < 90_000) return "刚刚";
    const mins = Math.floor(ms / 60_000); if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60); if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24); return days < 7 ? `${days} 天前` : new Date(date).toLocaleDateString("zh-CN");
  };
  const projectColor = (p) => p.color || (p.template === "平台跳跃" ? "green" : p.template === "俯视角冒险" ? "orange" : "");
  const allAssets = () => store.list().flatMap((project) => project.assets.map((asset) => ({ ...asset, projectId: project.id, projectName: project.name })));

  function toast(message, type = "ok") {
    const stack = $("#toastStack");
    const item = document.createElement("div"); item.className = `toast ${type === "error" ? "error" : ""}`;
    item.innerHTML = `<span>${type === "error" ? "!" : "✓"}</span><span>${escapeHtml(message)}</span><button class="toast-close" aria-label="关闭">×</button>`;
    $(".toast-close", item).onclick = () => item.remove(); stack.appendChild(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function setSyncStatus(text = "● 已保存到本地", ready = true) {
    const node = $("#syncStatus"); if (!node) return;
    node.textContent = text; node.classList.toggle("ready", ready);
  }

  function renderProjects() {
    const query = $("#search").value.trim().toLocaleLowerCase();
    const sort = $("#sort").value;
    let rows = store.list().filter((p) => `${p.name} ${p.template} ${p.description}`.toLocaleLowerCase().includes(query));
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (sort === "assets") rows.sort((a, b) => b.assets.length - a.assets.length);
    if (sort === "updated") rows.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const host = $("#projects"); host.classList.toggle("list-view", projectView === "list");
    host.innerHTML = rows.length ? rows.map((p) => `<article class="card" data-project-id="${escapeHtml(p.id)}">
      <div class="card-art ${projectColor(p)}"><span class="project-art-grid"></span><small>${escapeHtml(p.template)}</small></div>
      <div class="card-body"><div class="card-top"><h3>${escapeHtml(p.name)}</h3><div class="card-menu"><button class="icon-button menu-toggle" data-project-action="menu" data-id="${escapeHtml(p.id)}" aria-label="项目菜单">•••</button><div class="menu" hidden><button data-project-action="rename" data-id="${escapeHtml(p.id)}">重命名</button><button data-project-action="duplicate" data-id="${escapeHtml(p.id)}">复制项目</button><button data-project-action="export" data-id="${escapeHtml(p.id)}">导出项目</button><button class="danger" data-project-action="delete" data-id="${escapeHtml(p.id)}">删除项目</button></div></div></div>
      <div class="muted">${escapeHtml(p.description || "兼容层已注册 · WebAssembly 就绪")}</div><div class="card-meta"><span>更新于 ${relativeTime(p.updated)}</span><span>${p.assets.length} 个资源 · ${p.scenes.length} 个场景</span></div><button class="primary open-project" data-project-action="open" data-id="${escapeHtml(p.id)}">打开编辑器</button></div></article>`).join("") : `<div class="empty"><div style="font-size:24px;margin-bottom:7px">⌁</div>没有匹配的项目<p style="margin:5px 0 0">试试调整搜索条件，或新建一个项目。</p></div>`;
    $("#projectCount").textContent = store.list().length;
    $("#assetCount").textContent = allAssets().length;
    $("#resourceNavCount").textContent = allAssets().length;
  }

  function renderProjectFilter() {
    const select = $("#assetProjectFilter"); const old = select.value;
    select.innerHTML = `<option value="all">所有项目</option>${store.list().map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}`;
    select.value = [...select.options].some((o) => o.value === old) ? old : "all";
  }

  function renderAssets() {
    const projectFilter = $("#assetProjectFilter").value;
    const query = $("#search").value.trim().toLocaleLowerCase();
    const rows = allAssets().filter((a) => (projectFilter === "all" || a.projectId === projectFilter) && (assetFilter === "all" || a.kind === assetFilter) && `${a.name} ${a.projectName} ${a.type}`.toLocaleLowerCase().includes(query));
    $("#assets").innerHTML = rows.length ? rows.map((a) => `<div class="table-row asset-row"><span class="asset-name"><span class="file-icon ${escapeHtml(a.kind)}">${iconFor(a)}</span><span title="${escapeHtml(a.path)}">${escapeHtml(a.name)}</span></span><span class="muted">${escapeHtml(a.type)}</span><span class="muted">${escapeHtml(a.projectName)}</span><span class="muted">${formatSize(a.size)}</span><span><span class="badge ${a.status === "已同步" ? "good" : ""}">${escapeHtml(a.status)}</span></span><button class="icon-button" data-asset-action="delete" data-project-id="${escapeHtml(a.projectId)}" data-asset-id="${escapeHtml(a.id)}" aria-label="删除资源">×</button></div>`).join("") : `<div class="empty small">资源库为空。点击“导入资源”把文件加入当前项目。</div>`;
  }

  function renderActivity() {
    const entries = store.list().flatMap((p) => (p.activity || []).map((item) => ({ ...item, project: p.name, projectId: p.id }))).slice(0, 30);
    $("#activityList").innerHTML = entries.length ? entries.map((item) => `<div class="activity-item"><span class="quick-icon">${escapeHtml(item.icon || "•")}</span><div><b>${escapeHtml(item.text)}</b><div class="muted" style="font-size:11px">${escapeHtml(item.project)}</div></div><time>${escapeHtml(item.time || "刚刚")}</time></div>`).join("") : `<div class="empty small">暂无活动记录。</div>`;
  }

  function renderAll() { renderProjects(); renderProjectFilter(); renderAssets(); renderActivity(); }

  function showView(view) {
    const titles = { overview: ["TomCat Hub", "项目总览", "管理项目、资源和 Web 编辑会话"], resources: ["Content Browser", "资源库", "浏览全部项目的场景、纹理、脚本和音频"], activity: ["Workspace history", "最近活动", "项目与场景的保存、导入和运行记录"], shortcuts: ["Editor reference", "快捷键", "这些快捷键与桌面编辑器的操作习惯保持一致"] };
    const text = titles[view] || titles.overview;
    $("#pageEyebrow").textContent = text[0]; $("#pageTitle").textContent = text[1]; $("#pageSubtitle").textContent = text[2];
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    $$('[data-view]').forEach((link) => link.classList.toggle("active", link.dataset.view === view));
    $("#search").placeholder = view === "resources" ? "搜索资源或项目" : "搜索项目或标签";
    if (view === "resources") renderAssets();
  }

  function openProject(id) {
    const project = store.get(id); if (!project) return;
    localStorage.setItem("tomcat.lastProjectId", project.id); localStorage.setItem("tomcat.lastProject", project.name);
    try { TomCatBridge.send("project.open", { id: project.id, name: project.name }); } catch (_) { /* optional bridge */ }
    location.href = `../editor/?project=${encodeURIComponent(project.id)}`;
  }

  function openProjectModal(mode = "create", id = null) {
    modalMode = mode; modalProjectId = id;
    const form = $("#projectForm"); const project = id ? store.get(id) : null;
    $("#dialogEyebrow").textContent = mode === "create" ? "New project" : "Project settings";
    $("#dialogTitle").textContent = mode === "create" ? "新建项目" : "重命名项目";
    $("#dialogSubtitle").textContent = mode === "create" ? "项目会保存在当前浏览器，可随时打开编辑器继续工作。" : "更新项目名称和说明，已有场景与资源会保留。";
    $("#dialogSubmit").textContent = mode === "create" ? "创建并打开" : "保存修改";
    form.name.value = project?.name || ""; form.template.value = project?.template || "2D 空项目"; form.description.value = project?.description || ""; form.color.value = project?.color || "";
    $$('[name="template"],[name="color"],[name="description"]', form).forEach((node) => { node.closest(".field").hidden = mode !== "create"; });
    $("#modal").classList.add("open"); $("#modal").setAttribute("aria-hidden", "false"); window.setTimeout(() => form.name.focus(), 30);
  }

  function closeModal() { $("#modal").classList.remove("open"); $("#modal").setAttribute("aria-hidden", "true"); }
  function askDelete(id) {
    const p = store.get(id); if (!p) return;
    pendingConfirm = id; $("#confirmTitle").textContent = `删除“${p.name}”？`; $("#confirmMessage").textContent = `项目中的 ${p.scenes.length} 个场景和 ${p.assets.length} 个资源会从此浏览器的工作区移除。`;
    $("#confirmModal").classList.add("open"); $("#confirmModal").setAttribute("aria-hidden", "false");
  }
  function closeConfirm() { pendingConfirm = null; $("#confirmModal").classList.remove("open"); $("#confirmModal").setAttribute("aria-hidden", "true"); }

  function importFiles(files, projectId) {
    const list = [...files]; if (!list.length) return;
    const project = store.get(projectId) || store.list()[0]; if (!project) return toast("请先创建一个项目", "error");
    list.forEach((file) => store.addAsset(project.id, { name: file.name, size: file.size, typeLabel: store.typeFor(file.name), kind: store.kindFor(file.name), path: `Assets/${file.name}` }));
    localStorage.setItem("tomcat.lastProjectId", project.id); renderAll(); setSyncStatus("● 资源已保存", true); toast(`已导入 ${list.length} 个资源到 ${project.name}`);
    try { TomCatBridge.send("asset.import", { projectId: project.id, files: list.map((f) => ({ name: f.name, size: f.size, type: f.type })), fromUi: true }); } catch (_) { /* optional bridge */ }
  }
  function exportProject(id) {
    const project = store.get(id); if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.tomcat-project.json`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出项目：${project.name}`);
  }

  // Navigation and project actions.
  $$('[data-view]').forEach((link) => link.addEventListener("click", (event) => {
    if (!link.dataset.view) return; event.preventDefault(); location.hash = link.dataset.view; showView(link.dataset.view);
  }));
  window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "overview"));
  $("#search").addEventListener("input", () => { renderProjects(); renderAssets(); });
  $("#sort").addEventListener("change", renderProjects);
  $$('[data-project-view]').forEach((button) => button.addEventListener("click", () => { projectView = button.dataset.projectView; $$('[data-project-view]').forEach((b) => b.classList.toggle("active", b === button)); renderProjects(); }));
  $("#projects").addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-project-action]"); if (!action) return;
    const id = action.dataset.id;
    if (action.dataset.projectAction === "menu") { const menu = action.nextElementSibling; $$(".menu").forEach((m) => { if (m !== menu) m.hidden = true; }); menu.hidden = !menu.hidden; return; }
    action.closest(".menu")?.setAttribute("hidden", "");
    if (action.dataset.projectAction === "open") openProject(id);
    if (action.dataset.projectAction === "rename") openProjectModal("rename", id);
    if (action.dataset.projectAction === "duplicate") { const p = store.duplicate(id); renderAll(); toast(`已复制项目：${p.name}`); }
    if (action.dataset.projectAction === "export") exportProject(id);
    if (action.dataset.projectAction === "delete") askDelete(id);
  });
  document.addEventListener("click", (event) => { if (!event.target.closest?.(".card-menu")) $$(".menu").forEach((m) => { m.hidden = true; }); });

  $("#newProject").onclick = () => openProjectModal("create"); $("#heroNew").onclick = () => openProjectModal("create");
  $("#openLast").onclick = () => { const last = localStorage.getItem("tomcat.lastProjectId") || localStorage.getItem("tomcat.lastProject"); const p = store.get(last) || store.list()[0]; if (p) openProject(p.id); else openProjectModal("create"); };
  $("#closeModal").onclick = closeModal; $("#cancel").onclick = closeModal;
  $("#modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal(); });
  $("#projectForm").onsubmit = (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      if (modalMode === "create") { const p = store.create({ name: data.get("name"), template: data.get("template"), description: data.get("description") }); store.update(p.id, { color: data.get("color") }); closeModal(); toast(`已创建项目：${p.name}`); openProject(p.id); }
      else { const p = store.rename(modalProjectId, data.get("name")); store.update(p.id, { description: data.get("description") }); closeModal(); renderAll(); toast(`已更新项目：${p.name}`); }
    } catch (error) { toast(error.message || "操作失败", "error"); }
  };
  $$('[data-close-confirm]').forEach((button) => button.onclick = closeConfirm);
  $("#confirmAction").onclick = () => { if (!pendingConfirm) return; const p = store.get(pendingConfirm); store.remove(pendingConfirm); closeConfirm(); renderAll(); toast(`已删除项目：${p?.name || "项目"}`); };
  $("#confirmModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeConfirm(); });
  $("#assetProjectFilter").onchange = renderAssets;
  $("#assetFilters").onclick = (event) => { const button = event.target.closest?.("[data-asset-filter]"); if (!button) return; assetFilter = button.dataset.assetFilter; $$('[data-asset-filter]').forEach((b) => b.classList.toggle("active", b === button)); renderAssets(); };
  $("#importAsset").onclick = () => $("#assetPicker").click();
  $("#assetPicker").onchange = (event) => { importFiles(event.target.files, localStorage.getItem("tomcat.lastProjectId") || store.list()[0]?.id); event.target.value = ""; };
  $("#assets").onclick = (event) => { const button = event.target.closest?.("[data-asset-action=delete]"); if (!button) return; store.removeAsset(button.dataset.projectId, button.dataset.assetId); renderAll(); toast("已移除资源"); };
  $("#clearActivity").onclick = () => { store.list().forEach((p) => store.update(p.id, { activity: [] })); renderAll(); toast("活动记录已清除"); };
  document.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); openProjectModal("create"); } if (event.key === "Escape") { closeModal(); closeConfirm(); } });
  window.addEventListener("tomcat:platform", () => { setSyncStatus("● 已保存到本地", true); });
  TomCatBridge.register("hub.openProject", (payload) => { const p = store.get(payload?.id || payload?.name); if (p) openProject(p.id); return { ok: !!p }; });
  TomCatBridge.register("project.list", () => ({ ok: true, projects: store.list() }));
  TomCatBridge.register("project.create", (payload) => { try { return { ok: true, project: store.create(payload || {}) }; } catch (error) { return { ok: false, error: error.message }; } });
  TomCatBridge.register("project.delete", (payload) => ({ ok: store.remove(payload?.id) }));
  TomCatBridge.register("project.remove", (payload) => ({ ok: store.remove(payload?.id) }));
  TomCatBridge.register("project.rename", (payload) => { try { return { ok: true, project: store.rename(payload?.id, payload?.name) }; } catch (error) { return { ok: false, error: error.message }; } });
  TomCatBridge.register("project.duplicate", (payload) => { const copy = store.duplicate(payload?.id); return { ok: !!copy, project: copy }; });
  TomCatBridge.register("asset.import", (payload) => { const p = store.get(payload?.projectId) || store.list()[0]; const files = Array.isArray(payload?.files) ? payload.files : []; if (!p) return { ok: false, error: "No project" }; if (!payload?.fromUi) files.forEach((file) => store.addAsset(p.id, file)); renderAll(); return { ok: true, projectId: p.id, count: files.length }; });

  renderAll(); showView(location.hash.slice(1) || "overview");
})();
