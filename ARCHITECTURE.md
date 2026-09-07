# Web 迁移边界与运行协议

TomCat 的桌面实现继续由上游 `TomCat/`、GLFW 和 OpenGL 驱动；Web 目标不改这些核心文件。页面由 `src/` 中的 React + TypeScript 组件渲染，WASM 适配器是唯一与 Emscripten 和虚拟文件系统交互的地方。

## 生命周期

```text
React Hub/Editor -> WebBridge.dispatch(command)
                 -> Registry adapter (scene/assets/input/storage)
                 -> C++ bridge / existing engine facade
                 -> Bridge.emit(event)
                 -> UI event subscribers
```

`Registry` 使用字符串能力名和版本号注册 adapter。引擎增加能力时只添加新的 adapter；旧前端仍可读取能力清单并优雅降级。桌面端可以注册 GLFW adapter，浏览器端注册 WebGL/DOM adapter，因此两者共享项目、资源和事件协议。

## 事件协议

命令和事件均为 JSON 对象：

```json
{"type":"project.open","payload":{"id":"demo"}}
{"type":"scene.changed","payload":{"scene":"Main","entities":3}}
```

事件桥保留顺序并支持取消订阅；adapter 可将失败映射为 `bridge.error`，避免 C++ 异常穿过 WASM ABI。

## 存储

浏览器实现默认把项目清单和编辑器状态写入 `localStorage`；资源文件由可替换的 IndexedDB/IDBFS adapter 承载。导入导出使用标准 File System Access API（不可用时回退到下载/上传）。所有 adapter 都是可替换的，便于后续接入云端 API。

## 验证

`web/bridge/tomcat-bridge.test.mjs` 检查注册/事件协议和双向回调；`cmake --build` 可在本机编译不依赖 Emscripten 的 bridge。安装 Emscripten 后，用 `emcmake` 复用同一个 CMake 项目即可生成 WASM。
