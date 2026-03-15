import os
from openai import OpenAI

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY 環境變數未設定。請在運行應用程式前設定此變數。")

openai_client = OpenAI(api_key=OPENAI_API_KEY)

def send_openai_request(prompt: str) -> str:
    completion = openai_client.chat.completions.create(
        model="gpt-4", messages=[{"role": "user", "content": prompt}], max_tokens=1024
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("OpenAI 返回了空回應。")
    return content