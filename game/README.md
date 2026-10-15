# 阿萨拉小兵的炒股梦

基于交接包第 4 版继续修改的纯前端中文版小游戏。玩家是驻守零号大坝的阿萨拉卫队小兵，拿着 10,000 哈夫币，在 30 天里看消息、买卖股票、打工。

## 直接游玩

解压完整项目后，用浏览器打开 **dist/index.html**。需要让 dist/styles.css 和 dist/assets 保持原有相对位置。无需安装、联网、账号、后端或 API Key。

也可在项目根目录启动本地静态服务器：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

用浏览器访问该服务器的 4173 端口即可。部署时上传整个 dist 目录；不能只上传 index.html。

本次没有发布到原站 https://chongya-10000.epicpixie7.chatgpt.site，也没有修改该地址的内容。

## 验证

运行不依赖第三方模块的逻辑和轻量 DOM 回归：

```sh
node tests/game.cjs
```

实际浏览器回归使用 Playwright 和 Chromium：

```sh
# 仅需在尚未安装 Playwright 的开发机器执行；游戏本身不依赖它。
npm install --no-save --package-lock=false playwright@1.62.1
# 指定本机 Chromium 路径；默认 /usr/bin/chromium。
CHROMIUM_PATH=/usr/bin/chromium node tests/browser.cjs
```

浏览器测试自行启动临时静态服务器，并生成 verification 下的截图和报告。200% 检查使用 Chromium 实际浏览器缩放设置，不是 CSS zoom。浏览器测试使用临时测试账户目录，不读取个人浏览器数据。

本次通过 41 项逻辑/DOM 和 21 项真实 Chromium 检查。此环境禁止 file:// 导航，直接打开 HTML 未在这里完成验证；已验证本地 HTTP 服务和加载完成后断网运行。手机检查为触屏/视口模拟，不是实体手机验证。详细限制见 TEST_RESULTS.txt。

## 文件

- dist/index.html：页面、原有游戏引擎和交互逻辑。
- dist/styles.css：布局与视觉样式。
- dist/assets：用户提供的本地地图、哈夫币图。
- tests/game.cjs：资金、交易、OHLC、事件链、状态重置和 DOM 模拟回归。
- tests/browser.cjs：真实 Chromium 渲染、点击、视口和浏览器缩放回归。
- verification：本次浏览器截图与结果。
- docs/CHANGES.md：实际修改说明。
- docs/EVENTS_AND_ASSETS.md：阵营依据、剧情边界、地图坐标和哈夫币蒙版说明。
- TEST_RESULTS.txt：本次验证结果与限制。
- DEVELOPMENT_BRIEF.md：原始开发要求，保留不变。
- reference：用户原始素材、五张旧版问题截图和原交接记录。

## 规则与内容边界

每 20 秒一天，30 天共 600 个行情 tick；打工赚 500 并演算 20 ticks。每 5 ticks 一根真实 OHLC。半仓/全部买卖整数股，双方手续费均 0.1%，平均成本含买入费；浮盈亏未扣卖出费。总资产达到 1,000 万立即获胜。只在浏览器保存最高成绩。

采用交接包提供的背景：卫队与哈夫克敌对，GTI 对抗哈夫克但不是卫队盟友。股票、企业「阿萨拉基建」、具体广播和市场影响均为二次创作。

**行情为虚构且波动夸张，1000 万是游戏挑战，不代表现实投资回报。**
