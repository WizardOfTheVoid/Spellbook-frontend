const eastAsianCharacters = /([\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}][\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{M}]*)/gu
const eastAsianCharacter = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u
const nativeCharacter = /[\p{Script_Extensions=Greek}\p{Script_Extensions=Cyrillic}]/u
const nativeWord = /(?:[\p{Script_Extensions=Greek}\p{Script_Extensions=Cyrillic}]\p{M}*){2}/u
const latinCharacters = /\p{Script=Latin}/gu
const letters = /\p{L}/gu
const textParts = /[\p{L}\p{M}]+|[^\p{L}\p{M}]+/gu

export function normalizeScriptText(value: string, normalize: (value: string) => string): string {
  return value.split(eastAsianCharacters).map(part => {
    if (eastAsianCharacter.test(part)) return part

    return part.replace(textParts, word => {
      if (nativeCharacter.test(word) && !isStylizedLatinWord(word)) return word
      return normalize(word)
    })
  }).join(``)
}

function isStylizedLatinWord(value: string): boolean {
  const latinCount = value.match(latinCharacters)?.length ?? 0
  const letterCount = value.match(letters)?.length ?? 0

  // Without clear Latin context, keep the original script instead of guessing.
  return latinCount >= 2 && latinCount > letterCount / 2 && !nativeWord.test(value)
}
