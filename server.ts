import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import webPush from 'web-push';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Set up VAPID Keys
  const vapidFile = path.join(process.cwd(), 'vapid.json');
  let vapidKeys: { publicKey: string; privateKey: string };

  if (fs.existsSync(vapidFile)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(vapidFile, 'utf-8'));
    } catch (e) {
      console.error("Error reading vapid.json, generating new ones", e);
      vapidKeys = webPush.generateVAPIDKeys();
      fs.writeFileSync(vapidFile, JSON.stringify(vapidKeys, null, 2));
    }
  } else {
    vapidKeys = webPush.generateVAPIDKeys();
    fs.writeFileSync(vapidFile, JSON.stringify(vapidKeys, null, 2));
  }

  webPush.setVapidDetails(
    'mailto:mariamigdaliaramirezvillamizar@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // Set up Subscriptions File
  const subFile = path.join(process.cwd(), 'subscriptions.json');
  const getSubscriptions = (): any[] => {
    if (fs.existsSync(subFile)) {
      try {
        return JSON.parse(fs.readFileSync(subFile, 'utf-8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const saveSubscriptions = (subs: any[]) => {
    fs.writeFileSync(subFile, JSON.stringify(subs, null, 2));
  };

  // API Endpoints
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/push/register', (req, res) => {
    const { orderId, email, subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Falta la suscripción' });
    }

    let subs = getSubscriptions();
    // Remove existing for same endpoint to avoid duplicates or to update associated orderId/email
    subs = subs.filter(s => s.subscription.endpoint !== subscription.endpoint);

    subs.push({
      orderId: orderId || null,
      email: email || null,
      subscription,
      registeredAt: new Date().toISOString()
    });

    saveSubscriptions(subs);
    res.json({ success: true, message: 'Dispositivo registrado para recibir notificaciones.' });
  });

  app.post('/api/push/notify', async (req, res) => {
    const { orderId, email, title, body } = req.body;
    if (!orderId && !email) {
      return res.status(400).json({ error: 'Debe especificar un orderId o email' });
    }

    const subs = getSubscriptions();
    // Find matching subscriptions
    const matchingSubs = subs.filter(s => {
      const matchOrder = orderId && s.orderId === orderId;
      const matchEmail = email && s.email === email;
      return matchOrder || matchEmail;
    });

    if (matchingSubs.length === 0) {
      return res.json({ success: true, sentCount: 0, message: 'No hay dispositivos suscritos para esta orden/usuario.' });
    }

    let successCount = 0;
    let failedEndpoints: string[] = [];

    const payload = JSON.stringify({
      title: title || 'Actualización de Pedido',
      body: body || 'Tu pedido tiene novedades.',
      data: { orderId }
    });

    await Promise.all(
      matchingSubs.map(async (sub) => {
        try {
          await webPush.sendNotification(sub.subscription, payload);
          successCount++;
        } catch (err: any) {
          console.error(`Error sending push notification to endpoint ${sub.subscription.endpoint}:`, err);
          // If 410 (Gone) or 404 (Not Found), it means the subscription has expired or is invalid
          if (err.statusCode === 410 || err.statusCode === 404) {
            failedEndpoints.push(sub.subscription.endpoint);
          }
        }
      })
    );

    // Clean up expired/failed subscriptions
    if (failedEndpoints.length > 0) {
      const remainingSubs = subs.filter(s => !failedEndpoints.includes(s.subscription.endpoint));
      saveSubscriptions(remainingSubs);
    }

    res.json({
      success: true,
      sentCount: successCount,
      removedCount: failedEndpoints.length,
      message: `Se enviaron ${successCount} notificaciones push exitosamente.`
    });
  });

  // Backend API route for strict transaction processing and deduplication (Incomes vs Egresses)
  app.post('/api/reports/process-transactions', (req, res) => {
    try {
      const { invoices = [], orders = [], cashOps = [], currency = 'USD', currencyRates = {}, bcvRate } = req.body;
      
      const globalRate = currency === 'USD' ? 1 : (currency === 'VES' ? (bcvRate || currencyRates.VES || 1) : (currencyRates[currency] || 1));

      const getTransactionRate = (item: any, targetCurrency: string) => {
        if (targetCurrency === 'USD') return 1;
        return currencyRates[targetCurrency] || (targetCurrency === 'VES' ? bcvRate : 1) || 1;
      };

      const getTransactionAmountInCurrency = (item: any, targetCurrency: string) => {
        let rawTotal = 0;
        if (typeof item.total === 'number') rawTotal = item.total;
        else if (typeof item.total === 'string') rawTotal = parseFloat(item.total) || 0;
        else if (typeof item.total_price === 'number') rawTotal = item.total_price;
        else if (typeof item.total_price === 'string') rawTotal = parseFloat(item.total_price) || 0;
        else if (typeof item.amount === 'number') rawTotal = item.amount;
        else if (typeof item.amount === 'string') rawTotal = parseFloat(item.amount) || 0;
        else if (item.items && Array.isArray(item.items) && item.items.length > 0) {
          rawTotal = item.items.reduce((acc: number, it: any) => {
            const q = parseFloat(String(it.qty || it.quantity || 1)) || 1;
            const pr = parseFloat(String(it.price || it.unit_price || 0)) || 0;
            return acc + (q * pr);
          }, 0);
        }

        if (rawTotal <= 0) return 0;

        const itemCurrency = (item.currency_code || 'USD').toUpperCase();
        
        let usdAmount = rawTotal;
        if (itemCurrency === 'VES') {
          const invRate = Number(item.bcv_rate || currencyRates?.VES || bcvRate);
          usdAmount = invRate > 0 ? rawTotal / invRate : rawTotal;
        } else if (itemCurrency === 'EUR') {
          const invRate = Number(currencyRates?.EUR);
          usdAmount = invRate > 0 ? rawTotal / invRate : rawTotal;
        } else if (itemCurrency === 'COP') {
          const invRate = Number(currencyRates?.COP);
          usdAmount = invRate > 0 ? rawTotal / invRate : rawTotal;
        }

        if (targetCurrency === 'USD') return usdAmount;

        const rate = getTransactionRate(item, targetCurrency);
        return usdAmount * rate;
      };

      const incomes: any[] = [];
      const egresses: any[] = [];

      // 1. Process Invoices (Facturas y Notas de Entrega)
      invoices.forEach((inv: any) => {
        const amt = getTransactionAmountInCurrency(inv, currency);
        if (amt <= 0 && (!inv.items || inv.items.length === 0)) return;

        const isNota = inv.document_type === 'nota_entrega' || (inv.control_number && String(inv.control_number).startsWith('NE-'));
        const docPrefix = isNota ? 'NE' : 'FAC';
        const docNum = String(inv.control_number || inv.invoice_number || inv.id || '000').padStart(6, '0');
        const docType = isNota ? 'Nota de Entrega' : (inv.document_type || 'Factura');
        const clientName = (inv.customer_name || '').trim() || 'Consumidor Final';

        incomes.push({
          id: `${docPrefix}-${docNum}`,
          date: inv.created_at ? new Date(inv.created_at).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE'),
          channel: isNota ? 'Nota de Entrega' : 'Factura POS',
          description: `${docType} #${docNum} - ${clientName}`,
          paymentMethod: inv.payment_method || inv.paymentMethod || 'Efectivo',
          amount: amt,
          seller: inv.seller_name || inv.cashier_name || 'Cajero POS',
          status: 'Completado',
          type: isNota ? 'nota_entrega' : 'factura'
        });
      });

      // 2. Process Orders (Órdenes de Pedidos Tienda Online)
      orders.forEach((order: any) => {
        const status = (order.status || '').toLowerCase();
        if (status === 'cancelado' || status === 'anulado' || status === 'rechazado') return;
        const amt = getTransactionAmountInCurrency(order, currency);
        if (amt <= 0) return;

        const orderNum = String(order.order_number || order.id || '000').padStart(6, '0');
        const clientName = (order.customer_name || '').trim() || 'Cliente Mostrador';

        incomes.push({
          id: `ORD-${orderNum}`,
          date: order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE'),
          channel: 'Tienda Online',
          description: `Orden Pedido #${orderNum} - ${clientName}`,
          paymentMethod: order.payment_method || 'Efectivo',
          amount: amt,
          seller: order.seller_name || 'Ventas Online',
          status: order.status || 'Completado',
          type: 'orden_online'
        });
      });

      // 3. Process Cash Ops Egresses (Gastos Operativos) & Incomes
      cashOps.forEach((op: any) => {
        const concept = op.concept || '';
        const amt = getTransactionAmountInCurrency(op, currency);

        if (op.type === 'egreso') {
          if (concept === 'Cierre de Caja - Entrega de Efectivo (Arqueo)') return;

          let cat = (op.category || '').trim();
          const lowerConcept = concept.toLowerCase();
          if (!cat) {
            if (lowerConcept.includes('nomina') || lowerConcept.includes('nómina') || lowerConcept.includes('sueldo')) cat = 'Nómina y Sueldos';
            else if (lowerConcept.includes('alquiler') || lowerConcept.includes('arriendo')) cat = 'Alquiler y Espacio Físico';
            else if (lowerConcept.includes('luz') || lowerConcept.includes('agua') || lowerConcept.includes('internet') || lowerConcept.includes('servicio')) cat = 'Servicios Públicos e Internet';
            else if (lowerConcept.includes('compra') || lowerConcept.includes('mercancia') || lowerConcept.includes('proveedor')) cat = 'Mercancía y Proveedores';
            else if (lowerConcept.includes('delivery') || lowerConcept.includes('transporte') || lowerConcept.includes('flete')) cat = 'Transporte y Envíos';
            else if (lowerConcept.includes('papel') || lowerConcept.includes('toner') || lowerConcept.includes('insumo')) cat = 'Materiales e Insumos';
            else cat = 'Otros Gastos Operativos';
          }

          egresses.push({
            id: `EGR-${String(op.id || '').substring(0, 6)}`,
            date: op.created_at ? new Date(op.created_at).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE'),
            category: cat,
            description: concept || 'Gasto operativo de caja',
            paymentMethod: op.payment_method || 'Efectivo',
            amount: amt,
            operator: op.empleado_nombre || 'Administrador',
            status: 'Pagado',
            type: 'egreso'
          });
        }
      });

      res.json({
        success: true,
        incomes,
        egresses,
        totalIncomes: incomes.reduce((s, i) => s + i.amount, 0),
        totalEgresses: egresses.reduce((s, e) => s + e.amount, 0)
      });
    } catch (err: any) {
      console.error('Error in /api/reports/process-transactions:', err);
      res.status(500).json({ error: err.message || 'Error processing transactions' });
    }
  });

  // BCV Official Exchange Rates Scraper and Comparator Endpoint
  // Consulta directa a https://www.bcv.org.ve/glosario/cambio-oficial
  app.get('/api/bcv/rates', async (req, res) => {
    try {
      const fetchBcvOfficial = (): Promise<{
        usdRate: number | null;
        eurRate: number | null;
        valueDate: string | null;
        valueDateText: string | null;
        rawHtmlAvailable: boolean;
      }> => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ usdRate: null, eurRate: null, valueDate: null, valueDateText: null, rawHtmlAvailable: false });
          }, 8000);

          try {
            const reqBcv = https.get('https://www.bcv.org.ve/glosario/cambio-oficial', {
              rejectUnauthorized: false,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-VE,es;q=0.9'
              }
            }, (resBcv) => {
              let html = '';
              resBcv.on('data', (chunk) => { html += chunk; });
              resBcv.on('end', () => {
                clearTimeout(timeout);
                try {
                  const dolarMatch = html.match(/id=[\"']dolar[\"'][\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i);
                  const euroMatch = html.match(/id=[\"']euro[\"'][\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i);
                  const dateMatch = html.match(/class=[\"']date-display-single[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)<\/span>/i);

                  let usdRate: number | null = null;
                  if (dolarMatch && dolarMatch[1]) {
                    const cleanNum = dolarMatch[1].trim().replace(/\./g, '').replace(',', '.');
                    const parsed = parseFloat(cleanNum);
                    if (!isNaN(parsed) && parsed > 0) usdRate = parsed;
                  }

                  let eurRate: number | null = null;
                  if (euroMatch && euroMatch[1]) {
                    const cleanNum = euroMatch[1].trim().replace(/\./g, '').replace(',', '.');
                    const parsed = parseFloat(cleanNum);
                    if (!isNaN(parsed) && parsed > 0) eurRate = parsed;
                  }

                  const valueDate = dateMatch && dateMatch[1] ? dateMatch[1].trim() : null;
                  const valueDateText = dateMatch && dateMatch[2] ? dateMatch[2].trim() : null;

                  resolve({
                    usdRate,
                    eurRate,
                    valueDate,
                    valueDateText,
                    rawHtmlAvailable: true
                  });
                } catch (parseErr) {
                  resolve({ usdRate: null, eurRate: null, valueDate: null, valueDateText: null, rawHtmlAvailable: false });
                }
              });
            });

            reqBcv.on('error', () => {
              clearTimeout(timeout);
              resolve({ usdRate: null, eurRate: null, valueDate: null, valueDateText: null, rawHtmlAvailable: false });
            });
          } catch (e) {
            clearTimeout(timeout);
            resolve({ usdRate: null, eurRate: null, valueDate: null, valueDateText: null, rawHtmlAvailable: false });
          }
        });
      };

      let bcvData = await fetchBcvOfficial();

      // If direct BCV scrape timed out or failed to parse, use official DolarAPI as fallback
      if (!bcvData.usdRate) {
        try {
          const resFallback = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (resFallback.ok) {
            const dataFb: any = await resFallback.json();
            if (dataFb && typeof dataFb.promedio === 'number' && dataFb.promedio > 0) {
              bcvData.usdRate = dataFb.promedio;
              bcvData.valueDate = dataFb.fechaActualizacion || bcvData.valueDate;
            }
          }
        } catch (fbErr) {
          console.warn('Fallback error fetching official rate in server.ts:', fbErr);
        }
      }

      // Caracas time calculation for future rate determination
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const caracasDate = new Date(utcTime + (-4 * 3600000));
      const todayCaracasStr = caracasDate.toISOString().split('T')[0];

      let isFutureRate = false;
      let effectiveDateLabel = bcvData.valueDate ? bcvData.valueDate.split('T')[0] : '';

      // Regla estricta de tasa futura:
      // 1. Si la fecha de valor es posterior a hoy (fecha futura real)
      if (effectiveDateLabel && effectiveDateLabel > todayCaracasStr) {
        isFutureRate = true;
      } 
      // 2. Si es a partir de las 4:00 PM (16:00) y la fecha de valor NO es de días anteriores
      else if (caracasDate.getHours() >= 16 && (!effectiveDateLabel || effectiveDateLabel >= todayCaracasStr)) {
        isFutureRate = true;
        if (!effectiveDateLabel) {
          const tomorrow = new Date(caracasDate.getTime() + 24 * 60 * 60 * 1000);
          effectiveDateLabel = tomorrow.toISOString().split('T')[0];
        }
      } else {
        isFutureRate = false;
      }

      res.json({
        success: true,
        source: 'BCV Oficial (https://www.bcv.org.ve/glosario/cambio-oficial)',
        usdRate: bcvData.usdRate,
        eurRate: bcvData.eurRate,
        valueDate: bcvData.valueDate,
        valueDateText: bcvData.valueDateText,
        effectiveDateLabel,
        isFutureRate,
        checkedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Error fetching BCV rate:', err);
      res.status(500).json({ success: false, error: err?.message || 'Error fetching BCV' });
    }
  });

  // Serve static or Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
