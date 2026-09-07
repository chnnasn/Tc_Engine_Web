// Web entry point for the upstream TomCat editor.
//
// The desktop executable enters through EntryPoint/Application::Run.  A
// browser owns the animation loop, so this file drives the same Application,
// ImGuiLayer and EditorLayer one frame at a time while keeping all editor UI,
// scene panels and renderer code in the upstream sources.

#include "tomcat_web.hpp"

#include "TomCat/Core/Application.h"
#include "TomCat/Core/Log.h"
#include "TomCat/Core/TimeStep.h"
#include "TomCat/Project/ProjectManager.h"

#include "EditorLayer.h"

#include <algorithm>
#include <string>

extern "C" {
void tc_web_platform_set_size(int width, int height);
void tc_web_set_file_dialog_result(const char* path);
}

namespace {

TomCat::Application* g_application = nullptr;
TomCat::EditorLayer* g_editorLayer = nullptr;
std::string g_projectPath;
std::string g_argument0 = "TomCatWebEditor";
bool g_running = false;

} // namespace

extern "C" {

// Set before boot to load a project from the browser's virtual filesystem.
void tc_web_runtime_set_project_path(const char* path) {
  g_projectPath = path ? path : "";
}

int tc_web_runtime_boot(int width, int height) {
  if (g_running)
    return 0;

  tc_web_platform_set_size(width, height);
  TomCat::Log::Init();

  // ProjectManager is the same upstream manager used by the desktop Hub.  A
  // path supplied by Hub/IndexedDB is loaded before constructing EditorLayer
  // so its panels see the active project in their constructors.
  if (!g_projectPath.empty()) {
    auto project = TomCat::ProjectManager::Get().LoadProject(g_projectPath);
    if (project)
      TomCat::ProjectManager::Get().SetActiveProject(project);
  }

  char* argv[] = { const_cast<char*>(g_argument0.c_str()), nullptr };
  TomCat::ApplicationCommandLineArgs args{ 1, argv };
  g_application = new TomCat::Application("TomCat Editor", "", args);
  if (!g_application)
    return -1;

  g_editorLayer = new TomCat::EditorLayer();
  g_application->PushLayer(g_editorLayer);

  // A first visit should be useful even when no project has been imported.
  // The helper creates the same camera/scene primitives used by the editor's
  // normal new-project flow; imported projects bypass it.
  if (g_projectPath.empty())
    g_editorLayer->WebInitializeDemoScene();

  g_running = true;
  TomCatWeb::Bridge::instance().boot();
  return 0;
}

void tc_web_runtime_frame(double seconds) {
  if (!g_running || !g_application || !g_editorLayer)
    return;

  const float delta = static_cast<float>(std::clamp(seconds, 0.0, 0.1));
  g_editorLayer->OnUpdate(TomCat::Timestep(delta));

  TomCat::ImGuiLayer* imgui = g_application->GetImGuiLayer();
  imgui->Begin();
  g_editorLayer->OnImGuiRender();
  imgui->End();

  // WebWindow performs GLFW event polling and swaps the WebGL backbuffer.
  g_application->GetWindow().OnUpdate();
  TomCatWeb::Bridge::instance().frame(seconds);
}

void tc_web_runtime_shutdown() {
  if (!g_running && !g_application)
    return;

  g_running = false;
  g_editorLayer = nullptr;
  delete g_application;
  g_application = nullptr;
  TomCatWeb::Bridge::instance().shutdown();
}

// Editor controls used by Hub/Editor's browser shell.  They call the same
// public Web forwarding methods on upstream EditorLayer as the ImGui menu.
int tc_web_editor_new_scene() {
  if (!g_editorLayer)
    return -1;
  g_editorLayer->WebInitializeDemoScene();
  return 0;
}

int tc_web_editor_open_scene(const char* path) {
  if (!g_editorLayer || !path)
    return -1;
  return g_editorLayer->WebLoadScene(path) ? 0 : -2;
}

int tc_web_editor_save_scene(const char* path) {
  if (!g_editorLayer || !path)
    return -1;
  return g_editorLayer->WebSaveScene(path) ? 0 : -2;
}

int tc_web_editor_set_project(const char* path) {
  if (!g_editorLayer || !path)
    return -1;
  auto project = TomCat::ProjectManager::Get().LoadProject(path);
  if (!project)
    return -2;
  g_editorLayer->WebSetProject(project);
  return 0;
}

void tc_web_editor_play() {
  if (g_editorLayer)
    g_editorLayer->WebPlay();
}

void tc_web_editor_stop() {
  if (g_editorLayer)
    g_editorLayer->WebStop();
}

// Browser file-picker callbacks can place a selected virtual path here.  The
// next upstream FileDialogs call consumes it, preserving the synchronous API
// expected by EditorLayer while the picker itself remains asynchronous.
void tc_web_runtime_set_file_dialog_result(const char* path) {
  tc_web_set_file_dialog_result(path);
}

} // extern "C"
