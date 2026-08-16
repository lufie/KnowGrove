# KnowGrove 内容解析兼容性实测报告

- 测试日期：2026-08-15
- Obsidian Vault：本机 `Documents`
- 初始审计版本：KnowGrove 2.8.14
- 最新复测候选：KnowGrove 2.8.18 + 浏览器扩展 0.3.13
- 初始修复候选：KnowGrove 2.8.17 + 浏览器扩展 0.3.8
- 运行组件：FFmpeg 6.0、yt-dlp 2026.07.04、whisper.cpp + `ggml-small.bin`
- 网络边界：公开内容优先匿名读取；受保护媒体只有在用户主动点击、当前站点动态授权后，才把当前 URL 可用的登录态临时交给本机 KnowGrove，不持久化、不上传言序服务器

## 2.8.17 修复后复测

本轮已完成以下代码缺口修复：

1. 远程 M4A/AAC/OPUS/WEBM 在 whisper.cpp 下统一先转 16 kHz 单声道 PCM WAV，并验证逐字稿文件存在。
2. 登录页、验证码、人机验证、过期分享和“页面不见了”不再被当作正文或成功结果。
3. 文章继续保存正文，并最多解析 3 个内嵌音视频；单个媒体失败不会使文章丢失。
4. Instagram、Vimeo、Dailymotion、Twitch、Facebook、微信视频号补齐视频分类。
5. 小红书等动态页面补充浏览器可见内容图片；排除头像、导航、图标和页头页尾。
6. Apple Podcasts 通过 Apple 公共 Lookup API 精确解析分享单集；没有 `i` 参数时选择最新单集。
7. 抖音、TikTok、小红书、西瓜视频、Instagram、Facebook、微信视频号增加用户主动的当前站点授权。扩展只读取当前 URL 可用的 Cookie、User-Agent、Referer、播放器地址和有限的平台页面状态；插件用权限 `0600` 的临时 Cookie 文件执行单次任务并在 `finally` 中删除。
8. 增加 `tests/fixtures/capture-platforms.json` 与 `pnpm test:capture-compat`，维护公开链接、预期链路、最近预检结果和明确的浏览器登录态边界。

### 修复后端到端结果

| 原始链接 | 结果 | 证据 |
| --- | --- | --- |
| https://soundcloud.com/user-554763457/short-composition-kevin-kellymusic-and-technology-podcast | 通过 | 远程 M4A 下载、PCM 转换、Whisper 英文逐字稿、中文摘要、原始音频 Wikilink 和 Vault 回读均成功 |
| https://podcasts.apple.com/us/podcast/top-five-tech/id1894113824?i=1000772352959 | 通过 | Apple Lookup 命中指定 `trackId`，下载 3:41 单集、Whisper 英文逐字稿、中文摘要、原始音频 Wikilink 和 Vault 回读均成功 |
| https://www.douyin.com/jingxuan?modal_id=7659606204008480421 | 匿名失败符合预期 | 保留来源链接，显示“先播放，再从扩展授权当前站点并重试”，未标记为完成；0.3.8 登录态点按仍待 Chrome 重新加载扩展后验收 |

两条端到端成功任务的测试 Markdown 和媒体附件均已移入系统回收站；用户既有笔记、设置和评论/引用未被覆盖。

### 2026-08-15 自动预检矩阵

命令：`KNOWGROVE_CAPTURE_TIMEOUT_MS=45000 KNOWGROVE_CAPTURE_CONCURRENCY=4 pnpm test:capture-compat`

