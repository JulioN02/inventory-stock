# Screenshots — naming convention

This folder holds real application captures for the portfolio site (`site/`). The
section renders styled placeholders until the PNG files below are added.

## Naming convention

```
site/screenshots/{page}-{locale}.png
```

| Page | ES file | EN file |
|---|---|---|
| Login | `login-es.png` | `login-en.png` |
| Register | `register-es.png` | `register-en.png` |
| Dashboard | `dashboard-es.png` | `dashboard-en.png` |
| Products | `products-es.png` | `products-en.png` |
| Warehouses | `warehouses-es.png` | `warehouses-en.png` |
| Movements | `movements-es.png` | `movements-en.png` |
| Audit | `audit-es.png` | `audit-en.png` |

Why `{page}-{locale}`?

- Locale-suffixed names let each language keep its own capture (the UI is
  bilingual), so the site can show the correct shot per active locale later.
- Page-prefixed names stay stable when new captures are added.

## Dimensions

- **Recommended**: 1280 × 800 px (16:10 aspect ratio), PNG.
- Keep the full window (browser chrome excluded, just the app viewport).
- Prefer light theme to match the site design tokens.

## How to replace a placeholder (drop-in)

In `site/index.html`, replace the `.shot-placeholder` div of a figure with an
`<img>` (the `<figure>`/`<figcaption>` stay):

```html
<!-- before -->
<figure class="shot">
  <div class="shot-placeholder" role="img" aria-labelledby="shot-dashboard-label">
    <span class="shot-label" id="shot-dashboard-label">Panel</span>
    <span class="shot-filename">screenshots/dashboard-es.png</span>
  </div>
  <figcaption>Panel</figcaption>
</figure>

<!-- after -->
<figure class="shot">
  <img class="shot-img" src="screenshots/dashboard-es.png"
       alt="Captura del panel — Dashboard" loading="lazy" />
  <figcaption>Panel</figcaption>
</figure>
```

If one neutral capture (same language in both locales) is used per page, drop
the `-{locale}` suffix and keep the caption key without the locale suffix.