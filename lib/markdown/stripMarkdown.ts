/**
 * Strip markdown syntax from text for plain-text editing
 * Converts formatted text back to clean readable text
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Remove bold syntax: **text** → text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      // Normalize bullet points: • item → - item
      .replace(/^[•]\s/gm, '- ')
      // Clean up multiple spaces
      .replace(/  +/g, ' ')
      .trim()
  );
}
