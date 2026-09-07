# Tc_Engine_Web

TomCat Engine 的独立 Web 兼容层、Hub 和 Editor。C++ 引擎仓库作为上游，本仓库在流水线中按 `engine.lock` 指定的分支拉取上游，构建 WebAssembly 并打包静态站点。

## 目录

```text
src/              React + Vite + TypeScript 页面、组件和运行时适配器
bridge/           Web、WASM、GLFW 双向通信与测试
wasm/             Emscripten 构建、WASM 资源和运行时产物
port/            应用在上游 main 之上的确定性 Web 移植补丁
scripts/         上游拉取脚本
engine.lock      上游仓库及跟踪分支
netlify.toml     Netlify 发布配置
```

## 本地预览

```powershell
npm install
npm run dev
```

打开 Vite 地址后会进入上游 Dear ImGui Hub；Hub 中打开项目会进入 `/editor/`，由同一个
WebAssembly 模块启动上游 EditorLayer。React 只负责挂载画布和生命周期，Hub、场景渲染、
序列化、资源操作与运行预览均由上游引擎完成。

## 拉取上游引擎

```powershell
python scripts/fetch_engine.py
```

上游会放在 `.engine/TomCat_Engine`。脚本始终拉取 `engine.lock` 中的上游分支（当前跟踪 `main`），并**递归检出主仓库记录的真实子模块提交**：Box2D、GLFW、ImGuizmo、glm、spdlog（另有桌面专用 VulkanSDK）。ImGui、yaml-cpp、entt、stb_image 等由上游直接以源码提交在主仓库中，随主提交一并锁定。随后把 `port/tomcat-web-runtime.patch` 的 Web 移植补丁应用到干净检出。补丁只做平台替换：Windows/Vulkan/glad/GL 4.5 专属代码留在桌面端，Web 构建使用 GLES3/WebGL2、浏览器虚拟文件系统和 Emscripten GLFW。

## 构建 WASM

安装 Emscripten 后运行：

```powershell
python scripts/fetch_engine.py
emcmake cmake -S wasm -B build/wasm -DTOMCAT_WEB_EMSCRIPTEN=ON -DTOMCAT_ENGINE_SOURCE=.engine/TomCat_Engine
cmake --build build/wasm --config Release
npm run build
```

Netlify 按仓库根目录的 `netlify.toml` 执行 `npm run build`，从 `dist/` 发布 React 页面和已锁定的 WASM 模块。

`build/wasm/tomcat_web_module.js`、`.wasm` 与 `.data` 是真正由上游引擎源码编译链接出来的产物：`tomcat_engine_core` 直接编译 `TomCat/src` 中的 Scene、Renderer、Project、Core 代码，链接上游 Box2D 与 yaml-cpp 的静态库；`tomcat_imgui` 编译上游 Dear ImGui 及 GLFW/OpenGL3 后端；同一个模块里还编译 Hub 与 Editor 的 Layer。`.data` 预加载上游 Editor 的 `Packages` 资源，入口 `tc_web_runtime_*` 与 `tc_web_hub_*` 分别驱动 EditorLayer 与 Hub Layer，逐帧渲染 ImGui 画布。

每次推送到部署分支后由 Netlify 自动触发构建；WASM 运行时产物已随仓库版本锁定，Netlify 不需要安装 Emscripten 或触发 GitHub Actions。

## 部署

- Netlify 发布目录：`dist`
- GitHub Actions 不参与线上部署。

ASP.NET Core 后端、Redis 和 SQLite/Volume 后续作为 Railway 服务接入，前端只保存公开的 API 地址，不保存服务器密钥。
