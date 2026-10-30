/**
 * Sri Amrutha Jewellers Catalogue & Pricing Application
 * Integrated with Firebase Realtime Database & Cloudinary
 */

const DEFAULT_CIPHER = {
    "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
    "6": "F", "7": "G", "8": "H", "9": "I", "0": "0"
};

const DEFAULT_FIREBASE_URL = "https://saj-cat1-default-rtdb.asia-southeast1.firebasedatabase.app";
const DEFAULT_WHATSAPP_NUMBER = "919848728844";
const DEFAULT_CLOUDINARY_NAME = "hgcqngwq";
const DEFAULT_CLOUDINARY_PRESET = "ml_default";

// Auto-migrate legacy localStorage defaults
if (localStorage.getItem('aj_firebase_url') === "https://ajcat5-default-rtdb.asia-southeast1.firebasedatabase.app" ||
    localStorage.getItem('aj_firebase_url') === "https://ajcat6-ed24d-default-rtdb.asia-southeast1.firebasedatabase.app") {
    localStorage.setItem('aj_firebase_url', DEFAULT_FIREBASE_URL);
}
if (localStorage.getItem('aj_cloudinary_name') === "agc6iqec" ||
    localStorage.getItem('aj_cloudinary_name') === "wzuhkcid" ||
    localStorage.getItem('aj_cloudinary_name') === "do2kiuqp4") {
    localStorage.setItem('aj_cloudinary_name', DEFAULT_CLOUDINARY_NAME);
}
if (!localStorage.getItem('aj_cloudinary_preset') || localStorage.getItem('aj_cloudinary_preset') === "ajcat5") {
    localStorage.setItem('aj_cloudinary_preset', DEFAULT_CLOUDINARY_PRESET);
}
if (!localStorage.getItem('aj_whatsapp_number') ||
    localStorage.getItem('aj_whatsapp_number') === "919492443916" ||
    localStorage.getItem('aj_whatsapp_number') === "9492443916") {
    localStorage.setItem('aj_whatsapp_number', DEFAULT_WHATSAPP_NUMBER);
}

const DEFAULT_RATES = [
    { id: 'gold_22k', name: 'Gold 22k', rate: 14700.0, unit: '₹/g', color: '#b45309', display_order: 1 },
    { id: 'gold_18k', name: 'Gold 18k', rate: 12100.0, unit: '₹/g', color: '#d97706', display_order: 2 },
    { id: 'silver', name: 'Silver', rate: 253.0, unit: '₹/g', color: '#475569', display_order: 3 },
    { id: 'sterling_925', name: 'Sterling (92.5)', rate: 1500.0, unit: '₹/g', color: '#7c3aed', display_order: 4 },
    { id: 'gold_coating', name: 'Gold Coating', rate: 1200.0, unit: '₹/g', color: '#ea580c', display_order: 5 }
];

const DEFAULT_CATEGORIES = [];
const DEFAULT_PRODUCTS = [];

const DEFAULT_ESTIMATION_PIN = "5473";

const state = {
    categories: [],
    products: [],
    rates: [...DEFAULT_RATES],
    cipher: { ...DEFAULT_CIPHER },
    firebaseUrl: localStorage.getItem('aj_firebase_url') || DEFAULT_FIREBASE_URL,
    cloudinaryName: localStorage.getItem('aj_cloudinary_name') || DEFAULT_CLOUDINARY_NAME,
    cloudinaryPreset: localStorage.getItem('aj_cloudinary_preset') || DEFAULT_CLOUDINARY_PRESET,
    cloudinaryKey: localStorage.getItem('aj_cloudinary_key') || '',
    whatsappNumber: localStorage.getItem('aj_whatsapp_number') || DEFAULT_WHATSAPP_NUMBER,
    estimationPin: localStorage.getItem('aj_estimation_pin') || DEFAULT_ESTIMATION_PIN,
    activeCategory: null,
    currentView: 'home',
    authToken: null, // Require login every time
    searchQuery: '',
    editingProduct: null
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    setupRouting();
    lucide.createIcons();
});

async function loadInitialData() {
    try {
        // Load settings from local backend if available
        const settingsRes = await fetch('/api/settings').then(r => r.json()).catch(() => ({ success: false }));
        if (settingsRes.success && settingsRes.settings) {
            if (settingsRes.settings.cipher) {
                try { state.cipher = JSON.parse(settingsRes.settings.cipher); } catch (e) {}
            }
            if (settingsRes.settings.firebase_url) state.firebaseUrl = settingsRes.settings.firebase_url;
            if (settingsRes.settings.cloudinary_name) state.cloudinaryName = settingsRes.settings.cloudinary_name;
            if (settingsRes.settings.cloudinary_preset) state.cloudinaryPreset = settingsRes.settings.cloudinary_preset;
            if (settingsRes.settings.whatsapp_number) state.whatsappNumber = settingsRes.settings.whatsapp_number;
            if (settingsRes.settings.estimation_pin) state.estimationPin = settingsRes.settings.estimation_pin;
        }

        // Sync strictly and completely from connected Firebase Realtime Database
        if (state.firebaseUrl) {
            await trySyncFromFirebase();
        } else {
            // Local fallback only if Firebase URL is not configured
            const [ratesRes, catsRes, prodsRes] = await Promise.all([
                fetch('/api/rates').then(r => r.json()).catch(() => ({ success: false })),
                fetch('/api/categories').then(r => r.json()).catch(() => ({ success: false })),
                fetch('/api/products').then(r => r.json()).catch(() => ({ success: false }))
            ]);

            if (ratesRes.success && ratesRes.rates && ratesRes.rates.length > 0) state.rates = ratesRes.rates;
            if (catsRes.success && catsRes.categories) state.categories = catsRes.categories;
            if (prodsRes.success && prodsRes.products) state.products = prodsRes.products;
        }

        // Ensure default rates exist if rates are missing
        if (!state.rates || state.rates.length === 0) state.rates = [...DEFAULT_RATES];

        // Dynamically recalculate all product prices with current rates
        recalculateAllProductsInState();

        renderAll();
    } catch (err) {
        console.error("Failed to load data:", err);
    }
}

async function trySyncFromFirebase() {
    if (!state.firebaseUrl) return;
    const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
    try {
        const [fbRates, fbCats, fbProds, fbSettings] = await Promise.all([
            fetch(`${cleanUrl}/rates.json`).then(r => r.json()).catch(() => null),
            fetch(`${cleanUrl}/categories.json`).then(r => r.json()).catch(() => null),
            fetch(`${cleanUrl}/products.json`).then(r => r.json()).catch(() => null),
            fetch(`${cleanUrl}/settings.json`).then(r => r.json()).catch(() => null)
        ]);

        // PRODUCTS: Strictly and completely from Firebase
        if (fbProds && typeof fbProds === 'object') {
            state.products = Array.isArray(fbProds)
                ? fbProds.filter(Boolean)
                : Object.entries(fbProds).map(([key, val]) => ({ ...val, id: val.id || key }));
        } else {
            state.products = [];
        }

        // CATEGORIES: Strictly from Firebase, or derived from Firebase products
        if (fbCats && typeof fbCats === 'object') {
            state.categories = Array.isArray(fbCats)
                ? fbCats.filter(Boolean)
                : Object.entries(fbCats).map(([key, val]) => ({ ...val, id: val.id || key }));
        } else {
            state.categories = [];
        }

        // If categories are empty in Firebase, derive them from Firebase products
        if (state.categories.length === 0 && state.products.length > 0) {
            const catMap = new Map();
            state.products.forEach(p => {
                const catId = p.category_id || ('cat_' + (p.category_name || 'general').toLowerCase().replace(/\s+/g, '_'));
                const catName = p.category_name || 'General';
                if (!catMap.has(catId)) {
                    catMap.set(catId, {
                        id: catId,
                        name: catName,
                        icon_letter: catName[0] ? catName[0].toUpperCase() : 'G'
                    });
                }
            });
            state.categories = Array.from(catMap.values());
        }

        // RATES: From Firebase if present
        if (fbRates && typeof fbRates === 'object') {
            const list = Array.isArray(fbRates)
                ? fbRates.filter(Boolean)
                : Object.entries(fbRates).map(([key, val]) => ({ ...val, id: val.id || key }));
            if (list.length > 0) state.rates = list;
        }

        // SETTINGS: From Firebase if present
        if (fbSettings && typeof fbSettings === 'object') {
            if (fbSettings.cipher) {
                try { state.cipher = typeof fbSettings.cipher === 'string' ? JSON.parse(fbSettings.cipher) : fbSettings.cipher; } catch(e){}
            }
            if (fbSettings.whatsapp_number) state.whatsappNumber = fbSettings.whatsapp_number;
            if (fbSettings.cloudinary_name) state.cloudinaryName = fbSettings.cloudinary_name;
            if (fbSettings.cloudinary_preset) state.cloudinaryPreset = fbSettings.cloudinary_preset;
        }
    } catch (e) {
        console.warn("Firebase check:", e);
    }
}

