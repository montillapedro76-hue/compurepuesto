import React, { useState, useEffect, useMemo } from 'react';
import { Unlock, X, User, Loader2, ChevronDown } from 'lucide-react';
import { StoreUser } from '../types';
import { dbService } from '../lib/supabase';

interface OpenCashSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { aperturaBs: number; observaciones: string; empleadoNombre: string }) => Promise<void>;
  bcvRate: number;
  currentUser?: StoreUser | null;
  storeUsers?: StoreUser[];
  initialBs?: string;
  initialObs?: string;
}

export default function OpenCashSessionModal({
  isOpen,
  onClose,
  onConfirm,
  bcvRate,
  currentUser,
  storeUsers = [],
  initialBs = '10.00',
  initialObs = ''
}: OpenCashSessionModalProps) {
  const [aperturaBsInput, setAperturaBsInput] = useState<string>(initialBs);
  const [aperturaObsInput, setAperturaObsInput] = useState<string>(initialObs);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [localUsers, setLocalUsers] = useState<StoreUser[]>([]);

  useEffect(() => {
    if (isOpen) {
      setAperturaBsInput(initialBs || '10.00');
      setAperturaObsInput(initialObs || '');
    }
  }, [isOpen, initialBs, initialObs]);

  useEffect(() => {
    if (storeUsers && storeUsers.length > 0) {
      setLocalUsers(storeUsers);
    } else if (isOpen) {
      dbService.getStoreUsers().then(users => {
        if (users && users.length > 0) {
          setLocalUsers(users);
        }
      }).catch(console.error);
    }
  }, [storeUsers, isOpen]);

  // Authorized caja personnel
  const authorizedCajaUsers = useMemo(() => {
    const list = localUsers.length > 0 ? localUsers : (storeUsers || []);
    return list.filter(u => {
      if (u.is_active === false) return false;
      const role = (u.role || '').toLowerCase();
      if (role === 'cliente') return false;

      if (role === 'gerente' || role === 'admin' || role === 'administrador' || role === 'cajero') {
        return true;
      }

      if (u.permissions && u.permissions.length > 0) {
        return u.permissions.some(p => p === 'caja' || p === 'sales' || p === 'orders');
      }

      return false;
    });
  }, [localUsers, storeUsers]);

  // Unified list of options for dropdown
  const employeeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    authorizedCajaUsers.forEach(u => {
      const val = (u.name || u.email || '').trim();
      if (val && !opts.some(o => o.value === val)) {
        opts.push({ value: val, label: `${val} — [${u.role || 'Cajero'}]` });
      }
    });
    if (currentUser && currentUser.role !== 'Cliente') {
      const val = (currentUser.name || currentUser.email || '').trim();
      if (val && !opts.some(o => o.value === val)) {
        opts.unshift({ value: val, label: `${val} — [${currentUser.role || 'Usuario Actual'}]` });
      }
    }
    if (opts.length === 0) {
      opts.push({ value: 'Cajero Responsable', label: 'Cajero Responsable' });
    }
    return opts;
  }, [authorizedCajaUsers, currentUser]);

  // Set default employee when opening
  useEffect(() => {
    if (isOpen) {
      if (employeeOptions.length > 0) {
        const found = employeeOptions.find(o => o.value === selectedEmployee);
        if (!found) {
          setSelectedEmployee(employeeOptions[0].value);
        }
      } else {
        setSelectedEmployee('Cajero Responsable');
      }
    }
  }, [isOpen, employeeOptions, selectedEmployee]);

  if (!isOpen) return null;

  const bsVal = parseFloat(aperturaBsInput) || 0;
  const rateToUse = bcvRate > 0 ? bcvRate : 36.5;
  const approxUsd = bsVal / rateToUse;

  const handleSubmit = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    const empName = selectedEmployee.trim() || (employeeOptions.length > 0 ? employeeOptions[0].value : 'Cajero Responsable');
    
    if (isNaN(bsVal) || bsVal < 0) {
      alert('Por favor ingrese un monto de apertura válido.');
      return;
    }

    setIsSaving(true);
    try {
      await onConfirm({
        aperturaBs: bsVal,
        observaciones: aperturaObsInput.trim(),
        empleadoNombre: empName
      });
      onClose();
    } catch (err: any) {
      console.error("Error opening cash session:", err);
      alert("Error al aperturar caja: " + (err.message || "Intente de nuevo"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center p-4 backdrop-blur-xs select-none animate-fadeIn font-poppins">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 text-left">
        {/* HEADER matching corporate identity */}
        <div className="bg-[#1D3557] px-5 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#40E0D0]/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Unlock className="w-5 h-5 text-[#40E0D0] stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-montserrat font-extrabold tracking-tight leading-tight text-white uppercase">
                Apertura de Caja Registradora
              </h3>
              <p className="text-[11px] text-gray-200 font-medium">
                Asigne el fondo inicial para iniciar operaciones de venta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM BODY */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Empleado responsable */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider">
                Empleado Responsable del Turno *
              </label>
              <span className="text-[10px] font-montserrat font-extrabold text-[#1D3557] bg-[#40E0D0]/20 px-2 py-0.5 rounded-md border border-[#40E0D0]/40">
                {authorizedCajaUsers.length} Habilitados
              </span>
            </div>

            <div className="relative">
              {employeeOptions.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:border-[#1D3557] focus:bg-white transition cursor-pointer appearance-none"
                  >
                    {employeeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  placeholder="Nombre del Cajero / Empleado Responsable"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] focus:outline-none focus:border-[#1D3557] focus:bg-white transition"
                />
              )}
              <User className="w-4 h-4 text-[#00BFFF] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[10px] text-[#2B2D42]/60 mt-1 font-medium">
              Se muestran exclusivamente los usuarios registrados activos con permisos de caja/venta.
            </p>
          </div>

          {/* Fondo inicial Bs */}
          <div>
            <label className="block text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider mb-1">
              Fondo Inicial en Efectivo (Bs) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#1D3557]">
                Bs
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={aperturaBsInput}
                onChange={(e) => setAperturaBsInput(e.target.value)}
                placeholder="10,00"
                className="w-full pl-9 pr-3 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-bold text-[#2B2D42] font-mono focus:outline-none focus:border-[#1D3557] focus:bg-white transition"
              />
            </div>
            <p className="text-[10px] text-[#1D3557] font-bold mt-1">
              Equivalente aprox: <span className="font-mono">${approxUsd.toFixed(2)} USD</span> (Tasa BCV: <span className="font-mono">{rateToUse.toFixed(2)} Bs/$</span>)
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-montserrat font-extrabold text-[#1D3557] uppercase tracking-wider mb-1">
              Observaciones / Notas de Apertura
            </label>
            <input
              type="text"
              value={aperturaObsInput}
              onChange={(e) => setAperturaObsInput(e.target.value)}
              placeholder="Ej: Billetes sencillos para cambio..."
              className="w-full px-3 py-2.5 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs font-medium text-[#2B2D42] focus:outline-none focus:border-[#1D3557] focus:bg-white transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-[#1D3557] font-montserrat font-bold text-xs rounded-full shadow-sm hover:shadow-md transition cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-4 h-4 text-gray-500" />
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 text-[#1D3557] text-xs font-montserrat font-extrabold uppercase tracking-wider rounded-full border border-gray-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#00BFFF]" />
              ) : (
                <Unlock className="w-4 h-4 text-[#00BFFF] stroke-[2.5]" />
              )}
              <span>Confirmar y Abrir Caja</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
