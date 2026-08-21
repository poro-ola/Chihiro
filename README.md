<p align="center">
  <img src="./public/icon-source.svg" width="96" height="96" alt="千寻 Chihiro Logo" />
</p>

<h1 align="center">千寻 · Chihiro</h1>

<p align="center">
  一个本地优先的浏览器标签与资料工作台。<br />
  在新标签页中整理当前标签、保存链接、记录想法，并随时找回上下文。
</p>

<p align="center">
  Chrome MV3 · React · TypeScript · WXT · Dexie
</p>

## 关于千寻

千寻是一款面向重度浏览器用户的 Chrome / Chromium 扩展。它将新标签页变成三栏资料工作台：左侧管理工作区，中间组织集合、书签与记事，右侧实时显示当前窗口的标签页。

产品采用本地优先设计，不需要账号。工作区、集合、书签、记事、排序和界面设置统一保存在扩展自身的 IndexedDB 中，并可导出为完整 JSON 备份；需要跨设备时，可以选择连接自有 Cloudflare Worker 与 R2 进行端到端加密同步。

> 当前版本：`0.1.0` · MVP 开发阶段

## 核心能力

### 标签与资料整理

- 将右侧当前标签整张拖入任意集合，保存为书签卡片。
- 在集合内新增链接或纯文本记事，书签与记事支持混合排序。
- 跨集合移动卡片，拖拽调整工作区、集合和卡片顺序。
- 同一集合内按规范化 URL 防止重复保存，自动忽略常见追踪参数。
- 一键批量打开集合中的全部链接。

### 书签、记事与归档

- 新增、编辑、打开和删除书签，可补充独立的纯文本备注。
- 备注弹框展示对应书签的图标和标题，打开后直接编辑并自动保存，无需保存或取消按钮。
- 文本记事支持多行编辑与自动保存，单条最多 20,000 字。
- 每张卡片都可归档；归档内容保留在所属集合底部，没有归档内容时不显示归档入口。
- 支持标准与紧凑布局；紧凑模式仅显示图标和标题。

### 搜索与快捷操作

- 搜索书签标题、URL、书签备注、记事正文、集合名称以及当前标签。
- 按“全部 / 书签 / 记事 / 集合 / 当前标签”筛选结果。
- 使用键盘选择、打开结果或跳转到对应工作区和集合。
- 左右侧栏均可折叠，为资料画布释放更多空间。

### 网页伴随备注

- HTTP / HTTPS 页面右侧注入可上下拖动的悬浮备注按钮。
- 按当前页面规范化 URL 查找已保存书签，并直接展示对应备注。
- 备注面板打开即编辑，输入约 400ms 后自动保存；关闭面板时补存最后内容。
- 浏览器内部页面（如 `chrome://`）不注入网页备注。

### 本地数据与备份

- 使用 Dexie 统一管理 IndexedDB 表、索引、事务与版本迁移。
- 导出包含全部表数据、实体关系、排序和设置的 JSON 备份。
- 导入支持“合并”与“覆盖”两种模式，并在导入前校验文件格式。
- 设置中可查看本地数据数量、切换紧凑模式或清空全部数据。

### Cloudflare 加密云同步

- 可选连接自有 Cloudflare Worker 与私有 R2 存储桶，不依赖千寻账号体系。
- 客户端使用 AES-GCM 加密完整快照，加密口令只保存在浏览器本机，Cloudflare 仅保存密文。
- 本地变更后自动同步，并每分钟检查一次云端更新；多设备按实体更新时间合并。
- 删除操作通过 tombstone 同步，避免已经删除的数据被其他设备重新带回。
- Worker 使用版本条件写入避免并发覆盖，并在 R2 中保留最近 30 份历史快照。

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) 1.x
- 最新稳定版 Chrome 或 Microsoft Edge

### 安装依赖

```bash
bun install
```

### 开发模式

```bash
bun run dev
```

WXT 会启动 Chrome 开发环境并监听代码变化。

### 构建并手动安装

```bash
bun run build
```

构建完成后：

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目中的 `.output/chrome-mv3` 目录。
5. 打开一个新标签页进入千寻工作台。

修改 Content Script 后，需要在扩展管理页重新加载扩展，并刷新已打开的网页。

### 生成分发包

```bash
bun run zip
```

压缩包生成在 `.output/chihiro-<version>-chrome.zip`。

## 常用命令

