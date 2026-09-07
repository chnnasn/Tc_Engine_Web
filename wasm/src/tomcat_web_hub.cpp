// Web entry point for the upstream TomCat Hub (Builder/Manager).
//
// The desktop TomCatHub executable constructs the same ExampleLayer against
// the same ProjectManager/ImGui stack.  A browser owns the animation loop, so
// this file drives that exact upstream layer one frame at a time.  The Hub's
// project directory is the browser virtual filesystem, and opening a project
// hands the path back to the Web host which then boots the editor page on the
// same project tree.

#include "tomcat_web.hpp"

#include "TomCat/Core/Application.h"
#include "TomCat/Core/Log.h"
#include "TomCat/Core/TimeStep.h"
#include "TomCat/Project/ProjectManager.h"

#include "ExampleLayer.h"

#include <string>

#ifdef __EMSCRIPTEN__
#include <unistd.h>
#endif

extern "C" {
void tc_web_platform_set_size(int width, int height);
}

namespace {

TomCat::Application* g_hubApplication = nullptr;
TomCat::ExampleLayer* g_hubLayer = nullptr;
std::string g_hubArgument0 = "TomCatHub";
std::string g_pendingOpenProject;
bool g_hubRunning = false;

} // namespace

extern "C" {

void tc_web_hub_boot(int width, int height) {
  if (g_hubRunning)
    return;

  tc_web_platform_set_size(width, height);
  TomCat::Log::Init();

  // The host mounts the project tree at /tomcat before boot.  Making it the
  // working directory gives the upstream Hub the same "Projects" and
  // "Editors" sibling folders it expects next to its settings file.
#ifdef __EMSCRIPTEN__
  if (chdir("/tomcat") != 0) {
    TC_Core_Error("TomCat Hub: cannot enter the virtual project directory");
    return;
  }
#endif

  char* argv[] = { const_cast<char*>(g_hubArgument0.c_str()), nullptr };
  TomCat::ApplicationCommandLineArgs args{ 1, argv };
  g_hubApplication = new TomCat::Application("TomCat Hub", "", args);
  if (!g_hubApplication)
    return;

  // ProjectManager::OpenProjectInEditor marks the project active and invokes
  // the loaded callback.  The browser host consumes the pending path on the
  // next JS frame and navigates to the editor for that exact project file.
  TomCat::ProjectManager::Get().RegisterProjectLoadedCallback(
      [](const TomCat::Ref<TomCat::Project>& project) {
        if (project)
          g_pendingOpenProject = project->GetProjectPath().string();
      });

  g_hubLayer = new TomCat::ExampleLayer();
  g_hubApplication->PushLayer(g_hubLayer);

  g_hubRunning = true;
  TomCatWeb::Bridge::instance().boot();
}

void tc_web_hub_frame(double seconds) {
  if (!g_hubRunning || !g_hubApplication || !g_hubLayer)
    return;

  const float delta = static_cast<float>(seconds > 0.0 ? (seconds > 0.1 ? 0.1 : seconds) : 0.0);
  g_hubLayer->OnUpdate(TomCat::Timestep(delta));

  TomCat::ImGuiLayer* imgui = g_hubApplication->GetImGuiLayer();
  imgui->Begin();
  g_hubLayer->OnImGuiRender();
  imgui->End();

  g_hubApplication->GetWindow().OnUpdate();
  TomCatWeb::Bridge::instance().frame(seconds);
}

void tc_web_hub_shutdown() {
  if (!g_hubRunning && !g_hubApplication)
    return;

  g_hubRunning = false;
  g_hubLayer = nullptr;
  delete g_hubApplication;
  g_hubApplication = nullptr;
  TomCatWeb::Bridge::instance().shutdown();
}

// The Web host imports/removes .tcproj files behind the Hub (browser upload,
// store seeding).  Request the next frame to refresh the visible project list.
void tc_web_hub_rescan() {
  if (g_hubLayer)
    g_hubLayer->WebRequestRescan();
}

// Returns the path of the project the user just chose to open, or nullptr.
// The returned buffer is valid until the next call.
const char* tc_web_hub_poll_open_project() {
  if (g_pendingOpenProject.empty())
    return nullptr;
  static std::string pending;
  pending.swap(g_pendingOpenProject);
  return pending.c_str();
}

} // extern "C"
