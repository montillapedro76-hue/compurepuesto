# Modelo de Dominio: Copias Bella Vista (POS & B2C)

Este documento define la terminología canónica, invariantes de dominio y reglas financieras para el sistema de punto de venta y comercio electrónico de Copias Bella Vista.

---

## Glosario Canónico de Dominio

### 1. Monedas y Tasas
- **Moneda Base (Base Currency)**: Moneda principal de registro contable del negocio (USD en el sistema).
- **Moneda Transaccional (Transaction Currency)**: Moneda en la que el cliente o proveedor efectúa el pago (USD, VES, EUR, COP).
- **Tasa de Cambio Aplicada (Applied Exchange Rate)**: Tasa oficial (e.g. BCV) o pactada al milisegundo exacto en que se asienta la transacción. No debe mutar retrospectivamente.

### 2. Ventas y Facturación
- **Orden (Order)**: Compromiso comercial generado en el POS o tienda B2C con items, precios y cliente.
- **Factura (Invoice)**: Documento fiscal/comercial derivado de una Orden con control de impuestos (IVA, IGTF).
- **Snapshot Multimoneda (Multi-Currency Snapshot)**: Foto inmutable del monto total en Moneda Base, Moneda Transaccional y Tasa BCV al momento del cierre de la orden.

### 3. Tesorería y Caja
- **Sesión de Caja (Cash Session)**: Periodo operativo de un cajero/terminal delimitado por una apertura y un cierre con arqueo físico de efectivo y valores.
- **Operación de Caja (Cash Op)**: Movimiento individual de ingreso o egreso de dinero dentro de una Sesión de Caja activa.
- **Libro Mayor / Libro Diario (Ledger Journal)**: Registro inmutable (append-only) de todas las transacciones financieras del sistema (Caja, Cuentas Bancarias, CxC, CxP).

### 4. Cuentas por Cobrar y Pagar
- **Cuenta por Cobrar (Account Receivable - CxC)**: Deuda pendiente de un Cliente con el negocio derivada de una venta a crédito.
- **Cuenta por Pagar (Account Payable - CxP)**: Obligación pendiente del negocio con un Proveedor por compra de inventario o servicio.
- **Abono / Asiento de Pago (Payment Entry)**: Movimiento financiero parcial o total que reduce el saldo pendiente de una CxC o CxP.

---

## Invariantes del Dominio Financiero

1. **Invariante de Precisión Numérica**: Todo monto monetario se expresa en `NUMERIC(14,2)` o `NUMERIC(12,2)`. Las tasas de cambio usan `NUMERIC(14,4)`. Queda prohibido el uso de `FLOAT` / `REAL` / `DOUBLE PRECISION`.
2. **Invariante de Inmutabilidad Histórica**: Un asiento contable, pago o cierre de caja confirmado NUNCA puede ser modificado ni eliminado (`UPDATE` / `DELETE` bloqueados por trigger). Cualquier corrección requiere una nota de crédito/débito o un asiento de reverso (`reversal_entry`).
3. **Invariante de Trazabilidad Doble**: Cada transacción de venta o gasto debe almacenar explícitamente el monto en Moneda Base (USD) y en Moneda de Pago (VES/EUR/COP) junto con la tasa empleada, en columnas tipadas dedicadas (no exclusivamente dentro de objetos `JSONB`).
