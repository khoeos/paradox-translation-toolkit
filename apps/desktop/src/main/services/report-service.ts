import { app } from 'electron'

import { nodeFetch } from '@ptt/fs-node'
import type { FetchLike } from '@ptt/shared'

// Injected at build time by electron.vite.config.ts (`define`) from the
// PTT_REPORT_WEBHOOK_URL env var. Empty string when the build has no webhook
// configured, which disables the in-app report feature.
// eslint-disable-next-line no-underscore-dangle
declare const __PTT_REPORT_WEBHOOK_URL__: string

const DISCORD_DESCRIPTION_LIMIT = 4096
const DISCORD_FIELD_VALUE_LIMIT = 1024
const EMBED_COLOR = 0x5865f2

export interface ReportTechnicalInfo {
  paths: string
  jobs: string[]
}

export interface ReportInput {
  message: string
  contact?: string | undefined
  page: string
  settings: string
  technical?: ReportTechnicalInfo | undefined
}

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordWebhookPayload {
  embeds: [
    {
      title: string
      description: string
      color: number
      timestamp: string
      fields: DiscordEmbedField[]
    }
  ]
}

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

export class ReportService {
  constructor(
    private readonly webhookUrl: string,
    private readonly appVersion: string,
    private readonly platform: string,
    private readonly fetchFn: FetchLike
  ) {}

  isEnabled(): boolean {
    return this.webhookUrl.length > 0
  }

  async sendReport(input: ReportInput): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('In-app reporting is not configured in this build')
    }
    const payload = this.buildPayload(input)
    const response = await this.fetchFn(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      throw new Error(`The report endpoint responded ${response.status} ${response.statusText}`)
    }
  }

  private buildPayload(input: ReportInput): DiscordWebhookPayload {
    const fields: DiscordEmbedField[] = [
      { name: 'Version', value: this.appVersion, inline: true },
      { name: 'OS', value: this.platform, inline: true },
      { name: 'Page', value: input.page, inline: true },
      { name: 'Settings', value: truncate(input.settings, DISCORD_FIELD_VALUE_LIMIT) }
    ]

    const contact = input.contact?.trim()
    if (contact) {
      fields.push({ name: 'Contact', value: truncate(contact, DISCORD_FIELD_VALUE_LIMIT) })
    }

    if (input.technical) {
      if (input.technical.paths.length > 0) {
        fields.push({
          name: 'Paths',
          value: truncate(input.technical.paths, DISCORD_FIELD_VALUE_LIMIT)
        })
      }
      if (input.technical.jobs.length > 0) {
        fields.push({
          name: 'Recent jobs',
          value: truncate(input.technical.jobs.join('\n'), DISCORD_FIELD_VALUE_LIMIT)
        })
      }
    }

    return {
      embeds: [
        {
          title: 'New in-app report',
          description: truncate(input.message.trim(), DISCORD_DESCRIPTION_LIMIT),
          color: EMBED_COLOR,
          timestamp: new Date().toISOString(),
          fields
        }
      ]
    }
  }
}

export function createReportService(): ReportService {
  return new ReportService(
    __PTT_REPORT_WEBHOOK_URL__,
    app.getVersion(),
    `${process.platform} ${process.arch}`,
    nodeFetch
  )
}
