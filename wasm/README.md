# TomCat Web 兼容层

这个目录提供不改动 `TomCat/` C++ 引擎核心的 Web 适配层。适配层把引擎能力抽象成稳定的注册表：核心新增功能只需要在 Web 侧注册一个 adapter，不需要修改桌面代码。

## 架构

- `include/tomcat_web.hpp`：平台无关的 ABI、事件、项目/资源数据结构和注册表。
- `src/tomcat_web.cpp`：注册表、双向事件桥和 JSON-safe 快照实现。
- `public/`：Hub + Editor 静态前端（可直接由任意静态服务器托管）。
- `CMakeLists.txt`：原生编译用于单元测试；用 Emscripten 时传 `-DTOMCAT_WEB_EMSCRIPTEN=ON`。

适配层通过 `TomCatWeb::Registry::registerFeature` 注册 `scene`, `asset`, `renderer` 等能力，并以 `Bridge` 双向转发浏览器事件与引擎事件。GLFW 桌面端可复用同一套接口：在桌面启动时注册 GLFW adapter，在浏览器启动时注册 WebGL adapter。

## Emscripten 构建

```powershell
cd web/wasm
emcmake cmake -S . -B build -DTOMCAT_WEB_EMSCRIPTEN=ON
cmake --build build
```

生成的 wasm 模块可以由 `public/` 中的前端通过 `TomCatWeb.create()` 加载。前端没有硬编码 C++ 符号，只依赖 adapter 名称和事件协议。

## 本地预览

无需 Node 依赖：`python -m http.server 8080 --directory web/wasm/public`，打开 `http://localhost:8080`。