| 平台 | 原始链接 | 匿名预检 | 预期链路 |
| --- | --- | --- | --- |
| 微信公众号 | https://mp.weixin.qq.com/s/aZEeBKNa-6moQW_I1Ixf-w | HTTP 200 | 公开正文 |
| 普通网页 | https://www.anthropic.com/news/claude-opus-4-1 | HTTP 200 | 公开正文 |
| 海外媒体 | https://apnews.com/article/d92d0108730d146baa46da041b8523da | HTTP 200 | 公开正文 |
| Medium | https://medium.com/codetodeploy/i-built-a-public-ai-workflow-repository-without-writing-code-d21e00142ef9 | HTTP 403 | 浏览器已渲染正文 |
| X | https://x.com/elonmusk/status/1662292805312495618?lang=en | HTTP 200 | 公开正文/浏览器可见内容 |
| Bilibili | https://www.bilibili.com/video/BV1L24y1i7v3 | 媒体元数据通过 | 字幕优先，音轨回退 |
| YouTube | https://www.youtube.com/watch?v=rwF-X5STYks | 媒体元数据通过 | 字幕优先，音轨回退 |
| 腾讯视频 | https://v.qq.com/x/page/q326831cny0.html | 媒体元数据通过 | 公开媒体 |
| 微博视频 | https://weibo.com/tv/show/1034:4797699866951785?from=old_pc_videoshow | 媒体元数据通过 | 公开媒体 |
| Vimeo | https://vimeo.com/56015672 | macOS OAuth 401 | 浏览器播放器地址兜底 |
| Dailymotion | https://www.dailymotion.com/video/x84sh87 | 媒体元数据通过 | 公开媒体 |
| SoundCloud | https://soundcloud.com/user-554763457/short-composition-kevin-kellymusic-and-technology-podcast | 媒体元数据通过 | 公开音频，已完成端到端 |
| Apple Podcasts | https://podcasts.apple.com/us/podcast/top-five-tech/id1894113824?i=1000772352959 | Apple API 命中 | 公开 enclosure，已完成端到端 |
| 小红书 | https://www.xiaohongshu.com/explore/6964ebb300000000220214c9 | 需要新鲜分享参数/浏览器页面 | 当前站点授权 + 可见播放器 |
| 抖音 | https://www.douyin.com/video/7045232252812397864 | 需要新鲜 Cookie | 当前站点授权 + 可见播放器 |
| TikTok | https://www.tiktok.com/@officially_lunch2.0/video/6916040989090057477 | 页面响应异常 | 当前站点授权 + 可见播放器 |
| Instagram | https://www.instagram.com/reel/Chunk8-jurw/ | 媒体元数据通过 | 公开优先，当前站点授权兜底 |
| 西瓜视频 | https://www.ixigua.com/6996881461559165471 | 需要 Cookie | 当前站点授权 + 可见播放器 |
| 微信视频号 | https://weixin.qq.com/sph/AExvvHzwD | 下载器不支持页面 URL | 当前站点授权 + 可见播放器 |

自动预检只验证当前 URL 的可达性或媒体元数据，不等同于完整转录。完整通过仍要求字幕/音轨、Whisper、AI、Vault 写入和文件回读全部成功。

### 0.3.13 最新复测进度

本轮在 0.3.8 的平台适配基础上增加两项浏览器侧修复：

1. 用户拒绝或尚未授予当前站点权限时，不再进入只有“重试”但无法重新请求权限的死循环。失败面板会明确提供“允许当前站点并重试”和“使用公开解析”两条路径；授权范围仍仅为当前页面的精确 origin。
2. 抖音精选流 `https://www.douyin.com/jingxuan?modal_id=<视频 ID>` 会在创建任务前转换成下载器可识别的 `https://www.douyin.com/video/<视频 ID>`。当前精选流页面仍保留为 Referer、权限范围和浏览器可见内容来源。

用户在 Chrome 中对 `https://www.douyin.com/jingxuan?modal_id=7653682159667989801` 的最新观察已经证明：扩展可识别页面为视频、可连接本机 KnowGrove，并能在无当前站点权限时进入权限错误分支。截图中仍只有通用“重试”按钮，说明 Chrome 当时加载的仍是旧扩展运行态，尚不能作为 0.3.13 权限恢复交互的验收证据。

重新运行 19 个公开测试夹具后的预检分组如下：

- 公开正文或媒体元数据可达（12）：微信公众号、普通网页、海外媒体、X、Bilibili、YouTube、腾讯视频、微博视频、Dailymotion、SoundCloud、Apple Podcasts、Instagram。
- 需要浏览器已渲染内容（2）：Medium；Vimeo 的旧公开夹具已经返回 404，需要更换有效公开视频后再验收。
- 需要当前浏览器会话（5）：小红书、抖音、TikTok、西瓜视频、微信视频号。

以上仍是预检，不等同于 19 个站点全部端到端成功。0.3.13 的最终关闭条件是：在 Chrome 手动重新加载扩展后，对受保护平台逐一完成当前站点授权、任务处理、Markdown/附件落盘和 Vault 文件回读；失败项保留平台错误与可操作恢复入口，不得标记为完成。

## 结论

KnowGrove 目前不能宣称“任意链接都可以自动解析”。

- 本地音视频文件格式：12/12 通过真实转码和 Whisper 转录。
- 稳定通过：普通网页、微信公众号文章、海外新闻、Medium、X 单条推文、Bilibili、YouTube。
- 条件通过：小红书图文/视频需要未过期的分享参数；图文正文可提取，但内容图片没有完整保留。Instagram 的下载器可识别，但自动分类没有进入视频链路。
- 当前失败：抖音、TikTok、Vimeo、微信视频号、Apple Podcasts、远程 SoundCloud 音频的完整转录。
- 文章中的嵌入视频或音频目前不会作为第二种资源继续下载和转录。

