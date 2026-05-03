/**
 * Strip paths, storage IDs, and long blobs from errors shown to users / stored in DB.
 * Never persist raw statement lines or file contents.
 */
export function redactErrorMessage(message: string): string {
  let out = message.replace(/\/[^\s]+/g, "[path]");
  out = out.replace(/\b(kd|kg)[\w_-]+\b/gi, "[id]");
  out = out.replace(/\b[0-9a-f]{32,}\b/gi, "[hash]");
  if (out.length > 280) {
    out = `${out.slice(0, 277)}...`;
  }
  return out;
}
