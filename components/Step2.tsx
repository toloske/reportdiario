
import React from 'react';
import { FormData, VehicleStatus } from '../types';
import { JUSTIFICATION_OPTIONS } from '../constants';

interface Step2Props {
  data: FormData;
  updateData: (updates: Partial<FormData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSaving: boolean;
}

const Step2: React.FC<Step2Props> = ({ data, updateData, onBack, onSubmit, isSaving }) => {
  const handleSubmit = () => {
    const missingJustification = data.vehicleStatuses.find(v => !v.ranToday && !v.justification);
    if (missingJustification) {
      alert(`Por favor, selecione uma justificativa para o veículo ${missingJustification.plate}.`);
      return;
    }
    onSubmit();
  };
  const updateVehicle = (plate: string, updates: Partial<VehicleStatus>) => {
    const newStatuses = data.vehicleStatuses.map(v =>
      v.plate === plate ? { ...v, ...updates } : v
    );
    updateData({ vehicleStatuses: newStatuses });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    updateData({ attachment: file });
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">

      {/* Veículos Section - Only show if vehicles exist */}
      {data.vehicleStatuses.length > 0 ? (
        <section className="px-4 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">local_shipping</span>
            <h2 className="text-xl font-bold text-primary dark:text-slate-100">Status da Frota (Placa a Placa)</h2>
          </div>

          {/* Group vehicles by modal */}
          {(() => {
            const grouped = data.vehicleStatuses.reduce((acc, vehicle) => {
              const modal = vehicle.modal || 'Sem Modal Declarado';
              if (!acc[modal]) acc[modal] = [];
              acc[modal].push(vehicle);
              return acc;
            }, {} as Record<string, VehicleStatus[]>);

            const groupedElements = Object.entries(grouped).map(([modalName, vehiclesList]) => {
              const vehicles = vehiclesList as VehicleStatus[];
              return (
                <div key={modalName} className="mb-6 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 mb-3 ml-2 w-fit">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 tracking-wide">{modalName}</h3>
                  </div>

                  {vehicles.map((vehicle) => (
                    <div key={vehicle.plate} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 mb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Veículo</p>
                          <p className="text-lg font-bold text-primary dark:text-white">{vehicle.plate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rodou hoje?</p>
                          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit ml-auto">
                            <button
                              onClick={() => updateVehicle(vehicle.plate, { ranToday: true, justification: undefined, otherJustification: undefined })}
                              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${vehicle.ranToday ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => updateVehicle(vehicle.plate, { ranToday: false })}
                              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${!vehicle.ranToday ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                              Não
                            </button>
                          </div>
                        </div>
                      </div>

                      {!vehicle.ranToday && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-200">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Justificativa</label>
                          <select
                            className="w-full rounded-lg border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-primary focus:border-primary p-2 border"
                            value={vehicle.justification || ''}
                            onChange={(e) => updateVehicle(vehicle.plate, { justification: e.target.value })}
                          >
                            <option value="">Selecione o motivo...</option>
                            {JUSTIFICATION_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>

                          {vehicle.justification === 'Carro reserva' && (
                            <div className="mt-3">
                              <textarea
                                className="w-full rounded-lg border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:ring-primary focus:border-primary p-2 border"
                                placeholder="Descreva o motivo detalhadamente..."
                                rows={2}
                                value={vehicle.otherJustification || ''}
                                onChange={(e) => updateVehicle(vehicle.plate, { otherJustification: e.target.value })}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            });

            return <>{groupedElements}</>;
          })()}
        </section>
      ) : (
        <section className="px-4 pt-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">info</span>
            <div>
              <h3 className="font-bold text-blue-800 dark:text-blue-300 text-sm">Sem veículos vinculados</h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                O SVC selecionado não possui frota fixa cadastrada. Prossiga com o preenchimento da oferta e aceite.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="px-4 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">verified</span>
            <h2 className="text-lg font-bold text-primary dark:text-slate-100">Comprovação de Aceite</h2>
          </div>
          <div className="space-y-3">
            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${data.acceptanceType === 'D-1' ? 'border-primary/40 bg-primary/5' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <input
                className="w-4 h-4 text-primary focus:ring-primary border-slate-300"
                name="acceptance_type"
                type="radio"
                checked={data.acceptanceType === 'D-1'}
                onChange={() => updateData({ acceptanceType: 'D-1' })}
              />
              <div className="ml-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">D-1 (Operação Ontem)</p>
                <p className="text-xs text-slate-500">Validação diária de produtividade</p>
              </div>
            </label>
            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${data.acceptanceType === 'D-7' ? 'border-primary/40 bg-primary/5' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <input
                className="w-4 h-4 text-primary focus:ring-primary border-slate-300"
                name="acceptance_type"
                type="radio"
                checked={data.acceptanceType === 'D-7'}
                onChange={() => updateData({ acceptanceType: 'D-7' })}
              />
              <div className="ml-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">D-7 (Semanal)</p>
                <p className="text-xs text-slate-500">Fechamento consolidado da semana</p>
              </div>
            </label>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Print do Aceite</p>
            <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-800/50 hover:border-primary/50 transition-colors cursor-pointer group">
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
              <span className="material-symbols-outlined text-4xl text-slate-400 mb-2 group-hover:text-primary transition-colors">cloud_upload</span>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Toque para anexar imagem</p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG ou PDF (Máx. 5MB)</p>
            </label>

            {data.attachment && (
              <div className="mt-4 flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-400">description</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-medium truncate text-slate-700 dark:text-slate-300">{data.attachment.name}</p>
                  <p className="text-[10px] text-slate-500">{(data.attachment.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={() => updateData({ attachment: null })}
                  className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="p-4 h-24"></div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-50">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-2">
          <button
            onClick={onBack}
            className="col-span-1 h-14 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <button
            onClick={handleSubmit}
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

export default Step2;
