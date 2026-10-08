// Types for Vite's import.meta.env, used by the type check only (no runtime effect).
interface ImportMetaEnv {
  readonly [key: string]: string | boolean | undefined;
  readonly MODE: string;
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
