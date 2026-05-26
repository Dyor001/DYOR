# DYOR 哨兵营网站开发交接文档

更新时间：2026-05-06  
用途：用于重新开启 Codex/GPT 对话后，快速完整理解当前网站状态，并继续维护开发。

## 1. 项目概览

这是 `DYOR 哨兵营` 社区基金与核心成员门户网站，当前主要承担三类用户的功能：

- 公共用户：查看基金首页、资产委托说明、联系方式、下载中心、概念联动雷达等公开内容。
- 邮箱白名单用户：查看具体持仓、投研卡片、智库文章、仓位管理前台等核心社区内容。
- 投资人：通过专属查询码查看自己的投资档案、当前资产、收益进度与战壕式翻倍推进信息，不展示具体持仓。

网站定位已经从简单基金看板，逐步扩展为：

- 基金资产可视化门户
- 投资人资产查询系统
- 核心成员投研/智库系统
- 后台内容与数据维护控制台
- 社区基金链上钱包监控
- 仓位管理与交易计划工具

## 2. 服务器与部署情况

生产服务器：

- 公网 IP：`163.7.9.6`
- 私网 IP：`172.31.0.2`
- 系统：Ubuntu
- 登录用户：`root`
- 项目目录：`/root/binance-fund-viewer`
- 静态页面目录：`/root/binance-fund-viewer/public`
- 入口服务：`/root/binance-fund-viewer/server.js`
- systemd 服务：`binance-fund-viewer.service`
- 监听端口：`3000`
- 域名：`https://www.dyor001.xyz/`

systemd 配置摘要：

```ini
WorkingDirectory=/root/binance-fund-viewer
EnvironmentFile=-/root/binance-fund-viewer/.env
Environment=PORT=3000
ExecStart=/usr/bin/node /root/binance-fund-viewer/server.js
Restart=always
StandardOutput=append:/root/binance-fund-viewer/server.log
StandardError=append:/root/binance-fund-viewer/server.log
```

常用部署命令模式：

```powershell
$pw='Chouqiqiu2@'
$hk='ssh-ed25519 255 SHA256:nffUler6XNOcHqChMyVHwklzrift2PaHEBmzIgHDdJo'
& E:\codex\tools\pscp.exe -batch -hostkey $hk -pw $pw E:\codex\remote-server.js root@163.7.9.6:/root/binance-fund-viewer/server.js
& E:\codex\tools\plink.exe -batch -hostkey $hk -pw $pw root@163.7.9.6 "node --check /root/binance-fund-viewer/server.js && systemctl restart binance-fund-viewer.service && systemctl is-active binance-fund-viewer.service"
```

环境变量 `.env` 存在以下键：

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `PORT`
- `VIEW_KEY`
- `ADMIN_PASSWORD`

不要在回复中泄露 `.env` 具体值。

## 3. 本地工作区文件

主要本地副本位于 `E:\codex`。

关键本地文件：

- `E:\codex\remote-server.js`：生产后端 `server.js` 的本地工作副本。
- `E:\codex\remote-index.html`：首页本地工作副本。
- `E:\codex\remote-admin-alpha.html`：主后台页面本地副本。
- `E:\codex\remote-admin-portfolio.html`：仓位管理后台本地副本。
- `E:\codex\remote-portfolio.html`：仓位管理前台本地副本。
- `E:\codex\member-research.html`：核心成员投研页本地副本。
- `E:\codex\member-thinktank.html`：核心成员智库页本地副本。
- `E:\codex\admin-research.html`：投研后台页本地副本。
- `E:\codex\admin-investors.html`：投资人管理后台页本地副本。
- `E:\codex\admin-thinktank.html`：智库后台页本地副本。
- `E:\codex\admin-downloads.html`：下载中心后台页本地副本。
- `E:\codex\linkage.html` / `admin-linkage.html`：概念联动雷达前后台。

注意：

- 有些页面本地文件名带 `remote-`，部署到服务器时通常去掉 `remote-`。
- 历史开发中曾多次遇到中文乱码，编辑时优先保持 UTF-8，不要用会破坏编码的 PowerShell 重写中文内容。
- 手工修改文件必须用 `apply_patch`，部署前用 `node --check` 和前端脚本解析检查。

