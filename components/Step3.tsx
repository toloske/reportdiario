import React, { useState } from 'react';
import { FormData, LostDriver } from '../types';
import { INITIAL_CATEGORIES } from '../constants';

interface Step3Props {
  data: FormData;
  updateData: (updates: Partial<FormData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSaving: boolean;
}

const Step3: React.FC<Step3Props> = ({ data, updateData, onBack, onSubmit, isSaving }) => {
  // Toggle for whether they lost any driver
  const [lostAny, setLostAny] = useState<boolean>(() => {
    return (data.lostDrivers && data.lostDrivers.length > 0) || false;
  });

  // Local form state
  const [name, setName] = useState('');
  const [modal, setModal] = useState('');
  const [fleetType, setFleetType] = useState<'SPOT' | 'FROTA FIXA' | 'FROTA PRÓPRIA'>('SPOT');
  const [plate, setPlate] = useState('');
  const [reason, setReason] = useState('');

  // Filter plates of this SVC based on the selected fleet type
  const availablePlates = data.vehicleStatuses.filter(v => {
    const vFleetType = (v.fleetType || '').toUpperCase().trim();
    const selectedFleetType = fleetType.toUpperCase().trim();
    return vFleetType === selectedFleetType;
  });

  // Helper to normalize database vehicle modals to INITIAL_CATEGORIES name
  const getNormalizedModal = (rawModal: string): string => {
    if (!rawModal) return '';
    const m = rawModal.toUpperCase().trim();
    if (m.includes('BULK') && m.includes('VUC')) return 'BULK - VUC EQUIPE ÚNICA POOL';
    if (m.includes('BULK') && m.includes('VAN')) return 'BULK - VAN EQUIPE ÚNICA POOL';
    if (m.includes('VUC')) return 'VUC';
    if (m.includes('VAN')) return 'VAN';
    if (m.includes('UTILIT') || m.includes('UTI')) return 'UTILITÁRIOS';
    if (m.includes('PASSEIO')) return 'VEÍCULO DE PASSEIO';
    return '';
  };

  const handlePlateChange = (plateValue: string) => {
    setPlate(plateValue);
    const selectedVehicle = data.vehicleStatuses.find(v => v.plate === plateValue);
    if (selectedVehicle && selectedVehicle.modal) {
      const norm = getNormalizedModal(selectedVehicle.modal);
      if (norm) {
        setModal(norm);
      }
    }
  };

  const handleAddDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor, informe o nome.');
      return;
    }
    if (!modal) {
      alert('Por favor, selecione o modal.');
      return;
    }
    if (!plate.trim()) {
      alert(fleetType === 'SPOT' ? 'Por favor, informe a placa do veículo.' : 'Por favor, selecione a placa do veículo.');
      return;
    }
    if (!reason.trim()) {
      alert('Por favor, informe o motivo.');
      return;
    }

