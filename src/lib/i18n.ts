import { useState, useEffect } from 'react';

export type LanguageCode = 'es' | 'en';

// Comprehensive dictionary for structured keys
export const translations: Record<LanguageCode, Record<string, string>> = {
  es: {
    // General & Actions
    'app.save': 'Guardar',
    'app.save_changes': 'Guardar Cambios',
    'app.saving': 'Guardando...',
    'app.cancel': 'Cancelar',
    'app.delete': 'Eliminar',
    'app.edit': 'Editar',
    'app.close': 'Cerrar',
    'app.search': 'Buscar',
    'app.search_placeholder': 'Buscar productos, marcas, categorías...',
    'app.loading': 'Cargando...',
    'app.success': 'Operación exitosa',
    'app.error': 'Ocurrió un error',
    'app.active': 'Activo',
    'app.inactive': 'Inactivo',
    'app.actions': 'Acciones',
    'app.date': 'Fecha',
    'app.total': 'Total',
    'app.status': 'Estado',
    'app.all': 'Todos',
    'app.confirm': 'Confirmar',

    // Navbar & Header
    'nav.search_placeholder': 'Buscar por nombre, código de barra o categoría...',
    'nav.offers': 'Ofertas del Día',
    'nav.clear_filters': 'Limpiar Filtros',
    'nav.cart': 'Carrito',
    'nav.login': 'Iniciar Sesión',
    'nav.logout': 'Cerrar Sesión',
    'nav.my_account': 'Mi Cuenta',
    'nav.admin_panel': 'Panel de Administración',
    'nav.client_dashboard': 'Mis Pedidos',
    'nav.currency': 'Moneda',
    'nav.scanner': 'Escanear Código',
    'nav.gourmet_landing': 'Tres Leches',
    'nav.role_admin': 'Administrador',
    'nav.role_cashier': 'Cajero / Vendedor',
    'nav.role_client': 'Cliente',

    // Sidebar & Filters
    'sidebar.filters_title': 'Filtros de Búsqueda',
    'sidebar.clear': 'Limpiar',
    'sidebar.category': 'Categoría',
    'sidebar.all_items': 'Todos los artículos',
    'sidebar.brand': 'Marca / Fabricante',
    'sidebar.all_brands': 'Todas las marcas',
    'sidebar.price_range': 'Rango de Precio',
    'sidebar.min_price': 'Mínimo',
    'sidebar.max_price': 'Máximo',
    'sidebar.in_stock_only': 'Solo productos en stock',
    'sidebar.featured_only': 'Solo productos destacados',

    // Product Card & Catalog
    'catalog.found_results': 'Resultados encontrados:',
    'catalog.articles': 'artículos',
    'catalog.no_results_title': 'Sin Resultados Coincidentes',
    'catalog.no_results_desc': 'No encontramos ningún artículo que coincida con tus criterios de búsqueda. Prueba modificando los filtros del panel lateral o buscando otro término.',
    'catalog.clear_filters': 'Limpiar Todos los Filtros',
    'product.in_stock': 'En Stock',
    'product.out_of_stock': 'Agotado',
    'product.add_to_cart': 'Añadir al Carrito',
    'product.view_details': 'Ver Detalles',
    'product.featured': 'Destacado',
    'product.offer': 'Oferta',
    'product.sku': 'Código / SKU',
    'product.category': 'Categoría',
    'product.brand': 'Marca',
    'product.available': 'Disponibles',
    'product.no_results': 'No se encontraron productos con los filtros seleccionados.',

    // Admin Tabs & Navigation
    'admin.tab_pos': 'Punto de Venta (Caja)',
    'admin.tab_inventory': 'Inventario y Catálogo',
    'admin.tab_orders': 'Ventas y Facturación',
    'admin.tab_balance': 'Cierre y Balance',
    'admin.tab_quotes': 'Cotizaciones y Presupuestos',
    'admin.tab_customers': 'Gestión de Clientes',
    'admin.tab_reports': 'Reportes y Métricas',
    'admin.tab_marketing': 'Publicidad y Banners',
    'admin.tab_config': 'Centro de Configuración',

    // Mi Cuenta (User Profile & Preferences)
    'account.title': 'Ajustes de Cuenta y Perfil',
    'account.subtitle': 'Configure los datos del usuario conectado, seguridad de acceso y personalice el idioma de la aplicación.',
    'account.full_name': 'Nombre Completo',
    'account.id_doc': 'Documento de Identidad / Cédula',
    'account.phone': 'Número de Teléfono',
    'account.email': 'Correo Electrónico',
    'account.2fa_title': 'Seguridad y Acceso en 2 Pasos',
    'account.2fa_desc': 'Añada una capa de seguridad extra requiriendo un código temporal en su teléfono.',
    'account.active_sessions': 'Sesiones Activas',
    'account.device': 'Dispositivo / Sistema',
    'account.ip_address': 'Dirección IP',
    'account.unlink': 'Desvincular',
    'account.system_language': 'Idioma del Sistema',
    'account.visual_theme': 'Tema Visual',
    'account.theme_light': '☀️ Opción 1: Tema Claro Operativo (Azul Bellavista / Alta Legibilidad)',
    'account.theme_minimalista_premium': '✨ MINIMALISTA PREMIUM',
    'account.lang_es': 'Español (Castellano)',
    'account.lang_en': 'English (United States)',

    // Mi Negocio
    'business.title': 'Información del Negocio',
    'business.subtitle': 'Datos fiscales, comerciales y de contacto utilizados en encabezados, reportes e impresiones.',
    'business.name': 'Nombre Comercial / Empresa',
    'business.type': 'Razón Social / Actividad',
    'business.rif': 'RIF / Identificación Fiscal',
    'business.phone': 'Teléfono Principal',
    'business.email': 'Correo Comercial',
    'business.address': 'Dirección Principal',
    'business.city': 'Ciudad / Municipio',
    'business.branches_terminals': 'Sedes y Terminales (Puntos de Venta)',
    'business.add_branch': 'Agregar Sede',
    'business.add_terminal': 'Agregar Caja / Terminal',
    'business.manage_terminals': 'Gestionar Cajas',
    'business.delete_branch_confirm': '¿Eliminar Sede?',
    'business.delete_terminal_confirm': '¿Eliminar Terminal / Caja?',

    // POS / Caja
    'pos.fast_sale': 'Venta Rápida POS',
    'pos.scan_or_search': 'Escanear código o buscar producto...',
    'pos.ticket_cart': 'Ticket de Venta',
    'pos.subtotal': 'Subtotal',
    'pos.tax': 'IVA (16%)',
    'pos.igtf': 'IGTF (3%)',
    'pos.discount': 'Descuento',
    'pos.total_to_pay': 'Total a Cobrar',
    'pos.payment_method': 'Método de Pago',
    'pos.pay_cash_usd': 'Efectivo USD',
    'pos.pay_cash_ves': 'Efectivo Bolívares (Bs)',
    'pos.pay_pm': 'Pago Móvil',
    'pos.pay_pos': 'Punto de Venta / Tarjeta',
    'pos.pay_zelle': 'Zelle / Transferencia USD',
    'pos.process_payment': 'Completar Venta y Emitir Ticket',
    'pos.empty_cart': 'El carrito de venta está vacío.',

    // Balance & Cierre
    'balance.title': 'Control de Caja y Balance Diario',
    'balance.open_session': 'Apertura de Caja',
    'balance.close_session': 'Cierre de Turno / Arqueo',
    'balance.cash_in': 'Ingresos de Caja',
    'balance.cash_out': 'Egresos / Gastos',
    'balance.net_balance': 'Balance Neto',
    'balance.register_expense': 'Registrar Gasto / Egreso'
  },
  en: {
    // General & Actions
    'app.save': 'Save',
    'app.save_changes': 'Save Changes',
    'app.saving': 'Saving...',
    'app.cancel': 'Cancel',
    'app.delete': 'Delete',
    'app.edit': 'Edit',
    'app.close': 'Close',
    'app.search': 'Search',
    'app.search_placeholder': 'Search products, brands, categories...',
    'app.loading': 'Loading...',
    'app.success': 'Operation successful',
    'app.error': 'An error occurred',
    'app.active': 'Active',
    'app.inactive': 'Inactive',
    'app.actions': 'Actions',
    'app.date': 'Date',
    'app.total': 'Total',
    'app.status': 'Status',
    'app.all': 'All',
    'app.confirm': 'Confirm',

    // Navbar & Header
    'nav.search_placeholder': 'Search by name, barcode or category...',
    'nav.offers': "Today's Deals",
    'nav.clear_filters': 'Clear Filters',
    'nav.cart': 'Cart',
    'nav.login': 'Sign In',
    'nav.logout': 'Sign Out',
    'nav.my_account': 'My Account',
    'nav.admin_panel': 'Admin Panel',
    'nav.client_dashboard': 'My Orders',
    'nav.currency': 'Currency',
    'nav.scanner': 'Scan Barcode',
    'nav.gourmet_landing': 'Tres Leches',
    'nav.role_admin': 'Administrator',
    'nav.role_cashier': 'Cashier / Salesperson',
    'nav.role_client': 'Customer',

    // Sidebar & Filters
    'sidebar.filters_title': 'Search Filters',
    'sidebar.clear': 'Clear',
    'sidebar.category': 'Category',
    'sidebar.all_items': 'All Items',
    'sidebar.brand': 'Brand / Manufacturer',
    'sidebar.all_brands': 'All Brands',
    'sidebar.price_range': 'Price Range',
    'sidebar.min_price': 'Minimum',
    'sidebar.max_price': 'Maximum',
    'sidebar.in_stock_only': 'In stock only',
    'sidebar.featured_only': 'Featured items only',

    // Product Card & Catalog
    'catalog.found_results': 'Results found:',
    'catalog.articles': 'items',
    'catalog.no_results_title': 'No Matching Results',
    'catalog.no_results_desc': 'We did not find any products matching your search criteria. Try modifying the sidebar filters or searching for another term.',
    'catalog.clear_filters': 'Clear All Filters',
    'product.in_stock': 'In Stock',
    'product.out_of_stock': 'Out of Stock',
    'product.add_to_cart': 'Add to Cart',
    'product.view_details': 'View Details',
    'product.featured': 'Featured',
    'product.offer': 'Deal',
    'product.sku': 'Code / SKU',
    'product.category': 'Category',
    'product.brand': 'Brand',
    'product.available': 'Available',
    'product.no_results': 'No products found matching the selected filters.',

    // Admin Tabs & Navigation
    'admin.tab_pos': 'Point of Sale (POS)',
    'admin.tab_inventory': 'Inventory & Catalog',
    'admin.tab_orders': 'Sales & Invoices',
    'admin.tab_balance': 'Cash Closure & Balance',
    'admin.tab_quotes': 'Quotes & Budgets',
    'admin.tab_customers': 'Customer Management',
    'admin.tab_reports': 'Reports & Analytics',
    'admin.tab_marketing': 'Advertising & Banners',
    'admin.tab_config': 'Settings Control Center',

    // Mi Cuenta (User Profile & Preferences)
    'account.title': 'Account & Profile Settings',
    'account.subtitle': 'Configure user profile details, access security and customize application language.',
    'account.full_name': 'Full Name',
    'account.id_doc': 'National ID / Tax ID',
    'account.phone': 'Phone Number',
    'account.email': 'Email Address',
    'account.2fa_title': '2-Factor Authentication (2FA)',
    'account.2fa_desc': 'Add an extra security layer requiring a temporary code on your mobile device.',
    'account.active_sessions': 'Active Sessions',
    'account.device': 'Device / System',
    'account.ip_address': 'IP Address',
    'account.unlink': 'Unlink',
    'account.system_language': 'System Language',
    'account.visual_theme': 'Visual Theme',
    'account.theme_light': '☀️ Option 1: Operational Light Theme (Bellavista Blue / High Legibility)',
    'account.theme_minimalista_premium': '✨ MINIMALISTA PREMIUM',
    'account.lang_es': 'Español (Castellano)',
    'account.lang_en': 'English (United States)',

    // Mi Negocio
    'business.title': 'Business Information',
    'business.subtitle': 'Commercial, fiscal and contact information used in headers, receipts and reports.',
    'business.name': 'Company / Business Name',
    'business.type': 'Business Activity / Type',
    'business.rif': 'Tax ID / RIF',
    'business.phone': 'Primary Phone',
    'business.email': 'Commercial Email',
    'business.address': 'Main Physical Address',
    'business.city': 'City / Municipality',
    'business.branches_terminals': 'Branches & Point-of-Sale Terminals',
    'business.add_branch': 'Add Branch',
    'business.add_terminal': 'Add Register / Terminal',
    'business.manage_terminals': 'Manage Registers',
    'business.delete_branch_confirm': 'Delete Branch?',
    'business.delete_terminal_confirm': 'Delete Terminal / Register?',

    // POS / Caja
    'pos.fast_sale': 'Fast POS Checkout',
    'pos.scan_or_search': 'Scan barcode or search product...',
    'pos.ticket_cart': 'Sale Receipt',
    'pos.subtotal': 'Subtotal',
    'pos.tax': 'Tax / VAT (16%)',
    'pos.igtf': 'Foreign Currency Tax (3%)',
    'pos.discount': 'Discount',
    'pos.total_to_pay': 'Total Amount Due',
    'pos.payment_method': 'Payment Method',
    'pos.pay_cash_usd': 'USD Cash',
    'pos.pay_cash_ves': 'VES Cash (Bs)',
    'pos.pay_pm': 'Mobile Payment (Pago Móvil)',
    'pos.pay_pos': 'Debit / Credit Card (POS)',
    'pos.pay_zelle': 'Zelle / Bank Transfer USD',
    'pos.process_payment': 'Complete Sale & Print Receipt',
    'pos.empty_cart': 'The sales cart is currently empty.',

    // Balance & Cierre
    'balance.title': 'Cash Register Control & Daily Balance',
    'balance.open_session': 'Open Register Session',
    'balance.close_session': 'Shift Closure / Cash Count',
    'balance.cash_in': 'Cash Inflows',
    'balance.cash_out': 'Cash Outflows / Expenses',
    'balance.net_balance': 'Net Cash Balance',
    'balance.register_expense': 'Record Expense / Cash Out'
  }
};

