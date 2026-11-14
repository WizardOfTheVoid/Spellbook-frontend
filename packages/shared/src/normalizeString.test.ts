import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeString } from './normalizeString.js'

test(`converts configured nickname separators to one trimmed space`, () => {
  for (const separator of [`.`, `,`, `_`, `-`, `~`]) {
    assert.equal(normalizeString(`name`, `TT${separator}SPAZZIN`), `TT SPAZZIN`)
    assert.equal(normalizeString(`name`, `${separator}TT${separator.repeat(3)} SPAZZIN${separator}`), `TT SPAZZIN`)
  }
  assert.equal(normalizeString(`name`, ` .TT_,--~ SPAZZIN~ `), `TT SPAZZIN`)
  assert.equal(normalizeString(`name`, `TT_†_SPAZZIN`), `TT SPAZZIN`)
  assert.equal(normalizeString(`name`, `TT_SPAZZIN`), normalizeString(`name`, `TT SPAZZIN`))
  assert.equal(normalizeString(`name`, `O'Neill!`), `O'Neill!`)
})

test(`normalizes separators introduced by nickname transliteration`, () => {
  assert.equal(normalizeString(`name`, `ＴＴ＿ＳＰＡＺＺＩＮ`), `TT SPAZZIN`)
  assert.equal(normalizeString(`name`, `ＴＴ＿．～ＳＰＡＺＺＩＮ`), `TT SPAZZIN`)
})

test(`keeps nickname separator punctuation in game messages`, () => {
  assert.equal(normalizeString(`game`, `Ready, TT_SPAZZIN.-~!`), `Ready, TT_SPAZZIN.-~!`)
})

test(`maps custom symbols before transliteration and preserves case and punctuation`, () => {
  assert.equal(normalizeString(`name`, `M\u2206GIC \u2665`), `MAGIC heart`)
  assert.equal(normalizeString(`game`, `\u1e6e\u1e6e\u1d38 \u01b5\u20b3\u2c64\u20b3\u0189.`), `TTL ZARAD.`)
})

test(`normalizes the common triangle variants of MAGIC as A`, () => {
  for (const name of [`MΔGIC`, `M∆GIC`, `M△GIC`, `M▲GIC`, `MΛGIC`]) {
    assert.equal(normalizeString(`name`, name), `MAGIC`, name)
  }
})

test(`reads attached daggers as I in stylized names`, () => {
  for (const [name, expected] of [
    [`ṮṮᵍᵐ G†LGAMESH`, `TTgm GILGAMESH`],
    [`SAMURA†`, `SAMURAI`],
    [`†ceman`, `Iceman`]
  ]) {
    assert.equal(normalizeString(`name`, name), expected, name)
    assert.equal(normalizeString(`game`, name), expected, name)
  }
})

test(`removes standalone dagger decorations with spaces or non-breaking spaces`, () => {
  for (const [name, expected] of [
    [`ṮṮ † ⱣOSṮEÐ`, `TT POSTED`],
    [`ṮṮ\u00a0†\u00a0ⱣOSṮEÐ`, `TT POSTED`],
    [`Ᵽ Ħ Ⱥ N † Ø M`, `P H A N O M`],
    [`TT\t†\tPOSTED`, `TT POSTED`],
    [`† Name †`, `Name`],
    [`TT † † POSTED`, `TT POSTED`],
    [`TT †‡ POSTED`, `TT POSTED`],
    [`††`, ``],
    [`G‡LGAMESH`, `GLGAMESH`]
  ]) {
    assert.equal(normalizeString(`name`, name), expected, name)
    assert.equal(normalizeString(`game`, name), expected, name)
  }
})

test(`removing standalone daggers preserves control characters for command validation`, () => {
  for (const value of [
    `One\r\n† Two`, `One\r†\nTwo`, `One\0 † Two`,
    `One\r\n†`, `†\r\nOne`, `One\r\n‡`, `‡\nOne`,
    `One\n`, `\rOne`
  ]) {
    assert.equal(normalizeString(`game`, value), value)
  }
})

