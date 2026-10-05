# Vimeo Video Downloader Official Website

Official website for the Vimeo Video Downloader browser extension: a free in-browser
download tool on the home page, an overview of the extension, and the extension's
Unlimited subscription at `/pricing/`.

## Tech Stack

- **Astro** - static site generator (SSG), no UI framework integration
- **Native TypeScript** - imperative DOM scripts inside `.astro` components
- **mediabunny** - in-browser muxing engine for the download workspace

## Development

```bash
# Install dependencies
pnpm install

# Start development server (port 7910)
pnpm dev

# Type-check and build for production
pnpm build

# Preview production build
pnpm preview

# Module script tests
pnpm test:module-scripts
```

End-to-end tests (`pnpm test:e2e`) run against a locally started real backend; there is
no mock API.

## Project Structure

```
website/
├── public/                  # Static assets: favicon, og-image, manifest, robots, llms*.txt
├── src/
│   ├── components/
│   │   ├── download/        # Download workspace UI
│   │   ├── homepage/        # Home page showcase sections
│   │   ├── pricing/         # Pricing page shell, login / confirm modals, controllers
│   │   ├── order-checkout/  # Subscription checkout modal and order protocol
│   │   ├── payment-return/  # PayPal / Clink return pages
│   │   ├── pages/           # Page assembly: Home / Pricing / Company / Legal
│   │   └── site/            # Site-level: confirm modal, brand icon
│   ├── i18n/                # schema.ts, ui.ts, content.ts, pricing.ts, lang/* (14 locales)
│   ├── layouts/Layout.astro # Only layout: SEO, design tokens, nav, footer
│   ├── lib/site.mjs         # 品牌与外部地址的唯一配置点
│   ├── pages/               # index / pricing / about / contact / terms / privacy,
│   │                        # [lang]/ mirrors, clink/ and paypal/ return pages
│   ├── scripts/
│   │   ├── download/        # Download state machine and download methods
│   │   ├── runtime/         # api / auth / device / mark / sls-mark / ga4 / error capture
│   │   └── site/            # confirm / language-switcher
│   └── sitemap/             # languageSitemap integration
├── deploy/                  # nginx configs and deploy.sh
├── cloudflare/              # CDN cache rules
├── e2e/ tests/              # Playwright (real backend) / module script tests
├── astro.config.mjs         # Astro configuration
├── tsconfig.json            # Extends astro/tsconfigs/strict
└── package.json             # Dependencies
```

## Configuration

Site identity — origin, product name, support mailbox, official X account, and the
Chrome Web Store listing URL — lives in a single module: `src/lib/site.mjs`.
`astro.config.mjs`, `Layout.astro`, the sitemap scripts, and the tests all import
from it, so a domain or listing change is a one-file edit.

Production builds read public runtime values from `website/.env.production`:

- `PUBLIC_API_BASE_URL` - backend API base URL.
- `PUBLIC_SHARED_COOKIE_DOMAIN` - shared `client_uuid` Cookie domain. Production
  and test deploys set this from `deploy/deploy.sh` so the root site and test
  subdomain keep sharing the same device cookie scope.
- `PUBLIC_GOOGLE_CLIENT_ID` - Google Identity Services OAuth client ID for website login.

Google OAuth login returns to the backend OAuth callback under
`PUBLIC_API_BASE_URL`. Add the backend OAuth callback URI to Google Console:

- `https://api.vimeodownloader.app/api/client/auth/google/oauth/callback`
- `http://localhost:7900/api/client/auth/google/oauth/callback`

`deploy/deploy.sh` also carries the production and test domain values used by
the nginx configs in `deploy/`; the production site is `vimeodownloader.app`.

## License

MIT
