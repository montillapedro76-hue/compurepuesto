/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Lock, Mail, Eye, EyeOff, X, KeyRound, AlertTriangle, UserCheck, 
  ShieldCheck, UserPlus, CheckCircle2, ArrowRight, ArrowLeft, 
  ShoppingBag, Building2, Phone, CreditCard, ShieldAlert
} from 'lucide-react';
import { dbService } from '../lib/supabase';
import { StoreUser } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: StoreUser) => void;
}

type ActiveMode = 'login' | 'register' | 'forgot' | 'verify_code';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [activeMode, setActiveMode] = useState<ActiveMode>('login');

  // Login states
  const [loginStep, setLoginStep] = useState<'identifier' | 'password'>('identifier');
  const [matchedUserLabel, setMatchedUserLabel] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register states
  const [regDocType, setRegDocType] = useState<string>('V');
  const [regDocNum, setRegDocNum] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regTerms, setRegTerms] = useState(true);
  const [verificationCode, setVerificationCode] = useState('849201');

  // Password Reset states
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');
  const [forgotCode, setForgotCode] = useState('123456');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');

  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const resetAllState = () => {
    setError('');
    setSuccessMsg('');
    setLoading(false);
  };

  const handleTabChange = (mode: ActiveMode) => {
    resetAllState();
    setActiveMode(mode);
    if (mode === 'login') {
      setLoginStep('identifier');
      setMatchedUserLabel('');
      setLoginPassword('');
    }
  };

  // Password Strength Checker
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-gray-200' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score: 1, label: 'Débil', color: 'bg-red-500' };
    if (score <= 4) return { score: 2, label: 'Media', color: 'bg-amber-500' };
    return { score: 3, label: 'Fuerte', color: 'bg-emerald-500' };
  };

  // --- STEP 1: CHECK IF USER EXISTS ---
  const handleCheckUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllState();

    if (!loginEmail.trim()) {
      setError('Por favor ingresa tu usuario, correo o número de documento.');
      return;
    }

    setLoading(true);
    try {
      const inputClean = loginEmail.trim().toLowerCase();
      const docOnly = inputClean.replace(/[^0-9]/g, '');

      // 1. Check if the user is an internal store user
      const storeUsers = await dbService.getStoreUsers();
      const matchedStoreUser = storeUsers.find(
        u => {
          const uEmail = (u.email || '').trim().toLowerCase();
          const uName = (u.name || '').trim().toLowerCase();
          const uDoc = (u.document || u.doc_number || u.documento || '').toLowerCase().replace(/[^0-9]/g, '');
          const uPhone = (u.phone || u.telefono || '').replace(/[^0-9]/g, '');
          return (
            (uEmail && uEmail === inputClean) ||
            (uName && uName === inputClean) ||
            (docOnly && uDoc && uDoc === docOnly) ||
            (docOnly && uPhone && uPhone.includes(docOnly))
          );
        }
      );

      if (matchedStoreUser) {
        setMatchedUserLabel(matchedStoreUser.name || matchedStoreUser.email || 'Usuario');
        setLoginStep('password');
        setLoading(false);
        return;
      }

      // 2. Check if the user is a client/customer
      const matchedClient = await dbService.findClientByIdentifier(inputClean);
      if (matchedClient) {
        const clientName = matchedClient.nombres 
          ? `${matchedClient.nombres} ${matchedClient.apellidos || ''}`.trim() 
          : (matchedClient.name || matchedClient.correo || inputClean);
        setMatchedUserLabel(clientName);
        setLoginStep('password');
        setLoading(false);
        return;
      }

      // 3. User does NOT exist in either table -> redirect automatically to register tab!
      if (inputClean.includes('@')) {
        setRegEmail(inputClean);
      } else if (/^[0-9vjepg-]+$/i.test(inputClean)) {
        const cleanDoc = inputClean.replace(/[^0-9]/g, '');
        setRegDocNum(cleanDoc);
        const firstChar = inputClean.charAt(0).toUpperCase();
        if (['V', 'E', 'J', 'G', 'P'].includes(firstChar)) {
          setRegDocType(firstChar);
        }
      }

      setActiveMode('register');
      setError('No encontramos tu usuario o correo registrado. Por favor completa tus datos para registrarte.');

    } catch (err: any) {
      console.error('Check user error:', err);
      setError('Error al verificar el usuario.');
    } finally {
      setLoading(false);
    }
  };

  // --- STEP 2: LOG IN WITH PASSWORD ---
  const handleLoginPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllState();

    if (!loginPassword.trim()) {
      setError('Por favor ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const emailClean = loginEmail.trim().toLowerCase();

      // 1. Check if the user is an internal store user
      const storeUsers = await dbService.getStoreUsers();
      const matchedStoreUser = storeUsers.find(
        u => (u.email || '').trim().toLowerCase() === emailClean ||
             (u.name || '').trim().toLowerCase() === emailClean
      );

      if (matchedStoreUser) {
        const loggedUser = await dbService.loginStoreUser(matchedStoreUser.email, loginPassword);
        if (loggedUser) {
          await dbService.recordSecurityLog(
            'interno',
            loggedUser.email,
            'login',
            `Acceso usuario interno (${loggedUser.role})`
          );
          onLoginSuccess(loggedUser);
          onClose();
          return;
        } else {
          setError('Contraseña incorrecta.');
          return;
        }
      }

      // 2. Check if the user is a client/customer
      const res = await dbService.loginClient(emailClean, loginPassword);
      if (res.success && res.client) {
        const clientPhone = res.client.telefono || res.client.phone || res.client.celular || '';
        const loggedUser: StoreUser = {
          id: res.client.id || res.client.correo || res.client.email,
          name: res.client.nombres ? `${res.client.nombres} ${res.client.apellidos}`.trim() : (res.client.name || 'Cliente'),
          email: res.client.correo || res.client.email || emailClean,
          phone: clientPhone,
          telefono: clientPhone,
          role: 'Cliente',
          is_active: true
        };
        onLoginSuccess(loggedUser);
        onClose();
        return;
      } else {
        setError(res.message || 'Contraseña incorrecta.');
        return;
      }

    } catch (err: any) {
      console.error('Unified login error:', err);
      setError('Error al procesar el inicio de sesión.');
    } finally {
      setLoading(false);
    }
  };

  // --- CLIENT REGISTRATION HANDLER ---
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllState();

    if (!regDocNum.trim() || !regFirstName.trim() || !regEmail.trim() || !regPhone.trim() || !regPassword.trim()) {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }

    if (!regTerms) {
      setError('Debes aceptar los términos y condiciones para continuar.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (regPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await dbService.registerClientUser({
        tipo_documento: regDocType,
        documento: regDocNum.trim(),
        nombres: regFirstName.trim(),
        apellidos: regLastName.trim(),
        correo: regEmail.trim(),
        telefono: regPhone.trim(),
        password: regPassword.trim()
      });

      if (res.success && res.client) {
        const fullName = res.client.nombres
          ? `${res.client.nombres} ${res.client.apellidos || ''}`.trim()
          : (res.client.name || `${regFirstName.trim()} ${regLastName.trim()}`.trim());
        const newUser: StoreUser = {
          id: res.client?.id || regEmail.trim(),
          name: fullName,
          email: res.client?.correo || res.client?.email || regEmail.trim().toLowerCase(),
          phone: res.client?.telefono || res.client?.phone || regPhone.trim(),
          telefono: res.client?.telefono || res.client?.phone || regPhone.trim(),
          role: 'Cliente',
          is_active: true
        };
        setSuccessMsg(res.message || '¡Registro e inicio de sesión exitoso!');
        setTimeout(() => {
          onLoginSuccess(newUser);
          onClose();
        }, 1000);
      } else {
        // If already registered, attempt login with supplied password
        const tryLogin = await dbService.loginClient(regEmail.trim(), regPassword.trim());
        if (tryLogin.success && tryLogin.client) {
          const clientPhone = tryLogin.client.telefono || tryLogin.client.phone || regPhone.trim();
          const loggedUser: StoreUser = {
            id: tryLogin.client.id || tryLogin.client.correo || regEmail.trim(),
            name: tryLogin.client.nombres ? `${tryLogin.client.nombres} ${tryLogin.client.apellidos}`.trim() : (tryLogin.client.name || 'Cliente'),
            email: tryLogin.client.correo || tryLogin.client.email || regEmail.trim(),
            phone: clientPhone,
            telefono: clientPhone,
            role: 'Cliente',
            is_active: true
          };
          setSuccessMsg('¡Usuario registrado verificado! Iniciando sesión...');
          setTimeout(() => {
            onLoginSuccess(loggedUser);
            onClose();
          }, 1000);
          return;
        }

        // Switch to login tab smoothly with prefilled identifier and password step
        setLoginEmail(regEmail.trim() || regDocNum.trim());
        setMatchedUserLabel(`${regFirstName.trim()} ${regLastName.trim()}`.trim() || regEmail.trim());
        setLoginStep('password');
        setActiveMode('login');
        setError('Esta cuenta ya está registrada. Por favor ingresa tu contraseña para iniciar sesión o recupérala si la olvidaste.');
      }
    } catch (err: any) {
      console.error('Client registration error:', err);
      setError('Error durante el registro: ' + (err.message || 'Ocurrió un problema inesperado.'));
    } finally {
      setLoading(false);
    }
  };

  // --- PASSWORD RECOVERY HANDLER ---
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllState();

    if (!forgotEmail.trim()) {
      setError('Por favor ingresa tu correo electrónico registrado.');
      return;
    }

    if (!forgotNewPass.trim() || !forgotConfirmPass.trim()) {
      setError('Por favor ingresa tu nueva contraseña.');
      return;
    }

    if (forgotNewPass !== forgotConfirmPass) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (forgotNewPass.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await dbService.resetClientPassword(forgotEmail.trim().toLowerCase(), forgotNewPass.trim());
      if (res.success) {
        setSuccessMsg(res.message);
        setTimeout(() => {
          setLoginEmail(forgotEmail.trim().toLowerCase());
          setActiveMode('login');
          resetAllState();
        }, 1500);
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Error al actualizar la contraseña: ' + (err.message || 'Ocurrió un problema de conexión.'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFillInternal = (demoEmail: string, demoPass: string) => {
    setLoginEmail(demoEmail);
    setLoginPassword(demoPass);
    setError('');
  };

  const strength = getPasswordStrength(regPassword);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn" id="login-modal-overlay">
      <div className="bg-white rounded-3xl border border-gray-100 w-full max-w-lg shadow-2xl overflow-hidden text-left flex flex-col max-h-[92vh] relative p-6 md:p-8" id="login-modal-card">
        
        {/* CLOSE BUTTON (Top Right as in the design) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-800 rounded-full transition cursor-pointer border border-gray-100 shadow-sm z-50"
          id="close-login-modal-btn"
          title="Cerrar"
        >
          <X className="w-5 h-5 font-black" />
        </button>

        {/* ALERTS */}
        {(error || successMsg) && (
          <div className="pt-2 pb-1 shrink-0 space-y-2">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-start gap-2 animate-fadeIn" id="login-error-alert">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-start gap-2 animate-fadeIn" id="login-success-alert">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* BODY CONTAINER */}
        <div className="overflow-y-auto custom-scrollbar flex-1 py-2">

          {/* ==================== 1. INICIAR SESIÓN ==================== */}
          {activeMode === 'login' && (
            <div className="flex flex-col items-center">
              {loginStep === 'identifier' ? (
                <>
                  {/* Header Title with line underneath */}
                  <div className="text-center mb-8 w-full">
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight relative inline-block pb-3 uppercase font-display">
                      Ingresa a tu <span className="text-[#293896]">Sesión</span>
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-[#293896] rounded-full"></span>
                    </h2>
                  </div>

                  <form onSubmit={handleCheckUserSubmit} className="space-y-6 w-full max-w-sm" id="login-check-form">
                    {/* Username / Email field */}
                    <div className="space-y-2 text-center">
                      <label className="block text-center font-bold text-slate-800 text-[14px]">
                        Nombre De Usuario o Correo:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="Su Correo o Usuario"
                          className="w-full px-5 py-3 bg-slate-50 text-slate-900 placeholder-slate-400 font-semibold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-[#293896]/30 border border-slate-200 transition text-center"
                          id="login-email-input"
                          autoFocus
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#293896] font-bold text-lg select-none">*</span>
                      </div>
                    </div>

                    {/* Submit button step 1 */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary-pill w-full py-3.5 text-xs tracking-wider shadow-md disabled:opacity-50 mt-6 cursor-pointer"
                      id="login-check-user-btn"
                    >
                      {loading ? (
                        <span>Verificando...</span>
                      ) : (
                        <span className="flex items-center gap-2 uppercase"><ArrowRight className="w-4 h-4" /> Continuar</span>
                      )}
                    </button>

                    {/* Bottom centered links */}
                    <div className="text-center pt-2 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleTabChange('forgot')}
                        className="block mx-auto text-xs font-bold text-[#293896] hover:text-[#0D9488] hover:underline cursor-pointer"
                        id="forgot-password-link"
                      >
                        Recuperar contraseña
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTabChange('register')}
                        className="block mx-auto text-xs font-bold text-[#293896] hover:text-[#0D9488] hover:underline cursor-pointer"
                        id="go-to-register-link"
                      >
                        ¿No estás registrado? Regístrate en pocos pasos
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  {/* Step 2: Password Input */}
                  <div className="text-center mb-6 w-full">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-50 text-[#293896] rounded-full mb-2 font-bold text-lg shadow-xs border border-indigo-100">
                      <UserCheck className="w-6 h-6 text-[#293896]" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase font-display">
                      ¡Hola, <span className="text-[#293896]">{matchedUserLabel || 'Usuario'}</span>!
                    </h2>
                    <div className="mt-2 inline-flex items-center gap-2 px-3.5 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700 border border-slate-200">
                      <span className="truncate max-w-[180px]">{loginEmail}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginStep('identifier');
                          setLoginPassword('');
                          setError('');
                        }}
                        className="text-[#0D9488] hover:underline text-[11px] font-bold shrink-0 ml-1 cursor-pointer"
                        title="Cambiar usuario"
                      >
                        Cambiar
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleLoginPasswordSubmit} className="space-y-6 w-full max-w-sm" id="login-password-form">
                    {/* Password field */}
                    <div className="space-y-2 text-center">
                      <label className="block text-center font-bold text-slate-800 text-[14px]">
                        Ingresa tu Contraseña:
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Su Contraseña"
                          className="w-full pl-5 pr-12 py-3 bg-slate-50 text-slate-900 placeholder-slate-400 font-semibold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-[#293896]/30 border border-slate-200 transition text-center"
                          id="login-password-input"
                          autoFocus
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-0.5"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <span className="text-[#293896] font-bold text-lg select-none">*</span>
                        </div>
                      </div>
                    </div>

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary-pill w-full py-3.5 text-xs tracking-wider shadow-md disabled:opacity-50 mt-6 cursor-pointer"
                      id="login-submit-btn"
                    >
                      {loading ? <span>Iniciando sesión...</span> : <span className="flex items-center gap-2 uppercase"><ShieldCheck className="w-4 h-4" /> Ingresar</span>}
                    </button>

                    {/* Bottom links */}
                    <div className="text-center pt-2 space-y-3">
                      <button
                        type="button"
                        onClick={() => handleTabChange('forgot')}
                        className="block mx-auto text-xs font-bold text-[#131921] hover:text-[#e47911] hover:underline cursor-pointer"
                        id="forgot-password-link"
                      >
                        Recuperar contraseña
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLoginStep('identifier');
                          setLoginPassword('');
                          setError('');
                        }}
                        className="inline-flex items-center gap-1 mx-auto text-xs font-bold text-[#e47911] hover:underline cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Volver a ingresar usuario</span>
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ==================== 2. REGISTRARSE ==================== */}
          {activeMode === 'register' && (
            <div className="flex flex-col">
              {/* Header Title with line underneath */}
              <div className="text-center mb-6 w-full">
                <h2 className="text-xl font-black text-[#131921] tracking-tight relative inline-block pb-2 uppercase">
                  Regístrate en <span className="text-[#FF9900]">pocos pasos</span>
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-[#FF9900]"></span>
                </h2>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4 max-w-md mx-auto w-full" id="register-form">
                {/* Document Type & Number */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Tipo de Doc *
                    </label>
                    <select
                      value={regDocType}
                      onChange={(e) => setRegDocType(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    >
                      <option value="V">V (Cédula)</option>
                      <option value="E">E (Extranjero)</option>
                      <option value="J">J (RIF)</option>
                      <option value="G">G (Gov)</option>
                      <option value="P">Pasaporte</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Número de Documento / RIF *
                    </label>
                    <input
                      type="text"
                      required
                      value={regDocNum}
                      onChange={(e) => setRegDocNum(e.target.value)}
                      placeholder="Ej: 12345678"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                </div>

                {/* First Name & Last Name */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="Ej: Pedro"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="Ej: Pérez"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Correo Electrónico *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Teléfono Móvil *
                    </label>
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="0414-1234567"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                </div>

                {/* Password & Confirm Password */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Contraseña *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                      Confirmar Contraseña *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Repetir clave"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                </div>

                {/* Password Strength */}
                {regPassword && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden flex gap-0.5">
                      <div className={`h-full ${strength.score >= 1 ? strength.color : 'bg-gray-200'} flex-1 transition-all`}></div>
                      <div className={`h-full ${strength.score >= 2 ? strength.color : 'bg-gray-200'} flex-1 transition-all`}></div>
                      <div className={`h-full ${strength.score >= 3 ? strength.color : 'bg-gray-200'} flex-1 transition-all`}></div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">
                      Fortaleza: <span className="font-extrabold">{strength.label}</span>
                    </span>
                  </div>
                )}

                {/* Terms and conditions */}
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regTerms}
                    onChange={(e) => setRegTerms(e.target.checked)}
                    className="mt-0.5 rounded text-[#FF9900] focus:ring-[#FF9900]"
                  />
                  <span className="text-[11px] text-gray-600 leading-tight">
                    Acepto los <strong className="text-gray-900 font-bold">términos y condiciones</strong> del servicio.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-[#FF9900] to-[#e47911] hover:from-[#e47911] hover:to-[#cc6d08] text-[#131921] font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-[#FF9900]/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] duration-150"
                  id="register-submit-btn"
                >
                  {loading ? <span>Registrando...</span> : <span>Crear Cuenta</span>}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => handleTabChange('login')}
                    className="text-xs font-bold text-[#e47911] hover:text-[#cc6d08] hover:underline cursor-pointer"
                  >
                    ¿Ya tienes cuenta? Inicia sesión
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================== 3. RECUPERAR CONTRASEÑA ==================== */}
          {activeMode === 'forgot' && (
            <div className="flex flex-col">
              {/* Header Title with line underneath */}
              <div className="text-center mb-6 w-full">
                <h2 className="text-xl font-black text-[#131921] tracking-tight relative inline-block pb-2 uppercase">
                  Recuperar <span className="text-[#FF9900]">Contraseña</span>
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-[#FF9900]"></span>
                </h2>
              </div>

              <form onSubmit={handleForgotSubmit} className="space-y-4 max-w-sm mx-auto w-full" id="forgot-form">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-center">
                  <p className="text-[11px] text-amber-900 font-bold">
                    Ingresa tu correo electrónico registrado y tu nueva contraseña para actualizar tu acceso en la base de datos.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Correo Electrónico Registrado *
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full px-4 py-3 bg-[#eaedf1] text-[#131921] placeholder-gray-500 font-bold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nueva Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    value={forgotNewPass}
                    onChange={(e) => setForgotNewPass(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-4 py-3 bg-[#eaedf1] text-[#131921] placeholder-gray-500 font-bold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Confirmar Nueva Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    value={forgotConfirmPass}
                    onChange={(e) => setForgotConfirmPass(e.target.value)}
                    placeholder="Repetir clave"
                    className="w-full px-4 py-3 bg-[#eaedf1] text-[#131921] placeholder-gray-500 font-bold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FF9900] to-[#e47911] hover:from-[#e47911] hover:to-[#cc6d08] text-[#131921] font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-[#FF9900]/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <span>Actualizando...</span>
                  ) : (
                    <span>Restablecer Contraseña</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => handleTabChange('login')}
                    className="text-xs font-bold text-[#e47911] hover:text-[#cc6d08] hover:underline cursor-pointer"
                  >
                    Volver al inicio de sesión
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
