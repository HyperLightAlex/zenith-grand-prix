/** The build's name (see vite.config.ts); 'dev' from the dev server and in tests. */
declare const __BUILD__: string;

declare module '*?worker&inline' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