test(`reads visual letter substitutes in clearly Latin names instead of phonetic expansions`, () => {
  for (const [name, expected] of [
    [`Χenon`, `Xenon`], [`Foχ`, `Fox`], [`Ηero`, `Hero`],
    [`Ρlayer`, `Player`], [`Troρhy`, `Trophy`], [`Saνage`, `Savage`],
    [`Ғox`, `Fox`], [`ғox`, `fox`],
    [`Єcho`, `Echo`], [`єcho`, `echo`],
    [`Ѕlayer`, `Slayer`], [`ѕlayer`, `slayer`],
    [`Ҽddy`, `Eddy`], [`Pҽter`, `Peter`],
    [`Ѳdin`, `Odin`], [`ѳdin`, `odin`],
    [`Ѵiper`, `Viper`], [`ѵiper`, `viper`],
    [`Ӿenon`, `Xenon`], [`Foӿ`, `Fox`]
  ]) {
    assert.equal(normalizeString(`name`, name), expected, name)
    assert.equal(normalizeString(`game`, name), expected, name)
  }
})

test(`reads stylized letter shapes without expanding them into syllables`, () => {
  for (const [name, expected] of [
    [`ᒪion`, `Lion`], [`ᑌnity`, `Unity`], [`ᗴcho`, `Echo`], [`ᔕlayer`, `Slayer`],
    [`Ꮆhost`, `Ghost`], [`Ꮢanger`, `Ranger`], [`Ꮶnight`, `Knight`], [`ꓐlade`, `Blade`],
    [`ᗰᗩᎶIᑕ`, `MAGIC`]
  ]) {
    assert.equal(normalizeString(`name`, name), expected, name)
  }
})

test(`preserves native script words and ambiguous mixed names`, () => {
  for (const name of [
    `Αθήνα`, `Χρήστος`, `Ηρακλής`, `Ρόδος`, `Ἡρακλῆς`,
    `Привет`, `Григорий`, `Євген`, `ѕвезда`, `Ѳеодор`,
    `ИванPlayer`, `JohnПривет`, `aaΧΡbb`, `AΡ`,
    `東京`, `プレイヤー`, `あ゙Player`, `M4G1C`, `Player123`
  ]) {
    assert.equal(normalizeString(`name`, name), name, name)
    assert.equal(normalizeString(`game`, name), name, name)
  }
  assert.equal(normalizeString(`name`, `ᒪion東京`), `Lion東京`)
})

test(`preserves Arabic game text with vowel marks, native punctuation and mixed scripts`, () => {
  for (const text of [
    `مرحبا بالعالم`, `السَّلَامُ عَلَيْكُمْ`, `أهلاً وسهلاً، كيف الحال؟`,
    `العربية ١٢٣٤٥؛ ۱۲۳۴۵`, `﷽`, `پێشوازی`, `ع\u200dر\u200cبي`,
    `HelloمرحباWorld`, `東京مرحباПривет`
  ]) assert.equal(normalizeString(`game`, text), text, text)

  assert.equal(normalizeString(`game`, `  [SB] MΔGIC: مرحباً، "Café"!  `), `[SB] MAGIC: مرحباً، "Cafe"!`)
})

test(`retains Arabic transliteration for player-name search`, () => {
  assert.equal(normalizeString(`name`, `مرحبا`), `mrhb`)
})

test(`preserves joining characters at the edges of Arabic game text`, () => {
  for (const text of [`\u200dمرحبا`, `\u200cمرحبا`, `Hello\u200dمرحبا\u200cWorld`]) {
    assert.equal(normalizeString(`game`, text), text)
  }
})

test(`caps existing spaces at two for game text and one for names`, () => {
  assert.equal(normalizeString(`game`, `  One     Two  Three `), `One  Two  Three`)
  assert.equal(normalizeString(`name`, `  One     Two  Three `), `One Two Three`)
})

test(`converts tabs after capping spaces and trims after transliteration`, () => {
  assert.equal(normalizeString(`game`, `\tOne   \t\tTwo\t`), `One    Two`)
  assert.equal(normalizeString(`name`, `\tOne   \t\tTwo\t`), `One   Two`)
  assert.equal(normalizeString(`name`, `\u200b Player \u200b`), `Player`)
})

test(`keeps command validation and database length limits outside normalization`, () => {
  assert.equal(normalizeString(`game`, `One\n"Two"`), `One\n"Two"`)
  assert.equal(normalizeString(`name`, `A`.repeat(300)), `A`.repeat(300))
  assert.equal(normalizeString(`name`, ``), ``)
})
