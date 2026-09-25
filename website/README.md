# Vimeo Video Downloader Official Website

Official website for the Vimeo Video Downloader browser extension.

## Tech Stack

- **Astro** - Modern static site generator
- **Vue 3** - For interactive components
- **TypeScript** - Type-safe development

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Project Structure

```
website/
├── public/              # Static assets
│   ├── favicon.png
│   └── robots.txt
├── src/
│   ├── i18n/            # Internationalization
│   │   ├── ui.ts        # Locale configurations
│   │   └── content.ts   # Content translations
│   ├── layouts/         # Layout components
│   │   └── Layout.astro # Main layout with SEO
│   ├── lib/site.mjs     # 品牌与外部地址的唯一配置点
│   ├── pages/           # Page routes
│   │   ├── index.astro           # English home page
│   │   ├── [lang]/               # Localized pages
│   │   ├── vimeo-downloader.astro # Vimeo downloader landing page
│   │   ├── pricing.astro         # Website Credits pricing
│   │   ├── ext-pricing.astro     # Extension subscription pricing
│   │   └── about / contact / changelog / terms / privacy
│   └── styles/         # Global styles
├── astro.config.mjs    # Astro configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies
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

- `https://api.vimeo-video-downloader.example/api/client/auth/google/oauth/callback`
- `http://localhost:7900/api/client/auth/google/oauth/callback`

`deploy/deploy.sh` also carries the production and test domain values used by
the nginx configs in `deploy/`; keep them in sync with `src/lib/site.mjs` when
the real domain is assigned.

## License

MIT
