// Kept as a thin re-export so existing imports (`from '@/components/tour/tourSteps'`)
// don't need to change across Dashboard/Products/Orders/Settings. The actual step
// definitions live in tourStepsContent.jsx — moved there because this file's `.js`
// extension isn't guaranteed to be processed as JSX by every Vite config, and the
// step content now includes real JSX (brand-colored text, bold emphasis).
export * from './tourStepsContent.jsx';
