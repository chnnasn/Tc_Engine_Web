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
#include "TomCat/Core/Layer.h"
#include "TomCat/Project/ProjectManager.h"
#include "TomCat/Project/Project.h"

#include <imgui/imgui.h>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <unistd.h>
#endif

extern "C" {
void tc_web_platform_set_size(int width, int height);
}

namespace {

// Web Hub uses the same Dear ImGui stack as the upstream manager, while
// keeping the browser's project overview compact enough for a single canvas.
class WebHubLayer final : public TomCat::Layer {
public:
  WebHubLayer() : Layer("TomCat Hub") {
    auto& manager = TomCat::ProjectManager::Get();
    manager.SetProjectDirectory(std::filesystem::current_path() / "Projects");
    manager.SetEditorDirectory(std::filesystem::current_path() / "Editors");
    manager.ScanProjects();
    refresh();
  }

  void OnAttach() override {
    ImGuiStyle& style = ImGui::GetStyle();
    style.WindowPadding = ImVec2(0, 0);
    style.ItemSpacing = ImVec2(10, 8);
    style.FramePadding = ImVec2(10, 8);
    style.WindowRounding = 0;
    style.ChildRounding = 10;
    style.FrameRounding = 8;
    style.ScrollbarRounding = 8;
    ImVec4* c = style.Colors;
    c[ImGuiCol_WindowBg] = ImVec4(0.035f, 0.055f, 0.12f, 1.0f);
    c[ImGuiCol_ChildBg] = ImVec4(0.055f, 0.085f, 0.17f, 1.0f);
    c[ImGuiCol_Border] = ImVec4(0.13f, 0.22f, 0.39f, 1.0f);
    c[ImGuiCol_Text] = ImVec4(0.88f, 0.92f, 1.0f, 1.0f);
    c[ImGuiCol_TextDisabled] = ImVec4(0.47f, 0.59f, 0.80f, 1.0f);
    c[ImGuiCol_FrameBg] = ImVec4(0.055f, 0.085f, 0.17f, 1.0f);
    c[ImGuiCol_FrameBgHovered] = ImVec4(0.10f, 0.15f, 0.27f, 1.0f);
    c[ImGuiCol_Button] = ImVec4(0.39f, 0.52f, 0.98f, 1.0f);
    c[ImGuiCol_ButtonHovered] = ImVec4(0.48f, 0.61f, 1.0f, 1.0f);
    c[ImGuiCol_ButtonActive] = ImVec4(0.32f, 0.43f, 0.86f, 1.0f);
  }

  void OnUpdate(TomCat::Timestep) override {
    if (m_rescan) {
      m_rescan = false;
      refresh();
    }
  }