## 测试口径

测试分为四层：

1. 类型识别：文章、视频或音频。
2. 原始内容提取：正文、字幕或音轨。
3. 转录：优先字幕；没有字幕时下载音轨并交给本地 Whisper。
4. Vault 落盘：生成 Markdown 后重新读取文件，确认文件存在、来源链接与原文/逐字稿存在、`KnowGrove采集状态` 为 `已完成`。

为排除模型输出波动，Vault 落盘验证使用固定的合法 AI JSON 响应；网页读取、媒体下载、字幕解析、FFmpeg、Whisper 和 Obsidian 写入均使用插件真实代码与本机运行组件。

## 本地文件格式

测试语音：`这是言序兼容性测试。每一种音频和视频格式，都应该成功识别这段中文语音。`

| 文件格式 | 插件路径 | 结果 |
| --- | --- | --- |
| MP3 | Whisper 直接读取 | 通过 |
| M4A | FFmpeg 转 16 kHz 单声道 WAV，再转录 | 通过 |
| WAV | Whisper 直接读取 | 通过 |
| AAC | FFmpeg 转 WAV，再转录 | 通过 |
| FLAC | Whisper 直接读取 | 通过 |
| OGG | Whisper 直接读取 | 通过 |
| OPUS | FFmpeg 转 WAV，再转录 | 通过 |
| WEBM | FFmpeg 转 WAV，再转录 | 通过 |
| MP4 | FFmpeg 提取音轨并转 WAV，再转录 | 通过 |
| MOV | FFmpeg 提取音轨并转 WAV，再转录 | 通过 |
| MKV | FFmpeg 提取音轨并转 WAV，再转录 | 通过 |
| M4V | FFmpeg 提取音轨并转 WAV，再转录 | 通过 |

12 个文件都包含可识别音轨并生成了非空逐字稿。`言序` 被 small 模型识别为同音词 `延续`，属于 ASR 准确率问题，不是格式失败。

## 文章与社交内容

| 类型 | 原始测试链接 | 类型识别 | 正文提取 | 结果与说明 |
| --- | --- | --- | --- | --- |
| 微信公众号 | https://mp.weixin.qq.com/s/aZEeBKNa-6moQW_I1Ixf-w | 文章 | 3,911 字符 | 通过；标题、作者和正文均取得；端到端 Vault 回读通过 |
| 普通官网文章 | https://www.anthropic.com/news/claude-opus-4-1 | 文章 | 2,517 字符 | 通过 |
| 海外新闻媒体 | https://apnews.com/article/d92d0108730d146baa46da041b8523da | 文章 | 10,920 字符 | 通过；标题、作者、正文图片链接均取得 |
| Medium | https://medium.com/codetodeploy/i-built-a-public-ai-workflow-repository-without-writing-code-d21e00142ef9 | 文章 | 13,777 字符 | 通过；插件内置请求与 Defuddle 回退组合成功 |
| X/Twitter 单条推文 | https://x.com/elonmusk/status/1662292805312495618?lang=en | 文章 | 347 字符 | 通过；取得单条推文正文。未验证线程、回复和媒体附件 |
| 小红书图文 | https://www.xiaohongshu.com/explore/69be967100000000230079de | 文章 | 2,319 字符 | 部分通过；需要未过期 `xsec_token`，正文与作者可取得，内容图片未完整保留 |
| 小红书过期分享 | https://www.xiaohongshu.com/explore/692ec670000000001e03b4df | 文章外壳 | 错误页 | 失败；页面返回“你访问的页面不见了”，不能当作有效正文 |

## 视频平台

