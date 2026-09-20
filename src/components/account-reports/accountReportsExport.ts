import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { BankAccount, AccountReceivable, AccountReceivablePayment, AccountPayable, AccountPayablePayment, BusinessProfile } from '../../types';

// Shared Excel styling constants & helpers for accounting reports
const EXCEL_NAVY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2631' } };
const EXCEL_HEADER_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const EXCEL_SECTION_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAECEE' } };
const EXCEL_SECTION_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
const EXCEL_ZEBRA_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F4' } };
const EXCEL_TOTAL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF16A085' } };
const EXCEL_TOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF1B2631' } },
  bottom: { style: 'double', color: { argb: 'FF1B2631' } }
};
const EXCEL_DATA_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  bottom: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  left: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  right: { style: 'thin', color: { argb: 'FFD5D8DC' } }
};

const addStyledAccountTable = (
  sheet: ExcelJS.Worksheet,
  sectionTitle: string | null,
  headers: string[],
  dataRows: (string | number)[][],
  totalRow?: (string | number)[],
  alignments?: ('left' | 'center' | 'right')[]
) => {
  sheet.views = [{ showGridLines: true }];

  if (sectionTitle) {
    const secRow = sheet.addRow([sectionTitle]);
    secRow.height = 24;
    secRow.getCell(1).fill = EXCEL_SECTION_FILL;
    secRow.getCell(1).font = EXCEL_SECTION_FONT;
    secRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  }

  // 1. Cabeceras de Tablas: Fondo #1B2631, Texto Blanco #FFFFFF en Negrita, con alineación ajustada
  const headerRow = sheet.addRow(headers);
  headerRow.height = 25;
  headerRow.eachCell((cell, colNum) => {
    cell.fill = EXCEL_NAVY_FILL;
    cell.font = EXCEL_HEADER_FONT;
    const align = alignments?.[colNum - 1] || 'left';
    cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1B2631' } },
      bottom: { style: 'medium', color: { argb: 'FF1B2631' } },
      left: { style: 'thin', color: { argb: 'FF2C3E50' } },
      right: { style: 'thin', color: { argb: 'FF2C3E50' } }
    };
  });

  // 3. Filas de Datos con sombreado alternado (Zebra #F2F4F4 en filas pares intercaladas)
  dataRows.forEach((rowValues, idx) => {
    const row = sheet.addRow(rowValues);
    row.height = 20;
    const isZebra = idx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (isZebra) {
        cell.fill = EXCEL_ZEBRA_FILL;
      }
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2C3E50' } };
      cell.border = EXCEL_DATA_BORDER;
      const align = alignments?.[colNum - 1] || (typeof rowValues[colNum - 1] === 'number' ? 'right' : 'left');
      cell.alignment = { vertical: 'middle', horizontal: align };
    });
  });

  // 2. Totales Generales: Texto Verde Esmeralda en Negrita (#16A085) y Borde Contable Oficial (top thin, bottom double)
  if (totalRow) {
    const tRow = sheet.addRow(totalRow);
    tRow.height = 23;
    tRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = EXCEL_TOTAL_FONT;
      cell.border = EXCEL_TOTAL_BORDER;
      const align = alignments?.[colNum - 1] || (colNum === 1 ? 'left' : 'right');
      cell.alignment = { vertical: 'middle', horizontal: align };
    });
  }

  sheet.addRow([]);
};

