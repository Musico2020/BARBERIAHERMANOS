import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

// URL directa a la reserva de Salón Hermanos (abre de inmediato la elección de servicio)
const BOOKING_URL = 'https://barberia-hermanos.vercel.app/reservar';

async function main() {
  console.log(`Generando códigos QR para: ${BOOKING_URL}`);

  // 1. QR Estándar de Máxima Legibilidad (Fondo blanco, módulos oscuros, 1200x1200px)
  // Ideal para imprimir en papel, tarjetas de visita, stickers y afiches
  const standardQrPath = path.join(publicDir, 'qr-reservas.png');
  await QRCode.toFile(standardQrPath, BOOKING_URL, {
    errorCorrectionLevel: 'H',
    type: 'png',
    quality: 1,
    margin: 2,
    width: 1200,
    color: {
      dark: '#111111',
      light: '#FFFFFF',
    },
  });
  console.log(`✓ Creado QR estándar: ${standardQrPath}`);

  // 2. QR Vectorial SVG (Calidad infinita para imprenta profesional o vinilos)
  const svgQrPath = path.join(publicDir, 'qr-reservas.svg');
  const svgString = await QRCode.toString(BOOKING_URL, {
    errorCorrectionLevel: 'H',
    type: 'svg',
    margin: 2,
    color: {
      dark: '#111111',
      light: '#FFFFFF',
    },
  });
  fs.writeFileSync(svgQrPath, svgString, 'utf-8');
  console.log(`✓ Creado QR vectorial SVG: ${svgQrPath}`);

  // 3. QR Tema Oscuro & Dorado (Para pantallas, redes sociales e historias de Instagram/WhatsApp)
  const goldQrPath = path.join(publicDir, 'qr-reservas-gold.png');
  await QRCode.toFile(goldQrPath, BOOKING_URL, {
    errorCorrectionLevel: 'H',
    type: 'png',
    quality: 1,
    margin: 2,
    width: 1200,
    color: {
      dark: '#D9AD50', // Dorado Salón Hermanos
      light: '#121214', // Fondo carbón oscuro
    },
  });
  console.log(`✓ Creado QR dorado de lujo: ${goldQrPath}`);

  // Generamos Data URLs para embeber directamente en el afiche imprimible
  const standardDataUrl = await QRCode.toDataURL(BOOKING_URL, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: { dark: '#111111', light: '#FFFFFF' },
  });

  // 4. Afiche de Mostrador Imprimible (HTML listo para imprimir o guardar como PDF)
  const flyerHtmlPath = path.join(publicDir, 'cartel-qr-reservas.html');
  const flyerHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salón Hermanos · Cartel QR de Reservas</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Montserrat:wght@400;500;600;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #0b0b0d;
      color: #f4f4f5;
      font-family: 'Montserrat', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .no-print-bar {
      margin-bottom: 20px;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .btn {
      background: #D9AD50;
      color: #0b0b0d;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 9999px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(217, 173, 80, 0.4);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn:hover {
      background: #e5b95d;
      transform: translateY(-1px);
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: radial-gradient(circle at 50% 0%, #1f1d17 0%, #0e0e11 100%);
      border: 2px solid #D9AD50;
      border-radius: 28px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(217, 173, 80, 0.15);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 8px;
      border: 1px solid rgba(217, 173, 80, 0.3);
      border-radius: 20px;
      pointer-events: none;
    }

    .corner-decor {
      position: absolute;
      width: 16px;
      height: 16px;
      border-color: #D9AD50;
    }
    .top-left { top: 12px; left: 12px; border-top: 2px solid; border-left: 2px solid; }
    .top-right { top: 12px; right: 12px; border-top: 2px solid; border-right: 2px solid; }
    .bottom-left { bottom: 12px; left: 12px; border-bottom: 2px solid; border-left: 2px solid; }
    .bottom-right { bottom: 12px; right: 12px; border-bottom: 2px solid; border-right: 2px solid; }

    .logo-badge {
      font-family: 'Cinzel', serif;
      font-size: 26px;
      font-weight: 800;
      color: #D9AD50;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .sub-badge {
      font-size: 11px;
      font-weight: 600;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin-bottom: 24px;
    }

    .qr-container {
      background: #FFFFFF;
      padding: 16px;
      border-radius: 20px;
      display: inline-block;
      margin: 0 auto 24px auto;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), 0 0 0 4px rgba(217, 173, 80, 0.4);
    }

    .qr-container img {
      display: block;
      width: 230px;
      height: 230px;
    }

    .headline {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }

    .instruction {
      font-size: 13px;
      color: #d4d4d8;
      line-height: 1.5;
      margin-bottom: 20px;
    }

    .highlight {
      color: #D9AD50;
      font-weight: 600;
    }

    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(217, 173, 80, 0.4), transparent);
      margin: 16px 0;
    }

    .footer-info {
      font-size: 11px;
      color: #71717a;
      letter-spacing: 0.5px;
    }

    .footer-url {
      font-size: 12px;
      font-weight: 600;
      color: #D9AD50;
      margin-top: 4px;
    }

    @media print {
      body {
        background: none;
        padding: 0;
        justify-content: flex-start;
      }
      .no-print-bar {
        display: none;
      }
      .card {
        box-shadow: none;
        margin: 20px auto;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <div class="no-print-bar">
    <button class="btn" onclick="window.print()">
      🖨️ Imprimir Cartel / Guardar PDF
    </button>
    <a href="/qr-reservas.png" download="QR-Salon-Hermanos.png" class="btn" style="background:#27272a; color:#f4f4f5; border:1px solid #3f3f46;">
      📥 Descargar Imagen PNG
    </a>
  </div>

  <div class="card">
    <div class="corner-decor top-left"></div>
    <div class="corner-decor top-right"></div>
    <div class="corner-decor bottom-left"></div>
    <div class="corner-decor bottom-right"></div>

    <div class="logo-badge">Salón Hermanos</div>
    <div class="sub-badge">Club de Caballeros</div>

    <div class="qr-container">
      <img src="${standardDataUrl}" alt="Código QR de Reservas Salón Hermanos">
    </div>

    <h2 class="headline">Escanea y Reserva tu Cita</h2>
    <p class="instruction">
      Apunta con la cámara de tu teléfono para <span class="highlight">escoger tu servicio de una</span> y <span class="highlight">reservar tu cita</span> directamente al instante.
    </p>

    <div class="divider"></div>

    <div class="footer-info">
      Barrio Tobías Daza, Mz B casa 16 · Valledupar
      <div class="footer-url">barberia-hermanos.vercel.app/reservar</div>
    </div>
  </div>

</body>
</html>`;

  fs.writeFileSync(flyerHtmlPath, flyerHtml, 'utf-8');
  console.log(`✓ Creado afiche de mostrador imprimible: ${flyerHtmlPath}`);
  console.log('¡Todos los archivos QR se generaron exitosamente!');
}

main().catch((err) => {
  console.error('Error al generar los códigos QR:', err);
  process.exit(1);
});

