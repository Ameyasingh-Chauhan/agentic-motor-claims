import { EASE } from "../../lib/motion";

/**
 * Dashboard entrance (§6.6, Motion `whileInView` + variants): each section staggers its cards in once, the first time it scrolls
 * into view in this session. Opacity + transform only, no overshoot (dense data). Reduced motion: the app-wide
 * <MotionConfig reducedMotion="user"> drops the transform and keeps the fade.
 */
export const sectionVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};
