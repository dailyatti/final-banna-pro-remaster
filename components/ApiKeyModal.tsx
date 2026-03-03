import React, { useState } from 'react';
import { Button } from './Button';
import { validateApiKey } from '../services/gemini';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  canClose: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, canClose }) => {
  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputKey.length < 30 || !inputKey.startsWith('AI')) {
      setError('Invalid API Key format. It should start with "AI".');
      return;
    }

    setIsValidating(true);
    setError('');

    const isValid = await validateApiKey(inputKey);

    setIsValidating(false);

    if (isValid) {
      onSave(inputKey);
      onClose();
    } else {
      setError('Invalid API Key. Please check and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
        {/* Decorator */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-banana-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Connect API Key</h2>
              <p className="text-sm text-slate-400 mt-1">Required to access Gemini models.</p>
            </div>
            {canClose && (
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-banana-500 uppercase tracking-wider mb-2">Google API Key</label>
              <input
                type="password"
                autoFocus
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setError('');
                }}
                placeholder="AIzaSy..."
                disabled={isValidating}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-banana-500/50 focus:border-banana-500/50 transition-all disabled:opacity-50"
              />
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 text-xs text-slate-400 leading-relaxed border border-slate-800">
              <p>
                <strong>Privacy Note:</strong> Your key is stored locally in your browser and sent directly to Google. It never touches our servers.
              </p>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="block mt-2 text-banana-400 hover:underline">
                Get a free key here &rarr;
              </a>
            </div>

            <div className="flex gap-3 pt-2">
              {canClose && (
                <Button type="button" variant="ghost" onClick={onClose} className="flex-1" disabled={isValidating}>Cancel</Button>
              )}
              <Button type="submit" variant="primary" className="flex-1" isLoading={isValidating}>
                {isValidating ? 'Validating...' : 'Save Key'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};