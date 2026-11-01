# Vercel deploy checklist
1. Neon pe Postgres banao, DATABASE_URL copy karo.
2. Cloudflare R2: 3 buckets (builds, media, temp) + API token. media bucket ko public/CDN domain do.
3. Cloudflare Worker: infra/r2-games-origin-worker.ts deploy karo (GAMES_BUCKET binding + MAIN_SITE_ORIGIN var), custom domain = GAMES_DOMAIN_URL.
4. GitHub pe push -> Vercel me import -> .env.example ke saare vars daalo -> Deploy.
5. Pehle deploy ke baad `npm run db:seed` ek baar local se (production DATABASE_URL ke saath).
