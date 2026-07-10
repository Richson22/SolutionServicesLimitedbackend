// server/utils/paystack.js
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

async function verifyTransaction(reference) {
  if (!reference) {
    return { success: false, status: 'no_reference', amountKobo: 0, currency: null, email: null, raw: null };
  }

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.status) {
    return { success: false, status: 'verify_request_failed', amountKobo: 0, currency: null, email: null, raw: body };
  }

  const data = body.data;
  const isSuccessful = data?.status === 'success';

  return {
    success: isSuccessful,
    status: data?.status || 'unknown',
    amountKobo: data?.amount || 0,
    currency: data?.currency || 'NGN',
    email: data?.customer?.email || null,
    raw: data,
  };
}

module.exports = { verifyTransaction };