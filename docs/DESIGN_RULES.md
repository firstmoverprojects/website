# Design rules for money pages

These rules are for agents editing First Mover Projects offer and checker pages. They describe the paper system already on the site. A later visual pass should follow them. Copy changes do not.

## Page

- Type is `system-ui` at 16px with line-height 1.5. Text is `#1b1f24`.
- The page background is `#f6f7f9`. Cards are `#fff`, with a 1px solid `#dde1e6` border, a 10px radius, and 16px padding.
- The one loud control is a solid `#0055ff` button (hover `#0044cc`), 8px radius, at least 48px tall. Everything else stays quieter: white or `#f6f7f9`, 1px solid `#dde1e6`, no glow and no gradient.
- Focus is a 3px solid `#1f5fbf` outline, offset 2px.
- One primary call to action per screen. A second buy control, a glowing bar, or a green gradient pill next to it splits the action.
- Show a real preview of the thing being sold before a long FAQ. Use the pictures and words already on the page.
- Share images are screenshots of the real page, at least 1200px wide. `og:image:alt` and `twitter:image:alt` describe that screenshot. Do not draw new claims into the image.
- Body links in paragraphs and lists are underlined. Buttons are not.

## Do not add

- Fake proof. No generated customers, invented quotes, or logo walls of companies that did not give a logo.
- Decorative gradients, neon, glow, glass, blur, a cream editorial palette, or offset drop shadows.
- Pill badges or kicker labels sitting above a headline.
- A card inside a card. Use spacing or one divider.
- An icon in a square above every heading.
- Motion on money pages beyond hover and focus. Those states must still be usable when the visitor has reduced motion on.
- Inter, Geist, or other default “AI product” fonts, and do not paint text with a gradient.
- A new dependency, skill pack, or visual framework to get these results.

## Accessibility

- Text contrast is at least 4.5:1.
- Headings stay in order.
- Taps are at least 44px. Text inputs are at least 16px so mobile browsers do not zoom on focus.
- The page does not scroll sideways at 375px.

## Copy

Wording, prices, guarantees, and who a product is for are Risk’s. If a layout needs different words, stop and list the exact old sentence and the exact new sentence for Risk. Do not ship the new sentence in the page.

The fee-checker buy button stays behind its gate: it appears only after the visitor says they sell with FBA and that Amazon asked for a $1 million liability certificate. The `#kit-sticky` bar keeps its current behavior: hidden by default and `display: none !important` from 768px up; below 768px the existing script shows it only after a certificate result that needs work. Do not show it anywhere else or change when it appears without a Risk gate.

## Sources, for the ideas behind this list

- https://impeccable.style/slop
- https://aiforui.dev/skills
- https://github.com/MengTo/skills
