/**
 * Minimal footer — kept for contract completeness (design.md §8).
 * The AppShell is navigation-first; this only renders a hairline signature.
 */
export default function Footer() {
  return (
    <footer className="border-t border-line py-6 text-center">
      <p className="text-[11.5px] tracking-[0.04em] text-ink-mute">
        BenchLog · 实验笔记本 — 纸面实验记录本的数字孪生
      </p>
    </footer>
  )
}
