import { discordConfigurationChanges, discordConfigurationFields,
  type DiscordConfiguration, type DiscordConfigurationField, type DiscordConfigurationPatch, type DiscordGuildResources } from '@spellbook/shared/discordConfiguration'

type ConfigurationApi = {
  configuration(): Promise<DiscordConfiguration | null>
  resources(): Promise<DiscordGuildResources>
  save(patch: DiscordConfigurationPatch): Promise<DiscordConfiguration | null>
}

export class DiscordConfigurationEditor {
  saved: DiscordConfiguration | null = null
  draft: DiscordConfiguration | null = null
  resources: DiscordGuildResources = { roles: [], channels: [] }
  loading = false
  saving = false
  error = ``
  private generation = 0
  private disposed = false

  constructor(private readonly api: ConfigurationApi, private readonly changed: () => void = () => {}) {}

  get dirty(): boolean {
    return !!this.saved && !!this.draft && discordConfigurationFields.some(field => this.saved![field] !== this.draft![field])
  }

  reset(): void {
    this.generation++
    this.saved = this.draft = null
    this.resources = { roles: [], channels: [] }
    this.loading = this.saving = false
    this.error = ``
    this.changed()
  }

  async load(): Promise<void> {
    this.reset()
    const generation = this.generation
    this.loading = true
    this.changed()
    try {
      const [saved, resources] = await Promise.all([this.api.configuration(), this.api.resources()])
      if (!this.isCurrent(generation)) return
      if (!saved) throw new Error(`Connect this team to Discord first.`)
      this.saved = saved
      this.draft = { ...saved }
      this.resources = resources
    } catch (error) {
      if (this.isCurrent(generation)) this.error = error instanceof Error ? error.message : `Could not load Discord configuration.`
    } finally {
      if (this.isCurrent(generation)) { this.loading = false; this.changed() }
    }
  }

  edit(field: DiscordConfigurationField, value: string | null): void {
    if (!this.draft || this.loading || this.saving) return
    this.draft = { ...this.draft, [field]: value }
    this.changed()
  }

  async save(): Promise<boolean> {
    if (!this.saved || !this.draft || !this.dirty || this.saving) return false
    const generation = this.generation
    this.saving = true
    this.error = ``
    this.changed()
    try {
      const saved = await this.api.save(discordConfigurationChanges(this.saved, this.draft))
      if (!this.isCurrent(generation)) return false
      if (!saved) throw new Error(`The Discord connection changed. Reload before saving.`)
      this.saved = saved
      this.draft = { ...saved }
      return true
    } catch (error) {
      if (this.isCurrent(generation)) this.error = error instanceof Error ? error.message : `Could not save Discord configuration.`
      return false
    } finally {
      if (this.isCurrent(generation)) { this.saving = false; this.changed() }
    }
  }

  dispose(): void { this.disposed = true; this.generation++ }
  private isCurrent(generation: number): boolean { return !this.disposed && generation === this.generation }
}
