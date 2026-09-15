# TomCat Web 平台实施记录

本记录以 TomCat Engine `288dd3db139d527de7e42f837a2f791b40219c94`
（2026-09-15）为唯一分析基线。`engine.latest.lock` 固定该提交，
`scripts/fetch_engine_latest.py` 将它拉取到独立目录，不覆盖仍依赖旧补丁的现有 WASM 缓存。

## 当前结论

### C# 浏览器运行

`prototypes/TomCat.BrowserScriptProbe` 已在真实浏览器的 .NET 10 WebAssembly
运行时中引用并执行最新版 `TomCat.Managed`、`TomCat.ScriptHost` 和
`TomCat.ScriptGenerator`。验证使用生成器编译真实 `Assembly-CSharp.dll`，随后在浏览器内：

1. 创建 `Metadata ScriptDomain`；
2. 从字节动态加载游戏程序集；
3. 读取脚本清单、生命周期位与 Inspector 字段默认值；
4. 建立 Play 域、实例化脚本，并实际触发 `OnCreate` / `OnDestroy`；
5. 发起脚本域卸载并轮询 100 次。

程序集、元数据和基础脚本生命周期通过；可回收 `AssemblyLoadContext` 未能卸载。生命周期
实例在验证中保持禁用，以避免调用尚未接入浏览器的 Native API。因此桌面 Player 的 hostfxr 入口不能
原样进入浏览器，浏览器也不能依赖“卸载项目程序集后继续复用进程”的隔离模型。

Web 端采用以下生命周期：

```text
作品页面 -> 创建专用 Worker -> 启动 .NET WASM + TomCat native runtime
                                  -> 加载一个作品
退出/停止 -> 终止 Worker -> 释放完整线性内存、脚本静态状态与程序集
```

编辑器切换项目或退出 Play Mode 时同样销毁 Play Worker。编辑器自身只保留场景作者态和
脚本元数据；需要重新读取另一项目脚本元数据时重建 Metadata Worker。

为了保留现有 `NativeApiV1`/`ManagedApiV2` 语义与性能，推荐让 .NET browser-wasm
构建成为最终链接器，通过 `WasmNativeFileReference` 链接 Emscripten 编译的 TomCat
静态库。C++ 与托管代码位于同一个 WebAssembly 运行环境，避免两个独立 WASM 模块之间
无法共享函数指针和线性内存的问题。下一项验证是用最小 Native API 表完成
`OnCreate -> OnUpdate -> Transform` 往返。

运行验证：

```powershell
python scripts/fetch_engine_latest.py
dotnet build prototypes/TomCat.BrowserScriptProbe/TomCat.BrowserScriptProbe.csproj `
  -c Release --configfile prototypes/NuGet.Config
dotnet run --project prototypes/TomCat.BrowserScriptProbe/TomCat.BrowserScriptProbe.csproj `
  -c Release --no-build
```

也可以通过 `-p:TomCatEngineRoot=...` 指定其他上游检出。

### 独立 Web Player

`src/platform/web-player.ts` 已实现浏览器宿主生命周期和 TCPAK 内存传输；
`wasm/include/tomcat_web_platform_api.h` 固定了与 C++ 侧的最小 ABI：boot、frame、resize、shutdown。
它有意复用新版 Player 的以下流程：

```text
MountCookedPackage -> PreloadCookedShaders/Textures -> ConfigureCookedPackage
-> ActivateRuntime -> LoadEntryScene -> Scene::OnUpdateRuntime
```

C++ 侧仍需完成的移植：

- 给 `Application` 提取公开的单帧入口，内容与桌面 `Run()` 的一次循环一致；
- 让 `PlayerRuntimeLayer` 从浏览器内存或虚拟文件读取 TCPAK；
- 将 OpenGL 4.6 调用和 Shader 变体收敛到 WebGL2/GLES3；
- 增加 WebAudio 后端；
- 用浏览器脚本运行时替换 `CreateMountedManagedRuntime` 的 hostfxr 分支；
- 把资源后台任务配置为 pthread Worker，或在无 SharedArrayBuffer 时使用受限单线程队列。

当前机器没有 `emcc`，所以 C++ Player 尚未生成新的 WASM。第一条运行验收应使用
`Samples/PhysicsPlayground` 的无脚本包，检查 TCPAK、入口场景、固定步长物理和渲染；
随后再加入 C# 测试包。

### 编辑 API

`src/platform/tomcat-protocol.ts` 定义了 `tomcat.web.v1` RPC，并提供 Vue 可调用的
`EngineRpcClient`。第一批命令包括：

- `system.capabilities`
- `project.open`
- `scene.snapshot`
- `scene.transact`
- `history.undo` / `history.redo`
- `asset.list`

所有 Scene、Entity、Component、Property 和 Asset 的 64 位标识在 JavaScript 边界上使用
十进制字符串，禁止转换为 `number`。每次事务携带 `baseRevision`，引擎只在版本一致时
调用组件注册表和 `SceneHistory` 提交操作，并返回新的修订号。这样 Vue 不会绕过
上游组件校验或自行维护另一套撤销栈。

C++ 侧通过 `tc_web_editor_rpc` 接收 JSON。实现顺序是：能力查询和只读快照、Transform
事务、实体增删、组件增删、资源列表，最后覆盖全部注册组件。Vue 只有收到成功响应后
才应用引擎返回的快照；版本冲突时重新获取快照并提示用户。

### 云端保存与构建发布

`src/platform/cloud-client.ts` 已实现带 Cookie 会话的保存和发布客户端。保存采用 ETag
乐观并发：首次保存发送 `If-None-Match: *`，后续保存发送 `If-Match`。服务器返回
409/412 时客户端抛出 `CloudConflictError`，不得静默覆盖较新的项目版本。

首版服务端接口为：

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| POST | `/v1/projects/{id}/revisions` | 保存不可变项目修订，校验 ETag |
| POST | `/v1/projects/{id}/releases` | 从指定修订创建 Web 构建任务 |
| GET | `/v1/releases/{id}` | 查询构建状态和公开版本 |

Revision 保存 `Project.tcproj`、三个 ProjectSettings 文件、按 Handle 索引的场景及资源哈希；
原始资源放对象存储。Release 必须引用不可变 Revision，并记录 Engine commit、TCPAK 版本、
Web Player build ID 和 C# ABI 版本。构建 Worker 在隔离的 Windows 环境运行 `TomCatCLI cook`，
再生成与固定 Web Player 兼容的发布清单。只有构建状态为 `ready` 的 Release 才能公开。

## 验收门槛

1. 浏览器脚本：OnCreate、Update、FixedUpdate、碰撞回调、异常隔离和完整 Worker 回收通过。
2. Player：PhysicsPlayground 连续运行十分钟，重启五十次，入口场景和资源 Hash 校验通过。
3. Editor：移动实体后 Undo/Redo 与桌面结果一致；两个标签页产生可检测的修订冲突。
4. Cloud：发布版本不随草稿变化；旧 Release 始终由记录的 Player build 打开。
