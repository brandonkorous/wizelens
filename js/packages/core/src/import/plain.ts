// Whether pasted text is a plain list of emails, not a table: no header, no role cell, and not JSON.

const HEADER = /^\s*(email|e-mail|mail|address)\s*(,|\t|$)/im;
const ROLE_CELL = /(^|,|\t)\s*(viewer|member|admin|owner)\s*(,|\t|$)/im;

export const isPlainList = (text: string): boolean => !/^[[{]/.test(text.trim()) && !HEADER.test(text) && !ROLE_CELL.test(text);