// Extensive phrase-by-phrase bilingual translation map for whole-page live translation
const ES_TO_EN_DICTIONARY: [RegExp, string][] = [
  // Exact & common UI phrases
  [/\bIDIOMA DEL SISTEMA\b/gi, 'SYSTEM LANGUAGE'],
  [/\bIdioma del Sistema\b/gi, 'System Language'],
  [/\bTEMA VISUAL\b/gi, 'VISUAL THEME'],
  [/\bTema Visual\b/gi, 'Visual Theme'],
  [/\bTema Claro \(Recomendado\)\b/gi, '☀️ Light Theme (Recommended)'],
  [/\bTema Oscuro \(Alto Contraste\)\b/gi, '🌙 Dark Theme (High Contrast)'],
  [/\bEspañol \(Castellano\)\b/gi, 'Español (Castellano)'],
  [/\bEnglish \(United States\)\b/gi, 'English (United States)'],
  [/\bMI CUENTA\b/gi, 'MY ACCOUNT'],
  [/\bMi Cuenta\b/gi, 'My Account'],
  [/\bMI NEGOCIO\b/gi, 'MY BUSINESS'],
  [/\bMi Negocio\b/gi, 'My Business'],
  [/\bFACTURACIÓN & FISCAL\b/gi, 'BILLING & TAXES'],
  [/\bFacturación & Fiscal\b/gi, 'Billing & Taxes'],
  [/\bFacturación\b/gi, 'Billing'],
  [/\bINVENTARIO\b/gi, 'INVENTORY'],
  [/\bInventario y Catálogo\b/gi, 'Inventory & Catalog'],
  [/\bInventario\b/gi, 'Inventory'],
  [/\bIMPRESIÓN & TICKETS\b/gi, 'PRINTING & RECEIPTS'],
  [/\bImpresión & Tickets\b/gi, 'Printing & Receipts'],
  [/\bNOTIFICACIONES\b/gi, 'NOTIFICATIONS'],
  [/\bNotificaciones\b/gi, 'Notifications'],
  [/\bGuardar Cambios\b/gi, 'Save Changes'],
  [/\bGuardar\b/gi, 'Save'],
  [/\bCancelar\b/gi, 'Cancel'],
  [/\bEliminar\b/gi, 'Delete'],
  [/\bEditar\b/gi, 'Edit'],
  [/\bCerrar Sesión\b/gi, 'Sign Out'],
  [/\bIniciar Sesión\b/gi, 'Sign In'],
  [/\bCerrar\b/gi, 'Close'],
  [/\bBuscar productos\.\.\./gi, 'Search products...'],
  [/\bBuscar productos, marcas, categorías\.\.\./gi, 'Search products, brands, categories...'],
  [/\bBuscar por nombre, código de barra o categoría\.\.\./gi, 'Search by name, barcode or category...'],
  [/\bBuscar\b/gi, 'Search'],
  [/\bAñadir al Carrito\b/gi, 'Add to Cart'],
  [/\bAgregar al Carrito\b/gi, 'Add to Cart'],
  [/\bCarrito\b/gi, 'Cart'],
  [/\bTu Carrito de Compras\b/gi, 'Your Shopping Cart'],
  [/\bVaciar Carrito\b/gi, 'Clear Cart'],
  [/\bProceder al Pago\b/gi, 'Proceed to Checkout'],
  [/\bFinalizar Compra\b/gi, 'Complete Order'],
  [/\bSeguimiento de Pedido\b/gi, 'Order Tracking'],
  [/\bMis Pedidos\b/gi, 'My Orders'],
  [/\bPanel de Administración\b/gi, 'Admin Panel'],
  [/\bPanel Admin\b/gi, 'Admin Panel'],
  [/\bVer Catálogo Público\b/gi, 'View Public Catalog'],
  [/\bOfertas del Día\b/gi, "Today's Deals"],
  [/\bOfertas\b/gi, 'Deals'],
  [/\bDestacado\b/gi, 'Featured'],
  [/\bDestacados\b/gi, 'Featured'],
  [/\bEn Stock\b/gi, 'In Stock'],
  [/\bAgotado\b/gi, 'Out of Stock'],
  [/\bDisponibles\b/gi, 'Available'],
  [/\bDisponible\b/gi, 'Available'],
  [/\bFiltros de Búsqueda\b/gi, 'Search Filters'],
  [/\bLimpiar Filtros\b/gi, 'Clear Filters'],
  [/\bLimpiar\b/gi, 'Clear'],
  [/\bCategoría\b/gi, 'Category'],
  [/\bCategorías\b/gi, 'Categories'],
  [/\bTodos los artículos\b/gi, 'All Items'],
  [/\bTodas las categorías\b/gi, 'All Categories'],
  [/\bMarca \/ Fabricante\b/gi, 'Brand / Manufacturer'],
  [/\bTodas las marcas\b/gi, 'All Brands'],
  [/\bMarca\b/gi, 'Brand'],
  [/\bMarcas\b/gi, 'Brands'],
  [/\bRango de Precio\b/gi, 'Price Range'],
  [/\bPrecio\b/gi, 'Price'],
  [/\bMínimo\b/gi, 'Minimum'],
  [/\bMáximo\b/gi, 'Maximum'],
  [/\bSolo productos en stock\b/gi, 'In stock only'],
  [/\bSolo Productos Destacados\b/gi, 'Featured products only'],
  [/\bSolo productos destacados\b/gi, 'Featured products only'],
  [/\bMostrar solo Disponibles\b/gi, 'Show In Stock Only'],
  [/\bResultados encontrados:\b/gi, 'Results found:'],
  [/\bartículos\b/gi, 'items'],
  [/\bartículo\b/gi, 'item'],
  [/\bSin Resultados Coincidentes\b/gi, 'No Matching Results'],
  [/\bLimpiar Todos los Filtros\b/gi, 'Clear All Filters'],
  [/\bTotal a Pagar\b/gi, 'Total Due'],
  [/\bTotal a Cobrar\b/gi, 'Total Due'],
  [/\bSubtotal\b/gi, 'Subtotal'],
  [/\bDescuento\b/gi, 'Discount'],
  [/\bMétodo de Pago\b/gi, 'Payment Method'],
  [/\bEfectivo USD\b/gi, 'USD Cash'],
  [/\bEfectivo Bolívares\b/gi, 'VES Cash (Bs)'],
  [/\bPago Móvil\b/gi, 'Mobile Payment (Pago Móvil)'],
  [/\bPunto de Venta\b/gi, 'Point of Sale (POS)'],
  [/\bPunto de Venta \(Caja\)\b/gi, 'Point of Sale (POS)'],
  [/\bVenta Flash\b/gi, 'Flash Sale / POS'],
  [/\bVentas y Facturación\b/gi, 'Sales & Billing'],
  [/\bVentas\b/gi, 'Sales'],
  [/\bCierre y Balance\b/gi, 'Cash Closure & Balance'],
  [/\bControl de Caja y Balance Diario\b/gi, 'Cash Register Control & Daily Balance'],
  [/\bApertura de Caja\b/gi, 'Open Cash Register'],
  [/\bCierre de Turno \/ Arqueo\b/gi, 'Shift Closure / Cash Count'],
  [/\bCierre de Caja\b/gi, 'Cash Register Closure'],
  [/\bIngresos de Caja\b/gi, 'Cash Inflows'],
  [/\bEgresos \/ Gastos\b/gi, 'Cash Outflows / Expenses'],
  [/\bBalance Neto\b/gi, 'Net Balance'],
  [/\bCotizaciones y Presupuestos\b/gi, 'Quotes & Estimates'],
  [/\bCotizaciones\b/gi, 'Quotes'],
  [/\bNueva Cotización\b/gi, 'New Quote'],
  [/\bGestión de Clientes\b/gi, 'Customer Management'],
  [/\bClientes \(Directorio RIF\/Cédula\)\b/gi, 'Customers (ID/Tax Directory)'],
  [/\bClientes\b/gi, 'Customers'],
  [/\bReportes y Métricas\b/gi, 'Reports & Analytics'],
  [/\bReportes Financieros\b/gi, 'Financial Reports'],
  [/\bReportes\b/gi, 'Reports'],
  [/\bProveedores\b/gi, 'Suppliers'],
  [/\bCompras\b/gi, 'Purchases'],
  [/\bUsuarios\b/gi, 'Users'],
  [/\bGestión de Usuarios\b/gi, 'User Management'],
  [/\bPublicidad y Banners\b/gi, 'Advertising & Banners'],
  [/\bMarketing & Banners\b/gi, 'Marketing & Banners'],
  [/\bCentro de Configuración\b/gi, 'Settings Center'],
  [/\bConfiguración del Sistema\b/gi, 'System Configuration'],
  [/\bConfiguración\b/gi, 'Settings'],
  [/\bNombre Completo\b/gi, 'Full Name'],
  [/\bDocumento de Identidad \/ Cédula\b/gi, 'National ID / Tax ID'],
  [/\bNúmero de Teléfono\b/gi, 'Phone Number'],
  [/\bCorreo Electrónico\b/gi, 'Email Address'],
  [/\bContraseña Actual\b/gi, 'Current Password'],
  [/\bNueva Contraseña\b/gi, 'New Password'],
  [/\bConfirmar Contraseña\b/gi, 'Confirm Password'],
  [/\bSeguridad y Acceso en 2 Pasos\b/gi, 'Two-Factor Authentication (2FA)'],
  [/\bSesiones Activas\b/gi, 'Active Sessions'],
  [/\bDispositivo \/ Sistema\b/gi, 'Device / System'],
  [/\bDirección IP\b/gi, 'IP Address'],
  [/\bDesvincular\b/gi, 'Unlink'],
  [/\bNombre Comercial \/ Empresa\b/gi, 'Company / Business Name'],
  [/\bRazón Social \/ Actividad\b/gi, 'Business Type / Activity'],
  [/\bRIF \/ Identificación Fiscal\b/gi, 'Tax ID / RIF'],
  [/\bTeléfono Principal\b/gi, 'Primary Phone'],
  [/\bCorreo Comercial\b/gi, 'Commercial Email'],
  [/\bDirección Principal\b/gi, 'Primary Address'],
  [/\bCiudad \/ Municipio\b/gi, 'City / Municipality'],
  [/\bSedes y Terminales \(Puntos de Venta\)\b/gi, 'Branches & POS Terminals'],
  [/\bAgregar Sede\b/gi, 'Add Branch'],
  [/\bAgregar Caja \/ Terminal\b/gi, 'Add Register / Terminal'],
  [/\bMoneda Principal de Venta\b/gi, 'Main Sales Currency'],
  [/\bMulti-Moneda Activa\b/gi, 'Multi-Currency Active'],
  [/\bTasa Oficial BCV\b/gi, 'Official Central Bank (BCV) Rate'],
  [/\bActualización Automática\b/gi, 'Automatic Rate Updates'],
  [/\bMoneda\b/gi, 'Currency'],
  [/\bEscanear Código\b/gi, 'Scan Barcode'],
  [/\bEscanear\b/gi, 'Scan'],
  [/\bNuevo Producto\b/gi, 'New Product'],
  [/\bExportar a Excel\b/gi, 'Export to Excel'],
  [/\bImportar Excel\b/gi, 'Import Excel'],
  [/\bCódigo de Barra\b/gi, 'Barcode'],
  [/\bDescripción\b/gi, 'Description'],
  [/\bCosto \(USD\)\b/gi, 'Cost (USD)'],
  [/\bPrecio de Venta \(USD\)\b/gi, 'Sale Price (USD)'],
  [/\bGanancia\b/gi, 'Profit'],
  [/\bMargen\b/gi, 'Margin'],
  [/\bAcciones\b/gi, 'Actions'],
  [/\bEstado\b/gi, 'Status'],
  [/\bFecha\b/gi, 'Date'],
  [/\bTotal\b/gi, 'Total'],
  [/\bCantidad\b/gi, 'Quantity'],
  [/\bCliente\b/gi, 'Customer'],
  [/\bVendedor\b/gi, 'Salesperson'],
  [/\bAdministrador\b/gi, 'Administrator'],
  [/\bCajero\b/gi, 'Cashier'],
  [/\bActivo\b/gi, 'Active'],
  [/\bInactivo\b/gi, 'Inactive'],
  [/\bPendiente\b/gi, 'Pending'],
  [/\bPagado\b/gi, 'Paid'],
  [/\bEntregado\b/gi, 'Delivered'],
  [/\bEn Preparación\b/gi, 'Preparing'],
  [/\bCancelado\b/gi, 'Cancelled'],
  [/\b¡Configuraciones guardadas y aplicadas con éxito en el sistema!\b/gi, 'Settings successfully saved and applied!'],
  [/\bConfiguraciones Guardadas Exitosamente\b/gi, 'Settings Saved Successfully'],
  [/\bOperación completada con éxito\b/gi, 'Operation completed successfully']
];

