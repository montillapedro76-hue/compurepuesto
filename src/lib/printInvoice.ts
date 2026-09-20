import { parseInvoiceItems } from './supabase';
import { getCachedCurrencyRates } from './currency';

// Printable invoice generator supporting Letter (Carta), 58mm POS thermal, and 80mm POS thermal
export const printInvoiceDocument = (
  invoice: any,
  businessInfo: { name?: string; storeName?: string; rif?: string; phone?: string; address?: string },
  format: 'carta' | '58mm' | '80mm' = 'carta',
  bcvRate: number = getCachedCurrencyRates().VES
) => {
  if (!invoice) return;

  const rate = invoice.bcv_rate || bcvRate || getCachedCurrencyRates().VES;
  const items = parseInvoiceItems(invoice.items, invoice);
  const isNota = invoice.document_type === 'nota_entrega' || (invoice.control_number && String(invoice.control_number).startsWith('NE-'));
  const docTitle = isNota ? 'NOTA DE ENTREGA' : 'FACTURA DE VENTA';
  const docNumber = invoice.control_number || (isNota ? 'NE-0001' : 'FAC-0001');
  const dateStr = new Date(invoice.created_at || Date.now()).toLocaleDateString('es-VE');
  const clientName = invoice.customer_name || 'Consumidor final';
  const clientDoc = invoice.customer_document || invoice.rif || invoice.document || 'N/A';
  const clientAddress = invoice.customer_address || 'Ciudad';

  const subtotalUsd = Number(invoice.subtotal || 0);
  const totalUsd = Number(invoice.total || 0);
  const ivaUsd = Number(invoice.iva || 0);
  const igtfUsd = Number(invoice.igtf || 0);
  const discountUsd = Number(invoice.discount || 0);
  const extraChargesUsd = Number(invoice.extra_charges || 0);

  const subtotalBs = subtotalUsd * rate;
  const totalBs = totalUsd * rate;
  const ivaBs = ivaUsd * rate;
  const igtfBs = igtfUsd * rate;

  let htmlContent = '';

  if (format === 'carta') {
    htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} ${docNumber}</title>
  <style>
    @page { size: letter portrait; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; color: #1e293b; line-height: 1.4; padding: 15px; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #1D3557; padding-bottom: 12px; }
    .company-title { font-size: 18px; font-weight: 900; color: #1D3557; text-transform: uppercase; letter-spacing: -0.5px; }
    .company-info { font-size: 11px; color: #2B2D42; text-align: right; }
    .meta-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; background: #F8F9FA; }
    .meta-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; font-size: 11px; }
    .meta-item strong { color: #2B2D42; text-transform: uppercase; font-size: 9px; display: block; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #1D3557; color: #ffffff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; text-align: left; }
    th.num, td.num { text-align: right; }
    th.center, td.center { text-align: center; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px; color: #2B2D42; }
    tr:nth-child(even) { background: #fafafa; }
    .totals-wrapper { display: flex; justify-content: flex-end; margin-top: 8px; }
    .totals-table { width: 340px; }
    .totals-table td { padding: 3px 6px; font-size: 11px; }
    .total-row { font-size: 13px; font-weight: 900; color: #1D3557; border-top: 2px solid #1D3557; }
    .rate-badge { background: #F8F9FA; color: #1D3557; border: 1px solid #40E0D0; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; margin-top: 6px; text-align: right; }
    .footer { margin-top: 24px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-title">${businessInfo.storeName || businessInfo.name || 'COPIAS BELLA VISTA, C.A.'}</div>
      <div style="font-size: 11px; font-weight: bold; color: #1D3557; margin-top: 2px;">${docTitle}: ${docNumber}</div>
    </div>
    <div class="company-info">
      <div><strong>RIF:</strong> ${businessInfo.rif || 'J-12345678-9'}</div>
      <div>${businessInfo.address || 'Av. Principal'}</div>
      <div><strong>Telf:</strong> ${businessInfo.phone || '0414-0000000'}</div>
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-grid">
      <div class="meta-item"><strong>Cliente</strong> ${clientName}</div>
      <div class="meta-item"><strong>C.I. / RIF</strong> ${clientDoc}</div>
      <div class="meta-item"><strong>Fecha</strong> ${dateStr}</div>
      <div class="meta-item" style="grid-column: span 2;"><strong>Dirección</strong> ${clientAddress}</div>
      <div class="meta-item"><strong>Método de Pago</strong> ${invoice.payment_method || 'Efectivo'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width: 40px;">CANT</th>
        <th>DESCRIPCIÓN</th>
        <th class="num">PRECIO USD</th>
        <th class="num">TOTAL USD</th>
        <th class="num">PRECIO BS</th>
        <th class="num">TOTAL BS</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it: any) => {
        const itemPrice = Number(it.price || 0);
        const itemTotal = Number(it.total || itemPrice * (it.qty || 1));
        const itemPriceBs = itemPrice * rate;
        const itemTotalBs = itemTotal * rate;
        return `
        <tr>
          <td class="center font-bold">${it.qty || 1}</td>
          <td><strong>${it.name || 'Producto'}</strong> ${it.sku ? `<span style="color:#94a3b8; font-size:9px;">(${it.sku})</span>` : ''}</td>
          <td class="num font-mono">$${itemPrice.toFixed(2)}</td>
          <td class="num font-mono font-bold">$${itemTotal.toFixed(2)}</td>
          <td class="num font-mono">Bs. ${itemPriceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="num font-mono font-bold">Bs. ${itemTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="totals-wrapper">
    <table class="totals-table">
      <tr>
        <td>Subtotal:</td>
        <td class="num font-mono font-bold">$${subtotalUsd.toFixed(2)}</td>
        <td class="num font-mono" style="color: #64748b;">Bs. ${subtotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
      ${discountUsd > 0 ? `
      <tr style="color: #059669;">
        <td>Descuento:</td>
        <td class="num font-mono">-$${discountUsd.toFixed(2)}</td>
        <td class="num font-mono">-Bs. ${(discountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>` : ''}
      ${extraChargesUsd > 0 ? `
      <tr>
        <td>Cargos Extras:</td>
        <td class="num font-mono">+$${extraChargesUsd.toFixed(2)}</td>
        <td class="num font-mono">+Bs. ${(extraChargesUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>` : ''}
      ${ivaUsd > 0 ? `
      <tr>
        <td>IVA (16%):</td>
        <td class="num font-mono font-bold">$${ivaUsd.toFixed(2)}</td>
        <td class="num font-mono">Bs. ${ivaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>` : ''}
      ${igtfUsd > 0 ? `
      <tr>
        <td>IGTF (3%):</td>
        <td class="num font-mono font-bold">$${igtfUsd.toFixed(2)}</td>
        <td class="num font-mono">Bs. ${igtfBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>` : ''}
      <tr class="total-row">
        <td style="padding-top: 6px;">TOTAL A PAGAR:</td>
        <td class="num font-mono" style="padding-top: 6px; color: #1D3557;">$${totalUsd.toFixed(2)}</td>
        <td class="num font-mono" style="padding-top: 6px; color: #1D3557;">Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>

  <div class="rate-badge">
    Tasa BCV Aplicada: 1 USD = Bs. ${rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  </div>

  <div class="footer">
    <p>*** GRACIAS POR SU COMPRA ***</p>
    <p>${isNota ? 'Este documento es una Nota de Entrega válida.' : 'Este documento es una representación digital de la factura fiscal.'}</p>
  </div>
</body>
</html>
`;
  } else {
    // 58mm or 80mm POS Thermal Receipt
    const widthMm = format === '58mm' ? '54mm' : '76mm';
    htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} ${docNumber}</title>
  <style>
    @page { size: ${widthMm} auto; margin: 1mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; width: ${widthMm}; font-size: ${format === '58mm' ? '10px' : '12px'}; color: #000; padding: 4px; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: inherit; }
    th { border-bottom: 1px dashed #000; padding-bottom: 2px; }
    td { padding: 2px 0; }
    .totals td { padding: 1px 0; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size: ${format === '58mm' ? '12px' : '14px'};">${businessInfo.storeName || businessInfo.name || 'COPIAS BELLA VISTA, C.A.'}</div>
  <div class="center">RIF: ${businessInfo.rif || 'J-12345678-9'}</div>
  <div class="center">${businessInfo.address || 'Av. Principal'}</div>
  <div class="center">Telf: ${businessInfo.phone || '0414-0000000'}</div>
  <div class="divider"></div>
  <div class="center bold">${docTitle}</div>
  <div class="center bold">${docNumber}</div>
  <div class="divider"></div>
  <div>FECHA: ${dateStr}</div>
  <div>CLIENTE: ${clientName}</div>
  <div>C.I/RIF: ${clientDoc}</div>
  <div>PAGO: ${invoice.payment_method || 'Efectivo'}</div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th style="text-align: left;">CANT DETALLE</th>
        <th style="text-align: right;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it: any) => {
        const itemTotal = Number(it.total || (Number(it.price || 0) * Number(it.qty || 1)));
        const itemTotalBs = itemTotal * rate;
        return `
        <tr>
          <td colspan="2" class="bold">${it.name || 'Producto'}</td>
        </tr>
        <tr>
          <td>${it.qty || 1} x $${Number(it.price || 0).toFixed(2)}</td>
          <td class="right bold font-mono">$${itemTotal.toFixed(2)} / Bs. ${itemTotalBs.toFixed(2)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div class="divider"></div>
  <table class="totals">
    <tr>
      <td>SUBTOTAL:</td>
      <td class="right bold font-mono">$${subtotalUsd.toFixed(2)}</td>
    </tr>
    ${discountUsd > 0 ? `
    <tr>
      <td>DESCUENTO:</td>
      <td class="right font-mono">-$${discountUsd.toFixed(2)}</td>
    </tr>` : ''}
    ${extraChargesUsd > 0 ? `
    <tr>
      <td>CARGOS EXTRAS:</td>
      <td class="right font-mono">+$${extraChargesUsd.toFixed(2)}</td>
    </tr>` : ''}
    ${ivaUsd > 0 ? `
    <tr>
      <td>IVA (16%):</td>
      <td class="right font-mono">$${ivaUsd.toFixed(2)}</td>
    </tr>` : ''}
    ${igtfUsd > 0 ? `
    <tr>
      <td>IGTF (3%):</td>
      <td class="right font-mono">$${igtfUsd.toFixed(2)}</td>
    </tr>` : ''}
    <tr class="bold" style="font-size: ${format === '58mm' ? '12px' : '14px'};">
      <td style="padding-top: 4px;">TOTAL USD:</td>
      <td class="right" style="padding-top: 4px;">$${totalUsd.toFixed(2)}</td>
    </tr>
    <tr class="bold" style="font-size: ${format === '58mm' ? '12px' : '14px'};">
      <td>TOTAL BS:</td>
      <td class="right">Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  </table>
  <div class="divider"></div>
  <div class="center" style="font-size: 9px;">Tasa BCV: 1 USD = Bs. ${rate.toFixed(2)}</div>
  <div class="center bold" style="margin-top: 6px;">*** GRACIAS POR SU COMPRA ***</div>
</body>
</html>
`;
  }

  // Create an invisible iframe to execute clean background print without messing with UI
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 300);
  }
};
