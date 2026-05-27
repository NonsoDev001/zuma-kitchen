// ══════════════════════════════════════════════════════════
// Zuma Kitchen — WhatsApp AI Agent
// Handles: Food Orders, Table Reservations, Outdoor Catering
// Deploy: Add to /api/whatsapp.js in your Vercel project
// ══════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WA_TOKEN          = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID       = process.env.WHATSAPP_PHONE_NUMBER_ID;
const NOTIFY_NUMBER     = process.env.NOTIFY_NUMBER; // Restaurant owner's number
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;
const SHEETS_URL        = process.env.GOOGLE_SHEETS_URL;

// ══════════════════════════════════════════════════════════
// AI SYSTEM PROMPT
// ══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are Zara, a friendly and professional AI assistant for Zuma Kitchen — 
an authentic Nigerian restaurant in Abuja that serves amazing food and offers catering services.

You help customers with THREE services. Start EVERY conversation with this welcome:
"Welcome to Zuma Kitchen! 🍽️ I'm Zara, your personal food assistant. How can I help you today?

Please reply with a number:
1️⃣ Place a food order (delivery or pickup)
2️⃣ Reserve a table
3️⃣ Book outdoor catering / private chef"

──────────────────────────────
SERVICE 1: FOOD ORDER
──────────────────────────────
When customer chooses ordering, share this menu and take their order:

🍛 NIGERIAN MAINS
• Jollof Rice + Chicken — ₦3,500
• Fried Rice + Chicken — ₦3,800
• Egusi Soup & Eba — ₦2,800
• Pepper Soup (Goat) — ₦3,200

🔥 GRILLS
• Suya Platter — ₦4,500
• Grilled Tilapia — ₦5,500

🥤 DRINKS & DESSERTS
• Chapman Cocktail — ₦1,500
• Puff Puff — ₦800

After they order, collect:
1. Delivery or pickup?
2. If delivery — full address
3. Full name
4. Phone number
5. Any special requests?

Then confirm: "Perfect! Your order has been received. We'll call you within 5 minutes to confirm. Delivery is 20-40 minutes. 🛵"

──────────────────────────────
SERVICE 2: TABLE RESERVATION
──────────────────────────────
Collect these ONE AT A TIME:
1. Date of reservation
2. Time (we open 10am–10pm)
3. Number of guests
4. Occasion (birthday, anniversary, business, regular dining etc.)
5. Full name
6. Phone number
7. Any special requests? (decorations, dietary needs etc.)

Then confirm: "Your table reservation is confirmed! 🍽️ We'll send a reminder the day before. See you soon at Zuma Kitchen!"

──────────────────────────────
SERVICE 3: OUTDOOR CATERING
──────────────────────────────
Collect these ONE AT A TIME:
1. Type of event (wedding, birthday, burial, corporate, house party etc.)
2. Date of event
3. Location / venue
4. Estimated number of guests
5. Budget range (e.g. ₦100k–₦200k, ₦500k+)
6. Preferred dishes / menu (or ask us to suggest)
7. Do you need serving staff? (yes/no)
8. Full name
9. Phone number

Then say: "Excellent! 🎉 We've received your catering request. Our events team will call you within 2 hours to discuss menu options, pricing and logistics. Thank you for choosing Zuma Kitchen!"

──────────────────────────────
GENERAL RULES
──────────────────────────────
- Keep responses SHORT — max 3 sentences per message
- Be warm, friendly and professional
- Use emojis to make it fun 🍽️🎉
- If asked about prices not on the menu, say "Our team will confirm pricing for you"
- If asked about delivery zones: Wuse, Maitama, Asokoro, Garki, Jabi, Life Camp
- Minimum delivery order: ₦2,500
- Delivery fee: ₦500–₦1,500 depending on location
- Operating hours: Monday–Sunday, 10am–10pm
- Never make up information you don't know`;

// ══════════════════════════════════════════════════════════
// CONVERSATION STORE (use Supabase/Redis in production)
// ══════════════════════════════════════════════════════════
const conversations = {};
const leadSent = {};

