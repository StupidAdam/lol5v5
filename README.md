# LOL 5v5 位置分配

10 人开黑工具：**队伍由玩家自己选**（蓝队 / 红队各 5 人），选满后**只为每队随机分配**上单 / 中单 / 打野 / 射手 / 辅助，结果可一键复制到微信群。

关键点：抽签**只洗位置，永远不动队伍**。蓝队的人不会跑到红队去。

- 纯前端静态页，无登录、无构建步骤
- 移动端优先，微信内直接打开可用
- **两种模式**：本地模式（零后端，名单存 localStorage + 网址）/ 协作模式（多人实时同时填，需 Supabase）
- 协作为**可选项**，默认关闭；不配置后端时就是一个纯离线小工具

## 使用流程

**协作模式（推荐，10 个人同时填）**

1. 任意一人点「创建房间 · 大家一起填」，拿到 6 位房间码
2. 点「复制邀请链接」发到群里，大家同时打开
3. 各自填名字、点自己想进的队，**所有人的界面实时更新**（<1 秒）
4. 人齐后任意一人点「分配位置」，全场看到同一份结果

**本地模式（一个人代填）**

1. 填名字 → 点「加入蓝队」或「加入红队」（队名可改，比如改成「一楼」「二楼」）
2. 想换队就再点另一个队的按钮；想退出就点槽位右边的「×」
3. 两队各自满 5 人后，点「一键随机分配位置」，位置不合意可以无限重抽，队伍不变
4. 点「复制结果」，把文本粘到群里

## 目录结构

```
lol-team-randomizer/
├── index.html          # 页面骨架：选队区 / 分配位置 / 结果区 / 历史 / 说明
├── assets/
│   ├── style.css       # 全部样式，移动端优先 + pastel 浅色配色
│   ├── config.js       # Supabase 的 URL / anon key（协作模式用，留空则纯本地）
│   └── app.js          # 全部逻辑：名单、位置随机、结果渲染、复制、协作同步
├── supabase.sql        # 协作模式要跑一次：建 rooms 表 + RLS + 开 Realtime
├── build.js            # 把上面几个文件内联打包成单文件 lol5v5.html（node build.js）
├── lol5v5.html         # 打包产物：自包含单文件，传哪都能跑
└── README.md
```

## 运行方式

**方式一：直接双击 `index.html`**（最简单，本地自己用）

**方式二：起一个本地静态服务**（想在手机上真机验证时用）

```bash
cd lol-team-randomizer
python3 -m http.server 8000
# 手机与电脑在同一 WiFi 下，浏览器访问 http://<电脑内网IP>:8000
```

**方式三：静态托管，拿到 https 链接发群里**（推荐）

任选一种，本质都是「把 `index.html` + `assets/` 这两个东西传上去，让别人能 GET 到 `index.html`」：

