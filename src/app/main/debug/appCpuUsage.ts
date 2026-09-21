type Metric = { cpu: { percentCPUUsage: number } }

export class AppCpuUsage {
  private sampledAt = -Infinity
  private percent: number | null = null

  constructor(private readonly metrics: () => Metric[], private readonly now = () => performance.now()) {}

  read(): number | null {
    const now = this.now()
    if (now - this.sampledAt < 1000) return this.percent
    const first = this.sampledAt === -Infinity
    this.sampledAt = now
    try {
      const metrics = this.metrics()
      const total = metrics.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0)
      this.percent = first || !metrics.length || !Number.isFinite(total) ? null : Math.max(0, Math.min(100, total))
    } catch { this.percent = null }
    return this.percent
  }
}
