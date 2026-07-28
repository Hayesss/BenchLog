import { motion } from 'framer-motion'

/**
 * Serif page title with per-character stagger reveal (design §6: stagger 0.02s).
 * Falls back to plain opacity when prefers-reduced-motion.
 */
export default function ProtocolCharTitle({
  text,
  className,
  as: Tag = 'h1',
}: {
  text: string
  className?: string
  as?: 'h1' | 'h2'
}) {
  const chars = Array.from(text)
  const MotionTag = Tag === 'h1' ? motion.h1 : motion.h2
  return (
    <MotionTag
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.02 } } }}
      aria-label={text}
    >
      {chars.map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          aria-hidden
          className="inline-block"
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </MotionTag>
  )
}
