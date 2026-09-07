// Browser implementation of the small platform seam used by TomCat's
// Application, Window, Input and FileDialogs interfaces.  Keeping these
// implementations behind the existing engine interfaces lets the upstream
// EditorLayer and its panels run unchanged inside the WebGL canvas.

#include "TomCat/Core/Application.h"
#include "TomCat/Core/Log.h"
#include "TomCat/Events/ApplicationEvent.h"
#include "TomCat/Events/KeyEvent.h"
#include "TomCat/Events/MouseEvent.h"
#include "TomCat/Project/ProjectManager.h"
#include "TomCat/Renderer/Renderer.h"
#include "TomCat/Utils/PlatformUtils.h"

#include <GLFW/glfw3.h>

#include <algorithm>
#include <cstring>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace {

uint32_t g_defaultWidth = 1280;
uint32_t g_defaultHeight = 720;
bool g_glfwInitialized = false;
// The browser host owns the canvas size.  Keep a weak handle to the active
// GLFW window so a resize arriving after Application construction can update
// the actual context rather than only affecting the next window.
GLFWwindow* g_activeWindow = nullptr;
std::string g_fileDialogResult;
bool g_fileDialogSave = false;

#ifdef __EMSCRIPTEN__
EM_JS(void, tc_web_request_file_dialog, (int save), {
  const detail = { source: "tomcat-engine", command: save ? "file.save" : "file.open",
                   payload: { save: !!save }, id: String(Date.now()) };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tomcat:file-dialog", { detail }));
    if (window.parent && window.parent !== window)
      window.parent.postMessage(detail, "*");
  }
});
#else
void tc_web_request_file_dialog(int) {}
#endif

struct WindowData {
  std::string title;
  uint32_t width = g_defaultWidth;
  uint32_t height = g_defaultHeight;
  bool vsync = true;
  TomCat::Window::EventCallbackFn callback;
};

void GLFWErrorCallback(int error, const char* description) {
  TC_Core_Error("GLFW error ({0}): {1}", error, description ? description : "unknown");
}

} // namespace

namespace TomCat {

class WebWindow final : public Window {
public:
  explicit WebWindow(const WindowProps& props) { Init(props); }
  ~WebWindow() override { Shutdown(); }

  void OnUpdate() override {
    glfwPollEvents();
    if (m_Window)
      glfwSwapBuffers(m_Window);
  }

  uint32_t GetWidth() const override { return m_Data.width; }
  uint32_t GetHeight() const override { return m_Data.height; }
  void SetEventCallback(const EventCallbackFn& callback) override { m_Data.callback = callback; }

  void SetVSync(bool enabled) override {
    glfwSwapInterval(enabled ? 1 : 0);
    m_Data.vsync = enabled;
  }

  bool IsVSync() const override { return m_Data.vsync; }
  void* GetNativeWindow() const override { return m_Window; }

private:
  void Init(const WindowProps& props) {
    m_Data.title = props.Title;
    m_Data.width = props.Width ? props.Width : g_defaultWidth;
    m_Data.height = props.Height ? props.Height : g_defaultHeight;

    if (!g_glfwInitialized) {
      if (!glfwInit()) {
        TC_Core_Error("Unable to initialize GLFW for the web editor");
        return;
      }
      glfwSetErrorCallback(GLFWErrorCallback);
      g_glfwInitialized = true;
    }

#ifdef __EMSCRIPTEN__
    glfwWindowHint(GLFW_CLIENT_API, GLFW_OPENGL_ES_API);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 0);
#endif
    glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
    m_Window = glfwCreateWindow(static_cast<int>(m_Data.width), static_cast<int>(m_Data.height),
                                m_Data.title.c_str(), nullptr, nullptr);
    if (!m_Window) {
      TC_Core_Error("Unable to create GLFW canvas window for the web editor");
      return;
    }

    g_activeWindow = m_Window;

    glfwMakeContextCurrent(m_Window);
    glfwSetWindowUserPointer(m_Window, &m_Data);
    SetVSync(true);

    glfwSetWindowSizeCallback(m_Window, [](GLFWwindow* window, int width, int height) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      data.width = width > 0 ? static_cast<uint32_t>(width) : data.width;
      data.height = height > 0 ? static_cast<uint32_t>(height) : data.height;
      if (data.callback) {
        WindowResizeEvent event(static_cast<unsigned int>(data.width),
                                static_cast<unsigned int>(data.height));
        data.callback(event);
      }
    });

