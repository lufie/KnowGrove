# 言续

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · **繁體中文** · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

言續是一套本機優先的 Obsidian 知識工作流程，適合「收集速度快於整理速度」的使用者。它保留原始資料、擷取有用結構、把內容連結到主題與證據，再沉澱成可重複使用的成果。

目前原始碼版本：`2.8.30`

## 從資料到成果的一條工作流程

| 收集 | 處理 | 組織 | 創作 |
| --- | --- | --- | --- |
| 儲存文章、連結、本機音訊／影片、錄音與圖片。 | 擷取網頁正文，把圖片轉成結構化 Markdown，轉錄音訊與影片。 | 稍後閱讀，管理屬性，連結主題、評論、區塊引用與證據。 | 根據選定資料產生大綱、報告、長文與不同平台版本。 |

Vault 始終是唯一事實來源。言續不收集用戶端遙測；只有你選擇的本機工具或相容模型服務才會處理相應內容。

## 主要功能

- **稍後閱讀**：共用收集匣、未讀／已讀篩選，以及讀到文末後自動標記。
- **瀏覽器與行動裝置剪藏**：收集文章、影片、連結與輕量語音筆記。
- **內容處理**：保留文章圖片；影片優先使用字幕，沒有字幕時改用本機語音轉錄。
- **AI 圖片轉文字**：支援單張或整篇圖片轉換，把表格與結構化文字寫在原圖下方；背景工作顯示真實階段，可取消並定位結果。
- **類 Word 即時預覽編輯**：標題、清單、工作、圖片、程式碼區塊與表格保留排版；刪除所選空白行時會保留並修復 GFM 表格邊界，確保即時預覽與閱讀檢視仍能渲染。
- **快速且可復原的剪藏**：瀏覽器工作進入耗時佇列前先建立並回讀可開啟的最小 Markdown，後續 AI 或媒體處理在背景繼續。
- **超長文件導覽**：標題索引首尾皆可到達，檔案定位按鈕保持可見，且不接管正文捲動。
- **屬性管理**：檢查屬性、預覽建議並批次套用已確認的修正，不覆寫未知欄位。
- **主題與研究**：瀏覽所有主題、彙整相關來源，並管理領域、主題與研究問題。
- **評論與區塊引用**：評論選取文字，並透過 Obsidian 原生區塊嵌入重複使用來源內容。
- **證據導向創作**：從選定資料產生大綱、報告、長文與不同平台版本。
- **安全附件清理**：只追蹤曾被引用的附件；失去最後一個引用時先詢問，再移至 Obsidian 回收筒。

## 語言與資料

KnowGrove 會跟隨 Obsidian 的介面語言。切換語言不會翻譯或修改筆記標題、路徑、評論、領域、主題、屬性值、frontmatter、Base 或 Markdown 內容。

## 安裝

可在 Obsidian 的 **設定 → 第三方外掛 → 瀏覽** 搜尋並安裝 KnowGrove。

手動安裝時，從最新 GitHub Release 下載 `main.js`、`manifest.json` 與 `styles.css`，放入 `<vault>/.obsidian/plugins/knowgrove/`，重新載入 Obsidian 後啟用外掛。請勿複製其他使用者的 `data.json`。

## 開始使用

1. 確認“收集匣路徑”。
2. 需要 AI 整理時選擇本機 CLI 或相容 API。
3. 使用“自動整理元件 → 自動設定”準備文章、影片與語音工具。
4. 從左側工具列開啟閱讀列表、主題或工作區。

更多資料請參閱 [隱私政策](../../PRIVACY.md)、[安全說明](../../SECURITY.md) 與 [MIT 授權](../../LICENSE)。
