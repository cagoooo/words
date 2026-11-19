const firebaseConfig = {
    apiKey: "__VITE_FIREBASE_API_KEY__",
    authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
    projectId: "__VITE_FIREBASE_PROJECT_ID__",
    storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__VITE_FIREBASE_APP_ID__"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- Firebase Auth：必須用 Google 帳號登入才能使用（匿名不算） ---
const DAILY_LIMIT = 3;
const TURNSTILE_SITE_KEY = '0x4AAAAAADIPhhdOK3_0FrkR';
const TURNSTILE_ACTION = 'words_explain';

function isGoogleUser(user) {
    return !!(user && !user.isAnonymous &&
        (user.providerData || []).some(p => p && p.providerId === 'google.com'));
}

function loginErrorMessage(error) {
    const code = (error && error.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '登入視窗已關閉，請再按一次「使用 Google 帳號登入」';
    if (code === 'auth/popup-blocked') return '瀏覽器擋住了登入視窗，請允許本站開啟彈出式視窗後再試';
    if (code === 'auth/network-request-failed') return '網路連線不穩，請確認網路後再登入';
    if (code === 'auth/unauthorized-domain') return '此網址尚未被允許登入，請通知網站管理員';
    if (code === 'auth/web-storage-unsupported' || code === 'auth/operation-not-supported-in-this-environment') return '這個瀏覽器不支援登入，請改用 Chrome 或 Safari 開啟';
    return '登入失敗，請稍後再試';
}


/**
 * Simple IndexedDB Wrapper for History
 */
class HistoryDB {
    constructor() {
        this.dbName = 'HistoryDB';
        this.storeName = 'scrolls';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = (event) => reject('Database error: ' + event.target.errorCode);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
        });
    }

    async add(record) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add({ ...record, timestamp: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject('Add error');
        });
    }

    async getAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.reverse()); // latest first
            request.onerror = () => reject('Get error');
        });
    }
}

const historyDB = new HistoryDB();