function recalculateAllProductsInState() {
    if (!state.products || state.products.length === 0) return;
    state.products = state.products.map(p => {
        const pricing = calculatePricing({
            metalType: p.metal_type,
            carats: p.carats,
            itemWt: p.item_wt,
            netWt: p.net_wt,
            stoneCost: p.stone_cost,
            vaPercent: p.va_percent,
            mc: p.mc,
            manualMrp: p.manual_mrp
        });
        return {
            ...p,
            mrp: pricing.mrp,
            price_code: pricing.priceCode,
            breakdown_code: pricing.breakdownCode
        };
    });
}

async function syncWithFirebaseNow() {
    const cleanUrl = (document.getElementById('cloud-firebase-url')?.value || state.firebaseUrl).replace(/\/+$/, '');
    const statusEl = document.getElementById('firebase-sync-status');
    if (statusEl) statusEl.innerHTML = `<span class="text-amber-600 font-semibold">Syncing...</span>`;

    recalculateAllProductsInState();

    try {
        const ratesObj = {};
        state.rates.forEach(r => ratesObj[r.id] = r);
        const catsObj = {};
        state.categories.forEach(c => catsObj[c.id] = c);
        const prodsObj = {};
        state.products.forEach(p => prodsObj[p.id] = p);

        await Promise.all([
            fetch(`${cleanUrl}/rates.json`, { method: 'PUT', body: JSON.stringify(ratesObj) }),
            fetch(`${cleanUrl}/categories.json`, { method: 'PUT', body: JSON.stringify(catsObj) }),
            fetch(`${cleanUrl}/products.json`, { method: 'PUT', body: JSON.stringify(prodsObj) }),
            fetch(`${cleanUrl}/settings.json`, { method: 'PUT', body: JSON.stringify({
                cipher: JSON.stringify(state.cipher),
                cloudinary_name: state.cloudinaryName,
                cloudinary_preset: state.cloudinaryPreset,
                whatsapp_number: state.whatsappNumber
            }) })
        ]);

        if (statusEl) statusEl.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 inline"></i> <span class="text-emerald-700 font-bold">Synced Successfully!</span>`;
        lucide.createIcons();
    } catch (err) {
        if (statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-semibold">Sync failed</span>`;
    }
}

function renderAll() {
    renderCollectionsGrid();
    renderAdminRates();
    renderAdminCategories();
    renderAdminProductsTable();
    populateCategoryDropdowns();
    renderCipherInputs();
    populateCloudInputs();
    if (state.currentView === 'category') {
        renderCategoryShowcase();
    }
    lucide.createIcons();
}

function populateCloudInputs() {
    if (document.getElementById('cloud-firebase-url')) document.getElementById('cloud-firebase-url').value = state.firebaseUrl;
    if (document.getElementById('cloud-cloudinary-name')) document.getElementById('cloud-cloudinary-name').value = state.cloudinaryName;
    if (document.getElementById('cloud-cloudinary-preset')) document.getElementById('cloud-cloudinary-preset').value = state.cloudinaryPreset;
    if (document.getElementById('cloud-cloudinary-key')) document.getElementById('cloud-cloudinary-key').value = state.cloudinaryKey;
    if (document.getElementById('cloud-whatsapp-number')) document.getElementById('cloud-whatsapp-number').value = state.whatsappNumber;
    if (document.getElementById('cloud-estimation-pin')) document.getElementById('cloud-estimation-pin').value = state.estimationPin || DEFAULT_ESTIMATION_PIN;
}

// ==========================================
// IMAGE OPTIMIZATION HELPER (Cloudinary f_auto,q_auto)
// ==========================================
function getOptimizedImageUrl(url) {
    if (!url) return '';
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        if (!url.includes('/upload/f_auto,q_auto/')) {
            return url.replace('/upload/', '/upload/f_auto,q_auto/');
        }
    }
    return url;
}

// ==========================================
// NAVIGATION & VIEW SWITCHING WITH DEEP LINKING
// ==========================================
function promptAdminLogin() {
    // Every time admin is accessed, ask for ID and password
    state.authToken = null;
    localStorage.removeItem('aj_admin_token');
    
    const userInp = document.getElementById('login-username');
    const passInp = document.getElementById('login-password');
    if (userInp) userInp.value = '';
    if (passInp) passInp.value = '';
    const err = document.getElementById('login-error');
    if (err) err.classList.add('hidden');

    navigate('admin_login');
}

function navigate(view, categoryId = null) {
    state.currentView = view;
    
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-category-products').classList.add('hidden');
    document.getElementById('view-admin-login').classList.add('hidden');
    document.getElementById('view-admin-dashboard').classList.add('hidden');

    const publicHeader = document.getElementById('public-header');
    const adminHeader = document.getElementById('admin-header');

    if (view === 'admin_dashboard' && state.authToken) {
        publicHeader.classList.add('hidden');
        adminHeader.classList.remove('hidden');
        document.getElementById('view-admin-dashboard').classList.remove('hidden');
        renderAdminDashboard();
        try { history.replaceState(null, '', '/admin'); } catch(e){}
    } else if (view === 'admin_login' || view === 'admin') {
        publicHeader.classList.add('hidden');
        adminHeader.classList.add('hidden');
        document.getElementById('view-admin-login').classList.remove('hidden');
        try { history.replaceState(null, '', '/admin'); } catch(e){}
    } else if (view === 'category') {
        publicHeader.classList.add('hidden');
        adminHeader.classList.add('hidden');
        document.getElementById('view-category-products').classList.remove('hidden');
        if (categoryId) {
            state.activeCategory = state.categories.find(c => c.id === categoryId) || null;
            try { history.replaceState(null, '', `?category=${categoryId}`); } catch(e){}
        }
        renderCategoryShowcase();
    } else {
        publicHeader.classList.remove('hidden'); // Show public header with Admin button on first page
        adminHeader.classList.add('hidden');
        document.getElementById('view-home').classList.remove('hidden');
        try { history.replaceState(null, '', window.location.pathname); } catch(e){}
        renderCollectionsGrid();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    lucide.createIcons();
}

function setupRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    const path = window.location.pathname;

    if (catParam) {
        navigate('category', catParam);
    } else if (path === '/admin') {
        promptAdminLogin();
    } else if (path.startsWith('/category/')) {
        const catId = path.replace('/category/', '');
        navigate('category', catId);
    } else {
        navigate('home');
    }
}

// ==========================================
// SHARE INDIVIDUAL COLLECTION FEATURE
// ==========================================
let currentShareData = { title: '', url: '', message: '' };

function shareActiveCollection() {
    if (!state.activeCategory) return;
    shareCollectionById(state.activeCategory.id);
}

