const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const crypto = require('crypto');
const cors = require('cors')

const app = express()
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store sessions
const sessions = {};
let sock = null;
let isConnected = false;

// Generate session ID
function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
}

// Initialize WhatsApp connection
async function connectWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Session Bot')
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR Code received. Check logs for QR URL.');
            }
            
            if (connection === 'open') {
                console.log('✅ WhatsApp Connected!');
                isConnected = true;
            }
            
            if (connection === 'close') {
                isConnected = false;
                console.log('❌ Disconnected');
            }
        });

        sock.ev.on('creds.update', saveCreds);
        
        console.log('WhatsApp connection initialized');
    } catch (error) {
        console.error('WhatsApp init error:', error);
    }
}

// Homepage
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Session Bot</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: linear-gradient(135deg, #075e54 0%, #128c7e 100%);
                font-family: 'Segoe UI', Roboto, sans-serif;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
            }
            .card {
                background: white;
                border-radius: 2rem;
                padding: 2rem;
                width: 100%;
                max-width: 500px;
                box-shadow: 0 30px 60px rgba(0,0,0,0.2);
            }
            .icon { font-size: 4rem; text-align: center; margin-bottom: 1rem; }
            h1 { font-size: 1.8rem; color: #075e54; text-align: center; margin-bottom: 0.5rem; }
            .subtitle { color: #667781; text-align: center; font-size: 0.9rem; margin-bottom: 1.5rem; }
            .status-badge {
                text-align: center;
                padding: 0.5rem;
                border-radius: 2rem;
                margin-bottom: 1.5rem;
                font-size: 0.9rem;
            }
            .status-badge.online { background: #dcf8c6; color: #075e54; }
            .status-badge.offline { background: #fee2e2; color: #dc2626; }
            
            .input-group { margin-bottom: 1.5rem; }
            label {
                display: block;
                font-size: 0.85rem;
                font-weight: 600;
                color: #075e54;
                margin-bottom: 0.5rem;
                text-transform: uppercase;
            }
            input {
                width: 100%;
                padding: 1rem;
                font-size: 1rem;
                border: 2px solid #e2e8f0;
                border-radius: 0.8rem;
                font-family: inherit;
                outline: none;
            }
            input:focus {
                border-color: #128c7e;
                box-shadow: 0 0 0 4px rgba(18,140,126,0.1);
            }
            .btn {
                width: 100%;
                padding: 1rem;
                background: #25d366;
                color: white;
                border: none;
                border-radius: 3rem;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                font-family: inherit;
                transition: 0.3s;
                margin-bottom: 0.5rem;
            }
            .btn:hover { background: #20bd5a; }
            .btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .btn-blue { background: #3b82f6; }
            .btn-blue:hover { background: #2563eb; }
            
            .result-box {
                background: #f0fdf4;
                border-radius: 1rem;
                padding: 1.2rem;
                margin-top: 1rem;
                display: none;
            }
            .result-box.show { display: block; }
            .session-id {
                font-family: monospace;
                font-size: 1.2rem;
                color: #075e54;
                font-weight: bold;
                word-break: break-all;
                margin: 0.5rem 0;
            }
            .copy-btn {
                background: #075e54;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                cursor: pointer;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">🤖</div>
            <h1>WhatsApp Session Bot</h1>
            <p class="subtitle">Generate Session IDs & Send via WhatsApp</p>
            
            <div class="status-badge offline" id="statusBadge">
                🔴 Bot Offline
            </div>
            
            <div class="input-group">
                <label>📱 WhatsApp Number</label>
                <input type="text" id="phoneInput" placeholder="254XXXXXXXXX">
            </div>
            
            <button class="btn" id="generateBtn" onclick="generateAndSend()">
                🎫 Generate & Send Session ID
            </button>
            
            <button class="btn btn-blue" id="checkBtn" onclick="checkStatus()">
                🔄 Check Bot Status
            </button>
            
            <div class="result-box" id="resultBox"></div>
        </div>
        
        <script>
            // Check status on load
            checkStatus();
            
            async function checkStatus() {
                try {
                    const response = await fetch('/status');
                    const data = await response.json();
                    
                    const badge = document.getElementById('statusBadge');
                    if (data.connected) {
                        badge.textContent = '🟢 Bot Online';
                        badge.className = 'status-badge online';
                    } else {
                        badge.textContent = '🔴 Bot Offline';
                        badge.className = 'status-badge offline';
                    }
                } catch (err) {
                    console.error('Status check failed:', err);
                }
            }
            
            async function generateAndSend() {
                const phone = document.getElementById('phoneInput').value.trim();
                
                if (!phone) {
                    alert('Please enter a WhatsApp number');
                    return;
                }
                
                const btn = document.getElementById('generateBtn');
                btn.disabled = true;
                btn.textContent = '⏳ Working...';
                
                try {
                    // First generate session ID
                    const genResponse = await fetch('/generate');
                    const genData = await genResponse.json();
                    
                    if (!genData.success) {
                        showResult('Error', 'Failed to generate session ID', false);
                        return;
                    }
                    
                    const sessionId = genData.sessionId;
                    
                    // Then send it
                    const sendResponse = await fetch('/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone, sessionId })
                    });
                    
                    const sendData = await sendResponse.json();
                    
                    if (sendData.success) {
                        showResult('✅ Success!', sessionId, true);
                        document.getElementById('phoneInput').value = '';
                    } else {
                        showResult('❌ Failed', sendData.error || 'Unknown error', false);
                    }
                    
                } catch (err) {
                    showResult('Error', err.message, false);
                } finally {
                    btn.disabled = false;
                    btn.textContent = '🎫 Generate & Send Session ID';
                }
            }
            
            function showResult(title, message, success) {
                const box = document.getElementById('resultBox');
                const color = success ? '#075e54' : '#dc2626';
                
                box.innerHTML = 
                    '<p style="font-weight:600;color:' + color + ';margin-bottom:0.5rem;">' + title + '</p>' +
                    '<div class="session-id">🆔 ' + message + '</div>' +
                    (success ? '<button class="copy-btn" onclick="copyId(\'' + message + '\')">📋 Copy</button>' : '');
                
                box.className = 'result-box show';
            }
            
            window.copyId = function(id) {
                navigator.clipboard.writeText(id).then(() => {
                    alert('Copied!');
                });
            };
        </script>
    </body>
    </html>
    `);
});

// Generate session ID
app.get('/generate', (req, res) => {
    const sessionId = generateSessionId();
    
    sessions[sessionId] = {
        id: sessionId,
        created: new Date().toISOString()
    };
    
    console.log('Generated session:', sessionId);
    res.json({ success: true, sessionId });
});

// Send session ID via WhatsApp
app.post('/send', async (req, res) => {
    const { phone, sessionId } = req.body;
    
    if (!phone || !sessionId) {
        return res.json({ success: false, error: 'Phone and sessionId required' });
    }
    
    // Try to connect if not connected
    if (!isConnected || !sock) {
        try {
            await connectWhatsApp();
            // Wait a bit for connection
            await new Promise(r => setTimeout(r, 3000));
        } catch (err) {
            return res.json({ success: false, error: 'Cannot connect to WhatsApp. Check server logs.' });
        }
    }
    
    if (!isConnected) {
        return res.json({ 
            success: false, 
            error: 'WhatsApp not connected. View QR at /qr endpoint and scan it.' 
        });
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const recipientJid = cleanPhone + '@s.whatsapp.net';
    
    try {
        await sock.sendMessage(recipientJid, { 
            text: `🎫 *Session ID*\n\n🆔 *ID:* ${sessionId}\n📅 *Date:* ${new Date().toLocaleString()}`
        });
        
        console.log(`✅ Sent session ${sessionId} to ${cleanPhone}`);
        
        res.json({ success: true, phone: cleanPhone, sessionId });
    } catch (error) {
        console.error('Send error:', error);
        res.json({ success: false, error: error.message });
    }
});

// Bot status
app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

// QR code endpoint (for initial setup)
app.get('/qr', (req, res) => {
    res.send(`
    <html>
    <head>
        <title>WhatsApp QR Setup</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; text-align: center; padding: 2rem; background: #075e54; color: white; }
            .card { background: white; color: #075e54; padding: 2rem; border-radius: 2rem; max-width: 500px; margin: 2rem auto; }
            .btn { background: #25d366; color: white; padding: 1rem 2rem; border: none; border-radius: 3rem; font-size: 1.1rem; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 1rem; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>📱 Scan QR Code</h1>
            <p>Check your Render logs for the QR code.</p>
            <p>Scan it with WhatsApp to connect the bot.</p>
            <a href="/" class="btn">← Back to Home</a>
        </div>
    </body>
    </html>
    `);
});

// Start server
const PORT = process.env.PORT || 3230;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT}`);
    
    // Connect WhatsApp on startup
    connectWhatsApp();
});
