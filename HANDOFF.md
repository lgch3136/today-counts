# 今天算数交接记录

记录时间：2026-04-29

## 当前状态

- 项目路径：`/Users/liugancheng/today-counts`
- 运行方式：`python3 -m http.server 5177`
- 访问地址：`http://localhost:5177/?v=28`
- GitHub：`https://github.com/lgch3136/today-counts`
- 当前为独立 git 仓库，`main` 跟踪 `origin/main`。
- 小程序路径：`/Users/liugancheng/today-counts/miniprogram`
- 小程序导入方式：用微信开发者工具导入 `miniprogram/` 目录。

## 已完成

- 三个主视图已可用：今日、进度、分享。
- 首页支持立 flag，并进入进度页。
- 进度页支持：
  - 拖动进度条记录推进比例。
  - 点“完成了”把 flag 标为 `done`。
  - 点“没算数”展开原因选择。
  - 原因包括：目标太大、忘了、没开始、被打断。
  - 没进度时选原因会保存为 `missed`。
  - 有进度时选原因会保存为 `partial`。
  - 已复盘的 flag 支持“改成完成”和“重新推进”。
- 分享页支持：
  - 展示今日状态、进度、本月认真天数。
  - 保存海报、发给朋友、复制分享文案。
  - 月度认真日历和日期详情。
- PWA 缓存版本已同步到 `v28`。
- 已按 `参考/` 里的设计建议完成界面改版：更轻的顶部品牌区、温暖纸感 Hero、首页主输入优先、记录页进度环、分享页认真戳海报感、底部导航线性图标统一。
- 已新增两张生成式背景资产：`assets/home-bg-v27.jpg` 用于首页 Hero，`assets/share-bg-v27.jpg` 用于分享页和导出海报；旧的 `assets/share-card-bg.png` 暂时保留作为历史资产。
- 首页“连续 X 天”从圆章改成轻量信息签，避免和背景元素冲突；圆章语义只保留给分享页“认真戳”。
- 已新增微信小程序版本：
  - 原生小程序结构，不依赖 npm 和构建工具。
  - 页面包括 `today`、`record`、`share`、`profile`。
  - 复用高级背景资产到 `miniprogram/assets/`。
  - 本地缓存保存 flag、进度、体感、提醒时间。
  - 分享页支持小程序分享、复制文案和 canvas 保存海报。
  - 订阅提醒入口已预留，真实定时发送仍需订阅消息模板和云函数/服务端。
- README 已更新到当前功能描述。

## 关键文件

- `index.html`：页面结构，当前引用 `styles.css?v=28` 和 `app.js?v=28`。
- `app.js`：核心状态、视图渲染、进度/复盘/分享逻辑。
- `styles.css`：移动端布局、首页视觉、底部导航、复盘状态样式。
- `sw.js`：Service Worker 缓存，当前 `CACHE_NAME = "today-counts-v28"`。
- `assets/home-bg-v27.jpg`：首页 Hero 背景图。
- `assets/share-bg-v27.jpg`：分享页与导出海报背景图。
- `assets/share-card-bg.png`：旧版背景图，暂时保留为历史资产。
- `miniprogram/`：微信小程序版本。
- `miniprogram/README.md`：小程序导入、预览、上传、发布步骤。
- `README.md`：运行方式和功能列表。

## 已验证

- `node --check app.js` 通过。
- `find miniprogram -name '*.js' -print -exec node --check {} \;` 通过。
- 小程序 JSON 文件格式校验通过。
- `curl -I -L http://localhost:5177/?v=24` 返回 `200`。
- 390x844 移动端截图验证：
  - 首页 CTA 完整可见，不被底部导航遮挡。
  - 记录页主操作在体感卡之前，首屏能看到“算数了 / 卡住了 / 去盖认真戳”。
  - 分享页以认真戳海报为视觉中心，保存、发给朋友、复制入口可见。
- 自动交互链路验证通过：
  - 清空 localStorage。
  - 立 flag。
  - 自动进入进度页。
  - 点“没算数”。
  - 选择“忘了”。
  - 自动进入分享页。
  - localStorage 中状态为 `missed`，reason 为 `forgot`，progress 为 `0`。
  - 控制台错误数为 `0`。

## 下次继续建议

1. 用微信开发者工具导入 `miniprogram/`，先用测试号编译和手机预览。
2. 注册或进入真实小程序账号后，把 `project.config.json` 的 `appid` 换成真实 AppID。
3. 在微信公众平台申请订阅消息模板，把模板 ID 写进 `miniprogram/utils/config.js`。
4. 下一步优先做云开发：用户数据同步、订阅消息定时发送、跨设备记录。
5. 用真实手机浏览器打开 `http://电脑局域网 IP:5177/?v=28`，保留网页版本作为备份预览。

## 注意事项

- 浏览器通知依赖系统和浏览器策略，页面关闭后不保证稳定提醒。
- 小程序前端不能独立完成后台定时提醒，必须接微信订阅消息和后端/云函数。
- Service Worker 会缓存文件，改动后记得同步提升 `index.html`、`sw.js` 里的版本号。
- 当前视觉主要按 390px 宽移动端优化；桌面端是手机壳式居中预览。
