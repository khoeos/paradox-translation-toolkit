export type DayBucket = 'today' | 'yesterday' | 'recent' | 'older'

const MS_PER_MINUTE = 60_000
const SECONDS_PER_MINUTE = 60
const RECENT_DAY_LIMIT = 7

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
const timeFormatters = new Map<string, Intl.DateTimeFormat>()
const shortDateFormatters = new Map<string, Intl.DateTimeFormat>()
const weekdayDateFormatters = new Map<string, Intl.DateTimeFormat>()

const getFormatter = (
  cache: Map<string, Intl.DateTimeFormat>,
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const existing = cache.get(locale)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat(locale, options)
  cache.set(locale, formatter)
  return formatter
}

export const formatDateTime = (iso: string, locale: string): string =>
  getFormatter(dateTimeFormatters, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))

export const formatTime = (iso: string, locale: string): string =>
  getFormatter(timeFormatters, locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const formatShortDate = (iso: string, locale: string): string =>
  getFormatter(shortDateFormatters, locale, { day: 'numeric', month: 'short' }).format(
    new Date(iso)
  )

export const formatWeekdayDate = (iso: string, locale: string): string =>
  getFormatter(weekdayDateFormatters, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(iso))

export const formatSeconds = (seconds: number): string => {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const remainder = seconds % SECONDS_PER_MINUTE
  return `${minutes} min ${remainder}s`
}

export const getDayKey = (iso: string): string => {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const getDaysAgo = (iso: string, now: Date): number => {
  const dayStart = startOfLocalDay(new Date(iso))
  const nowStart = startOfLocalDay(now)
  return Math.round((nowStart.getTime() - dayStart.getTime()) / (MS_PER_MINUTE * 60 * 24))
}

export const getDayBucket = (iso: string, now: Date): DayBucket => {
  const diffDays = getDaysAgo(iso, now)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays > 1 && diffDays < RECENT_DAY_LIMIT) return 'recent'
  return 'older'
}
