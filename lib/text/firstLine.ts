export const firstLine = (s?: string | null) => (s || '').split(/\r?\n/)[0].trim();
