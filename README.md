# dsh-plugin-balance

在 DSH（DeepSeek Harness）WebUI 上边栏显示 DeepSeek API 当前余额的插件。

![效果示意图](screenshot.png)

## 功能

- 在 DSH WebUI 上边栏（Session Header 最右侧工具区）显示 `余额：xx.xx  ↻`，紧挨系统自带的 **Session log** 按钮左侧，样式与其一致（32px 胶囊、13px 字体、同一组主题变量）。
- **手动刷新**：点击 ↻ 按钮。
- **自动刷新**：仅页面加载（F5）后首次挂载时自动刷新一次；切换会话/界面不会自动刷新。
- **失败提示**：网络/凭据出错时，原因直接显示在余额位置（↻ 保留可重试），例如 `余额：请求超时`、`余额：API Key 无效`、`余额：未配置 API Key`。
- **不消耗 API 额度**：`GET https://api.deepseek.com/user/balance` 是免费查询接口，刷新余额不会消耗 token（余额减少是聊天本身在用）。
- **与其他插件互不冲突**：注册在加性插槽 `conversation.session.header.utilities`（replaceRisk: none），不替换任何自带 UI。

## 下载

方式一（Git clone）：

```bash
git clone https://github.com/anonRTtty/dsh-plugin-balance.git
```

方式二（直接下载 ZIP）：打开 [仓库页面](https://github.com/anonRTtty/dsh-plugin-balance) → Code → Download ZIP，解压后得到 `dsh-plugin-balance/` 目录。

## 安装（静态安装，与 dsh-archive-manager 相同方式）

1. 把整个 `dsh-plugin-balance/` 目录复制到 DSH profile 的 node_modules：

   ```
   C:\Users\Administrator\.dsh\profiles\node_modules\dsh-plugin-balance\
   ```

2. 在 `C:\Users\Administrator\.dsh\profiles\web\cordis.patch.yml` 的 insert 列表中追加一行：

   ```yaml
   - insert:
       - id: dsh-archive-manager
         name: dsh-archive-manager
       - id: dsh-plugin-balance
         name: dsh-plugin-balance
   ```

3. 重启 DSH（关闭启动窗口后重新运行）。启动后无需任何手动操作，插件自动加载并显示余额。

## 卸载

1. 删除 `C:\Users\Administrator\.dsh\profiles\node_modules\dsh-plugin-balance\`。
2. 删除 `cordis.patch.yml` 中 `dsh-plugin-balance` 那一行。
3. 重启 DSH。

## 文件结构

```
dsh-plugin-balance/
├── package.json        # 包声明 + dsh.client 共享模块注入
├── src/
│   ├── index.js        # Host 半部：/api/plugin.balance 路由（webServer 精确路由）
│   └── client.js       # 浏览器半部：__ModuleLoader__ 加载的余额胶囊
├── screenshot.png      # 效果示意图
├── README.md
└── LICENSE
```

## 说明

- 余额接口：`GET https://api.deepseek.com/user/balance`，凭据读取 `~/.dsh/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`（与 DSH 内置模型路由同一凭据通道），API Key 不离开宿主进程。
- 插件主机端通过 `webServer` 注册精确路由 `/api/plugin.balance`（与 dsh-plugin-session-delete 同款扩展点），浏览器端通过同源 fetch 获取余额。