| 平台 | 原始测试链接 | 自动分类/短链 | 字幕或音轨 | 结果 |
| --- | --- | --- | --- | --- |
| Bilibili | https://www.bilibili.com/video/BV1L24y1i7v3 | 视频 | 无正文字幕，下载音轨并 Whisper | 通过；生成 1,349 字符逐字稿 |
| Bilibili 既有故障样本 | https://www.bilibili.com/video/BV1aN3q69E8z/ | 视频 | 当前公开接口不返回字幕 | 元数据通过；不再出现 HTTP 412，需走音轨回退 |
| Bilibili 短链 | https://b23.tv/aABFOIy | 正确解析为 Bilibili 视频 | 未执行完整转录 | 短链识别通过 |
| YouTube | https://www.youtube.com/watch?v=rwF-X5STYks | 视频 | 英文字幕 | 通过；生成 1,577 字符逐字稿 |
| YouTube 短链 | https://youtu.be/rwF-X5STYks | 正确解析为视频 | 同上 | 短链识别通过 |
| 小红书视频 | https://www.xiaohongshu.com/explore/6964ebb300000000220214c9 | 正确识别为视频 | 无字幕，下载 15 秒音轨并 Whisper | 通过；生成非空短逐字稿。需要未过期 `xsec_token` |
| 抖音 | https://www.douyin.com/video/7045232252812397864 | 视频 | 下载器要求新鲜 Cookie | 失败 |
| 抖音短链 | https://v.douyin.com/2P3GdpcK5e8/ | 正确解析并跳转为视频 | 同上 | 类型识别通过，提取失败 |
| TikTok | https://www.tiktok.com/@officially_lunch2.0/video/6916040989090057477 | 视频 | yt-dlp 返回 `Unexpected response` | 失败 |
| 微信视频号 | https://weixin.qq.com/sph/AExvvHzwD | 被识别为文章 | yt-dlp 不支持跳转后的 Channels URL | 失败 |
| Vimeo | https://vimeo.com/56015672 | 未列入固定视频域名 | yt-dlp 获取 macOS OAuth token 时 HTTP 401 | 失败 |
| Instagram Reel | https://www.instagram.com/reel/Chunk8-jurw/ | 自动探测误判为文章 | 手动交给 yt-dlp 时可取得视频元数据 | 自动链接处理失败；需要补域名分类 |
| 腾讯视频 | https://v.qq.com/x/page/q326831cny0.html | 视频 | 可取得视频元数据 | 预检通过，未执行完整转录 |
| 微博视频 | https://weibo.com/tv/show/1034:4797699866951785?from=old_pc_videoshow | 视频 | 可取得 1:16 视频元数据 | 预检通过，未执行完整转录 |
| 优酷 | https://v.youku.com/v_show/id_XOTU0NDc3MTk2 | 视频 | SSL `UNEXPECTED_EOF` | 失败 |
| 爱奇艺 | https://www.iqiyi.com/a_19rrh8opfp.html | 视频入口 | 下载器未找到可用视频 | 失败 |
| 西瓜视频 | https://www.ixigua.com/6996881461559165471 | 视频 | 要求 Cookie | 失败 |

## 音频与播客平台

| 平台 | 原始测试链接 | 下载 | 转录 | 结果 |
| --- | --- | --- | --- | --- |
| SoundCloud | https://soundcloud.com/user-554763457/short-composition-kevin-kellymusic-and-technology-podcast | 成功，M4A 已写入后清理 | `transcript.txt` 未生成 | 失败；远程 M4A 没有先转 PCM WAV，是确定性代码缺口 |
| Apple Podcasts | https://podcasts.apple.com/us/podcast/top-five-tech/id1894113824 | 下载器读取页面不完整 | 未执行 | 失败 |
| 网易云音乐 | https://music.163.com/song?id=1901371647 | 可取得元数据 | 未执行语音转录 | 预检通过；音乐内容不适合作为语音准确率样本 |

## 文章内嵌媒体

使用以下页面验证文章中存在媒体元素时的行为：

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/audio

两个页面都被正确保留为“文章”，正文可提取，但插件只会本地化文章图片，不会枚举内嵌视频/音频并继续执行字幕、下载或转录。因此当前不支持“一篇文章正文 + 内嵌媒体逐个提取”的复合任务。

## Vault 落盘验证

使用微信公众号文章和 YouTube 逐字稿各运行一次完整写入流程，结果均为：

- `status = completed`
- `storageVerified = true`
- Markdown 文件实际存在且可重新读取
- 来源链接存在
- `## 原文` 或 `## 完整逐字稿` 存在
- `KnowGrove采集状态: "已完成"`

测试笔记、测试文件夹和测试附件已清理；用户现有设置已恢复。

## 建议修复优先级

1. P0：远程音频在 whisper.cpp 下统一先转 16 kHz 单声道 PCM WAV，并在读取前校验逐字稿文件是否存在。
2. P0：识别登录页、过期分享页、验证码页和“页面不见了”等错误壳，禁止把它们标记为成功。
3. P0：为文章增加资源清单；正文先落盘，再让用户选择是否解析内嵌视频/音频，避免一个 URL 只能进入一种类型。
4. P1：补齐 Instagram、Vimeo、微信视频号等域名分类，并对明确不支持的平台快速返回可行动错误。
5. P1：抖音、TikTok、西瓜等受保护平台需要浏览器扩展转交页面可见内容或一次性媒体地址；继续坚持不读取浏览器 Cookie。
6. P1：小红书图文补充真实内容图片提取，不保存导航图标、登录壳或 base64 占位图。
7. P2：为每个平台维护公开测试夹具、最近成功时间、组件版本和失败原因，发布前自动跑预检矩阵。