const triggerExcelDownload = async (workbook: ExcelJS.Workbook, fileName: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

interface BankStatementExportParams {
  account: BankAccount;
  startDate: string;
  endDate: string;
  initialBalance: number;
  finalBalance: number;
  totalIncome: number;
  totalExpense: number;
  totalCommissions: number;
  movements: Array<{
    date: string;
    reference: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    amountVES?: number;
  }>;
  businessProfile?: BusinessProfile | null;
  bcvRate: number;
}

// --------------------------------------------------------------------------
// 1. ESTADO DE CUENTA BANCARIA: PDF & EXCEL
// --------------------------------------------------------------------------
export const exportBankStatementPDF = ({
  account,
  startDate,
  endDate,
  initialBalance,
  finalBalance,
  totalIncome,
  totalExpense,
  totalCommissions,
  movements,
  businessProfile,
  bcvRate
}: BankStatementExportParams) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const primaryColor: [number, number, number] = [29, 53, 87]; // #1D3557
  const accentColor: [number, number, number] = [230, 57, 70]; // #E63946
  const darkGray: [number, number, number] = [43, 45, 66];

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 216, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((businessProfile?.name || 'COPIAS BELLA VISTA, C.A.').toUpperCase(), 14, 11);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${businessProfile?.rif || 'J-50987654-3'}  |  Tasa BCV Referencial: Bs. ${bcvRate.toFixed(2)}`, 14, 18);
  doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE')}`, 14, 23);

  // Title Box
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA BANCARIO OFICIAL', 202, 12, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${startDate} al ${endDate}`, 202, 18, { align: 'right' });
  doc.text(`Moneda: ${account.currency}`, 202, 23, { align: 'right' });

  // Account Information Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 32, 188, 22, 2, 2, 'FD');

  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`INSTITUCIÓN: ${account.bank_name || account.name}`, 18, 38);
  doc.text(`N° CUENTA: ${account.account_number || 'N/D'}`, 18, 44);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkGray);
  doc.text(`Tipo / Identificador: ${account.name} (${account.account_type || 'Corriente'})`, 18, 50);

  // Helper for multi-currency formatting
  const formatMoney = (amount: number, currency: string) => {
    const curr = (currency || 'VES').toUpperCase();
    const formatted = Number(amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (curr === 'USD') return `$ ${formatted}`;
    if (curr === 'USDT') return `${formatted} USDT`;
    if (curr === 'EUR') return `€ ${formatted}`;
    if (curr === 'COP') return `COP$ ${Number(amount || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
    return `Bs. ${formatted}`;
  };

  // Summary KPI box right side
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(`Saldo Inicial: ${formatMoney(initialBalance, account.currency)}`, 120, 38);
  doc.setTextColor(16, 185, 129); // Green
  doc.text(`Total Ingresos (+): ${formatMoney(totalIncome, account.currency)}`, 120, 44);
  doc.setTextColor(225, 29, 72); // Red
  doc.text(`Total Egresos (-): ${formatMoney(totalExpense, account.currency)}`, 120, 50);

  // Saldo Final Pill
  doc.setFillColor(29, 53, 87);
  doc.roundedRect(14, 57, 188, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `SALDO DISPONIBLE AL CORTE: ${formatMoney(finalBalance, account.currency)}`,
    18,
    63.5
  );
  if (account.currency === 'USD' || account.currency === 'USDT') {
    doc.setFontSize(8.5);
    doc.text(`(Equivalente BCV: Bs. ${(finalBalance * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, 130, 63.5);
  } else {
    doc.setFontSize(8.5);
    doc.text(`(Equivalente USD: $ ${(bcvRate > 0 ? finalBalance / bcvRate : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, 130, 63.5);
  }

  // Movements Table
  const tableRows = movements.map(m => [
    m.date,
    m.reference || 'N/A',
    m.type,
    m.description,
    m.debit > 0 ? `-${m.debit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
    m.credit > 0 ? `+${m.credit.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
    `${m.balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['Fecha', 'Referencia', 'Operación', 'Concepto / Beneficiario', 'Débito (-)', 'Crédito (+)', 'Saldo']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59]
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 60 },
      4: { cellWidth: 20, halign: 'right', textColor: [225, 29, 72] },
      5: { cellWidth: 20, halign: 'right', textColor: [16, 185, 129] },
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { left: 14, right: 14 }
  });

  // Footer / Signatures
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${i} de ${pageCount}  •  Sistema Administrativo Copias Bella Vista  •  Documento Confidencial`, 108, 272, { align: 'center' });
  }

  doc.save(`Estado_Cuenta_${account.bank_name || account.name}_${startDate}_${endDate}.pdf`);
};

export const exportBankStatementExcel = async ({
  account,
  startDate,
  endDate,
  initialBalance,
  finalBalance,
  totalIncome,
  totalExpense,
  movements,
  businessProfile,
  bcvRate
}: BankStatementExportParams) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = businessProfile?.name || 'Inversiones y Copias Bella Vista';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Estado de Cuenta', { views: [{ showGridLines: true }] });

  // Institutional header block
  const businessName = businessProfile?.name || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.';
  const r1 = sheet.addRow([businessName.toUpperCase(), '', '', '', '', '', 'ESTADO DE CUENTA BANCARIO']);
  r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(7).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(7).alignment = { horizontal: 'right' };

  const r2 = sheet.addRow([`Institución: ${account.bank_name || account.name} | Cuenta: ${account.account_number || 'N/A'}`, '', '', '', '', '', `Período: ${startDate} al ${endDate}`]);
  r2.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };
  r2.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r2.getCell(7).alignment = { horizontal: 'right' };

  const r3 = sheet.addRow([`Moneda: ${account.currency} | Tasa BCV: Bs. ${bcvRate.toFixed(2)}`, '', '', '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`]);
  r3.getCell(1).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(7).alignment = { horizontal: 'right' };
  sheet.addRow([]);

  // Helper for multi-currency formatting
  const formatMoney = (amount: number, currency: string) => {
    const curr = (currency || 'VES').toUpperCase();
    const formatted = Number(amount || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (curr === 'USD') return `$ ${formatted}`;
    if (curr === 'USDT') return `${formatted} USDT`;
    if (curr === 'EUR') return `€ ${formatted}`;
    if (curr === 'COP') return `COP$ ${Number(amount || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
    return `Bs. ${formatted}`;
  };

  // Summary table
  const summaryRows = [
    ['Saldo Inicial', formatMoney(initialBalance, account.currency)],
    ['Total Ingresos (+)', formatMoney(totalIncome, account.currency)],
    ['Total Egresos (-)', formatMoney(totalExpense, account.currency)],
  ];
  const summaryTotal = [
    'Saldo Final al Corte',
    formatMoney(finalBalance, account.currency)
  ];
  addStyledAccountTable(
    sheet,
    'RESUMEN FINANCIERO DEL PERÍODO',
    ['Concepto', 'Monto'],
    summaryRows,
    summaryTotal,
    ['left', 'right']
  );

  // Movements table
  const movRows = movements.map(m => [
    m.date,
    m.reference || 'N/A',
    m.type,
    m.description,
    formatMoney(m.debit > 0 ? m.debit : 0, account.currency),
    formatMoney(m.credit > 0 ? m.credit : 0, account.currency),
    formatMoney(m.balance, account.currency)
  ]);

  const movTotal = [
    'TOTALES Y SALDO FINAL',
    '-',
    '-',
    '-',
    formatMoney(totalExpense, account.currency),
    formatMoney(totalIncome, account.currency),
    formatMoney(finalBalance, account.currency)
  ];

  addStyledAccountTable(
    sheet,
    `DETALLE DE MOVIMIENTOS BANCARIOS (${movements.length} OPERACIONES)`,
    ['Fecha / Hora', 'Referencia', 'Tipo Operación', 'Concepto / Descripción', 'Débito (-)', 'Crédito (+)', 'Saldo Progresivo'],
    movRows,
    movTotal,
    ['center', 'center', 'center', 'left', 'right', 'right', 'right']
  );

  sheet.columns = [
    { width: 22 },
    { width: 18 },
    { width: 20 },
    { width: 35 },
    { width: 20 },
    { width: 20 },
    { width: 22 }
  ];

  await triggerExcelDownload(workbook, `Estado_Cuenta_${account.bank_name || account.name}_${startDate}_${endDate}.xlsx`);
};

// --------------------------------------------------------------------------
// 2. ESTADO DE CUENTAS POR COBRAR (CxC): PDF & EXCEL
// --------------------------------------------------------------------------
interface CxCExportParams {
  mode: 'consolidado' | 'por_cliente' | 'por_vencer' | 'detallado' | 'historial';
  selectedClientName?: string;
  startDate: string;
  endDate: string;
  totals: {
    totalPendingUSD: number;
    totalPendingVES: number;
    totalOriginalUSD: number;
    totalPaidUSD: number;
    overdueCount: number;
    overdueAmountUSD: number;
    activeClientsCount: number;
  };
  receivables: AccountReceivable[];
  payments: AccountReceivablePayment[];
  businessProfile?: BusinessProfile | null;
  bcvRate: number;
}

export const exportCxCPDF = ({
  mode,
  selectedClientName,
  startDate,
  endDate,
  totals,
  receivables,
  payments,
  businessProfile,
  bcvRate
}: CxCExportParams) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const primaryColor: [number, number, number] = [29, 53, 87];

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 216, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((businessProfile?.name || 'COPIAS BELLA VISTA, C.A.').toUpperCase(), 14, 10);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${businessProfile?.rif || 'J-50987654-3'}  |  Tasa BCV: Bs. ${bcvRate.toFixed(2)}`, 14, 16);
  doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE')}`, 14, 21);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  const modeTitle =
    mode === 'por_cliente'
      ? `ESTADO DE CUENTA: ${selectedClientName || 'CLIENTE'}`
      : mode === 'por_vencer'
      ? 'REPORTE DE CUENTAS POR COBRAR POR VENCER'
      : mode === 'historial'
      ? 'HISTORIAL CRONOLÓGICO DE ABONOS RECIBIDOS'
      : 'REPORTE CONSOLIDADO DE CUENTAS POR COBRAR';
  doc.text(modeTitle, 202, 12, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${startDate} al ${endDate}`, 202, 18, { align: 'right' });

  // Summary Metric Badges
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 30, 188, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL PENDIENTE: $${totals.totalPendingUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 18, 37);
  doc.text(`Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 18, 43);

  doc.setTextColor(71, 85, 105);
  doc.text(`Total Facturado a Crédito: $${totals.totalOriginalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 85, 37);
  doc.setTextColor(16, 185, 129);
  doc.text(`Total Cobrado / Recuperado: $${totals.totalPaidUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 85, 43);

  doc.setTextColor(225, 29, 72);
  doc.text(`Cuentas Vencidas: ${totals.overdueCount} ($${totals.overdueAmountUSD.toFixed(2)})`, 150, 37);
  doc.setTextColor(71, 85, 105);
  doc.text(`Clientes Deudores: ${totals.activeClientsCount}`, 150, 43);

  if (mode === 'historial') {
    // Payments history table
    const tableRows = payments.map(p => [
      p.payment_date ? p.payment_date.substring(0, 10) : '—',
      p.account_receivable_id || '—',
      p.payment_method || 'Efectivo',
      p.reference || 'N/A',
      `$${Number(p.amount || 0).toFixed(2)}`,
      `Bs. ${(Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate).toFixed(2)}`,
      p.notes || 'Abono registrado'
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Fecha', 'Documento', 'Método de Pago', 'Referencia', 'Monto ($)', 'Monto (Bs.)', 'Detalle']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 26 },
        3: { cellWidth: 24, halign: 'center' },
        4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 42 }
      },
      margin: { left: 14, right: 14 }
    });
  } else {
    // Accounts Receivable Table
    const tableRows = receivables.map(r => {
      const clientName = r.client_name || r.customer_name || r.entity_name || 'Cliente';
      const isOverdue = r.due_date && new Date(r.due_date) < new Date() && Number(r.remaining_amount || 0) > 0;
      return [
        r.invoice_number || r.subject || 'Crédito',
        clientName,
        r.issue_date ? r.issue_date.substring(0, 10) : '—',
        r.due_date ? r.due_date.substring(0, 10) : 'Al Válido',
        `$${Number(r.total_amount || 0).toFixed(2)}`,
        `$${Number(r.paid_amount || 0).toFixed(2)}`,
        `$${Number(r.remaining_amount || 0).toFixed(2)}`,
        isOverdue ? 'VENCIDO' : r.status ? r.status.toUpperCase() : 'PENDIENTE'
      ];
    });

    autoTable(doc, {
      startY: 55,
      head: [['Doc / Factura', 'Cliente / Deudor', 'Emisión', 'Vence', 'Total ($)', 'Abonado ($)', 'Pendiente ($)', 'Estado']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 50 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 18, halign: 'right', textColor: [16, 185, 129] },
        6: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
        7: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 }
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${i} de ${pageCount}  •  Reporte de Cuentas por Cobrar  •  Copias Bella Vista`, 108, 272, { align: 'center' });
  }

  doc.save(`Reporte_CxC_${mode}_${startDate}_${endDate}.pdf`);
};

export const exportCxCExcel = async ({
  mode,
  selectedClientName,
  startDate,
  endDate,
  totals,
  receivables,
  payments,
  businessProfile,
  bcvRate
}: CxCExportParams) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = businessProfile?.name || 'Inversiones y Copias Bella Vista';
  workbook.created = new Date();

  // Sheet 1: Cuentas por Cobrar
  const sheetCxC = workbook.addWorksheet('Cuentas por Cobrar', { views: [{ showGridLines: true }] });
  const businessName = businessProfile?.name || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.';
  const r1 = sheetCxC.addRow([businessName.toUpperCase(), '', '', '', '', '', '', '', '', 'REPORTE OFICIAL DE CUENTAS POR COBRAR (CxC)']);
  r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(10).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(10).alignment = { horizontal: 'right' };

  const r2 = sheetCxC.addRow([`Modalidad: ${mode.toUpperCase()} | Cliente: ${selectedClientName || 'Todos'}`, '', '', '', '', '', '', '', '', `Período: ${startDate} al ${endDate}`]);
  r2.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };
  r2.getCell(10).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r2.getCell(10).alignment = { horizontal: 'right' };

  const r3 = sheetCxC.addRow([`Tasa BCV Oficial: Bs. ${bcvRate.toFixed(2)}`, '', '', '', '', '', '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`]);
  r3.getCell(1).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(10).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(10).alignment = { horizontal: 'right' };
  sheetCxC.addRow([]);

  // Summary Table
  const summaryRows = [
    ['Total Facturado Crédito ($ USD)', `$${totals.totalOriginalUSD.toFixed(2)}`],
    ['Total Cobrado / Recuperado ($ USD)', `$${totals.totalPaidUSD.toFixed(2)}`],
    ['Total Saldo Pendiente (Bs. VES)', `Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`],
    ['Cuentas / Facturas Vencidas', `${totals.overdueCount}`],
    ['Monto en Mora / Vencido ($ USD)', `$${totals.overdueAmountUSD.toFixed(2)}`]
  ];
  const summaryTotal = ['Total Saldo Pendiente ($ USD)', `$${totals.totalPendingUSD.toFixed(2)}`];
  addStyledAccountTable(
    sheetCxC,
    'RESUMEN EJECUTIVO DE COBRANZAS',
    ['Concepto', 'Valor'],
    summaryRows,
    summaryTotal,
    ['left', 'right']
  );

  // Receivables Table
  const cxcRows = receivables.map(r => {
    const clientName = r.client_name || r.customer_name || r.entity_name || 'Cliente';
    const isOverdue = r.due_date && new Date(r.due_date) < new Date() && Number(r.remaining_amount || 0) > 0;
    const remUSD = Number(r.remaining_amount || 0);
    return [
      r.invoice_number || r.subject || 'Crédito',
      clientName,
      r.client_phone || r.customer_phone || 'N/A',
      r.issue_date ? r.issue_date.substring(0, 10) : '',
      r.due_date ? r.due_date.substring(0, 10) : '',
      `$${Number(r.total_amount || 0).toFixed(2)}`,
      `$${Number(r.paid_amount || 0).toFixed(2)}`,
      `$${remUSD.toFixed(2)}`,
      `Bs. ${(remUSD * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      isOverdue ? 'VENCIDO' : r.status || 'PENDIENTE'
    ];
  });

  const cxcTotal = [
    'TOTALES GENERALES CxC',
    '-',
    '-',
    '-',
    '-',
    `$${totals.totalOriginalUSD.toFixed(2)}`,
    `$${totals.totalPaidUSD.toFixed(2)}`,
    `$${totals.totalPendingUSD.toFixed(2)}`,
    `Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    `${receivables.length} CUENTAS`
  ];

  addStyledAccountTable(
    sheetCxC,
    `CARTERA DE CRÉDITOS Y CUENTAS POR COBRAR (${receivables.length} REGISTROS)`,
    ['Documento / Factura', 'Cliente / Deudor', 'Teléfono', 'Fecha Emisión', 'Fecha Vencimiento', 'Monto Total ($)', 'Monto Abonado ($)', 'Saldo Pendiente ($)', 'Saldo Pendiente (Bs.)', 'Estado'],
    cxcRows,
    cxcTotal,
    ['center', 'left', 'center', 'center', 'center', 'right', 'right', 'right', 'right', 'center']
  );

  sheetCxC.columns = [
    { width: 22 },
    { width: 32 },
    { width: 16 },
    { width: 15 },
    { width: 17 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    { width: 14 }
  ];

  // Tab 2: Payments History
  if (payments && payments.length > 0) {
    const sheetPayments = workbook.addWorksheet('Historial de Abonos', { views: [{ showGridLines: true }] });
    const pr1 = sheetPayments.addRow([businessName.toUpperCase(), '', '', '', '', '', '', 'HISTORIAL DE ABONOS RECIBIDOS EN CxC']);
    pr1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
    pr1.getCell(8).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
    pr1.getCell(8).alignment = { horizontal: 'right' };
    sheetPayments.addRow([]);

    const payRows = payments.map(p => [
      p.payment_date ? p.payment_date.substring(0, 10) : '',
      p.account_receivable_id || '',
      p.payment_method || '',
      p.reference || 'N/A',
      `$${Number(p.amount || 0).toFixed(2)}`,
      `Bs. ${(Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      p.notes || '',
      p.created_by || ''
    ]);

    const totalPayUSD = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const totalPayVES = payments.reduce((acc, p) => acc + (Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate), 0);

    const payTotal = [
      'TOTAL RECAUDADO EN ABONOS',
      '-',
      '-',
      '-',
      `$${totalPayUSD.toFixed(2)}`,
      `Bs. ${totalPayVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      `${payments.length} ABONOS`,
      '-'
    ];

    addStyledAccountTable(
      sheetPayments,
      `DETALLE DE ABONOS Y COBROS REGISTRADOS (${payments.length} TRANSACCIONES)`,
      ['Fecha', 'ID Crédito', 'Método de Pago', 'Referencia', 'Monto ($ USD)', 'Monto (Bs. VES)', 'Notas / Detalle', 'Registrado Por'],
      payRows,
      payTotal,
      ['center', 'center', 'left', 'center', 'right', 'right', 'left', 'left']
    );

    sheetPayments.columns = [
      { width: 14 },
      { width: 20 },
      { width: 22 },
      { width: 18 },
      { width: 16 },
      { width: 22 },
      { width: 30 },
      { width: 20 }
    ];
  }

  await triggerExcelDownload(workbook, `Reporte_CxC_${mode}_${startDate}_${endDate}.xlsx`);
};

// --------------------------------------------------------------------------
// 3. ESTADO DE CUENTAS POR PAGAR (CxP): PDF & EXCEL
// --------------------------------------------------------------------------
interface CxPExportParams {
  mode: 'consolidado' | 'por_proveedor' | 'por_vencer' | 'detallado' | 'historial';
  selectedProviderName?: string;
  startDate: string;
  endDate: string;
  totals: {
    totalPendingUSD: number;
    totalPendingVES: number;
    totalOriginalUSD: number;
    totalPaidUSD: number;
    overdueCount: number;
    overdueAmountUSD: number;
    activeProvidersCount: number;
  };
  payables: AccountPayable[];
  payments: AccountPayablePayment[];
  businessProfile?: BusinessProfile | null;
  bcvRate: number;
}

export const exportCxPPDF = ({
  mode,
  selectedProviderName,
  startDate,
  endDate,
  totals,
  payables,
  payments,
  businessProfile,
  bcvRate
}: CxPExportParams) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const primaryColor: [number, number, number] = [29, 53, 87];

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 216, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((businessProfile?.name || 'COPIAS BELLA VISTA, C.A.').toUpperCase(), 14, 10);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${businessProfile?.rif || 'J-50987654-3'}  |  Tasa BCV: Bs. ${bcvRate.toFixed(2)}`, 14, 16);
  doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE')}`, 14, 21);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  const modeTitle =
    mode === 'por_proveedor'
      ? `ESTADO DE CUENTA: PROVEEDOR ${selectedProviderName || ''}`
      : mode === 'por_vencer'
      ? 'REPORTE DE CUENTAS POR PAGAR POR VENCER'
      : mode === 'historial'
      ? 'HISTORIAL DE PAGOS A PROVEEDORES'
      : 'REPORTE CONSOLIDADO DE CUENTAS POR PAGAR';
  doc.text(modeTitle, 202, 12, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${startDate} al ${endDate}`, 202, 18, { align: 'right' });

  // Summary Metrics
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 30, 188, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryColor);
  doc.text(`TOTAL POR PAGAR: $${totals.totalPendingUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 18, 37);
  doc.text(`Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 18, 43);

  doc.setTextColor(71, 85, 105);
  doc.text(`Compras a Crédito: $${totals.totalOriginalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 85, 37);
  doc.setTextColor(16, 185, 129);
  doc.text(`Total Liquidado / Pagado: $${totals.totalPaidUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 85, 43);

  doc.setTextColor(225, 29, 72);
  doc.text(`Facturas Vencidas: ${totals.overdueCount} ($${totals.overdueAmountUSD.toFixed(2)})`, 150, 37);
  doc.setTextColor(71, 85, 105);
  doc.text(`Proveedores Acreedores: ${totals.activeProvidersCount}`, 150, 43);

  if (mode === 'historial') {
    // Payments history table
    const tableRows = payments.map(p => [
      p.payment_date ? p.payment_date.substring(0, 10) : '—',
      p.account_payable_id || '—',
      p.payment_method || 'Transferencia',
      p.reference || 'N/A',
      `$${Number(p.amount || 0).toFixed(2)}`,
      `Bs. ${(Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate).toFixed(2)}`,
      p.notes || 'Liquidación a proveedor'
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Fecha', 'Factura / CxP', 'Método Pago', 'Referencia', 'Monto ($)', 'Monto (Bs.)', 'Detalles']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 26 },
        3: { cellWidth: 24, halign: 'center' },
        4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 42 }
      },
      margin: { left: 14, right: 14 }
    });
  } else {
    // Accounts Payable Table
    const tableRows = payables.map(p => {
      const providerName = p.provider_name || p.entity_name || 'Proveedor';
      const isOverdue = p.due_date && new Date(p.due_date) < new Date() && Number(p.remaining_amount || 0) > 0;
      return [
        p.invoice_number || p.subject || 'Compra',
        providerName,
        p.issue_date ? p.issue_date.substring(0, 10) : '—',
        p.due_date ? p.due_date.substring(0, 10) : 'Inmediato',
        `$${Number(p.total_amount || 0).toFixed(2)}`,
        `$${Number(p.paid_amount || 0).toFixed(2)}`,
        `$${Number(p.remaining_amount || 0).toFixed(2)}`,
        isOverdue ? 'VENCIDA' : p.status ? p.status.toUpperCase() : 'PENDIENTE'
      ];
    });

    autoTable(doc, {
      startY: 55,
      head: [['Doc / Factura', 'Proveedor', 'Emisión', 'Vencimiento', 'Total ($)', 'Pagado ($)', 'Por Pagar ($)', 'Estado']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 50 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 18, halign: 'right', textColor: [16, 185, 129] },
        6: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
        7: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 }
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${i} de ${pageCount}  •  Reporte de Cuentas por Pagar  •  Copias Bella Vista`, 108, 272, { align: 'center' });
  }

  doc.save(`Reporte_CxP_${mode}_${startDate}_${endDate}.pdf`);
};

export const exportCxPExcel = async ({
  mode,
  selectedProviderName,
  startDate,
  endDate,
  totals,
  payables,
  payments,
  businessProfile,
  bcvRate
}: CxPExportParams) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = businessProfile?.name || 'Inversiones y Copias Bella Vista';
  workbook.created = new Date();

  // Sheet 1: Cuentas por Pagar
  const sheetCxP = workbook.addWorksheet('Cuentas por Pagar', { views: [{ showGridLines: true }] });
  const businessName = businessProfile?.name || 'INVERSIONES Y COPIAS BELLA VISTA, C.A.';
  const r1 = sheetCxP.addRow([businessName.toUpperCase(), '', '', '', '', '', '', '', '', 'REPORTE OFICIAL DE CUENTAS POR PAGAR (CxP)']);
  r1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(10).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
  r1.getCell(10).alignment = { horizontal: 'right' };

  const r2 = sheetCxP.addRow([`Modalidad: ${mode.toUpperCase()} | Proveedor: ${selectedProviderName || 'Todos'}`, '', '', '', '', '', '', '', '', `Período: ${startDate} al ${endDate}`]);
  r2.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF566573' } };
  r2.getCell(10).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r2.getCell(10).alignment = { horizontal: 'right' };

  const r3 = sheetCxP.addRow([`Tasa BCV Oficial: Bs. ${bcvRate.toFixed(2)}`, '', '', '', '', '', '', '', '', `Generado: ${new Date().toLocaleString('es-VE')}`]);
  r3.getCell(1).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(10).font = { name: 'Calibri', size: 9, color: { argb: 'FF566573' } };
  r3.getCell(10).alignment = { horizontal: 'right' };
  sheetCxP.addRow([]);

  // Summary Table
  const summaryRows = [
    ['Total Compras a Crédito ($ USD)', `$${totals.totalOriginalUSD.toFixed(2)}`],
    ['Total Pagado / Liquidado ($ USD)', `$${totals.totalPaidUSD.toFixed(2)}`],
    ['Total Deuda Pendiente (Bs. VES)', `Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`],
    ['Facturas / Obligaciones Vencidas', `${totals.overdueCount}`],
    ['Monto Vencido en Mora ($ USD)', `$${totals.overdueAmountUSD.toFixed(2)}`]
  ];
  const summaryTotal = ['Total Deuda Pendiente ($ USD)', `$${totals.totalPendingUSD.toFixed(2)}`];
  addStyledAccountTable(
    sheetCxP,
    'RESUMEN DE CUENTAS POR PAGAR A PROVEEDORES',
    ['Concepto', 'Valor'],
    summaryRows,
    summaryTotal,
    ['left', 'right']
  );

  // Payables Table
  const cxpRows = payables.map(p => {
    const providerName = p.provider_name || p.entity_name || 'Proveedor';
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && Number(p.remaining_amount || 0) > 0;
    const remUSD = Number(p.remaining_amount || 0);
    return [
      p.invoice_number || p.subject || 'Compra',
      providerName,
      p.issue_date ? p.issue_date.substring(0, 10) : '',
      p.due_date ? p.due_date.substring(0, 10) : '',
      `$${Number(p.total_amount || 0).toFixed(2)}`,
      `$${Number(p.paid_amount || 0).toFixed(2)}`,
      `$${remUSD.toFixed(2)}`,
      `Bs. ${(remUSD * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      isOverdue ? 'VENCIDA' : p.status || 'PENDIENTE'
    ];
  });

  const cxpTotal = [
    'TOTALES GENERALES CxP',
    '-',
    '-',
    '-',
    `$${totals.totalOriginalUSD.toFixed(2)}`,
    `$${totals.totalPaidUSD.toFixed(2)}`,
    `$${totals.totalPendingUSD.toFixed(2)}`,
    `Bs. ${totals.totalPendingVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    `${payables.length} FACTURAS`
  ];

  addStyledAccountTable(
    sheetCxP,
    `DETALLE DE CUENTAS Y FACTURAS POR PAGAR (${payables.length} REGISTROS)`,
    ['Documento / Factura', 'Proveedor', 'Fecha Emisión', 'Fecha Vencimiento', 'Monto Total ($)', 'Monto Pagado ($)', 'Saldo Por Pagar ($)', 'Saldo Por Pagar (Bs.)', 'Estado'],
    cxpRows,
    cxpTotal,
    ['center', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'center']
  );

  sheetCxP.columns = [
    { width: 22 },
    { width: 32 },
    { width: 16 },
    { width: 17 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    { width: 14 }
  ];

  // Tab 2: Payments History
  if (payments && payments.length > 0) {
    const sheetPayments = workbook.addWorksheet('Historial de Pagos', { views: [{ showGridLines: true }] });
    const pr1 = sheetPayments.addRow([businessName.toUpperCase(), '', '', '', '', '', '', 'HISTORIAL DE DESEMBOLSOS Y PAGOS A PROVEEDORES']);
    pr1.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1B2631' } };
    pr1.getCell(8).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1B2631' } };
    pr1.getCell(8).alignment = { horizontal: 'right' };
    sheetPayments.addRow([]);

    const payRows = payments.map(p => [
      p.payment_date ? p.payment_date.substring(0, 10) : '',
      p.account_payable_id || '',
      p.payment_method || '',
      p.reference || 'N/A',
      `$${Number(p.amount || 0).toFixed(2)}`,
      `Bs. ${(Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      p.notes || '',
      p.created_by || ''
    ]);

    const totalPayUSD = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const totalPayVES = payments.reduce((acc, p) => acc + (Number(p.amount_bs || 0) || Number(p.amount || 0) * bcvRate), 0);

    const payTotal = [
      'TOTAL PAGADO EN DESEMBOLSOS',
      '-',
      '-',
      '-',
      `$${totalPayUSD.toFixed(2)}`,
      `Bs. ${totalPayVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      `${payments.length} DESEMBOLSOS`,
      '-'
    ];

    addStyledAccountTable(
      sheetPayments,
      `HISTORIAL DE DESEMBOLSOS Y PAGOS A PROVEEDORES (${payments.length} REGISTROS)`,
      ['Fecha', 'Factura / CxP', 'Método de Pago', 'Referencia', 'Monto ($ USD)', 'Monto (Bs. VES)', 'Detalles', 'Registrado Por'],
      payRows,
      payTotal,
      ['center', 'center', 'left', 'center', 'right', 'right', 'left', 'left']
    );

    sheetPayments.columns = [
      { width: 14 },
      { width: 20 },
      { width: 22 },
      { width: 18 },
      { width: 16 },
      { width: 22 },
      { width: 30 },
      { width: 20 }
    ];
  }

  await triggerExcelDownload(workbook, `Reporte_CxP_${mode}_${startDate}_${endDate}.xlsx`);
};
