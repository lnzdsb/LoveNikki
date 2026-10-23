# 作品集模板 · 静态摄影存档

一个**不需要服务器、不需要备案、不需要数据库**的个人作品页。

- 口令访问：数据用 PBKDF2 + AES-GCM 加密，源码里看不到作品清单；
- 标签筛选、搜索、灯箱、手机适配；
- 本机管理台：拖图、保留原文件、生成缩略图、改标题/标签；
- 纯静态：部署到 Cloudflare Pages，免费；
- 无外部字体、无 CDN 依赖，微信内置浏览器可打开。

> 这是一个**模板**，不是开箱即用的成品站。你需要换成自己的图片、站名和口令。
>
> **完全没部署过？** 看 [部署指南](部署指南.md)，从下载到上线一步一步照着点。

---

## 1. 快速开始

1. 下载这个仓库（或点 **Use this template** 创建自己的仓库）；
2. 用 **Edge / Chrome** 双击 `打开管理台.bat`；
3. 点「打开项目文件夹」，选择这个项目根目录；
4. 拖入图片，填作者、标题、标签；
5. 在右侧设置访问口令（示例口令是 `demo1234`，一定要换）；
6. 点「保存到项目文件夹」。

示例作品带 `demo` 标记：上传第一张自己的图后会从列表移除；保存时再清理示例文件。没保存不会提前删文件。

## 2. 上线到 Cloudflare Pages

1. 打开 <https://dash.cloudflare.com>，注册/登录；
2. 左侧 **Compute** → **Workers & Pages** → **Create application**；
3. 选 **Pages** → **Drag and drop your files**；
4. 项目名随便起一个；
5. 把 **`site` 文件夹**拖进去（不是整个项目根目录）；
6. **Deploy site**，得到 `https://你的项目名.pages.dev`。

以后更新：管理台保存 → Cloudflare → 项目 → **Create new deployment** → 重新拖 `site`。

> 只上传 `site/`。`admin.html`、`source/`、`tools/` 都留在本机，不要发布。

## 3. 目录

```
gallery-template/
├─ site/                  ← 只上传这个
│  ├─ index.html
│  ├─ assets/
│  ├─ data/works.enc.js   ← 加密后的作品数据
│  ├─ media/              ← 图片
│  ├─ _headers
│  └─ robots.txt
├─ admin.html             ← 本机管理台
├─ source/works.json      ← 明文源数据
├─ tools/encrypt.mjs      ← 命令行加密（可选）
├─ 打开作品页.bat
├─ 打开管理台.bat
├─ 部署指南.md            ← 新手从零部署
└─ README.md
```

## 4. 口令说明

- 示例口令：`demo1234`（示例数据会显示这个提示）；
- 用管理台改成自己的口令后，提示自动消失；
- 中文口令：点口令框右侧的「显示」，切换成普通文本框再输入；
- 口令只是加密，不是真正的权限控制：图片文件本身没有加密，知道具体地址仍能打开。

## 5. 图片

- 大图直接复制原文件，不重编码；只生成缩略图（长边 1200，WebP 85）。
- 原图的 EXIF（包括拍摄地点）会原样保留；在意的话先自己处理。
- HEIC 浏览器不能直接读，先导出 JPG；
- 页面不是原图备份，原图请自己留。
- 删除作品后保存，会自动清掉不再被引用的旧图；重新部署后新版本不再包含它们。
- Cloudflare 的旧部署不会自动删除；要彻底清掉，去 Pages → Deployments 删除旧部署。

## 6. 常见问题

**点「进入」没反应？**
先看输入框下方红字；如果提示数据没加载，确认 `index.html` 和 `data/works.enc.js` 在同一个 `site` 里。

**上传后线上没变化？**
管理台保存只写本地，必须在 Cloudflare 新建一次部署。

**忘记口令？**
无法找回。用管理台重新设一个，保存后重新部署。

**成员能自己上传吗？**
这个模板是个人页，不开放上传。需要多人上传要另外加后端（Supabase / CloudBase）。

## 7. 可选：.gitignore

如果以后用 Git 管理，可以在根目录自己建一个 `.gitignore`：

```text
_preview/
_shots/
_edge-*/
site.zip
_demo_backup/
.DS_Store
Thumbs.db
```

## 8. License

代码使用 MIT License，见 [LICENSE](LICENSE)。
示例图由 `site/media/demo-*` 提供，是程序生成的抽象占位图，可随模板自由使用。
