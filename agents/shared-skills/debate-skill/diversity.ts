export interface DiversityCheck {
  isDiverse: boolean;
  similarityScore: number;
  suggestion?: string;
}

export async function checkDiversity(
  newArg: string,
  prevArgs: string[]
): Promise<DiversityCheck> {
  if (prevArgs.length === 0) return { isDiverse: true, similarityScore: 0 };

  const newWords = extractWords(newArg);
  for (const prev of prevArgs) {
    const overlap = calculateOverlap(newWords, extractWords(prev));
    if (overlap > 0.5) {
      return { isDiverse: false, similarityScore: Math.round(overlap * 100) };
    }
  }

  return { isDiverse: true, similarityScore: 0 };
}

function extractWords(text: string): Set<string> {
  const stop = new Set(["the", "a", "an", "is", "are", "to", "of", "in", "for", "and", "but", "or"]);
  return new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w))
  );
}

function calculateOverlap(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((x) => b.has(x)).length;
  const smaller = Math.min(a.size, b.size);
  return smaller === 0 ? 0 : intersection / smaller;
}

export function getDiversityInstruction(prevArgs: string[], failed: string): string {
  return `⚠️ Your argument was too similar to previous ones. Make a DIFFERENT point.
Previous: ${prevArgs.map((a, i) => `${i + 1}. ${a.slice(0, 80)}...`).join("\n")}`;
}