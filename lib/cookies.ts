
function getCookieValueFromRequest(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  // Parse đơn giản "a=b; c=d"
  const pairs = header.split(';').map(s => s.trim()).filter(Boolean);
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const k = p.slice(0, eq);
    if (k === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return undefined;
}
``
