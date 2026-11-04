// GET /api/push-key → the public key the phone needs to sign up for notifications
export default function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.status(publicKey ? 200 : 503).json({ publicKey, ready: Boolean(publicKey) });
}
