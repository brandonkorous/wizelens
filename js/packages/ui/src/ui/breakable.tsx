/** A code name that may break after / . ? & =, between camelCase parts, and at spaces; never inside a word part. */
export const breakable = (name: string) => name.split(/(?<=[/.?&=])|(?<=[a-z])(?=[A-Z])/).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>);
