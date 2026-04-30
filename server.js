const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const crypto = require('crypto');

const app = express();

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
                padding: 2.5rem;
                width: 100%;
                max-width: 500px;
                box-shadow: 0 30px 60px rgba(0,0,0,0.2);
            }
            .icon { font-size: 4rem; text-align: center; margin-bottom: 1rem; }
            h1 { font-size: 1.8rem; color: #075e54; text-align: center; margin-bottom: 0.5rem; }
            .subtitle { color: #667781; text-align: center; font-size: 0.9rem; margin-bottom: 2rem; }
            
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
            
            .result-box {
                background: #dcf8c6;
                border-radius: 1rem;
                padding: 1.2rem;
                margin-top: 1.5rem;
                display: none;
            }
            .result-box.show { display: block; }
            .session-id {
                font-family: monospace;
                font-size: 1.2rem;
                color: #075e54;
                font-weight: bold;
                word-break: break-all;
            }
            .status {
                margin-top: 1rem;
                padding: 0.8rem;
                border-radius: 0.5rem;
            }
            .status.success {
                background: #dcf8c6;
                color: #075e54;
            }
            .status.error {
                background: #fee2e2;
                color: #dc2626;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">🤖</div>
            <h1>WhatsApp Session Bot</h1>
            <p class="subtitle">Generate & Send Session IDs via WhatsApp</p>
            
            <div class="input-group">
                <label>📱 Your WhatsApp Number</label>
                <input type="text" id="phoneInput" placeholder="254XXXXXXXXX">
            </div>
            
            <button class="btn" id="generateBtn" onclick="generateSession()">
                🎫 Generate Session ID
            </button>
            
            <button class="btn" id="sendBtn" onclick="sendSession()" style="background: #128c7e;">
                📤 Send to WhatsApp
            </button>
            
            <div id="resultBox"></div>
        </div>
        
        <script>
            let currentSessionId = null;
            
            async function generateSession() {
                try {
                    const response = await fetch('/generate');
                    const data = await response.json();
                    
                    if (data.success) {
                        currentSessionId = data.sessionId;
                        showResult(
                            '✅ Session Generated!',
                            '🆔 ' + data.sessionId,
                            'success'
                        );
                    }
                } catch (err) {
                    showResult('Error', err.message, 'error');
                }
            }
            
            async function sendSession() {
                const phone = document.getElementById('phoneInput').value.trim();
                
                if (!phone) {
                    alert('Enter your WhatsApp number first');
                    return;
                }
                
                if (!currentSessionId) {
                    await generateSession();
                }
                
                const btn = document.getElementById('sendBtn');
                btn.disabled = true;
                btn.textContent = '⏳ Sending...';
                
                try {
                    const response = await fetch('/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            phone: phone, 
                            sessionId: currentSessionId 
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showResult(
                            '✅ Session Sent!',
                            '📱 To: ' + phone + '\n🆔 ' + currentSessionId,
                            'success'
                        );
                        document.getElementById('phoneInput').value = '';
                    } else {
                        showResult('❌ Failed', data.error, 'error');
                    }
                } catch (err) {
                    showResult('Error', err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '📤 Send to WhatsApp';
                }
            }
            
            function showResult(title, message, type) {
                const html = 
                    '<p style="font-weight:600;margin-bottom:0.5rem;">' + title + '</p>' +
                    '<div class="session-id">' + message.replace(/\n/g, '<br>') + '</div>';
                
                document.getElementById('resultBox').innerHTML = html;
                document.getElementById('resultBox').style.display = 'block';
            }
        </script>
    </body>
    </html>
    `);
});

// API: Generate session ID
app.get('/generate', (req, res) => {
    const sessionId = generateSessionId();
    
    sessions[sessionId] = {
        id: sessionId,
        created: new Date().toISOString()
    };
    
    res.json({ success: true, sessionId });
});

// API: Send session ID to WhatsApp
app.post('/send', async (req, res) => {
    const { phone, sessionId } = req.body;
    
    if (!phone || !sessionId) {
        return res.status(400).json({ error: 'Phone and sessionId required' });
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const recipientJid = cleanPhone + '@s.whatsapp.net';
    
    try {
        if (!sock || !isConnected) {
            return res.json({ 
                success: false, 
                error: 'WhatsApp not connected. Start the bot first at /start' 
            });
        }
        
        await sock.sendMessage(recipientJid, { 
            text: `🎫 *Session ID*\n\n🆔 *ID:* ${sessionId}\n📅 *Date:* ${new Date().toLocaleString()}\n\n✅ Generated by your bot`
        });
        
        console.log(`✅ Session ${sessionId} sent to ${cleanPhone}`);
        
        res.json({ 
            success: true, 
            phone: cleanPhone, 
            sessionId 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API: Start WhatsApp connection
app.get('/start', async (req, res) => {
    if (isConnected) {
        return res.json({ success: true, message: 'Already connected' });
    }
    
    res.json({ 
        success: true, 
        message: 'Starting WhatsApp connection. Check terminal for pairing code.' 
    });
});

// API: Bot status
app.get('/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        botJid: sock?.user?.id?.split('@')[0] || null
    });
});

// Initialize WhatsApp
async function initWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Session Bot')
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            isConnected = true;
            console.log('🤖 Bot Number:', sock.user.id.split('@')[0]);
        }
        
        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                initWhatsApp();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Start Express server
const PORT = process.env.PORT || 3230;
app.listen(PORT, () => {
    console.log(`🚀 Express server running on port ${PORT}`);
    console.log(`🌐 Visit http://localhost:${PORT}`);
    initWhatsApp();
});

app.listen(4097, ()=>{console.log('web running :200')})