export const getStoredLanguage = (): LanguageCode => {
  try {
    const saved = localStorage.getItem('copias_bellavista_lang');
    if (saved === 'en' || saved === 'es') return saved;
  } catch (e) {}
  return 'es';
};

/**
 * Universal text translation using regex mapping
 */
export const translateDynamicText = (text: string, targetLang: LanguageCode): string => {
  if (!text || targetLang === 'es') return text;
  let translated = text;
  for (const [regex, replacement] of ES_TO_EN_DICTIONARY) {
    translated = translated.replace(regex, replacement);
  }
  return translated;
};

/**
 * Traverses DOM and translates visible text and placeholders
 */
export const applyDomTranslation = (root: Node, lang: LanguageCode) => {
  if (lang === 'es') return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      const val = node.nodeValue?.trim();
      if (!val || /^\d+([.,]\d+)?(\s*[$€Bs.])?$/.test(val)) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    const text = currentNode.nodeValue;
    if (text && text.trim().length > 0) {
      const translated = translateDynamicText(text, lang);
      if (translated !== text) {
        currentNode.nodeValue = translated;
      }
    }
    currentNode = walker.nextNode();
  }

  // Also translate input placeholders and element titles/button texts
  const elementsWithAttrs = (root instanceof Element ? root : document.body).querySelectorAll('input[placeholder], textarea[placeholder], [title], button');
  elementsWithAttrs.forEach((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const ph = el.getAttribute('placeholder');
      if (ph) {
        const translatedPh = translateDynamicText(ph, lang);
        if (translatedPh !== ph) {
          el.setAttribute('placeholder', translatedPh);
        }
      }
    }
    const title = el.getAttribute('title');
    if (title) {
      const translatedTitle = translateDynamicText(title, lang);
      if (translatedTitle !== title) {
        el.setAttribute('title', translatedTitle);
      }
    }
  });
};

