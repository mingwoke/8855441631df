# GitHub Pages 在线试玩部署

已准备专用发布分支 `gh-pages`，该分支根目录包含 `index.html`、`styles.css`、`assets/` 和 `.nojekyll`。页面与素材来自已验证的 `game/dist`。

## 首次启用

仓库管理员打开：
https://github.com/mingwoke/8855441631df/settings/pages

选择：

- Build and deployment → Source：Deploy from a branch
- Branch：gh-pages
- Folder：/ (root)
- Save

GitHub 完成构建后，设置页会显示实际网站地址。通常为：
https://mingwoke.github.io/8855441631df/

此地址在启用和构建成功前不能视为已上线。本次执行环境的网络代理拦截 api.github.com 和 mingwoke.github.io，因此暂时无法自动启用 Pages 或验证公网响应。

如果设置页提示当前私有仓库/套餐不支持 Pages，请不要购买套餐或擅自更改整个仓库的可见性；可另建公开的静态站点仓库，仅发布 gh-pages 中的网页文件。

## 更新

源代码在 `asara-game-delivery` 分支的 `game/dist`。更新后需将这个目录的完整内容同步到 `gh-pages` 根目录（包括本地素材），然后正常推送；不用后端、API Key 或构建服务。启用分支发布后，GitHub 会自动重新部署。
