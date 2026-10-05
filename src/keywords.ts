export type AudioKeywords = {
  hasAudio: boolean;
  hasMusic: boolean;
  keywords: string[];
};

export function appendAudioKeywords(
  keywords: string[],
  audio: AudioKeywords,
): string[] {
  // Explicit audio judgments take precedence over any inferred visual keywords.
  const audioStates = new Set(["has-audio", "no-audio", "has-music", "no-music"]);
  return [...new Set([
    ...keywords.filter((keyword) => !audioStates.has(keyword)),
    audio.hasAudio ? "has-audio" : "no-audio",
    audio.hasAudio && audio.hasMusic ? "has-music" : "no-music",
    ...(audio.hasAudio ? audio.keywords.filter((keyword) => !audioStates.has(keyword)) : []),
  ])];
}
