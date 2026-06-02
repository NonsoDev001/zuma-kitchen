// ══════════════════════════════════════════════════════════
// Zuma Kitchen — Reservation API
// 1. Notifies owner via WhatsApp
// 2. Sends confirmation to customer via WhatsApp
// 3. Saves to Google Sheets
// ══════════════════════════════════════════════════════════

const WA_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const NOTIFY_NUM  = process.env.NOTIFY_NUMBER;
const SHEETS_URL  = process.env.GOOGLE_SHEETS_URL;

async function sendWhatsApp(to, message) {
  // Format number — remove leading 0, add 234 country code if needed
  let num = to.replace(/\D/g, '');
  if (num.startsWith('0')) num = '234' + num.slice(1);
  if (!num.startsWith('234') && num.length === 10) num = '234' + num;

  const res = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: num,
      type: 'text',
      text: { body: message }
    })
  });
  const data = await res.json();
  if (!res.ok) console.error('WA send error:', JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { name, phone, date, time, guests, occasion, requests } = req.body;
    const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

    // ── 1. NOTIFY OWNER ──
    const ownerMsg =
`📅 *NEW TABLE RESERVATION*
━━━━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${name}
📱 *Phone:* ${phone}
📆 *Date:* ${date}
⏰ *Time:* ${time}
👥 *Guests:* ${guests}
🎉 *Occasion:* ${occasion}${requests ? `\n📝 *Requests:* ${requests}` : ''}
━━━━━━━━━━━━━━━━━━━━━━
⏱ ${timestamp}
_Sent from Zuma Kitchen website_

Please call the customer to confirm.`;

    await sendWhatsApp(NOTIFY_NUM, ownerMsg);

    // ── 2. CONFIRM TO CUSTOMER ──
    const customerMsg =
`Hi ${name}! 👋

Your table reservation at *Zuma Kitchen* has been received! 🍽️

📆 *Date:* ${date}
⏰ *Time:* ${time}
👥 *Guests:* ${guests}
🎉 *Occasion:* ${occasion}${requests ? `\n📝 *Special Requests:* ${requests}` : ''}

Our team will call you shortly to confirm your booking. 

If you need to make changes, reply to this message or call us on +234 905 216 4876.

See you soon! 😊
_— Zuma Kitchen Team_`;

    await sendWhatsApp(phone, customerMsg);

    // ── 3. SAVE TO GOOGLE SHEETS ──
    if (SHEETS_URL) {
      await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          service: 'Table Reservation',
          name: name,
          order_details: `${occasion} · ${guests} · ${date} at ${time}`,
          address: 'Dine-in',
          timestamp: timestamp
        })
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Reservation API error:', error);
    return res.status(200).json({ success: true });
  }
}
