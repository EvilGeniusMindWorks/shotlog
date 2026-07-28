// TEMP: mint admin JWT + probe the powersync token endpoint + PowerSync endpoint reachability
import { readFileSync, writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

const scratch = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad';
const vars = JSON.parse(readFileSync(`${scratch}/rw-vars.json`, 'utf8'));
const token = jwt.sign(
  { sub: 'f0894fa6-1a84-48fa-b31f-628937f64677', cid: '00000000-0000-4000-8000-000000000001', role: 'admin' },
  vars.JWT_SECRET,
  { expiresIn: '2h' },
);
writeFileSync(`${scratch}/prod-token.txt`, token);

const res = await fetch('https://shotlogserver-production.up.railway.app/powersync/token', {
  headers: { Authorization: `Bearer ${token}` },
});
console.log('token endpoint:', res.status);
if (res.ok) {
  const { token: psToken, endpoint } = await res.json();
  const payload = JSON.parse(Buffer.from(psToken.split('.')[1], 'base64url').toString());
  console.log('ps endpoint:', endpoint, 'ttl:', payload.exp - payload.iat, 'aud:', payload.aud, 'kid header:', JSON.parse(Buffer.from(psToken.split('.')[0], 'base64url').toString()).kid);
  // Reachability of the PowerSync service itself
  try {
    const ps = await fetch(endpoint, { method: 'GET' });
    console.log('powersync endpoint GET:', ps.status);
  } catch (e) {
    console.log('powersync endpoint UNREACHABLE:', e.message);
  }
}
