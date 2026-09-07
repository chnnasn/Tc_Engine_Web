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
add_library(tomcat_web STATIC src/tomcat_web.cpp)
target_include_directories(tomcat_web PUBLIC include)
target_compile_definitions(tomcat_web PUBLIC TOMCAT_WEB=1)

# ---------------------------------------------------------------------------
# Upstream engine runtime sources.
#
# TomCat_Engine is a desktop app; the Web target compiles the engine core plus
# its real dependencies (Box2D, yaml-cpp, spdlog, glm, entt) with the same
# Emscripten toolchain.  Desktop-only translation units (ImGui layer,
# Application entry point, Win32 window/input/process code, Vulkan SDK and
# glad) are intentionally outside this target.
# ---------------------------------------------------------------------------
set(TC_ENGINE_SRC "${TC_ENGINE}/TomCat/src")

file(GLOB TC_ENGINE_CORE_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Core/*.cpp")
list(REMOVE_ITEM TC_ENGINE_CORE_SOURCES
  "${TC_ENGINE_SRC}/TomCat/Core/Application.cpp")

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
  set_target_properties(tomcat_engine_core PROPERTIES SUFFIX ".a")
  set_target_properties(tomcat_yaml_cpp PROPERTIES SUFFIX ".a")

  # Runtime assets are mounted from the upstream Editor Packages tree so the
  # unmodified engine renderer finds "Packages/shaders/Texture.glsl" at the
  # filesystem root.
  set(TC_ASSETS_SOURCE "${TC_ENGINE}/Editor/TomCatInut/Packages")
  set(TC_ASSETS_DIR "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets")
  file(COPY "${TC_ASSETS_SOURCE}"
       DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets")

  target_compile_options(tomcat_engine_core PRIVATE -fexceptions)
  target_compile_options(tomcat_engine_core PUBLIC "-sUSE_GLFW=3")

  # A no-entry module exposes both the existing C ABI bridge and the engine
  # runtime entry points.  Shaders and fonts travel as a .data payload.
  add_executable(tomcat_web_module src/tomcat_web_runtime.cpp)
  target_include_directories(tomcat_web_module PRIVATE
    include
    "${TC_ENGINE_SRC}")
  target_compile_definitions(tomcat_web_module PRIVATE
    TC_PLATFORM_WEB=1
    TC_BUILD_WEB=1
    TOMCAT_WEB=1)
  target_compile_options(tomcat_web_module PRIVATE
    -fexceptions
    "-sUSE_GLFW=3")
  target_link_libraries(tomcat_web_module PRIVATE
    tomcat_web
    tomcat_engine_core)
  target_link_options(tomcat_web_module PRIVATE
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_NAME=TomCatWebModule"
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sMAX_WEBGL_VERSION=2"
    "SHELL:-sMIN_WEBGL_VERSION=2"
    "SHELL:-sUSE_GLFW=3"
    "SHELL:-sEXPORTED_FUNCTIONS=['_tc_web_set_event_callback','_tc_web_boot','_tc_web_shutdown','_tc_web_frame','_tc_web_push_event','_tc_web_poll_event','_tc_web_dispatch','_tc_web_runtime_boot','_tc_web_runtime_frame','_tc_web_runtime_shutdown']"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','addFunction','removeFunction']"
    "--preload-file=${TC_ASSETS_DIR}/Packages@/Packages"
    "-sUSE_GLFW=3")
endif()
