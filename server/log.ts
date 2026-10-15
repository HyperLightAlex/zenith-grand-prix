/** One line per event, with the time: enough to follow a night of play in the terminal. */
export function log(...parts: unknown[]): void {
  if (process.env.QUIET === '1') return;
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}
