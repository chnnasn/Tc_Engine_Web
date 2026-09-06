cmake_minimum_required(VERSION 3.20)
project(tomcat_web LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(TOMCAT_WEB_EMSCRIPTEN "Build with emscripten" OFF)
set(TOMCAT_ENGINE_SOURCE "" CACHE PATH "Path to the pinned TomCat_Engine checkout")

if(TOMCAT_ENGINE_SOURCE)
  if(NOT EXISTS "${TOMCAT_ENGINE_SOURCE}/TomCat/src/TomCat.h")
    message(FATAL_ERROR "TOMCAT_ENGINE_SOURCE does not point to a TomCat_Engine checkout")
  endif()
  message(STATUS "Using TomCat_Engine source: ${TOMCAT_ENGINE_SOURCE}")
endif()

add_library(tomcat_web STATIC src/tomcat_web.cpp)
target_include_directories(tomcat_web PUBLIC include)
target_compile_definitions(tomcat_web PUBLIC TOMCAT_WEB=1)

if(TOMCAT_WEB_EMSCRIPTEN)
  set_target_properties(tomcat_web PROPERTIES SUFFIX ".a")
  target_compile_options(tomcat_web PRIVATE -fexceptions)

  # A no-entry Emscripten module exports only the stable C ABI. The existing
  # desktop application remains outside this target and is not modified.
  add_executable(tomcat_web_module src/tomcat_web.cpp)
  target_include_directories(tomcat_web_module PRIVATE include)
  target_compile_definitions(tomcat_web_module PRIVATE TOMCAT_WEB=1)
  target_compile_options(tomcat_web_module PRIVATE -fexceptions)
  target_link_options(tomcat_web_module PRIVATE
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_NAME=TomCatWebModule"
    "SHELL:-sNO_ENTRY=1"
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sEXPORTED_FUNCTIONS=['_tc_web_set_event_callback','_tc_web_boot','_tc_web_shutdown','_tc_web_frame','_tc_web_push_event','_tc_web_poll_event','_tc_web_dispatch']"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','addFunction','removeFunction']"
  )
endif()

if(TOMCAT_WEB_BUILD_RUNTIME)
  add_executable(tomcat_web_runtime src/tomcat_web_runtime.cpp)
  target_link_libraries(tomcat_web_runtime PRIVATE tomcat_web)
endif()