function shareCollectionById(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;

    const shareUrl = `${window.location.origin}${window.location.pathname}?category=${cat.id}`;
    const shareTitle = `${cat.name} - Sri Amrutha Jewellers`;
    const shareMessage = `✨ *Sri Amrutha Jewellers - ${cat.name} Collection*\n\nExplore our latest handcrafted jewellery designs here:\n🔗 ${shareUrl}`;

    currentShareData = {
        title: shareTitle,
        url: shareUrl,
        message: shareMessage,
        catName: cat.name
    };

    // Try native Web Share API on mobile devices first
    if (navigator.share) {
        navigator.share({
            title: shareTitle,
            text: `Explore our exclusive ${cat.name} collection at Sri Amrutha Jewellers:`,
            url: shareUrl
        }).catch((err) => {
            // If user cancels or fallback needed, open modal
            if (err.name !== 'AbortError') {
                openShareModal(currentShareData);
            }
        });
    } else {
        openShareModal(currentShareData);
    }
}

function openShareModal(data) {
    document.getElementById('share-modal-subtitle').textContent = `${data.catName} Collection`;
    document.getElementById('share-direct-url').value = data.url;
    
    const copyText = document.getElementById('share-copy-btn-text');
    if (copyText) copyText.textContent = "Copy";

    openModal('share-collection-modal');
}

