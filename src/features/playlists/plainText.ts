// Combining marks, the accents NFD splits off the letters they sat on.
const COMBINING_MARKS = /\p{M}/gu

/** The text with its accented letters in their plain form: "Canção" becomes "Cancao". */
export const withoutAccents = (text: string) => text.normalize('NFD').replace(COMBINING_MARKS, '')
