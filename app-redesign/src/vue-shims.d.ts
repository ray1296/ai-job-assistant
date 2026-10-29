declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window { __zgCsrf?: string }
interface Window { __map?: any }

declare module "./orig/utils/edgeTTS.js" { export const VOICE_LIBRARY: any[]; export const VOICE_PRESETS: any[]; export const DEFAULT_VOICE: any; export function getVoiceConfig(): any; export function saveVoiceConfig(v: any): void; }