| 命令 | 用途 |
|---|---|
| `bun run dev` | 启动 Chrome 开发环境 |
| `bun test` | 运行自动化测试 |
| `bun run compile` | 执行 TypeScript 无输出类型检查 |
| `bun run build` | 构建 Chrome Manifest V3 扩展 |
| `bun run zip` | 生成 Chrome 分发压缩包 |
| `bun run cloudflare:login` | 登录 Cloudflare Wrangler |
| `bun run cloudflare:create-bucket` | 首次创建 `chihiro-sync` R2 存储桶 |
| `bun run cloudflare:secret` | 设置或轮换 Worker Secret `SYNC_TOKEN` |
| `bun run cloudflare:deploy` | 将本地 `cloudflare/worker.js` 部署到 Cloudflare |
| `bun run dev:firefox` | 启动 Firefox 开发构建 |
| `bun run build:firefox` | 构建 Firefox 版本 |
| `bun run zip:firefox` | 生成 Firefox 压缩包 |

Firefox 脚本由 WXT 提供，但当前 MVP 主要验证平台为最新版 Chrome 和 Edge。

## 使用提示

| 操作 | 方式 |
|---|---|
| 打开全局搜索 | `Cmd/Ctrl + K` 或 `/` |
| 选择搜索结果 | `↑` / `↓` |
| 打开搜索结果 | `Enter` |
| 关闭搜索或弹层 | `Esc` |
| 打开已存书签 | 单击卡片，在新的标签页打开 |
| 保存当前标签 | 将右侧标签卡拖入中间集合 |
| 打开网页备注 | 点击网页右侧悬浮按钮 |

## 技术架构

| 层级 | 实现 | 职责 |
|---|---|---|
| 新标签页 | React + WXT | 三栏工作台、搜索、拖拽和设置 |
| 网页备注 | WXT Content Script + Shadow DOM | 注入悬浮按钮与极简备注编辑器 |
| 后台服务 | MV3 Service Worker | 在 Content Script 与扩展数据库之间转发受控消息 |
| 数据层 | Dexie + IndexedDB | 领域数据、排序、设置、事务和迁移 |
| 云同步客户端 | Web Crypto + Fetch | 加密快照、合并实体、定时同步和版本冲突重试 |
| 云同步服务 | Cloudflare Worker + 私有 R2 | Token 鉴权、条件写入和最近 30 份密文备份 |
| 浏览器能力 | WebExtension Tabs API | 查询、切换和打开浏览器标签 |
| 备份恢复 | dexie-export-import | 导出、校验、合并或覆盖 JSON 备份 |
| 拖拽系统 | dnd-kit | 工作区、集合、卡片和当前标签的排序与移动 |

网页 Content Script 不直接访问页面源的 IndexedDB。它只读取当前 URL，并通过扩展消息请求后台服务查询或更新扩展自身的数据。

## 项目结构

```text
chihiro/
├── docs/
│   └── PRD.md                    # 产品需求与验收标准
├── entrypoints/
│   ├── background.ts             # 后台消息桥接与工具栏入口
│   ├── newtab/                   # 新标签页工作台
│   │   └── components/           # 画布、侧栏、搜索、设置和弹层
│   ├── notes.content/            # HTTP/HTTPS 网页悬浮备注
│   └── popup/                    # 快捷入口实现
├── lib/
│   ├── backup.ts                 # JSON 备份与恢复
│   ├── browser-tabs.ts           # 浏览器标签 API 封装
│   ├── cloud-sync.ts             # 加密、合并和 Cloudflare 同步客户端
│   ├── cloud-sync-messages.ts    # 云同步消息契约
│   ├── content-notes.ts          # 网页备注消息契约
│   ├── db.ts                     # Dexie 数据库与领域操作
│   └── types.ts                  # 领域类型
├── cloudflare/
│   └── worker.js                 # R2 快照 API、鉴权和版本备份
├── tests/                        # Cloudflare Worker 自动化测试
├── public/                       # 扩展图标与静态资源
├── package.json
├── wrangler.jsonc                # Worker、R2 binding 与非敏感变量
└── wxt.config.ts                 # WXT 与 Manifest 配置
```

详细产品范围和验收场景参见 [产品需求文档](./docs/PRD.md)。

## 数据与隐私

千寻坚持最小权限和本地优先：

| 项目 | 当前行为 |
|---|---|
| 业务数据位置 | 扩展自身源下的 IndexedDB |
| 云同步 / 账号 | 不需要账号；可选连接自有 Cloudflare Worker |
| 远程数据服务 | 私有 R2 仅保存客户端加密后的快照 |
| 网页正文读取 | 不读取、不索引、不上传 |
| 网页备注范围 | 仅 HTTP / HTTPS 页面，读取当前 URL |
| 浏览器权限 | `tabs`、`storage`、`alarms`，用于标签管理、同步配置和定时同步 |
| Content Script | 匹配 HTTP / HTTPS，用于渲染悬浮备注界面 |
| 未申请权限 | `history`、`bookmarks`、`sidePanel` |

