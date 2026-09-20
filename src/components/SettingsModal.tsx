/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Save, Database, ShieldCheck, Terminal, Copy, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { dbService, currentSettings, sanitizeSupabaseUrl, isValidHttpUrl } from '../lib/supabase.ts';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [supabaseUrl, setSupabaseUrl] = useState(currentSettings.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(currentSettings.supabaseAnonKey);
  const [copiedSql, setCopiedSql] = useState(false);
  const [urlError, setUrlError] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');

    const cleanedUrl = sanitizeSupabaseUrl(supabaseUrl.trim());
    if (!isValidHttpUrl(cleanedUrl)) {
      setUrlError('La URL de Supabase debe ser una dirección HTTP o HTTPS válida (ej: https://xyz.supabase.co).');
      return;
    }

    if (!supabaseAnonKey.trim()) {
      setUrlError('La clave anónima (Anon Key) no puede estar vacía.');
      return;
    }

    dbService.saveSettings({
      supabaseUrl: cleanedUrl,
      supabaseAnonKey: supabaseAnonKey.trim(),
      useSupabase: true
    });
  };

  const handleResetDefaults = () => {
    const defaultUrl = 'https://absmxrciaasihyqpinlm.supabase.co';
    const defaultKey = 'sb_publishable_rn_0iwmTGj_z1ZaneXBdpw_eSvlUIU_';
    setSupabaseUrl(defaultUrl);
    setSupabaseAnonKey(defaultKey);
    setUrlError('');
  };

  const sqlQuery = `-- SQL PARA CREAR LAS TABLAS EN TU PROYECTO DE SUPABASE
-- Ejecuta este script en el editor SQL (SQL Editor) de tu consola de Supabase

-- 1. Tabla de Categorías
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  image_url text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Tabla de Marcas
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Tabla de Productos
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0.00,
  offer_price numeric(10,2),
  stock integer NOT NULL DEFAULT 0,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  featured boolean DEFAULT false,
  active boolean DEFAULT true,
  technical_sheet_url text,
  barcode_qr text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Tabla de Imágenes Adicionales
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer DEFAULT 0
);

-- 5. Tabla de Pedidos (Orders)
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone_number text NOT NULL,
  customer_email text,
  delivery_method text NOT NULL,
  address_text text,
  items jsonb NOT NULL,
  total_price numeric(10,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'recibido',
  created_at timestamp with time zone DEFAULT now(),
  comments text,
  payment_method text,
  payment_amount_with numeric(10,2),
  payment_status text DEFAULT 'pendiente',
  points integer,
  order_number integer,
  discount_code text,
  discount_amount numeric(10,2)
);

-- 6. Tabla de Tasas Históricas BCV (bcv_rates)
CREATE TABLE IF NOT EXISTS bcv_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric(12,4) NOT NULL,
  created_by text DEFAULT 'Sistema',
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Tabla de Tasas Multimoneda (currency_rates)
CREATE TABLE IF NOT EXISTS currency_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text,
  symbol text,
  rate numeric(12,4) NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- 8. Tabla de Cuentas Bancarias (bank_accounts)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text NOT NULL,
  currency text NOT NULL DEFAULT 'VES',
  account_number text,
  account_type text DEFAULT 'corriente',
  balance numeric(15,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 9. Tabla de Transferencias y Movimientos Bancarios (bank_transfers)
CREATE TABLE IF NOT EXISTS bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id text,
  to_account_id text,
  from_account_name text,
  to_account_name text,
  amount numeric(15,2) NOT NULL DEFAULT 0.00,
  amount_bs numeric(15,2),
  currency text NOT NULL DEFAULT 'VES',
  exchange_rate numeric(15,4),
  converted_amount numeric(15,2),
  reference text,
  notes text,
  created_by text DEFAULT 'Administrador',
  created_at timestamp with time zone DEFAULT now()
);

-- 10. Tabla de Métodos de Pago del Sistema (payment_methods)
CREATE TABLE IF NOT EXISTS payment_methods (
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'VES',
  type text NOT NULL DEFAULT 'otro',
  description text,
  instructions text,
  account_details text,
  bank_account_id text,
  bank_account_name text,
  incoming_commission numeric(8,4) DEFAULT 0,
  outgoing_commission numeric(8,4) DEFAULT 0,
  is_active boolean DEFAULT true,
  requires_reference boolean DEFAULT false,
  allow_pos boolean DEFAULT true,
  allow_online boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 11. Tabla de Respaldo y Configuración General (app_config)
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Actualizaciones de esquema (Ejecutar si ya tenías las tablas creadas previamente)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_qr text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_1 numeric(5,2) DEFAULT 30;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_2 numeric(5,2) DEFAULT 40;
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_3 numeric(5,2) DEFAULT 50;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selected_margin_type text DEFAULT '1';
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit text DEFAULT 'Unidad';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_id text DEFAULT 'exento';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiration_date text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS critical_stock integer DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS location text DEFAULT 'Sede Principal - Almacén';

-- Habilitar RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcv_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir acceso completo (SELECT, INSERT, UPDATE, DELETE) a usuarios públicos/anon
CREATE POLICY "Acceso total para categorías" ON categories FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para marcas" ON brands FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para productos" ON products FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para imágenes" ON product_images FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para pedidos" ON orders FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para bcv_rates" ON bcv_rates FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total para currency_rates" ON currency_rates FOR ALL TO public USING (true) WITH CHECK (true);
-- Crear políticas de forma segura e idempotente
DO $$
BEGIN
  -- bank_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Acceso total para bank_accounts') THEN
    CREATE POLICY "Acceso total para bank_accounts" ON bank_accounts FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
  -- bank_transfers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_transfers' AND policyname = 'Acceso total para bank_transfers') THEN
    CREATE POLICY "Acceso total para bank_transfers" ON bank_transfers FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
  -- payment_methods
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_methods' AND policyname = 'Acceso total para payment_methods') THEN
    CREATE POLICY "Acceso total para payment_methods" ON payment_methods FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
  -- app_config
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Acceso total para app_config') THEN
    CREATE POLICY "Acceso total para app_config" ON app_config FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Habilitar Realtime de forma segura sin bloqueos
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE bank_accounts;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE bank_transfers;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE payment_methods;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlQuery).then(() => {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs select-none overflow-y-auto">
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left"
        id="settings-modal"
      >
        {/* Header */}
        <div className="bg-[#131921] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#FF9900]" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Conectar Base de Datos</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <p className="text-xs text-gray-600 leading-relaxed">
            Configura las credenciales de conexión a la base de datos del sistema.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            {urlError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{urlError}</span>
              </div>
            )}

            {/* Server URL */}
            <div>
              <label className="block text-xs font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                URL del Servidor (API Endpoint)
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => {
                  setSupabaseUrl(e.target.value);
                  if (urlError) setUrlError('');
                }}
                placeholder="https://..."
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs focus:ring-2 focus:ring-[#FF9900] focus:outline-none"
                id="input-supabase-url"
              />
            </div>

            {/* Anon Key */}
            <div>
              <label className="block text-xs font-extrabold text-gray-700 uppercase tracking-wide mb-1">
                Clave de Acceso (API Key)
              </label>
              <input
                type="text"
                value={supabaseAnonKey}
                onChange={(e) => {
                  setSupabaseAnonKey(e.target.value);
                  if (urlError) setUrlError('');
                }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-[#FF9900] focus:outline-none"
                id="input-supabase-key"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] font-black text-xs uppercase tracking-wider rounded transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                id="btn-save-settings"
              >
                <Save className="w-4 h-4" />
                Guardar y Reiniciar
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold text-xs rounded transition flex items-center gap-1.5 cursor-pointer"
                title="Restaurar valores por defecto"
                id="btn-reset-defaults"
              >
                <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                Restaurar
              </button>
            </div>
          </form>

          {/* DDL SQL block */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-[#131921] uppercase tracking-wide flex items-center gap-1">
                <Terminal className="w-4 h-4 text-[#FF9900]" />
                Script de Inicialización SQL
              </span>
              <button
                onClick={copySqlToClipboard}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 cursor-pointer font-bold"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    Copiar SQL
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
              Para desplegar una base de datos propia, ejecuta este script en la consola de tu servidor de base de datos.
            </p>
            <pre className="bg-gray-900 text-green-400 text-[10px] font-mono p-3 rounded-lg max-h-[160px] overflow-y-auto leading-relaxed border border-gray-800">
              {sqlQuery}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
