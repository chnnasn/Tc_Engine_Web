# Tc_Engine_Web

TomCat 游戏社区与创作工作台。当前默认入口为 Vue 3 + Vite + TypeScript 静态交互原型，包含作品发现、作品详情、社区讨论、项目管理、收藏和场景编辑器界面。

这一版**不加载上游引擎或 WebAssembly**，没有服务端、真实账户或联网发布。作品封面与作品资料为演示内容，用户操作数据仅保存在当前浏览器的 localStorage 中。原来的 C++ / WASM 兼容代码仍保留在仓库中，但不参与当前前端入口与构建。

## 目录

```text
src/ui/           静态页面、共享组件、示例数据与数据验证
public/images/    三张原创示例作品封面
design-system/    设计方向、颜色、排版与交互规范
src/runtime/      原引擎运行时适配器（当前入口未引用）
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

打开终端输出的 Vite 地址后会进入游戏发现页。`npm run build` 生成 `dist/` 静态站点，`npm run preview` 可预览构建产物。

| 路径 | 功能 |
| --- | --- |
| `/` | 作品分类、搜索、排序、收藏 |
| `/games/forest` 等 | 作品介绍、本地留言、播放器界面预览 |
| `/community` | 话题筛选、搜索、新建本地话题 |
| `/community/:id` | 讨论详情与本地回复 |
| `/projects` | 新建、重命名、复制、删除、搜索、切换视图、导入导出 |
| `/editor/:id` | 场景层级、属性编辑、背景素材、缩放、保存、发布预览 |
| `/profile` | 已收藏的示例游戏 |
| `/preview/:id` | 本地作品发布预览，展示作品介绍与播放器入口 |

编辑器支持 Ctrl / ⌘ + S 保存。项目导出格式为本站静态原型专用的 `.tomcat.json`，包含项目资料与已保存的场景，支持重新导入。它与上游引擎项目格式不同。导入限制 2 MB、100 个对象；清除浏览器站点数据会删除本地项目，建议先导出备份。发布按钮只生成本地展示状态，不上传或公开作品；播放器不会执行游戏逻辑。

页面采用暖白背景、少量森林绿、Lucide 图标与响应式布局。设计说明位于 `design-system/MASTER.md`。

## 保留的引擎构建流程

以下内容是后续接入时可参考的原有流程。当前 Vite 的 `publicDir` 是 `public/`，构建不会复制或加载 `wasm/public/` 内的产物；仅编译 WASM 不会让当前静态原型自动连接引擎。

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

Netlify 按仓库根目录的 `netlify.toml` 执行 `npm run build`，当前只从 `dist/` 发布静态前端与封面素材。

`build/wasm/tomcat_web_module.js`、`.wasm` 与 `.data` 是真正由上游引擎源码编译链接出来的产物：`tomcat_engine_core` 直接编译 `TomCat/src` 中的 Scene、Renderer、Project、Core 代码，链接上游 Box2D 与 yaml-cpp 的静态库；`tomcat_imgui` 编译上游 Dear ImGui 及 GLFW/OpenGL3 后端；同一个模块里还编译 Hub 与 Editor 的 Layer。`.data` 预加载上游 Editor 的 `Packages` 资源，入口 `tc_web_runtime_*` 与 `tc_web_hub_*` 分别驱动 EditorLayer 与 Hub Layer，逐帧渲染 ImGui 画布。

当前静态前端构建不需要安装 Emscripten，也不需要先拉取上游引擎。

## 部署

- Netlify 发布目录：`dist`
- GitHub Actions 不参与线上部署。

ASP.NET Core 后端、Redis 和 SQLite/Volume 后续作为 Railway 服务接入，前端只保存公开的 API 地址，不保存服务器密钥。
