const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const crypto = require('crypto');
const readline = require('readline');

// Generate session ID
function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // IMPORTANT: false for pairing code
        browser: Browsers.ubuntu('Session Bot')
    });

    let myJid = null;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected!');
            myJid = sock.user.id;
            console.log('🤖 Bot Number:', myJid.split('@')[0]);
            
            // Auto-send session ID to yourself
            const sessionId = generateSessionId();
            console.log('🆔 Generated Session ID:', sessionId);
            
            await sock.sendMessage(myJid, { 
                text: `🎫 *Session ID Generated*\n\n🆔 *ID:* ${sessionId}\n📅 *Date:* ${new Date().toLocaleString()}\n\n✅ Bot is working!`
            });
            
            console.log('✅ Session ID sent to your WhatsApp!');
            
            // Keep bot online to receive commands
            console.log('\n📝 Commands available:');
            console.log('  /new - Create new session');
            console.log('  /send [number] - Send session to number');
            console.log('  /help - Show help\n');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out. Delete auth_info folder and restart.');
                process.exit(0);
            }
        }
    });

    // Request pairing code
    if (!sock.authState.creds.registered) {
        const phoneNumber = await askQuestion('📱 Enter your WhatsApp number (with country code, no +): ');
        
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log('\n🔑 YOUR PAIRING CODE:', code);
            console.log('📲 Go to WhatsApp → Settings → Linked Devices → Link with phone number');
            console.log('📝 Enter this code:', code);
            console.log('\n⏳ Waiting for you to enter the code in WhatsApp...\n');
        } catch (error) {
            console.error('❌ Error requesting pairing code:', error.message);
            process.exit(1);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';
        
        console.log(`📩 Message from ${sender.split('@')[0]}: ${text}`);
        
        // Commands
        const command = text.toLowerCase().trim();
        
        if (command === '/new') {
            const sessionId = generateSessionId();
            await sock.sendMessage(sender, { 
                text: `🎫 *New Session ID*\n\n🆔 ${sessionId}\n📅 ${new Date().toLocaleString()}`
            });
            console.log(`✅ Session ${sessionId} sent to ${sender.split('@')[0]}`);
        }
        
        else if (command.startsWith('/send ')) {
            const targetNumber = command.split(' ')[1].replace(/[^0-9]/g, '');
            const targetJid = targetNumber + '@s.whatsapp.net';
            const sessionId = generateSessionId();
            
            try {
                await sock.sendMessage(targetJid, { 
                    text: `🎫 *Session ID for You*\n\n🆔 ${sessionId}\n📅 ${new Date().toLocaleString()}\n📤 Sent by: ${sender.split('@')[0]}`
                });
                await sock.sendMessage(sender, { 
                    text: `✅ Session sent to ${targetNumber}!\n🆔 ${sessionId}`
                });
            } catch (error) {
                await sock.sendMessage(sender, { 
                    text: `❌ Failed to send: ${error.message}`
                });
            }
        }
        
        else if (command === '/help') {
            await sock.sendMessage(sender, { 
                text: `🤖 *Bot Commands*\n\n` +
                      `/new - Generate new session ID\n` +
                      `/send [number] - Send session to number\n` +
                      `/help - Show this menu`
            });
        }
        
        else {
            await sock.sendMessage(sender, { 
                text: `👋 Hello! Use */help* for commands.`
            });
        }
    });

    // Handle disconnection gracefully
    process.on('SIGINT', async () => {
        console.log('\n👋 Shutting down bot...');
        rl.close();
        process.exit(0);
    });
}

console.log('🤖 Starting WhatsApp Session Bot...\n');
startBot();