## 4. 数据文件

生产目录 `/root/binance-fund-viewer` 下的核心 JSON 数据：

- `alpha-holdings.json`：手动 Alpha 持仓。
- `fund-config.json`：基金份额/发行模型配置。
- `investors.json`：投资人档案，可多笔记录共用查询码。
- `position-plans.json`：投研计划/投研卡片数据。
- `portfolio-manager.json`：仓位管理表数据。
- `thinktank-posts.json`：智库文章。
- `whitelist.json`：邮箱白名单。
- `wallet-whitelist.json`：钱包白名单，目前实际用途较弱。
- `wallet-holdings-snapshot.json`：链上钱包持仓快照，用于仓位变动播报。
- `nav-history.json`：份额现价日图历史。
- `asset-snapshots.json`：基金资产快照，用于仓位变动播报/成本估算。
- `downloads.json`：下载中心文件记录。
- `contact-config.json`：联系方式、二维码、链接等。
- `linkage-data.json`：概念联动雷达数据。
- `view-keys.json`：旧查询/查看码相关数据。

当前 `fund-config.json` 口径：

- 第一阶段发行上限：`70000`
- 当前流通份额由后台维护。
- 当前单位价值/份额现价 = `总资产 / 流通份额`
- 发行价为 `1U/份`
- 销毁量、待解锁量用于首页发行结构展示。

## 5. 用户权限与入口

### 公共用户

入口：

- `/`
- `/sentinel-plan.html`
- `/contact.html`
- `/downloads.html`
- `/linkage.html`
- `/thinktank-share.html`

公共用户可以查看首页概况、说明、联系方式、下载中心、概念联动雷达等。

### 白名单成员

白名单邮箱存储在 `whitelist.json`，目前主要要求 Gmail 邮箱。

入口：

- `/member-research.html`
- `/member-thinktank.html`
- `/portfolio.html`

成员可以查看：

- 基金具体持仓
- 投研计划卡片
- 智库文章全文
- 仓位管理前台

### 投资人

入口：

- `/investor.html`

投资人通过 4 位查询码查看自己的资产情况。当前支持同一个查询码对应多笔投资记录，例如追加资金时新增一条记录但查询码相同。

投资人页不展示姓名，不展示具体持仓。

## 6. 首页当前功能

首页文件：`public/index.html`，本地副本 `remote-index.html`。

主要模块：

- 基金总览：总资产、份额现价、收益变化等。
- 份额现价日图：原“净值 K 线”已改为“份额现价日图”。
- 发行结构：发行上限、流通量、销毁量、待解锁量，含饼图。
- 持仓明细：展示基金持仓，含占基金总资产百分比。
- 仓位变动播报：记录前 7 天持仓变化，过滤手续费/少量 BNB 消耗，并展示仓位百分比变化。
- 社区基金链上监控：链上钱包持仓表格与仓位变动滚动播报。
- 白名单入口：核心成员投研、智库、仓位管理等入口。
- 公开入口：投资人查询、资产委托计划、联系方式、下载中心、概念联动雷达。

### 社区基金链上监控

当前监控地址：

- EVM 地址：`0xcd2234ef8bf29d8349e98474f967aa8eda924024`
- SOL 地址：`8uPkZ3Tx8hXUrpBxZkyMRUcohFVMvmaSG4LVR1L6KC6p`

监控链：

- BSC：`chainId 56`
- Ethereum：`chainId 1`
- Base：`chainId 8453`
- Solana：Binance Web3 接口使用 `CT_501`，前端显示为 `SOL`

链上持仓来源：

- 后端函数：`fetchBinanceWeb3ActivePositions`
- 接口：Binance Web3 `active-position-list`
- 只展示估值 `>= 1 USDT` 的资产。
- 低于 `1 USDT` 的小额资产不展示，也不计入链上钱包资产。
- 表格字段：代币名称、合约地址、持仓数量、当前价格、持仓市值。
- 除 `BNB / ETH / SOL` 基础原生币外，其它代币合约地址后有复制按钮。

当前 `/api/wallet-dashboard` 可读到的有效持仓示例：

