// Keeps email addresses out of function logs: "mika47@burner.privaseer.co.uk" -> "mi***@burner.privaseer.co.uk"
export function maskEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  const match = value.match(/<([^>]+)>/);
  const address = (match ? match[1] : value).trim();
  const at = address.lastIndexOf('@');

  if (at <= 0) {
    return '***';
  }

  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);

  return `${visible}***@${domain}`;
}
