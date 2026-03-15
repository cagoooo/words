const firebaseConfig = {
    apiKey: "AIzaSyC3S1ERsvbJ2AxyNea1AF7_FzkLUmWO_Ng",
    authDomain: "teacher-c571b.firebaseapp.com",
    projectId: "teacher-c571b",
    storageBucket: "teacher-c571b.firebasestorage.app",
    messagingSenderId: "82691545657",
    appId: "1:82691545657:web:fceb4a86812691bc958be8"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Firebase Auth ---
auth.signInAnonymously().catch((error) => {
    console.error("Anonymous sign-in failing:", error);
});

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("User signed in anonymously:", user.uid);
    } else {
        console.log("User signed out");
    }
});


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
    let API_URL = "https://asia-east1-teacher-c571b.cloudfunctions.net/generateExplanation";

    // Prevent relative path issues on GitHub Pages
    if (API_URL === "https://asia-east1-teacher-c571b.cloudfunctions.net/generateExplanation" || API_URL.startsWith('/api')) {
        API_URL = "https://asia-east1-teacher-c571b.cloudfunctions.net/generateExplanation";
    }

    async function generateExplanation(word) {
        const currentUser = auth.currentUser;
        const headers = { 'Content-Type': 'application/json' };

        if (!currentUser) {
            console.log("No user signed in, attempting anonymous sign-in...");
            await auth.signInAnonymously();
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ input: word })
        });

        return response.json();
    }

    generateBtn.addEventListener('click', async () => {
        const inputWord = input.value.trim();
        if (!inputWord) {
            showError('請輸入一個漢語詞彙');
            return;
        }

        if (bgm.paused) {
            bgm.volume = 0.3;
            bgm.play().catch(e => console.log('Audio autoplay blocked or failed'));
        }

        setLoading(true);
        errorDiv.textContent = '';

        try {
            const result = await generateExplanation(inputWord);
            if (result.explanation) {
                renderCard(inputWord, result.explanation, result.mood, true);

                const currentUser = auth.currentUser;
                if (currentUser) {
                    db.collection('users').doc(currentUser.uid).collection('history').add({
                        word: inputWord,
                        explanation: result.explanation,
                        mood: result.mood,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        console.log("Successfully synced to Firestore");
                    }).catch((err) => {
                        console.error("Firestore sync error:", err);
                    });
                }
            } else {
                showError(result.error || '解析真相失敗，請稍後再試');
            }
        } catch (error) {
            console.error(error);
            showError('網絡異常，連向真相的道路被阻斷了');
        } finally {
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
