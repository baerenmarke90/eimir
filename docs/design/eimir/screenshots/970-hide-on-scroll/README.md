# Floating Bottom Navigation Context-Aware Hide-on-Scroll visual evidence — #970

Rendered visual evidence for the #970 implementation of context-aware hide-on-scroll for the floating bottom navigation bar. Every image is a real browser render of the Web client on a 390×844 mobile viewport via Playwright (`web/e2e/tests/floating-bottom-nav-scroll.spec.ts`).

## Visual Evidence Matrix

| File | Viewport / State | What it shows |
| :--- | :--- | :--- |
| [`01-momente-initial-visible.png`](./01-momente-initial-visible.png) | 390×844, Momente / Timeline | Initial state at the top of the feed (`scrollY = 0`). The floating bottom navigation bar is fully visible, elevated with active indicator on Momente and central quick-create action. |
| [`02-momente-scrolled-down-hidden.png`](./02-momente-scrolled-down-hidden.png) | 390×844, Momente / Timeline | Deliberate downward scroll (> 50px threshold). The floating bottom bar smoothly transitions below the viewport (`transform: translate(-50%, calc(100% + ...))`, `opacity: 0`), maximizing reading area for content consumption without causing any layout reflow or scroll jumps. |
| [`03-momente-scrolled-up-revealed.png`](./03-momente-scrolled-up-revealed.png) | 390×844, Momente / Timeline | Slight upward scroll (> 15px reveal threshold). The floating bottom navigation returns eagerly and quickly into view, making navigational recovery effortless. |
| [`04-route-change-reset-visible.png`](./04-route-change-reset-visible.png) | 390×844, Planen | Route change reset. Navigating away from Momente while the bar was hidden immediately restores the navigation bar to its correct visible state on the new route. Persistent surfaces never inherit a hidden state. |
| [`05-heute-persistent-scrolled.png`](./05-heute-persistent-scrolled.png) | 390×844, Heute | Persistent Heute surface. Scrolling downward on the Heute surface preserves the floating navigation bar visible by default. |
| [`06-planen-persistent-scrolled.png`](./06-planen-persistent-scrolled.png) | 390×844, Planen | Persistent Planen surface. Scrolling downward on the Planen surface preserves the floating navigation bar visible by default. |
| [`07-top-of-page-reset.png`](./07-top-of-page-reset.png) | 390×844, Momente / Timeline | Top of page reset. Scrolling back to the top of the page (`scrollY <= 20px`) immediately restores the floating navigation bar. |
| [`08-reduced-motion-hidden.png`](./08-reduced-motion-hidden.png) | 390×844, prefers-reduced-motion | Reduced motion preference respected. With `prefers-reduced-motion: reduce`, the transition duration is zero (`transition: none`), toggling visibility instantly without animation. |

## Interaction Contract Summary

- **Downward Hide Threshold:** 50 px cumulative intentional downward scroll.
- **Upward Reveal Threshold:** 15 px intentional upward scroll (faster/easier recovery).
- **Direction Reversal:** Resets accumulated direction when scroll direction changes by >= 6 px.
- **Jitter Tolerance:** Ignores subpixel deltas (< 2 px) to prevent flicker.
- **Top of Page Reset:** Navigation is always visible when `scrollY <= 20 px` or on overscroll bounce.
- **Accessibility / Focus:** Keyboard focus inside the navigation bar immediately reveals and keeps it visible; accessibility tree semantics are fully preserved without `aria-hidden` removal.
- **Zero Content Reflow:** Fixed position with static bottom clearance preserves feed position and item reachability.
