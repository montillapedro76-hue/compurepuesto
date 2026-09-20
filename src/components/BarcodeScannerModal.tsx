import React, { useEffect, useState, useRef } from 'react';
import { X, Camera, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product } from '../types';
import { dbService } from '../lib/supabase';

interface BarcodeScannerModalProps {
  onClose: () => void;
  products: Product[];
  onProductFound?: (product: Product) => void;
  onCodeScanned?: (code: string) => void;
}

export default function BarcodeScannerModal({
  onClose,
  products,
  onProductFound,
  onCodeScanned,
}: BarcodeScannerModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "barcode-qr-reader";

  // Filter products that actually have barcode or QR configured for testing/demo reference
  const productsWithCode = products.filter(p => p.barcode_qr && p.barcode_qr.trim() !== '');

  useEffect(() => {
    // Start scanner on mount or when camera facingMode changes
    let html5Qrcode: Html5Qrcode;
    
    const startScanner = async () => {
      try {
        setError(null);
        setIsScanning(true);
        html5Qrcode = new Html5Qrcode(scannerId);
        scannerRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: facingMode },
          {
            fps: 15,
            qrbox: (width, height) => {
              const minSize = Math.min(width, height);
              const boxWidth = Math.floor(minSize * 0.75);
              // Barcodes are horizontal, so let's make a box that is wider than it is tall
              // or a standard square that fits both QR and Barcode. A box with 250x180 is perfect!
              return { width: Math.max(boxWidth, 250), height: Math.max(Math.floor(boxWidth * 0.7), 170) };
            }
          },
          (decodedText) => {
            // Success handler
            handleDecodedCode(decodedText);
          },
          () => {
            // Silent error (seeking code)
          }
        );
        setCameraPermission('granted');
      } catch (err: any) {
        console.error("Scanner start failure:", err);
        setError("No se pudo iniciar la cámara. Por favor asegúrate de otorgar los permisos de cámara en tu navegador.");
        setCameraPermission('denied');
        setIsScanning(false);
      }
    };

    // Delay slightly to ensure element is mounted
    const timer = setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop()
            .then(() => {
              console.log("Scanner stopped successfully.");
            })
            .catch(err => {
              console.error("Failed to stop scanner on unmount:", err);
            });
        }
      }
    };
  }, [facingMode]);

  const handleDecodedCode = async (code: string) => {
    if (!code || isSearching) return;
    setIsSearching(true);
    setError(null);

    // If we only need the raw scanned text, trigger callback immediately
    if (onCodeScanned) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
      } catch (e) {}

      setIsSearching(false);
      onCodeScanned(code.trim());
      onClose();
      return;
    }

    const trimmedCode = code.trim().toLowerCase();
    
    // Attempt to match the decoded text with a product's barcode_qr or SKU
    let matchedProduct = products.find(p => 
      (p.barcode_qr && p.barcode_qr.trim().toLowerCase() === trimmedCode) ||
      (p.sku && p.sku.trim().toLowerCase() === trimmedCode)
    );

    if (!matchedProduct) {
      // Try fetching from the database using search
      try {
        const dbProducts = await dbService.getProducts();
        // Find exact match in case the search returns partial matches
        matchedProduct = dbProducts.find(p => 
          (p.barcode_qr && p.barcode_qr.trim().toLowerCase() === trimmedCode) ||
          (p.sku && p.sku.trim().toLowerCase() === trimmedCode)
        );
      } catch (err) {
        console.error("Error fetching product by code:", err);
      }
    }

    setIsSearching(false);

    if (matchedProduct && onProductFound) {
      // Play a nice beep sound if browser allows
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
      } catch (e) {}

      // Trigger callback
      onProductFound(matchedProduct);
      onClose();
    } else {
      setError(`Código detectado: "${code}" pero ningún producto en el catálogo coincide con este código o SKU.`);
    }
  };

  const toggleCamera = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop()
        .then(() => {
          setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
        })
        .catch(err => {
          console.error("Failed to stop scanner for toggle:", err);
          setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
        });
    } else {
      setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm select-none overflow-y-auto">
      <div 
        className="bg-[#131921] text-white border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        id="barcode-scanner-modal"
      >
        {/* Header */}
        <div className="p-4 bg-[#1a232e] border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#FF9900]" />
            <h3 className="font-bold text-xs uppercase tracking-widest text-[#FF9900]">Consultar Precio por Cámara</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
            title="Cerrar Escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 flex flex-col overflow-y-auto space-y-4">
          <p className="text-[11px] text-gray-300 text-center leading-normal max-w-sm mx-auto">
            Apunta la cámara de tu celular al <strong>código de barras</strong> o <strong>código QR</strong> impreso en el producto para consultar su precio actual en tiempo real.
          </p>

          {/* Scanner Container */}
          <div className="relative w-full aspect-video sm:aspect-square max-w-sm mx-auto bg-black rounded-xl overflow-hidden border-2 border-gray-800 flex flex-col justify-center items-center">
            {/* The html5-qrcode target div */}
            <div id={scannerId} className="w-full h-full object-cover"></div>

            {/* Custom Scanning Target Overlay Frame */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Simulated laser line */}
                <div className="w-4/5 h-[2px] bg-red-500 absolute top-1/2 left-[10%] shadow-[0_0_10px_#ef4444] animate-pulse"></div>
                
                {/* Border corners styling */}
                <div className="absolute w-[80%] h-[60%] border-2 border-dashed border-[#FF9900]/30 rounded"></div>
              </div>
            )}

            {/* Searching DB Loading State */}
            {isSearching && (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-gray-950/80 backdrop-blur-sm p-4 text-center z-10">
                <RefreshCw className="w-8 h-8 text-[#FF9900] animate-spin" />
                <span className="text-xs text-gray-400 font-bold">Buscando producto...</span>
              </div>
            )}

            {/* If camera is not active yet */}
            {!isScanning && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-gray-950 p-4 text-center">
                <RefreshCw className="w-8 h-8 text-[#FF9900] animate-spin" />
                <span className="text-xs text-gray-400 font-bold">Encendiendo cámara...</span>
              </div>
            )}

            {/* If camera permission is denied or general failure */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-950/90 space-y-3 z-10">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <p className="text-xs text-rose-200 font-medium leading-relaxed">{error}</p>
                <button 
                  onClick={() => setFacingMode(prev => prev)} // trigger re-mount
                  className="px-4 py-2 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer transition"
                >
                  Reintentar Cámara
                </button>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 shrink-0 w-full max-w-sm mx-auto">
            <div className="flex-1 w-full relative flex items-center">
              <input
                type="text"
                placeholder="O ingresa el código manual..."
                className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-xl pl-3 pr-10 py-2.5 focus:outline-none focus:border-[#FF9900]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDecodedCode(e.currentTarget.value);
                  }
                }}
                id="manual-barcode-input"
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('manual-barcode-input') as HTMLInputElement;
                  if (input && input.value) {
                    handleDecodedCode(input.value);
                  }
                }}
                className="absolute right-2 p-1.5 text-gray-400 hover:text-[#FF9900] transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={toggleCamera}
              className="w-full sm:w-auto px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition flex items-center justify-center gap-2 border border-gray-700 whitespace-nowrap"
              title="Cambiar Cámara Trasera / Frontal"
            >
              <RefreshCw className="w-4 h-4 text-[#FF9900]" />
              <span>Girar</span>
            </button>
          </div>

          {/* Demonstration Codes Section for Preview Testing */}
          <div className="pt-4 border-t border-gray-800/80">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-[#FF9900]" />
              <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-300">¿No tienes un código físico? Pruébalo aquí:</h4>
            </div>
            
            {productsWithCode.length === 0 ? (
              <p className="text-[10px] text-gray-500 italic bg-gray-950/40 p-2.5 rounded-lg border border-gray-900 leading-normal text-left">
                No hay productos cargados en el sistema con código de barras o QR registrado. Para probar, edita o agrega un producto en el Panel Admin y asígnale un valor en el campo "Código de barras o QR" (ejemplo: "12345" o "QR-PROMO").
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                <p className="text-[10px] text-gray-400 mb-2 leading-relaxed text-left">
                  Haz clic en cualquiera de estos códigos de demostración para simular la lectura instantánea de la cámara y abrir el producto correspondiente:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {productsWithCode.map(product => (
                    <button
                      key={product.id}
                      onClick={() => handleDecodedCode(product.barcode_qr || '')}
                      className="text-left bg-gray-900 hover:bg-[#1a232e] border border-gray-800 hover:border-[#FF9900]/50 p-2 rounded-xl transition duration-150 cursor-pointer focus:outline-none flex flex-col justify-between"
                    >
                      <span className="text-[11px] font-black text-[#FFF5EA] truncate max-w-full block" title={product.name}>
                        {product.name}
                      </span>
                      <div className="flex items-center justify-between gap-1.5 mt-1">
                        <span className="text-[9px] font-mono text-amber-500 font-bold tracking-wider">
                          Cod: {product.barcode_qr}
                        </span>
                        <span className="text-[10px] font-black text-emerald-400 shrink-0">
                          ${product.offer_price || product.price}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
