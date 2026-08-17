import React, { useState } from 'react';
import { SVC } from '../services/dataService';
import { supabase } from '../services/supabaseClient';

interface LoginProps {
  svcOptions: SVC[];
  onLoginSuccess: (svc: SVC) => void;
}

const Login: React.FC<LoginProps> = ({ svcOptions, onLoginSuccess }) => {
  const [selectedSvcId, setSelectedSvcId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSvcId) {
      setErrorMsg('Selecione uma base.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Informe a senha.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const selectedSvc = svcOptions.find(s => s.id === selectedSvcId);
      if (!selectedSvc) throw new Error('Base inválida.');

      // Default Password pattern (e.g. ssp8@123)
      const defaultPassword = `${selectedSvcId.toLowerCase()}@123`;
      let isValid = false;

      // Try fetching custom password from supabase if available
      try {
        const { data, error } = await supabase
          .from('svc_passwords')
          .select('password')
          .eq('svc_id', selectedSvcId)
          .maybeSingle();

        if (!error && data && data.password) {
          isValid = password === data.password;
        } else {
          // Fallback to default password pattern
          isValid = password === defaultPassword;
        }
      } catch {
        // Safe fallback if table doesn't exist
        isValid = password === defaultPassword;
      }

      if (isValid) {
        // Save session in localStorage
        localStorage.setItem('svc_login', JSON.stringify(selectedSvc));
        onLoginSuccess(selectedSvc);
      } else {
        setErrorMsg('Senha incorreta para a base selecionada.');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
            <span className="material-symbols-outlined text-3xl">lock_open</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Portal do Dispatcher</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acesse utilizando a conta da sua base operacional
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">
              Selecione sua Base
            </span>
            <select
              className="custom-select w-full h-12 px-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white"
              value={selectedSvcId}
              onChange={(e) => setSelectedSvcId(e.target.value)}
              disabled={loading || svcOptions.length === 0}
            >
              <option value="">{svcOptions.length === 0 ? 'Carregando bases...' : 'Selecione sua base'}</option>
              {svcOptions.map(svc => (
                <option key={svc.id} value={svc.id}>
                  {svc.name} - {svc.city}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">
              Senha da Base
            </span>
            <input
              type="password"
              className="w-full h-12 px-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all dark:text-white"
              placeholder="Digite a senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/50 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-sm shrink-0">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary hover:bg-primary/95 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Entrar</span>
                <span className="material-symbols-outlined text-sm">login</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
