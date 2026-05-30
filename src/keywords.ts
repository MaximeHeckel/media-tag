export function appendAudioKeywords(
  keywords: string[],
  hasAudio: boolean,
): string[] {
  const audioKeywords = hasAudio ? ["has-audio"] : ["no-audio"];
  const seen = new Set(keywords);
  const enriched = [...keywords];

  for (const keyword of audioKeywords) {
    if (!seen.has(keyword)) {
      enriched.push(keyword);
      seen.add(keyword);
    }
  }

  return enriched;
}