    glfwSetWindowCloseCallback(m_Window, [](GLFWwindow* window) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (data.callback) {
        WindowCloseEvent event;
        data.callback(event);
      }
    });

    glfwSetKeyCallback(m_Window, [](GLFWwindow* window, int key, int, int action, int) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (!data.callback)
        return;
      if (action == GLFW_PRESS) {
        KeyPressedEvent event(key, 0);
        data.callback(event);
      } else if (action == GLFW_REPEAT) {
        KeyPressedEvent event(key, 1);
        data.callback(event);
      } else if (action == GLFW_RELEASE) {
        KeyReleasedEvent event(key);
        data.callback(event);
      }
    });

    glfwSetMouseButtonCallback(m_Window, [](GLFWwindow* window, int button, int action, int) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (!data.callback)
        return;
      if (action == GLFW_PRESS) {
        MouseButtonPressedEvent event(button);
        data.callback(event);
      } else if (action == GLFW_RELEASE) {
        MouseButtonReleasedEvent event(button);
        data.callback(event);
      }
    });

    glfwSetScrollCallback(m_Window, [](GLFWwindow* window, double x, double y) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (data.callback) {
        MouseScrolledEvent event(static_cast<float>(x), static_cast<float>(y));
        data.callback(event);
      }
    });

    glfwSetCursorPosCallback(m_Window, [](GLFWwindow* window, double x, double y) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (data.callback) {
        MouseMovedEvent event(static_cast<float>(x), static_cast<float>(y));
        data.callback(event);
      }
    });

    glfwSetCharCallback(m_Window, [](GLFWwindow* window, unsigned int codepoint) {
      auto& data = *static_cast<WindowData*>(glfwGetWindowUserPointer(window));
      if (data.callback) {
        KeyTypedEvent event(static_cast<int>(codepoint));
        data.callback(event);
      }
    });
  }

  void Shutdown() {
    if (m_Window) {
      if (g_activeWindow == m_Window)
        g_activeWindow = nullptr;
      glfwDestroyWindow(m_Window);
      m_Window = nullptr;
    }
    if (g_glfwInitialized) {
      glfwTerminate();
      g_glfwInitialized = false;
    }
  }

  GLFWwindow* m_Window = nullptr;
  WindowData m_Data;
};

Scope<Window> Window::Create(const WindowProps& props) {
  return CreateScope<WebWindow>(props);
}

Application* Application::s_Instance = nullptr;

Application::Application(const std::string& name, const std::string& iconPath,
                         ApplicationCommandLineArgs args)
    : m_CommandLineArgs(args) {
  TC_Core_Assert(!s_Instance, "TomCat Application already exists");
  s_Instance = this;
  m_Window = Window::Create(WindowProps(name, g_defaultWidth, g_defaultHeight, iconPath));
  m_Window->SetEventCallback(TC_Bind_Event_Fn(Application::OnEvent));
  Renderer::Init();
  m_ImGuiLayer = new ImGuiLayer();
  PushOverLayer(m_ImGuiLayer);
}

Application::~Application() {
  Renderer::Shutdown();
  s_Instance = nullptr;
}

void Application::PushLayer(Layer* layer) {
  m_LayerStack.PushLayer(layer);
  layer->OnAttach();
}

void Application::PushOverLayer(Layer* layer) {
  m_LayerStack.PushOverLayer(layer);
  layer->OnAttach();
}

void Application::Close() { m_Running = false; }

void Application::OnEvent(Event& event) {
  EventDispatcher dispatcher(event);
  dispatcher.Dispatch<WindowCloseEvent>(TC_Bind_Event_Fn(Application::OnWindowClose));
  dispatcher.Dispatch<WindowResizeEvent>(TC_Bind_Event_Fn(Application::OnWindowResize));
  for (auto it = m_LayerStack.end(); it != m_LayerStack.begin();) {
    (*--it)->OnEvent(event);
    if (event.m_Handled)
      break;
  }
}

void Application::Run() {
  while (m_Running) {
    const float now = static_cast<float>(glfwGetTime());
    Timestep timestep = now - m_LastFrameTime;
    m_LastFrameTime = now;
    if (!m_Minized) {
      for (Layer* layer : m_LayerStack)
        layer->OnUpdate(timestep);
      m_ImGuiLayer->Begin();
      for (Layer* layer : m_LayerStack)
        layer->OnImGuiRender();
      m_ImGuiLayer->End();
    }
    m_Window->OnUpdate();
  }
}

bool Application::OnWindowClose(WindowCloseEvent&) {
  m_Running = false;
  return true;
}

bool Application::OnWindowResize(WindowResizeEvent& event) {
  if (event.GetWidth() == 0 || event.GetHeight() == 0) {
    m_Minized = true;
    return false;
  }
  m_Minized = false;
  Renderer::OnWindowResize(event.GetWidth(), event.GetHeight());
  return false;
}

std::string FileDialogs::OpenFile(const char*) {
  g_fileDialogSave = false;
  if (!g_fileDialogResult.empty()) {
    std::string result = std::move(g_fileDialogResult);
    g_fileDialogResult.clear();
    return result;
  }
  tc_web_request_file_dialog(0);
  return {};
}

std::string FileDialogs::SaveFile(const char*) {
  g_fileDialogSave = true;
  if (!g_fileDialogResult.empty()) {
    std::string result = std::move(g_fileDialogResult);
    g_fileDialogResult.clear();
    return result;
  }
  tc_web_request_file_dialog(1);
  return {};
}

std::string FileDialogs::OpenFolder() {
  tc_web_request_file_dialog(0);
  return {};
}

} // namespace TomCat

extern "C" {

void tc_web_platform_resize(int width, int height) {
  if (width <= 0 || height <= 0)
    return;

  g_defaultWidth = static_cast<uint32_t>(width);
  g_defaultHeight = static_cast<uint32_t>(height);

  // GLFW's WebGL backend owns the canvas dimensions.  Make the context
  // current before changing the window so resize callbacks and the renderer
  // observe the same surface.  The registered GLFW size callback updates the
  // WindowData dimensions and dispatches the upstream WindowResizeEvent.
  if (g_activeWindow && g_glfwInitialized) {
    glfwMakeContextCurrent(g_activeWindow);
    glfwSetWindowSize(g_activeWindow, width, height);
  }
}

void tc_web_platform_set_size(int width, int height) {
  // Preserve the original pre-boot API while making it useful for a live
  // editor window as well.
  tc_web_platform_resize(width, height);
}

void tc_web_set_file_dialog_result(const char* path) {
  g_fileDialogResult = path ? path : "";
}

}
