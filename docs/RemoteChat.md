# Remote Chat（局域网远程聊天）

全功能手机远程控制方向见 [Remote Control](RemoteControl.md)。Remote Chat 是第一阶段的受限聊天能力，不代表完整桌面前端远程化。

## 目标

让 iOS 端 TauriTavern 作为远程聊天面板，连接正在运行的桌面 TauriTavern。角色、聊天记录、提示词组装、扩展钩子、模型请求和生成状态仍由桌面端拥有；手机发送文本并接收回复，不复制或合并聊天数据。

## 首版范围

- 桌面端用户显式开启临时 Remote Chat 会话；关闭后立即拒绝远程聊天请求。
- 客户端必须是已配对的 LAN 设备。普通 LAN Sync 配对本身不自动开启远程控制。
- 手机可浏览桌面端角色、角色聊天和群组聊天，选择目标后查看最近消息。
- 手机发送文本后，桌面端通过 SillyTavern 当前聊天的正常发送/生成流程处理，以保留桌面端扩展与生成钩子。
- 手机接收流式文本、完成/失败状态，并可请求停止当前远程生成。
- 首版不传图片、附件、语音、斜杠命令，不开放通用 API、文件访问或任意命令执行。
- 同一桌面 Remote Chat 会话最多处理一个远程生成请求；桌面端已有生成进行中时拒绝新请求。

## 信任与网络边界

- LAN Sync 的 HTTPS、证书指纹校验、配对设备身份和会话认证是连接基础；Remote Chat 使用独立路由和 DTO，不复用文件同步操作语义。
- 远程聊天接口只在桌面用户显式开启会话后可用；会话状态不持久化，应用退出或 LAN 服务停止时结束。
- 每个请求都验证配对会话、Remote Chat 会话状态、目标引用和请求大小。认证或目标验证失败时返回明确错误，不静默降级。
- LAN Sync 配对权限不等同于 Remote Chat 授权；手机端必须显式连接桌面 Remote Chat 会话。

## 数据与控制流

1. 桌面用户开启 Remote Chat。桌面前端以事件驱动方式发布当前 Remote Chat 会话状态。
2. iOS 客户端从已有配对设备中选择桌面端，建立经证书固定的 HTTPS 会话。
3. iOS 通过远程目录接口读取角色/聊天列表和指定聊天的有限历史页。
4. iOS 发送目标引用及文本。桌面后端验证请求后向桌面前端发送远程生成事件。
5. 桌面前端切换到目标聊天，并调用标准聊天输入/发送入口；不得在后端另建一套模型生成或聊天写入流程。
6. 桌面前端发布 token、终态及可观察错误；iOS 客户端按序读取事件并更新面板。

## 分层落点

- `tt-contracts`：Remote Chat 请求、目标引用、目录/历史 DTO、事件 DTO。
- `tt-application`：会话启停、配对身份检查后的远程请求编排、目标/请求状态校验。
- `tt-ports`：远程客户端/主机桥接所需的接口。
- `tt-adapter-sync`：复用已存在的 LAN HTTPS listener、TLS 身份和 session authentication；提供独立 `/v2/remote-chat/*` 路由与 iOS HTTPS client。它不负责聊天生成。
- `tauritavern` host：组装应用服务、Tauri 命令和桌面前端事件桥。
- `src/tauri/main/*`：向 iOS 第一方 UI 暴露窄小、类型化的 Host API。
- 桌面前端：使用现有 SillyTavern 上下文完成目标切换、消息发送与 token 观察。
- iOS 第一方 UI：设备连接、目录选择、聊天历史与输入，不直接触碰 Rust 命令或 LAN 协议细节。

## 验收

- 未开启桌面 Remote Chat 时，已配对设备无法读取聊天目录或发送消息。
- 目标引用不匹配或设备会话未认证时，请求被拒绝，桌面聊天不发生变化。
- 正常远程发送最终经桌面现有聊天生成流程；桌面扩展收到与本地发送相同的生成生命周期。
- 手机能读取所选聊天的有限历史，显示流式回复和终态；停止操作取消桌面端当前对应生成。
- 关闭会话、撤销配对或停止 LAN 服务后，后续请求被拒绝。

## 实施状态

当前实现包含 Remote Chat DTO、LAN HTTPS 路由、已配对设备客户端、桌面标准发送桥，以及桌面扩展内的 Remote Chat 面板。历史首屏读取最近 100 条；用户请求时使用文件游标按页读取更早消息。独立 iOS shell 仍位于 `remote-chat-shell/`，通过 `remote-control.html` 启动专用移动控制界面，不加载完整 `src/index.html`。移动界面复用 Remote Chat 协议显示聊天；模型、扩展与设置通过单独的 Remote Control allowlist 操作处理，详见 [Remote Control](RemoteControl.md)。

Codemagic 的 `remote-chat-shell-ios-trollstore` workflow 构建独立 Bundle ID 的未签名 IPA。iOS 构建需要 macOS/Xcode。真机验收需先在电脑启动 LAN Sync 并批准手机配对；手机设置/扩展等控制页需电脑显式启动 Remote Control，聊天页还需电脑显式启动 Remote Chat。

## 原型打包

- Windows 桌面安装包：在仓库根目录运行 `pnpm run tauri:build`。这只在 `src-tauri/target/` 生成构建产物，不会安装、覆盖现有应用或操作用户数据。
- TrollStore IPA：`.github/workflows/remote-chat-ios-trollstore.yml` 使用 macOS runner，通过 Tauri iOS CLI 的 `--no-sign` 构建并上传 IPA artifact。推送 `remote-chat-lan-mvp` 分支会触发构建；也可手动运行并填写 `source_ref`。该 workflow 位于 fork 中，且尚未在 GitHub runner 上实测。
- 完整 TauriTavern iOS 原型：Codemagic 的 `remote-chat-ios-trollstore` workflow。
- 独立 iOS Remote Control 客户端：Codemagic 的 `remote-chat-shell-ios-trollstore` workflow，产物使用 Bundle ID `com.tauritavern.remotechat`，不会替换现有 TauriTavern App。
- TrollStore 官方支持范围受 iOS 版本限制；IPA 构建成功不代表所有 iOS 版本都能安装。
