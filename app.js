/* ========================================
   XỔ SỐ KIẾN THIẾT VIỆT NAM - App Logic
   ======================================== */

// ============ STATE ============
const TICKET_PRICE = 10000;

const PROVINCE_NAMES = {
    tphcm: 'TP. Hồ Chí Minh',
    dongnai: 'Đồng Nai',
    binhduong: 'Bình Dương',
    tayninh: 'Tây Ninh',
    cantho: 'Cần Thơ',
    dongthap: 'Đồng Tháp',
    camau: 'Cà Mau',
    bentre: 'Bến Tre',
    vungtau: 'Vũng Tàu'
};

// Prize structure: [name, count, digits, prize_amount]
const PRIZE_STRUCTURE = [
    { name: 'Đặc Biệt', key: 'db', count: 1, digits: 6, prize: 2000000000 },
    { name: 'Giải Nhất', key: 'g1', count: 1, digits: 5, prize: 30000000 },
    { name: 'Giải Nhì',  key: 'g2', count: 1, digits: 5, prize: 15000000 },
    { name: 'Giải Ba',   key: 'g3', count: 2, digits: 5, prize: 10000000 },
    { name: 'Giải Tư',   key: 'g4', count: 7, digits: 5, prize: 3000000 },
    { name: 'Giải Năm',  key: 'g5', count: 1, digits: 4, prize: 1000000 },
    { name: 'Giải Sáu',  key: 'g6', count: 3, digits: 4, prize: 400000 },
    { name: 'Giải Bảy',  key: 'g7', count: 1, digits: 3, prize: 200000 },
    { name: 'Giải Tám',  key: 'g8', count: 1, digits: 2, prize: 100000 },
];

let state = {
    balance: 1000000000000, // 1,000 Tỷ đồng mặc định để mua vé không giới hạn
    selectedProvince: 'tphcm',
    drawProvince: 'all', // 'all' or specific province key
    tickets: [],       // { id, number, province, date, drawId, status, winnings, winPrize }
    draws: [],         // { id, province, date, results: { db: [...], g1: [...], ... } }
    totalSpent: 0,
    totalWon: 0,
    winCount: 0,
};

// ============ INDEXEDDB PERSISTENCE (UNLIMITED TICKETS) ============
const DB_NAME = 'XSKT_LOTTERY_DB';
const DB_VERSION = 1;
const STORE_NAME = 'lottery_store';
let idb = null;

function initDB() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = (e) => {
                idb = e.target.result;
                resolve(idb);
            };
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

function rehydrateTickets(rawTickets) {
    if (!Array.isArray(rawTickets)) return [];
    return rawTickets.map(t => ({
        id: t.id,
        number: t.number || t.n || '',
        province: t.province || t.p || 'tphcm',
        provinceName: PROVINCE_NAMES[t.province || t.p] || t.provinceName || 'TP. Hồ Chí Minh',
        date: t.date || t.d || new Date().toISOString(),
        drawId: t.drawId !== undefined ? t.drawId : t.di,
        status: t.status || t.s || 'pending',
        winnings: t.winnings !== undefined ? t.winnings : (t.w || 0),
        winPrize: t.winPrize !== undefined ? t.winPrize : (t.wp || null),
    }));
}

function loadStateFromLocalStorage() {
    try {
        const saved = localStorage.getItem('xskt_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            if (!state.drawProvince) state.drawProvince = 'all';
            if (!state.balance || state.balance < 1000000000) {
                state.balance = 1000000000000;
            }
            if (Array.isArray(state.tickets)) {
                state.tickets = rehydrateTickets(state.tickets);
            }
        }
    } catch (e) {
        console.warn('Failed to load localStorage:', e);
    }
}

async function loadState() {
    // 1. Load from localStorage first for immediate UI
    loadStateFromLocalStorage();

    // 2. Then check IndexedDB for full uncapped ticket history
    const db = await initDB();
    if (db) {
        try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('xskt_full_state');
            req.onsuccess = () => {
                if (req.result && Array.isArray(req.result.tickets)) {
                    state = { ...state, ...req.result };
                    state.tickets = rehydrateTickets(state.tickets);
                    if (!state.drawProvince) state.drawProvince = 'all';
                    if (!state.balance || state.balance < 1000000000) {
                        state.balance = 1000000000000;
                    }
                    updateBalanceDisplay();
                    updateStats();
                    renderTickets();
                    renderDrawProvinceChips();
                }
            };
        } catch (e) {
            console.warn('IndexedDB read error:', e);
        }
    }
}

function saveState() {
    // 1. Save to IndexedDB (supports UNLIMITED tickets with no quota issues)
    if (idb) {
        try {
            const tx = idb.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(state, 'xskt_full_state');
        } catch (e) {
            console.warn('IndexedDB write error:', e);
        }
    }

    // 2. Save compact sample copy to localStorage for fast non-blocking sync
    try {
        const sampleTickets = state.tickets.slice(0, 1000).map(t => ({
            id: t.id,
            n: t.number,
            p: t.province,
            d: t.date,
            di: t.drawId,
            s: t.status,
            w: t.winnings || 0,
            wp: t.winPrize || null,
        }));
        
        const toSave = {
            ...state,
            tickets: sampleTickets,
        };
        
        localStorage.setItem('xskt_state', JSON.stringify(toSave));
    } catch (e) {}
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    updateBalanceDisplay();
    updateStats();
    renderTickets();
    renderPastDraws();
    renderDrawProvinceChips();
    updateCheckerDrawOptions();
    createParticles();
    
    // Set preview date
    const previewDate = document.getElementById('preview-date');
    if (previewDate) {
        previewDate.textContent = formatDate(new Date());
    }
});

