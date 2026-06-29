/** Strip markdown / bot-speak before Web Speech API reads aloud */

export function sanitizeForSpeech(text: string, voiceMode = false): string {
  if (!text) return text

  let t = text
    .replace(/\(simulator[^)]*\)\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  t = t
    .replace(/^(I'd be happy to|Great question[!,.]?|Absolutely[!,.]?|Certainly[!,.]?|Of course[!,.]?|Let's dive in)\s*/i, '')
    .trim()

  if (voiceMode) {
    const sentences = t.match(/[^.!?]+[.!?]+/g) || [t]
    if (sentences.length > 2) {
      t = sentences.slice(0, 2).join(' ').trim()
    }
    const words = t.split(/\s+/)
    if (words.length > 50) {
      t = words.slice(0, 50).join(' ')
      if (!/[.!?]$/.test(t)) t += '?'
    }
  } else if (t.length > 280) {
    t = t.slice(0, 280).trim() + '...'
  }

  return t
}