// ══════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════
export default async function handler(req, res) {

  // Webhook verification
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified ✅');
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // Handle incoming messages
  if (req.method === 'POST') {
    try {
      const body    = req.body;
      const entry   = body?.entry?.[0];
      const change  = entry?.changes?.[0];
      const value   = change?.value;
      const message = value?.messages?.[0];

      if (!message || message.type !== 'text') {
        return res.status(200).end();
      }

      const from     = message.from;
      const userText = message.text.body?.trim();
      if (!userText) return res.status(200).end();

      // Init conversation
      if (!conversations[from]) {
        conversations[from] = [];
      }

      // Add user message
      conversations[from].push({
        role: 'user',
        content: userText
      });

      // Keep last 20 messages to avoid token limits
      if (conversations[from].length > 20) {
        conversations[from] = conversations[from].slice(-20);
      }

      // Call Claude AI
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: conversations[from]
        })
      });

      const claudeData = await claudeResponse.json();
      const reply = claudeData.content?.[0]?.text ||
        "Sorry, I'm having a moment! Please call us directly or try again. 😊";

      // Add assistant reply to history
      conversations[from].push({
        role: 'assistant',
        content: reply
      });

      // Send reply to user
      await sendWhatsApp(from, reply);

      // Check if lead is complete (after 8+ exchanges)
      // and we haven't sent a notification yet
      const msgCount = conversations[from].length;
      if (msgCount >= 8 && !leadSent[from]) {
        leadSent[from] = true;

        // Build lead summary from conversation
        const summary = buildLeadSummary(from, conversations[from]);

        // Notify restaurant owner
        await sendWhatsApp(NOTIFY_NUMBER, summary);

        // Save to Google Sheets
        if (SHEETS_URL) {
          await saveToSheets(from, conversations[from], summary);
        }
      }

      return res.status(200).end();

    } catch (error) {
      console.error('Handler error:', error);
      return res.status(200).end(); // Always return 200 to WhatsApp
    }
  }

  return res.status(405).end();
}

// ══════════════════════════════════════════════════════════
// SEND WHATSAPP MESSAGE
// ══════════════════════════════════════════════════════════
async function sendWhatsApp(to, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text }
        })
      }
    );
    const data = await response.json();
    if (!response.ok) console.error('WhatsApp send error:', data);
  } catch (error) {
    console.error('sendWhatsApp error:', error);
  }
}

// ══════════════════════════════════════════════════════════
// BUILD LEAD SUMMARY FOR RESTAURANT OWNER
// ══════════════════════════════════════════════════════════
function buildLeadSummary(phone, history) {
  const userMessages = history
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  // Detect service type from conversation
  let serviceType = '🍽️ General Inquiry';
  const fullConvo = history.map(m => m.content).join(' ').toLowerCase();
  if (fullConvo.includes('order') || fullConvo.includes('delivery') || fullConvo.includes('jollof') || fullConvo.includes('suya')) {
    serviceType = '🛵 Food Order';
  } else if (fullConvo.includes('table') || fullConvo.includes('reservation') || fullConvo.includes('reserve')) {
    serviceType = '📅 Table Reservation';
  } else if (fullConvo.includes('catering') || fullConvo.includes('event') || fullConvo.includes('wedding') || fullConvo.includes('birthday')) {
    serviceType = '🎉 Outdoor Catering / Event';
  }

  return `🍽️ *NEW ZUMA KITCHEN LEAD*
━━━━━━━━━━━━━━━━━━━━━━
📱 Phone: +${phone}
📋 Service: ${serviceType}
⏰ Time: ${new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'})}
━━━━━━━━━━━━━━━━━━━━━━
💬 *Customer Messages:*
${userMessages}
━━━━━━━━━━━━━━━━━━━━━━
_Sent by Zuma Kitchen AI Agent (Zara)_`;
}

// ══════════════════════════════════════════════════════════
// SAVE LEAD TO GOOGLE SHEETS
// ══════════════════════════════════════════════════════════
async function saveToSheets(phone, history, summary) {
  try {
    const userMessages = history
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join(' | ');

    const fullConvo = history.map(m => m.content).join(' ').toLowerCase();
    let serviceType = 'General';
    if (fullConvo.includes('order') || fullConvo.includes('delivery')) serviceType = 'Food Order';
    else if (fullConvo.includes('table') || fullConvo.includes('reservation')) serviceType = 'Table Reservation';
    else if (fullConvo.includes('catering') || fullConvo.includes('event')) serviceType = 'Catering';

    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        phone: `+${phone}`,
        service: serviceType,
        messages: userMessages,
        timestamp: new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'}),
        source: 'WhatsApp AI Agent'
      })
    });
  } catch (error) {
    console.error('Sheets save error:', error);
  }
}
