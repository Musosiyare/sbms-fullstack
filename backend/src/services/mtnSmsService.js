/**
 * MTN Rwanda SMS integration.
 *
 * MTN's developer platform (https://developers.mtn.com) exposes its
 * Messaging/SMS products (SMS v2 / SMS v3) behind a standard OAuth2
 * client-credentials flow: you register an app on the portal, get a
 * consumer key + secret, exchange those for a short-lived access token,
 * then call the SMS endpoint with that token.
 *
 * IMPORTANT — you still need to fill in / confirm from YOUR app's page
 * on developers.mtn.com:
 *   1. MTN_SMS_TOKEN_URL   — the OAuth2 token endpoint for your app
 *   2. MTN_SMS_SEND_URL    — the actual "send SMS" endpoint
 *   3. MTN_SMS_SUBSCRIPTION_KEY — some MTN products need this as an
 *      "Ocp-Apim-Subscription-Key" header on top of the bearer token
 *   4. The exact JSON body shape expected by MTN_SMS_SEND_URL — the one
 *      below (senderAddress/receiverAddress/message) matches MTN's
 *      published messaging-API pattern, but confirm it against your
 *      sandbox app's docs/Postman collection before going live, and
 *      adjust buildSendPayload() below if it differs.
 *
 * Everything else (token caching, phone formatting, retries) is done
 * generically so you only ever need to touch buildSendPayload() /
 * parseSendResponse() if MTN's exact contract differs from this.
 */

const REQUIRED_ENV = ["MTN_SMS_TOKEN_URL", "MTN_SMS_SEND_URL", "MTN_SMS_CONSUMER_KEY", "MTN_SMS_CONSUMER_SECRET"];

function assertConfigured() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`MTN SMS is not configured — missing env vars: ${missing.join(", ")}`);
  }
}

// --- OAuth2 token caching -------------------------------------------------
// Cached in-process; a new instance/deploy just fetches a fresh one.
let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.value;
  }

  const res = await fetch(process.env.MTN_SMS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.MTN_SMS_CONSUMER_KEY,
      client_secret: process.env.MTN_SMS_CONSUMER_SECRET,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`MTN token request failed (${res.status}): ${JSON.stringify(data)}`);
  }

  const expiresInSeconds = Number(data.expires_in) || 3600;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return cachedToken.value;
}

// --- Phone number normalization ------------------------------------------
/**
 * Guardian phones in the students table may be entered as "07XXXXXXXX",
 * "+2507XXXXXXXX", "2507XXXXXXXX", or with stray spaces/dashes. MTN's API
 * expects a clean international-format number. Rwanda country code: 250.
 * Returns null if the number doesn't look like a valid Rwandan mobile
 * number, so callers can skip/flag it instead of sending to garbage.
 */
function normalizeRwandaPhone(rawPhone) {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/[^\d]/g, "");

  if (digits.startsWith("250")) {
    // already has country code
  } else if (digits.startsWith("0")) {
    digits = "250" + digits.slice(1);
  } else if (digits.length === 9) {
    // e.g. "78XXXXXXX" with no leading 0
    digits = "250" + digits;
  } else {
    return null;
  }

  // Rwandan mobile numbers are 2 (country) + 9 digits = 12 digits total.
  if (digits.length !== 12) return null;
  return digits;
}

// --- Send ------------------------------------------------------------------
function buildSendPayload(toPhone, message) {
  const senderAddress = process.env.MTN_SMS_SENDER_ID || "SBMS";
  // Adjust this shape if your MTN app's docs specify something different.
  return {
    senderAddress,
    receiverAddress: [toPhone],
    message,
    clientCorrelatorId: `sbms-${Date.now()}`,
  };
}

async function sendSms(rawPhone, message) {
  const phone = normalizeRwandaPhone(rawPhone);
  if (!phone) {
    return { ok: false, skipped: true, reason: "invalid_or_missing_phone" };
  }

  assertConfigured();
  const token = await getAccessToken();

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (process.env.MTN_SMS_SUBSCRIPTION_KEY) {
    headers["Ocp-Apim-Subscription-Key"] = process.env.MTN_SMS_SUBSCRIPTION_KEY;
  }

  const res = await fetch(process.env.MTN_SMS_SEND_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(buildSendPayload(phone, message)),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, phone, response: bodyText, status: res.status };
  }
  return { ok: true, phone, response: bodyText };
}

module.exports = { sendSms, normalizeRwandaPhone, getAccessToken };
