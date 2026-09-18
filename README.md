# Tc_Engine_Web_Front

TomCat 游戏社区与创作工作台前端，使用 Vue 3、Vite 和 TypeScript。

当前包含作品发现、作品详情、社区讨论、项目管理、收藏和场景编辑器界面。数据保存在浏览器 `localStorage`；作品资料和封面为演示内容。账户、云端保存和真实游戏运行需要连接独立的 `Tc_Engine_Web_backend` 与引擎服务。

## 运行

需要 Node.js 22：

```powershell
npm install
npm run dev
```

生产构建：

```powershell
npm run build
npm run preview
```

构建结果位于 `dist/`，Netlify 配置会将单页应用路由回退到 `index.html`。

## 目录

```text
public/images/  示例作品封面
src/ui/         页面、组件、本地状态和数据校验
src/main.ts     Vue 应用入口
src/styles.css  全局样式
```

## 页面

| 路径 | 功能 |
| --- | --- |
| `/` | 作品分类、搜索、排序和收藏 |
| `/games/:id` | 作品介绍、本地留言和播放器界面预览 |
| `/community` | 话题筛选、搜索和本地发帖 |
| `/community/:id` | 讨论详情和本地回复 |
| `/projects` | 项目新建、重命名、复制、删除、导入和导出 |
| `/editor/:id` | 场景层级、属性编辑、背景素材和本地保存 |
| `/profile` | 已收藏的示例游戏 |
| `/preview/:id` | 本地作品发布预览 |

编辑器支持 `Ctrl/⌘ + S` 保存。`.tomcat.json` 导出文件包含项目资料和场景，可在项目列表重新导入。清除浏览器站点数据会删除本地项目。
