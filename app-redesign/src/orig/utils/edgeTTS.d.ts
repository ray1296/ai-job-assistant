export const VOICE_PRESETS: any[];
export const DEFAULT_VOICE: any;
export const VOICE_LIBRARY: any[];
export function getVoiceConfig(): any;
export function saveVoiceConfig(cfg: any): void;
export function edgeTTSSynthesize(text: string, opts?: any): Promise<string>;
export function edgeTTSSynthesizeFallback(text: string, opts?: any): Promise<null>;
