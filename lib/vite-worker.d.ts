declare module '*?worker' {
  const WorkerFactory: { new (options?: WorkerOptions): Worker };
  export default WorkerFactory;
}
declare module 'monaco-editor/esm/vs/editor/editor.all.js';