- Base ETH
- BNB
- SOL
- Ethereum ETH
- FLORK

链上钱包资产会计入基金总资产。

## 7. 基金总资产口径

后端计算函数：`calculateFundData()`

当前总资产口径：

```text
基金总资产 = 币安现货/资金账户资产 + 手动 Alpha 持仓 + 社区基金链上钱包资产
```

来源：

- `getBinanceAssets()`：币安现货账户。
- `getFundingAssets()`：币安资金账户。
- `getAlphaHoldings()`：读取 `alpha-holdings.json` 手动持仓。
- `getCommunityOnchainFundAssets()`：读取社区链上钱包持仓。

当前 `/api/fund` 返回结构包括：

- `totalValue`
- `fund`
- `breakdown.binance`
- `breakdown.alpha`
- `breakdown.onchainWallet`
- `navHistory`

近期验证示例：

- 总资产约 `29880.46 U`
- 币安部分约 `27025.43 U`
- Alpha 部分约 `1335.83 U`
- 链上钱包约 `1519.20 U`
- 当前份额现价约 `1.5159`

数据随行情实时变化，上述数值只作上下文参考。

## 8. 主后台 admin-alpha

入口：

- `/admin-alpha.html`

主要能力：

- 手动维护 Alpha 持仓。
- 管理邮箱白名单。
- 管理钱包白名单。
- 更新份额/基金配置。
- 管理联系方式模块，包括多个二维码、标注、链接。
- 后台密码来自 `ADMIN_PASSWORD`，用户设定过管理密码为 `DYOR001`，实际生产以 `.env` 为准。

曾处理过：

- 中文乱码问题。
- 白屏问题。
- 首页入口按钮未显示问题。
- 联系方式模块支持多个二维码和链接。

## 9. 投资人系统

入口：

- `/investor.html`
- `/admin-investors.html`

数据：

- `investors.json`

核心功能：

- 后台维护投资人档案。
- 支持同一查询码对应多笔投资记录，用于追加资金。
- 前台查询时，同一查询码的多笔记录一起展示。
- 投资人页不显示姓名。

字段包括：

- 投资人
- 入金额度
- 加入时间
- 周期
- 买入净值/买入份额单价
- 份额
- 查询码
- 当前天数
- 对应利润比
- 当前资产
- 利润
- 投资人分配

收益/退出机制当前采用灵活版本：

- 默认封闭期 30 天。
- 封闭期后可申请退出。
- 按申请后 T+1 日 15:00 份额单价快照结算。
- 投资人分成比例 = `50% + 20% * (持有天数 / 365)^1.5`
- 未满 30 天不参与分成。
- 日常不扣管理费，结算时再计算。

战壕式推进：

- 每笔资金入场锁定初始份额单价 `P`。
- 里程碑：`2P / 4P / 8P / 16P ...`
- 到达关卡触发强制止盈选择：获利了结、原地复投、利润奔跑。
- 投资人页有收益进度条。
- 后台有整体份额单价进度可视化，显示 4 倍内投资人里程碑。

## 10. 资产委托说明页

入口：

- `/sentinel-plan.html`

当前文案主题：

- DYOR 哨兵营资产委托管理计划。
- 统一资金池 + 份额化管理。
- 发行价、实时份额单价、份额、流通量、总资产、累计发行量、累计销毁量。
- 第一阶段发行量上限 `70000`。
- 退出机制为封闭期 + 灵活赎回。
- 风险告知与不保本声明。
- 翻倍出本金旧机制已被“战壕式利润推进计划”替代。

## 11. 核心成员投研系统

后台：

- `/admin-research.html`

前台：

- `/member-research.html`

数据：

- `position-plans.json`

功能：

- 后台维护投研标的。
- 标的字段包括：symbol、概念、定位、进场区间、目标位置、当前状态、跟进焦点、报告链接、合约地址、链 ID。
- 链 ID 已改为主要链选择：ETH、BASE、BSC、SOL 等。
- “看好理由”已改为“跟进焦点”。
- 前台采用左侧 token 列表 + 右侧详情卡片。
- 左侧展示代币名称和当前价格。
- 右侧展示完整投研信息。
- 支持投研报告链接。

