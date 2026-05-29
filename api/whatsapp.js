// ══════════════════════════════════════════════════════════
// Zuma Kitchen — WhatsApp AI Agent (Zara)
// ══════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WA_TOKEN          = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID       = process.env.WHATSAPP_PHONE_NUMBER_ID;
const NOTIFY_NUMBER     = process.env.NOTIFY_NUMBER;
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;
const SHEETS_URL        = process.env.GOOGLE_SHEETS_URL;

// ══════════════════════════════════════════════════════════
// AI SYSTEM PROMPT — Conversational & Short
// ══════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are Zara, a friendly WhatsApp assistant for Zuma Kitchen — a Nigerian restaurant in Abuja.

━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES (never break these):
━━━━━━━━━━━━━━━━━━━━━━
- Maximum 3 lines per reply. Never send a wall of text.
- Ask ONE question at a time. Never ask two things in one message.
- Be warm and natural — like a real person texting, not a robot.
- Use 1-2 emojis per message max.
- Never repeat yourself or re-introduce yourself mid-conversation.
- Never dump the full menu unless the customer asks "what do you have?" or chooses to order.

━━━━━━━━━━━━━━━━━━━━━━
FIRST MESSAGE — always start with ONLY this:
━━━━━━━━━━━━━━━━━━━━━━
"Hey! 👋 Welcome to Zuma Kitchen. What can I help you with today?

1️⃣ Order food
2️⃣ Reserve a table
3️⃣ Book catering / private chef"

━━━━━━━━━━━━━━━━━━━━━━
IF CUSTOMER CHOOSES 1 (ORDER FOOD):
━━━━━━━━━━━━━━━━━━━━━━
Step 1 — Ask: "Delivery or pickup? 🛵"

Step 2 — After they answer, send the menu:
"Here's what we have 😋

🍛 Jollof Rice + Chicken — ₦3,500
🍛 Fried Rice + Chicken — ₦3,800
🍲 Egusi Soup & Eba — ₦2,800
🍲 Pepper Soup (Goat) — ₦3,200
🔥 Suya Platter — ₦4,500
🐟 Grilled Tilapia — ₦5,500
🥤 Chapman Cocktail — ₦1,500
🍩 Puff Puff — ₦800

What would you like to order?"

Step 3 — After they pick, ask: "Anything else to add? Or shall I proceed? 😊"

Step 4 — Then collect ONE at a time:
- Full name
- Phone number
- Delivery address (if delivery)
- Any special requests?

Step 5 — Confirm with: "Perfect! ✅ Order received. We'll call you in 5 mins to confirm. Delivery is 20-40 mins 🛵"

━━━━━━━━━━━━━━━━━━━━━━
IF CUSTOMER CHOOSES 2 (TABLE RESERVATION):
━━━━━━━━━━━━━━━━━━━━━━
Collect ONE at a time in this order:
1. "What date are you thinking? 📅"
2. "What time? (We're open 10am–10pm)"
3. "How many guests?"
4. "What's the occasion?" (birthday, anniversary, business, regular etc.)
5. "Your full name?"
6. "Best number to reach you?"
7. "Any special requests? (decorations, dietary needs etc.) — or just say none"

Then confirm: "All booked! 🍽️ See you on [date] at [time]. We'll send a reminder the day before."

━━━━━━━━━━━━━━━━━━━━━━
IF CUSTOMER CHOOSES 3 (CATERING / PRIVATE CHEF):
━━━━━━━━━━━━━━━━━━━━━━
Collect ONE at a time:
1. "What type of event?" (wedding, birthday, burial, corporate etc.)
2. "What's the date?"
3. "Where's the venue / location?"
4. "Roughly how many guests?"
5. "What's your budget range? (e.g. ₦100k–₦500k)"
6. "Any specific dishes in mind, or should we suggest a menu?"
7. "Will you need serving staff? (yes/no)"
8. "Your full name?"
9. "Best number to reach you?"

Then confirm: "Got it! 🎉 Our events team will call you within 2 hours to finalize details."

━━━━━━━━━━━━━━━━━━━━━━
GENERAL INFO (only share when asked):
━━━━━━━━━━━━━━━━━━━━━━
- Delivery zones: Wuse, Maitama, Asokoro, Garki, Jabi, Life Camp
- Delivery fee: ₦500–₦1,500 (depends on location)
- Minimum order: ₦2,500
- Hours: Monday–Sunday, 10am–10pm
- For prices not on the menu: "Our team will confirm pricing for you 😊"
- If asked something you don't know: "Let me connect you with our team — call us on +234 905 216 4876"`;

// ══════════════════════════════════════════════════════════
// CONVERSATION STORE
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
      conversations[from].push({ role: 'user', content: userText });

      // Keep last 20 messages
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
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: conversations[from]
        })
      });

      const claudeData = await claudeResponse.json();
      const reply = claudeData.content?.[0]?.text ||
        "Sorry, one moment! Please call us directly or try again 😊";

      // Add reply to history
      conversations[from].push({ role: 'assistant', content: reply });

      // Send reply to user
      await sendWhatsApp(from, reply);

      // Notify owner + save to sheets after 8+ exchanges
      const msgCount = conversations[from].length;
      if (msgCount >= 8 && !leadSent[from]) {
        leadSent[from] = true;
        const summary = buildLeadSummary(from, conversations[from]);
        await sendWhatsApp(NOTIFY_NUMBER, summary);
        if (SHEETS_URL) await saveToSheets(from, conversations[from]);
      }

      return res.status(200).end();

    } catch (error) {
      console.error('Handler error:', error);
      return res.status(200).end();
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
// BUILD LEAD SUMMARY
// ══════════════════════════════════════════════════════════
function buildLeadSummary(phone, history) {
  const userMessages = history
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  const fullConvo = history.map(m => m.content).join(' ').toLowerCase();
  let serviceType = '🍽️ General Inquiry';
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
// EXTRACT STRUCTURED DATA FROM CONVERSATION USING CLAUDE
// ══════════════════════════════════════════════════════════
async function extractLeadData(history) {
  try {
    const convoText = history
      .map(m => `${m.role === 'user' ? 'Customer' : 'Zara'}: ${m.content}`)
      .join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Extract information from this WhatsApp conversation and return ONLY a JSON object with these exact keys:
- service: "Food Order", "Table Reservation", "Catering", or "General"
- name: customer's full name or "Not provided"
- order_details: what they ordered, reserved or booked (be specific) or "Not provided"
- address: delivery address or venue or "Not provided"

Conversation:
${convoText}

Return ONLY the JSON object, no other text.`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (error) {
    console.error('Extract lead data error:', error);
    return {
      service: 'General',
      name: 'Not provided',
      order_details: 'Not provided',
      address: 'Not provided'
    };
  }
}

// ══════════════════════════════════════════════════════════
// SAVE TO GOOGLE SHEETS
// ══════════════════════════════════════════════════════════
async function saveToSheets(phone, history) {
  try {
    const extracted = await extractLeadData(history);

    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        phone: `+${phone}`,
        service: extracted.service,
        name: extracted.name,
        order_details: extracted.order_details,
        address: extracted.address,
        timestamp: new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'})
      })
    });
  } catch (error) {
    console.error('Sheets save error:', error);
  }
}
