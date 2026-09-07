import test from "node:test";
import assert from "node:assert/strict";
import { StorageError, TomCatStorage } from "./tomcat-storage.mjs";

test("fallback storage creates and round-trips project and scene files", async () => {
  const storage = new TomCatStorage({ localStorage: null, mountPath: "/tomcat-test" });
  await storage.mount();

  const project = await storage.createProject({ id: "demo", name: "Demo", template: "2D" });
  assert.deepEqual(project, { id: "demo", name: "Demo", template: "2D" });
  assert.match(await storage.loadProject("demo"), /Name: "Demo"/);

  await storage.saveScene("demo", "Main Scene", "Scene: Main\nEntities: []\n");
  assert.equal(await storage.loadScene("demo", "Main Scene.tomcat"), "Scene: Main\nEntities: []\n");
  assert.equal(storage.scenePath("demo", "Main Scene.tomcat"), "/tomcat-test/projects/demo/Assets/Main Scene.tomcat");
  assert.equal(storage.list("/tomcat-test/projects/demo/Assets")[0].name, "Main Scene.tomcat");

  await storage.sync(false);
});

test("storage rejects traversal and unsafe project identifiers", async () => {
  const storage = new TomCatStorage({ localStorage: null });
  await storage.mount();
  assert.throws(() => storage.projectPath("../outside"), (error) => error instanceof StorageError && error.code === "INVALID_SEGMENT");
  assert.throws(() => storage.path("../../outside"), (error) => error instanceof StorageError && error.code === "PATH_ESCAPE");
  assert.throws(() => storage.scenePath("demo", "../outside"), (error) => error instanceof StorageError && error.code === "INVALID_SEGMENT");
  await assert.rejects(() => storage.createProject({ id: "has space" }), (error) => error instanceof StorageError && error.code === "INVALID_SEGMENT");
});

test("bridge adapter registers project and scene commands", async () => {
  const storage = new TomCatStorage({ localStorage: null });
  await storage.mount();
  const handlers = new Map();
  const bridge = {
    register(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
  };
  const dispose = storage.installBridge(bridge);
  assert.ok(handlers.has("project.create"));
  const created = await handlers.get("project.create")({ id: "p1", name: "P1" });
  assert.equal(created.ok, true);
  const saved = await handlers.get("scene.save")({ projectId: "p1", sceneId: "Main Scene", yaml: "Scene: Main" });
  assert.equal(saved.scene.scene, "Main Scene");
  dispose();
  assert.equal(handlers.size, 0);
});
