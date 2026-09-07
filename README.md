# Tc_Engine_Web

TomCat Engine 的独立 Web 兼容层、Hub 和 Editor。C++ 引擎仓库作为上游，本仓库在流水线中按 `engine.lock` 指定的分支拉取上游，构建 WebAssembly 并打包静态站点。

## 目录

```text
bridge/          Web、WASM、GLFW 双向通信与测试
hub/             Hub 源文件
editor/          Editor 源文件
shared/          Hub 与 Editor 共用资源
wasm/            Emscripten 构建、引擎 Web 运行时入口和发布目录
port/            应用在上游 main 之上的确定性 Web 移植补丁
scripts/         上游拉取脚本
engine.lock      上游仓库及跟踪分支
netlify.toml     Netlify 发布配置
```

## 本地预览

```powershell
python -m http.server 8080 --directory wasm/public
```

打开 `http://localhost:8080/`，默认进入 Hub。

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
```

流水线执行相同流程，并上传包含 Hub、Editor 和 WASM 模块的静态站点产物。

`build/wasm/tomcat_web_module.js`、`.wasm` 与 `.data` 是真正由上游引擎源码编译链接出来的产物：`tomcat_engine_core` 直接编译 `TomCat/src` 中的 Scene、Renderer、Project、Core 代码，链接上游 Box2D 与 yaml-cpp 的静态库；`.data` 预加载上游 Editor 的 `Packages` 资源（含 `Texture.glsl`），引擎入口 `tc_web_runtime_*` 负责初始化场景、Box2D 世界并驱动每帧渲染。

流水线支持三种更新入口：Web 仓库提交、每小时检查上游 `main`、以及 `repository_dispatch` 事件。上游仓库更新后，可以发送 `tomcat-engine-updated` 事件立即触发同步；没有配置事件转发时，定时任务仍会自动拉取最新分支。

## 部署

- Netlify 发布目录：`wasm/public`
- GitHub Actions Secrets：`NETLIFY_AUTH_TOKEN`、`NETLIFY_SITE_ID`
- 未配置 Netlify Secrets 时，流水线仍会完成测试、WASM 构建和 artifact 上传，但不会发布线上站点。

ASP.NET Core 后端、Redis 和 SQLite/Volume 后续作为 Railway 服务接入，前端只保存公开的 API 地址，不保存服务器密钥。