### LFI 特殊外部指标

用户提出：`https://lienfi.com/` 可看到 LFI 真实 TVL/Portfolio Live。

当前实现：

- 后端函数：`getLienFiMetrics()`
- 后端抓取 `https://lienfi.com/` 公开 HTML。
- 解析 `Portfolio / Live / $数字`。
- 缓存 5 分钟。
- 在 `/api/member/position-plans` 中，仅当 visible plans 包含 `LFI` 时读取。
- 只给 `LFI` plan 附加 `externalMetrics`。
- 前端 `member-research.html` 在 LFI 详情中展示 `LienFi TVL 观察` 小窗。

近期验证：

- `Portfolio Live: $120,105`

如果 lienfi.com 页面结构变动，解析可能失败，前端会显示“暂时无法自动读取官网数据”并提供官网链接。

## 12. 智库系统

后台：

- `/admin-thinktank.html`

成员页：

- `/member-thinktank.html`

分享页：

- `/thinktank-share.html`

数据：

- `thinktank-posts.json`

功能：

- 后台维护智库文章。
- 白名单成员可看全文。
- 分享页只展示约 300 字开头内容。
- 分享页有二维码分享图功能。
- 手机端曾优化过文章阅读效果，避免内容过宽和排版错位。

## 13. 仓位管理大模块

后台：

- `/admin-portfolio.html`

前台：

- `/portfolio.html`

数据：

- `portfolio-manager.json`

目标：

- 后台填写交易计划与备注。
- 前台以大表格方式展示关键数据。
- 前台需要白名单访问。

主要字段：

- symbol
- assetType：binance / onchain
- chainId
- contractAddress
- maxPositionPct
- confirmedAvgCost
- fundamentals
- strategy
- keyDate
- twitterUrl
- tags
- priceLines
- trades

已实现能力：

- 自动联动社区基金持仓，自动建档。
- 持仓数量、成本、收益率尽量从基金持仓和资产快照中计算。
- 支持手动确认早期真实成本。
- 合约地址支持复制按钮。
- 横向表格内容垂直居中到价格线图中线位置。
- 前台不显示价格线明细字段，只显示价格线定位可视化。

### 4 小时压力/支撑线

接口：

- `/api/admin/portfolio-manager/technical-lines`
- `/api/portfolio-manager/technical-lines`

当前逻辑：

- 拉取 Binance Spot 或 Binance Alpha 的 4H K 线。
- 使用最近约 30 天，即约 180 根 4H K 线作为核心结构。
- 获取 240 根作为数据余量。
- 生成三档压力：近端压力、关键压力、强压力。
- 生成三档支撑：近端支撑、关键支撑、强支撑。
- 如果月内上方/下方结构不足，会按月度波动区间外推补线，避免缺少关键/强位。

前台视觉：

- 压力位为绿色，越强颜色越深。
- 支撑位为红色，越强颜色越深。
- 说明只放在“价格线定位可视化”栏目表头，不在每个图里重复。

## 14. 概念联动雷达

前台：

- `/linkage.html`

后台：

- `/admin-linkage.html`

数据：

- `linkage-data.json`

目标：

- 标记某一波概念行情的联动效果。
- 记录概念、代币、触发事件、代币之间的跟涨关系。
- 接入 Binance 24h ticker 辅助展示涨幅。

当前属于第一版，用户反馈“有点看不懂”，后续可继续优化信息架构与可视化。

## 15. 下载中心

前台：

- `/downloads.html`

后台：

- `/admin-downloads.html`

数据：

- `downloads.json`

文件目录：

- `/root/binance-fund-viewer/public/downloads`

功能：

- 后台上传文件。
- 前台只能下载。
- 单文件限制已改为 `100MB`。

## 16. 联系方式系统

前台：

- `/contact.html`

后台：

- `/admin-alpha.html` 中的联系方式模块。

数据：

- `contact-config.json`

功能：

- 支持多个二维码。
- 每个二维码可标注用途。
- 支持多个链接。
- 页面布局：左侧竖列二维码，右侧竖列链接，链接说明前缀居左。

## 17. Binance / Alpha / 链上数据接口

已接入/使用：

### Binance 私有账户接口