    const newDriver: LostDriver = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: name.trim(),
      modal,
      fleetType,
      plate: plate.trim().toUpperCase() || undefined,
      reason: reason.trim()
    };

    updateData({
      lostDrivers: [...(data.lostDrivers || []), newDriver]
    });

    // Reset local fields
    setName('');
    setModal('');
    setPlate('');
    setReason('');
  };

  const handleRemoveDriver = (id: string) => {
    const filtered = (data.lostDrivers || []).filter(d => d.id !== id);
    updateData({ lostDrivers: filtered });
  };

  const handleFinishSubmit = () => {
    if (lostAny && (!data.lostDrivers || data.lostDrivers.length === 0)) {
      alert('Você selecionou que perdeu motorista. Por favor, adicione pelo menos um motorista à lista ou altere a opção para "Não".');
      return;
    }

    // If they switched to "Não", make sure list is empty
    if (!lostAny && data.lostDrivers && data.lostDrivers.length > 0) {
      updateData({ lostDrivers: [] });
    }

    onSubmit();
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      
      {/* Header Info */}
      <section className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-xl">person_remove</span>
          <h2 className="text-lg font-bold text-primary dark:text-slate-100">Controle de Perda de Motoristas</h2>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Base pré-selecionada: <strong className="text-primary dark:text-blue-400">{data.svc}</strong>
          </p>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Alguma perda de motorista?
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-full">
              <button
                type="button"
                onClick={() => {
                  setLostAny(true);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${lostAny ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                Sim
              </button>
              <button
                type="button"
                onClick={() => {
                  setLostAny(false);
                  updateData({ lostDrivers: [] });
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${!lostAny ? 'bg-slate-400 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                Não (Nenhuma Perda)
              </button>
            </div>
          </div>
        </div>
      </section>

      {lostAny && (
        <>
          {/* Add form */}
          <section className="p-4 pt-0">
            <form onSubmit={handleAddDriver} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                Adicionar Motorista Perdido
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Tipo de Frota */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tipo de Frota</label>
                  <select
                    className="custom-select w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    value={fleetType}
                    onChange={(e) => {
                      const nextType = e.target.value as any;
                      setFleetType(nextType);
                      setPlate('');
                      if (nextType === 'SPOT') {
                        setModal('');
                      }
                    }}
                  >
                    <option value="SPOT">Spot</option>
                    <option value="FROTA FIXA">Frota Fixa</option>
                    <option value="FROTA PRÓPRIA">Frota Própria Transmana</option>
                  </select>
                </div>

                {/* 2. Placa Perdida (If Frota) OR Modal Selection (If Spot) */}
                {(fleetType === 'FROTA FIXA' || fleetType === 'FROTA PRÓPRIA') ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Placa Perdida</label>
                    <select
                      className="custom-select w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={plate}
                      onChange={(e) => handlePlateChange(e.target.value)}
                    >
                      <option value="">Selecione a placa...</option>
                      {availablePlates.map(v => (
                        <option key={v.plate} value={v.plate}>
                          {v.plate}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Modal</label>
                    <select
                      className="custom-select w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={modal}
                      onChange={(e) => setModal(e.target.value)}
                    >
                      <option value="">Selecione o modal...</option>
                      {INITIAL_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 3. Placa Input (If Spot) OR Modal Selection (If Frota) */}
                {fleetType === 'SPOT' ? (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Placa do Veículo (SPOT)</label>
                    <input
                      type="text"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white uppercase"
                      placeholder="Ex: ABC1D23 ou ABC1234"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Modal (Preenchido Automático)</label>
                    <select
                      className="custom-select w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={modal}
                      onChange={(e) => setModal(e.target.value)}
                    >
                      <option value="">Selecione o modal...</option>
                      {INITIAL_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 4. Nome do Motorista */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nome do Motorista</label>
                  <input
                    type="text"
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white"
                    placeholder="Nome do motorista"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* 5. Motivo da Perda */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Motivo da Perda</label>
                  <textarea
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none dark:text-white"
                    placeholder="Descreva o motivo da perda do motorista..."
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 mt-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>Adicionar à Lista</span>
              </button>
            </form>
          </section>

          {/* List of added drivers */}
          <section className="p-4 pt-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Motoristas Adicionados
              </h3>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                {data.lostDrivers ? data.lostDrivers.length : 0}
              </span>
            </div>

            {(!data.lostDrivers || data.lostDrivers.length === 0) ? (
              <div className="text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-1">group_off</span>
                <p className="text-xs text-slate-400">Nenhum motorista adicionado ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.lostDrivers.map(d => (
                  <div key={d.id} className="bg-white dark:bg-slate-900 p-3.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-start gap-3 relative overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">
                        person
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 pr-8">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{d.name}</h4>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase mt-0.5">
                        {d.modal}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        <strong className="text-slate-700 dark:text-slate-300">Frota:</strong> {d.fleetType} {d.plate && `(${d.plate})`}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 bg-slate-50 dark:bg-slate-800 p-2 rounded italic">
                        "{d.reason}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDriver(d.id)}
                      className="absolute top-3 right-3 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                      title="Remover"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Spacing for fixed footer */}
      <div className="p-4 h-24"></div>

      {/* Footer Nav & Submit */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-50">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={onBack}
            className="col-span-1 h-14 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <button
            type="button"
            onClick={handleFinishSubmit}
            disabled={isSaving}
            className="col-span-3 h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Salvando Dados...</span>
              </>
            ) : (
              <>
                <span>Finalizar e Salvar</span>
                <span className="material-symbols-outlined text-xl">save</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Step3;