export const setStoredLanguage = (lang: LanguageCode) => {
  try {
    localStorage.setItem('copias_bellavista_lang', lang);
    document.documentElement.lang = lang;
    if (lang === 'en') {
      applyDomTranslation(document.body, 'en');
    }
    window.dispatchEvent(new CustomEvent('bellavista_language_updated', { detail: lang }));
  } catch (e) {}
};

export type ThemeCode = 'claro' | 'minimalista_premium' | 'oscuro';

export const getStoredTheme = (): ThemeCode => {
  try {
    const saved = localStorage.getItem('copias_bellavista_theme');
    if (saved === 'claro' || saved === 'minimalista_premium' || saved === 'oscuro') return saved as ThemeCode;
  } catch (e) {}
  return 'claro';
};

export const applyTheme = (theme: ThemeCode) => {
  try {
    localStorage.setItem('copias_bellavista_theme', theme);
    document.documentElement.classList.remove('dark', 'theme-minimalista-premium', 'theme-fast-fashion');
    document.body.classList.remove('dark', 'theme-minimalista-premium', 'theme-fast-fashion');

    if (theme === 'minimalista_premium') {
      document.documentElement.classList.add('theme-minimalista-premium');
      document.body.classList.add('theme-minimalista-premium');
    } else if (theme === 'oscuro') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    }
    window.dispatchEvent(new CustomEvent('bellavista_theme_updated', { detail: theme }));
  } catch (e) {}
};