  void OnImGuiRender() override {
    ImGuiViewport* viewport = ImGui::GetMainViewport();
    ImGui::SetNextWindowPos(viewport->Pos);
    ImGui::SetNextWindowSize(viewport->Size);
    ImGui::SetNextWindowViewport(viewport->ID);
    const ImGuiWindowFlags flags = ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove |
      ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBringToFrontOnFocus;
    ImGui::Begin("TomCat Hub##web", nullptr, flags);
    const ImVec2 size = ImGui::GetContentRegionAvail();
    drawSidebar(ImVec2(240.0f, size.y));
    ImGui::SameLine(0, 0);
    ImGui::BeginChild("HubMain", ImVec2(size.x - 240.0f, size.y), false,
      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    drawMain(ImGui::GetContentRegionAvail());
    ImGui::EndChild();
    ImGui::End();
  }

  void WebRequestRescan() { m_rescan = true; }

private:
  void refresh() { m_projects = TomCat::ProjectManager::Get().GetProjects(); }

  static const char* templateFor(size_t i) {
    static const char* labels[] = { "俯视角冒险", "2D 空项目", "平台跳跃" };
    return labels[i % 3];
  }

  static ImVec4 cardColor(size_t i) {
    static ImVec4 colors[] = {
      ImVec4(0.40f, 0.24f, 0.20f, 1.0f),
      ImVec4(0.25f, 0.25f, 0.52f, 1.0f),
      ImVec4(0.08f, 0.34f, 0.45f, 1.0f)
    };
    return colors[i % 3];
  }

  void drawSidebar(const ImVec2& size) {
    ImGui::PushStyleColor(ImGuiCol_ChildBg, ImVec4(0.025f, 0.045f, 0.105f, 1.0f));
    ImGui::BeginChild("HubSidebar", size, false, ImGuiWindowFlags_NoScrollbar);
    ImGui::GetWindowDrawList()->AddRectFilled(ImVec2(28, 22), ImVec2(56, 50), IM_COL32(113, 91, 255, 255), 7.0f);
    ImGui::SetCursorPos(ImVec2(34, 27));
    ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0.48f, 0.62f, 1.0f, 1.0f));
    ImGui::TextUnformatted("TC");
    ImGui::PopStyleColor();
    ImGui::SameLine(72, 16);
    ImGui::SetCursorPosY(26);
    ImGui::TextUnformatted("TomCat Hub");
    ImGui::SetCursorPos(ImVec2(28, 92));
    ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0.53f, 0.65f, 1.0f, 1.0f));
    ImGui::TextUnformatted("⌂ 项目总览");
    ImGui::SetCursorPos(ImVec2(28, 124));
    ImGui::TextUnformatted("▧ 资源库");
    ImGui::SetCursorPos(ImVec2(28, 156));
    ImGui::TextUnformatted("◷ 最近活动");
    ImGui::SetCursorPos(ImVec2(28, 188));
    ImGui::TextUnformatted("⚙ 工作区设置");
    ImGui::PopStyleColor();
    ImGui::SetCursorPos(ImVec2(28, size.y - 58));
    ImGui::TextDisabled("本地工作区");
    ImGui::EndChild();
    ImGui::PopStyleColor();
  }

  void drawMain(const ImVec2& size) {
    ImGui::SetCursorPos(ImVec2(48, 26));
    ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0.40f, 0.60f, 1.0f, 1.0f));
    ImGui::TextUnformatted("TOMCAT HUB");
    ImGui::PopStyleColor();
    ImGui::SetCursorPos(ImVec2(48, 58));
    ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0.88f, 0.92f, 1.0f, 1.0f));
    ImGui::SetWindowFontScale(1.55f);
    ImGui::TextUnformatted("项目总览");
    ImGui::SetWindowFontScale(1.0f);
    ImGui::PopStyleColor();
    ImGui::SetCursorPos(ImVec2(48, 112));
    ImGui::TextDisabled("管理项目、资源和 Web 编辑会话");

    const float searchW = std::min(280.0f, size.x * 0.28f);
    ImGui::SetCursorPos(ImVec2(size.x - 550, 34));
    ImGui::SetNextItemWidth(searchW);
    ImGui::InputTextWithHint("##hub-search", "搜索项目或标签", m_search, sizeof(m_search));
    ImGui::SameLine(0, 12);
    ImGui::SetNextItemWidth(110);
    ImGui::Combo("##hub-sort", &m_sort, "最近更新\0名称\0资源数\0");
    ImGui::SameLine(0, 12);
    if (ImGui::Button("+ 新建项目", ImVec2(140, 40)))
      m_notice = "新建项目向导将在桌面端打开";

    ImGui::NewLine();
    ImGui::SetCursorPos(ImVec2(48, 174));
    ImGui::BeginGroup();
    ImGui::Text("%zu项目", m_projects.size());
    ImGui::Text("%zu资源", m_projects.size());
    ImGui::TextUnformatted("WebAssembly运行时");
    ImGui::EndGroup();

    const float gap = 22.0f;
    const float cardsY = 266.0f;
    const float cardW = std::max(220.0f, (size.x - 96.0f - gap * 2.0f) / 3.0f);
    for (size_t i = 0; i < std::min<size_t>(m_projects.size(), 3); ++i)
      drawCard(projectForCard(i), i, ImVec2(48.0f + i * (cardW + gap), cardsY), ImVec2(cardW, 280.0f));

    ImGui::SetCursorPos(ImVec2(48, cardsY + 304));
    ImGui::BeginChild("RecentResources", ImVec2(size.x - 96, std::max(120.0f, size.y - cardsY - 320)), true);
    ImGui::SetWindowFontScale(1.15f);
    ImGui::TextUnformatted("最近资源");
    ImGui::SetWindowFontScale(1.0f);
    ImGui::Separator();
    const char* resources[] = { "MainScene.tomcat", "Level01.tomcat", "World.tomcat" };
    for (int i = 0; i < 3; ++i) {
      ImGui::Text("▧ %s", resources[i]);
      ImGui::SameLine(size.x - 250);
      ImGui::TextDisabled("场景");
      ImGui::SameLine(size.x - 100);
      ImGui::TextDisabled("已同步");
      if (i != 2) ImGui::Separator();
    }
    ImGui::EndChild();
    if (!m_notice.empty()) {
      ImGui::SetCursorPos(ImVec2(48, size.y - 30));
      ImGui::TextDisabled("%s", m_notice.c_str());
    }
  }

  void drawCard(const TomCat::Ref<TomCat::Project>& project, size_t index, const ImVec2& pos, const ImVec2& cardSize) {
    ImGui::SetCursorPos(pos);
    ImGui::BeginChild((std::string("Card") + std::to_string(index)).c_str(), cardSize, true);
    ImGui::PushStyleColor(ImGuiCol_ChildBg, cardColor(index));
    ImGui::BeginChild("CardCover", ImVec2(-1, 84), false);
    ImGui::TextUnformatted(templateFor(index));
    ImGui::EndChild();
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::SetWindowFontScale(1.08f);
    ImGui::TextUnformatted(project ? project->GetName().c_str() : "未命名项目");
    ImGui::SetWindowFontScale(1.0f);
    ImGui::TextDisabled("%s", index == 0 ? "俯视角关卡原型。" : index == 1 ? "从一个可运行的 2D 场景开始。" : "平台、角色和碰撞器已经就位。");
    ImGui::SetCursorPosY(cardSize.y - 56);
    ImGui::TextDisabled("1 个资源");
    ImGui::SameLine(cardSize.x - 104);
    ImGui::TextDisabled("1 个场景");
    if (ImGui::Button("打开编辑器", ImVec2(122, 34)) && project) {
      TomCat::ProjectManager::Get().SetActiveProject(project);
      TomCat::ProjectManager::Get().OpenProjectInEditor(project);
    }
    ImGui::EndChild();
  }

  TomCat::Ref<TomCat::Project> projectForCard(size_t index) const {
    const char* names[] = { "纸片人冒险", "星际农场", "霓虹街区" };
    for (const auto& project : m_projects)
      if (project && project->GetName().find(names[index % 3]) != std::string::npos)
        return project;
    return index < m_projects.size() ? m_projects[index] : nullptr;
  }

private:
  std::vector<TomCat::Ref<TomCat::Project>> m_projects;
  char m_search[128] = {};
  int m_sort = 0;
  bool m_rescan = false;
  std::string m_notice;
};

TomCat::Application* g_hubApplication = nullptr;
WebHubLayer* g_hubLayer = nullptr;
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

  g_hubLayer = new WebHubLayer();
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
