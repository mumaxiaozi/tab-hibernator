# Tab Hibernator - 标签页休眠助手

自动休眠不活跃的 Chrome 标签页，释放内存占用。

## 功能

- **自动休眠** — 标签页超过设定的不活跃时间后自动丢弃，释放内存
- **一键休眠** — 手动批量休眠所有非活跃标签页
- **一键唤醒** — 恢复所有已休眠的标签页
- **白名单** — 指定域名永不休眠，支持子域名匹配
- **自定义阈值** — 1 分钟到 8 小时，灵活设定不活跃判定时间
- **内存统计** — 实时显示系统可用内存

## 安装

1. 下载或克隆本项目
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目目录

## 保护规则

以下标签页不会被休眠：

- 当前活跃标签页
- 固定的标签页（Pinned）
- 正在播放音频的标签页
- `chrome://`、`chrome-extension://`、`edge://`、`about:`、`devtools://` 等内部页面
- 白名单中的域名

## 白名单匹配

- 精确匹配：输入 `github.com`，匹配 `github.com`
- 子域名匹配：输入 `github.com`，也匹配 `sub.github.com`
- 输入 `.github.com`，匹配所有 `github.com` 子域名

## 技术细节

- Chrome Extension Manifest V3
- Service Worker 后台运行，每分钟检查一次不活跃标签
- `chrome.storage.local` 存储标签访问时间戳
- `chrome.storage.sync` 同步用户设置和白名单
- 纯 JavaScript，零依赖，零构建步骤

## License

[MIT](LICENSE)
