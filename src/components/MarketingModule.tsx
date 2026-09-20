import React, { useState, useEffect } from 'react';
import { Tag, Star, Plus, Edit, Trash2, CheckCircle, XCircle, Gift, Save } from 'lucide-react';
import { DiscountCode, LoyaltySettings, LoyaltyReward } from '../types';
import { dbService } from '../lib/supabase';

export default function MarketingModule() {
  const [activeTab, setActiveTab] = useState<'discounts' | 'loyalty'>('discounts');
  
  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-xl font-black text-[#131921] uppercase tracking-tight flex items-center gap-2">
          <Tag className="w-6 h-6 text-pink-600" />
          <span>Marketing</span>
        </h2>
        <p className="text-xs text-gray-500 font-medium mt-1">
          Gestión de códigos de descuento y programas de fidelidad.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('discounts')}
          className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 transition ${
            activeTab === 'discounts'
              ? 'border-pink-600 text-[#131921]'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          Códigos de descuento
        </button>
        <button
          onClick={() => setActiveTab('loyalty')}
          className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 transition ${
            activeTab === 'loyalty'
              ? 'border-pink-600 text-[#131921]'
              : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          Programa de Fidelidad
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm min-h-[400px]">
        {activeTab === 'discounts' && <DiscountCodesManager />}
        {activeTab === 'loyalty' && <LoyaltyProgramManager />}
      </div>
    </div>
  );
}

function DiscountCodesManager() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setLoading(true);
    const data = await dbService.getDiscountCodes();
    setCodes(data);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-sm">
          <input 
            type="text" 
            placeholder="Buscar un descuento" 
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-xs focus:ring-pink-500 focus:border-pink-500"
          />
          <div className="absolute left-3 top-2.5 text-gray-400">
            {/* Search Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Crear descuento
        </button>
      </div>

      <table className="w-full text-left border-collapse text-xs mt-4">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-3 px-2 font-semibold">CÓDIGO DE DESCUENTO</th>
            <th className="py-3 px-2 font-semibold">PUBLICAR EN EL MENÚ</th>
            <th className="py-3 px-2 font-semibold">DESCUENTO</th>
            <th className="py-3 px-2 font-semibold">USADO/LIMITE</th>
            <th className="py-3 px-2 font-semibold">FECHA DE INICIO/FIN</th>
            <th className="py-3 px-2 font-semibold text-center">ESTADO</th>
            <th className="py-3 px-2 font-semibold text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {codes.map(code => (
            <tr key={code.id} className="hover:bg-gray-50">
              <td className="py-3 px-2">
                <p className="font-bold text-[#131921]">{code.code}</p>
                <p className="text-blue-500 cursor-pointer">{code.name}</p>
              </td>
              <td className="py-3 px-2">
                <div className={`w-10 h-5 rounded-full relative cursor-pointer ${code.show_in_digital_menu ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${code.show_in_digital_menu ? 'transform translate-x-5' : ''}`}></div>
                </div>
              </td>
              <td className="py-3 px-2">
                <p className="font-bold">{code.discount_value}{code.discount_type === 'percentage' ? '%' : ' Bs.'}</p>
                {code.min_purchase_amount && <p className="text-gray-500">Mínimo Bs. {code.min_purchase_amount}</p>}
              </td>
              <td className="py-3 px-2">
                {code.used_count} / {code.usage_limit_type === 'unlimited' ? '∞' : code.usage_limit}
              </td>
              <td className="py-3 px-2 text-gray-500">
                {code.start_date || '-'} - {code.end_date || '-'}
              </td>
              <td className="py-3 px-2 text-center">
                <span className={`px-2 py-1 rounded text-[10px] font-bold ${code.is_active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                  {code.is_active ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </td>
              <td className="py-3 px-2 text-right">
                <button className="text-gray-400 hover:text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
          {!loading && codes.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-gray-500">
                No hay códigos de descuento creados.
              </td>
            </tr>
          )}
          {loading && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-gray-500">
                Cargando...
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {isModalOpen && (
        <DiscountModal onClose={() => setIsModalOpen(false)} onSaved={fetchCodes} />
      )}
    </div>
  );
}

function DiscountModal({ onClose, onSaved }: { onClose: () => void, onSaved: () => void }) {
  const [formData, setFormData] = useState<Partial<DiscountCode>>({
    code: '',
    name: '',
    discount_type: 'percentage',
    discount_value: 0,
    target_type: 'order',
    usage_limit_type: 'unlimited',
    customer_eligibility: 'all',
    uses_per_customer: 'unlimited',
    show_in_digital_menu: false,
    is_active: true
  });
  
  const handleSave = async () => {
    try {
      await dbService.saveDiscountCode(formData);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Error al guardar código");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-2xl mt-10">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-lg z-10">
          <h3 className="font-black text-lg">Crear y editar códigos de descuento</h3>
          <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400" /></button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50">
          <div className="space-y-2">
             <label className="text-sm font-bold text-gray-700">Selecciona el tipo de descuento</label>
             <div className="grid grid-cols-2 gap-4">
                <div 
                  className={`border-2 p-4 rounded-lg cursor-pointer flex flex-col items-center gap-2 ${formData.target_type === 'order' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  onClick={() => setFormData({...formData, target_type: 'order'})}
                >
                   <input type="radio" checked={formData.target_type === 'order'} readOnly className="self-start mb-2" />
                   <span className="text-3xl">🧾</span>
                   <span className={`text-xs font-bold text-center ${formData.target_type === 'order' ? 'text-blue-600' : 'text-gray-600'}`}>Descuento sobre el total del pedido</span>
                </div>
                <div 
                  className={`border-2 p-4 rounded-lg cursor-pointer flex flex-col items-center gap-2 ${formData.target_type === 'specific_products' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  onClick={() => setFormData({...formData, target_type: 'specific_products'})}
                >
                   <input type="radio" checked={formData.target_type === 'specific_products'} readOnly className="self-start mb-2" />
                   <span className="text-3xl">🍔</span>
                   <span className={`text-xs font-bold text-center ${formData.target_type === 'specific_products' ? 'text-blue-600' : 'text-gray-600'}`}>Descuento a productos específicos</span>
                </div>
             </div>
          </div>

          <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
             <h4 className="font-bold text-gray-700">Información de descuento</h4>
             
             <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold">Código de descuento</label>
                <input 
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="MI-PRIMERA-COMPRA"
                />
             </div>
             
             <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold">Nombre del descuento</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 text-sm"
                  placeholder="Ej: Mi nuevo descuento"
                />
             </div>

             <div className="flex gap-4">
                <div className="w-1/3">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Tipo</label>
                  <select 
                    value={formData.discount_type}
                    onChange={e => setFormData({...formData, discount_type: e.target.value as any})}
                    className="w-full border border-gray-300 rounded p-2 text-sm bg-white"
                  >
                    <option value="percentage">%</option>
                    <option value="fixed">Monto Fijo</option>
                  </select>
                </div>
                <div className="w-2/3">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Valor</label>
                  <input 
                    type="number" 
                    value={formData.discount_value}
                    onChange={e => setFormData({...formData, discount_value: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    placeholder="0"
                  />
                </div>
             </div>
          </div>

          <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
             <h4 className="font-bold text-gray-700">Validez del descuento</h4>
             <div className="flex gap-4">
                <div className="w-1/2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Fecha de inicio</label>
                  <input 
                    type="date" 
                    value={formData.start_date || ''}
                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Fecha de finalización</label>
                  <input 
                    type="date" 
                    value={formData.end_date || ''}
                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
             </div>
          </div>
          
          <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
             <h4 className="font-bold text-gray-700">Número de descuentos disponibles</h4>
             <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={formData.usage_limit_type === 'unlimited'} 
                    onChange={() => setFormData({...formData, usage_limit_type: 'unlimited'})}
                  />
                  <span className="text-sm">Ilimitado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={formData.usage_limit_type === 'limited'} 
                    onChange={() => setFormData({...formData, usage_limit_type: 'limited'})}
                  />
                  <span className="text-sm">Limitado</span>
                </label>
                {formData.usage_limit_type === 'limited' && (
                  <input 
                    type="number"
                    value={formData.usage_limit || ''}
                    onChange={e => setFormData({...formData, usage_limit: Number(e.target.value)})}
                    className="border border-gray-300 rounded p-2 text-sm w-full mt-2"
                    placeholder="Cantidad máxima de usos totales"
                  />
                )}
             </div>
          </div>
          
          <div className="bg-white p-4 rounded border border-gray-200 flex justify-between items-center">
             <span className="font-bold text-gray-700">Mostrar este descuento en mi Menú Digital</span>
             <div 
               className={`w-12 h-6 rounded-full relative cursor-pointer ${formData.show_in_digital_menu ? 'bg-blue-600' : 'bg-gray-300'}`}
               onClick={() => setFormData({...formData, show_in_digital_menu: !formData.show_in_digital_menu})}
             >
               <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.show_in_digital_menu ? 'transform translate-x-6' : ''}`}></div>
             </div>
          </div>
          
        </div>
        
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg flex justify-center sticky bottom-0">
          <button 
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded text-sm w-full sm:w-auto"
          >
            Guardar descuento
          </button>
        </div>
      </div>
    </div>
  );
}

function LoyaltyProgramManager() {
  const [settings, setSettings] = useState<LoyaltySettings>({ is_active: false, points_per_amount: 10, amount_for_points: 10 });
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const sets = await dbService.getLoyaltySettings();
    if (sets) setSettings(sets);
    const rews = await dbService.getLoyaltyRewards();
    setRewards(rews);
    setLoading(false);
  };

  const handleToggleProgram = async () => {
    const newSettings = { ...settings, is_active: !settings.is_active };
    await dbService.saveLoyaltySettings(newSettings);
    setSettings(newSettings);
  };

  return (
    <div className="max-w-4xl space-y-6">
      
      {/* Active status banner */}
      <div className={`border rounded-lg p-6 flex flex-col sm:flex-row justify-between items-center gap-4 ${settings.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
        <div>
          <h3 className="text-lg font-black flex items-center gap-2">
            Programa {settings.is_active ? 'activado' : 'desactivado'} 
            {settings.is_active && <CheckCircle className="w-5 h-5 text-green-500" />}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Incrementa la fidelidad de tus clientes recompensando sus compras.
          </p>
          <button 
            onClick={handleToggleProgram}
            className={`mt-4 px-4 py-2 border rounded font-bold text-xs ${settings.is_active ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
          >
            {settings.is_active ? 'Desactivar programa' : 'Activar programa'}
          </button>
        </div>
        <div className="hidden sm:block">
           <img src="https://i.ibb.co/3s6xW1V/loyalty-illustration.png" alt="Loyalty App Illustration" className="h-32 object-contain mix-blend-multiply opacity-80" />
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-4">
        <h4 className="font-black text-[#131921]">Forma de ganar puntos</h4>
        <p className="text-xs text-gray-500">Configura la forma que tienen los clientes de ganar puntos</p>
        
        <div className="flex items-center justify-between border border-gray-200 rounded p-4 bg-gray-50">
           <div className="flex items-center gap-2 text-sm font-bold">
             <span>Cada Bs. {settings.amount_for_points} gastado por pedido = </span>
             <span className="flex items-center gap-1 text-blue-600"><Star className="w-4 h-4 fill-current" /> {settings.points_per_amount} punto(s)</span>
           </div>
           <button className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline">
             <Edit className="w-4 h-4" /> Editar
           </button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="font-black text-[#131921]">Recompensas</h4>
            <p className="text-xs text-gray-500">Configura las recompensas que obtienen cuando gastan sus puntos</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-xs font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Crear recompensa
          </button>
        </div>
        
        <div className="space-y-2">
          {rewards.map(reward => (
            <div key={reward.id} className="flex items-center justify-between border border-gray-200 rounded p-4 bg-gray-50">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Star className="w-4 h-4 text-blue-600 fill-current" />
                <span>Cada {reward.points_cost} punto(s) =</span>
                <span className="flex items-center gap-1 text-orange-600">
                  <Gift className="w-4 h-4" /> {reward.discount_value}{reward.discount_type === 'percentage' ? '%' : ' Bs.'} Descuento
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline">
                  <Edit className="w-4 h-4" /> Editar
                </button>
                <button className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {rewards.length === 0 && !loading && (
            <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded">
              No hay recompensas configuradas
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