| 方式                       | 怎么做                                                                              | 成本   | 国内访问            | 备注                 |
| ------------------------ | -------------------------------------------------------------------------------- | ---- | --------------- | ------------------ |
| **A. 内置发布（⚠️ 内网）**       | 对助手说「发布这个目录」，自动出 https 链接                                                        | 免费   | **仅限腾讯内网**      | 域名是 `*.app-tencent.workbuddy.host`，**外网访问不到**，只能内网自用 |
| **B. GitHub Pages**      | 见下方命令                                                                            | 免费   | 正常（偶有波动）        | 最稳的长期方案，可绑自定义域名    |
| **C. Vercel / Netlify**  | `npx vercel --prod`，或把文件夹拖进 [app.netlify.com/drop](https://app.netlify.com/drop) | 免费   | 一般（Vercel 偶尔被墙） | 无需 git，拖拽即可        |
| **D. 腾讯云 COS / 阿里云 OSS** | 控制台开「静态网站」，上传 `index.html` 和 `assets/`                                           | 几毛/月 | 最快              | 默认域名可直接用；绑自己的域名需备案 |
| **E. Cloudflare Pages**  | 连 Git 或拖拽目录                                                                      | 免费   | 一般              | `pages.dev` 域名     |

GitHub Pages 具体命令（把 `<你>` 换成你的 GitHub 用户名）：

```bash
cd lol-team-randomizer
git init && git add . && git commit -m "LOL 5v5 位置分配"
# 在 github.com 上新建一个空仓库 lol-team-randomizer（不要勾 README）
git remote add origin git@github.com:<你>/lol-team-randomizer.git
git branch -M main && git push -u origin main
# 仓库 Settings → Pages → Build and deployment → Source: Deploy from a branch → main / root → Save
# 等 1~2 分钟，访问 https://<你>.github.io/lol-team-randomizer/
```

拿到链接后，群里的人点开即可；页面里的「生成邀请链接」会把两队名单编码进网址继续接力。

> **给朋友用请选 B / C / D / E**，A 是内网域名，外网打不开。

## 单文件版（推荐用于上传 / 直接发送）

```bash
node build.js      # 生成 lol5v5.html（约 28 KB，CSS 与 JS 全部内联）
```

`lol5v5.html` 不依赖任何外部文件，优势是：

- 上传到任意托管时**只需要传一个文件**（Netlify Drop、OSS、甚至 gist 都行）
- 也可以直接把这个文件发到微信群里，朋友下载后用手机浏览器打开即可（iOS 用 Safari「打开文件」，Android 用 Chrome 打开）
- 缺点：`file://` 下浏览器不允许改地址栏，所以「邀请链接接力」失效，只能手动填名字

## 关键文件说明

| 文件                 | 职责                                                                          |
| ------------------ | --------------------------------------------------------------------------- |
| `index.html`       | 4 个区块：① 蓝队 / 红队各 5 个槽位（队名可改、空位自动占位）+ 加入/邀请 ② 分配位置按钮 ③ 两队 × 五位置结果表 ④ 最近 5 次记录 |
| `assets/style.css` | CSS 变量集中在 `:root`；`.rosters` 手机上下排、≥560px 左右并排；`.teams` 同理                |
| `assets/app.js`    | 见下方「核心逻辑」                                                                    |

### 核心逻辑（app.js）

| 函数                         | 说明                                                                            |
| -------------------------- | ----------------------------------------------------------------------------- |
| `randInt(n)`               | 用 `crypto.getRandomValues` 生成随机整数，按 `floor(v / 2^32 * n)` 映射，**无取模偏差**        |
| `shuffle(list)`            | Fisher-Yates 洗牌                                                               |
| `makeAssign(names)`        | **只洗位置**：按 0-4 / 5-9 切片取两队的既有成员，每队独立洗一次 `POSITIONS` 后逐个落位 —— 队伍成员原封不动，队内位置不重复 |
| `draw()`                   | 若与上一次结果完全相同则重抽（最多 20 次）；连点会打断上一次动画，不会「点了没反应」                                  |
| `reveal()` / `animate()`   | 名字滚动 ~0.5s 后定格；`reveal(result, false)` 只刷新文案不放动画（改队名时用）                      |
| `resultText()`             | 生成可粘贴到群里的纯文本                                                                  |
| `buildUrl()` / `syncUrl()` | 把两队名单写进 `?blue=&red=`，用 `history.replaceState` 同步，随时可复制转发；兼容旧版 `?names=`     |
| `join(team)`               | 同名视为换队（先从原队移出），否则占用该队第一个空位；队满 5 人时提示换队                                        |
| `copy()`                   | 优先 `navigator.clipboard`，非安全上下文（如 `file://`）回退到 `execCommand('copy')`         |
| `markDirty(key)`           | 标记本地改动的字段，300ms 防抖后批量上传；`collab.applying` 期间不触发，避免回环              |
| `push()`                   | 拉取最新 → 按 dirty 字段合并 → 乐观锁 `update where version = N`，未命中则重试最多 3 次        |
| `applyRemote()`            | 应用远端数据；`result.at` 更大才接受新结果，并用 `reveal(result, false)` 不放动画            |
| `subscribe()` / `startPoll()` | Realtime 订阅 + 8 秒轮询兜底                                                        |

## 算法正确性

20 万次抽样验证结果（队伍固定，只洗位置）：

| 指标                    | 实测         | 理论    |
| --------------------- | ---------- | ----- |
| 串队 / 位置重复 / 人数异常      | 0 例违规      | 0     |
| 每人落到某个位置的次数（期望 40000） | 最大偏差 0.93% | 20%   |

另有 jsdom 冒烟测试全过：

- 单机 29 项：重点验证「蓝队成员始终等于蓝队名单」「重抽 6 次队伍成员组合恒定、位置排列在变」
- 协作 22 项（用内存版 Supabase mock 模拟多端）：创建/加入房间、实时广播、**并发改不同槽位双方改动都不丢**、`?room=` 自动加入、两端抽签结果一致、未配置后端时降级为本地模式

## 多人协作（可选，Supabase）

不配置就是纯本地工具，配了才能开房间。三步，5 分钟：

1. **建项目**：[supabase.com](https://supabase.com) 免费注册 → New project（约 2 分钟）
2. **建表**：控制台 → SQL Editor → 粘贴执行根目录的 `supabase.sql`（建 `rooms` 表 + RLS + 开 Realtime）
3. **填配置**：Project Settings → API → 把 **Project URL**（形如 `https://xxx.supabase.co`，**不要带 `/rest/v1/`**）和 **Publishable key**（新版叫法，等价于以前的 anon public key，`sb_publishable_` 开头）抄进 `assets/config.js`，重新部署

验证：打开页面点「创建房间」，状态点变绿显示「已连接」就成功了。

### 同步机制

| 机制 | 做法 |
|---|---|
| 传输 | Supabase Realtime 订阅 `rooms` 表的 UPDATE，谁改谁广播，其他人 <1s 收到 |
| 兜底 | Realtime 断线时自动降级为 **8 秒轮询**；微信里 WebSocket 偶发被掐也能用 |
| 粒度 | 按**字段级**上传（`p0`…`p9` / `t0` / `t1` / `result`），不是整包覆盖 |
| 冲突 | **乐观锁**：`update ... where version = 已知版本`，被抢先就重新拉取、只合并自己改过的字段再写，最多重试 3 次 |
| 抽签 | 任意一人点「分配位置」，结果写入房间，`at` 更大的才接受 —— 保证全场同一份结果，不会各抽各的 |
| 重连 | 房间码存 localStorage，刷新页面自动重连；链接带 `?room=XXXXXX` 打开自动加入 |

### 安全性

anon key 放在前端是 Supabase 的设计前提，安全靠 RLS：`rooms` 表只开放 select / insert / update，且没有 delete 权限，房间里只有名字和位置，无敏感信息。房间数据默认不清理，SQL 里注释了一段 pg_cron 定期清 7 天前房间的语句，需要就打开。

## 关于「自动读取微信 ID」

网页**无法**获取微信昵称 / openid —— 微信只在小程序与公众号授权体系内开放身份信息，且昵称头像接口近年已收紧，为此去注册小程序并提审并不划算。本工具的等价方案：

1. 发起者点「生成邀请链接」，两队名单被编码进网址（`?blue=张三,李四&red=王五,...`），转发到群里；
2. 每个人打开链接看到两队进度，填名字 + 点自己想进的队，浏览器记住「我」在哪一档，链接自动更新后继续转给下一个人；
3. 名字只填一次，之后打开同一链接自动带出。

## 已知边界

- 每队上限 5 人，满员后需换队或移出一人；空位以「蓝队空位 N / 红队空位 N」占位参与分配。
- 不开房间时仍是「生成邀请链接 → 接力填」的旧玩法（无实时同步）；要多人同时填必须开协作模式。
- 协作模式依赖 Supabase 免费额度（Realtime 与数据库用量对这个量级绰绰有余）；Supabase 项目闲置 7 天会被暂停，重新打开即可。
- 复制功能在 `file://` 下走 `execCommand` 回退，个别浏览器可能失败，此时手动选中文本即可。
