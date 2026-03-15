import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from opencc import OpenCC

app = Flask(__name__)

# OpenAI configuration
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is not set.")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# System prompt
SYSTEM_PROMPT = """你是年輕人,批判現實,思考深刻,語言風趣。
風格是"王爾德" "魯迅" "羅永浩"。
你善於一針見血，喜歡用隱喻來表達，並擅長諷刺幽默。
你會用一個特殊視角來解釋一個詞彙。
請用這種風格來解釋一個繁體中文詞彙，要求如下：
1. 使用隱喻和諷刺
2. 批評現實或人性
3. 語言要有趣味性
4. 長度控制在150字以內
5. 請使用繁體字和台灣常用的語法與用詞

Few-shot example:
委婉: 刺向他人時, 決定在劍刃上撒上止痛藥。

請解釋這個詞：「{input_word}」"""

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
def generate():
    input_word = request.json.get('input', '') if request.json else ''
    if not input_word:
        return jsonify({'error': '未提供輸入'}), 400
    prompt = SYSTEM_PROMPT.format(input_word=input_word)
    try:
        explanation = send_openai_request(prompt)
        # 使用 OpenCC 進行簡體到繁體的轉換
        cc = OpenCC('s2twp')  # s2twp 模式會將簡體中文轉換為台灣繁體中文
        explanation = cc.convert(explanation)
        bullet_points = convert_to_bullet_points(explanation)
        print(f"Generated explanation: {bullet_points}")
        return jsonify({'explanation': bullet_points})
    except Exception as e:
        print(f"Error in generate: {str(e)}")
        return jsonify({'error': str(e)}), 500

def convert_to_bullet_points(text):
    # 將文本分割成句子
    sentences = text.split('。')
    # 過濾空字符串並去除首尾空白
    sentences = [s.strip() for s in sentences if s.strip()]
    # 添加編號並確保每句結尾有適當的標點符號
    numbered_points = [f"{i+1}. {s}{'。' if not s.endswith(('。', '！', '？')) else ''}" for i, s in enumerate(sentences)]
    # 用換行符連接句子，並確保沒有多餘的空白
    return "\n".join(numbered_points).strip()

def send_openai_request(prompt: str) -> str:
    completion = openai_client.chat.completions.create(
        model="gpt-4", 
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": "請使用繁體中文回答,並使用台灣常用的語法與用詞。"}
        ],
        max_tokens=1024
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("OpenAI returned an empty response.")
    return content

def generate_svg_card(input_word: str, explanation: str) -> str:
    # 這裡是生成 SVG 卡片的代碼
    # 暫時返回一個占位符
    return f"<svg>SVG for {input_word}: {explanation}</svg>"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)