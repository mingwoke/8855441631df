# 在线试玩部署

独立试玩地址：**https://mingwoke.github.io/8855441631df/**

用户已将仓库设为公开，并在 Settings → Pages 设置 Deploy from a branch → gh-pages → /(root)。无需付费，无需反复设置。Codex 云环境设置界面的本地“网页预览”入口不作为本项目可用试玩方式，请在浏览器新标签页打开上述独立地址。

## 发布结构

- 完整源代码：asara-game-delivery 分支的 game/。
- 线上文件：gh-pages 分支根目录的 index.html、styles.css、assets/ 和 .nojekyll。
- 更新时将已验证的 game/dist 完整同步到 gh-pages，保留发布历史，正常推送；GitHub Pages 自动重新构建。
- 原 chatgpt.site 地址未更新，不要用它判断本版发布状态。

## 验证状态

2026-10-18（Asia/Shanghai）已核实界面简化版本部署成功：
https://github.com/mingwoke/8855441631df/actions/runs/39055568083

- 验证后的源码提交：`3f0ab7ced73cd712796686357c8155ea23c9ebcd`
- 发布提交：`eca602048ba48a2eaf8e88036f9315d4fd3b0a11`
- Actions 状态：Completed / Success；运行页面包含上述完整发布提交 SHA。
- 发布分支五个运行文件与源码 game/dist 的 Git blob ID 完全一致，另有空 .nojekyll。
- 56 项逻辑/DOM、85 项 Chromium 检查通过，含 33 项新增界面交互检查；详见 game/docs/QUALITY_REVIEW.md。
- 本版放大字号、独立排列图表与交易、将广播历史移到单条阅读面板，并提供三档行情范围、拖动回看、清楚区分的历史 OHLC 和可点击的合并标记。

沿用已配置的项目 Pages 地址，即本页顶部网址。最新 Actions 页面已确认对应发布提交且 Completed / Success。当前云环境代理限制 mingwoke.github.io 和 api.github.com，但可以读取 github.com 的公开 Actions 页面。构建成功与公网浏览器访问是不同验证项；不能把代理 CONNECT 403 当作用户端网站返回 403，也不能仅因本地测试通过声称线上已经通过访问检查。

查看最新发布：
https://github.com/mingwoke/8855441631df/actions