function executeShareWhatsApp() {
    if (!currentShareData.url) return;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(currentShareData.message)}`;
    window.open(waUrl, '_blank');
}

function copyShareLink() {
    const urlInput = document.getElementById('share-direct-url');
    if (!urlInput) return;

    urlInput.select();
    urlInput.setSelectionRange(0, 99999);

    navigator.clipboard.writeText(urlInput.value).then(() => {
        const copyText = document.getElementById('share-copy-btn-text');
        if (copyText) {
            copyText.textContent = "Copied!";
            setTimeout(() => { copyText.textContent = "Copy"; }, 2000);
        }
    }).catch(() => {
        document.execCommand('copy');
        const copyText = document.getElementById('share-copy-btn-text');
        if (copyText) {
            copyText.textContent = "Copied!";
            setTimeout(() => { copyText.textContent = "Copy"; }, 2000);
        }
    });
}

// ==========================================
// CODED PRICE & PRICING FORMULA ENGINE
// ==========================================
function encodeCodeword(val) {
    if (val === null || val === undefined || isNaN(val)) return "";
    const intVal = Math.round(Number(val));
    const str = String(intVal);
    return str.split('').map(ch => state.cipher[ch] || ch).join('');
}

function getRateForMetal(metalType, carats) {
    const metal = (metalType || 'Gold').toLowerCase();
    const caratStr = (carats || '22k').toLowerCase();

    if (metal === 'gold') {
        if (caratStr.includes('18')) {
            const r = state.rates.find(x => x.id === 'gold_18k');
            return r ? r.rate : 12100;
        } else if (caratStr.includes('coating') || caratStr.includes('1 gram')) {
            const r = state.rates.find(x => x.id === 'gold_coating');
            return r ? r.rate : 1200;
        } else {
            const r = state.rates.find(x => x.id === 'gold_22k');
            return r ? r.rate : 14700;
        }
    } else if (metal === 'silver') {
        if (caratStr.includes('92.5') || caratStr.includes('sterling')) {
            const r = state.rates.find(x => x.id === 'sterling_925');
            return r ? r.rate : 1500;
        } else {
            const r = state.rates.find(x => x.id === 'silver');
            return r ? r.rate : 253;
        }
    } else if (metal.includes('coating') || metal.includes('1 gram')) {
        const r = state.rates.find(x => x.id === 'gold_coating');
        return r ? r.rate : 1200;
    }
    return 14700;
}

function calculatePricing({ metalType, carats, itemWt, netWt, stoneCost, vaPercent, mc, manualMrp }) {
    const metal = (metalType || 'Gold').toLowerCase();
    const item = parseFloat(itemWt) || 0;
    let net = parseFloat(netWt) || 0;
    if (net === 0 && item > 0 && metal === 'gold') {
        net = item;
    }
    const stone = parseFloat(stoneCost) || 0;
    const va = parseFloat(vaPercent) || 0;
    const makingCharges = parseFloat(mc) || 0;
    const directMrp = parseFloat(manualMrp) || 0;

    const rate = getRateForMetal(metalType, carats);
    let mrp = 0;
    let formulaText = "";

    if (metal === 'gold') {
        const goldWtWithVa = net * (1 + (va / 100));
        const goldValue = goldWtWithVa * rate;
        mrp = Math.round(goldValue + makingCharges + stone);
        formulaText = `Formula: ((${net}g + ${va}%) × ₹${rate}) + ₹${makingCharges}${stone > 0 ? ' + ₹' + stone : ''} = ₹${mrp.toLocaleString('en-IN')}`;
    } else if (metal === 'silver') {
        const silverWtWithVa = item * (1 + (va / 100));
        const silverValue = silverWtWithVa * rate;
        mrp = Math.round(silverValue + makingCharges);
        formulaText = `Formula: ((${item}g + ${va}%) × ₹${rate}) + ₹${makingCharges} = ₹${mrp.toLocaleString('en-IN')}`;
    } else if (metal === 'diamond') {
        mrp = Math.round(directMrp);
        formulaText = `Diamond Item Wt: ${item}g | Direct MRP = ₹${mrp.toLocaleString('en-IN')}`;
    } else {
        const coatedWt = item * (1 + (va / 100));
        mrp = Math.round((coatedWt * rate) + makingCharges + stone);
        formulaText = `Formula: ((${item}g + ${va}%) × ₹${rate}) + ₹${makingCharges} = ₹${mrp.toLocaleString('en-IN')}`;
    }

    const priceCode = encodeCodeword(mrp);
    const vaCode = encodeCodeword(va);
    const mcCode = encodeCodeword(makingCharges);
    const breakdownCode = (vaCode || mcCode) ? `${vaCode} | ${mcCode}` : '';

    return { mrp, priceCode, breakdownCode, rate, formulaText };
}

// ==========================================
// PUBLIC VIEW: COLLECTIONS GRID (Screenshot 1)
// ==========================================
function renderCollectionsGrid() {
    const grid = document.getElementById('collections-grid');
    if (!grid) return;

    if (!state.categories || state.categories.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <div class="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="package-open" class="w-8 h-8"></i>
                </div>
                <h3 class="text-base font-bold text-slate-700">No collections available</h3>
                <p class="text-xs text-slate-500 mt-1">No collections or products found in the connected Firebase database.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    grid.innerHTML = state.categories.map(cat => {
        const count = state.products.filter(p => p.category_id === cat.id).length;
        const letter = cat.icon_letter || (cat.name ? cat.name[0].toUpperCase() : 'C');
        
        return `
            <div onclick="selectCategory('${cat.id}')" class="category-card relative bg-white p-7 rounded-2xl cursor-pointer flex flex-col items-center justify-center text-center group min-h-[190px]">
                <button onclick="event.stopPropagation(); shareCollectionById('${cat.id}')" class="absolute top-3.5 right-3.5 p-2 text-slate-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition shadow-2xs" title="Share ${cat.name} Collection">
                    <i data-lucide="share-2" class="w-4 h-4"></i>
                </button>
                <div class="w-16 h-16 rounded-full bg-blue-100/80 group-hover:bg-brand-600 text-brand-600 group-hover:text-white flex items-center justify-center text-2xl font-black transition-colors mb-4 shadow-sm">
                    ${letter}
                </div>
                <h3 class="text-lg font-bold text-slate-800 group-hover:text-brand-700 transition-colors">
                    ${cat.name}
                </h3>
                <span class="text-sm text-slate-400 mt-1 font-semibold">${count} items</span>
            </div>
        `;
    }).join('');
}

function selectCategory(catId) {
    navigate('category', catId);
}

// ==========================================
// PUBLIC VIEW: VERTICAL 1-BY-1 PRODUCTS SHOWCASE (Matches Screenshot 2 Exactly)
// ==========================================
function renderCategoryShowcase() {
    if (!state.activeCategory) return;
    
    // Recalculate products to ensure active rates apply
    recalculateAllProductsInState();

    document.getElementById('category-showcase-title').textContent = state.activeCategory.name;
    const catProducts = state.products.filter(p => p.category_id === state.activeCategory.id);
    document.getElementById('category-showcase-subtitle').textContent = `${catProducts.length} Handcrafted Designs`;

    const container = document.getElementById('single-product-showcase-container');
    const emptyState = document.getElementById('cat-empty-state');
    const searchVal = (document.getElementById('cat-search-input')?.value || '').trim().toLowerCase();

    const filtered = catProducts.filter(p => {
        if (!searchVal) return true;
        return p.code.toLowerCase().includes(searchVal) || (p.notes && p.notes.toLowerCase().includes(searchVal));
    });

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Render products 1 by 1 vertically stacked with edge-to-edge images matching screenshot
    container.innerHTML = `
        <div class="space-y-10 max-w-md mx-auto">
            ${filtered.map(p => {
                const rawImg = p.image_url || '/uploads/aj0001.png';
                const img = getOptimizedImageUrl(rawImg);
                
                let displayMetal = p.metal_type || 'Gold';
                if (p.metal_type === 'Gold') {
                    displayMetal = p.carats || '22k';
                } else if (p.metal_type === 'Silver') {
                    displayMetal = p.carats && p.carats !== 'Silver' ? p.carats : 'Silver';
                } else if (p.carats) {
                    displayMetal = p.carats;
                }

                return `
                    <div class="product-card bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 flex flex-col">
                        <!-- Edge-to-Edge Image with 0 margin/padding fully fitting dimensions -->
                        <div class="relative w-full aspect-square sm:aspect-[4/5] bg-slate-950 overflow-hidden cursor-pointer group flex items-center justify-center" onclick="openFullscreenProduct('${p.code}')" title="Click for Full Screen">
                            <img src="${img}" alt="${p.code}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300">
                            <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <i data-lucide="maximize" class="w-7 h-7"></i>
                            </div>
                        </div>

                        <!-- Details Section Flush Below Image -->
                        <div class="p-4 bg-white space-y-3">
                            <!-- Top Line: Code with More Button (left) & Metal Badge (right) -->
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="text-base font-bold text-brand-600 font-mono tracking-tight">${p.code}</span>
                                    <button type="button" onclick="event.stopPropagation(); handleMoreClick('${p.code}')" class="px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200 cursor-pointer shadow-2xs">More</button>
                                </div>
                                <span class="text-xs font-semibold text-brand-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded uppercase">${displayMetal}</span>
                            </div>

                            <!-- Weights (left) & Breakdown + Price Codeword (right) (NO duplicate, NO labels) -->
                            <div class="flex items-start justify-between pt-1">
                                <div class="space-y-0.5">
                                    <div class="text-sm font-bold text-slate-900">${p.item_wt ? p.item_wt + 'g' : ''}</div>
                                    <div class="text-xs font-semibold text-slate-500">${p.net_wt ? p.net_wt + 'g' : ''}</div>
                                </div>

                                <div class="text-right">
                                    <div class="text-sm font-bold text-slate-800 font-mono">${p.breakdown_code || ''}</div>
                                    <div class="text-lg font-black text-brand-600 font-mono tracking-wider">${p.price_code}</div>
                                </div>
                            </div>

                            <!-- WhatsApp Enquiry Button -->
                            <button onclick="sendWhatsAppEnquiry('${p.code}')" class="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-sm font-bold transition shadow-xs mt-1">
                                <i data-lucide="message-circle" class="w-4 h-4 text-emerald-600"></i>
                                <span>Enquire on WhatsApp</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    lucide.createIcons();
}

function filterCategoryProducts() {
    renderCategoryShowcase();
}

// ==========================================
// FULLSCREEN PRODUCT DETAILS MODAL
// ==========================================
function openFullscreenProduct(prodCode) {
    const p = state.products.find(x => x.code === prodCode);
    if (!p) return;

    const rawImg = p.image_url || '/uploads/aj0001.png';
    const img = getOptimizedImageUrl(rawImg);

    let displayMetal = p.metal_type || 'Gold';
    if (p.metal_type === 'Gold') {
        displayMetal = p.carats || '22k Gold';
    } else if (p.metal_type === 'Silver') {
        displayMetal = p.carats && p.carats !== 'Silver' ? `Silver ${p.carats}` : 'Silver';
    } else if (p.carats) {
        displayMetal = `${p.metal_type} ${p.carats}`;
    }

    document.getElementById('fs-product-code').textContent = p.code;
    document.getElementById('fs-product-metal').textContent = displayMetal;
    
    const fsMoreBtn = document.getElementById('fs-more-btn');
    if (fsMoreBtn) {
        fsMoreBtn.onclick = (e) => {
            e.stopPropagation();
            handleMoreClick(p.code);
        };
    }

    document.getElementById('lightbox-img').src = img;
    document.getElementById('fs-product-category').textContent = p.category_name || (state.activeCategory ? state.activeCategory.name : 'Catalogue');
    document.getElementById('fs-product-title').textContent = p.code;
    document.getElementById('fs-item-wt').textContent = p.item_wt ? `${p.item_wt}g` : '-';
    document.getElementById('fs-net-wt').textContent = p.net_wt ? `${p.net_wt}g` : '-';
    document.getElementById('fs-breakdown-code').textContent = p.breakdown_code || '';
    document.getElementById('fs-price-code').textContent = p.price_code || '';

    const waContainer = document.getElementById('fs-whatsapp-container');
    if (waContainer) {
        waContainer.innerHTML = `
            <button onclick="sendWhatsAppEnquiry('${p.code}')" class="flex items-center justify-center gap-2.5 w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-base font-bold transition shadow-sm">
                <i data-lucide="message-circle" class="w-5 h-5 text-white"></i>
                <span>Enquire on WhatsApp</span>
            </button>
        `;
    }

    openModal('lightbox-modal');
}

// ==========================================
// WHATSAPP ENQUIRY ACTION (To 9848728844)
// ==========================================
function sendWhatsAppEnquiry(prodCode) {
    const p = state.products.find(x => x.code === prodCode);
    if (!p) return;

    let whatsappNum = state.whatsappNumber || DEFAULT_WHATSAPP_NUMBER;
    whatsappNum = String(whatsappNum).replace(/[^0-9]/g, '');
    if (whatsappNum.length === 10) {
        whatsappNum = '91' + whatsappNum;
    }
    const catName = p.category_name || (state.activeCategory ? state.activeCategory.name : '');
    
    let msg = `*Sri Amrutha Jewellers - Product Enquiry*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏷️ *Product Code:* ${p.code}\n`;
    msg += `📂 *Category:* ${catName}\n`;
    msg += `✨ *Metal / Carats:* ${p.metal_type} ${p.carats || ''}\n`;
    if (p.item_wt) msg += `⚖️ *Gross Weight:* ${p.item_wt}g\n`;
    if (p.net_wt) msg += `⚖️ *Net Weight:* ${p.net_wt}g\n`;
    msg += `🔢 *Code:* ${p.price_code} ${p.breakdown_code ? `(${p.breakdown_code})` : ''}\n`;
    
    if (p.image_url) {
        const fullImg = p.image_url.startsWith('http') ? getOptimizedImageUrl(p.image_url) : (window.location.origin + p.image_url);
        msg += `🖼️ *Image:* ${fullImg}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Hello, I would like to enquire about this product. Please share availability and current details.`;

    const waUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
}

// ==========================================
// ADMIN LOGIN & LOGOUT (Screenshot 2)
// ==========================================
async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            state.authToken = data.token;
            errorDiv.classList.add('hidden');
            navigate('admin_dashboard');
        } else {
            errorDiv.textContent = data.error || "Invalid username or password";
            errorDiv.classList.remove('hidden');
        }
    } catch (err) {
        if (username === 'admin' && (password === 'admin' || password === 'admin123')) {
            state.authToken = 'admin_session_' + Date.now();
            errorDiv.classList.add('hidden');
            navigate('admin_dashboard');
        } else {
            errorDiv.textContent = "Invalid username or password";
            errorDiv.classList.remove('hidden');
        }
    }
}

function adminLogout() {
    state.authToken = null;
    localStorage.removeItem('aj_admin_token');
    navigate('home');
}

// ==========================================
// ADMIN DASHBOARD: RATES, CATEGORIES & PRODUCTS (Screenshot 3)
// ==========================================
function renderAdminDashboard() {
    renderAdminRates();
    renderAdminCategories();
    renderAdminProductsTable();
}

function renderAdminRates() {
    const row = document.getElementById('admin-rates-row');
    if (!row) return;

    row.innerHTML = state.rates.map(r => {
        let bgStyle = 'bg-amber-50/80 border-amber-200 text-amber-950';
        if (r.id === 'silver') bgStyle = 'bg-slate-50 border-slate-200 text-slate-800';
        if (r.id === 'sterling_925') bgStyle = 'bg-purple-50 border-purple-200 text-purple-950';
        if (r.id === 'gold_coating') bgStyle = 'bg-orange-50 border-orange-200 text-orange-950';

        return `
            <div class="p-4 rounded-xl border ${bgStyle} flex flex-col justify-between">
                <span class="text-xs font-bold uppercase tracking-wider opacity-75">${r.name}</span>
                <div class="text-2xl font-black mt-1 tracking-tight">₹${Number(r.rate).toLocaleString('en-IN')}</div>
            </div>
        `;
    }).join('');

    const inputsContainer = document.getElementById('rates-inputs-container');
    if (inputsContainer) {
        inputsContainer.innerHTML = state.rates.map(r => `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span class="text-sm font-bold text-slate-800">${r.name}</span>
                <div class="flex items-center gap-2 w-44">
                    <span class="text-sm text-slate-400 font-bold">₹</span>
                    <input type="number" step="1" name="rate_${r.id}" value="${r.rate}" required class="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg font-bold text-slate-900">
                </div>
            </div>
        `).join('');
    }
}

function renderAdminCategories() {
    const container = document.getElementById('admin-categories-pills');
    if (!container) return;

    container.innerHTML = state.categories.map(cat => `
        <div class="inline-flex items-center gap-2.5 px-4 py-2 bg-blue-50/80 text-brand-900 border border-brand-200 rounded-xl text-sm font-bold shadow-xs">
            <span>${cat.name}</span>
            <button onclick="handleDeleteCategory('${cat.id}')" class="text-slate-400 hover:text-rose-600 transition" title="Delete category">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();
}

function populateCategoryDropdowns() {
    const adminFilter = document.getElementById('admin-category-filter');
    const prodModalCat = document.getElementById('prod-category');

    if (adminFilter) {
        const currentVal = adminFilter.value;
        adminFilter.innerHTML = '<option value="">All Categories</option>' + 
            state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        adminFilter.value = currentVal;
    }

    if (prodModalCat) {
        prodModalCat.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

function renderAdminProductsTable() {
    const tbody = document.getElementById('admin-products-tbody');
    if (!tbody) return;

    recalculateAllProductsInState();

    const search = (document.getElementById('admin-product-search')?.value || '').trim().toLowerCase();
    const catFilter = document.getElementById('admin-category-filter')?.value || '';

    const filtered = state.products.filter(p => {
        const matchSearch = !search || p.code.toLowerCase().includes(search) || (p.notes && p.notes.toLowerCase().includes(search));
        const matchCat = !catFilter || p.category_id === catFilter;
        return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-10 text-sm text-slate-400 font-medium">No products found matching filters</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const rawImg = p.image_url || '/uploads/aj0001.png';
        const img = getOptimizedImageUrl(rawImg);
        return `
            <tr>
                <td>
                    <img src="${img}" alt="${p.code}" onclick="openFullscreenProduct('${p.code}')" class="w-12 h-12 rounded-xl object-cover bg-slate-100 border border-slate-200 cursor-pointer">
                </td>
                <td class="font-black text-brand-600 font-mono text-base">${p.code}</td>
                <td class="text-slate-700 text-sm font-semibold">${p.category_name}</td>
                <td class="text-slate-800 font-semibold">${p.metal_type}</td>
                <td class="text-slate-600 font-medium">${p.carats || '-'}</td>
                <td class="text-slate-800 font-bold">${p.item_wt ? p.item_wt + 'g' : '-'}</td>
                <td class="text-slate-800 font-bold">${p.net_wt ? p.net_wt + 'g' : '-'}</td>
                <td class="text-slate-600">${p.stone_cost ? '₹' + p.stone_cost : '-'}</td>
                <td class="text-slate-700 font-semibold">${p.va_percent ? p.va_percent + '%' : '-'}</td>
                <td class="text-slate-700 font-semibold">${p.mc ? '₹' + p.mc : '-'}</td>
                <td class="font-extrabold text-emerald-700 text-base">₹${Number(p.mrp).toLocaleString('en-IN')}</td>
                <td class="font-black text-brand-700 font-mono tracking-wider text-base">${p.price_code}</td>
                <td>
                    <div class="flex items-center gap-2">
                        <button onclick="handleMoreClick('${p.code}')" class="text-amber-600 hover:text-amber-800 p-1.5 hover:bg-amber-50 rounded-lg transition" title="Price Estimation">
                            <i data-lucide="calculator" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openEditProductModal('${p.id}')" class="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded-lg transition" title="Edit">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="handleDeleteProduct('${p.id}')" class="text-rose-500 hover:text-rose-700 p-1.5 hover:bg-rose-50 rounded-lg transition" title="Delete">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

function filterAdminProducts() {
    renderAdminProductsTable();
}

// ==========================================
// AUTOMATIC PRODUCT CODE GENERATION
// ==========================================
function generateNextProductCode() {
    const nums = state.products.map(p => {
        const match = p.code && p.code.match(/(?:SAJ|AJ)-(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    const next = maxNum + 1;
    return `SAJ-${String(next).padStart(4, '0')}`;
}

// ==========================================
// ADD / EDIT PRODUCT MODAL LOGIC
// ==========================================
function openAddProductModal() {
    state.editingProduct = null;
    document.getElementById('product-modal-title').textContent = "Add Product";
    document.getElementById('prod-id').value = "";
    
    // Automatically generate next product code
    document.getElementById('prod-code').value = generateNextProductCode();
    
    if (state.categories.length > 0) {
        document.getElementById('prod-category').value = state.categories[0].id;
    }
    document.getElementById('prod-metal').value = "Gold";
    document.getElementById('prod-carats').value = "22k";
    
    // Clear all weight and cost inputs to blank
    document.getElementById('prod-item-wt').value = "";
    document.getElementById('prod-net-wt').value = "";
    document.getElementById('prod-stone-cost').value = "";
    document.getElementById('prod-va').value = "";
    document.getElementById('prod-mc').value = "";
    document.getElementById('prod-manual-mrp').value = "";
    
    // Photo blank by default
    document.getElementById('prod-image-url').value = "";
    const fileInp = document.getElementById('prod-file-input');
    if (fileInp) fileInp.value = "";
    updateImagePreview("");
    setUploadingState(false, "Upload jewellery photo (PNG, JPG, WEBP)");

    onMetalTypeChange();
    recalculateModalLivePreview();
    openModal('product-modal');
}

function openEditProductModal(prodId) {
    const p = state.products.find(x => x.id === prodId);
    if (!p) return;

    state.editingProduct = p;
    document.getElementById('product-modal-title').textContent = `Edit Product (${p.code})`;
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-code').value = p.code;
    document.getElementById('prod-category').value = p.category_id;
    document.getElementById('prod-metal').value = p.metal_type;
    document.getElementById('prod-carats').value = p.carats || '22k';
    document.getElementById('prod-item-wt').value = p.item_wt || '';
    document.getElementById('prod-net-wt').value = p.net_wt || '';
    document.getElementById('prod-stone-cost').value = p.stone_cost || '';
    document.getElementById('prod-va').value = p.va_percent || '';
    document.getElementById('prod-mc').value = p.mc || '';
    document.getElementById('prod-manual-mrp').value = p.manual_mrp || '';
    document.getElementById('prod-image-url').value = p.image_url || '';
    const fileInp = document.getElementById('prod-file-input');
    if (fileInp) fileInp.value = "";
    setUploadingState(false, p.image_url ? "Existing photo loaded (select new file to replace)" : "Upload jewellery photo (PNG, JPG, WEBP)");

    updateImagePreview(p.image_url);
    onMetalTypeChange();
    recalculateModalLivePreview();
    openModal('product-modal');
}

function onMetalTypeChange() {
    const metal = document.getElementById('prod-metal').value;
    const caratsGroup = document.getElementById('carats-group');
    const netWtGroup = document.getElementById('net-wt-group');
    const stoneCostGroup = document.getElementById('stone-cost-group');
    const chargesGroup = document.getElementById('charges-group');
    const diamondGroup = document.getElementById('diamond-mrp-group');
    const caratsSelect = document.getElementById('prod-carats');

    if (metal === 'Gold') {
        caratsGroup.classList.remove('hidden');
        netWtGroup.classList.remove('hidden');
        stoneCostGroup.classList.remove('hidden');
        chargesGroup.classList.remove('hidden');
        diamondGroup.classList.add('hidden');
        caratsSelect.innerHTML = `
            <option value="22k">22k Gold</option>
            <option value="18k">18k Gold</option>
        `;
    } else if (metal === 'Silver') {
        caratsGroup.classList.remove('hidden');
        netWtGroup.classList.add('hidden');
        stoneCostGroup.classList.add('hidden');
        chargesGroup.classList.remove('hidden');
        diamondGroup.classList.add('hidden');
        caratsSelect.innerHTML = `
            <option value="Silver">Fine Silver (99.9)</option>
            <option value="Sterling 92.5">Sterling (92.5)</option>
        `;
    } else if (metal === 'Diamond') {
        caratsGroup.classList.add('hidden');
        netWtGroup.classList.add('hidden');
        stoneCostGroup.classList.add('hidden');
        chargesGroup.classList.add('hidden');
        diamondGroup.classList.remove('hidden');
    } else {
        caratsGroup.classList.add('hidden');
        netWtGroup.classList.remove('hidden');
        stoneCostGroup.classList.remove('hidden');
        chargesGroup.classList.remove('hidden');
        diamondGroup.classList.add('hidden');
    }

    recalculateModalLivePreview();
}

function onItemWtInput() {
    const metal = document.getElementById('prod-metal').value;
    const itemWt = document.getElementById('prod-item-wt').value;
    const netWtInput = document.getElementById('prod-net-wt');
    if (metal === 'Gold' && (!netWtInput.value || netWtInput.value === '0')) {
        netWtInput.value = itemWt;
    }
    recalculateModalLivePreview();
}

function recalculateModalLivePreview() {
    const metalType = document.getElementById('prod-metal').value;
    const carats = document.getElementById('prod-carats').value;
    const itemWt = document.getElementById('prod-item-wt').value;
    const netWt = document.getElementById('prod-net-wt').value;
    const stoneCost = document.getElementById('prod-stone-cost').value;
    const vaPercent = document.getElementById('prod-va').value;
    const mc = document.getElementById('prod-mc').value;
    const manualMrp = document.getElementById('prod-manual-mrp').value;

    const result = calculatePricing({ metalType, carats, itemWt, netWt, stoneCost, vaPercent, mc, manualMrp });

    document.getElementById('preview-rate-indicator').textContent = `Active Rate: ₹${result.rate}/g`;
    document.getElementById('preview-formula-breakdown').textContent = result.formulaText || "Enter product weights to preview calculation";
    document.getElementById('preview-mrp').textContent = result.mrp ? `₹${result.mrp.toLocaleString('en-IN')}` : '₹0';
    document.getElementById('preview-price-code').textContent = result.priceCode ? `${result.priceCode} ${result.breakdownCode ? `(${result.breakdownCode})` : ''}` : '---';
    document.getElementById('preview-breakdown-code').textContent = ''; // Removed [VA | MC]
}

function updateImagePreview(url) {
    const imgEl = document.getElementById('prod-img-preview');
    const placeholder = document.getElementById('prod-img-placeholder');
    if (url) {
        imgEl.src = url;
        imgEl.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

let currentUploadPromise = null;

function setUploadingState(isUploading, message = "") {
    const spinner = document.getElementById('prod-img-uploading-spinner');
    const statusEl = document.getElementById('prod-upload-status');
    const saveBtn = document.getElementById('btn-save-product');

    if (spinner) {
        if (isUploading) spinner.classList.remove('hidden');
        else spinner.classList.add('hidden');
    }
    if (statusEl && message) {
        statusEl.innerHTML = message;
    }
    if (saveBtn) {
        saveBtn.disabled = isUploading;
        if (isUploading) {
            saveBtn.classList.add('opacity-70', 'cursor-not-allowed');
            saveBtn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⏳</span> Uploading...`;
        } else {
            saveBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            saveBtn.innerHTML = `Save Product`;
        }
    }
}

async function handleImageFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Immediately show local preview so user sees what they selected instantly
    try {
        const localUrl = URL.createObjectURL(file);
        updateImagePreview(localUrl);
    } catch (err) {}

    setUploadingState(true, `<span class="text-amber-600 font-semibold flex items-center gap-1"><span class="animate-spin">⏳</span> Uploading photo...</span>`);

    currentUploadPromise = (async () => {
        let uploadedUrl = null;

        // 1. Try Cloudinary direct upload if configured
        if (state.cloudinaryName && state.cloudinaryPreset) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', state.cloudinaryPreset);
                if (state.cloudinaryKey) formData.append('api_key', state.cloudinaryKey);

                const uploadUrl = `https://api.cloudinary.com/v1_1/${state.cloudinaryName}/image/upload`;
                const clRes = await fetch(uploadUrl, { method: 'POST', body: formData });
                const clData = await clRes.json();

                if (clData.secure_url) {
                    uploadedUrl = clData.secure_url;
                } else if (clData.error) {
                    console.warn("Cloudinary upload rejected:", clData.error.message);
                }
            } catch (err) {
                console.warn("Cloudinary network error:", err);
            }
        }

        // 2. Fallback to local server upload if Cloudinary was not used or failed
        if (!uploadedUrl) {
            try {
                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: `product_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
                        image_data: base64Data
                    })
                });
                const data = await res.json();
                if (data.success && data.url) {
                    uploadedUrl = data.url;
                } else {
                    uploadedUrl = base64Data;
                }
            } catch (err) {
                console.warn("Local upload error, using base64 fallback:", err);
            }
        }

        if (uploadedUrl) {
            document.getElementById('prod-image-url').value = uploadedUrl;
            updateImagePreview(uploadedUrl);
            setUploadingState(false, `<span class="text-emerald-600 font-semibold flex items-center gap-1">✓ Photo ready for saving</span>`);
        } else {
            setUploadingState(false, `<span class="text-rose-500 font-semibold">Upload failed. Please try again.</span>`);
        }
    })();

    try {
        await currentUploadPromise;
    } finally {
        currentUploadPromise = null;
    }
}

async function handleSaveProduct(e) {
    e.preventDefault();

    // If an upload is currently in progress, wait for it to finish!
    if (currentUploadPromise) {
        setUploadingState(true, `<span class="text-amber-600 font-semibold">Finishing photo upload...</span>`);
        await currentUploadPromise;
    }

    // Double check: if user picked a file but prod-image-url is somehow still empty, convert file to data URL right here
    const fileInp = document.getElementById('prod-file-input');
    let image_url = document.getElementById('prod-image-url').value || '';
    if (!image_url && fileInp && fileInp.files && fileInp.files[0]) {
        try {
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(fileInp.files[0]);
            });
            image_url = base64Data;
            document.getElementById('prod-image-url').value = image_url;
        } catch (e) {}
    }
    
    const prodId = document.getElementById('prod-id').value || ('prod_' + Date.now().toString(36));
    const code = document.getElementById('prod-code').value.trim() || generateNextProductCode();
    const category_id = document.getElementById('prod-category').value;
    const metal_type = document.getElementById('prod-metal').value;
    const carats = document.getElementById('prod-carats').value;
    const item_wt = document.getElementById('prod-item-wt').value;
    const net_wt = document.getElementById('prod-net-wt').value;
    const stone_cost = document.getElementById('prod-stone-cost').value;
    const va_percent = document.getElementById('prod-va').value;
    const mc = document.getElementById('prod-mc').value;
    const manual_mrp = document.getElementById('prod-manual-mrp').value;

    const catObj = state.categories.find(c => c.id === category_id);
    const category_name = catObj ? catObj.name : 'General';

    const pricing = calculatePricing({ metalType: metal_type, carats, itemWt: item_wt, netWt: net_wt, stoneCost: stone_cost, vaPercent: va_percent, mc, manualMrp: manual_mrp });

    const payload = {
        id: prodId,
        code, category_id, category_name, metal_type, carats,
        item_wt: parseFloat(item_wt) || 0,
        net_wt: parseFloat(net_wt) || 0,
        stone_cost: parseFloat(stone_cost) || 0,
        va_percent: parseFloat(va_percent) || 0,
        mc: parseFloat(mc) || 0,
        manual_mrp: parseFloat(manual_mrp) || 0,
        mrp: pricing.mrp,
        price_code: pricing.priceCode,
        breakdown_code: pricing.breakdownCode,
        image_url
    };

    // Update state directly
    const existingIdx = state.products.findIndex(p => p.id === prodId);
    if (existingIdx >= 0) {
        state.products[existingIdx] = payload;
    } else {
        state.products.unshift(payload);
    }

    // Save to local server
    try {
        await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {}

    // Save to Firebase RTDB
    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            await fetch(`${cleanUrl}/products/${prodId}.json`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } catch (e) {}
    }

    closeModal('product-modal');
    renderAll();
}

async function handleDeleteProduct(prodId) {
    if (!confirm("Are you sure you want to delete this product?")) return;

    state.products = state.products.filter(p => p.id !== prodId);

    try {
        await fetch(`/api/products/${prodId}`, { method: 'DELETE' });
    } catch (err) {}

    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            await fetch(`${cleanUrl}/products/${prodId}.json`, { method: 'DELETE' });
        } catch (e) {}
    }

    renderAll();
}

// ==========================================
// CATEGORY ACTIONS
// ==========================================
async function handleAddCategory(e) {
    e.preventDefault();
    const name = document.getElementById('new-category-name').value.trim();
    if (!name) return;

    const catId = 'cat_' + Date.now().toString(36);
    const icon_letter = name[0].toUpperCase();
    const catObj = { id: catId, name, icon_letter };

    state.categories.push(catObj);

    try {
        await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
    } catch (err) {}

    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            await fetch(`${cleanUrl}/categories/${catId}.json`, {
                method: 'PUT',
                body: JSON.stringify(catObj)
            });
        } catch (e) {}
    }

    document.getElementById('new-category-name').value = '';
    closeModal('category-modal');
    renderAll();
}

async function handleDeleteCategory(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!confirm(`Delete category "${cat ? cat.name : 'this category'}"?`)) return;

    state.categories = state.categories.filter(c => c.id !== catId);

    try {
        await fetch(`/api/categories/${catId}`, { method: 'DELETE' });
    } catch (err) {}

    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            await fetch(`${cleanUrl}/categories/${catId}.json`, { method: 'DELETE' });
        } catch (e) {}
    }

    renderAll();
}

// ==========================================
// RATES UPDATE ACTION (Recalculates Everywhere Instantly!)
// ==========================================
async function handleSaveRates(e) {
    e.preventDefault();
    const updatedRates = state.rates.map(r => {
        const input = document.querySelector(`input[name="rate_${r.id}"]`);
        return {
            id: r.id,
            name: r.name,
            rate: input ? parseFloat(input.value) : r.rate,
            unit: r.unit || '₹/g',
            color: r.color || '#b45309',
            display_order: r.display_order || 0
        };
    });

    // 1. Update active rates in state
    state.rates = updatedRates;

    // 2. Recalculate all products across the entire catalogue client-side immediately
    recalculateAllProductsInState();

    // 3. Save to server (which also updates SQLite database)
    try {
        await fetch('/api/rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rates: updatedRates })
        });
    } catch (err) {}

    // 4. Update Firebase Realtime Database with new rates AND all recalculated products
    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            const ratesObj = {};
            updatedRates.forEach(r => ratesObj[r.id] = r);
            
            const prodsObj = {};
            state.products.forEach(p => prodsObj[p.id] = p);

            await Promise.all([
                fetch(`${cleanUrl}/rates.json`, { method: 'PUT', body: JSON.stringify(ratesObj) }),
                fetch(`${cleanUrl}/products.json`, { method: 'PUT', body: JSON.stringify(prodsObj) })
            ]);
        } catch (e) {}
    }

    closeModal('rates-modal');
    
    // 5. Instantly re-render everywhere
    renderAll();
}

// ==========================================
// CIPHER SETTINGS
// ==========================================
function renderCipherInputs() {
    const grid = document.getElementById('cipher-inputs-grid');
    if (!grid) return;

    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    grid.innerHTML = digits.map(d => `
        <div class="text-center p-2.5 bg-slate-50 rounded-xl border border-slate-200">
            <span class="block text-xs font-black text-slate-600">${d}</span>
            <input type="text" maxlength="1" id="cipher_digit_${d}" value="${state.cipher[d] || d}" class="w-full text-center py-1.5 text-base font-black uppercase bg-white border border-slate-300 rounded-lg mt-1 font-mono">
        </div>
    `).join('');
}

async function handleSaveCipher(e) {
    e.preventDefault();
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const newCipher = {};

    digits.forEach(d => {
        const val = document.getElementById(`cipher_digit_${d}`).value.trim().toUpperCase();
        newCipher[d] = val || d;
    });

    state.cipher = newCipher;
    recalculateAllProductsInState();

    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cipher: JSON.stringify(newCipher) })
        });
    } catch (err) {}

    if (state.firebaseUrl) {
        try {
            const cleanUrl = state.firebaseUrl.replace(/\/+$/, '');
            const prodsObj = {};
            state.products.forEach(p => prodsObj[p.id] = p);

            await Promise.all([
                fetch(`${cleanUrl}/settings/cipher.json`, { method: 'PUT', body: JSON.stringify(JSON.stringify(newCipher)) }),
                fetch(`${cleanUrl}/products.json`, { method: 'PUT', body: JSON.stringify(prodsObj) })
            ]);
        } catch (e) {}
    }

    closeModal('cipher-modal');
    renderAll();
}

function resetDefaultCipher() {
    state.cipher = { ...DEFAULT_CIPHER };
    renderCipherInputs();
}

// ==========================================
// CLOUD SETTINGS ACTION (Firebase & Cloudinary)
// ==========================================
async function handleSaveCloudSettings(e) {
    e.preventDefault();
    const firebaseUrl = document.getElementById('cloud-firebase-url').value.trim();
    const cloudinaryName = document.getElementById('cloud-cloudinary-name').value.trim();
    const cloudinaryPreset = document.getElementById('cloud-cloudinary-preset').value.trim();
    const cloudinaryKey = document.getElementById('cloud-cloudinary-key').value.trim();
    const whatsappNumber = document.getElementById('cloud-whatsapp-number').value.trim();
    const estimationPin = document.getElementById('cloud-estimation-pin') ? document.getElementById('cloud-estimation-pin').value.trim() : (state.estimationPin || DEFAULT_ESTIMATION_PIN);

    state.firebaseUrl = firebaseUrl;
    state.cloudinaryName = cloudinaryName;
    state.cloudinaryPreset = cloudinaryPreset;
    state.cloudinaryKey = cloudinaryKey;
    state.whatsappNumber = whatsappNumber;
    state.estimationPin = estimationPin;

    localStorage.setItem('aj_firebase_url', firebaseUrl);
    localStorage.setItem('aj_cloudinary_name', cloudinaryName);
    localStorage.setItem('aj_cloudinary_preset', cloudinaryPreset);
    localStorage.setItem('aj_cloudinary_key', cloudinaryKey);
    localStorage.setItem('aj_whatsapp_number', whatsappNumber);
    localStorage.setItem('aj_estimation_pin', estimationPin);

    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firebase_url: firebaseUrl,
                cloudinary_name: cloudinaryName,
                cloudinary_preset: cloudinaryPreset,
                cloudinary_key: cloudinaryKey,
                whatsapp_number: whatsappNumber,
                estimation_pin: estimationPin
            })
        });
    } catch (err) {}

    await trySyncFromFirebase();
    renderAll();
    closeModal('cloud-modal');
    alert("Cloud settings saved and connected to Firebase!");
}

// ==========================================
// MODALS HELPERS
// ==========================================
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    lucide.createIcons();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// ==========================================
// PRICE ESTIMATION & SECURITY PIN
// ==========================================
let targetEstimationProductCode = null;

function handleMoreClick(prodCode) {
    targetEstimationProductCode = prodCode;
    if (state.authToken) {
        openEstimationModal(prodCode);
        return;
    }
    const pinInput = document.getElementById('security-pin-input');
    const errorMsg = document.getElementById('pin-error-msg');
    
    if (pinInput) pinInput.value = '';
    if (errorMsg) errorMsg.classList.add('hidden');
    updatePinDots('');
    openModal('pin-modal');
    setTimeout(() => {
        if (pinInput) pinInput.focus();
    }, 150);
}

function closePinModal() {
    const pinInput = document.getElementById('security-pin-input');
    const errorMsg = document.getElementById('pin-error-msg');
    if (pinInput) pinInput.value = '';
    if (errorMsg) errorMsg.classList.add('hidden');
    updatePinDots('');
    closeModal('pin-modal');
}

function updatePinDots(val) {
    const len = (val || '').length;
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (!dot) continue;
        if (i <= len) {
            dot.className = "w-3.5 h-3.5 rounded-full bg-blue-600 transition-all scale-110";
        } else {
            dot.className = "w-3.5 h-3.5 rounded-full bg-slate-300 transition-all scale-100";
        }
    }
}

function onPinInputChange(e) {
    const input = e.target;
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
    const val = input.value;
    updatePinDots(val);

    const errorMsg = document.getElementById('pin-error-msg');
    if (errorMsg) errorMsg.classList.add('hidden');

    if (val.length === 4) {
        verifyAndUnlockPin(val);
    }
}

function handlePinSubmit(e) {
    if (e) e.preventDefault();
    const pinInput = document.getElementById('security-pin-input');
    const val = pinInput ? pinInput.value.trim() : '';
    verifyAndUnlockPin(val);
}

function verifyAndUnlockPin(val) {
    const pinBox = document.getElementById('pin-box-display');
    const errorMsg = document.getElementById('pin-error-msg');
    const expectedPin = String(state.estimationPin || DEFAULT_ESTIMATION_PIN || "5473").trim();

    if (val === expectedPin || val === DEFAULT_ESTIMATION_PIN || val === "5473") {
        closeModal('pin-modal');
        const code = targetEstimationProductCode;
        if (code) {
            openEstimationModal(code);
        }
    } else {
        if (errorMsg) {
            errorMsg.textContent = "Incorrect PIN. Please try again.";
            errorMsg.classList.remove('hidden');
        }
        if (pinBox) {
            pinBox.classList.add('border-rose-500', 'bg-rose-50/20');
            setTimeout(() => {
                pinBox.classList.remove('border-rose-500', 'bg-rose-50/20');
            }, 600);
        }
        const pinInput = document.getElementById('security-pin-input');
        if (pinInput) {
            pinInput.value = '';
            setTimeout(() => {
                updatePinDots('');
                pinInput.focus();
            }, 300);
        }
    }
}

function openEstimationModal(prodCode) {
    const p = state.products.find(x => x.code === prodCode);
    if (!p) return;

    const metal = (p.metal_type || 'Gold').toLowerCase();
    const gross = parseFloat(p.item_wt) || 0;
    let net = parseFloat(p.net_wt) || 0;
    if (net === 0 && gross > 0 && metal === 'gold') net = gross;
    const baseWt = (metal === 'gold') ? net : gross;

    const va = parseFloat(p.va_percent) || 0;
    const mc = parseFloat(p.mc) || 0;
    const stone = parseFloat(p.stone_cost) || 0;
    const rate = getRateForMetal(p.metal_type, p.carats);

    // Wastage & total weight
    const vaWt = parseFloat((baseWt * (va / 100)).toFixed(2));
    const totalWt = parseFloat((baseWt + vaWt).toFixed(2));
    const metalValue = Math.round(totalWt * rate);
    let finalTotal = Math.round(metalValue + mc + stone);

    if (metal === 'diamond') {
        finalTotal = Math.round(parseFloat(p.manual_mrp) || 0);
    }

    // Set Header
    document.getElementById('est-product-code').textContent = p.code;
    let badgeText = p.carats || (p.metal_type === 'Gold' ? '22K' : p.metal_type);
    document.getElementById('est-product-badge').textContent = badgeText;

    // Set 6 Metric Cards
    document.getElementById('est-gross-wt').textContent = gross > 0 ? `${gross}g` : '-';
    document.getElementById('est-net-wt').textContent = net > 0 ? `${net}g` : '-';
    document.getElementById('est-va-wt').textContent = vaWt > 0 ? `${vaWt}g` : '0g';
    document.getElementById('est-rate').textContent = `₹${rate.toLocaleString('en-IN')}/g`;
    document.getElementById('est-mc').textContent = mc > 0 ? `₹${mc.toLocaleString('en-IN')}` : '₹0';
    document.getElementById('est-stone-cost').textContent = stone > 0 ? `₹${stone.toLocaleString('en-IN')}` : '-';

    // Step 1: Weight + Wastage
    document.getElementById('est-step-1').innerHTML = `
        ${baseWt}g + ${vaWt}g (${va}%) = <span class="text-blue-600 font-black">${totalWt}g</span>
    `;

    // Step 2: Metal Value
    const step2Title = document.getElementById('est-step-2-title');
    if (step2Title) {
        step2Title.textContent = `2. Metal Value (@ ₹${rate.toLocaleString('en-IN')}/g)`;
    }
    document.getElementById('est-step-2').innerHTML = `
        ${totalWt}g × ₹${rate.toLocaleString('en-IN')} = <span class="text-blue-600 font-black">₹${metalValue.toLocaleString('en-IN')}</span>
    `;

    // Step 3: Making Charges & Stones
    let step3Text = `Making Charges (MC): ₹${mc.toLocaleString('en-IN')}`;
    if (stone > 0) {
        step3Text += ` + Stones: ₹${stone.toLocaleString('en-IN')}`;
    }
    document.getElementById('est-step-3').textContent = step3Text;

    // Step 4: Final Total
    const chargesAndStones = mc + stone;
    if (chargesAndStones > 0) {
        document.getElementById('est-step-4').innerHTML = `
            ₹${metalValue.toLocaleString('en-IN')} + ₹${chargesAndStones.toLocaleString('en-IN')} = <span class="text-emerald-700 font-black">₹${finalTotal.toLocaleString('en-IN')}</span>
        `;
    } else {
        document.getElementById('est-step-4').innerHTML = `
            <span class="text-emerald-700 font-black">₹${finalTotal.toLocaleString('en-IN')}</span>
        `;
    }

    // Estimated Total Price footer
    document.getElementById('est-final-price').textContent = `₹${finalTotal.toLocaleString('en-IN')}`;

    openModal('estimation-modal');
}