用于基金资产：

- `/api/v3/account`
- `/sapi/v1/asset/get-funding-asset`

需要 `.env` 中 `BINANCE_API_KEY` 和 `BINANCE_API_SECRET`。

### Binance 公共现货接口

用于价格、K 线、ticker：

- `/api/v3/ticker/price`
- `/api/v3/ticker/24hr`
- `/api/v3/klines`

### Binance Alpha 公开接口

已封装：

- `/api/alpha/token-list`
- `/api/alpha/exchange-info`
- `/api/alpha/ticker`
- `/api/alpha/klines`
- `/api/alpha/agg-trades`

后端使用：

- `getAlphaTokenList`
- `getAlphaSymbolMap`
- `getAlphaTickerBySymbol`
- `fetchAlphaKlinesForAnalysis`

### Binance Web3 代币价格

用于链上代币价格：

- `getWeb3TokenPrice(chainId, contractAddress)`

### Solana 价格

用于 Solana 代币价格：

- `getSolanaTokenPrice(mintAddress)`
- 来源 DexScreener。

### 社区链上钱包持仓

用于首页链上模块与总资产：

- Binance Web3 `active-position-list`
- 后端函数：`fetchBinanceWeb3ActivePositions`

## 18. Binance Agentic Wallet / BAW

服务器已安装：

- `/usr/bin/baw`
- `@binance/agentic-wallet@1.0.9`

历史用途：

- 曾用于登录钱包、查询地址、余额、交易、额度。
- 当前首页链上模块已不依赖 BAW，改为公开地址监控。

最近登录状态曾成功：

- `baw wallet status --json` 返回过 `CONNECTED`

但当前网站运行不依赖它。

## 19. 已发生的重要开发节点

简略时间线：

- 初期：登录服务器，排查 OpenClaw 后台流量问题，明确“保住网页，其它可关”。
- 建立基金首页：展示资产、持仓、价格、份额/净值。
- 解决 Alpha 持仓无法自动抓取：新增后台手动维护 `alpha-holdings.json`。
- 添加管理员后台密码与白名单。
- 修复多次中文乱码与白屏问题。
- 增加投资人查询系统：专属 4 位查询码，隐藏姓名。
- 增加投资人管理后台，支持追加资金多记录同查询码。
- 增加资产委托说明页，并多次调整经济模型与退出机制。
- 将“净值/份额”语言体系优化为发行价、实时份额单价、份额、流通量。
- 首页新增发行结构饼图、份额现价日图、仓位变动播报。
- 新增核心成员投研系统与智库系统。
- 新增智库分享页，限制 300 字预览和二维码分享图。
- 新增下载中心，后台上传，前台下载。
- 新增联系方式后台维护。
- 新增概念联动雷达。
- 新增仓位管理大模块，前后台分离。
- 价格线从短线噪音优化为 30 天 4H 结构线。
- 首页视觉根据 DYOR 哨兵营 LOGO 做过美化，后续去掉强行 LOGO 和多余动态元素。
- 移除网页连接 Web3 钱包功能。
- 改首页链上模块为社区基金公开地址监控，并计入基金总资产。
- 链上模块升级为持仓代币表，过滤低于 1U 的资产，并给非基础代币添加复制合约按钮。
- LFI 投研卡片接入 lienfi.com 的 Portfolio Live 数据小窗。

## 20. 当前主要 API 列表

公共：

- `GET /api/fund`
- `GET /api/assets?email=...`
- `POST /api/login`
- `GET /api/contact`
- `GET /api/wallet-dashboard`
- `GET /api/downloads`
- `GET /api/linkage`
- `POST /api/investor/query`
- `GET /api/portfolio-manager`
- `POST /api/portfolio-manager/technical-lines`
- `GET /api/member/position-plans?email=...`
- `GET /api/member/thinktank-posts?email=...`
- `GET /api/thinktank-posts-preview`
- `GET /api/thinktank-post-preview?id=...`
- `GET /api/qrcode?text=...`

管理员：

