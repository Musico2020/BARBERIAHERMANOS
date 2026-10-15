import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Páginas públicas que deben aparecer en Google
const PUBLIC_PAGES = ['/', '/galeria', '/shop'];

/**
 * Genera robots.txt y sitemap.xml al publicar.
 * VITE_SITE_URL es la dirección pública de la web (por ejemplo https://exclusivebarber.co),
 * configurada en Vercel -> Settings -> Environment Variables.
 */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'exclusive-barber-seo-files',
    apply: 'build',
    generateBundle() {
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /barber',
        ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []),
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });

      if (siteUrl) {
        const today = new Date().toISOString().slice(0, 10);
        const urls = PUBLIC_PAGES.map(
          (path) => `  <url><loc>${siteUrl}${path}</loc><lastmod>${today}</lastmod><priority>${path === '/' ? '1.0' : '0.7'}</priority></url>`,
        ).join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      } else {
        this.warn('VITE_SITE_URL no está configurada: no se generó sitemap.xml y las etiquetas para Google quedan sin dominio.');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');
  // index.html usa %VITE_SITE_URL%; sin dominio queda vacío (rutas relativas) en vez de un texto roto
  process.env.VITE_SITE_URL = siteUrl;

  return {
    plugins: [react(), seoFiles(siteUrl)],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
