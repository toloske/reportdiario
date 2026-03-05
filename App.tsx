
import React, { useState, useCallback, useEffect } from 'react';
import { Step, View, FormData } from './types';
import { INITIAL_CATEGORIES } from './constants';
import Step1 from './components/Step1';
import Step2 from './components/Step2';
import AnalysisSummary from './components/AnalysisSummary';
import AdminDashboard from './components/AdminDashboard';
import Navbar from './components/Navbar';
import { saveReport } from './services/storageService';
import { dataService, SVC } from './services/dataService';

const App: React.FC = () => {
  const [view, setView] = useState<View>(View.FORM);
  const [step, setStep] = useState<Step>(Step.OFFER_CAPACITY);
  const [isSaving, setIsSaving] = useState(false);

  const [svcOptions, setSvcOptions] = useState<SVC[]>([]);
  const [loadingSvcs, setLoadingSvcs] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    svc: '',
    categories: INITIAL_CATEGORIES,
    vehicleStatuses: [],
    acceptanceType: 'D-1',
    attachment: null,
  });

  // Fetch SVCs on mount
  useEffect(() => {
    const loadSVCs = async () => {
      try {
        const svcs = await dataService.fetchSVCs();
        setSvcOptions(svcs);
      } catch (error) {
        console.error("Failed to load SVCs", error);
      } finally {
        setLoadingSvcs(false);
      }
    };
    loadSVCs();
  }, []);

  // Fetch Vehicles when SVC changes
  useEffect(() => {
    const loadVehicles = async () => {
      if (!formData.svc) {
        setFormData(prev => ({ ...prev, vehicleStatuses: [] }));
        return;
      }

      try {
        const vehicles = await dataService.fetchVehiclesBySVC(formData.svc);
        setFormData(prev => ({
          ...prev,
          vehicleStatuses: vehicles.map(v => ({
            plate: v.plate,
            ranToday: true, // Default to true
            justification: '',
            otherJustification: '',
            modal: v.modal,
            operation: v.operation
          }))
        }));
      } catch (error) {
        console.error("Failed to load vehicles", error);
      }
    };

    loadVehicles();
  }, [formData.svc]);

  const updateFormData = useCallback((updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await saveReport(formData);
      setView(View.SUCCESS);
    } catch (error: any) {
      console.error("Storage failed:", error);
      alert(`Erro ao salvar dados: ${error.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      svc: '',
      categories: INITIAL_CATEGORIES,
      vehicleStatuses: [],
      acceptanceType: 'D-1',
      attachment: null,
    });
    setStep(Step.OFFER_CAPACITY);
    setView(View.FORM);
  };

  const getTitle = () => {
    if (view === View.ADMIN) return "Painel Administrativo";
    if (view === View.SUCCESS) return "Envio Concluído";
    return step === Step.OFFER_CAPACITY ? "Oferta e Capacidade" : "Checklist e Aceite";
  };

  if (loadingSvcs) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-display max-w-md mx-auto shadow-2xl shadow-blue-900/10 relative overflow-hidden border-x border-slate-200">
      {/* Header / Navbar */}
      <Navbar
        view={view}
        step={step}
        onBack={() => setStep(Step.OFFER_CAPACITY)}
        onAdminClick={() => setView(View.ADMIN)}
        title={getTitle()}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-12">
        {view === View.ADMIN && (
          <AdminDashboard onBack={() => setView(View.FORM)} />
        )}

        {view === View.FORM && step === Step.OFFER_CAPACITY && (
          <Step1
            data={formData}
            updateData={updateFormData}
            onNext={() => setStep(Step.CHECKLIST_ACCEPTANCE)}
            svcOptions={svcOptions}
          />
        )}

        {view === View.FORM && step === Step.CHECKLIST_ACCEPTANCE && (
          <Step2
            data={formData}
            updateData={updateFormData}
            onBack={() => setStep(Step.OFFER_CAPACITY)}
            onSubmit={handleFinish}
            isSaving={isSaving}
          />
        )}

        {view === View.SUCCESS && (
          <AnalysisSummary onReset={handleReset} />
        )}
      </main>
    </div>
  );
};

export default App;