/**
 * Universal translation helper
 */
export const t = (key: string, defaultText?: string): string => {
  const currentLang = getStoredLanguage();
  const dict = translations[currentLang] || translations.es;
  if (dict[key]) return dict[key];
  if (translations.es[key]) return translations.es[key];
  return translateDynamicText(defaultText || key, currentLang);
};

/**
 * React hook to listen to real-time language and theme changes with automatic DOM observing
 */
export function useI18n() {
  const [lang, setLang] = useState<LanguageCode>(getStoredLanguage);
  const [theme, setTheme] = useState<ThemeCode>(getStoredTheme);

  useEffect(() => {
    // Initial sync
    document.documentElement.lang = lang;
    applyTheme(theme);

    if (lang === 'en') {
      applyDomTranslation(document.body, 'en');
    }

    // Set up MutationObserver to keep translated DOM consistent if lang is English
    let observer: MutationObserver | null = null;
    if (lang === 'en') {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            m.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                applyDomTranslation(node, 'en');
              }
            });
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const handleLangChange = (e: any) => {
      const newLang = e.detail || getStoredLanguage();
      setLang(newLang);
      document.documentElement.lang = newLang;
      if (newLang === 'en') {
        applyDomTranslation(document.body, 'en');
      }
    };

    const handleThemeChange = (e: any) => {
      const newTheme = e.detail || getStoredTheme();
      setTheme(newTheme);
    };

    window.addEventListener('bellavista_language_updated', handleLangChange);
    window.addEventListener('bellavista_theme_updated', handleThemeChange);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('bellavista_language_updated', handleLangChange);
      window.removeEventListener('bellavista_theme_updated', handleThemeChange);
    };
  }, [lang, theme]);

  const changeLanguage = (newLang: LanguageCode) => {
    setLang(newLang);
    setStoredLanguage(newLang);
  };

  const changeTheme = (newTheme: ThemeCode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const translate = (key: string, defaultText?: string) => {
    const dict = translations[lang] || translations.es;
    if (dict[key]) return dict[key];
    return translateDynamicText(defaultText || key, lang);
  };

  return {
    lang,
    theme,
    isDark: theme === 'oscuro',
    setLang: changeLanguage,
    setTheme: changeTheme,
    t: translate
  };
}
