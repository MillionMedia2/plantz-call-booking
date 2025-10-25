// types/embed.ts
export type EmbedConfig = {
  initialQuestion?: string;
  agentKey?: string;
  variant?: string;
  themeKey?: string;
  sourceTag?: string;
  presetToken?: string;
  isEmbedded?: boolean; // computed in wrapper (window !== parent)
};

