
import React from 'react';
import { FormData } from '../types';
import { SVC } from '../services/dataService';

interface Step1Props {
  data: FormData;
  updateData: (updates: Partial<FormData>) => void;
  onNext: () => void;
  svcOptions: SVC[];
}

const Step1: React.FC<Step1Props> = ({ data, updateData, onNext, svcOptions }) => {
  const handleCategoryChange = (id: string, field: 'offer' | 'capacity', value: string) => {
    const numValue = value === '' ? null : parseInt(value);
    const newCategories = data.categories.map(c =>
      c.id === id ? { ...c, [field]: numValue } : c
    );
    updateData({ categories: newCategories });
  };

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Section 1: Dados da Operação */}
      <section className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-xl">settings_applications</span>
          <h2 className="text-lg font-bold text-primary dark:text-slate-100">Dados da Operação</h2>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/50 p-3 rounded-lg flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5 shrink-0">info</span>
            <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300/90 leading-relaxed">
              <strong>Importante:</strong> A data do reporte deve ser exatamente o <strong>dia em que a operação aconteceu</strong>.
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Data</span>
            <div className="relative">
              <input
                className="w-full h-12 px-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                type="date"
                value={data.date}
                max={getLocalDateString()}
                onChange={(e) => updateData({ date: e.target.value })}
              />
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">calendar_month</span>
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">SVC Selector</span>
            <select
              className="custom-select w-full h-12 px-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
              value={data.svc}
              onChange={(e) => updateData({ svc: e.target.value })}
              disabled={svcOptions.length === 0}
            >
              <option value="">{svcOptions.length === 0 ? 'Carregando SVCs...' : 'Selecione o SVC'}</option>
              {svcOptions.map(svc => (
                <option key={svc.id} value={svc.id}>
                  {svc.name} - {svc.city}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Section 2: Fleet Offer & Capacity */}
      <section className="p-4 pt-2">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-xl">local_shipping</span>
          <h2 className="text-lg font-bold text-primary dark:text-slate-100">Oferta & Capacidade da Frota</h2>
        </div>
        <div className="mb-4 bg-red-50 dark:bg-rose-950/30 border border-red-200 dark:border-rose-900/50 p-3 rounded-lg flex items-start gap-2.5 shadow-sm">
          <span className="material-symbols-outlined text-red-600 dark:text-red-500 text-[18px] mt-0.5 shrink-0">warning</span>
          <p className="text-[13px] font-medium text-red-800 dark:text-rose-300 leading-relaxed uppercase">
            <strong>Atenção:</strong> Insira aqui <strong>apenas carros SPOT</strong> e frota transmaná. Carros de <strong>frota fixa NÃO devem</strong> ser colocados aqui!
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {data.categories.map((category) => (
            <div key={category.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-3 text-sm">{category.name}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Oferta</span>
                  <input
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    inputMode="numeric"
                    placeholder="0"
                    min="0"
                    type="number"
                    value={category.offer ?? ''}
                    onChange={(e) => handleCategoryChange(category.id, 'offer', e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Capacidade</span>
                  <input
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    inputMode="numeric"
                    placeholder="0"
                    min="0"
                    type="number"
                    value={category.capacity ?? ''}
                    onChange={(e) => handleCategoryChange(category.id, 'capacity', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="p-4 h-24"></div> {/* Bottom spacing for footer */}

      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={onNext}
            disabled={!data.svc || data.categories.some(c => c.offer === null || c.capacity === null)}
            className="w-full h-14 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
          >
            <span>Próximo: Checklist de Frota</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Step1;