为兼容早期本地数据，界面品牌和备份格式已使用 `Chihiro`，IndexedDB 的物理数据库名称仍保留为 `qianxun`。

## 备份与恢复

在“设置与备份”中可以：

1. 导出 `chihiro-backup-YYYY-MM-DD-HHmmss.json`。
2. 以“合并”模式导入，保留当前资料并写入备份内容。
3. 以“覆盖”模式导入，将当前数据库恢复到备份状态。
4. 导入旧版 `qianxun-backup` 格式的兼容备份。

建议在升级扩展、清空数据或大规模整理资料前先导出备份。备份文件包含你的书签、记事和界面设置，请自行妥善保管。

## Cloudflare R2 云同步

### 当前部署

| 项目 | 值 |
|---|---|
| Worker | `https://chihiro-sync.tan-jie.workers.dev` |
| R2 存储桶 | `chihiro-sync`（私有） |
| R2 binding | `SYNC_BUCKET` |
| Worker Secret | `SYNC_TOKEN`，只在 Cloudflare 中保存，不写入仓库 |
| 历史版本 | 最近 30 份加密快照 |

客户端还需要单独设置加密口令。该口令不会发送给 Cloudflare，所有需要互相同步的设备必须使用相同的 Worker 地址、Token 和加密口令。口令丢失后无法解密云端备份。

### 首次部署

```bash
bun run cloudflare:login
bun run cloudflare:create-bucket
bun run cloudflare:secret
bun run cloudflare:deploy
```

`cloudflare:create-bucket` 仅在存储桶尚未创建时执行。运行 `cloudflare:secret` 后按提示输入随机强 Token，不要把 Token 或客户端加密口令写入 `.env`、README、提交记录或公开日志。

部署完成后，在千寻“设置与备份 → Cloudflare 云同步”中填写 Worker 地址、同步 Token 和客户端加密口令，再点击“保存并立即同步”。新设备会先下载并合并已有云端快照；如果云端尚无快照，则上传当前本地数据。

### 更新 Worker

本地 [`cloudflare/worker.js`](./cloudflare/worker.js) **不会自动同步**到 Cloudflare。修改后需要重新部署：

```bash
bun test
bun run cloudflare:deploy
```

Worker 部署和浏览器扩展更新是两个独立流程：

1. 修改 Worker 后运行 `bun run cloudflare:deploy`。
2. 修改扩展代码后运行 `bun run compile && bun run build`。
3. 打开 `chrome://extensions`，找到千寻并点击“重新加载”。
4. 回到新标签页，点击“立即同步”验证读写。

`wrangler.jsonc` 保存 Worker 名称、R2 binding 和备份数量等非敏感配置；`SYNC_TOKEN` 必须继续作为 Worker Secret 管理。若接入 GitHub Actions，才可以在代码推送后自动部署 Worker。

## 浏览器支持

| 浏览器 | 状态 |
|---|---|
| Google Chrome | MVP 主要验证平台 |
| Microsoft Edge | 基于 Chromium，MVP 目标平台 |
| Firefox | 构建脚本已保留，尚未作为 MVP 完整验证平台 |
| Safari | 暂不支持 |

## 当前边界

- 不提供千寻账号、团队协作或分享链接；云同步由用户自有 Cloudflare 资源提供。
- 不读取浏览历史，也不导入浏览器原生书签。
- 不索引网页正文，不提供 AI 摘要或语义搜索。
- 记事和书签备注均为纯文本，不渲染 Markdown 或富文本。
- 网页悬浮备注不支持浏览器内部页面及扩展页面。

## 开发约定

- 使用 TypeScript、React 函数组件和 Hooks。
- 领域类型集中在 `lib/types.ts`，数据操作集中在 `lib/db.ts`。
- UI 组件不直接操作原生 IndexedDB。
- 多实体写入和排序调整使用 Dexie 事务。
- 所有用户文本按纯文本渲染，不通过 HTML 注入。
- 提交改动前至少运行 `bun run compile` 和 `bun run build`。

## 设计来源

千寻参考了 Toby 的三栏效率结构与“把当前标签拖入集合”的核心交互，但采用独立品牌、视觉语言、数据模型和实现方式，不复刻其品牌资产或协作能力。

## License

当前仓库尚未声明开源许可证。在添加明确许可证前，请勿将代码作为开源项目重新分发或用于未经授权的商业用途。
