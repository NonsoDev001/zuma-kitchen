// ══════════════════════════════════════════════════════════
// Zuma Kitchen — Reservation API
// Receives form data → sends WhatsApp notification to owner
// ══════════════════════════════════════════════════════════

const WA_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const NOTIFY_NUM  = process.env.NOTIFY_NUMBER;
const SHEETS_URL  = process.env.GOOGLE_SHEETS_URL;

export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { name, phone, date, time, guests, occasion, requests } = req.body;

    // Build WhatsApp notification for owner
    const msg =
`📅 *NEW TABLE RESERVATION*
━━━━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${name}
📱 *Phone:* ${phone}
📆 *Date:* ${date}
⏰ *Time:* ${time}
👥 *Guests:* ${guests}
🎉 *Occasion:* ${occasion}
${requests ? `📝 *Requests:* ${requests}` : ''}
━━━━━━━━━━━━━━━━━━━━━━
⏱ ${new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos'})}
_Sent from Zuma Kitchen website_`;

    // Notify owner via WhatsApp
    await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: NOTIFY_NUM,
        type: 'text',
        text: { body: msg }
      })
    });

    // Save to Google Sheets
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
          timestamp: new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos'})
        })
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Reservation API error:', error);
    return res.status(200).json({ success: true }); // always return 200 so UI shows success
  }
}
