# TomCat Web 运行时

这个目录把 TomCat_Engine 的 C++ 核心用 Emscripten 编译成浏览器运行时，而不是维护一套并行实现。

## 产物边界

- `tomcat_engine_core`：直接编译上游 `TomCat/src` 的 Scene、ECS、Renderer2D、Project、Core 与 platform/OpenGL，链接上游锁定提交的 Box2D（真实子模块）与随主仓库源码提交的 yaml-cpp。
- `tomcat_imgui`：直接编译上游提交中的 Dear ImGui（含 GLFW/OpenGL3 后端与上游回调钩子），Web 版与 WebGui 示例同构。
- `tomcat_web_module.{js,wasm,data}`：最终 Web 运行时。`.data` 预加载上游 Editor `Packages`（着色器等资源），导出的 `tc_web_runtime_boot/frame/shutdown` 创建 GLFW/WebGL2 上下文、初始化引擎、绘制场景，并叠加运行中的 ImGui 窗口。
- 桌面专属内容不进入 WASM：Win32 Window/Input/PlatformUtils、VulkanSDK、shaderc/SPIR-V、glad/GL 4.5 DSA 调用。对应替换是 WebGL2（GLES3 API）、浏览器文件/输入模型和 Emscripten GLFW。
- 上游 Editor/Hub 的完整 ImGui 面板（ContentBrowser、SceneHierarchy 等）仍依赖 Win32 文件与进程接口，属于下一阶段；本运行时已把 Dear ImGui 本身和引擎场景数据接进浏览器画布。

`port/tomcat-web-runtime.patch` 在每次流水线干净检出上游 `main` 后应用，保证可复现。

## Emscripten 构建

```powershell
python scripts/fetch_engine.py
emcmake cmake -S wasm -B build/wasm -DTOMCAT_WEB_EMSCRIPTEN=ON -DTOMCAT_ENGINE_SOURCE=.engine/TomCat_Engine
cmake --build build/wasm --config Release
```

产物位于 `build/wasm/tomcat_web_module.*`。本地 Node 冒烟测试（不创建 GL 上下文）：

```powershell
cd build/wasm
node -e "const f=require('./tomcat_web_module.js'); f({locateFile:p=>'./'+p}).then(m=>console.log(typeof m._tc_web_runtime_boot))"
```

## 本地预览

`python -m http.server 8080 --directory wasm/public`，打开 `http://localhost:8080`。
