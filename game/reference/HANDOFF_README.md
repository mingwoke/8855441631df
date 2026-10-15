# 阿萨拉小兵的炒股梦 — Codex 交接包

请以本 README 所在目录为项目根目录，不要再寻找其他运行环境的 /workspace/sites/starlight-catcher。
本包完整离线可读，不需要访问旧网页才能开发。

## 文件

- dist/index.html：最新已发布版本的页面与全部内联 CSS/JavaScript。
- tests/game.cjs：Node 内置模块测试，无需 npm 安装。
- reference/assets/image(20261014-104457).png：零号大坝地图原图。
- reference/assets/image(20261014-104657).png：哈夫币原图。
- reference/screenshots/：五张用户批注的旧版界面截图。
- DEVELOPMENT_BRIEF.md：下一步开发要求及阵营关系纠正。
- SHA256SUMS.txt：包内文件校验值。

## 运行与测试

浏览器直接打开 dist/index.html 即可游玩，无需后端、账号、API Key 或联网。
在本目录运行 `node tests/game.cjs` 执行测试。此前使用 Node 24，通过31项检查。
测试覆盖逻辑与轻量DOM模拟，不等于实际浏览器渲染检查。

## 当前状态

源码提交 f8e5dc63bace4a336f985b88fe4b7cb66888e850，对应2026-10-14发布的第4版。
原网址：https://chongya-10000.epicpixie7.chatgpt.site
当前已有绿黑界面、三只股票、K线、交易、费用、打工、新闻、暂停、历史回看、缩放和结算。
尚未接入用户提供的真实地图、哈夫币素材、地图事件与正确阵营关系的事件链。
当前仍有原创示意图和 ¥ 符号，这些是待改内容。

五张界面截图来自第3版。第4版已经尝试修复部分问题，但尚未实际浏览器验证，需回归检查。
地图截图不是完整地图，不要猜测画面外地点的位置。哈夫币原图可能含棋盘格底纹，接入前检查透明度。

本包不含账号凭据、Git历史或原站托管配置。它们不是继续开发的前提。
若新环境无法发布原站，交付可运行项目并说明，不要声称已经更新原网址。
