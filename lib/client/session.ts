/** Shared storage access without importing account sync or payment code. */
export function getSession(): string | null {
  try {
    return localStorage.getItem("carreadi:session");
  } catch {
    return null;
  }
}
