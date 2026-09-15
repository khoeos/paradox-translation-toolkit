const MIN_PASTED_PATH_LENGTH = 3
const PATH_SEPARATOR_PATTERN = /[/\\]/

export const isPastedPathLike = (text: string): boolean =>
  text.length > MIN_PASTED_PATH_LENGTH && PATH_SEPARATOR_PATTERN.test(text)
