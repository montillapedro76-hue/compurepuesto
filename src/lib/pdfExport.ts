import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface BalancePdfData {
  businessName: string;
  rif?: string;
  periodLabel: string;
  frequency: 'diario' | 'semanal' | 'mensual' | 'todos';
  selectedDate: string;
  generatedAt: string;
  bcvRate: number;
  incomesUsd: number;
  egressesUsd: number;
  balanceUsd: number;
  incomesBs: number;
  egressesBs: number;
  balanceBs: number;
  operationsCount: number;
  paymentMethodsSummary: {
    method: string;
    incomes: number;
    egresses: number;
    net: number;
  }[];
  operations: {
    id: string;
    type: 'ingreso' | 'egreso';
    source: string;
    concept: string;
    amountUsd: number;
    amountBs: number;
    paymentMethod: string;
    time: string;
    date: string;
    operator: string;
  }[];
}

export interface ReportsPdfData {
  businessName: string;
  rif?: string;
  periodLabel: string;
  frequency: string;
  selectedPeriod: string;
  generatedAt: string;
  currency: string;
  currencySymbol: string;
  // Key Financial KPIs
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPercent: number;
  totalOrdersCount: number;
  averageTicket: number;
  // 1. Estado de Resultados (P&L)
  expensesByCategory: { category: string; amount: number; percentage: number }[];
  // 2. Desempeño Equipo de Ventas
  teamPerformance: {
    name: string;
    role: string;
    count: number;
    sales: number;
    percentage: number;
    avgTicket: number;
  }[];
  // 3. Desempeño por Canales
  channelPerformance: {
    channel: string;
    type: string;
    count: number;
    total: number;
    percentage: number;
    avgTicket: number;
  }[];
  // Top Products
  topProducts?: { name: string; sku?: string; quantity: number; total: number; profit?: number }[];
  // 4. Registro Separado: Ingresos y Ventas
  incomes: {
    id: string;
    date: string;
    docType?: string;
    channel: string;
    description: string;
    paymentMethod: string;
    amount: number;
    seller?: string;
    status?: string;
  }[];
  // 5. Registro Separado: Egresos y Gastos Operativos
  egresses: {
    id: string;
    date: string;
    category: string;
    description: string;
    paymentMethod: string;
    amount: number;
    operator?: string;
    status?: string;
  }[];
}

/**
 * Generates and downloads a PDF for the Balance de Operaciones
 */
