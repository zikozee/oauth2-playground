// Fetches the authorization server's JWKS and imports a key for signature verification.

const AUTH_SERVER = import.meta.env.VITE_AUTH_SERVER

let cachedKeys = null

export async function fetchJwks() {
  if (cachedKeys) return cachedKeys
  const res = await fetch(`${AUTH_SERVER}/oauth2/jwks`)
  if (!res.ok) throw new Error(`JWKS fetch failed (HTTP ${res.status})`)
  const json = await res.json()
  cachedKeys = json.keys || []
  return cachedKeys
}

// Imports a CryptoKey for the given kid so it can be used with crypto.subtle.verify.
export async function getPublicKey(kid) {
  const keys = await fetchJwks()
  const jwk = (kid && keys.find((k) => k.kid === kid)) || keys[0]
  if (!jwk) throw new Error('No matching key found in the JWKS response.')

  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported key type "${jwk.kty}" — only RSA (RS256) is supported here.`)
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return { key, kid: jwk.kid }
}
