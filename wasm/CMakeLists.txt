cmake_minimum_required(VERSION 3.20)
project(tomcat_web LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(TOMCAT_WEB_EMSCRIPTEN "Build with emscripten" OFF)
set(TOMCAT_ENGINE_SOURCE "" CACHE PATH "Path to the pinned TomCat_Engine checkout")

if(NOT TOMCAT_ENGINE_SOURCE)
  message(FATAL_ERROR "TOMCAT_ENGINE_SOURCE is required for the TomCat Web runtime")
endif()

get_filename_component(TC_ENGINE "${TOMCAT_ENGINE_SOURCE}" ABSOLUTE)
if(NOT EXISTS "${TC_ENGINE}/TomCat/src/TomCat/Scene/Scene.h")
  message(FATAL_ERROR "TOMCAT_ENGINE_SOURCE does not point to a TomCat_Engine checkout")
endif()

message(STATUS "Using TomCat_Engine source: ${TC_ENGINE}")

# ---------------------------------------------------------------------------
# Web bridge (protocol adapter, host neutral)
# ---------------------------------------------------------------------------
add_library(tomcat_web STATIC
  src/tomcat_web.cpp
  src/tomcat_web_storage.cpp)
target_include_directories(tomcat_web PUBLIC include)
target_compile_definitions(tomcat_web PUBLIC TOMCAT_WEB=1)

# ---------------------------------------------------------------------------
# Upstream engine runtime sources.
#
# TomCat_Engine is a desktop app; the Web target compiles the engine core plus
# its real dependencies (Box2D, yaml-cpp, spdlog, glm, entt) with the same
# Emscripten toolchain.  Desktop-only entry/application/window-process code,
# Vulkan SDK and glad remain outside this target; the upstream ImGui layer and
# editor panels are compiled below against the WebGL2 adapters.
# ---------------------------------------------------------------------------
set(TC_ENGINE_SRC "${TC_ENGINE}/TomCat/src")

file(GLOB TC_ENGINE_CORE_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Core/*.cpp")
list(REMOVE_ITEM TC_ENGINE_CORE_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Core/Application.cpp"
  "${TC_ENGINE_SRC}/TomCat/Core/Window.cpp")

file(GLOB TC_ENGINE_RENDERER_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Renderer/*.cpp")
list(REMOVE_ITEM TC_ENGINE_RENDERER_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Renderer/Framebuffer.cpp")

file(GLOB TC_ENGINE_SCENE_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Scene/*.cpp")
file(GLOB TC_ENGINE_MATH_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Math/*.cpp")
file(GLOB TC_ENGINE_EVENT_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Events/*.cpp")
file(GLOB TC_ENGINE_PROJECT_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Project/*.cpp")
list(REMOVE_ITEM TC_ENGINE_PROJECT_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Project/ProjectManager.cpp")

file(GLOB TC_ENGINE_OPENGL_SOURCES
  "${TC_ENGINE_SRC}/platform/OpenGL/*.cpp")
list(REMOVE_ITEM TC_ENGINE_OPENGL_SOURCES
  "${TC_ENGINE_SRC}/platform/OpenGL/OpenGLFramebuffer.cpp")

# yaml-cpp in this fork cannot be configured with its own CMakeLists, so the
# upstream sources are compiled here as a first-class dependency library.
set(TC_YAML_SRC "${TC_ENGINE}/TomCat/vendor/yaml-cpp")
file(GLOB TC_YAML_SOURCES "${TC_YAML_SRC}/src/*.cpp")

add_library(tomcat_yaml_cpp STATIC ${TC_YAML_SOURCES})
target_include_directories(tomcat_yaml_cpp PUBLIC "${TC_YAML_SRC}/include")
target_compile_definitions(tomcat_yaml_cpp PUBLIC YAML_CPP_STATIC_DEFINE)

# Dear ImGui ships with the upstream engine commit (vendored source, not a
# submodule).  The GLFW and OpenGL3 backends compile against Emscripten's
# WebGL2 GLFW/GLES3 environment, exactly like the WebGui reference does.
set(TC_IMGUI_DIR "${TC_ENGINE}/TomCat/vendor/ImGui")
add_library(tomcat_imgui STATIC
  "${TC_IMGUI_DIR}/imgui.cpp"
  "${TC_IMGUI_DIR}/imgui_draw.cpp"
  "${TC_IMGUI_DIR}/imgui_tables.cpp"
  "${TC_IMGUI_DIR}/imgui_widgets.cpp"
  "${TC_IMGUI_DIR}/backends/imgui_impl_glfw.cpp"
  "${TC_IMGUI_DIR}/backends/imgui_impl_opengl3.cpp"
  "${TC_ENGINE_SRC}/TomCat/ImGui/ImGuiCallback.cpp"
  "${TC_ENGINE_SRC}/TomCat/ImGui/ImGuiLayer.cpp")
target_include_directories(tomcat_imgui PUBLIC
  "${TC_ENGINE_SRC}"
  "${TC_ENGINE}/TomCat/vendor/spdlog/include"
  "${TC_ENGINE}/TomCat/vendor/glm"
  "${TC_IMGUI_DIR}"
  "${TC_IMGUI_DIR}/backends"
  "${TC_ENGINE}/TomCat/vendor/ImGuizmo")
target_compile_definitions(tomcat_imgui PUBLIC IMGUI_IMPL_OPENGL_ES3=1)

set(TC_BOX2D_DIR "${TC_ENGINE}/TomCat/vendor/Box2D")
set(BOX2D_BUILD_UNIT_TESTS OFF CACHE BOOL "" FORCE)
set(BOX2D_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BOX2D_BUILD_TESTBED OFF CACHE BOOL "" FORCE)
set(BOX2D_BUILD_BENCHMARKS OFF CACHE BOOL "" FORCE)
add_subdirectory("${TC_BOX2D_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/box2d" EXCLUDE_FROM_ALL)

add_library(tomcat_engine_core STATIC
  ${TC_ENGINE_CORE_SOURCES}
  ${TC_ENGINE_RENDERER_SOURCES}
  ${TC_ENGINE_SCENE_SOURCES}
  ${TC_ENGINE_MATH_SOURCES}
  ${TC_ENGINE_EVENT_SOURCES}
  ${TC_ENGINE_PROJECT_SOURCES}
  ${TC_ENGINE_OPENGL_SOURCES})

# OpenGLTexture uses stb_image's implementation directly.  The desktop
# project adds this translation unit through its vendor build; include it
# explicitly here because the web target owns the engine source list.
target_sources(tomcat_engine_core PRIVATE
  "${TC_ENGINE}/TomCat/vendor/stb_image/stb_image.cpp")

target_include_directories(tomcat_engine_core PUBLIC
  "${TC_ENGINE_SRC}"
  "${TC_ENGINE}/TomCat/vendor/spdlog/include"
  "${TC_ENGINE}/TomCat/vendor/glm"
  "${TC_ENGINE}/TomCat/vendor/Box2D/include"
  "${TC_ENGINE}/TomCat/vendor/yaml-cpp/include"
  "${TC_ENGINE}/TomCat/vendor/entt/include"
  "${TC_ENGINE}/TomCat/vendor/stb_image")

target_compile_definitions(tomcat_engine_core PUBLIC
  TC_PLATFORM_WEB=1
  TC_BUILD_WEB=1
  YAML_CPP_STATIC_DEFINE)

target_link_libraries(tomcat_engine_core PUBLIC
  tomcat_yaml_cpp
  box2d)

if(TOMCAT_WEB_EMSCRIPTEN)
  # The complete upstream editor is built into the same Web module.  Its
  # panels are intentionally kept as direct source references so an upstream
  # update cannot silently replace them with a parallel UI implementation.
  set(TC_EDITOR_SRC "${TC_ENGINE}/Editor/TomCatInut/src")
  set(TC_MANAGER_SRC "${TC_ENGINE}/Builder/Manager/src")

  add_library(tomcat_editor STATIC
    "${TC_EDITOR_SRC}/EditorLayer.cpp"
    "${TC_EDITOR_SRC}/panels/ContentBrowserPanel.cpp"
    "${TC_EDITOR_SRC}/panels/SceneHierarchyPanel.cpp"
    "${TC_MANAGER_SRC}/ExampleLayer.cpp"
    "${TC_ENGINE}/TomCat/vendor/ImGuizmo/ImGuizmo.cpp")
  target_include_directories(tomcat_editor PUBLIC
    "${TC_EDITOR_SRC}"
    "${TC_MANAGER_SRC}"
    "${TC_ENGINE_SRC}"
    "${TC_ENGINE}/TomCat/vendor"
    "${TC_ENGINE}/TomCat/vendor/spdlog/include"
    "${TC_ENGINE}/TomCat/vendor/glm"
    "${TC_ENGINE}/TomCat/vendor/entt/include"
    "${TC_ENGINE}/TomCat/vendor/yaml-cpp/include"
    "${TC_ENGINE}/TomCat/vendor/Box2D/include"
    "${TC_ENGINE}/TomCat/vendor/stb_image"
    "${TC_IMGUI_DIR}"
    "${TC_IMGUI_DIR}/backends"
    "${TC_ENGINE}/TomCat/vendor/ImGuizmo")
  target_compile_definitions(tomcat_editor PUBLIC
    TC_PLATFORM_WEB=1
    TC_BUILD_WEB=1
    TOMCAT_WEB=1
    YAML_CPP_STATIC_DEFINE)
  target_compile_options(tomcat_editor PRIVATE -fexceptions "-sUSE_GLFW=3")
  target_link_libraries(tomcat_editor PUBLIC tomcat_engine_core tomcat_imgui)

  # ProjectManager is omitted from the generic core list because the desktop
  # implementation launches Win32 processes.  Its Web-guarded implementation
  # is safe for the virtual Emscripten filesystem and is needed by both panels.
  target_sources(tomcat_engine_core PRIVATE
    "${TC_ENGINE_SRC}/TomCat/Project/ProjectManager.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/tomcat_web_framebuffer.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/tomcat_web_input.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/tomcat_web_platform.cpp")

  target_compile_definitions(tomcat_imgui PUBLIC
    TC_PLATFORM_WEB=1
    TC_BUILD_WEB=1
    TOMCAT_WEB=1)
  target_compile_options(tomcat_imgui PRIVATE -fexceptions "-sUSE_GLFW=3")

  set_target_properties(tomcat_engine_core PROPERTIES SUFFIX ".a")
  set_target_properties(tomcat_yaml_cpp PROPERTIES SUFFIX ".a")

  # Runtime assets are mounted from the upstream Editor Packages tree so the
  # unmodified engine renderer finds "Packages/shaders/Texture.glsl" at the
  # filesystem root.
  set(TC_ASSETS_SOURCE "${TC_ENGINE}/Editor/TomCatInut/Packages")
  set(TC_ASSETS_DIR "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets")
  file(COPY "${TC_ASSETS_SOURCE}"
       DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets")

  # A real CJK font is required for the browser UI: OpenSans has no Chinese
  # glyphs, and desktop-only Windows fonts are not available in the Linux
  # emscripten CI image.  Download Noto Sans CJK SC (SIL OFL 1.1) on first
  # configure, with the local Windows SimHei as a development fallback.
  set(TC_CJK_FONT_DIR "${TC_ASSETS_DIR}/Packages/fonts/cjk")
  file(MAKE_DIRECTORY "${TC_CJK_FONT_DIR}")
  set(TC_CJK_FONT "${TC_CJK_FONT_DIR}/TomCat-CJK.ttf")
  if(NOT EXISTS "${TC_CJK_FONT}")
    set(TC_CJK_READY FALSE)
    foreach(TC_CJK_URL
        "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
        "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf")
      file(DOWNLOAD "${TC_CJK_URL}" "${TC_CJK_FONT}" TIMEOUT 300 STATUS TC_CJK_STATUS)
      list(GET TC_CJK_STATUS 0 TC_CJK_CODE)
      if(TC_CJK_CODE EQUAL 0 AND EXISTS "${TC_CJK_FONT}")
        set(TC_CJK_READY TRUE)
        message(STATUS "Downloaded Noto Sans CJK SC for the Web UI fonts")
        break()
      endif()
    endforeach()
    if(NOT TC_CJK_READY)
      foreach(TC_CJK_SYSTEM_FONT
          "C:/Windows/Fonts/simhei.ttf"
          "C:/Windows/Fonts/msyh.ttc"
          "C:/Windows/Fonts/simsun.ttc")
        if(EXISTS "${TC_CJK_SYSTEM_FONT}")
          get_filename_component(TC_CJK_SYSTEM_NAME "${TC_CJK_SYSTEM_FONT}" NAME)
          file(COPY "${TC_CJK_SYSTEM_FONT}" DESTINATION "${TC_CJK_FONT_DIR}")
          file(RENAME "${TC_CJK_FONT_DIR}/${TC_CJK_SYSTEM_NAME}" "${TC_CJK_FONT}")
          set(TC_CJK_READY TRUE)
          message(STATUS "Using local ${TC_CJK_SYSTEM_NAME} for the Web UI fonts")
          break()
        endif()
      endforeach()
    endif()
    if(NOT TC_CJK_READY)
      message(WARNING "No CJK font available; Chinese UI text will not render")
    endif()
  endif()

  target_compile_options(tomcat_engine_core PRIVATE -fexceptions)
  target_compile_options(tomcat_engine_core PUBLIC "-sUSE_GLFW=3")

  # A no-entry module exposes both the existing C ABI bridge and the engine
  # runtime entry points.  Shaders and fonts travel as a .data payload.
  add_executable(tomcat_web_module
    src/tomcat_web_runtime.cpp
    src/tomcat_web_hub.cpp)
  target_include_directories(tomcat_web_module PRIVATE
    include
    "${TC_ENGINE_SRC}"
    "${TC_EDITOR_SRC}"
    "${TC_MANAGER_SRC}")
  target_compile_definitions(tomcat_web_module PRIVATE
    TC_PLATFORM_WEB=1
    TC_BUILD_WEB=1
    TOMCAT_WEB=1)
  target_compile_options(tomcat_web_module PRIVATE
    -fexceptions
    "-sUSE_GLFW=3")
  target_link_libraries(tomcat_web_module PRIVATE
    tomcat_web
    tomcat_engine_core
    tomcat_imgui
    tomcat_editor)
  target_link_options(tomcat_web_module PRIVATE
    "-fexceptions"
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_NAME=TomCatWebModule"
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sMAX_WEBGL_VERSION=2"
    "SHELL:-sMIN_WEBGL_VERSION=2"
    "SHELL:-sUSE_GLFW=3"
    "SHELL:-sFORCE_FILESYSTEM=1"
    "SHELL:-lidbfs.js"
    "SHELL:-sEXPORTED_FUNCTIONS=['_tc_web_set_event_callback','_tc_web_boot','_tc_web_shutdown','_tc_web_frame','_tc_web_push_event','_tc_web_poll_event','_tc_web_dispatch','_tc_web_runtime_set_project_path','_tc_web_runtime_boot','_tc_web_runtime_frame','_tc_web_runtime_shutdown','_tc_web_runtime_set_file_dialog_result','_tc_web_editor_new_scene','_tc_web_editor_open_scene','_tc_web_editor_save_scene','_tc_web_editor_set_project','_tc_web_editor_play','_tc_web_editor_stop','_tc_web_hub_boot','_tc_web_hub_frame','_tc_web_hub_shutdown','_tc_web_hub_rescan','_tc_web_hub_poll_open_project','_tc_web_platform_set_size','_tc_web_platform_resize','_tc_web_set_file_dialog_result','_tc_web_storage_mount','_tc_web_storage_sync','_tc_web_storage_sync_pending','_tc_web_storage_sync_last_ok','_tc_web_storage_last_error','_tc_web_storage_exists','_tc_web_storage_mkdir','_tc_web_storage_remove','_tc_web_storage_size','_tc_web_storage_read','_tc_web_storage_write','_tc_web_storage_read_text','_tc_web_storage_write_text','_tc_web_storage_list','_tc_web_project_create','_tc_web_project_save','_tc_web_project_load','_tc_web_project_remove','_tc_web_scene_save','_tc_web_scene_load','_tc_web_scene_remove','_tc_web_storage_sync_complete','_malloc','_free']"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','addFunction','removeFunction','HEAPU8','FS']"
    "--preload-file=${TC_ASSETS_DIR}/Packages@/Packages"
    "-sUSE_GLFW=3")
endif()
