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

打开 Vite 地址后，React Hub 负责登录、项目、资源和工作区管理；打开项目会进入
React 托管的 `/editor/` 页面，由同一个上游 WebAssembly 模块启动 EditorLayer。
React 组件只负责页面状态与桥接，场景渲染、序列化和运行预览仍由上游引擎完成。

`/manage/` 由 React 渲染工作区设置和用户会话，不再存在原生 Hub/Editor 管理页面。

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

流水线执行相同流程，并上传包含 Hub、Editor 和 WASM 模块的静态站点产物。

`build/wasm/tomcat_web_module.js`、`.wasm` 与 `.data` 是真正由上游引擎源码编译链接出来的产物：`tomcat_engine_core` 直接编译 `TomCat/src` 中的 Scene、Renderer、Project、Core 代码，链接上游 Box2D 与 yaml-cpp 的静态库；`tomcat_imgui` 编译上游 Dear ImGui 及 GLFW/OpenGL3 后端；同一个模块里还编译了上游 `Builder/Manager` 的 ExampleLayer（Hub）与 `Editor/TomCatInut` 的 EditorLayer（编辑器）。`.data` 预加载上游 Editor 的 `Packages` 资源（含 `Texture.glsl` 与 OpenSans 字体），引擎入口 `tc_web_runtime_*` 与 `tc_web_hub_*` 分别驱动上游 EditorLayer 与 ExampleLayer，逐帧渲染并把 ImGui 界面叠加到画布上。

流水线支持三种更新入口：Web 仓库提交、每小时检查上游 `main`、以及 `repository_dispatch` 事件。上游仓库更新后，可以发送 `tomcat-engine-updated` 事件立即触发同步；没有配置事件转发时，定时任务仍会自动拉取最新分支。

## 部署

- Netlify 发布目录：`dist`
- GitHub Actions Secrets：`NETLIFY_AUTH_TOKEN`、`NETLIFY_SITE_ID`
- 未配置 Netlify Secrets 时，流水线仍会完成测试、WASM 构建和 artifact 上传，但不会发布线上站点。

ASP.NET Core 后端、Redis 和 SQLite/Volume 后续作为 Railway 服务接入，前端只保存公开的 API 地址，不保存服务器密钥。
