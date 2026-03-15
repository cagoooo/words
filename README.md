# 漢語新解 (New Dictionary) - 詳細使用說明

本專案是一個基於 AI 的詞彙解釋工具，模仿「王爾德」、「魯迅」、「羅永浩」等風格，提供批判性、幽默且充滿隱喻的漢語新解。

## 🚀 快速開始

### 1. 環境需求
- Python 3.11+
- [Poetry](https://python-poetry.org/) (建議) 或 pip

### 2. 安裝步驟
1. 複製專案至本地。
2. 安裝依賴項：
   ```bash
   poetry install
   ```
   *或者使用 pip：*
   ```bash
   pip install flask openai opencc-python-reimplemented
   ```

### 3. 配置環境變數
在專案根目錄建立 `.env` 檔案，或直接在環境中設置：
```env
OPENAI_API_KEY=你的_OPENAI_API_KEY
```

### 4. 啟動伺服器
執行以下指令啟動 Flask 開發伺服器：
```bash
python main.py
```
伺服器將在 `http://localhost:5000` 運行。

## 🛠️ 核心功能說明

### AI 詞彙生成
- **模型**：使用 OpenAI `gpt-4`。
- **風格**：融合了批判現實、幽默與深刻思考的文字風格。
- **繁體轉換**：系統會自動將生成內容轉換為台灣繁體中文，並調整為台灣常用語法。

### SVG 卡片生成
- 生成的解釋會自動封裝進一個精美的 SVG 卡片中。
- **互動性**：卡片在鼠標懸停時具有 3D 傾斜效果。

## 📂 專案結構
- `main.py`: Flask 後端主程式，處理 OpenAI 請求與文字轉換。
- `templates/index.html`: 前端頁面結構。
- `static/css/styles.css`: 頁面與按鈕的視覺樣式。
- `static/js/app.js`: 前端邏輯，控制異步請求與 SVG 動態渲染。

## ⚠️ 注意事項
- 請確保 OpenAI 帳戶有足夠的額度。
- 本專案目前的 API 金鑰管理方式為環境變數，請勿將金鑰硬編碼在程式碼中或上傳至公開倉庫。