// --- App Starts ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DB
    await historyDB.init();

    const input = document.getElementById('input-word');
    const generateBtn = document.getElementById('generate-btn');
    const resultDiv = document.getElementById('result-container');
    const errorDiv = document.getElementById('error');
    const bgm = document.getElementById('bgm');
    const sfxStamp = document.getElementById('sfx-stamp');
    const proceduralBg = document.getElementById('procedural-bg');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings');
    const sealNameInput = document.getElementById('seal-name');
    const sealFontSelect = document.getElementById('seal-font');
    const historyBtn = document.getElementById('history-btn');
    const historySidebar = document.getElementById('history-sidebar');
    const closeHistoryBtn = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history');
    const shareBtn = document.getElementById('share-btn');

    // Load User Preferences
    let userSettings = JSON.parse(localStorage.getItem('userSettings')) || {
        sealName: '漢語新解',
        sealFont: "'Noto Serif TC', serif"
    };

    // Initialize Inputs
    sealNameInput.value = userSettings.sealName;
    sealFontSelect.value = userSettings.sealFont;

    // Modal Control
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove('active');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newName = sealNameInput.value.trim() || '漢語新解';
        const newFont = sealFontSelect.value;
        userSettings = { sealName: newName, sealFont: newFont };
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        settingsModal.classList.remove('active');
    });

    // History Sidebar Control
    historyBtn.addEventListener('click', async () => {
        await refreshHistoryList();
        historySidebar.classList.add('active');
    });

    closeHistoryBtn.addEventListener('click', () => {
        historySidebar.classList.remove('active');
    });

    historySidebar.addEventListener('click', (e) => {
        if (e.target === historySidebar) historySidebar.classList.remove('active');
    });

    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('確定要清空所有歷史紀錄嗎？')) {
            const transaction = historyDB.db.transaction([historyDB.storeName], 'readwrite');
            const store = transaction.objectStore(historyDB.storeName);
            const request = store.clear();
            request.onsuccess = () => {
                refreshHistoryList();
            };
        }
    });

    async function refreshHistoryList() {
        const records = await historyDB.getAll();
        historyList.innerHTML = '';
        if (records.length === 0) {
            historyList.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">尚無歷史回響</div>';
            return;
        }

        records.forEach(record => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const dateStr = new Date(record.timestamp).toLocaleString();
            item.innerHTML = `
                <div class="word">「${record.word}」</div>
                <div class="time">${dateStr}</div>
            `;
            item.addEventListener('click', () => {
                renderCard(record.word, record.explanation, record.mood, false);
                historySidebar.classList.remove('active');
            });
            historyList.appendChild(item);
        });
    }

    // Social Sharing
    shareBtn.addEventListener('click', async () => {
        const container = document.getElementById('result-container');
        if (!container.classList.contains('active')) return;

        shareBtn.style.opacity = '0'; // Hide button in capture

        try {
            const canvas = await html2canvas(container, {
                backgroundColor: '#FCF9F2',
                scale: 2, // High resolution
                useCORS: true,
                logging: false,
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.getElementById('result-container');
                    clonedContainer.style.boxShadow = 'none';
                    clonedContainer.style.border = 'none';

                    // 強制讓所有動畫元素立即顯示（解決截圖時 opacity:0 問題）
                    clonedDoc.querySelectorAll('.ink-spread').forEach(el => {
                        el.style.opacity = '1';
                        el.style.animation = 'none';
                        el.style.filter = 'none';
                        el.style.transform = 'none';
                    });
                    clonedDoc.querySelectorAll('.bento-block').forEach(el => {
                        el.style.opacity = '1';
                        el.style.transform = 'none';
                        el.style.transition = 'none';
                    });
                    // 確保印章也完整顯示
                    const sealEl = clonedDoc.getElementById('seal-element');
                    if (sealEl) {
                        sealEl.style.opacity = '0.8';
                        sealEl.style.animation = 'none';
                        sealEl.style.transform = 'rotate(-10deg) scale(1)';
                    }
                    // 隱藏分享按鈕
                    const shareFab = clonedDoc.getElementById('share-btn');
                    if (shareFab) shareFab.style.display = 'none';
                }
            });

            const link = document.createElement('a');
            link.download = `漢語新解-${document.querySelector('#block-main h3').innerText.replace(/[「」]/g, '')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Sharing error:', err);
            alert('輸出失敗，請稍後再試。');
        } finally {
            shareBtn.style.opacity = '1';
        }
    });

    // Firebase Functions URL placeholder for injection
    let API_URL = "__VITE_GEMINI_API_URL__";

    // Prevent relative path issues on GitHub Pages
    if (API_URL === "__VITE_GEMINI_API_URL__" || API_URL.startsWith('/api')) {
        API_URL = "https://asia-east1-teacher-c571b.cloudfunctions.net/generateExplanation";
    }

    // --- 登入區塊 ---
    const signedOutBox = document.getElementById('auth-signed-out');
    const signedInBox = document.getElementById('auth-signed-in');
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userNameEl = document.getElementById('auth-user-name');
    const quotaHint = document.getElementById('quota-hint');
    const turnstileBox = document.getElementById('turnstile-box');

    let turnstileWidgetId = null;
    let turnstileToken = '';

    function updateQuotaHint(remaining) {
        if (typeof remaining === 'number') {
            quotaHint.textContent = `今日剩餘 ${remaining} / ${DAILY_LIMIT} 次`;
        } else {
            quotaHint.textContent = `每人每天 ${DAILY_LIMIT} 次`;
        }
    }

    function renderAuth(user) {
        const ok = isGoogleUser(user);
        signedOutBox.hidden = ok;
        signedInBox.hidden = !ok;
        if (ok) {
            userNameEl.textContent = user.displayName || user.email || 'Google 使用者';
            updateQuotaHint();
            ensureTurnstile();
        }
    }

    auth.onAuthStateChanged((user) => {
        // 舊版留下的匿名身分不算登入：直接登出，避免殘留
        if (user && user.isAnonymous) {
            auth.signOut().catch(() => { });
        }
        renderAuth(user);
    });

    loginBtn.addEventListener('click', async () => {
        loginBtn.disabled = true;
        errorDiv.textContent = '';
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error('Google sign-in failed:', error && error.code);
            showError(loginErrorMessage(error));
        } finally {
            loginBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut().catch(() => { });
        errorDiv.textContent = '';
    });

    // --- Cloudflare Turnstile 人機驗證 ---
    function ensureTurnstile(attempt = 0) {
        if (turnstileWidgetId !== null) return;
        if (!window.turnstile || !window.turnstile.render) {
            if (attempt < 40) setTimeout(() => ensureTurnstile(attempt + 1), 250);
            else showError('人機驗證載入失敗，請重新整理頁面');
            return;
        }
        const narrow = turnstileBox.clientWidth > 0 && turnstileBox.clientWidth < 300;
        turnstileWidgetId = window.turnstile.render(turnstileBox, {
            sitekey: TURNSTILE_SITE_KEY,
            action: TURNSTILE_ACTION,
            language: 'zh-tw',
            size: narrow ? 'compact' : 'normal',
            callback: (token) => { turnstileToken = token; },
            'expired-callback': () => { turnstileToken = ''; },
            'error-callback': () => { turnstileToken = ''; }
        });
    }

    function resetTurnstile() {
        turnstileToken = '';
        if (turnstileWidgetId !== null && window.turnstile) {
            try { window.turnstile.reset(turnstileWidgetId); } catch (e) { }
        }
    }

    function apiErrorMessage(status, result) {
        if (status === 401) return (result && result.error) || '請先用 Google 帳號登入才能使用（每人每天 3 次）';
        if (status === 403) return (result && result.error) || '人機驗證未通過，請重新驗證後再試';
        if (status === 429) {
            if (result && result.code === 'daily_limit') return `今天 ${DAILY_LIMIT} 次已用完，明天再來`;
            return (result && result.error) || '請求過於頻繁，請稍後再試';
        }
        return (result && result.error) || '解析真相失敗，請稍後再試';
    }

    async function generateExplanation(word, idToken, token) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ input: word, turnstileToken: token })
        });
        let result = {};
        try { result = await response.json(); } catch (e) { }
        return { status: response.status, ok: response.ok, result };
    }

    generateBtn.addEventListener('click', async () => {
        const inputWord = input.value.trim();
        const currentUser = auth.currentUser;
        if (!isGoogleUser(currentUser)) {
            showError('🔒 請先用 Google 帳號登入才能使用（每人每天 3 次）');
            return;
        }
        if (!inputWord) {
            showError('請輸入一個漢語詞彙');
            return;
        }
        if (!turnstileToken) {
            ensureTurnstile();
            showError('請先完成下方的人機驗證，再按「揭露真相」');
            return;
        }

        if (bgm.paused) {
            bgm.volume = 0.3;
            bgm.play().catch(e => console.log('Audio autoplay blocked or failed'));
        }

        setLoading(true);
        errorDiv.textContent = '';
        const tokenToSend = turnstileToken;

        try {
            const idToken = await currentUser.getIdToken();
            const { status, ok, result } = await generateExplanation(inputWord, idToken, tokenToSend);
            if (typeof result.remaining === 'number') updateQuotaHint(result.remaining);
            if (status === 429 && result.code === 'daily_limit') updateQuotaHint(0);
            if (ok && result.explanation) {
                renderCard(inputWord, result.explanation, result.mood, true);
            } else {
                showError(apiErrorMessage(status, result));
            }
        } catch (error) {
            console.error(error);
            showError('網路異常，連向真相的道路被阻斷了，請稍後再試');
        } finally {
            // Turnstile token 只能用一次：每次呼叫後都重新驗證
            resetTurnstile();
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        generateBtn.disabled = isLoading;
        const btnText = generateBtn.querySelector('.btn-text');
        btnText.textContent = isLoading ? '正在揭露中...' : '揭露真相';
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.add('fade-in');
    }

    function updateBackground(mood) {
        const bg = document.getElementById('procedural-bg');
        if (!bg) return;

        bg.innerHTML = '';
        const assets = {
            positive: './ink_elements/bamboo.png',
            negative: './ink_elements/tree.png',
            neutral: './ink_elements/mountain.png'
        };

        const assetSrc = assets[mood] || assets.neutral;
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'bg-element';
            el.style.backgroundImage = `url('${assetSrc}')`;
            const left = Math.random() * 80;
            const top = Math.random() * 80;
            const size = 150 + Math.random() * 300;
            const rotate = (Math.random() - 0.5) * 20;

            el.style.left = `${left}%`;
            el.style.top = `${top}%`;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.transform = `rotate(${rotate}deg) scale(${0.8 + Math.random()})`;
            bg.appendChild(el);

            setTimeout(() => {
                el.classList.add('active');
            }, 100 * i);
        }
    }

    function renderCard(word, explanation, mood, shouldSave = true) {
        const container = document.getElementById('result-container');
        const mainBlock = document.getElementById('block-main');
        const satireBlock = document.getElementById('block-satire');
        const metaBlock = document.getElementById('block-meta');

        if (shouldSave) {
            historyDB.add({ word, explanation, mood }).catch(err => console.error(err));
        }

        updateBackground(mood);

        let seal = document.getElementById('seal-element');
        if (!seal) {
            seal = document.createElement('div');
            seal.id = 'seal-element';
            seal.className = 'seal';
            container.appendChild(seal);
        }

        let displaySeal = userSettings.sealName;
        if (displaySeal.length === 4 || displaySeal.length === 3) {
            displaySeal = displaySeal.substring(0, 2) + '<br>' + displaySeal.substring(2);
        }

        seal.innerHTML = displaySeal;
        seal.style.fontFamily = userSettings.sealFont;
        seal.classList.remove('stamped');

        const points = explanation.split('\n');
        const coreTruth = points[0] || '無言以對。';
        const satellites = points.slice(1).join('<br><br>');

        mainBlock.innerHTML = `
            <div class="ink-spread">
                <h3 style="color: var(--ink-black); margin-bottom: 20px; font-size: 1.8rem; font-weight: 700;">「${word}」</h3>
                <div style="font-size: 1.3rem; color: var(--text-main); line-height: 2; border-left: 4px solid var(--seal-red); padding-left: 20px;">
                    ${coreTruth}
                </div>
            </div>
        `;

        satireBlock.innerHTML = satellites ? `
            <div class="ink-spread" style="animation-delay: 0.5s;">
                <div style="margin-top: 10px; font-size: 1.1rem; color: var(--ink-gray); line-height: 1.8;">
                    ${satellites}
                </div>
            </div>
        ` : '';

        metaBlock.innerHTML = `
            <span>隨遇而安 心誠則靈</span>
            <span>歲次：${new Date().getFullYear()}</span>
        `;

        container.classList.add('active');

        const blocks = container.querySelectorAll('.bento-block');
        blocks.forEach((block, index) => {
            block.style.opacity = '0';
            block.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                block.style.transition = 'all 0.6s ease-out';
                block.style.opacity = '1';
                block.style.transform = 'translateX(0)';
            }, index * 200);
        });

        setTimeout(() => {
            seal.classList.add('stamped');
            sfxStamp.currentTime = 0;
            sfxStamp.play().catch(e => console.log('SFX block'));
        }, blocks.length * 200 + 400);
    }
});
