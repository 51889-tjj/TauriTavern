# Remote Control（专用手机控制台、电脑主机）

## 目标

独立 iOS App 提供专为手机设计的 TauriTavern 控制界面，不加载完整 SillyTavern 桌面前端，也不镜像电脑屏幕。角色、聊天、模型连接、扩展和设置仍由电脑持有与执行；手机只为当前页面临时读取需要的数据，不建立本地用户数据副本。

壳继续使用独立 Bundle ID `com.tauritavern.remotechat`。配对、TLS/SPKI 证书固定和签名会话仍由 Remote Control shell 与 LAN Sync 提供。连接门通过后，`remote-control.html` 启动独立 React 移动应用；`src/index.html` 仍只服务 TauriTavern 主应用。

## 当前移动界面范围

| 页面 | 当前行为 | 数据与执行位置 |
| --- | --- | --- |
| 聊天 | 复用 Remote Chat 浏览角色/群组与聊天、读取最近历史、发送文本、停止生成 | Remote Chat 服务在电脑执行生成；手机只暂存当前会话视图 |
| 扩展 | 查看电脑上的扩展，安装第三方仓库，更新、删除并启用/停用本地或全局第三方扩展 | 电脑下载、执行、保存并管理代码；手机不下载或执行扩展代码 |
| 模型 / API | 读取和修改当前 Chat Completion 提供商、模型、自定义地址、反代地址；写入或删除电脑 API Key；管理 TauriTavern LLM Connection | 桌面前端复用现有 Chat Completion 控件与密钥存储；连接 DTO 按需读写 |
| 设置 | 按分类读取并提交生成、界面，以及 TauriTavern 自有设置：聊天、备份、外观、网络、隐私、模型和 Agent 历史保留 | 每次只把当前分类需要的字段返回手机；电脑端完成校验与持久化 |

聊天仍需电脑显式开启 Remote Chat；设置、扩展和模型/API 操作需电脑显式开启 Remote Control。配对本身不会开启任一会话。远程控制页面不会调用完整 SillyTavern 设置快照接口 `get_sillytavern_settings`。

## 不变量与安全边界

- LAN Sync 配对身份、HTTPS、SPKI 固定和签名会话是连接基础；Remote Control 默认关闭，电脑用户可随时结束会话。
- 手机只调用 `RemoteControlOperation` 显式列出的操作，不开放任意 Tauri invoke、HTTP 代理、文件路径或脚本执行。
- API Key 值不从电脑读取。手机输入的密钥只经已固定的连接发送给电脑，并由电脑现有 secret API 保存；手机 UI 不写入 `localStorage` 或其他持久缓存。
- 聊天历史和页面 DTO 只在当前 React 页面状态中短暂存在。离开页面或关闭 App 后不保存为手机数据。
- 扩展管理只针对 Local / Global 第三方扩展，系统扩展不可远程修改。安装由电脑执行并保留电脑端第三方扩展确认；更新与启用/停用后按页面提示重载电脑界面。删除不默认运行清理 Hook。
- 配对撤销、Remote Control 会话关闭或 LAN 服务停止后，后续请求必须失败；未知操作和无效 DTO 明确报错。

## 数据与控制流

```text
remote-control.html
  -> pairing gate (local shell)
  -> dedicated mobile React UI
      -> typed Remote Control operation
      -> paired LAN HTTPS + certificate pinning
      -> desktop Remote Control bridge
      -> existing desktop command / SillyTavern action
      -> computer-owned storage and runtime
```

聊天继续使用独立 Remote Chat API，而不是在 Remote Control 中重做生成：电脑通过现有 SillyTavern 发送/生成路径执行，手机读取有限历史和有序 token 事件。Remote Control 的设置查询在电脑端按页面投影；完整设置对象不会跨 LAN 发送。

## 尚未覆盖

当前界面是第一条专用移动控制闭环，不等于完整远程版 TauriTavern。尚未覆盖扩展分支管理与数据清理、更多 SillyTavern 设置、角色/聊天写入、附件与媒体、Agent/MCP 管理以及桌面系统对话框；后续能力仍需各自定义受限操作与页面 DTO。禁止为了复用桌面 UI 而重新加载完整 `src/index.html` 或把完整设置快照放到手机。

Remote Chat 历史按最多 100 条消息分页：首次打开读取尾页，用户点击“加载更早的消息”后才请求上一页。游标由电脑校验；聊天文件改变导致游标失效时，请求明确失败，不退回读取完整聊天 JSON。

## 构建与验收

- Windows 桌面安装包：在仓库根目录运行 `pnpm run tauri:build`。构建只写入 `src-tauri/target/`。
- TrollStore IPA：Codemagic 的 `remote-chat-shell-ios-trollstore` workflow（定义于 `codemagic.yaml`）使用 macOS runner 构建独立 iOS Remote Control shell。
- 真机验收需先在电脑 LAN Sync 中配对并批准手机；按页面分别开启 Remote Control 与 Remote Chat。
- 验收重点：连接后只启动移动专用页面；当前页面读取到的数据来自电脑；修改后电脑状态/存储发生变化；手机重启后不恢复用户数据；失效会话和未允许操作明确失败。
