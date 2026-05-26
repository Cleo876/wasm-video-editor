/**
 * @name P2P Project Share
 * @version 2.9.1
 * @developer Forge™
 * @description Next-Gen P2P Sharing. Features Single-Copy-Paste Handshake, CORS-compliant origins, Sender Cancellation, Storage Quota Diagnostics, and Prominent Installation Warnings.
 */
(function() {
    const MODULE_ID = 'p2p_share_final';

    if (typeof Store === 'undefined' || typeof DB === 'undefined' || typeof FileManager === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found.`);
        return;
    }

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 2
    };
    
    const GATHERING_TIMEOUT_SECONDS = 8;
    const CHUNK_SIZE = 16384;

    const SENDER_NAMES = ["🥦 Broccoli", "🥕 Carrot", "🍅 Tomato", "🌽 Corn", "🥔 Potato", "🍆 Eggplant", "🥑 Avocado"];
    const RECEIVER_NAMES = ["🦊 Fox", "🐻 Bear", "🐼 Panda", "🐨 Koala", "🐯 Tiger", "🦁 Lion", "🐰 Bunny"];

    function getRandomIdentity(list) {
        return list[Math.floor(Math.random() * list.length)] + "-" + Math.floor(100 + Math.random() * 900);
    }

    function utoa(data) { return btoa(unescape(encodeURIComponent(data))); }
    function atou(b64) { return decodeURIComponent(escape(atob(b64))); }

    const Engine = {
        modal: null,
        pc: null,
        dc: null,
        transferActive: false,
        transferAborted: false,
        completed: false,

        identity: null,
        partnerName: null,
        pollInterval: null,

        shareProjectId: null,
        shareIncludeUndo: false,
        sendFiles: [],
        sendOffset: 0,
        sendTotal: 0,
        sendCurrentFileIdx: 0,

        pendingManifest: null,
        pendingUndo: null,           
        receivedChunks: [],
        receivedBytes: 0,
        targetBytes: 0,
        accepted: false,

        init() {
            this.injectStyles();
            this.injectMenu();
            this.buildModal();
        },

        /* ---------- UI ---------- */
        injectStyles() {
            if (document.getElementById(`${MODULE_ID}_css`)) return;
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_css`;
            style.innerHTML = `
                .p2p-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100000;
                    display: none; align-items: center; justify-content: center;
                }
                .p2p-modal {
                    background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.8);
                    width: min(640px, 96vw); max-height: 90vh;
                    font-family: 'Inter', sans-serif; color: #ccc;
                    display: flex; flex-direction: column; overflow: hidden;
                }
                .p2p-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 14px 18px; border-bottom: 1px solid #333; background: #222;
                    flex-shrink: 0;
                }
                .p2p-header span { font-weight: bold; font-size: 0.85rem; color: #00d2be; }
                .p2p-close { background: none; border: none; color: #666; font-size: 1.2rem; cursor: pointer; }
                .p2p-close:hover { color: #fff; }
                .p2p-close:disabled { opacity: 0.3; cursor: not-allowed; }
                .p2p-tabs { display: flex; border-bottom: 1px solid #333; background: #111; flex-shrink: 0; }
                .p2p-tab {
                    flex: 1; padding: 10px; text-align: center; font-size: 0.8rem; color: #777;
                    cursor: pointer; border-bottom: 2px solid transparent; transition: 0.2s;
                }
                .p2p-tab.active { color: #00d2be; border-bottom-color: #00d2be; background: #1a1a1a; }
                .p2p-body {
                    padding: 18px; display: none; flex: 1; overflow-y: auto;
                    max-height: calc(90vh - 110px);
                }
                .p2p-body.active { display: block; }
                .p2p-row { margin-bottom: 14px; }
                .p2p-label { display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; text-transform: uppercase; color: #888; margin-bottom: 4px; }
                .p2p-select, .p2p-textarea {
                    width: 100%; background: #111; border: 1px solid #333; color: #ddd;
                    padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; outline: none;
                }
                .p2p-textarea { resize: vertical; min-height: 80px; font-family: monospace; }
                .p2p-btn {
                    background: #00d2be; color: #000; font-weight: bold; border: none;
                    padding: 10px 18px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;
                    transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                }
                .p2p-btn:hover { background: #00e6cf; }
                .p2p-btn:disabled { opacity: 0.5; pointer-events: none; }
                .p2p-btn.ghost { background: transparent; border: 1px solid #333; color: #aaa; }
                .p2p-btn.ghost:hover { border-color: #00d2be; color: #00d2be; }
                .p2p-btn.danger { background: #7f1d1d; color: #fff; border: 1px solid #991b1b; }
                .p2p-btn.danger:hover { background: #991b1b; }
                .p2p-progress { height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 8px; }
                .p2p-progress-bar { height: 100%; background: #00d2be; width: 0%; transition: width 0.2s; }
                .p2p-status { font-size: 0.7rem; color: #aaa; margin-top: 6px; }
                .p2p-notice { font-size: 0.7rem; padding: 8px 10px; border-radius: 4px; margin-bottom: 10px; }
                .p2p-notice.info { background: #004d45; color: #00d2be; border: 1px solid #00d2be40; }
                .p2p-notice.success { background: #14532d; color: #10b981; border: 1px solid #10b98140; }
                .p2p-notice.error { background: #7f1d1d; color: #ff5252; border: 1px solid #ff525240; }
                .p2p-notice.warn { background: #5c3d00; color: #f59e0b; border: 1px solid #f59e0b40; }
                .p2p-file-list { max-height: 120px; overflow-y: auto; margin-top: 8px; font-size: 0.65rem; color: #777; }
                .p2p-file-item { padding: 3px 0; border-bottom: 1px solid #1a1a1a; display: flex; justify-content: space-between; }
                .p2p-file-item.done { color: #10b981; }
                .p2p-file-item.current { color: #00d2be; }
                .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #00d2be; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .p2p-confirm-card {
                    background: #111; border: 1px solid #333; border-radius: 8px; padding: 16px;
                    text-align: center; margin-bottom: 12px;
                }
                .p2p-confirm-card h3 { font-size: 1rem; color: #fff; margin: 0 0 8px; }
                .p2p-confirm-card p { font-size: 0.75rem; color: #888; margin: 4px 0; }
                .p2p-confirm-actions { display: flex; gap: 10px; justify-content: center; margin-top: 12px; }
            `;
            document.head.appendChild(style);
        },

        injectMenu() {
            const dropdown = document.querySelector('.menu-wrapper .dropdown');
            if (!dropdown) return;
            const divider = document.createElement('div');
            divider.className = 'border-t border-gray-700 my-1';
            const btn = document.createElement('div');
            btn.className = 'dropdown-item flex items-center';
            btn.innerHTML = `<i class="fa-solid fa-share-nodes mr-2 text-gray-400"></i> Share Project...`;
            btn.onclick = () => this.open();
            dropdown.appendChild(divider);
            dropdown.appendChild(btn);
        },

        buildModal() {
            const overlay = document.createElement('div');
            overlay.className = 'p2p-overlay';
            overlay.id = 'p2p-overlay';
            overlay.innerHTML = `
                <div class="p2p-modal" onclick="event.stopPropagation()">
                    <div class="p2p-header" style="flex-direction: column; align-items: stretch; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span><i class="fa-solid fa-share-nodes"></i> Project Sharing</span>
                            <button class="p2p-close" id="p2p-close" title="Close">&times;</button>
                        </div>
                        <div class="text-[9px] text-gray-400 uppercase tracking-widest font-bold">
                            <i class="fa-solid fa-circle-info mr-1"></i> Note: Receiver must have this extension installed to accept
                        </div>
                    </div>
                    <div class="p2p-tabs">
                        <div class="p2p-tab active" data-tab="share">📤 Share</div>
                        <div class="p2p-tab" data-tab="receive">📥 Receive</div>
                    </div>

                    <!-- SENDER TAB -->
                    <div class="p2p-body active" id="p2p-share-tab">
                        <div class="p2p-row"><label class="p2p-label">Project to share</label><select id="p2p-share-project" class="p2p-select"></select></div>
                        <div class="p2p-row" style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="p2p-include-undo" checked class="accent-teal-500" /><label for="p2p-include-undo" style="font-size:0.75rem;">Include perfect undo history</label></div>
                        <button id="p2p-gen-offer" class="p2p-btn w-full"><i class="fa-solid fa-code"></i> Generate Sharing Code</button>
                        
                        <div id="p2p-offer-section" style="display:none; margin-top: 15px; border-top: 1px solid #333; padding-top: 15px;">
                            <div id="p2p-identity-header" class="text-center font-bold text-sm mb-3"></div>
                            
                            <div class="p2p-row relative">
                                <label class="p2p-label">
                                    <span>Sharing code (Send to receiver)</span>
                                    <span id="p2p-copy-btn" class="text-teal-400 cursor-pointer hover:text-teal-300 transition" title="Copy to Clipboard"><i class="fa-solid fa-copy"></i> Copy</span>
                                </label>
                                <textarea id="p2p-offer-text" class="p2p-textarea bg-[#0a0a0a]" readonly onclick="this.select()"></textarea>
                            </div>
                            
                            <!-- AUTO RETURN MODE WITH VISIBLE POLLING -->
                            <div id="p2p-auto-return-section" class="p2p-notice info flex flex-col items-center justify-center text-center p-4 mb-3" style="display:none;">
                                <span class="spin mb-2" id="p2p-sender-spin"></span>
                                <div id="p2p-sender-status-text" class="font-bold">Initializing twenty.json relay...</div>
                                <div id="p2p-sender-poll-url" class="text-[9px] text-gray-400 mt-1 font-mono break-all"></div>
                            </div>

                            <!-- ALWAYS VISIBLE MANUAL RETURN MODE (BULLETPROOF FALLBACK) -->
                            <div id="p2p-manual-return-section" style="display:none;">
                                <div class="p2p-row">
                                    <label class="p2p-label">Receiver's Response (Auto-fills if connected)</label>
                                    <textarea id="p2p-answer-input" class="p2p-textarea transition-colors" placeholder="Waiting to auto-fill, or paste manually here if network hangs..." onclick="this.select()"></textarea>
                                </div>
                                <button id="p2p-finalize" class="p2p-btn w-full"><i class="fa-solid fa-link"></i> Complete & Connect</button>
                            </div>
                        </div>

                        <div id="p2p-send-area" style="display:none; margin-top: 15px;">
                            <div id="p2p-send-notice" class="p2p-notice info"></div>
                            <div class="p2p-progress"><div class="p2p-progress-bar" id="p2p-send-progress"></div></div>
                            <div class="flex justify-between items-center mt-1">
                                <div class="p2p-status" id="p2p-send-status"></div>
                                <button id="p2p-send-cancel" class="p2p-btn danger" style="padding: 4px 8px; font-size: 0.65rem; display: none;"><i class="fa-solid fa-ban"></i> Cancel Transfer</button>
                            </div>
                            <div class="p2p-file-list" id="p2p-send-file-list"></div>
                        </div>
                    </div>

                    <!-- RECEIVER TAB -->
                    <div class="p2p-body" id="p2p-receive-tab">
                        <div class="p2p-row"><label class="p2p-label">Paste sharing code from sender</label><textarea id="p2p-recv-offer" class="p2p-textarea bg-[#0a0a0a]" placeholder="Paste code..." onclick="this.select()"></textarea></div>
                        <button id="p2p-accept" class="p2p-btn w-full"><i class="fa-solid fa-check"></i> Accept & Generate Response</button>
                        
                        <div id="p2p-response-section" style="display:none; margin-top: 15px; border-top: 1px solid #333; padding-top: 15px;">
                            
                            <!-- AUTO RESPONSE MODE -->
                            <div id="p2p-recv-auto-status" class="p2p-notice info text-center p-4" style="display:none;">
                                <span class="spin mb-2" id="p2p-recv-spin"></span><br>
                                <span id="p2p-recv-auto-text" class="font-bold">Response sent! Waiting for sender to connect...</span>
                            </div>

                            <!-- ALWAYS VISIBLE MANUAL RESPONSE MODE (BULLETPROOF FALLBACK) -->
                            <div id="p2p-recv-manual-section" style="display:none;">
                                <div class="text-[10px] text-gray-500 text-center mb-2">Your response was auto-sent. If the sender's network hangs, copy this code and send it manually.</div>
                                <div class="p2p-row">
                                    <label class="p2p-label">
                                        <span>Your response code</span>
                                        <span id="p2p-copy-response-btn" class="text-teal-400 cursor-pointer hover:text-teal-300 transition" title="Copy to Clipboard"><i class="fa-solid fa-copy"></i> Copy</span>
                                    </label>
                                    <textarea id="p2p-answer-text" class="p2p-textarea bg-[#0a0a0a]" readonly onclick="this.select()"></textarea>
                                </div>
                            </div>
                            
                            <div id="p2p-recv-confirm-card" class="p2p-confirm-card mt-3" style="display:none;"></div>
                            <div id="p2p-recv-notice" class="p2p-notice info mt-2 empty:hidden"></div>
                            <div class="p2p-progress"><div class="p2p-progress-bar" id="p2p-recv-progress"></div></div>
                            <div class="p2p-status" id="p2p-recv-status"></div>
                            <div class="p2p-file-list" id="p2p-recv-file-list"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this.modal = overlay;

            overlay.querySelector('#p2p-close').onclick = () => this.handleClose();
            overlay.querySelectorAll('.p2p-tab').forEach(t => t.onclick = () => this.switchTab(t.dataset.tab));
            
            document.getElementById('p2p-gen-offer').onclick = () => this.handleGenerateOffer();
            document.getElementById('p2p-finalize').onclick = () => this.handleManualFinalize();
            document.getElementById('p2p-accept').onclick = () => this.handleAccept();
            document.getElementById('p2p-send-cancel').onclick = () => this.cancelTransfer();

            // Dedicated Copy Buttons
            document.getElementById('p2p-copy-btn').onclick = () => {
                const txt = document.getElementById('p2p-offer-text');
                txt.select();
                document.execCommand('copy');
                if(typeof Notify !== 'undefined') Notify.show('Code Copied!', 'fa-copy');
            };

            document.getElementById('p2p-copy-response-btn').onclick = () => {
                const txt = document.getElementById('p2p-answer-text');
                txt.select();
                document.execCommand('copy');
                if(typeof Notify !== 'undefined') Notify.show('Response Copied!', 'fa-copy');
            };

            overlay.onclick = (e) => { if (e.target === overlay) this.handleClose(); };
        },

        open() {
            this.refreshProjects();
            this.modal.style.display = 'flex';
        },
        close() {
            this.modal.style.display = 'none';
            this.cleanup();
            this.resetUI();
        },
        handleClose() {
            if (this.transferActive && !this.completed) {
                if (typeof Notify !== 'undefined') Notify.show('Transfer in progress – please wait or cancel', 'fa-spinner');
                return;
            }
            this.close();
        },
        switchTab(tab) {
            document.querySelectorAll('.p2p-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.p2p-body').forEach(b => b.classList.remove('active'));
            document.querySelector(`.p2p-tab[data-tab="${tab}"]`).classList.add('active');
            document.getElementById(`p2p-${tab}-tab`).classList.add('active');
        },
        refreshProjects() {
            const sel = document.getElementById('p2p-share-project');
            sel.innerHTML = '';
            sel.appendChild(new Option(Store.projectName, Store.projectId));
        },
        resetUI() {
            document.getElementById('p2p-gen-offer').disabled = false;
            document.getElementById('p2p-gen-offer').innerHTML = '<i class="fa-solid fa-code"></i> Generate Sharing Code';
            document.getElementById('p2p-offer-section').style.display = 'none';
            document.getElementById('p2p-auto-return-section').style.display = 'none';
            document.getElementById('p2p-manual-return-section').style.display = 'none';
            document.getElementById('p2p-send-area').style.display = 'none';
            document.getElementById('p2p-send-cancel').style.display = 'none';
            
            const answerInput = document.getElementById('p2p-answer-input');
            if (answerInput) {
                answerInput.value = '';
                answerInput.classList.remove('border-green-500', 'bg-green-900/10');
                answerInput.placeholder = "Waiting to auto-fill, or paste manually here if network hangs...";
            }
            
            document.getElementById('p2p-accept').disabled = false;
            document.getElementById('p2p-accept').innerHTML = '<i class="fa-solid fa-check"></i> Accept & Generate Response';
            document.getElementById('p2p-response-section').style.display = 'none';
            document.getElementById('p2p-recv-auto-status').style.display = 'none';
            document.getElementById('p2p-recv-manual-section').style.display = 'none';
            
            document.getElementById('p2p-recv-confirm-card').style.display = 'none';
            document.getElementById('p2p-send-notice').innerHTML = '';
            document.getElementById('p2p-recv-notice').innerHTML = '';
            document.getElementById('p2p-send-file-list').innerHTML = '';
            document.getElementById('p2p-recv-file-list').innerHTML = '';
            
            this.transferActive = false;
            this.transferAborted = false;
            this.completed = false;
            document.getElementById('p2p-close').disabled = false;
        },
        cleanup() {
            if (this.pollInterval) clearInterval(this.pollInterval);
            if (this.pc) { this.pc.close(); this.pc = null; }
            this.dc = null;
            this.sendFiles = []; this.sendOffset = 0; this.sendTotal = 0; this.sendCurrentFileIdx = 0;
            this.pendingManifest = null;
            this.pendingUndo = null;
            this.receivedChunks = []; this.receivedBytes = 0; this.targetBytes = 0;
            this.accepted = false;
        },
        
        cancelTransfer() {
            if (!this.transferActive || this.completed) return;
            this.transferAborted = true;
            
            if (this.dc && this.dc.readyState === 'open') {
                try { 
                    const sig = new Uint8Array(1); sig[0] = 12;
                    this.dc.send(sig.buffer); 
                } catch(e) {}
            }
            
            document.getElementById('p2p-send-notice').className = 'p2p-notice warn';
            document.getElementById('p2p-send-notice').innerHTML = '⚠️ Transfer cancelled by you.';
            document.getElementById('p2p-send-cancel').style.display = 'none';
            
            this.completed = true;
            this.transferActive = false;
            document.getElementById('p2p-close').disabled = false;
            
            if (this.pc) this.pc.close();
            
            if (typeof Notify !== 'undefined') Notify.show('Transfer Cancelled', 'fa-ban');
        },

        /* ---------- LIVE ICE GATHERING TRACKER ---------- */
        async gatherWithTimeout(pc, progressBtn) {
            return new Promise((resolve) => {
                const candidates = [];
                const startTime = performance.now();
                let interval;
                
                // Live UI feedback loop mapping ICE candidates
                if (progressBtn) {
                    interval = setInterval(() => {
                        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
                        progressBtn.innerHTML = `<span class="spin"></span> Mapping Network... (${elapsed}s | ${candidates.length} routes)`;
                    }, 100);
                }

                const finish = () => {
                    if (interval) clearInterval(interval);
                    resolve({ type: pc.localDescription.type, sdp: pc.localDescription.sdp, candidates });
                };

                const timer = setTimeout(finish, GATHERING_TIMEOUT_SECONDS * 1000);

                pc.onicecandidate = (e) => {
                    if (e.candidate) {
                        candidates.push(e.candidate);
                    } else { 
                        clearTimeout(timer); 
                        finish(); 
                    }
                };
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') { 
                        clearTimeout(timer); 
                        finish(); 
                    }
                };
            });
        },

        /* ---------- SENDER ---------- */
        async handleGenerateOffer() {
            const btn = document.getElementById('p2p-gen-offer');
            btn.disabled = true; 
            btn.innerHTML = '<span class="spin"></span> Initializing...';
            
            this.shareProjectId = document.getElementById('p2p-share-project').value;
            this.shareIncludeUndo = document.getElementById('p2p-include-undo').checked;
            this.identity = getRandomIdentity(SENDER_NAMES);

            const pc = new RTCPeerConnection(ICE_SERVERS);
            const dc = pc.createDataChannel('transfer');
            this.dc = dc; dc.binaryType = 'arraybuffer';
            dc.onmessage = (msg) => this.handleSenderMessage(msg.data);

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                // LIVE UI TRACKING INJECTED HERE
                const pkg = await this.gatherWithTimeout(pc, btn);
                
                // Try to create Twenty.json for Auto-Return
                let returnId = null;
                try {
                    const jRes = await fetch('https://twenty-json.lovable.app/p/', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'waiting' })
                    });
                    if (jRes.ok) {
                        const data = await jRes.json();
                        if (data.id) returnId = data.id;
                    }
                } catch(e) { console.warn("twenty-json offline or CORS blocked. Defaulting to manual mode.", e); }

                const codeObj = { offer: pkg, returnId, senderName: this.identity };
                
                // Human-readable prefix so the receiver knows exactly what this string is
                const codeStr = "FORGE-P2P-" + utoa(JSON.stringify(codeObj));

                document.getElementById('p2p-identity-header').innerHTML = `You are <span class="text-white">${this.identity}</span>. Code is ready!`;
                document.getElementById('p2p-offer-text').value = codeStr;
                document.getElementById('p2p-offer-section').style.display = 'block';
                document.getElementById('p2p-manual-return-section').style.display = 'block'; // Always show manual fallback
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Code Ready';

                const answerInput = document.getElementById('p2p-answer-input');

                if (returnId) {
                    document.getElementById('p2p-auto-return-section').style.display = 'flex';
                    const urlDisplay = document.getElementById('p2p-sender-poll-url');
                    if(urlDisplay) urlDisplay.innerText = `Polling relay ID: ${returnId}`;
                    
                    let pollCount = 0;
                    this.pollInterval = setInterval(async () => {
                        pollCount++;
                        
                        document.getElementById('p2p-sender-status-text').innerHTML = `Auto-polling relay... <span class="text-[10px] text-gray-500">(Attempt #${pollCount})</span>`;
                        answerInput.placeholder = `Automatically polling twenty-json for receiver's response... (Attempt #${pollCount})\n\nIf the network hangs, paste the receiver's response manually here.`;

                        try {
                            // CACHE BUSTING FIX: Append a timestamp to safely bypass browser caching
                            const res = await fetch(`https://twenty-json.lovable.app/p/${returnId}?_=${Date.now()}`, { 
                                cache: 'no-store',
                                headers: { 'Accept': 'application/json' }
                            });
                            
                            if (res.ok) {
                                const data = await res.json();
                                if (data && data.answer) {
                                    clearInterval(this.pollInterval);
                                    
                                    // Beautiful UI transition showing the auto-fill successful
                                    const spin = document.getElementById('p2p-sender-spin');
                                    if (spin) spin.style.display = 'none';
                                    document.getElementById('p2p-sender-status-text').innerHTML = '<i class="fa-solid fa-check text-green-400"></i> Response auto-filled! Connecting...';
                                    
                                    // Auto-fill the textarea so the user can explicitly see the magic happening
                                    answerInput.value = JSON.stringify(data.answer);
                                    answerInput.classList.add('border-green-500', 'bg-green-900/10');
                                    
                                    this.executeFinalize(data.answer, data.receiverName || 'Unknown Receiver');
                                }
                            }
                        } catch(e) {}
                    }, 2000);
                } else {
                    // Network Error on creation
                    document.getElementById('p2p-auto-return-section').style.display = 'flex';
                    const spin = document.getElementById('p2p-sender-spin');
                    if (spin) spin.style.display = 'none';
                    document.getElementById('p2p-sender-status-text').innerHTML = '<i class="fa-solid fa-triangle-exclamation text-yellow-500"></i> Auto-polling blocked by network. Use manual mode below.';
                    answerInput.placeholder = "Auto-polling unavailable. Paste the receiver's response code manually here.";
                }

            } catch (e) {
                document.getElementById('p2p-send-notice').innerHTML = '❌ Failed to generate code.';
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-code"></i> Retry';
                console.error(e);
            }
            this.pc = pc;
        },

        async handleManualFinalize() {
            const answerStr = document.getElementById('p2p-answer-input').value.trim();
            if (!answerStr) return;
            const btn = document.getElementById('p2p-finalize');
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Connecting...';

            if (this.pollInterval) clearInterval(this.pollInterval);

            try {
                const pkg = JSON.parse(answerStr);
                await this.executeFinalize(pkg, 'Receiver');
            } catch (e) {
                document.getElementById('p2p-send-notice').innerHTML = '❌ Connection failed. Check response code.';
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-link"></i> Retry';
                console.error(e);
            }
        },

        async executeFinalize(answerPkg, receiverName) {
            const statusText = document.getElementById('p2p-sender-status-text');
            if(statusText && !statusText.innerHTML.includes('Response auto-filled')) {
                 statusText.innerHTML = `Connecting to <strong class="text-white">${receiverName}</strong>...`;
            }

            try {
                await this.pc.setRemoteDescription(new RTCSessionDescription(answerPkg));
                for (const c of answerPkg.candidates) await this.pc.addIceCandidate(new RTCIceCandidate(c));
                await new Promise((resolve, reject) => {
                    if (this.dc.readyState === 'open') resolve();
                    else { this.dc.onopen = resolve; this.dc.onerror = reject; }
                });
                
                document.getElementById('p2p-offer-section').style.display = 'none';
                document.getElementById('p2p-send-area').style.display = 'block';
                document.getElementById('p2p-send-notice').innerHTML = `⏳ Connection to <strong>${receiverName}</strong> established. Sending project info…`;
                this.transferActive = true;
                document.getElementById('p2p-close').disabled = true;

                await this.sendManifest();
                document.getElementById('p2p-send-notice').innerHTML = `📋 Project info sent. Waiting for <strong>${receiverName}</strong> to accept or decline…`;
            } catch (e) {
                if(statusText) statusText.innerHTML = `❌ Connection to ${receiverName} failed. Use manual fallback.`;
                throw e;
            }
        },

        async sendManifest() {
            const project = await DB.get('projects', this.shareProjectId);
            const assets = (await DB.getAll('assets')).filter(a => a.projectId === this.shareProjectId);
            const fileAssets = assets.filter(a => a.file);
            
            const manifest = {
                name: project.name,
                tracks: project.tracks,
                trackConfig: project.trackConfig,
                assets: assets.map(a => ({
                    oldId: a.id, name: a.name, type: a.type,
                    duration: a.duration || 0, color: a.color || '#555',
                    size: a.file ? a.file.size : 0
                })),
                hasUndo: this.shareIncludeUndo,   
                totalBytes: fileAssets.reduce((s, a) => s + a.file.size, 0)
            };

            const enc = new TextEncoder();
            const jsonBuf = enc.encode(JSON.stringify(manifest));
            const header = new Uint8Array(1); header[0] = 0; 
            const combined = new Uint8Array(header.length + jsonBuf.length);
            combined.set(header); combined.set(jsonBuf, 1);
            this.dc.send(combined.buffer);

            if (this.shareIncludeUndo) {
                const undoData = await DB.get('system', 'history_' + this.shareProjectId);
                if (undoData) {
                    const undoJson = enc.encode(JSON.stringify(undoData));
                    const hdr = new Uint8Array(1); hdr[0] = 3; 
                    const combinedUndo = new Uint8Array(hdr.length + undoJson.length);
                    combinedUndo.set(hdr); combinedUndo.set(undoJson, 1);
                    this.dc.send(combinedUndo.buffer);
                } else {
                    const hdr = new Uint8Array(1); hdr[0] = 3;
                    this.dc.send(hdr.buffer);
                }
            }

            this.sendFiles = fileAssets.map(a => ({ name: a.name, file: a.file, size: a.file.size }));
            this.sendTotal = manifest.totalBytes;
            this.sendOffset = 0;
            this.sendCurrentFileIdx = 0;
            this.renderSendFileList();
        },

        handleSenderMessage(buffer) {
            const view = new DataView(buffer);
            const type = view.getUint8(0);
            if (type === 10) {
                document.getElementById('p2p-send-notice').innerHTML = '✅ Receiver accepted! Sending files…';
                this.startSendingFiles();
            } else if (type === 11) {
                document.getElementById('p2p-send-notice').className = 'p2p-notice error';
                document.getElementById('p2p-send-notice').innerHTML = '❌ Receiver declined the transfer.';
                this.completed = true;
                this.transferActive = false;
                document.getElementById('p2p-close').disabled = false;
            } else if (type === 12) {
                document.getElementById('p2p-recv-notice').className = 'p2p-notice error';
                document.getElementById('p2p-recv-notice').innerHTML = '❌ Sender cancelled the transfer.';
                this.completed = true;
                this.transferActive = false;
                document.getElementById('p2p-close').disabled = false;
                if (typeof Notify !== 'undefined') Notify.show('Sender cancelled transfer', 'fa-ban');
                if (this.pc) this.pc.close();
            }
        },

        async startSendingFiles() {
            const dc = this.dc;
            document.getElementById('p2p-send-cancel').style.display = 'inline-block';
            
            try {
                for (let i = 0; i < this.sendFiles.length; i++) {
                    this.sendCurrentFileIdx = i;
                    this.renderSendFileList();
                    const buf = await this.sendFiles[i].file.arrayBuffer();
                    let offset = 0;
                    while (offset < buf.byteLength) {
                        if (this.transferAborted) throw new Error("Cancelled by sender");
                        
                        while (dc.bufferedAmount > 65536) await new Promise(r => setTimeout(r, 10));
                        
                        if (this.transferAborted) throw new Error("Cancelled by sender");
                        
                        const end = Math.min(offset + CHUNK_SIZE, buf.byteLength);
                        const slice = buf.slice(offset, end);
                        const hdr = new Uint8Array(1); hdr[0] = 1;
                        const chunk = new Uint8Array(slice);
                        const msg = new Uint8Array(hdr.length + chunk.length);
                        msg.set(hdr); msg.set(chunk, 1);
                        dc.send(msg.buffer);
                        this.sendOffset += chunk.length;
                        offset = end;
                        const pct = Math.round((this.sendOffset / this.sendTotal) * 100);
                        document.getElementById('p2p-send-progress').style.width = pct + '%';
                        document.getElementById('p2p-send-status').innerText = `Sent ${(this.sendOffset/1024).toFixed(0)} / ${(this.sendTotal/1024).toFixed(0)} KB`;
                        this.renderSendFileList();
                    }
                }
                
                if (this.transferAborted) return;
                
                const endMarker = new Uint8Array(1); endMarker[0] = 2;
                while (dc.bufferedAmount > 1024) await new Promise(r => setTimeout(r, 10));
                dc.send(endMarker.buffer);

                document.getElementById('p2p-send-notice').className = 'p2p-notice success';
                document.getElementById('p2p-send-notice').innerHTML = '✔️ Project sent successfully!';
                document.getElementById('p2p-send-status').innerText = 'Transfer complete.';
                document.getElementById('p2p-send-cancel').style.display = 'none';
                
                this.completed = true;
                this.transferActive = false;
                document.getElementById('p2p-close').disabled = false;
                if (typeof Notify !== 'undefined') Notify.show('Project sent successfully!', 'fa-share');
                if (this.pc) { this.pc.close(); this.pc = null; }
                
            } catch (e) {
                if (this.transferAborted) return; // UI already handled in cancelTransfer()
                
                document.getElementById('p2p-send-notice').className = 'p2p-notice error';
                document.getElementById('p2p-send-notice').innerHTML = '❌ Error sending project.';
                document.getElementById('p2p-send-cancel').style.display = 'none';
                console.error(e);
            }
        },

        renderSendFileList() {
            const list = document.getElementById('p2p-send-file-list');
            list.innerHTML = this.sendFiles.map((f, i) => {
                let cls = '';
                if (i < this.sendCurrentFileIdx) cls = 'done';
                else if (i === this.sendCurrentFileIdx) cls = 'current';
                const status = i < this.sendCurrentFileIdx ? '✔️' : i === this.sendCurrentFileIdx ? '📤' : '⏳';
                return `<div class="p2p-file-item ${cls}"><span>${status} ${f.name}</span><span>${(f.size/1024).toFixed(0)} KB</span></div>`;
            }).join('');
        },

        /* ---------- RECEIVER ---------- */
        async handleAccept() {
            const offerStr = document.getElementById('p2p-recv-offer').value.trim();
            if (!offerStr) return;
            const btn = document.getElementById('p2p-accept');
            btn.disabled = true; 
            btn.innerHTML = '<span class="spin"></span> Decrypting...';

            let cleanStr = offerStr;
            if (cleanStr.startsWith('FORGE-P2P-')) {
                cleanStr = cleanStr.substring(10);
            }

            let payload;
            try {
                payload = JSON.parse(atou(cleanStr));
            } catch(e) {
                try { payload = JSON.parse(cleanStr); } catch(e2) {
                    document.getElementById('p2p-recv-notice').innerHTML = '❌ Invalid sharing code.';
                    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Retry';
                    return;
                }
            }

            const { offer, returnId, senderName } = payload;
            this.partnerName = senderName || 'Unknown Sender';
            this.identity = getRandomIdentity(RECEIVER_NAMES);

            try {
                const pc = new RTCPeerConnection(ICE_SERVERS);
                this.pc = pc;   
                pc.ondatachannel = (e) => {
                    this.dc = e.channel; this.dc.binaryType = 'arraybuffer';
                    this.dc.onmessage = (msg) => this.handleReceiverData(msg.data);
                };
                
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                for (const c of offer.candidates) await pc.addIceCandidate(new RTCIceCandidate(c));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                // LIVE UI TRACKING INJECTED HERE
                const answerPkg = await this.gatherWithTimeout(pc, btn);
                
                document.getElementById('p2p-response-section').style.display = 'block';
                
                // ALWAYS POPULATE MANUAL SECTION (BULLETPROOF FALLBACK)
                document.getElementById('p2p-recv-manual-section').style.display = 'block';
                document.getElementById('p2p-answer-text').value = JSON.stringify(answerPkg);

                if (returnId) {
                    try {
                        const putRes = await fetch(`https://twenty-json.lovable.app/p/${returnId}`, {
                            method: 'PUT',
                            cache: 'no-store', // CRITICAL FIX: Ensure the PUT doesn't hang in a cached loop
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ answer: answerPkg, receiverName: this.identity })
                        });
                        
                        if (putRes.ok) {
                            document.getElementById('p2p-recv-auto-status').style.display = 'block';
                            document.getElementById('p2p-recv-auto-status').className = 'p2p-notice info text-center p-4';
                            const spin = document.getElementById('p2p-recv-spin');
                            if (spin) spin.style.display = 'inline-block';
                            document.getElementById('p2p-recv-auto-text').innerHTML = `Response auto-sent! Waiting for <strong class="text-white">${this.partnerName}</strong> to connect...<br><span class="text-[9px] text-gray-400 font-mono block mt-1">Sent to: twenty-json.lovable.app/p/${returnId}</span>`;
                        } else {
                            throw new Error("PUT rejected");
                        }
                    } catch(e) {
                        document.getElementById('p2p-recv-auto-status').style.display = 'block';
                        document.getElementById('p2p-recv-auto-status').className = 'p2p-notice error text-center p-4';
                        const spin = document.getElementById('p2p-recv-spin');
                        if (spin) spin.style.display = 'none';
                        document.getElementById('p2p-recv-auto-text').innerHTML = `Auto-send failed. Please manually copy the code below.`;
                    }
                } else {
                    document.getElementById('p2p-recv-auto-status').style.display = 'block';
                    document.getElementById('p2p-recv-auto-status').className = 'p2p-notice warn text-center p-4';
                    const spin = document.getElementById('p2p-recv-spin');
                    if (spin) spin.style.display = 'none';
                    document.getElementById('p2p-recv-auto-text').innerHTML = `Manual mode active. Please copy the code below.`;
                }

                this.transferActive = true;
                document.getElementById('p2p-close').disabled = true;
            } catch (e) {
                document.getElementById('p2p-recv-notice').innerHTML = '❌ WebRTC Handshake Failed.';
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Retry';
                console.error(e);
            }
        },

        handleReceiverData(buffer) {
            const view = new DataView(buffer);
            const type = view.getUint8(0);
            const payload = buffer.slice(1);

            if (type === 0) {   
                const dec = new TextDecoder();
                const m = JSON.parse(dec.decode(payload));
                this.pendingManifest = m;
                this.targetBytes = m.totalBytes;
                this.receivedBytes = 0;
                this.receivedChunks = [];
                this.pendingUndo = null;  
                this.renderConfirmCard(m);
                document.getElementById('p2p-recv-notice').innerHTML = '';
            } else if (type === 1) {   
                if (!this.accepted) return;
                this.receivedBytes += payload.byteLength;
                this.receivedChunks.push(payload);
                const pct = Math.round((this.receivedBytes / this.targetBytes) * 100);
                document.getElementById('p2p-recv-progress').style.width = pct + '%';
                document.getElementById('p2p-recv-status').innerText = `Received ${(this.receivedBytes/1024).toFixed(0)} / ${(this.targetBytes/1024).toFixed(0)} KB`;
            } else if (type === 2) {   
                this.reconstructProject();
            } else if (type === 3) {   
                const dec = new TextDecoder();
                const jsonStr = dec.decode(payload);
                if (jsonStr.length > 0) {
                    try {
                        this.pendingUndo = JSON.parse(jsonStr);
                    } catch (e) {
                        this.pendingUndo = null; 
                    }
                }
            } else if (type === 12) {
                // Sender Cancelled
                document.getElementById('p2p-recv-notice').className = 'p2p-notice error';
                document.getElementById('p2p-recv-notice').innerHTML = '❌ Sender cancelled the transfer.';
                this.completed = true;
                this.transferActive = false;
                document.getElementById('p2p-close').disabled = false;
                if (typeof Notify !== 'undefined') Notify.show('Sender cancelled transfer', 'fa-ban');
                if (this.pc) this.pc.close();
            }
        },

        renderConfirmCard(m) {
            const card = document.getElementById('p2p-recv-confirm-card');
            card.style.display = 'block';
            const fileAssets = m.assets.filter(a => a.size > 0);
            const fileList = fileAssets.map(f => `<div class="p2p-file-item"><span>${f.name}</span><span>${(f.size/1024).toFixed(0)} KB</span></div>`).join('');
            
            // Hide the waiting UI now that the manifest arrived
            const autoStatus = document.getElementById('p2p-recv-auto-status');
            if (autoStatus) autoStatus.style.display = 'none';
            const manualSection = document.getElementById('p2p-recv-manual-section');
            if (manualSection) manualSection.style.display = 'none'; // Declutter UI

            card.innerHTML = `
                <h3>📥 Incoming Project</h3>
                <p><strong>${m.name}</strong> from <strong>${this.partnerName}</strong></p>
                <p>${(m.totalBytes/1024).toFixed(0)} KB total · ${fileAssets.length} files</p>
                ${m.hasUndo ? '<p style="color:#f59e0b;">⚠️ Includes perfect undo history</p>' : '<p style="color:#888;">No undo history</p>'}
                <div class="p2p-confirm-actions">
                    <button id="p2p-recv-confirm" class="p2p-btn"><i class="fa-solid fa-check"></i> Accept</button>
                    <button id="p2p-recv-decline" class="p2p-btn danger"><i class="fa-solid fa-xmark"></i> Decline</button>
                </div>
                <div class="p2p-file-list" style="margin-top:12px; text-align:left;">${fileList}</div>
            `;
            document.getElementById('p2p-recv-confirm').onclick = () => this.receiverConfirm();
            document.getElementById('p2p-recv-decline').onclick = () => this.receiverDecline();
        },

        receiverConfirm() {
            this.accepted = true;
            document.getElementById('p2p-recv-confirm-card').style.display = 'none';
            document.getElementById('p2p-recv-notice').className = 'p2p-notice info';
            document.getElementById('p2p-recv-notice').innerHTML = `Receiving "<strong>${this.pendingManifest.name}</strong>"…`;
            const ack = new Uint8Array(1); ack[0] = 10;
            this.dc.send(ack.buffer);
        },

        receiverDecline() {
            document.getElementById('p2p-recv-confirm-card').style.display = 'none';
            document.getElementById('p2p-recv-notice').className = 'p2p-notice error';
            document.getElementById('p2p-recv-notice').innerHTML = '❌ Transfer declined.';
            const dec = new Uint8Array(1); dec[0] = 11;
            this.dc.send(dec.buffer);
            this.completed = true;
            this.transferActive = false;
            document.getElementById('p2p-close').disabled = false;
        },

        async reconstructProject() {
            const m = this.pendingManifest;
            const newProjectId = 'proj_' + Date.now() + Math.random().toString(36).substr(2,5);
            const idMap = new Map();
            const statusEl = document.getElementById('p2p-recv-status');
            const noticeEl = document.getElementById('p2p-recv-notice');

            noticeEl.className = 'p2p-notice info';
            noticeEl.innerHTML = 'Saving project to database…';

            try {
                // Assemble raw file bytes
                const rawBytes = new Uint8Array(this.targetBytes);
                let offset = 0;
                for (const c of this.receivedChunks) {
                    rawBytes.set(new Uint8Array(c), offset);
                    offset += c.byteLength;
                }

                // Write assets
                let pos = 0;
                for (let i = 0; i < m.assets.length; i++) {
                    const meta = m.assets[i];
                    if (meta.size > 0) {
                        const fd = rawBytes.slice(pos, pos + meta.size);
                        const blob = new Blob([fd], { type: meta.type === 'video' ? 'video/mp4' : meta.type === 'image' ? 'image/jpeg' : 'audio/mpeg' });
                        const newId = 'asset_' + Date.now() + Math.random().toString(36).substr(2,5) + i;
                        idMap.set(meta.oldId, newId);
                        try {
                            await DB.put('assets', { id: newId, projectId: newProjectId, type: meta.type, name: meta.name, file: blob, duration: meta.duration, color: meta.color });
                        } catch (err) {
                            throw new Error(`Asset write failed for "${meta.name}": ${err.message}`);
                        }
                        pos += meta.size;
                    }
                }

                // Write project data
                const tracks = JSON.parse(JSON.stringify(m.tracks));
                for (const tid in tracks) {
                    tracks[tid] = tracks[tid].map(c => ({
                        ...c,
                        assetId: idMap.get(c.assetId) || c.assetId
                    }));
                }
                
                try {
                    await DB.put('projects', {
                        id: newProjectId, name: m.name + ' (received)',
                        tracks, trackConfig: m.trackConfig, lastModified: Date.now()
                    });
                } catch (err) {
                    throw new Error(`Project write failed: ${err.message}`);
                }

                // Write undo history if present
                let undoNote = 'No undo history.';
                if (this.pendingUndo) {
                    const remapState = (state) => {
                        if (state.tracks) {
                            for (let tid in state.tracks) {
                                state.tracks[tid].forEach(clip => {
                                    if (idMap.has(clip.assetId)) clip.assetId = idMap.get(clip.assetId);
                                });
                            }
                        }
                        if (state.assets) {
                            state.assets.forEach(a => {
                                if (idMap.has(a.id)) a.id = idMap.get(a.id);
                                a.projectId = newProjectId;
                            });
                        }
                    };

                    if (this.pendingUndo.past) this.pendingUndo.past.forEach(remapState);
                    if (this.pendingUndo.future) this.pendingUndo.future.forEach(remapState);

                    try {
                        await DB.put('system', {
                            id: 'history_' + newProjectId,
                            past: this.pendingUndo.past || [],
                            future: this.pendingUndo.future || []
                        });
                        undoNote = 'Undo history flawlessly synced.';
                    } catch (err) {
                        if (err.name === 'QuotaExceededError' || (err.message && err.message.toLowerCase().includes('quota'))) {
                            undoNote = 'Undo history skipped (Browser storage full).';
                        } else {
                            undoNote = `Undo history skipped (DB Error).`;
                        }
                        console.warn('Undo history write failed:', err);
                    }
                } else if (m.hasUndo) {
                    undoNote = 'Undo history was not received.';
                }

                noticeEl.className = 'p2p-notice success';
                noticeEl.innerHTML = `✅ "<strong>${m.name}</strong>" received!`;
                statusEl.innerText = `${undoNote} Find it in File → Open Project.`;
                this.completed = true;
                this.transferActive = false;
                document.getElementById('p2p-close').disabled = false;
                if (typeof Notify !== 'undefined') Notify.show(`Project "${m.name}" received!`, 'fa-download');
            } catch (e) {
                noticeEl.className = 'p2p-notice error';
                noticeEl.innerHTML = `❌ ${e.message || 'Reconstruction failed.'}`;
                statusEl.innerText = 'Please check the logs or try again.';
                console.error(e);
            } finally {
                if (this.pc) {
                    this.pc.close();
                    this.pc = null;
                }
            }
        }
    };

    window.P2P_SHARE = Engine;
    Engine.init();
})();
