const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenCC = require("opencc-js");
const { defineSecret } = require("firebase-functions/params");
const { notifyGoogleChat, getClientIp, maskIp, truncate } = require("./notify-google-chat");

// Google Chat 通知網址：每次有人使用 AI 都通知網站主人（放在 Secret Manager）
const GOOGLE_CHAT_WEBHOOK_URL = defineSecret("GOOGLE_CHAT_WEBHOOK_URL");
const SITE_NAME = "漢語新解";
const FEATURE_NAME = "AI 詞語新解";

// Basic Rate Limiting (In-memory, per instance)
const rateLimit = new Map();
const LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // 5 requests per minute

// Initialize Global Options
setGlobalOptions({ maxInstances: 10, region: "asia-east1" });

// System prompt adapted for Gemini
const SYSTEM_PROMPT = `你是年輕人,批判現實,思考深刻,語言風趣。
風格是"王爾德" "魯迅" "羅永浩"。
你善於一針見血，喜歡用隱喻來表達，並擅長諷刺幽默。
你回以 JSON 格式，包含：
1. "explanation": 解釋詞彙（繁體中文），要求使用隱喻、諷刺，批評現實或人性，長度 150 字內。
2. "mood": 情感色調，僅限 "positive" (昂揚/褒義), "negative" (抑鬱/貶義), "neutral" (清冷/中性)。
請務必使用繁體中文和台灣常用的語法與用詞。

Example:
{
  "explanation": "委婉：刺向他人時，決定在劍刃上撒上止痛藥。",
  "mood": "neutral"
}`;

const cors = ["https://cagoooo.github.io"];

exports.generateExplanation = onRequest({
    cors: cors,
    secrets: ["GEMINI_API_KEY", GOOGLE_CHAT_WEBHOOK_URL]
}, async (req, res) => {
    // Check for POST method
    if (req.method !== "POST") {
        return res.status(405).send({ error: "Method Not Allowed" });
    }

    const startedAt = Date.now();
    const clientIp = getClientIp(req);
    // 沒有登入身分，通知只帶查詢詞語（前 20 字）與遮蔽末段的來源 IP
    const report = (status, extra = {}) => notifyGoogleChat({
        status,
        siteName: SITE_NAME,
        feature: FEATURE_NAME,
        durationMs: Date.now() - startedAt,
        ip: clientIp,
        ...extra,
        fields: [
            { label: "查詢詞語", value: truncate((req.body && req.body.input) || "（空白）", 20) || "（空白）" },
            { label: "來源 IP", value: maskIp(clientIp) },
            ...(extra.fields || [])
        ]
    });

    // Basic Rate Limiting
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const userRequests = rateLimit.get(ip) || [];
    const recentRequests = userRequests.filter(time => now - time < LIMIT_WINDOW);

    if (recentRequests.length >= MAX_REQUESTS) {
        logger.warn(`Rate limit exceeded for IP: ${ip}`);
        // 被擋下也通知（同一 IP 每 5 分鐘最多 1 則）
        await report("blocked", { fields: [{ label: "HTTP 狀態", value: "429（請求過於頻繁）" }] });
        return res.status(429).send({ error: "請求過於頻繁，請稍後再試（誠心方能得真相）。" });
    }
    recentRequests.push(now);
    rateLimit.set(ip, recentRequests);

    logger.info("Request Body:", req.body);
    const inputWord = (req.body && req.body.input) || "";
    if (!inputWord) {
        await report("failed", { error: "未提供輸入" });
        return res.status(400).send({ error: "未提供輸入" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.error("GEMINI_API_KEY is not set in environment variables.");
        await report("failed", { error: "伺服器配置錯誤（GEMINI_API_KEY 未設定）" });
        return res.status(500).send({ error: "伺服器配置錯誤" });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        logger.info(`Requesting explanation for: ${inputWord}`);
        const result = await model.generateContent(`請解釋這個詞：「${inputWord}」`);
        const response = await result.response;
        const responseText = response.text();
        logger.info(`Raw AI response: ${responseText}`);
        const data = JSON.parse(responseText);

        // Convert explanation to Traditional Chinese (Taiwan mapping)
        const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
        let explanation = converter(data.explanation);

        // Format to bullet points
        const bulletPoints = convertToBulletPoints(explanation);

        logger.info(`Generated for ${inputWord}: ${data.mood} (Model: Pro)`);
        await report("success", { fields: [{ label: "情感色調", value: String(data.mood || "—") }] });
        res.status(200).send({
            explanation: bulletPoints,
            mood: data.mood
        });

    } catch (error) {
        logger.error("Error generating content:", error);
        await report("failed", { error: (error && error.message) || String(error) });
        res.status(500).send({ error: "AI 生成失敗，請稍後再試", detail: error.message });
    }
});

function convertToBulletPoints(text) {
    const sentences = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 0);
    return sentences.map((s, i) => `${i + 1}. ${s}${s.match(/[。！？]$/) ? '' : '。'}`).join('\n');
}
