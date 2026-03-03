import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 mt-12 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12">
          
          {/* Brand & Credits */}
          <div className="md:w-1/3">
            <div className="flex items-center gap-2 mb-4">
               <div className="w-8 h-8 rounded-full bg-gradient-to-br from-banana-400 to-banana-600 flex items-center justify-center text-slate-900 font-bold text-sm">
                N
              </div>
              <span className="text-white font-bold tracking-tight">Nano Banana Studio</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Professional-grade AI image processor powered by Google's Gemini 3 Pro Vision technology. 
              Designed for high-throughput batch editing and format conversion.
            </p>
            <div className="text-xs text-slate-600">
              &copy; {new Date().getFullYear()} Nano Banana Inc. All rights reserved.
            </div>
          </div>

          {/* User Guide */}
          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              <h3 className="text-white font-bold mb-4 uppercase text-xs tracking-wider">Quick Start Guide</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-banana-500 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>Set your API Key via the "Get Credits" button.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-banana-500 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span>Drag & Drop images or click to upload.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-banana-500 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>Select aspect ratio and format (JPG/PNG).</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-banana-500 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                  <span>Click "Process All" and wait for magic.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4 uppercase text-xs tracking-wider">About API Keys</h3>
              <p className="text-sm text-slate-400 mb-4">
                To ensure privacy and unlimited control, this app uses your own Google Cloud credentials.
              </p>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-banana-500 hover:text-banana-400 transition-colors"
              >
                Get or Buy Credits at Google AI Studio
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};