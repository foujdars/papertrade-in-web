# PaperTrade Android design system

## Direction
Compact trading desk: clear numerical hierarchy, neutral surfaces, restrained violet navigation, semantic green/red market movements. The same layouts and token names serve light and dark themes. Existing market freshness labels and trading logic are preserved.

## Foundations
- Spacing: 4/8px rhythm; mobile page gutters 16px, small phones 12px.
- Surfaces: 18px cards, 14px controls, 24px sheets. Borders establish hierarchy; shadows remain subtle.
- Type: existing system sans, tabular numbers. Page titles 23px, card titles 14px, primary values 21–30px. Data labels 10–12px.
- Theme: light slate canvas and white cards; dark navy canvas and navy cards. Violet denotes selection. Directional values retain signs and labels as well as color.
- Header: brand, notifications, more, account. Wallet, theme and coach remain available in More on mobile.
- Navigation: six existing destinations; active icon has a violet pill. Keep keyboard and safe-area behavior intact.
- Market cards: two-column index tiles, segmented Indian/global markets, compact portfolio metrics, VIX bands, PCR balance bar, FII/DII timeline beside metrics.

## Review
UI/UX Pro Max guidance informed touch targets, spacing and contrast. Its automated design-system search returned a marketing-oriented pattern even after a narrower retry; that pattern was not adopted. This document records the product-specific design decisions instead. The existing icon family is retained for consistency and no remote fonts or animation libraries are introduced.
