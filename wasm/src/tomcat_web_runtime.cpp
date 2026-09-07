#include "tomcat_web.hpp"

#include <GLFW/glfw3.h>

#include "TomCat/Core/Base.h"
#include "TomCat/Core/Log.h"
#include "TomCat/Core/Timestep.h"
#include "TomCat/Renderer/RenderCommand.h"
#include "TomCat/Renderer/Renderer.h"
#include "TomCat/Scene/Components.h"
#include "TomCat/Scene/Entity.h"
#include "TomCat/Scene/Scene.h"

#include "imgui.h"
#include "backends/imgui_impl_glfw.h"
#include "backends/imgui_impl_opengl3.h"

namespace {

TomCat::Scene* g_scene = nullptr;
GLFWwindow* g_window = nullptr;
bool g_running = false;
uint32_t g_width = 1280;
uint32_t g_height = 720;

void BuildDemoScene(TomCat::Scene& scene)
{
	using namespace TomCat;

	// Primary orthographic camera.  Sprite rendering is Y-up; place the
	// camera at the origin so Scene::OnRenderRuntime() draws with its own
	// projection matrix.
	Entity camera = scene.CreateEntity("Main Camera");
	camera.GetComponent<Transform>()._Translation = glm::vec3(0.0f, 0.0f, 0.0f);
	auto& cameraComponent = camera.AddComponent<C_Camera>();
	cameraComponent._Camera.SetOrthographic(5.0f, -1.0f, 1.0f);
	cameraComponent._Camera.SetViewportSize(g_width, g_height);
	cameraComponent.Primary = true;

	// Static floor.
	Entity ground = scene.CreateEntity("Ground");
	ground.GetComponent<Transform>()._Translation = glm::vec3(0.0f, -2.0f, 0.0f);
	ground.GetComponent<Transform>()._Scale = glm::vec3(8.0f, 1.0f, 1.0f);
	ground.AddComponent<SpriteRenderer>(glm::vec4(0.25f, 0.35f, 0.45f, 1.0f));
	ground.AddComponent<Rigidbody2D>();
	auto& groundCollider = ground.AddComponent<BoxCollider2D>();
	groundCollider.Size = glm::vec2(4.0f, 0.5f);

	// Dynamic sprite that will live in the Box2D world.
	Entity box = scene.CreateEntity("Player");
	box.GetComponent<Transform>()._Translation = glm::vec3(0.0f, 0.0f, 0.0f);
	box.GetComponent<Transform>()._Scale = glm::vec3(0.5f, 0.5f, 1.0f);
	box.AddComponent<SpriteRenderer>(glm::vec4(0.95f, 0.55f, 0.25f, 1.0f));
	auto& rigidbody = box.AddComponent<Rigidbody2D>();
	rigidbody.Type = Rigidbody2D::BodyType::Dynamic;
	rigidbody.FixedRotation = true;
	auto& boxCollider = box.AddComponent<BoxCollider2D>();
	boxCollider.Size = glm::vec2(0.25f, 0.25f);
}

} // namespace

extern "C" {

int tc_web_runtime_boot(int width, int height)
{
	TomCat::Log::Init();

	if (!glfwInit())
		return -1;

	glfwWindowHint(GLFW_RESIZABLE, GLFW_FALSE);
	g_window = glfwCreateWindow(width > 0 ? width : (int)g_width,
		height > 0 ? height : (int)g_height, "TomCat Engine", nullptr, nullptr);
	if (!g_window)
		return -2;

	g_width = width > 0 ? (uint32_t)width : g_width;
	g_height = height > 0 ? (uint32_t)height : g_height;
	glfwMakeContextCurrent(g_window);
	glfwSwapInterval(1);

	TomCat::Renderer::Init();

	IMGUI_CHECKVERSION();
	ImGui::CreateContext();
	ImGuiIO& io = ImGui::GetIO();
	io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
	io.Fonts->AddFontFromFileTTF("/Packages/fonts/opensans/OpenSans-Regular.ttf", 18.0f);
	ImGui::StyleColorsDark();
	ImGui_ImplGlfw_InitForOpenGL(g_window, true);
	ImGui_ImplOpenGL3_Init("#version 300 es");
	TC_Core_Info("Dear ImGui {0} initialized for WebGL2", ImGui::GetVersion());

	g_scene = new TomCat::Scene();
	g_scene->OnViewportResize(g_width, g_height);
	BuildDemoScene(*g_scene);
	g_scene->OnRuntimeStart();
	g_running = true;

	TomCatWeb::Bridge::instance().boot();
	return 0;
}

void tc_web_runtime_frame(double seconds)
{
	glfwPollEvents();
	if (!g_running || !g_scene)
		return;

	g_scene->OnUpdateRuntime(TomCat::Timestep((float)seconds));
	g_scene->OnRenderRuntime();

	ImGui_ImplOpenGL3_NewFrame();
	ImGui_ImplGlfw_NewFrame();
	ImGui::NewFrame();
	{
		ImGui::Begin("TomCat Engine");
		ImGui::Text("Dear ImGui %s", ImGui::GetVersion());
		ImGui::Separator();
		ImGui::Text("Runtime: WebGL2 / Emscripten GLFW");
		ImGui::Text("Viewport: %u x %u", g_width, g_height);
		ImGui::Text("Rendering scene: %s", g_scene ? "running" : "stopped");
		ImGui::TextDisabled("Engine sources: Scene / Renderer2D / Box2D");
		ImGui::End();
	}
	ImGui::Render();
	ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

	glfwSwapBuffers(g_window);

	TomCatWeb::Bridge::instance().frame(seconds);
}

void tc_web_runtime_shutdown()
{
	g_running = false;
	if (g_scene)
	{
		g_scene->OnRuntimeStop();
		delete g_scene;
		g_scene = nullptr;
	}

	TomCat::Renderer::Shutdown();
	ImGui_ImplOpenGL3_Shutdown();
	ImGui_ImplGlfw_Shutdown();
	ImGui::DestroyContext();
	if (g_window)
	{
		glfwDestroyWindow(g_window);
		g_window = nullptr;
	}
	glfwTerminate();
	TomCatWeb::Bridge::instance().shutdown();
}

} // extern "C"