export function exportBalanceToPdf(data: BalancePdfData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Colors
  const primaryColor: [number, number, number] = [29, 53, 87]; // #1D3557 Trust Navy
  const secondaryColor: [number, number, number] = [64, 224, 208]; // #40E0D0 Agile Cyan
  const darkColor: [number, number, number] = [43, 45, 66]; // #2B2D42 Slate Gray
  const grayColor: [number, number, number] = [100, 116, 139];
  const successColor: [number, number, number] = [16, 149, 106];
  const dangerColor: [number, number, number] = [225, 29, 72];

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Gold accent line
  doc.setFillColor(...secondaryColor);
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Business Name & Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(data.businessName || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.', 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${data.rif || 'J-50123456-7'} • SISTEMA DE GESTIÓN Y CAJA`, 14, 18);
  doc.text(`REPORTE EJECUTIVO DE BALANCE FINANCIERO`, 14, 24);

  // Right-aligned Generation Date
  doc.setFontSize(8);
  doc.text(`Fecha de Emisión: ${data.generatedAt}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Tasa BCV Referencial: Bs. ${data.bcvRate.toFixed(2)}/USD`, pageWidth - 14, 18, { align: 'right' });
  doc.text(`Período: ${data.periodLabel}`, pageWidth - 14, 24, { align: 'right' });

  let currentY = 36;

  // PERIOD & INFO BADGE
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(220, 226, 235);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`PERÍODO EVALUADO:`, 18, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.periodLabel.toUpperCase()}`, 62, currentY + 6);

  doc.setTextColor(...grayColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Filtro: ${data.frequency.toUpperCase()} • Total Movimientos Registrados: ${data.operationsCount}`, 18, currentY + 11);

  currentY += 19;

  // EXECUTIVE KPI CARDS
  const cardWidth = (pageWidth - 28 - 8) / 3;
  const cardHeight = 22;

  // 1. Total Ingresos
  doc.setFillColor(240, 253, 244); // Light emerald
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(14, currentY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setTextColor(...successColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TOTAL INGRESOS / VENTAS', 18, currentY + 6);
  doc.setFontSize(12);
  doc.text(`$${(data.incomesUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 18, currentY + 13);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bs. ${(data.incomesBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 18, currentY + 18);

  // 2. Total Egresos
  const card2X = 14 + cardWidth + 4;
  doc.setFillColor(255, 241, 242); // Light rose
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(card2X, currentY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setTextColor(...dangerColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TOTAL EGRESOS / GASTOS', card2X + 4, currentY + 6);
  doc.setFontSize(12);
  doc.text(`$${(data.egressesUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, card2X + 4, currentY + 13);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bs. ${(data.egressesBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, card2X + 4, currentY + 18);

  // 3. Balance Neto
  const card3X = card2X + cardWidth + 4;
  const isNetPositive = (data.balanceUsd || 0) >= 0;
  doc.setFillColor(isNetPositive ? 239 : 255, isNetPositive ? 246 : 241, isNetPositive ? 255 : 242); // Light blue or rose
  doc.setDrawColor(isNetPositive ? 191 : 254, isNetPositive ? 219 : 205, isNetPositive ? 254 : 211);
  doc.roundedRect(card3X, currentY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setTextColor(isNetPositive ? primaryColor[0] : dangerColor[0], isNetPositive ? primaryColor[1] : dangerColor[1], isNetPositive ? primaryColor[2] : dangerColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BALANCE NETO OPERATIVO', card3X + 4, currentY + 6);
  doc.setFontSize(12);
  doc.text(`${isNetPositive ? '+' : ''}$${(data.balanceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, card3X + 4, currentY + 13);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bs. ${(data.balanceBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, card3X + 4, currentY + 18);

  currentY += cardHeight + 6;

  // PAYMENT METHODS SUMMARY TABLE (If available)
  if (data.paymentMethodsSummary && data.paymentMethodsSummary.length > 0) {
    doc.setTextColor(...darkColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('RESUMEN DE FONDOS POR MÉTODO DE PAGO', 14, currentY);
    currentY += 2;

    const paymentRows = data.paymentMethodsSummary.map(pm => [
      pm.method,
      `$${pm.incomes.toFixed(2)}`,
      `$${pm.egresses.toFixed(2)}`,
      `${pm.net >= 0 ? '+' : ''}$${pm.net.toFixed(2)}`,
      `Bs. ${((Number(pm.net) || 0) * (Number(data.bcvRate) || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Método de Pago', 'Ingresos ($)', 'Egresos ($)', 'Neto ($)', 'Neto Equiv. (Bs)']],
      body: paymentRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'left',
        cellPadding: 2,
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.8,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'right', textColor: [16, 149, 106] },
        2: { halign: 'right', textColor: [225, 29, 72] },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 7;
  }

  // ITEMIZED TRANSACTIONS TABLE
  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`DETALLE DE MOVIMIENTOS INDIVIDUALES (${data.operations.length})`, 14, currentY);
  currentY += 2;

  const tableRows = data.operations.map(op => [
    op.date + (op.time ? ` ${op.time}` : ''),
    op.type === 'ingreso' ? 'INGRESO' : 'EGRESO',
    op.source,
    op.concept,
    op.paymentMethod,
    op.type === 'ingreso' ? `+$${op.amountUsd.toFixed(2)}` : `-$${op.amountUsd.toFixed(2)}`,
    op.type === 'ingreso' ? `+Bs. ${op.amountBs.toFixed(2)}` : `-Bs. ${op.amountBs.toFixed(2)}`,
    op.operator || '-'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Fecha/Hora', 'Tipo', 'Origen', 'Concepto / Detalle', 'Método', 'Monto ($)', 'Monto (Bs)', 'Operador']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left',
      cellPadding: 2,
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 16, fontStyle: 'bold' },
      2: { cellWidth: 20 },
      3: { cellWidth: 42 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 18 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: (dataInfo) => {
      // Footer on every page
      const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : Math.max(1, doc.internal.pages.length - 1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Inversiones y Copias Bella Vista, C.A. • Documento Informativo de Balance • Página ${dataInfo.pageNumber} de ${pageCount}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    }
  });

  const filename = `Balance_BellaVista_${data.frequency}_${data.selectedDate.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(filename);
}

/**
 * Generates and downloads a PDF for the Reportes Dashboard
 */
export function exportReportsToPdf(data: ReportsPdfData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Corporate palette
  const primaryColor: [number, number, number] = [29, 53, 87]; // #1D3557 Trust Navy
  const secondaryColor: [number, number, number] = [64, 224, 208]; // #40E0D0 Agile Cyan
  const darkColor: [number, number, number] = [43, 45, 66]; // #2B2D42 Slate Gray
  const slateColor: [number, number, number] = [51, 65, 85]; // Slate 700
  const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500
  const successColor: [number, number, number] = [16, 149, 106]; // Emerald 600
  const dangerColor: [number, number, number] = [225, 29, 72]; // Rose 600

  // Format money helper
  const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Gold accent line
  doc.setFillColor(...secondaryColor);
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Business Name & Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.businessName || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.', 14, 11);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${data.rif || 'J-50348921-0'}  •  SISTEMA DE GESTIÓN EMPRESARIAL`, 14, 17);
  doc.setFont('helvetica', 'bold');
  doc.text(`INFORME FINANCIERO Y OPERATIVO INTEGRAL`, 14, 23);

  // Right-aligned Generation Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Emisión: ${data.generatedAt}`, pageWidth - 14, 11, { align: 'right' });
  doc.text(`Moneda: ${data.currency} (${data.currencySymbol})`, pageWidth - 14, 17, { align: 'right' });
  doc.text(`Frecuencia: ${data.frequency.toUpperCase()}`, pageWidth - 14, 23, { align: 'right' });

  let currentY = 34;

  // PERIOD & INFO BADGE
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`PERÍODO EVALUADO:`, 18, currentY + 5.5);
  doc.setTextColor(...primaryColor);
  doc.text(`${data.periodLabel.toUpperCase()}`, 58, currentY + 5.5);

  doc.setTextColor(...grayColor);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Volumen: ${data.totalOrdersCount} operaciones  •  Margen Comercial: ${data.grossMarginPercent.toFixed(1)}%  •  Margen Neto: ${data.netMarginPercent.toFixed(1)}%`,
    18,
    currentY + 10.5
  );

  currentY += 18;

  // 6 COMPACT KPI CARDS (3 columns x 2 rows)
  const cardGap = 4;
  const cardWidth = (pageWidth - 28 - (cardGap * 2)) / 3;
  const cardHeight = 15;

  const kpis = [
    {
      title: 'VENTAS TOTALES',
      value: `${data.currencySymbol} ${fmt(data.totalSales)}`,
      color: primaryColor,
      bg: [239, 246, 255] as [number, number, number],
      border: [191, 219, 254] as [number, number, number]
    },
    {
      title: 'COSTO DE VENTAS',
      value: `${data.currencySymbol} ${fmt(data.totalCost)}`,
      color: slateColor,
      bg: [248, 250, 252] as [number, number, number],
      border: [226, 232, 240] as [number, number, number]
    },
    {
      title: 'UTILIDAD BRUTA',
      value: `${data.currencySymbol} ${fmt(data.grossProfit)} (${data.grossMarginPercent.toFixed(1)}%)`,
      color: successColor,
      bg: [240, 253, 244] as [number, number, number],
      border: [187, 247, 208] as [number, number, number]
    },
    {
      title: 'GASTOS OPERATIVOS',
      value: `${data.currencySymbol} ${fmt(data.totalExpenses)}`,
      color: dangerColor,
      bg: [255, 241, 242] as [number, number, number],
      border: [254, 205, 211] as [number, number, number]
    },
    {
      title: 'UTILIDAD OPERATIVA NETA',
      value: `${data.netProfit >= 0 ? '+' : ''}${data.currencySymbol} ${fmt(data.netProfit)} (${data.netMarginPercent.toFixed(1)}%)`,
      color: data.netProfit >= 0 ? successColor : dangerColor,
      bg: data.netProfit >= 0 ? [236, 253, 245] as [number, number, number] : [255, 241, 242] as [number, number, number],
      border: data.netProfit >= 0 ? [167, 243, 208] as [number, number, number] : [254, 205, 211] as [number, number, number]
    },
    {
      title: 'TICKET PROMEDIO',
      value: `${data.currencySymbol} ${fmt(data.averageTicket)}`,
      color: darkColor,
      bg: [248, 250, 252] as [number, number, number],
      border: [226, 232, 240] as [number, number, number]
    }
  ];

  // Draw Row 1
  for (let i = 0; i < 3; i++) {
    const kpi = kpis[i];
    const x = 14 + (i * (cardWidth + cardGap));
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setTextColor(...kpi.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(kpi.title, x + 3.5, currentY + 4.5);

    doc.setFontSize(9);
    doc.text(kpi.value, x + 3.5, currentY + 11.5);
  }

  currentY += cardHeight + 3;

  // Draw Row 2
  for (let i = 3; i < 6; i++) {
    const kpi = kpis[i];
    const x = 14 + ((i - 3) * (cardWidth + cardGap));
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setTextColor(...kpi.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(kpi.title, x + 3.5, currentY + 4.5);

    doc.setFontSize(9);
    doc.text(kpi.value, x + 3.5, currentY + 11.5);
  }

  currentY += cardHeight + 7;

  // Global Page Numbering Footer Helper
  const drawPageFooter = (dataInfo: any) => {
    const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : Math.max(1, doc.internal.pages.length - 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Inversiones y Copias Bella Vista, C.A. • RIF: ${data.rif || 'J-50348921-0'} • Informe de Gestión • Página ${dataInfo.pageNumber} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 7,
      { align: 'center' }
    );
  };

  // =========================================================================
  // 1. ESTADO DE RESULTADOS (P&L / PÉRDIDAS Y GANANCIAS)
  // =========================================================================
  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('1. ESTADO FINANCIERO DE RESULTADOS (PÉRDIDAS Y GANANCIAS)', 14, currentY);
  currentY += 2.5;

  const costPct = data.totalSales > 0 ? (data.totalCost / data.totalSales) * 100 : 0;
  const expPct = data.totalSales > 0 ? (data.totalExpenses / data.totalSales) * 100 : 0;

  const plRows: any[] = [
    [
      '(+) INGRESOS BRUTOS POR VENTAS',
      `${data.currencySymbol} ${fmt(data.totalSales)}`,
      '100.0%',
      'Facturación consolidada (POS Flash, Tienda Online y Mostrador)'
    ],
    [
      '(-) COSTO ESTIMADO DE VENTAS',
      `${data.currencySymbol} ${fmt(data.totalCost)}`,
      `${costPct.toFixed(1)}%`,
      'Costo de adquisición de mercancía y reposición de materiales'
    ],
    [
      '(=) UTILIDAD BRUTA OPERACIONAL',
      `${data.currencySymbol} ${fmt(data.grossProfit)}`,
      `${data.grossMarginPercent.toFixed(1)}%`,
      'Margen de contribución comercial bruto'
    ]
  ];

  // Expenses breakdown
  if (data.expensesByCategory && data.expensesByCategory.length > 0) {
    data.expensesByCategory.forEach(exp => {
      plRows.push([
        `    • ${exp.category}`,
        `${data.currencySymbol} ${fmt(exp.amount)}`,
        `${exp.percentage.toFixed(1)}%`,
        'Gasto operativo devengado en caja'
      ]);
    });
  } else {
    plRows.push([
      '    • Otros Gastos Operativos',
      `${data.currencySymbol} ${fmt(data.totalExpenses)}`,
      `${expPct.toFixed(1)}%`,
      'Gastos generales de caja'
    ]);
  }

  plRows.push([
    '(=) TOTAL GASTOS OPERATIVOS',
    `${data.currencySymbol} ${fmt(data.totalExpenses)}`,
    `${expPct.toFixed(1)}%`,
    'Total egresos operativos del período'
  ]);

  plRows.push([
    '(=) UTILIDAD OPERATIVA NETA',
    `${data.netProfit >= 0 ? '+' : ''}${data.currencySymbol} ${fmt(data.netProfit)}`,
    `${data.netMarginPercent.toFixed(1)}%`,
    'Resultado neto comercial del período (Utilidad Bruta - Gastos)'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Concepto / Cuenta Contable', `Monto (${data.currencySymbol})`, '% s/ Ventas', 'Observaciones / Detalle Contable']],
    body: plRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.8,
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.6,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 58, textColor: [71, 85, 105] },
    },
    didParseCell: (hookData) => {
      // Highlight Utilidad Bruta
      if (hookData.row.index === 2) {
        hookData.cell.styles.fillColor = [240, 249, 255];
        hookData.cell.styles.textColor = primaryColor;
        hookData.cell.styles.fontStyle = 'bold';
      }
      // Highlight Total Gastos
      if (hookData.row.index === plRows.length - 2) {
        hookData.cell.styles.fillColor = [254, 242, 242];
        hookData.cell.styles.textColor = dangerColor;
        hookData.cell.styles.fontStyle = 'bold';
      }
      // Highlight Utilidad Neta
      if (hookData.row.index === plRows.length - 1) {
        hookData.cell.styles.fillColor = data.netProfit >= 0 ? [236, 253, 245] : [255, 241, 242];
        hookData.cell.styles.textColor = data.netProfit >= 0 ? successColor : dangerColor;
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: drawPageFooter,
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 7;

  // =========================================================================
  // 2. DESEMPEÑO DEL EQUIPO DE VENTAS Y CANALES
  // =========================================================================
  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('2. DESEMPEÑO DEL EQUIPO DE VENTAS Y CANALES COMERCIALES', 14, currentY);
  currentY += 2.5;

  // Table 2.1: Desempeño del Equipo de Ventas / Cajeros
  const teamRows = (data.teamPerformance && data.teamPerformance.length > 0)
    ? data.teamPerformance.map((emp, idx) => [
        `${idx + 1}. ${emp.name}`,
        emp.role || (idx === 0 ? 'Líder de Ventas' : 'Operador / Cajero'),
        emp.count.toString(),
        `${data.currencySymbol} ${fmt(emp.sales)}`,
        `${data.currencySymbol} ${fmt(emp.avgTicket)}`,
        `${emp.percentage.toFixed(1)}%`
      ])
    : [['Sin colaboradores registrados', 'Operador', '0', `${data.currencySymbol} 0.00`, `${data.currencySymbol} 0.00`, '0.0%']];

  // Team totals footer
  const totalTeamOps = data.teamPerformance.reduce((s, e) => s + e.count, 0);
  const totalTeamSales = data.teamPerformance.reduce((s, e) => s + e.sales, 0);
  const avgTeamTicket = totalTeamOps > 0 ? totalTeamSales / totalTeamOps : 0;

  teamRows.push([
    'TOTAL EQUIPO DE VENTAS',
    '-',
    totalTeamOps.toString(),
    `${data.currencySymbol} ${fmt(totalTeamSales)}`,
    `${data.currencySymbol} ${fmt(avgTeamTicket)}`,
    '100.0%'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Vendedor / Colaborador', 'Rol / Cargo', 'N° Ops', `Total Facturado (${data.currencySymbol})`, 'Ticket Prom.', '% Contribución']],
    body: teamRows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.8,
    },
    styles: {
      fontSize: 6.4,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold' },
      1: { cellWidth: 38, textColor: [71, 85, 105] },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === teamRows.length - 1) {
        hookData.cell.styles.fillColor = [241, 245, 249];
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: drawPageFooter,
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 4;

  // Table 2.2: Desempeño por Canales de Venta
  const channelRows = (data.channelPerformance && data.channelPerformance.length > 0)
    ? data.channelPerformance.map(ch => [
        ch.channel,
        ch.type || 'Punto de Venta',
        ch.count.toString(),
        `${data.currencySymbol} ${fmt(ch.total)}`,
        `${data.currencySymbol} ${fmt(ch.avgTicket)}`,
        `${ch.percentage.toFixed(1)}%`
      ])
    : [['Caja POS Flash', 'Física', '0', `${data.currencySymbol} 0.00`, `${data.currencySymbol} 0.00`, '0.0%']];

  const totalChannelOps = data.channelPerformance.reduce((s, c) => s + c.count, 0);
  const totalChannelSales = data.channelPerformance.reduce((s, c) => s + c.total, 0);
  const avgChannelTicket = totalChannelOps > 0 ? totalChannelSales / totalChannelOps : 0;

  channelRows.push([
    'TOTAL CANALES COMERCIALES',
    '-',
    totalChannelOps.toString(),
    `${data.currencySymbol} ${fmt(totalChannelSales)}`,
    `${data.currencySymbol} ${fmt(avgChannelTicket)}`,
    '100.0%'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Canal de Comercialización', 'Tipo / Modalidad', 'N° Ops', `Total Recaudado (${data.currencySymbol})`, 'Ticket Prom.', '% Participación']],
    body: channelRows,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.8,
    },
    styles: {
      fontSize: 6.4,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold' },
      1: { cellWidth: 38, textColor: [71, 85, 105] },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: successColor },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === channelRows.length - 1) {
        hookData.cell.styles.fillColor = [241, 245, 249];
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: drawPageFooter,
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 7;

  // =========================================================================
  // 3. TOP PRODUCTOS Y SERVICIOS MÁS VENDIDOS
  // =========================================================================
  if (data.topProducts && data.topProducts.length > 0) {
    doc.setTextColor(...darkColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('3. PRODUCTOS Y SERVICIOS CON MAYOR VOLUMEN Y FACTURACIÓN', 14, currentY);
    currentY += 2.5;

    const prodRows = data.topProducts.slice(0, 10).map((p, idx) => {
      const share = data.totalSales > 0 ? (p.total / data.totalSales) * 100 : 0;
      return [
        (idx + 1).toString(),
        p.name,
        p.sku || 'N/A',
        `${p.quantity} unid.`,
        `${data.currencySymbol} ${fmt(p.total)}`,
        `${data.currencySymbol} ${fmt(p.profit || (p.total * 0.3))}`,
        `${share.toFixed(1)}%`
      ];
    });

    const sumTopQty = data.topProducts.slice(0, 10).reduce((s, p) => s + p.quantity, 0);
    const sumTopSales = data.topProducts.slice(0, 10).reduce((s, p) => s + p.total, 0);
    const sumTopProfit = data.topProducts.slice(0, 10).reduce((s, p) => s + (p.profit || (p.total * 0.3)), 0);
    const sumTopShare = data.totalSales > 0 ? (sumTopSales / data.totalSales) * 100 : 0;

    prodRows.push([
      '',
      'TOTAL TOP 10 PRODUCTOS',
      '-',
      `${sumTopQty} unid.`,
      `${data.currencySymbol} ${fmt(sumTopSales)}`,
      `${data.currencySymbol} ${fmt(sumTopProfit)}`,
      `${sumTopShare.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Producto / Servicio', 'SKU / Ref', 'Cantidad', `Ventas (${data.currencySymbol})`, `Ganancia Est. (${data.currencySymbol})`, '% Ventas']],
      body: prodRows,
      theme: 'grid',
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.8,
        cellPadding: 1.8,
      },
      styles: {
        fontSize: 6.3,
        cellPadding: 1.4,
        textColor: [15, 23, 42],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 62, fontStyle: 'bold' },
        2: { cellWidth: 24, halign: 'center', textColor: [100, 116, 139] },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 26, halign: 'right', textColor: successColor },
        6: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        if (hookData.row.index === prodRows.length - 1) {
          hookData.cell.styles.fillColor = [241, 245, 249];
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14, bottom: 16 },
      didDrawPage: drawPageFooter,
    });

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 7;
  }

  // =========================================================================
  // 4. REGISTRO DETALLADO DE INGRESOS Y VENTAS (TABLA SEPARADA)
  // =========================================================================
  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`4. REGISTRO DETALLADO DE INGRESOS Y VENTAS FACTURADAS (${data.incomes.length} Operaciones)`, 14, currentY);
  currentY += 2.5;

  const incomesRows = data.incomes.length > 0
    ? data.incomes.map(inc => [
        inc.id || '-',
        inc.date || '-',
        inc.channel || 'POS Flash',
        inc.description || 'Venta de mostrador',
        inc.paymentMethod || 'Efectivo',
        inc.seller || 'Cajero',
        `${data.currencySymbol} ${fmt(inc.amount)}`,
        inc.status || 'Completado'
      ])
    : [['-', '-', '-', 'Sin ingresos registrados en el período', '-', '-', `${data.currencySymbol} 0.00`, '-']];

  const totalIncomesSum = data.incomes.reduce((s, i) => s + i.amount, 0);

  incomesRows.push([
    'TOTAL INGRESOS',
    '-',
    '-',
    `${data.incomes.length} Operaciones procesadas`,
    '-',
    '-',
    `${data.currencySymbol} ${fmt(totalIncomesSum)}`,
    'Completado'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['ID / Ref', 'Fecha', 'Canal', 'Detalle / Cliente', 'Método Pago', 'Vendedor / Cajero', `Monto (${data.currencySymbol})`, 'Estado']],
    body: incomesRows,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.8,
    },
    styles: {
      fontSize: 6.2,
      cellPadding: 1.4,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 20 },
      3: { cellWidth: 46 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: successColor },
      7: { cellWidth: 12, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === incomesRows.length - 1) {
        hookData.cell.styles.fillColor = [240, 253, 244];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = successColor;
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: drawPageFooter,
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 7;

  // =========================================================================
  // 5. REGISTRO DETALLADO DE EGRESOS Y GASTOS (TABLA SEPARADA)
  // =========================================================================
  doc.setTextColor(...darkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`5. REGISTRO DETALLADO DE EGRESOS Y GASTOS OPERATIVOS (${data.egresses.length} Egresos)`, 14, currentY);
  currentY += 2.5;

  const egressesRows = data.egresses.length > 0
    ? data.egresses.map(egr => [
        egr.id || '-',
        egr.date || '-',
        egr.category || 'Gasto Operativo',
        egr.description || 'Gasto de caja',
        egr.paymentMethod || 'Efectivo',
        egr.operator || 'Administrador',
        `${data.currencySymbol} ${fmt(egr.amount)}`,
        egr.status || 'Pagado'
      ])
    : [['-', '-', '-', 'Sin egresos registrados en el período', '-', '-', `${data.currencySymbol} 0.00`, '-']];

  const totalEgressesSum = data.egresses.reduce((s, e) => s + e.amount, 0);

  egressesRows.push([
    'TOTAL EGRESOS',
    '-',
    '-',
    `${data.egresses.length} Egresos registrados`,
    '-',
    '-',
    `${data.currencySymbol} ${fmt(totalEgressesSum)}`,
    'Pagado'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['ID / Ref', 'Fecha', 'Categoría de Gasto', 'Concepto / Proveedor', 'Método Pago', 'Responsable', `Monto (${data.currencySymbol})`, 'Estado']],
    body: egressesRows,
    theme: 'striped',
    headStyles: {
      fillColor: dangerColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.8,
    },
    styles: {
      fontSize: 6.2,
      cellPadding: 1.4,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 26, fontStyle: 'bold' },
      3: { cellWidth: 40 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: dangerColor },
      7: { cellWidth: 12, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [255, 248, 248],
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === egressesRows.length - 1) {
        hookData.cell.styles.fillColor = [255, 241, 242];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = dangerColor;
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: drawPageFooter,
  });

  const filename = `Informe_Gestion_BellaVista_${data.frequency}_${data.selectedPeriod.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(filename);
}

/**
 * Printable HTML generator for native direct browser print dialog with styled A4 / letter layout
 */
export function printDirectFormattedHtml(title: string, htmlContent: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor permite ventanas emergentes para imprimir el reporte.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 12mm 15mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          background: #fff;
          margin: 0;
          padding: 0;
          font-size: 11px;
          line-height: 1.4;
        }
        .header {
          background: #005da9;
          color: #fff;
          padding: 16px 20px;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .header h1 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .header p {
          margin: 0;
          font-size: 10px;
          opacity: 0.9;
        }
        .meta-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 10px 14px;
          border-radius: 6px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        .kpi-card {
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
        }
        .kpi-card.green { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
        .kpi-card.red { background: #fff1f2; border-color: #fecdd3; color: #9f1239; }
        .kpi-card.blue { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
        .kpi-title { font-size: 9px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
        .kpi-value { font-size: 16px; font-weight: 800; }
        .kpi-sub { font-size: 9px; opacity: 0.85; margin-top: 2px; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          font-size: 9.5px;
        }
        th {
          background: #005da9;
          color: white;
          text-align: left;
          padding: 6px 8px;
          font-weight: 700;
        }
        td {
          padding: 5px 8px;
          border-bottom: 1px solid #e2e8f0;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .footer {
          margin-top: 24px;
          text-align: center;
          font-size: 8.5px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <div class="footer">
        Documento generado automáticamente por el Sistema de Caja y Reportes de Inversiones y Copias Bella Vista, C.A.
      </div>
      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