// ============ PARTICLES ============
function createParticles() {
    const container = document.getElementById('particles-bg');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#ffd700', '#e63946', '#6366f1', '#2ecc71'];
    
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const color = colors[i % colors.length];
        const size = Math.random() * 3 + 2;
        const left = Math.random() * 94 + 3;
        const duration = Math.random() * 12 + 14;
        const delay = Math.random() * 6;
        
        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            left: ${left}%;
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
            transform: translateZ(0);
            will-change: transform;
        `;
        container.appendChild(particle);
    }
}

// ============ UTILITY ============
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(date) {
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function generateRandomDigits(count) {
    if (count === 6) {
        return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }
    const max = Math.pow(10, count);
    return Math.floor(Math.random() * max).toString().padStart(count, '0');
}

function padNumber(num, digits) {
    return num.toString().padStart(digits, '0');
}

// ============ TAB SWITCHING ============
function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    if (tabName === 'draw') {
        renderDrawProvinceChips();
    }
    if (tabName === 'tickets') {
        renderTickets();
        updateStats();
    }
    if (tabName === 'results') {
        renderPastDraws();
        updateCheckerDrawOptions();
    }
}

// ============ PROVINCE SELECTION (BUY) ============
function selectProvince(btn) {
    document.querySelectorAll('.province-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedProvince = btn.dataset.province;
    
    const previewProvince = document.getElementById('preview-province');
    if (previewProvince) {
        previewProvince.textContent = PROVINCE_NAMES[state.selectedProvince];
    }
}

// ============ DRAW PROVINCE CHIPS (DRAW TAB) ============
function renderDrawProvinceChips() {
    const container = document.getElementById('draw-province-chips');
    const badge = document.getElementById('draw-pending-badge');
    if (!container) return;

    // Count pending tickets
    const pendingTickets = state.tickets.filter(t => t.status === 'pending');
    const pendingByProvince = {};
    pendingTickets.forEach(t => {
        pendingByProvince[t.province] = (pendingByProvince[t.province] || 0) + 1;
    });

    if (badge) {
        if (pendingTickets.length > 0) {
            badge.textContent = `Đang có ${pendingTickets.length.toLocaleString('vi-VN')} vé chưa dò`;
            badge.classList.remove('no-pending');
        } else {
            badge.textContent = `0 vé chưa dò`;
            badge.classList.add('no-pending');
        }
    }

    const currentDrawProv = state.drawProvince || 'all';

    let chipsHtml = `
        <button class="draw-chip ${currentDrawProv === 'all' ? 'active' : ''}" onclick="selectDrawProvince('all')">
            🌐 Tất Cả Đài <span class="chip-count">${pendingTickets.length.toLocaleString('vi-VN')}</span>
        </button>
    `;

    Object.keys(PROVINCE_NAMES).forEach(key => {
        const count = pendingByProvince[key] || 0;
        const isActive = currentDrawProv === key ? 'active' : '';
        chipsHtml += `
            <button class="draw-chip ${isActive}" onclick="selectDrawProvince('${key}')">
                📍 ${PROVINCE_NAMES[key]} ${count > 0 ? `<span class="chip-count highlight">${count.toLocaleString('vi-VN')}</span>` : ''}
            </button>
        `;
    });

    container.innerHTML = chipsHtml;
}

function selectDrawProvince(provKey) {
    state.drawProvince = provKey;
    renderDrawProvinceChips();
}

// ============ NUMBER INPUT ============
function handleDigitInput(input, index) {
    const value = input.value.replace(/\D/g, '');
    input.value = value;
    
    if (value && index < 5) {
        const nextInput = document.querySelector(`.digit-input[data-index="${index + 1}"]`);
        if (nextInput) nextInput.focus();
    }
    
    updateTicketPreview();
}

function handleDigitKeydown(event, index) {
    if (event.key === 'Backspace' && !event.target.value && index > 0) {
        const prevInput = document.querySelector(`.digit-input[data-index="${index - 1}"]`);
        if (prevInput) {
            prevInput.focus();
            prevInput.value = '';
        }
        event.preventDefault();
    }
}

function getEnteredNumber() {
    const inputs = document.querySelectorAll('.digit-input');
    let number = '';
    inputs.forEach(input => {
        number += input.value || '';
    });
    return number;
}

function setNumber(numStr) {
    const inputs = document.querySelectorAll('.digit-input');
    for (let i = 0; i < 6; i++) {
        inputs[i].value = numStr[i] || '';
        inputs[i].style.transform = 'scale(1.2)';
        setTimeout(() => {
            inputs[i].style.transform = 'scale(1)';
        }, 200 + i * 50);
    }
    updateTicketPreview();
}

function generateRandomNumber() {
    const num = generateRandomDigits(6);
    setNumber(num);
    showToast('🎲', 'Đã tạo số ngẫu nhiên: ' + num, 'info');
}

function clearNumber() {
    const inputs = document.querySelectorAll('.digit-input');
    inputs.forEach(input => input.value = '');
    updateTicketPreview();
}

function updateTicketPreview() {
    const number = getEnteredNumber();
    const preview = document.getElementById('ticket-preview');
    const previewNumber = document.getElementById('preview-number');
    
    if (number.length === 6) {
        preview.style.display = 'flex';
        previewNumber.textContent = number;
    } else {
        preview.style.display = 'none';
    }
}

// ============ BUYING TICKETS ============
function buyTicket() {
    const number = getEnteredNumber();
    
    if (number.length !== 6) {
        showToast('⚠️', 'Vui lòng nhập đủ 6 chữ số!', 'error');
        return;
    }
    
    if (state.balance < TICKET_PRICE) {
        state.balance += 1000000000;
    }
    
    // Deduct balance
    state.balance -= TICKET_PRICE;
    state.totalSpent += TICKET_PRICE;
    
    // Create ticket
    const ticket = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        number: number,
        province: state.selectedProvince,
        provinceName: PROVINCE_NAMES[state.selectedProvince],
        date: new Date().toISOString(),
        drawId: null,
        status: 'pending', // pending, won, lost
        winnings: 0,
        winPrize: null,
    };
    
    // CỘNG DỒN với các vé chưa dò hiện tại, tự động dọn sạch vé đã dò ở vòng trước
    const existingPending = state.tickets.filter(t => t.status === 'pending');
    state.tickets = [ticket, ...existingPending];
    
    saveState();
    updateBalanceDisplay();
    updateStats();
    renderDrawProvinceChips();
    
    const totalPending = state.tickets.length;
    showToast('🎫', `Đã mua vé ${number}! Hiện đang có tổng cộng ${totalPending.toLocaleString('vi-VN')} vé chờ dò.`, 'success');
    
    clearNumber();
}

function quickBuy(count) {
    const totalCost = count * TICKET_PRICE;
    
    // Tự động cấp thêm vốn nếu số dư không đủ để mua thoải mái mọi số lượng vé
    if (state.balance < totalCost) {
        state.balance = totalCost + 100000000000;
    }
    
    state.balance -= totalCost;
    state.totalSpent += totalCost;
    
    const baseId = Date.now().toString(36);
    const nowIso = new Date().toISOString();
    const provKey = state.selectedProvince;
    const provName = PROVINCE_NAMES[provKey];
    
    const newTickets = new Array(count);
    for (let i = 0; i < count; i++) {
        newTickets[i] = {
            id: baseId + '_' + i,
            number: Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
            province: provKey,
            provinceName: provName,
            date: nowIso,
            drawId: null,
            status: 'pending',
            winnings: 0,
            winPrize: null,
        };
    }
    
    // CỘNG DỒN tất cả các vé mua thêm vào danh sách vé đang chờ dò (không bị ghi đè hay mất vé)
    const existingPending = state.tickets.filter(t => t.status === 'pending');
    state.tickets = newTickets.concat(existingPending);
    
    saveState();
    updateBalanceDisplay();
    updateStats();
    renderDrawProvinceChips();
    
    const totalPending = state.tickets.length;
    showToast('🎫', `Đã mua thêm ${count.toLocaleString('vi-VN')} vé (${provName})! Tổng cộng đang có ${totalPending.toLocaleString('vi-VN')} vé chờ dò.`, 'success');
}

function customQuickBuy() {
    const input = document.getElementById('custom-quick-buy');
    let count = parseInt(input.value);
    
    if (isNaN(count) || count < 1) {
        showToast('⚠️', 'Vui lòng nhập số lượng vé hợp lệ (ít nhất 1 vé).', 'error');
        return;
    }
    
    quickBuy(count);
    input.value = '';
}

// ============ DRAW SYSTEM ============
function generateDrawResults() {
    const results = {};
    
    PRIZE_STRUCTURE.forEach(prize => {
        results[prize.key] = [];
        for (let i = 0; i < prize.count; i++) {
            results[prize.key].push(generateRandomDigits(prize.digits));
        }
    });
    
    return results;
}

function startDraw(isFast = false) {
    const drawProvKey = state.drawProvince || 'all';
    
    // Find pending tickets that will be checked in this draw (luôn dò 100% tất cả các vé chưa dò)
    let pendingTicketsToCheck;
    let targetProvinceKey;
    let targetProvinceName;

    if (drawProvKey === 'all') {
        pendingTicketsToCheck = state.tickets.filter(t => t.status === 'pending');
        targetProvinceKey = state.selectedProvince;
        targetProvinceName = 'Tất Cả Các Đài';
    } else {
        pendingTicketsToCheck = state.tickets.filter(t => t.status === 'pending' && t.province === drawProvKey);
        if (pendingTicketsToCheck.length === 0 && state.tickets.some(t => t.status === 'pending')) {
            pendingTicketsToCheck = state.tickets.filter(t => t.status === 'pending');
            targetProvinceKey = 'all';
            targetProvinceName = 'Tất Cả Các Đài';
            state.drawProvince = 'all';
        } else {
            targetProvinceKey = drawProvKey;
            targetProvinceName = PROVINCE_NAMES[drawProvKey] || 'Đài Xổ Số';
        }
    }
    
    if (pendingTicketsToCheck.length === 0) {
        showToast('⚠️', `Bạn chưa có vé nào chưa dò! Hãy mua vé trước.`, 'error');
        return;
    }
    
    const btnDraw = document.getElementById('btn-draw');
    const btnDrawFast = document.getElementById('btn-draw-fast');
    const drawStatus = document.getElementById('draw-status');
    const globe = document.querySelector('.draw-globe');
    
    btnDraw.disabled = true;
    if (btnDrawFast) btnDrawFast.disabled = true;
    globe.classList.add('spinning');
    drawStatus.classList.add('drawing');
    drawStatus.textContent = 'Đang quay số mở thưởng...';
    
    const executeDrawCompletion = () => {
        globe.classList.remove('spinning');
        drawStatus.classList.remove('drawing');
        drawStatus.textContent = 'Đã mở thưởng xong! ✅';
        btnDraw.disabled = false;
        if (btnDrawFast) btnDrawFast.disabled = false;
        
        // Generate results
        const results = generateDrawResults();
        const drawId = 'D' + Date.now().toString(36).toUpperCase();
        const draw = {
            id: drawId,
            province: targetProvinceKey,
            provinceName: targetProvinceName,
            date: new Date().toISOString(),
            results: results,
        };
        
        state.draws.unshift(draw);
        
        // Check 100% of pending tickets accurately
        let totalWinThisDraw = 0;
        let wonTicketsCount = 0;
        let winDetails = [];
        const prizeBreakdown = {}; // { [prizeName]: { count: 0, amount: 0, total: 0 } }
        
        pendingTicketsToCheck.forEach(ticket => {
            ticket.drawId = drawId;
            const winResult = checkTicketAgainstResults(ticket.number, results);
            
            if (winResult.totalWin > 0) {
                ticket.status = 'won';
                ticket.winnings = winResult.totalWin;
                ticket.winPrize = winResult.prizes;
                state.totalWon += winResult.totalWin;
                state.winCount++;
                totalWinThisDraw += winResult.totalWin;
                wonTicketsCount++;
                
                // Tally breakdown for transparency
                winResult.prizes.forEach(p => {
                    if (!prizeBreakdown[p.name]) {
                        prizeBreakdown[p.name] = { count: 0, amount: p.amount, total: 0 };
                    }
                    prizeBreakdown[p.name].count++;
                    prizeBreakdown[p.name].total += p.amount;
                });

                if (winDetails.length < 50) {
                    winDetails.push({
                        number: ticket.number,
                        provinceName: ticket.provinceName,
                        winnings: winResult.totalWin,
                        prizes: winResult.prizes,
                    });
                }
            } else {
                ticket.status = 'lost';
            }
        });
        
        saveState();
        updateStats();
        renderDrawProvinceChips();
        updateCheckerDrawOptions();
        
        // Display results with full transparent breakdown
        displayDrawResults(draw, pendingTicketsToCheck.length, wonTicketsCount, totalWinThisDraw, prizeBreakdown);
        
        // Show win notification if won
        if (totalWinThisDraw > 0) {
            state.balance += totalWinThisDraw;
            saveState();
            updateBalanceDisplay();
            
            setTimeout(() => {
                showWinNotification(winDetails, totalWinThisDraw, pendingTicketsToCheck.length, wonTicketsCount, prizeBreakdown);
                launchConfetti();
            }, 400);
        } else {
            showToast('😢', `Đã dò đúng đủ ${pendingTicketsToCheck.length.toLocaleString('vi-VN')} vé: Không trúng giải. Chúc bạn may mắn lần sau!`, 'info');
        }
    };

    if (isFast) {
        setTimeout(executeDrawCompletion, 300);
    } else {
        let animStep = 0;
        const animTexts = [
            'Đang quay số mở thưởng... 🎱',
            'Lồng cầu đang quay số các giải... 🔴🟡🔵',
            'Đang mở thưởng Giải Đặc Biệt... 🟢🟣',
            'Đang xác nhận kết quả chính thức... ✨',
        ];
        
        const animInterval = setInterval(() => {
            animStep++;
            if (animStep < animTexts.length) {
                drawStatus.textContent = animTexts[animStep];
            }
        }, 700);
        
        setTimeout(() => {
            clearInterval(animInterval);
            executeDrawCompletion();
        }, 2800);
    }
}

// ============ VIETNAMESE LOTTERY WIN EVALUATION ============
function checkTicketAgainstResults(ticketNumber, results) {
    let totalWin = 0;
    let prizes = [];
    
    // 1. Check Standard Prizes (G8 -> G1, and DB)
    PRIZE_STRUCTURE.forEach(prize => {
        const prizeNumbers = results[prize.key] || [];
        const ticketSuffix = ticketNumber.slice(-prize.digits);
        
        prizeNumbers.forEach(pNum => {
            if (ticketSuffix === pNum) {
                totalWin += prize.prize;
                prizes.push({
                    name: prize.name,
                    amount: prize.prize,
                    matchedDigits: prize.digits,
                });
            }
        });
    });
    
    // 2. Special Prize Supplementary & Consolation (Luật XSKT VN)
    const dbNumber = results['db'] && results['db'][0] ? results['db'][0] : null;
    if (dbNumber && ticketNumber !== dbNumber) {
        // Giải Phụ Đặc Biệt (An ủi ĐB): Trúng 5 số cuối của Giải Đặc Biệt (chỉ sai số đầu tiên)
        if (ticketNumber.slice(1) === dbNumber.slice(1)) {
            const subSpecialPrize = 50000000;
            totalWin += subSpecialPrize;
            prizes.push({
                name: 'Giải Phụ Đặc Biệt',
                amount: subSpecialPrize,
                matchedDigits: 5,
            });
        } 
        // Giải Khuyến Khích: Trúng số đầu tiên và đúng 4 trong 5 số còn lại cùng vị trí
        else if (ticketNumber[0] === dbNumber[0]) {
            let mismatches = 0;
            for (let i = 1; i < 6; i++) {
                if (ticketNumber[i] !== dbNumber[i]) {
                    mismatches++;
                }
            }
            if (mismatches === 1) {
                const consolationPrize = 6000000;
                totalWin += consolationPrize;
                prizes.push({
                    name: 'Giải Khuyến Khích',
                    amount: consolationPrize,
                    matchedDigits: 5,
                });
            }
        }
    }
    
    return { totalWin, prizes };
}

function displayDrawResults(draw, totalChecked = 0, wonCount = 0, totalWon = 0, prizeBreakdown = {}) {
    const container = document.getElementById('draw-results');
    const tableContainer = document.getElementById('results-table-container');
    const provinceLabel = document.getElementById('draw-province-label');
    const dateLabel = document.getElementById('draw-date-label');
    const summaryBox = document.getElementById('draw-check-summary');
    
    container.style.display = 'block';
    provinceLabel.textContent = '📍 ' + draw.provinceName;
    dateLabel.textContent = '📅 ' + formatDate(new Date(draw.date)) + ' (' + draw.id + ')';
    
    if (summaryBox && totalChecked > 0) {
        summaryBox.style.display = 'block';
        const lostCount = totalChecked - wonCount;
        
        let breakdownHtml = '';
        const breakdownKeys = Object.keys(prizeBreakdown);
        if (wonCount > 0 && breakdownKeys.length > 0) {
            let itemsHtml = '';
            breakdownKeys.forEach(pName => {
                const item = prizeBreakdown[pName];
                itemsHtml += `
                    <div class="dcs-breakdown-item">
                        <span class="dcs-bi-name">🏆 ${pName}</span>
                        <span class="dcs-bi-count">x${item.count.toLocaleString('vi-VN')} vé</span>
                        <span class="dcs-bi-sum">+${formatCurrency(item.total)}</span>
                    </div>
                `;
            });
            breakdownHtml = `
                <div class="dcs-breakdown-box">
                    <div class="dcs-breakdown-title">📋 Chi tiết các giải đã trúng:</div>
                    <div class="dcs-breakdown-grid">${itemsHtml}</div>
                </div>
            `;
        }
        
        if (wonCount > 0) {
            summaryBox.className = 'draw-check-summary won';
            summaryBox.innerHTML = `
                <div class="dcs-header">
                    <span class="dcs-title">📊 KẾT QUẢ DÒ ${totalChecked.toLocaleString('vi-VN')} VÉ</span>
                    <span class="dcs-win-badge">🎉 Trúng ${wonCount.toLocaleString('vi-VN')} vé (+${formatCurrency(totalWon)})</span>
                </div>
                <div class="dcs-stats-grid">
                    <div class="dcs-stat">
                        <span class="dcs-stat-val">${totalChecked.toLocaleString('vi-VN')}</span>
                        <span class="dcs-stat-lbl">Vé đã dò</span>
                    </div>
                    <div class="dcs-stat won">
                        <span class="dcs-stat-val">${wonCount.toLocaleString('vi-VN')}</span>
                        <span class="dcs-stat-lbl">Vé trúng</span>
                    </div>
                    <div class="dcs-stat lost">
                        <span class="dcs-stat-val">${lostCount.toLocaleString('vi-VN')}</span>
                        <span class="dcs-stat-lbl">Không trúng</span>
                    </div>
                    <div class="dcs-stat prize">
                        <span class="dcs-stat-val">+${formatCurrency(totalWon)}</span>
                        <span class="dcs-stat-lbl">Tổng tiền thắng</span>
                    </div>
                </div>
                ${breakdownHtml}
            `;
        } else {
            summaryBox.className = 'draw-check-summary lost';
            summaryBox.innerHTML = `
                <div class="dcs-header">
                    <span class="dcs-title">📊 KẾT QUẢ DÒ ${totalChecked.toLocaleString('vi-VN')} VÉ</span>
                    <span class="dcs-win-badge" style="background:rgba(255,255,255,0.06); color:var(--text-muted); border-color:rgba(255,255,255,0.1);">0 vé trúng</span>
                </div>
                <div class="dcs-stats-grid">
                    <div class="dcs-stat">
                        <span class="dcs-stat-val">${totalChecked.toLocaleString('vi-VN')}</span>
                        <span class="dcs-stat-lbl">Vé đã dò</span>
                    </div>
                    <div class="dcs-stat lost">
                        <span class="dcs-stat-val">${lostCount.toLocaleString('vi-VN')}</span>
                        <span class="dcs-stat-lbl">Không trúng</span>
                    </div>
                    <div class="dcs-stat">
                        <span class="dcs-stat-val">0đ</span>
                        <span class="dcs-stat-lbl">Tiền thắng</span>
                    </div>
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted); text-align:center;">Toàn bộ ${totalChecked.toLocaleString('vi-VN')} vé đã được đối chiếu với bảng kết quả. Chúc bạn may mắn lần sau!</div>
            `;
        }
    } else if (summaryBox) {
        summaryBox.style.display = 'none';
    }
    
    tableContainer.innerHTML = buildResultsTable(draw.results);
}

function buildResultsTable(results) {
    const rows = PRIZE_STRUCTURE.map((prize, idx) => {
        const prizeNumbers = results[prize.key] || [];
        const numbers = prizeNumbers.map((num, numIdx) => {
            const delay = (idx * 0.08 + numIdx * 0.05).toFixed(2);
            const cls = prize.key === 'db' ? 'result-num special' : 'result-num';
            return `<span class="${cls}" style="animation-delay: ${delay}s">${num}</span>`;
        }).join(' ');
        
        return `
            <tr>
                <td class="result-label">${prize.name}</td>
                <td class="result-numbers">${numbers}</td>
            </tr>
        `;
    }).join('');
    
    return `<table class="results-table">${rows}</table>`;
}

// ============ PAST DRAWS ============
function renderPastDraws() {
    const container = document.getElementById('past-draws-container');
    const noMsg = document.getElementById('no-results-msg');
    
    if (state.draws.length === 0) {
        container.innerHTML = '';
        container.appendChild(noMsg || createNoResultsMsg());
        return;
    }
    
    container.innerHTML = state.draws.map(draw => `
        <div class="card past-draw-card">
            <div class="draw-info">
                <span class="draw-id">🏷️ ${draw.id}</span>
                <span>📍 ${draw.provinceName}</span>
                <span>📅 ${formatDate(new Date(draw.date))}</span>
            </div>
            ${buildResultsTable(draw.results)}
        </div>
    `).join('');
}

function createNoResultsMsg() {
    const div = document.createElement('div');
    div.className = 'card empty-state';
    div.innerHTML = `
        <div class="empty-icon">📭</div>
        <p>Chưa có kết quả nào. Hãy quay số ở tab <strong>"Quay Số"</strong>!</p>
    `;
    return div;
}

// ============ DIRECT NUMBER CHECKER WIDGET ============
function updateCheckerDrawOptions() {
    const select = document.getElementById('checker-draw-select');
    if (!select) return;

    if (state.draws.length === 0) {
        select.innerHTML = '<option value="">Chưa có kỳ quay nào</option>';
        return;
    }

    let options = '<option value="latest">⚡ Kỳ quay mới nhất (' + state.draws[0].id + ' - ' + state.draws[0].provinceName + ')</option>';
    state.draws.forEach((draw, idx) => {
        options += `<option value="${draw.id}">Kỳ ${draw.id} - ${draw.provinceName} (${formatDate(new Date(draw.date))})</option>`;
    });

    select.innerHTML = options;
}

function checkDirectNumber() {
    const input = document.getElementById('checker-number-input');
    const select = document.getElementById('checker-draw-select');
    const resultBox = document.getElementById('checker-result-box');
    
    const num = input.value.trim();
    if (num.length !== 6) {
        showToast('⚠️', 'Vui lòng nhập đủ 6 chữ số!', 'error');
        return;
    }

    if (state.draws.length === 0) {
        showToast('⚠️', 'Chưa có kỳ quay nào. Hãy qua tab "Quay Số" trước!', 'error');
        return;
    }

    const drawId = select.value;
    let targetDraw = state.draws[0];
    if (drawId && drawId !== 'latest') {
        targetDraw = state.draws.find(d => d.id === drawId) || state.draws[0];
    }

    const winResult = checkTicketAgainstResults(num, targetDraw.results);
    resultBox.style.display = 'block';

    if (winResult.totalWin > 0) {
        const prizeNames = winResult.prizes.map(p => `<strong>${p.name}</strong> (${formatCurrency(p.amount)})`).join(', ');
        resultBox.className = 'checker-result-box won';
        resultBox.innerHTML = `
            <div class="crb-icon">🎉</div>
            <div class="crb-body">
                <h4>CHÚC MỪNG! SỐ ${num} ĐÃ TRÚNG THƯỞNG!</h4>
                <p>Kỳ quay: <strong>${targetDraw.id} (${targetDraw.provinceName})</strong></p>
                <p>Các giải trúng: ${prizeNames}</p>
                <div class="crb-total">Tổng thưởng: +${formatCurrency(winResult.totalWin)}</div>
            </div>
        `;
    } else {
        resultBox.className = 'checker-result-box lost';
        resultBox.innerHTML = `
            <div class="crb-icon">❌</div>
            <div class="crb-body">
                <h4>SỐ ${num} KHÔNG TRÚNG GIẢI</h4>
                <p>Đối chiếu với kỳ quay <strong>${targetDraw.id} (${targetDraw.provinceName})</strong> ngày ${formatDate(new Date(targetDraw.date))}.</p>
                <p>Chúc bạn may mắn lần sau!</p>
            </div>
        `;
    }
}

// ============ TICKETS DISPLAY ============
let currentFilter = 'all';

function filterTickets(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTickets();
}

function getFilteredTickets() {
    if (currentFilter === 'all') return state.tickets;
    return state.tickets.filter(t => t.status === currentFilter);
}

function renderTickets() {
    const listCard = document.getElementById('tickets-list-card');
    const listBody = document.getElementById('tickets-list-body');
    const noMsg = document.getElementById('no-tickets-msg');
    const btnCheckAll = document.getElementById('btn-check-all');
    const footer = document.getElementById('tickets-list-footer');
    const actionsBar = document.getElementById('ticket-actions');
    
    if (state.tickets.length === 0) {
        listCard.style.display = 'none';
        noMsg.style.display = 'block';
        btnCheckAll.style.display = 'none';
        actionsBar.style.display = 'none';
        return;
    }
    
    listCard.style.display = 'block';
    noMsg.style.display = 'none';
    
    const hasPending = state.tickets.some(t => t.status === 'pending');
    btnCheckAll.style.display = hasPending ? 'block' : 'none';
    
    // Show delete buttons only if there are checked (won/lost) tickets
    const checkedCount = state.tickets.filter(t => t.status === 'won' || t.status === 'lost').length;
    actionsBar.style.display = checkedCount > 0 ? 'flex' : 'none';
    
    const filtered = getFilteredTickets();
    
    if (filtered.length === 0) {
        listBody.innerHTML = `
            <div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 0.85rem;">
                Không có vé nào trong danh mục này.
            </div>
        `;
        footer.style.display = 'none';
        return;
    }
    
    const MAX_RENDER = 50;
    const ticketsToRender = filtered.slice(0, MAX_RENDER);
    
    listBody.innerHTML = ticketsToRender.map((ticket, idx) => {
        let rowClass = '';
        let statusBadge = '';
        let prizeText = '—';
        let prizeClass = 'tr-col tr-prize';
        
        if (ticket.status === 'won') {
            rowClass = 'row-won';
            statusBadge = '<span class="status-badge badge-won">🎉 Trúng</span>';
            prizeText = '+' + formatCurrency(ticket.winnings);
            prizeClass += ' has-prize';
        } else if (ticket.status === 'lost') {
            rowClass = 'row-lost';
            statusBadge = '<span class="status-badge badge-lost">Trượt</span>';
        } else {
            rowClass = 'row-pending';
            statusBadge = '<span class="status-badge badge-pending">⏳ Chờ dò</span>';
        }
        
        return `
            <div class="ticket-row ${rowClass}">
                <span class="tr-col tr-num">${idx + 1}</span>
                <span class="tr-col tr-number">${ticket.number}</span>
                <span class="tr-col tr-province">${ticket.provinceName}</span>
                <span class="tr-col tr-date">${formatDate(new Date(ticket.date))}</span>
                <span class="tr-col tr-status">${statusBadge}</span>
                <span class="${prizeClass}">${prizeText}</span>
            </div>
        `;
    }).join('');
    
    // Footer showing count
    footer.style.display = 'block';
    
    let baseText = currentFilter === 'all' 
        ? `Tổng: ${filtered.length.toLocaleString('vi-VN')} vé (Lần mua mới nhất ⚡)` 
        : `Tổng: ${filtered.length.toLocaleString('vi-VN')} / ${state.tickets.length.toLocaleString('vi-VN')} vé`;
        
    const showingText = filtered.length > MAX_RENDER
        ? `Hiển thị ${MAX_RENDER} vé mẫu | ${baseText}`
        : `Hiển thị ${filtered.length.toLocaleString('vi-VN')} vé | ${baseText}`;
        
    document.getElementById('showing-count').textContent = showingText;
}

function deleteCheckedTickets(count) {
    // Delete the oldest N tickets that have been checked (won or lost)
    const checkedTickets = state.tickets.filter(t => t.status === 'won' || t.status === 'lost');
    
    if (checkedTickets.length === 0) {
        showToast('ℹ️', 'Không có vé đã dò nào để xóa!', 'info');
        return;
    }
    
    const toDelete = Math.min(count, checkedTickets.length);
    // Get IDs of the oldest `toDelete` checked tickets
    const idsToDelete = new Set(
        checkedTickets.slice(-toDelete).map(t => t.id)
    );
    
    state.tickets = state.tickets.filter(t => !idsToDelete.has(t.id));
    saveState();
    renderTickets();
    updateStats();
    
    showToast('🗑️', `Đã xóa ${toDelete} vé đã dò!`, 'success');
}

function deleteAllCheckedTickets() {
    const checkedCount = state.tickets.filter(t => t.status === 'won' || t.status === 'lost').length;
    
    if (checkedCount === 0) {
        showToast('ℹ️', 'Không có vé đã dò nào để xóa!', 'info');
        return;
    }
    
    state.tickets = state.tickets.filter(t => t.status === 'pending');
    saveState();
    renderTickets();
    updateStats();
    
    showToast('🗑️', `Đã xóa tất cả ${checkedCount} vé đã dò!`, 'success');
}

function createNoTicketsMsg() {
    const div = document.createElement('div');
    div.className = 'card empty-state';
    div.innerHTML = `
        <div class="empty-icon">🎫</div>
        <p>Bạn chưa mua vé nào. Hãy qua tab <strong>"Mua Vé"</strong> để bắt đầu!</p>
    `;
    return div;
}

function checkAllTickets() {
    const pendingTickets = state.tickets.filter(t => t.status === 'pending');
    if (pendingTickets.length === 0) {
        showToast('ℹ️', 'Không có vé nào cần dò!', 'info');
        return;
    }
    
    // Ensure all provinces are checked and execute draw immediately
    state.drawProvince = 'all';
    switchTab('draw');
    startDraw(true);
}

// ============ BALANCE & DEPOSIT ============
function updateBalanceDisplay() {
    const display = document.getElementById('balance-display');
    display.textContent = formatCurrency(state.balance);
    display.classList.add('updated');
    setTimeout(() => display.classList.remove('updated'), 600);
}

function openDepositModal() {
    document.getElementById('deposit-modal').classList.add('show');
}

function closeDepositModal(event) {
    if (event && event.target !== document.getElementById('deposit-modal')) return;
    document.getElementById('deposit-modal').classList.remove('show');
}

function deposit(amount) {
    state.balance += amount;
    saveState();
    updateBalanceDisplay();
    closeDepositModal();
    showToast('✅', `Đã nạp ${formatCurrency(amount)} thành công!`, 'success');
}

function depositCustom() {
    const input = document.getElementById('custom-amount');
    const amount = parseInt(input.value);
    
    if (!amount || amount < 10000) {
        showToast('⚠️', 'Số tiền tối thiểu là 10,000đ!', 'error');
        return;
    }
    
    deposit(amount);
    input.value = '';
}

// ============ STATS ============
function updateStats() {
    const totalCount = state.tickets.length;
    const pendingCount = state.tickets.filter(t => t.status === 'pending').length;
    const wonCount = state.tickets.filter(t => t.status === 'won').length;
    const lostCount = state.tickets.filter(t => t.status === 'lost').length;
    const checkedCount = wonCount + lostCount;

    // 1. Stats Bar
    const elTotal = document.getElementById('stat-total-tickets');
    const elPending = document.getElementById('stat-pending-tickets');
    const elChecked = document.getElementById('stat-checked-tickets');
    const elSpent = document.getElementById('stat-total-spent');
    const elWon = document.getElementById('stat-total-won');
    
    if (elTotal) elTotal.textContent = totalCount.toLocaleString('vi-VN');
    if (elPending) elPending.textContent = pendingCount.toLocaleString('vi-VN');
    if (elChecked) elChecked.textContent = checkedCount.toLocaleString('vi-VN');
    if (elSpent) elSpent.textContent = formatCurrency(state.totalSpent);
    if (elWon) elWon.textContent = formatCurrency(state.totalWon);
    
    // Profit / Loss
    const profit = state.totalWon - state.totalSpent;
    const profitEl = document.getElementById('stat-profit');
    const profitItem = document.getElementById('stat-profit-item');
    if (profitEl && profitItem) {
        if (profit >= 0) {
            profitEl.textContent = '+' + formatCurrency(profit);
            profitItem.className = 'stat-item stat-profit';
        } else {
            profitEl.textContent = '-' + formatCurrency(Math.abs(profit));
            profitItem.className = 'stat-item stat-loss';
        }
    }

    // 2. Navigation Tab Badges
    const badgeDraw = document.getElementById('badge-draw-pending');
    const badgeTickets = document.getElementById('badge-tickets-pending');
    if (badgeDraw) {
        if (pendingCount > 0) {
            badgeDraw.style.display = 'inline-block';
            badgeDraw.textContent = pendingCount > 999 ? pendingCount.toLocaleString('vi-VN') : pendingCount;
        } else {
            badgeDraw.style.display = 'none';
        }
    }
    if (badgeTickets) {
        if (pendingCount > 0) {
            badgeTickets.style.display = 'inline-block';
            badgeTickets.textContent = pendingCount > 999 ? pendingCount.toLocaleString('vi-VN') : pendingCount;
        } else {
            badgeTickets.style.display = 'none';
        }
    }

    // 3. Prominent Status Banner
    const banner = document.getElementById('ticket-status-banner');
    if (banner) {
        if (totalCount === 0) {
            banner.className = 'ticket-status-banner status-empty-alert';
            banner.innerHTML = `<span class="banner-icon">🎫</span> <span>Bạn chưa có vé nào. Hãy vào tab <strong>"Mua Vé"</strong> để mua vé số mới!</span>`;
        } else if (pendingCount > 0) {
            banner.className = 'ticket-status-banner status-pending-alert';
            banner.innerHTML = `<span class="banner-icon">⏳</span> <span>Lần mua mới nhất: <strong>${pendingCount.toLocaleString('vi-VN')}</strong> vé chưa dò <em>(Lịch sử cũ đã tự động làm mới để siêu mượt ⚡)</em></span>`;
        } else {
            banner.className = 'ticket-status-banner status-checked-alert';
            banner.innerHTML = `<span class="banner-icon">✅</span> <span>Đã dò xong lần mua này: <strong>${checkedCount.toLocaleString('vi-VN')}</strong> vé (Trúng: <strong>${wonCount.toLocaleString('vi-VN')}</strong> vé | Thắng: <strong>+${formatCurrency(state.totalWon)}</strong>)</span>`;
        }
    }

    // 4. Filter Tab Buttons with counts
    const btnAll = document.getElementById('filter-btn-all');
    const btnPending = document.getElementById('filter-btn-pending');
    const btnWon = document.getElementById('filter-btn-won');
    const btnLost = document.getElementById('filter-btn-lost');
    if (btnAll) btnAll.textContent = `Tất cả (${totalCount.toLocaleString('vi-VN')})`;
    if (btnPending) btnPending.textContent = `⏳ Chưa dò (${pendingCount.toLocaleString('vi-VN')})`;
    if (btnWon) btnWon.textContent = `🎉 Trúng (${wonCount.toLocaleString('vi-VN')})`;
    if (btnLost) btnLost.textContent = `❌ Không trúng (${lostCount.toLocaleString('vi-VN')})`;

    // 5. "Dò Tất Cả Vé" button text
    const btnCheckAll = document.getElementById('btn-check-all');
    if (btnCheckAll) {
        btnCheckAll.textContent = `🔍 Dò Tất Cả (${pendingCount.toLocaleString('vi-VN')} Vé Chưa Dò)`;
    }
}

// ============ WIN NOTIFICATION ============
function showWinNotification(winDetails, totalWin, totalChecked = 0, wonCount = 0, prizeBreakdown = {}) {
    const notification = document.getElementById('win-notification');
    const message = document.getElementById('win-message');
    const amount = document.getElementById('win-amount');
    
    let msgHtml = '';
    const breakdownKeys = Object.keys(prizeBreakdown);
    
    if (breakdownKeys.length > 0) {
        msgHtml += `<div class="win-summary-badge">🎯 Đã dò đúng đủ <strong>${totalChecked.toLocaleString('vi-VN')}</strong> vé — Trúng <strong>${wonCount.toLocaleString('vi-VN')}</strong> vé!</div>`;
        msgHtml += `<div class="win-breakdown-list">`;
        breakdownKeys.forEach(pName => {
            const item = prizeBreakdown[pName];
            msgHtml += `
                <div class="win-breakdown-item">
                    <span class="wbi-name">🏆 ${pName}</span>
                    <span class="wbi-count">x${item.count.toLocaleString('vi-VN')} vé</span>
                    <span class="wbi-total">+${formatCurrency(item.total)}</span>
                </div>
            `;
        });
        msgHtml += `</div>`;
    } else if (winDetails.length <= 3) {
        msgHtml = winDetails.map(d => {
            const prizeNames = d.prizes.map(p => p.name).join(', ');
            return `Vé <b>${d.number}</b> trúng ${prizeNames}`;
        }).join('<br>');
    } else {
        msgHtml = `🎉 Bạn trúng tổng cộng <strong>${wonCount.toLocaleString('vi-VN')}</strong> vé!`;
    }
    
    message.innerHTML = msgHtml;
    amount.textContent = `+${formatCurrency(totalWin)}`;
    notification.style.display = 'flex';
}

function closeWinNotification() {
    document.getElementById('win-notification').style.display = 'none';
}

// ============ CONFETTI ============
function launchConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#ffd700', '#e63946', '#6366f1', '#2ecc71', '#ff6b6b', '#ff9f43', '#a55eea', '#f368e0'];
    
    for (let i = 0; i < 100; i++) {
        const piece = document.createElement('div');
        piece.classList.add('confetti-piece');
        
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const rotation = Math.random() * 360;
        const duration = Math.random() * 2 + 2;
        const delay = Math.random() * 1;
        const size = Math.random() * 8 + 6;
        const shapes = ['50%', '0%', '3px'];
        const borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
        
        piece.style.cssText = `
            left: ${left}%;
            width: ${size}px;
            height: ${size * 0.6}px;
            background: ${color};
            border-radius: ${borderRadius};
            transform: rotate(${rotation}deg);
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
        `;
        
        container.appendChild(piece);
    }
    
    // Clean up after animation
    setTimeout(() => {
        container.innerHTML = '';
    }, 4000);
}

// ============ TOAST NOTIFICATIONS ============
function showToast(icon, message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Close deposit modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDepositModal();
        closeWinNotification();
    }
});