- `GET /api/admin/keys`
- `GET/POST /api/admin/whitelist`
- `POST /api/admin/whitelist/replace`
- `GET/POST /api/admin/wallet-whitelist`
- `POST /api/admin/wallet-whitelist/replace`
- `GET/POST /api/admin/fund-config`
- `GET/POST /api/admin/alpha-holdings`
- `GET/POST /api/admin/contact-config`
- `GET/POST /api/admin/position-plans`
- `GET/POST /api/admin/portfolio-manager`
- `POST /api/admin/portfolio-manager/technical-lines`
- `GET/POST /api/admin/thinktank-posts`
- `GET/POST /api/admin/investors`
- `GET/POST /api/admin/linkage`
- `GET /api/admin/downloads`
- `POST /api/admin/downloads/upload`
- `POST /api/admin/downloads/delete`

Binance Alpha 代理：

- `GET /api/alpha/token-list`
- `GET /api/alpha/exchange-info`
- `GET /api/alpha/ticker`
- `GET /api/alpha/klines`
- `GET /api/alpha/agg-trades`

## 21. 常见维护注意事项

1. 中文编码是重点风险。不要用默认 PowerShell 输出重写中文 HTML/JS。
2. 修改 `server.js` 前后必须运行：

```powershell
node --check E:\codex\remote-server.js
```

3. 修改 HTML 内联脚本后建议运行：

```powershell
@'
const fs = require('fs');
const s = fs.readFileSync('E:/codex/xxx.html', 'utf8');
const m = s.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
console.log('script ok');
'@ | node -
```

4. 部署后检查：

```bash
systemctl is-active binance-fund-viewer.service
tail -n 80 /root/binance-fund-viewer/server.log
curl -s http://127.0.0.1:3000/api/fund
```

5. `remote-index.html` 历史上存在多个同名函数覆盖，例如 `renderWalletDashboard`、`loadFundData`。如果修改首页，务必确认最终生效的是脚本后部的最后一个同名函数。
6. `member-research.html` 当前本地文件不带 `remote-`，部署到 `/root/binance-fund-viewer/public/member-research.html`。
7. `remote-server.js` 是当前后端本地工作副本，部署为 `/root/binance-fund-viewer/server.js`。
8. 生产服务器上有很多 `.bak-*` 备份，不要随便删除。
9. 不要输出或提交 `.env` 的密钥内容。
10. 链上钱包持仓依赖 Binance Web3 公开接口，如果接口结构变化，首页链上模块和总资产里的 `onchainWallet` 会受影响。
11. LFI TVL 小窗依赖 `lienfi.com` 页面 HTML 里的 `Portfolio Live` 文本，如果页面结构变化，可能需要更新正则。

## 22. 近期用户偏好与产品方向

用户倾向：

- 不要复杂 UI，优先实用、能维护。
- 页面需要“看得懂”，尤其是仓位、份额、净值这些概念。
- 对核心社区成员和投资人要严格权益隔离。
- 数据可以手填，但后台维护要方便。
- 重要新功能上线后，应主动询问是否加入首页产品迭代公告。
- 对链上模块，用户希望简洁横版表格，不要复杂卡片，不展示小额灰尘资产。
- 对投研模块，用户希望能逐步接入项目外部关键数据源，例如 LFI 的 TVL。

未来可能继续做：

- Web3 新人路径导航/成长地图工具。
- 仓位管理大模块继续强化。
- 概念联动雷达可视化优化。
- 首页产品迭代公告机制。
- 更多投研项目的外部数据小窗。
- 链上钱包更多维度：交易记录、仓位变化历史、成本核算。

## 23. 快速恢复上下文的提示词

如果重新开窗口，可以把下面这段给 Codex/GPT：

```text
这是 DYOR 哨兵营网站项目。生产服务器在 163.7.9.6，项目目录 /root/binance-fund-viewer，服务 binance-fund-viewer.service，后端 server.js，本地工作副本在 E:\codex\remote-server.js。网站是社区基金门户，包含首页基金看板、投资人查询、白名单投研、智库、仓位管理、下载中心、联系方式、概念联动雷达、链上钱包监控。请先阅读 E:\codex\DYOR_SITE_HANDOFF.md，再根据任务修改。注意中文编码、不要泄露 .env、部署前 node --check，部署后 systemctl restart 并验证接口。
```
